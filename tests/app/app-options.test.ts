// The page's flags, first tier, header Chớp floor and frame loop (M0A_PLAN §6.9, canon §20.1, §6.5, §23.2).
import { describe, expect, it } from "vitest";
import { createReplayHeader, optionsFromUrl, overBudget, tierForGpu, type MatchRequest } from "../../src/app/app";
import { createLoop, MAX_STEPS, TICK_S } from "../../src/app/loop";
import { saveNewWords } from "../../src/app/save";
import { loadKey, type KeyStore } from "../../src/app/storage";
import type { StageDef } from "../../src/content/types";

describe("URL flags (M0A_PLAN §6.9)", () => {
  it("reads ?q ?seed ?preset ?prelearn ?review ?speech ?guard ?tam ?debug; unknown values are ignored", () => {
    const options = optionsFromUrl("?q=medium&seed=1234&preset=relax&prelearn=0&review=0&speech=0&guard=dash&tam=tich-kiem&debug=1", false);
    expect(options).toMatchObject({ quality: "medium", seed: 1234, preset: "relax", prelearn: false, review: false, speech: false, guard: "dash", tamPhap: "tich-kiem", debug: true });
    const plain = optionsFromUrl("?q=ultra&seed=-4&preset=hard&guard=x", false);
    expect(plain).toMatchObject({ quality: undefined, seed: undefined, preset: undefined, prelearn: true, review: true, speech: true, guard: undefined, debug: false });
  });

  it("?speed=N only in dev builds, held in 0.25–16 (rules unchanged)", () => {
    expect(optionsFromUrl("?speed=4", false).speed).toBeUndefined();
    expect(optionsFromUrl("?speed=4", true).speed).toBe(4);
    expect(optionsFromUrl("?speed=99", true).speed).toBe(16);
    expect(optionsFromUrl("?speed=0.1", true).speed).toBe(0.25);
    expect(optionsFromUrl("?speed=abc", true).speed).toBeUndefined();
  });
});

describe("first tier by GPU (canon §20.1)", () => {
  it("High on a discrete GPU, Medium on Apple, Low otherwise and on software renderers", () => {
    expect(tierForGpu("ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Ti Laptop GPU (0x000025A0) Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe("high");
    expect(tierForGpu("ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0)")).toBe("high");
    expect(tierForGpu("ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)")).toBe("medium");
    expect(tierForGpu("ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)")).toBe("low");
    expect(tierForGpu("ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0)")).toBe("low");
    expect(tierForGpu("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)")).toBe("low");
    expect(tierForGpu("")).toBe("low");
  });

  it("only suggests a lower tier once frames drop regularly or the CPU part runs over the tier's p95 budget", () => {
    const smooth = Array.from({ length: 300 }, () => 16.7);
    const cpuOk = Array.from({ length: 300 }, () => 3);
    expect(overBudget("high", smooth, cpuOk)).toBe(false);
    expect(overBudget("high", smooth.slice(0, 30), cpuOk)).toBe(false);
    const dropping = smooth.map((value, index) => (index % 10 === 0 ? 33.4 : value));
    expect(overBudget("high", dropping, cpuOk)).toBe(true);
    expect(overBudget("high", smooth, cpuOk.map(() => 9))).toBe(true);
  });
});

describe("replay header (canon §23.2, §6.5)", () => {
  const request: MatchRequest = {
    seed: 3, stage: { id: "m0a-thanh-thach-ai" } as StageDef, preset: "balanced", pacing: true, loadout: { guard: "ward", tamPhap: "kiem-tam" },
    profile: { e: 35, a: 950, cv: 250 }, records: [], level: 1, dueCount: 0, nowMs: 0,
  };
  it("writes the Chớp floor into the seat when the app gives one, after kPm", () => {
    const header = createReplayHeader({ ...request, flashEX1000: 31_250 }, [], 8, 1000, "0badc0de");
    expect(header.seats).toEqual([{ seat: 0, profile: { e: 35, a: 950, cv: 250 }, kPm: 1000, flashEX1000: 31_250 }]);
    expect(Object.keys(header.seats[0]!)).toEqual(["seat", "profile", "kPm", "flashEX1000"]);
    expect(Object.keys(createReplayHeader(request, [], 8, 1000, "0badc0de").seats[0]!)).toEqual(["seat", "profile", "kPm"]);
  });
});

describe("save: .newwords on every take", () => {
  it("writes the ledger snapshot; entries older than 20 minutes drop", () => {
    const data = new Map<string, string>();
    const store: KeyStore = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => (data.set(key, value), true) };
    const now = 50 * 60_000;
    expect(saveNewWords({ v: 1, entries: [{ wordId: "old", firstSeenMs: now - 21 * 60_000, channel: "slot4" }, { wordId: "river", firstSeenMs: now - 60_000, channel: "learn-ahead" }] }, now, store)).toBe(true);
    expect(loadKey("newwords", store).value.entries.map((entry) => entry.wordId)).toEqual(["river"]);
  });
});

describe("frame loop", () => {
  function manual() {
    let pending: ((now: number) => void) | null = null;
    return {
      scheduler: { request: (callback: (now: number) => void) => ((pending = callback), 1), cancel: () => (pending = null) },
      run(now: number) {
        const callback = pending;
        pending = null;
        callback?.(now);
      },
    };
  }

  it("steps by the view's world clock (hit stop) times the dev speed, never past the cap; paused, it only draws", () => {
    const frames = manual();
    let steps = 0;
    let stop = false;
    let speed = 1;
    const seen: number[] = [];
    const loop = createLoop(
      { step: () => (steps += 1), frame: (timing) => seen.push(timing.worldDt), worldDt: (dt) => (stop ? 0 : dt), speed: () => speed },
      { scheduler: frames.scheduler },
    );
    loop.start();
    frames.run(0);
    // 0.06 s: 3.6 ticks → 3 steps, 0.6 of a tick carried.
    frames.run(60);
    expect(steps).toBe(3);
    // A hit stop: the world stands still, the frame still draws.
    stop = true;
    frames.run(120);
    expect(steps).toBe(3);
    expect(seen[seen.length - 1]).toBe(0);
    // Dev speed 4: 0.05 s → 0.2 s of world, 12 more steps.
    stop = false;
    speed = 4;
    frames.run(170);
    expect(steps).toBe(15);
    expect(TICK_S).toBeCloseTo(1 / 60);
    loop.setPaused(true);
    frames.run(220);
    expect(steps).toBe(15);
    expect(seen.length).toBe(5);
    // 0.1 s × 16 = 96 ticks asked; the cap is MAX_STEPS × 16 = 80.
    speed = 16;
    loop.setPaused(false);
    frames.run(320);
    expect(steps).toBe(15 + MAX_STEPS * 16);
    loop.stop();
  });
});
