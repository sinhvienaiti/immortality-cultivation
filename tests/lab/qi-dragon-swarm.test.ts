import { describe, expect, it } from "vitest";
import type { SimEvent } from "../../src/content/types";
import { QiSwarmLab, skillsLabQuality, type SwarmLabHerd, type SwarmLabPresenter } from "../../src/lab/qi-dragon-swarm";
import { SwarmTimeline, decodeSwarm } from "../../src/view/skills/qi-dragon-swarm";

function harness(empty = false) {
  const poses = [
    { x: -13, z: -12, tier: 1, alive: !empty }, { x: 12, z: -12, tier: 1, alive: !empty },
    { x: -7, z: -6, tier: 2, alive: !empty }, { x: 7, z: -6, tier: 2, alive: !empty },
    { x: 0, z: -10, tier: 0, alive: !empty }, { x: 15, z: -9, tier: 4, alive: !empty },
  ];
  const hits: number[][] = [], frames: number[][] = [], events: SimEvent[] = [];
  const herd: SwarmLabHerd = { size: poses.length, autoRespawn: true,
    alive: (i) => poses[i]?.alive ?? false, x: (i) => poses[i]!.x, z: (i) => poses[i]!.z, tier: (i) => poses[i]!.tier,
    hitFromSim: (i, dx, dz, power, rgb, fraction) => { hits.push([i, dx, dz, power, rgb, fraction]); if (fraction <= 0) poses[i]!.alive = false; },
  };
  const timeline = new SwarmTimeline();
  const presenter: SwarmLabPresenter = { timeline, event: (e) => timeline.event(e), frame: (...args) => frames.push(args), reset: () => timeline.reset() };
  const lab = new QiSwarmLab(herd, presenter, () => ({ x: 0, z: 3 }), (e) => events.push(e));
  return { lab, herd, timeline, hits, frames, events, poses };
}

describe("skills lab real swarm mode", () => {
  it("keeps default quality parsing unchanged and only enables tier= with key2=swarm", () => {
    expect(skillsLabQuality(new URLSearchParams())).toBe("high");
    expect(skillsLabQuality(new URLSearchParams("q=low"))).toBe("low");
    expect(skillsLabQuality(new URLSearchParams("tier=low"))).toBe("high");
    expect(skillsLabQuality(new URLSearchParams("key2=twin-pearl&tier=low&q=medium"))).toBe("medium");
    for (const tier of ["high", "medium", "low"] as const) expect(skillsLabQuality(new URLSearchParams("key2=swarm&tier=" + tier))).toBe(tier);
    expect(skillsLabQuality(new URLSearchParams("key2=swarm&tier=bad&q=medium"))).toBe("medium");
  });
  it("runs production cast/skills on the actual herd snapshot, sends their exact packet and real damage/lifecycle", () => {
    const { lab, timeline, events, hits, herd, poses } = harness();
    expect(lab.world.skills.swarm).toBeDefined(); expect(herd.autoRespawn).toBe(false);
    lab.cast();
    const slot = timeline.slots[0]!, live = lab.world.skills.swarm!.casts[0]!;
    expect(slot.packet.castId).toBe(live.castId); expect(slot.packet.castTick).toBe(live.startTick);
    const born = events.find((e) => e.type === "skill-fx" && e.stage === "swarm-cast");
    expect(born?.type).toBe("skill-fx");
    if (born?.type !== "skill-fx") throw new Error("missing cast event");
    expect(born.swarm).toEqual(live.packet); expect(decodeSwarm(born.swarm)).toEqual(slot.packet);
    expect(live.snapshot).toHaveLength(poses.length);
    const p = slot.packet;
    for (let i = 0; i <= p.endTick + 1; i += 1) { lab.advance(1 / 60); lab.draw(1 / 60); }
    const lifecycle = events.filter((e) => e.type === "skill-fx" && e.stage.startsWith("swarm-"));
    expect(lifecycle.map((e) => e.type === "skill-fx" ? [e.stage, e.tick] : [])).toEqual([
      ["swarm-cast", 0], ["swarm-burst", p.burstTick], ["swarm-end", p.endTick],
    ]);
    const damage = events.filter((e) => e.type === "hit");
    expect(damage.length).toBeGreaterThan(0); expect(hits).toHaveLength(damage.length);
    for (const phase of ["release", "touch", "burst"] as const) expect(lab.reports[0]![phase]).toBe(damage.reduce((n, e) => n + (e.type === "hit" && e.phase === phase ? e.amount : 0), 0));
    expect(lab.reports[0]!.hits).toBe(damage.length); expect(timeline.slots).toEqual([null, null]);
  });
  it("reads moving target poses without redrawing the cast route and supports two overlapping casts", () => {
    const { lab, poses, timeline } = harness(); lab.cast();
    const samples = timeline.slots[0]!.packet.dragons[0]!.samples.slice();
    poses[1]!.x -= 2; lab.advance(1 / 60);
    expect(lab.world.beasts.list[1]!.x).toBe(poses[1]!.x * 60_000);
    expect(timeline.slots[0]!.packet.dragons[0]!.samples).toEqual(samples);
    lab.cast(); expect(timeline.slots.filter(Boolean)).toHaveLength(2);
    expect(timeline.slots[0]!.packet.castId).not.toBe(timeline.slots[1]!.packet.castId);
  });
  it("freezes the tick/interpolation on pause, and reset drops every cast", () => {
    const { lab, frames, timeline, poses } = harness(); lab.cast(); lab.advance(1 / 120); lab.draw(1 / 120);
    const tick = lab.world.tick, alpha = frames.at(-1)![1];
    lab.paused = true; lab.advance(0.1); lab.draw(0.1); lab.cast();
    expect(lab.world.tick).toBe(tick); expect(frames.at(-1)).toEqual([tick, alpha, 0]);
    lab.paused = false; lab.advance(1 / 120); expect(lab.world.tick).toBe(tick + 1);
    poses.forEach((p) => p.alive = true); lab.reset(); expect(lab.world.tick).toBe(0); expect(timeline.slots).toEqual([null, null]);
    expect(lab.reports).toEqual([]);
  });
  it("lets the production held-cast rule handle an empty herd without inventing a packet or hit", () => {
    const { lab, events, timeline, hits } = harness(true); lab.cast();
    for (let i = 0; i < 190; i += 1) lab.advance(1 / 60);
    expect(events.some((e) => e.type === "skill-fx")).toBe(false); expect(hits).toEqual([]); expect(timeline.slots).toEqual([null, null]);
    expect(lab.world.casts.held).toHaveLength(0);
  });
});
