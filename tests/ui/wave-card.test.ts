import { describe, expect, it } from "vitest";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { FLOW, PRESETS } from "../../src/content/rules";
import type { World } from "../../src/content/types";
import { ICON_PATHS } from "../../src/ui/skin";
import { cardWave, footerText, marksOf, peakStrip, summarizeBoss, summarizeWave } from "../../src/ui/wave-card";

/** canon §4.1, §13.3, M0A_PLAN §6.6: what the wave card says, gate by gate, with its marks. */

const stage = THANH_THACH_AI;

describe("wave card summary", () => {
  it("counts every head of a wave by gate and family, in A, B, sky order", () => {
    for (let n = 1; n <= stage.waves.length; n += 1) {
      const summary = summarizeWave(stage, n)!;
      const heads = stage.waves[n - 1]!.groups.reduce((sum, group) => sum + group.count, 0);
      expect(summary.total, "wave " + n).toBe(heads);
      expect(summary.gates.map((gate) => gate.gate)).toEqual(stage.waves[n - 1]!.gates.slice().sort((a, b) => ["A", "B", "sky"].indexOf(a) - ["A", "B", "sky"].indexOf(b)));
      for (const gate of summary.gates) expect(gate.count).toBe(gate.foes.reduce((sum, foe) => sum + foe.count, 0));
    }
    // canon §13.3: wave 1 is 4 clusters of 7 + 14 Phong Lang + 3 Nham Viên at gate A.
    const first = summarizeWave(stage, 1)!;
    expect(first.total).toBe(45);
    expect(first.gates.map((gate) => gate.gate)).toEqual(["A"]);
    expect(summarizeWave(stage, stage.waves.length + 1)).toBeNull();
  });

  it("marks wing = flyer, hammer = node capture, crown = general, horn = boss (canon §13.3)", () => {
    expect(marksOf({ flying: true, capturesNodes: false, tier: "small" })).toEqual(["wing"]);
    expect(marksOf({ flying: false, capturesNodes: true, tier: "medium" })).toEqual(["hammer"]);
    expect(marksOf({ flying: false, capturesNodes: false, tier: "general" })).toEqual(["crown"]);
    expect(marksOf({ flying: false, capturesNodes: false, tier: "boss" })).toEqual(["horn"]);
    expect(summarizeWave(stage, 1)!.marks).toEqual([]);
    expect(summarizeWave(stage, 2)!.marks).toEqual(["hammer"]);
    const third = summarizeWave(stage, 3)!;
    expect(third.marks).toEqual(["wing", "hammer"]);
    expect(third.gates.find((gate) => gate.gate === "sky")!.foes.map((foe) => foe.species)).toEqual(["hoa-nha"]);
    expect(third.gates.some((gate) => gate.foes.some((foe) => foe.elite))).toBe(true);
    expect(summarizeWave(stage, 4)!.marks).toContain("crown");
    expect(summarizeWave(stage, 6)!.marks).toContain("crown");
    const boss = summarizeBoss(stage)!;
    expect(boss.n).toBe(0);
    expect(boss.marks).toEqual(["horn"]);
    expect(boss.gates).toHaveLength(1);
    expect(boss.gates[0]!.gate).toBe("A");
    // Every family and mark has a silhouette (shape before colour, canon §24).
    for (const gate of summarizeWave(stage, 6)!.gates) for (const foe of gate.foes) expect(ICON_PATHS[foe.gait]).toBeTruthy();
    for (const mark of ["wing", "hammer", "crown", "horn"] as const) expect(ICON_PATHS[mark]).toBeTruthy();
  });

  it("draws the peaks and each group's start on a 0–1 strip", () => {
    const wave = stage.waves[0]!;
    const strip = peakStrip(summarizeWave(stage, 1)!);
    expect(strip.peaks).toHaveLength(wave.peaks.length);
    expect(strip.peaks[0]!.from).toBeCloseTo(wave.peaks[0]!.atMs / wave.durationMs, 6);
    expect(strip.beats[0]).toBe(0);
    expect(strip.beats.every((beat) => beat >= 0 && beat <= 1)).toBe(true);
  });
});

describe("when the card shows and what it says", () => {
  it("shows the next wave in prep, warning and breaks, the Vương in the lull, nothing during a wave", () => {
    expect(cardWave("prep", 0, 6)).toBe(1);
    expect(cardWave("warning", 2, 6)).toBe(3);
    expect(cardWave("break", 2, 6)).toBe(3);
    expect(cardWave("break", 6, 6)).toBe(-1);
    expect(cardWave("lull", 6, 6)).toBe(0);
    for (const phase of ["wave", "boss", "victory", "defeat"] as const) expect(cardWave(phase, 3, 6)).toBe(-1);
  });

  it("counts down and says what Enter does (canon §4.1, §5.1)", () => {
    const w = (phase: World["phase"], left: number, preset: World["preset"] = "balanced") => ({ phase, tick: 100, phaseEndsAt: 100 + left * 60, preset });
    expect(footerText(w("prep", 20))).toEqual({ when: "Bắt đầu sau 20 s", enter: "Enter: bắt đầu ngay" });
    expect(footerText(w("warning", 5)).when).toBe("Thú tới sau 5 s");
    expect(footerText(w("break", 12)).when).toBe("Đợt kế sau 12 s");
    expect(PRESETS.relax.breakMs).toBe("enter");
    expect(footerText(w("break", FLOW.breakAutoMs / 1000, "relax"))).toEqual({ when: "Tự tiếp sau 60 s", enter: "Enter: tiếp" });
    expect(footerText(w("lull", 8)).when).toBe("Thú Vương tới sau 8 s");
  });
});
