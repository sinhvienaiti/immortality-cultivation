import { describe, expect, it } from "vitest";
import { FOE_EVENTS, FOE_LEVELS, FOE_PITCH_JITTER } from "../../src/lab/foe-levels";
import { LabSound } from "../../src/lab/sound";
import { BUS_GAIN, FIREFLY_LEVELS, MASTER_GAIN, fireflyGain } from "../../src/lab/sound-tiers";

describe("lab sound: the foe pack (12/11)", () => {
  it("measures every variant of every event and lays its layers on events that exist", () => {
    for (const [id, ev] of Object.entries(FOE_EVENTS)) {
      expect(ev.v.length, id).toBeGreaterThan(0);
      for (const file of ev.v) {
        expect(FOE_LEVELS[file], file).toBeDefined();
        expect(FIREFLY_LEVELS[file], file).toBeDefined();
        expect(FOE_LEVELS[file]![1], `${file} true peak`).toBeLessThanOrEqual(-0.99);
      }
      for (const [layer] of ev.l ?? []) expect(FOE_EVENTS[layer], `${id} layer ${layer}`).toBeDefined();
    }
  });

  it("plays each event at its target level: gain × bus × master brings its measured maximum to the target (never past −1 dBTP)", () => {
    const ev = FOE_EVENTS["wolf-howl"]!;
    const file = ev.v[0]!;
    const g = fireflyGain(file, ev.t, "combat");
    const [m, tp] = FOE_LEVELS[file]!;
    const played = m + 20 * Math.log10(g * BUS_GAIN.combat * MASTER_GAIN);
    expect(played).toBeCloseTo(Math.min(ev.t, -1 - tp + m), 1);
  });

  it("keeps the old event names and has the new ones (hurt-heavy ×5, spawn ×5, species elite and captain calls, the king)", () => {
    for (const id of ["wolf-howl", "wolf-hurt", "boar-ram", "boss-charge-launch", "boss-death", "ink-dissolve", "dissolve-chain"]) expect(FOE_EVENTS[id], id).toBeDefined();
    for (const sp of ["wolf", "boar", "rat", "crow", "ape"]) {
      for (const id of [`${sp}-hurt-heavy`, `${sp}-spawn`, `elite-${sp}-roar`, `captain-${sp}-call`]) expect(FOE_EVENTS[id], id).toBeDefined();
    }
    for (const id of ["boar-roar", "boss-boar-king-bellow", "boss-boar-king-charge", "boss-boar-king-death", "boss-charge-launch-clean"]) expect(FOE_EVENTS[id], id).toBeDefined();
  });

  it("picks a variant without repeating it and offsets the pitch within ±3 %; layers follow at their offsets", async () => {
    const sound = new LabSound();
    await sound.record();
    const rates: number[] = [];
    const files: string[] = [];
    for (let i = 0; i < 12; i++) {
      sound.update(0.2);
      expect(sound.foe("wolf-hurt")).toBe(true);
    }
    for (const t of sound.takes()) {
      rates.push(t.rate);
      files.push(t.url);
    }
    for (const r of rates) expect(Math.abs(r - 1)).toBeLessThanOrEqual(FOE_PITCH_JITTER + 1e-9);
    expect(new Set(files).size).toBeGreaterThan(1);
    for (let i = 1; i < files.length; i++) expect(files[i]).not.toBe(files[i - 1]);
    sound.foe("wolf-death");
    const last = sound.takes().slice(-2);
    expect(last.map((t) => t.url.split("/").pop()!.replace(/-v\d\.wav$|\.wav$/, "")).sort()).toEqual(["ink-dissolve", "wolf-death"]);
    expect(last.every((t) => t.group === "death")).toBe(true);
  });

  it("merges hits into 40 ms buckets and deaths into 50 ms: the first sounds, the rest count", async () => {
    const sound = new LabSound();
    await sound.record();
    expect(sound.foe("boar-hurt")).toBe(true);
    expect(sound.foe("boar-hurt")).toBe(false);
    expect(sound.foe("boar-hurt")).toBe(false);
    expect(sound.foeMerged).toBe(2);
    sound.update(0.05);
    expect(sound.foe("boar-hurt")).toBe(true);
    expect(sound.foe("no-such-event")).toBe(false);
  });
});
