import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NEW_WORDS } from "../../src/content/rules";
import { createNewWordLedger, msUntilFree, usedInWindow } from "../../src/typing/new-word-ledger";

/** canon §6.4, D39, PB-10: the pure new-word ledger. */
const MIN = 60_000;
const T0 = 1_000_000_000;

describe("new-word ledger", () => {
  it("allows 8 new words in any sliding 20-minute window", () => {
    const ledger = createNewWordLedger({ v: 1, entries: [] });
    expect(ledger.remaining(T0)).toBe(NEW_WORDS.perWindow);
    for (let k = 0; k < 8; k += 1) expect(ledger.take("w" + k, T0 + k * MIN, "slot4")).toBe(true);
    expect(ledger.remaining(T0 + 8 * MIN)).toBe(0);
    // The first word leaves the window exactly 20 minutes after it was met.
    expect(ledger.remaining(T0 + 20 * MIN - 1)).toBe(0);
    expect(ledger.remaining(T0 + 20 * MIN)).toBe(1);
    expect(ledger.remaining(T0 + 27 * MIN + 1)).toBe(8);
  });

  it("counts a word once, on any channel; a repeated take takes nothing", () => {
    const ledger = createNewWordLedger({ v: 1, entries: [] });
    expect(ledger.take("river", T0, "learn-ahead")).toBe(true);
    expect(ledger.take("river", T0 + MIN, "slot4")).toBe(false);
    expect(ledger.take("river", T0 + 2 * MIN, "tinh-tu")).toBe(false);
    expect(ledger.remaining(T0 + 2 * MIN)).toBe(7);
    expect(ledger.snapshot()).toEqual({ v: 1, entries: [{ wordId: "river", firstSeenMs: T0, channel: "learn-ahead" }] });
  });

  it("records a take past the budget but never goes under 0", () => {
    const ledger = createNewWordLedger({ v: 1, entries: Array.from({ length: 8 }, (_, k) => ({ wordId: "w" + k, firstSeenMs: T0, channel: "tinh-tu" as const })) });
    expect(ledger.remaining(T0)).toBe(0);
    expect(ledger.take("extra", T0, "slot4")).toBe(true);
    expect(ledger.remaining(T0)).toBe(0);
    expect(ledger.snapshot().entries).toHaveLength(9);
  });

  it("reads a snapshot defensively: first meeting of each word, valid rows only", () => {
    const ledger = createNewWordLedger({
      v: 1,
      entries: [
        { wordId: "a", firstSeenMs: T0, channel: "slot4" },
        { wordId: "a", firstSeenMs: T0 + MIN, channel: "tinh-tu" },
        { wordId: "", firstSeenMs: T0, channel: "slot4" },
        { wordId: "b", firstSeenMs: Number.NaN, channel: "slot4" },
        { wordId: "c", firstSeenMs: T0, channel: "nope" as never },
      ],
    });
    expect(ledger.snapshot().entries).toEqual([{ wordId: "a", firstSeenMs: T0, channel: "slot4" }]);
    expect(ledger.take("a", T0 + 2 * MIN, "learn-ahead")).toBe(false);
  });

  it("is pure: the caller's clock only, never Date", () => {
    const source = readFileSync(resolve(__dirname, "../../src/typing/new-word-ledger.ts"), "utf8");
    expect(source).not.toMatch(/\bDate\b|performance|localStorage/);
    const ledger = createNewWordLedger({ v: 1, entries: [] });
    expect(() => ledger.remaining(Number.NaN)).toThrow(TypeError);
    expect(() => ledger.take("x", Number.POSITIVE_INFINITY, "slot4")).toThrow(TypeError);
  });

  it("counts a future stamp (a clock moved back) inside the window", () => {
    const ledger = createNewWordLedger({ v: 1, entries: [{ wordId: "late", firstSeenMs: T0 + 5 * MIN, channel: "slot4" }] });
    expect(ledger.remaining(T0)).toBe(7);
  });

  it("tells Tĩnh Thất how long until 6 words are free", () => {
    const snapshot = { v: 1 as const, entries: [0, 1, 2, 3, 4].map((k) => ({ wordId: "w" + k, firstSeenMs: T0 + k * MIN, channel: "slot4" as const })) };
    expect(usedInWindow(snapshot, T0 + 5 * MIN)).toBe(5);
    // 3 left now; 6 need the three oldest gone: the third leaves at T0 + 22 min.
    expect(msUntilFree(snapshot, 6, T0 + 5 * MIN)).toBe(17 * MIN);
    expect(msUntilFree(snapshot, 3, T0 + 5 * MIN)).toBe(0);
    expect(msUntilFree(snapshot, 9, T0)).toBe(Number.POSITIVE_INFINITY);
  });
});
