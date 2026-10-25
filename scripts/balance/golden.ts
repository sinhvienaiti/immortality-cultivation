// Source: games/dragon-hold/scripts/balance/golden-update.ts @06cd4e6 (adapted: this game's cases and file; a fresh header from the vocabulary only for a new file or --fresh)
/**
 * pnpm ic:golden:update (`--update`): rewrites tests/golden/m0a.json after a
 * deliberate rule or bot change. Each case runs again on its stored header
 * (or on a fresh header from the shared vocabulary with --fresh, or when the
 * file or the case is new); prints, per case, whether its tail (hashWorld and
 * hashLocal every 600 ticks and at the end) or its body moved and the first
 * tick that moved. `--check` compares the same way, writes nothing and exits 1
 * when anything differs (tests/golden/golden.test.ts then fails).
 *   tsx scripts/balance/golden.ts --update | --check [--fresh]
 * Owner: Lane 7.
 */
import { existsSync, writeFileSync } from "node:fs";
import { GOLDEN_CASES, GOLDEN_PATH, goldenText, readGolden, runGoldenCase, type GoldenFile, type GoldenResult } from "./golden-spec";
import { botDeckSource } from "./vocab";

const args = process.argv.slice(2);
const check = args.includes("--check");
const update = args.includes("--update");
if (!check && !update) {
  console.error("usage: tsx scripts/balance/golden.ts --update | --check [--fresh]");
  process.exit(2);
}
const before: GoldenFile | null = existsSync(GOLDEN_PATH) ? readGolden() : null;
const fresh = args.includes("--fresh") || before === null;
const source = await botDeckSource();
const cases: GoldenResult[] = [];
const changes: Record<string, unknown>[] = [];
for (const spec of GOLDEN_CASES) {
  const old = before?.cases.find((item) => item.name === spec.name) ?? null;
  const now = runGoldenCase(spec, source, fresh || old === null ? undefined : old.header);
  cases.push(now);
  if (old === null) {
    changes.push({ name: spec.name, change: "mới", end: now.tail[now.tail.length - 1] });
    continue;
  }
  const moved = now.tail.findIndex((entry, k) => JSON.stringify(entry) !== JSON.stringify(old.tail[k]));
  const bodySame = JSON.stringify(now.body) === JSON.stringify(old.body);
  const headerSame = JSON.stringify(now.header) === JSON.stringify(old.header);
  const same = moved < 0 && now.tail.length === old.tail.length && bodySame && headerSame;
  changes.push({
    name: spec.name,
    change: same ? "giữ nguyên" : "đổi",
    ...(same ? {} : { firstMovedAtTick: moved < 0 ? null : now.tail[moved]!.tick, end: old.tail[old.tail.length - 1]?.tick + " → " + now.tail[now.tail.length - 1]?.tick, body: bodySame ? "giữ nguyên" : old.body.length + " → " + now.body.length + " mục", header: headerSame ? "giữ nguyên" : "đổi" }),
  });
}
const same = before !== null && before.cases.length === cases.length && changes.every((item) => item.change === "giữ nguyên");
console.log(JSON.stringify({ same, fresh, cases: changes }, null, 1));
if (check) process.exitCode = same ? 0 : 1;
else if (!same) {
  writeFileSync(GOLDEN_PATH, goldenText({ v: 1, cases }));
  console.log("đã ghi " + GOLDEN_PATH);
}
