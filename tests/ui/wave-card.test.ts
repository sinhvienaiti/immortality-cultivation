import { describe, expect, it } from "vitest";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { FLOW, PRESETS } from "../../src/content/rules";
import type { World } from "../../src/content/types";
import { ICON_PATHS } from "../../src/ui/skin";
import { cardWave, footerText, marksOf, peakStrip, summarizeBoss, summarizeWave, waveCardSpots } from "../../src/ui/wave-card";
import { chooseSpot, overlapArea, screenZones } from "../../src/ui/screen-zones";

/** canon §4.1, §13.3, M0A_PLAN §6.6: what the wave card says, gate by gate, with its marks. */

const stage = THANH_THACH_AI;

describe("forecast hard Shop exclusion", () => {
  it.each([[1280, 720], [1920, 1080]])("never chooses a Shop intersection at %i × %i, even when all field spots are obstructed", (width, height) => {
    for (const scale of [100, 125, 150]) {
      const zones = screenZones(width, height, scale);
      const drawer = zones.find(zone => zone.id === "shop")!;
      const shop = { x: drawer.x, y: drawer.y, w: drawer.width, h: drawer.height };
      const bottom = zones.find(zone => zone.id === "quyet")!.y;
      for (const h of [130, 230, 330]) {
        const spots = waveCardSpots(width, bottom, 408, h, [shop]);
        expect(spots.length).toBeGreaterThan(0);
        const obstructed = { lanes: [], slots: [{ x: 0, y: 0, w: width, h: height }], stamp: 1 };
        const picked = spots[chooseSpot(spots, obstructed, [shop], { w: width, h: bottom }, 1)]!;
        expect(overlapArea(picked, shop)).toBe(0);
        expect(spots.every(spot => overlapArea(spot, shop) === 0)).toBe(true);
      }
    }
  });
});

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
    expect(cardWave("warning", 2, 6)).toBe(-1);
    expect(cardWave("break", 2, 6)).toBe(3);
    expect(cardWave("break", 6, 6)).toBe(-1);
    expect(cardWave("lull", 6, 6)).toBe(-1);
    for (const phase of ["wave", "boss", "victory", "defeat"] as const) expect(cardWave(phase, 3, 6)).toBe(-1);
  });

  it("counts down and says what Enter does (canon §4.1, §5.1)", () => {
    const w = (phase: World["phase"], left: number, preset: World["preset"] = "balanced") => ({ phase, tick: 100, phaseEndsAt: 100 + left * 60, preset });
    expect(footerText(w("prep", 20))).toEqual({ when: "Starts in 20 s", enter: "Enter: start now" });
    expect(footerText(w("warning", 5)).when).toBe("Enemies in 5 s");
    expect(footerText(w("break", 12)).when).toBe("Next wave in 12 s");
    expect(PRESETS.relax.breakMs).toBe("enter");
    expect(footerText(w("break", FLOW.breakAutoMs / 1000, "relax"))).toEqual({ when: "Auto-continue in 60 s", enter: "Enter: continue" });
    expect(footerText(w("lull", 8)).when).toBe("Boss in 8 s");
  });
});
