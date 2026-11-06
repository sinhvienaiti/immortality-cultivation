import { afterEach, describe, expect, it, vi } from "vitest";
import { LabBus } from "../../src/lab/events";
import { LabSound, mergeDucks } from "../../src/lab/sound";
import { BUS_GAIN, CALLOUT_TRIM_DB, FIREFLY_LEVELS, FIREFLY_TARGET, KEYS_MIX, MASTER_GAIN, MUSIC, classOf, fireflyGain } from "../../src/lab/sound-tiers";

/** The lab's manifest with one file for each of `ids`, as the dev server would answer it. */
function serve(ids: readonly string[]): void {
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: url.endsWith("manifest.json"),
    headers: { get: () => "application/json" },
    json: async () => Object.fromEntries(ids.map((id) => [id, ["01.ogg"]])),
  }));
}

describe("lab sound: the mix pass (06/11)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("puts each skill's shout at its class: normal −6 dB, heavy −3 dB, an ultimate's as it was", async () => {
    serve(["callout", "callout-k2", "callout-k7"]);
    const bus = new LabBus();
    const sound = new LabSound();
    await sound.record();
    for (const slot of ["k1", "k2", "k7"]) {
      sound.on({ ...bus.callout, slot });
      sound.update(0.5);
    }
    const [k1, k2, k7] = sound.takes();
    expect(classOf("k1")).toBe("normal");
    expect(k1!.gain).toBeCloseTo(BUS_GAIN.voice * 10 ** (CALLOUT_TRIM_DB.normal / 20), 9);
    expect(k2!.gain).toBeCloseTo(BUS_GAIN.voice * 10 ** (CALLOUT_TRIM_DB.heavy / 20), 9);
    expect(k7!.gain).toBe(BUS_GAIN.voice);
  });

  it("tags hits, deaths and the big world sounds with their capped voice group", async () => {
    serve(["impact-flesh", "death", "world-climax", "release-k1"]);
    const bus = new LabBus();
    const sound = new LabSound();
    await sound.record();
    sound.on({ ...bus.impact, material: "flesh" });
    sound.on({ ...bus.death });
    sound.on({ ...bus.world, slot: "k7", phase: "climax" });
    sound.on({ ...bus.release, slot: "k1" });
    expect(sound.takes().map((t) => t.group)).toEqual(["impact", "death", "big", undefined]);
  });

  it("plays keys 8 and 9's files at their class's level from their #t= start, faded short, in the big group", async () => {
    serve([]);
    const sound = new LabSound();
    await sound.record();
    sound.playFirefly("tt-sfx-x-five-element-heavenly-silk/take2.wav#t=0.8", "heavy");
    sound.playFirefly("tt-sfx-ult-fire-spark/take1.wav", "ult");
    const [silk, fire] = sound.takes();
    expect(silk).toMatchObject({ from: 0.8, group: "big" });
    expect(silk!.url).toContain("tt-sfx-x-five-element-heavenly-silk/take2.wav");
    expect(silk!.gain).toBeCloseTo(fireflyGain("tt-sfx-x-five-element-heavenly-silk/take2.wav", FIREFLY_TARGET.heavy, "world") * BUS_GAIN.world, 9);
    expect(fire!.fade![0]).toBeGreaterThan(3);
    expect(fire!.from).toBeUndefined();
  });

  it("brings a file to its target unless that would pass −1 dBTP", () => {
    const fixed = 20 * Math.log10(BUS_GAIN.world * MASTER_GAIN);
    for (const [file, [m, tp]] of Object.entries(FIREFLY_LEVELS)) {
      const db = 20 * Math.log10(fireflyGain(file, FIREFLY_TARGET.ult, "world"));
      expect(m + db + fixed, file).toBeLessThanOrEqual(FIREFLY_TARGET.ult + 1e-9);
      expect(tp + db + fixed, file).toBeLessThanOrEqual(-1 + 1e-9);
    }
    expect(fireflyGain("not-measured.wav", -9, "combat")).toBe(1);
  });

  it("records the music's pre-duck and merges ducks that meet (the deeper and the later end win)", async () => {
    serve([]);
    const sound = new LabSound();
    await sound.record();
    sound.preDuck(1.2, "ult");
    expect(sound.takes()[0]!.musicDuck).toEqual([1.2, MUSIC.depth.ult, MUSIC.hold.ult]);
    const low6 = 10 ** (-6 / 20);
    const low7 = 10 ** (-7 / 20);
    const merged = mergeDucks([{ start: 2, end: 2.5, low: low6 }, { start: 0, end: 1, low: low6 }, { start: 1.2, end: 1.8, low: low7 }]);
    expect(merged).toEqual([{ start: 0, end: 2.5, low: low7 }]);
    expect(mergeDucks([{ start: 0, end: 1, low: low6 }, { start: 3, end: 4, low: low6 }])).toHaveLength(2);
  });

  it("loads the Typing Feel catalogue's default key set (read only) and records each key on its own bus, never twice in a row", async () => {
    const catalogue = { default: "bright-clack", profiles: [{ id: "deep", manifest: "sets/deep/aa/keys-manifest.json" }, { id: "bright-clack", manifest: "sets/bright-clack/bb/keys-manifest.json" }] };
    const set = { files: [{ file: "key-01.ogg", set: "key" }, { file: "key-02.ogg", set: "key" }, { file: "space-01.ogg", set: "space" }] };
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      const body = url.endsWith("/v1/keys/keys-manifest.json") ? catalogue : url.includes("/sets/bright-clack/bb/") ? set : {};
      return { ok: true, headers: { get: () => "application/json" }, json: async () => body };
    });
    const sound = new LabSound();
    expect(await sound.loadKeys("/feel/v1/keys/keys-manifest.json")).toBe("bright-clack");
    expect(asked).toContain("/feel/v1/keys/sets/bright-clack/bb/keys-manifest.json");
    await sound.record();
    for (let i = 0; i < 6; i += 1) sound.key("key");
    sound.key("space");
    const takes = sound.takes();
    expect(takes).toHaveLength(7);
    for (const t of takes) expect(t).toMatchObject({ key: true, send: 0 });
    expect(takes[0]!.gain).toBeCloseTo(10 ** (KEYS_MIX.busDb / 20) / MASTER_GAIN, 9);
    for (let i = 1; i < 6; i += 1) expect(takes[i]!.url).not.toBe(takes[i - 1]!.url);
    expect(takes[6]!.url).toBe("/feel/v1/keys/sets/bright-clack/bb/space-01.ogg");
    expect(await sound.loadKeys("/feel/v1/keys/keys-manifest.json", "missing")).toBe("");
  });
});
