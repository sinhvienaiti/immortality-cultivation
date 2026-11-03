import { afterEach, describe, expect, it, vi } from "vitest";
import type { LabEvent } from "../../src/lab/events";
import { LabSound } from "../../src/lab/sound";

/** The lab's manifest as the dev server would answer it. */
function serve(manifest: Record<string, string[]>): void {
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: url.endsWith("manifest.json"),
    headers: { get: () => "application/json" },
    json: async () => manifest,
  }));
}

const release = (slot: string): LabEvent => ({ kind: "release", slot, tier: "skill", x: 0, z: 0, dx: 0, dz: -1, frame: 0, time: 0 });

describe("lab sound: the element's files first (canon D59)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays <event>-<element> when it has files, else <event>, while recording", async () => {
    serve({ "release-k1": ["01.ogg"], "release-k1-fire": ["01.ogg"], release: ["01.ogg"], "flyby-fire": ["01.ogg"], flyby: ["01.ogg"] });
    const sound = new LabSound(["fire"]);
    await sound.record();
    sound.element = "fire";
    sound.on(release("k1"));
    sound.on(release("k2"));
    sound.on({ kind: "flyby", x: 0, y: 1, z: 0, speed: 30 });
    sound.element = "";
    sound.update(0.2);
    sound.on(release("k1"));
    const urls = sound.takes().map((t) => t.url);
    expect(urls).toEqual(["/art-src/lab/audio/release-k1-fire/01.ogg", "/art-src/lab/audio/release/01.ogg", "/art-src/lab/audio/flyby-fire/01.ogg", "/art-src/lab/audio/release-k1/01.ogg"]);
    // Asked under the event's own id (and the element's take under its id).
    expect(sound.asked["release-k1"]).toBe(2);
    expect(sound.asked["release-k1-fire"]).toBe(1);
  });

  it("falls back from release-k2 to release-fire before release", async () => {
    serve({ release: ["01.ogg"], "release-fire": ["01.ogg"] });
    const sound = new LabSound(["fire"]);
    await sound.record();
    sound.element = "fire";
    sound.on(release("k2"));
    expect(sound.takes().map((t) => t.url)).toEqual(["/art-src/lab/audio/release-fire/01.ogg"]);
  });
});
