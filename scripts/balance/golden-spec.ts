// Source: games/dragon-hold/scripts/balance/golden-spec.ts @06cd4e6 (adapted: canon §18.4, §23.2 golden of this game: 20 seeds of Chuẩn at Cân bằng + Thư giãn, Thử thách, director off; both hashWorld and hashLocal every 600 ticks and at the end; the replay header and body kept whole; replayed through the page's match path and Lane 2's runLog)
/**
 * Golden replays (canon §18.4, §23.2, §25; M0A_PLAN §6.7): the same header and
 * the same commands give the same `hashWorld` **and** `hashLocal` every 600
 * ticks and at the end of the match. Each case keeps its whole replay (header
 * with the deck, body, tail) in tests/golden/m0a.json, so a replay checks the
 * rules alone; running the bot again on the stored header checks the bot
 * makes the same body. Cases: the Chuẩn bot (Đứng yên) at Cân bằng × 20
 * seeds, and Chuẩn at Thư giãn, at Thử thách, and at Cân bằng with the pace
 * director off. Rewrite the file only after a deliberate rule change
 * (`pnpm ic:golden:update`) and say why in the changelog.
 * Owner: Lane 7.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { rebuild } from "../../src/app/match";
import type { DeckSource } from "../../src/app/learning";
import type { Preset, ReplayEntry, ReplayHashes, ReplayHeader } from "../../src/content/types";
import { hashLocalHex, hashWorldHex } from "../../src/sim/hash";
import { runLog } from "../../src/sim/world";
import { runBot } from "./bot";
import { botById } from "./bots";

export const GOLDEN_URL = new URL("../../tests/golden/m0a.json", import.meta.url);
export const GOLDEN_PATH = fileURLToPath(GOLDEN_URL);

export interface GoldenCase {
  readonly name: string;
  readonly bot: string;
  readonly preset: Preset;
  readonly seed: number;
}

/** 20 seeds of Chuẩn at Cân bằng + 3 cases (canon §18.4: Thư giãn, Thử thách, director off). */
export const GOLDEN_CASES: readonly GoldenCase[] = [
  ...Array.from({ length: 20 }, (_, k) => ({ name: "standard-balanced-s" + (k + 1), bot: "standard", preset: "balanced" as const, seed: k + 1 })),
  { name: "standard-relax-s1", bot: "standard", preset: "relax", seed: 1 },
  { name: "standard-challenge-s1", bot: "standard", preset: "challenge", seed: 1 },
  { name: "standard-off-balanced-s1", bot: "standard@off", preset: "balanced", seed: 1 },
];

export interface GoldenResult extends GoldenCase {
  readonly result: string;
  readonly header: ReplayHeader;
  readonly body: readonly ReplayEntry[];
  readonly tail: readonly ReplayHashes[];
}

export interface GoldenFile {
  readonly v: 1;
  readonly cases: readonly GoldenResult[];
}

/** No vocabulary needed once a header is given: glosses only shape learning drafts, never commands. */
export const EMPTY_SOURCE: DeckSource = { records: [], gloss: new Map(), dueCount: 0, fallback: false };

/** Runs a case: the bot on `header` (a stored one), or on a fresh header from `source`. */
export function runGoldenCase(spec: GoldenCase, source: DeckSource, header?: ReplayHeader): GoldenResult {
  const run = runBot(botById(spec.bot), { seed: spec.seed, preset: spec.preset, source, keepLog: true, ...(header ? { header } : {}) });
  return { ...spec, result: run.result, header: run.header, body: (run.log ?? []) as ReplayEntry[], tail: run.tail };
}

/** Replays a stored case through the page's match path (local commands made again by its own local layer): its tail. */
export function replayTail(stored: Pick<GoldenResult, "header" | "body" | "tail">): ReplayHashes[] {
  const last = stored.tail[stored.tail.length - 1];
  const runner = rebuild(stored.header, stored.body, last?.tick ?? 0, false);
  return runner.tail.slice();
}

/** Lane 2's runLog up to a tail tick: both hashes there. */
export function officialAt(stored: Pick<GoldenResult, "header" | "body">, tick: number): ReplayHashes {
  const { world, local } = runLog(stored.header, stored.body, tick);
  return { tick, world: hashWorldHex(world), local: hashLocalHex(local) };
}

export function readGolden(): GoldenFile {
  return JSON.parse(readFileSync(GOLDEN_URL, "utf8")) as GoldenFile;
}

/** One case per block, one body entry per line (diffs stay readable). */
export function goldenText(file: GoldenFile): string {
  const cases = file.cases.map((item) =>
    [
      "  {",
      '   "name": ' + JSON.stringify(item.name) + ",",
      '   "bot": ' + JSON.stringify(item.bot) + ",",
      '   "preset": ' + JSON.stringify(item.preset) + ",",
      '   "seed": ' + item.seed + ",",
      '   "result": ' + JSON.stringify(item.result) + ",",
      '   "header": ' + JSON.stringify(item.header) + ",",
      '   "tail": [' + item.tail.map((entry) => JSON.stringify(entry)).join(", ") + "],",
      '   "body": [' + (item.body.length === 0 ? "]" : "\n" + item.body.map((entry) => "    " + JSON.stringify(entry)).join(",\n") + "\n   ]"),
      "  }",
    ].join("\n"),
  );
  return '{\n "v": 1,\n "cases": [\n' + cases.join(",\n") + "\n ]\n}\n";
}
