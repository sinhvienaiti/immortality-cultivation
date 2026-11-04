import { afterEach, describe, expect, it, vi } from "vitest";
import { LabBus, type LabEvent } from "../../src/lab/events";
import { LabSound, SOUND_IDS } from "../../src/lab/sound";
import { BUS_GAIN, MASTER_GAIN, NOMINAL_GAIN, SEND_LEVEL, SOUND_TIER, SOUND_TRIM_DB, TIER_TARGET, busOf, staticDb, trimGain } from "../../src/lab/sound-tiers";
import fixture from "./fixtures/sound-audit-summary.json";

const rows = new Map(fixture.events.map((row) => [row.id, row]));
const playback = (id: string): number => rows.get(id)!.mMax + SOUND_TRIM_DB[id]! + staticDb(id);

function serve(ids: readonly string[]): void {
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: url.endsWith("manifest.json"),
    headers: { get: () => "application/json" },
    json: async () => Object.fromEntries(ids.map((id) => [id, ["01.ogg"]])),
  }));
}

const bus = new LabBus();
const release = (slot: string, tier: "basic" | "skill" | "ultimate"): LabEvent => ({ ...bus.release, slot, tier });
const cases: [string, LabEvent][] = [
  ["cast", { ...bus.cast }],
  ["release-auto", release("auto", "basic")],
  ["release-k1", release("k1", "skill")],
  ["release-k5", release("k5", "ultimate")],
  ["flyby", { ...bus.flyby }],
  ["impact-flesh", { ...bus.impact, power: 1 }],
  ["death", { ...bus.death }],
  ["world-open", { ...bus.world, phase: "open" }],
  ["world-climax", { ...bus.world, phase: "climax" }],
];

describe("lab sound: playback tiers and the pre-bus reverb send (269)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("covers every sound id and every measured fire variant with a tier", () => {
    for (const id of [...SOUND_IDS, ...fixture.events.filter((r) => r.id.endsWith("-fire")).map((r) => r.id)]) {
      expect(SOUND_TIER[id], id).toBeDefined();
    }
  });

  it("converts dB trims to linear gains, with unity for unknown ids", () => {
    for (const [id, db] of Object.entries(SOUND_TRIM_DB)) expect(trimGain(id), id).toBeCloseTo(10 ** (db / 20), 12);
    expect(trimGain("unknown-event")).toBe(1);
  });

  it("matches the audit formula including nominal, bus, master and the true-peak cap", () => {
    for (const [id, tier] of Object.entries(SOUND_TIER)) {
      const row = rows.get(id);
      const staticGain = 20 * Math.log10(NOMINAL_GAIN[id]! * BUS_GAIN[busOf(id)] * MASTER_GAIN);
      expect(staticDb(id), id).toBeCloseTo(staticGain, 12);
      const expected = !row || tier === "voice" ? 0
        : Math.round((Math.min(TIER_TARGET[tier] - row.mMax, -1 - row.tp) - staticGain) * 10) / 10;
      expect(Math.abs(SOUND_TRIM_DB[id]! - expected), id).toBeLessThanOrEqual(0.05);
      if (row && tier !== "voice") expect(row.tp + SOUND_TRIM_DB[id]! + staticGain, id).toBeLessThanOrEqual(-1 + 0.05);
    }
    // A cap prevents this climax from reaching -9 LUFS; voice is deliberately uncompensated.
    expect(SOUND_TRIM_DB["world-climax"]).toBe(2.3);
    expect(SOUND_TRIM_DB["callout-k7"]).toBe(0);
  });

  it("keeps T3 < T4 < T5 <= the largest T6, and every ordinary event below world-climax", () => {
    const values = (tier: string): number[] => Object.keys(SOUND_TIER).filter((id) => SOUND_TIER[id] === tier && rows.has(id)).map(playback);
    expect(Math.max(...values("T3"))).toBeLessThan(Math.min(...values("T4")));
    expect(Math.max(...values("T4"))).toBeLessThan(Math.min(...values("T5")));
    expect(Math.max(...values("T5"))).toBeLessThanOrEqual(Math.max(...values("T6")));
    for (const [id, tier] of Object.entries(SOUND_TIER)) {
      if (tier !== "T6" && tier !== "voice" && rows.has(id)) expect(playback(id), id).toBeLessThan(playback("world-climax"));
    }
  });

  it.each(cases)("records nominal gain, trim, dry bus and the pre-bus send for %s", async (id, event) => {
    serve(cases.map(([id]) => id));
    const sound = new LabSound();
    await sound.record();
    sound.on(event);
    expect(sound.takes()).toHaveLength(1);
    const take = sound.takes()[0]!;
    expect(take.url).toBe(`/art-src/lab/audio/${id}/01.ogg`);
    expect(take.gain).toBeCloseTo(NOMINAL_GAIN[id]! * BUS_GAIN[busOf(id)] * trimGain(id), 12);
    expect(take.send).toBeCloseTo(SEND_LEVEL[id]! / BUS_GAIN[busOf(id)], 12);
  });

  it("uses the resolved fire take's trim and send, while preserving dynamic power", async () => {
    serve(["impact-flesh", "impact-flesh-fire"]);
    const sound = new LabSound(["fire"]);
    await sound.record();
    sound.element = "fire";
    sound.on({ ...bus.impact, power: 0 });
    const take = sound.takes()[0]!;
    expect(take.url).toContain("/impact-flesh-fire/");
    expect(take.gain).toBeCloseTo(0.5 * BUS_GAIN.combat * trimGain("impact-flesh-fire"), 12);
    expect(take.send).toBeCloseTo(SEND_LEVEL["impact-flesh-fire"]! / BUS_GAIN.combat, 12);
  });

  it("keeps voice unchanged and records hush/reset markers with zero send", async () => {
    serve(["callout-k7"]);
    const sound = new LabSound();
    await sound.record();
    sound.on({ ...bus.callout, slot: "k7" });
    sound.on({ ...bus.world, phase: "hush" });
    sound.reset();
    const [voice, hush, reset] = sound.takes();
    expect(voice!.gain).toBe(BUS_GAIN.voice);
    expect(voice!.send).toBeCloseTo(0.08 / BUS_GAIN.voice, 12);
    expect(hush).toMatchObject({ duck: 0.05, send: 0 });
    expect(reset).toMatchObject({ stopVoices: true, send: 0 });
  });
});
