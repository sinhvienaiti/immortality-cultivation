import { describe, expect, it } from "vitest";
import type { MatchWord } from "../../src/app/learning";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { THU_HACH } from "../../src/content/rules";
import type { World } from "../../src/content/types";
import { harvestView, starsFor, starText, wavesHeld } from "../../src/ui/results";

/** canon §4.1, §14.1, §17 (Codex §17.1): Thu Hoạch keeps learning and RPG lines apart. */

function endWorld(over: Record<string, unknown> = {}): World {
  return {
    stage: THANH_THACH_AI,
    tick: 30_000,
    formation: { heart: 712, heartMax: 1000 },
    waves: { endedThrough: 6 },
    economy: { wallets: [{ linhSa: 230, thuHach: 9 }] },
    stats: { kills: 451, words: 128, grades: [20, 61, 18, 22, 7] },
    ...over,
  } as unknown as World;
}

const word = (wordId: string, over: Partial<MatchWord> = {}): MatchWord => ({ wordId, text: wordId, isNew: false, wasDue: false, wave: 1, count: 1, sloppy: false, hintUsed: false, errors: 0, ...over });

describe("Thu Hoạch", () => {
  it("gives stars by Trận Lực left: ≥ 70 % ★★★, ≥ 40 % ★★, else ★", () => {
    expect(starsFor(700, 1000)).toBe(3);
    expect(starsFor(699, 1000)).toBe(2);
    expect(starsFor(400, 1000)).toBe(2);
    expect(starsFor(399, 1000)).toBe(1);
    expect(starText(2)).toBe("★★☆");
  });

  it("puts the RPG results and the learning results on separate lines", () => {
    const view = harvestView(endWorld(), 0, "victory", 3, { words: [word("lantern", { isNew: true }), word("stone", { errors: 1 }), word("moon")], book: [] });
    expect(view.title).toContain("Giữ được ải");
    expect(view.stars).toBe(3);
    expect(view.rpg.map((line) => line.label)).toEqual(["Trận Lực còn", "Đợt giữ được", "Thú đã hạ", "Thú Hạch", "Linh Sa còn"]);
    expect(view.rpg.map((line) => line.value)).toEqual(["71 %", "6 / 6", "451", "9", "230"]);
    expect(view.learning.map((line) => line.label)).toEqual(["Từ đã gõ", "Chớp", "Hoàn hảo", "Tốt", "Vừa", "Ẩu", "Từ mới đã gặp", "Từ gõ sai"]);
    expect(view.learning.map((line) => line.value)).toEqual(["128", "20", "61", "18", "22", "7", "1", "1"]);
    // No line is in both lists.
    const learning = new Set(view.learning.map((line) => line.label));
    expect(view.rpg.some((line) => learning.has(line.label))).toBe(false);
  });

  it("keeps half the Thú Hạch on a loss or a retreat, no stars; learning is never lost", () => {
    for (const outcome of ["defeat", "retreat"] as const) {
      const view = harvestView(endWorld({ formation: { heart: 0, heartMax: 1000 }, waves: { endedThrough: 3 } }), 0, outcome, 0, null);
      expect(view.stars).toBe(0);
      expect(view.rpg[3]).toEqual({ label: "Thú Hạch (giữ " + THU_HACH.defeatKeepPct + " %)", value: "4" });
      expect(view.rpg[1]!.value).toBe("3 / 6");
      expect(view.learning[0]).toEqual({ label: "Từ đã gõ", value: "128" });
    }
    expect(wavesHeld(endWorld({ waves: { endedThrough: 0 } }))).toBe(0);
  });
});
