import { afterEach, describe, expect, it, vi } from "vitest";
import { FIREFLY_SOUND, LAB_TAKES, LabSound } from "../../src/lab/sound";

describe("lab sound: the Firefly takes of the streak, the channel and the meteor (06/11)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names one take per sound with its measured gain, onset and (a meteor) its impact", () => {
    for (const t of Object.values(LAB_TAKES)) {
      expect(t.file).toMatch(/^tt-sfx-[a-z-]+\/take[1-9]\.wav$/);
      expect(t.gain).toBeGreaterThan(0.1);
      expect(t.gain).toBeLessThan(1.5);
      expect(t.onset).toBeGreaterThanOrEqual(0);
      expect(t.onset).toBeLessThan(1);
    }
    for (const t of [LAB_TAKES.meteor, LAB_TAKES.meteorB]) expect(t.peak).toBeGreaterThan(t.onset);
    // The break's file ends while its wind still blows: it fades out after its brush.
    expect(LAB_TAKES.streakBreak.fade[0]).toBeGreaterThan(LAB_TAKES.streakBreak.onset);
  });

  it("records a take on the lab clock with its lead-in skipped, its bus and send, and keeps no loop in a capture", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, headers: { get: () => "text/html" }, json: async () => ({}) }));
    const sound = new LabSound();
    await sound.record();
    sound.update(1);
    expect(sound.playTake(LAB_TAKES.channelStart, { send: 0.25 })).toBe(true);
    expect(sound.playTake(LAB_TAKES.streakCount, { bus: "ui", gain: 0.8 })).toBe(true);
    // A late join (the meteor's first fall): it starts further in, so its file starts earlier on the clock.
    sound.playTake(LAB_TAKES.meteor, { from: 0.93 });
    const [start, tick, fall] = sound.takes();
    expect(start!.url).toBe(FIREFLY_SOUND + LAB_TAKES.channelStart.file);
    expect(start!.at).toBeCloseTo(1 - LAB_TAKES.channelStart.onset, 5);
    expect(start!.send).toBeGreaterThan(0);
    expect(tick!.at).toBeCloseTo(1, 5);
    expect(tick!.gain).toBeCloseTo(LAB_TAKES.streakCount.gain * 0.8, 5);
    expect(tick!.send).toBe(0);
    expect(fall!.at).toBeCloseTo(1 - 0.93, 5);
    expect(sound.loopTake(LAB_TAKES.channelLoop, 1)).toBeNull();
  });
});
