// Source: games/dragon-hold/tests/golden/golden.test.ts @06cd4e6 (adapted: this game's cases; both hashes; the page's match path and Lane 2's runLog)
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_SOURCE, GOLDEN_CASES, GOLDEN_PATH, officialAt, readGolden, replayTail, runGoldenCase } from "../../scripts/balance/golden-spec";

/**
 * M0a golden (canon §18.4, §23.2, §25; M0A_PLAN §7): the same header and the
 * same commands give the same hashWorld and hashLocal every 600 ticks and at
 * the end. After a deliberate rule or bot change: `pnpm ic:golden:update`,
 * and say why in the changelog.
 */
describe("golden M0a", () => {
  it("has a golden file with every case: 20 seeds of Chuẩn at Cân bằng + Thư giãn, Thử thách, director off", () => {
    expect(existsSync(GOLDEN_PATH), "run pnpm ic:golden:update").toBe(true);
    const file = readGolden();
    expect(file.cases.map((item) => item.name)).toEqual(GOLDEN_CASES.map((item) => item.name));
    expect(file.cases.filter((item) => item.bot === "standard" && item.preset === "balanced" && item.header.pacing)).toHaveLength(20);
    expect(file.cases.some((item) => item.preset === "relax")).toBe(true);
    expect(file.cases.some((item) => item.preset === "challenge")).toBe(true);
    expect(file.cases.some((item) => item.header.pacing === false)).toBe(true);
    // Each tail holds both hashes every 600 ticks and one at the end.
    for (const item of file.cases) {
      const ticks = item.tail.map((entry) => entry.tick);
      expect(ticks.slice(0, -1).every((tick) => tick % 600 === 0)).toBe(true);
      expect(item.tail.every((entry) => /^[0-9a-f]{8}$/.test(entry.world) && /^[0-9a-f]{8}$/.test(entry.local))).toBe(true);
    }
  });

  const file = existsSync(GOLDEN_PATH) ? readGolden() : { v: 1 as const, cases: [] };
  for (const stored of file.cases) {
    it("replays " + stored.name + " to its stored hashWorld and hashLocal (the page's path; Lane 2's runLog at the end)", () => {
      expect(replayTail(stored)).toEqual(stored.tail);
      const last = stored.tail[stored.tail.length - 1]!;
      expect(officialAt(stored, last.tick)).toEqual(last);
    }, 60_000);

    it("runs the bot on " + stored.name + "'s header to the stored body and tail", () => {
      const spec = GOLDEN_CASES.find((item) => item.name === stored.name)!;
      const now = runGoldenCase(spec, EMPTY_SOURCE, stored.header);
      expect(now.body.length).toBe(stored.body.length);
      expect(now.body).toEqual(stored.body);
      expect(now.tail).toEqual(stored.tail);
    }, 60_000);
  }
});
