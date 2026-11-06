import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { SimEvent } from "../../src/content/types";
import { SWARM } from "../../src/content/data/swarm";
import { encodeSwarmCast, planSwarm, swarmBodyAt, swarmChecksum, SWARM_PACKET as P } from "../../src/sim/swarm";
import { QiDragonSwarm, swarmTier, swarmModelUrl, decodeSwarm, swarmBody, swarmPoint, SwarmClock, SwarmTimeline, type SwarmBody } from "../../src/view/skills/qi-dragon-swarm";

const plan = planSwarm({ minXMm: -20_000, maxXMm: 20_000, minZMm: -18_000, maxZMm: 8000 }, { x: 0, y: 1200, z: 3000 }, [
  { id: 1, slot: 0, boss: false, sky: false, x: -12_000, y: 0, z: -14_000 },
  { id: 2, slot: 1, boss: false, sky: false, x: 12_000, y: 0, z: -14_000 },
  { id: 3, slot: 2, boss: false, sky: true, x: 2000, y: 4000, z: -16_000 },
]);
const packet = encodeSwarmCast(plan, 7, 0, 100);
const event = (stage: "swarm-cast" | "swarm-burst" | "swarm-end", id = 7, start = 100): Extract<SimEvent, { type: "skill-fx" }> => ({
  tick: start + (stage === "swarm-burst" ? plan.burstTick : stage === "swarm-end" ? plan.endTick : 0),
  type: "skill-fx", seat: 0, skill: "kiem", stage, castId: id, count: 5, x: 0, z: 3, toX: 0, toZ: -6,
  ...(stage === "swarm-cast" ? { swarm: encodeSwarmCast(plan, id, 0, start) } : {}),
});
const body = (): SwarmBody => ({ visible: false, headMm: 0, tailMm: 0, rawHeadMm: 0 });

describe("SwarmCastV1 presenter contract", () => {
  it("decodes the real sim packet, preserves every baked integer, and owns its bytes", () => {
    const src = packet.slice(), decoded = decodeSwarm(src)!;
    expect(decoded).not.toBeNull();
    expect([decoded.castId, decoded.seat, decoded.castTick]).toEqual([7, 0, 100]);
    expect(decoded.origin).toEqual([0, 1.2, 3]);
    expect(decoded.pearl).toEqual([plan.pearl.x / 1000, plan.pearl.y / 1000, plan.pearl.z / 1000]);
    expect([decoded.burstTick, decoded.endTick]).toEqual([plan.burstTick, plan.endTick]);
    decoded.dragons.forEach((d, i) => expect(d.samples).toEqual(plan.dragons[i]!.samples));
    src.fill(0); expect(decoded.dragons[0]!.samples).toEqual(plan.dragons[0]!.samples);
  });
  it("rejects truncated, oversized, corrupt, unsupported or structurally invalid packets", () => {
    expect(decodeSwarm(null)).toBeNull(); expect(decodeSwarm(Array.from(packet))).toBeNull();
    expect(decodeSwarm(packet.slice(0, -1))).toBeNull();
    expect(decodeSwarm(new Int32Array(7000))).toBeNull();
    const damaged = packet.slice(); damaged[damaged.length - 1]! += 1; expect(decodeSwarm(damaged)).toBeNull();
    for (const offset of [P.schema, P.geometry, P.tables, P.slot, P.dragons, P.bodyMm, P.retractTicks, P.speedMmPerSecond, P.headerWords + 2]) {
      const bad = packet.slice(); bad[offset]! += 1; bad[P.checksum] = swarmChecksum(bad); expect(decodeSwarm(bad)).toBeNull();
    }
    const trailing = new Int32Array(packet.length + 1); trailing.set(packet); trailing[P.checksum] = swarmChecksum(trailing); expect(decodeSwarm(trailing)).toBeNull();
  });
  it("matches the real visible collision interval at every integer tick, including retraction", () => {
    const p = decodeSwarm(packet)!;
    for (let i = 0; i < 5; i += 1) for (let tick = 0; tick <= p.endTick; tick += 1) {
      const sim = swarmBodyAt(plan.dragons[i]!, tick), view = swarmBody(p, p.dragons[i]!, tick, body());
      expect({ visible: view.visible, headMm: view.headMm, tailMm: view.tailMm }).toEqual(sim);
    }
  });
  it("interpolates two adjacent tick poses, reaches the pearl on the dive tick and hides on the retract tick", () => {
    const p = decodeSwarm(packet)!, d = p.dragons[0]!, out = new THREE.Vector3();
    const a = swarmBody(p, d, 45, body()), b = swarmBody(p, d, 46, body()), half = swarmBody(p, d, 45.5, body());
    expect(half.rawHeadMm).toBe((a.rawHeadMm + b.rawHeadMm) / 2);
    const atPearl = swarmBody(p, d, d.diveTick, body()); swarmPoint(d, atPearl.headMm, out);
    expect(out.toArray()).toEqual(p.pearl);
    expect(swarmBody(p, d, d.launchTick - 0.001, body()).visible).toBe(false);
    expect(swarmBody(p, d, d.diveTick + p.retractTicks - 0.001, body()).visible).toBe(true);
    expect(swarmBody(p, d, d.diveTick + p.retractTicks, body()).visible).toBe(false);
  });
  it("uses baked arc stations rather than new helix lengths, with only linear interpolation", () => {
    const p = decodeSwarm(packet)!, out = new THREE.Vector3();
    for (const d of p.dragons) for (let i = 0; i < d.samples.length / 3; i += 1) {
      swarmPoint(d, Math.min(d.lengthMm, i * SWARM.geometry.stepMm), out);
      expect(out.toArray()).toEqual(Array.from(d.samples.subarray(i * 3, i * 3 + 3), (n) => n / 1000));
    }
    const d = p.dragons[0]!; swarmPoint(d, 125, out);
    expect(out.toArray()).toEqual([0, 1, 2].map((axis) => (d.samples[axis]! + d.samples[axis + 3]!) / 2000));
  });
});

describe("two pooled swarms and the world clock", () => {
  it("separates overlaps, does not restart duplicates or steal a live slot, and routes burst/end by castId", () => {
    const t = new SwarmTimeline();
    expect(t.event(event("swarm-cast"))).toBe(true); const first = t.slots[0];
    expect(t.event(event("swarm-cast", 8, 120))).toBe(true);
    expect(t.event(event("swarm-cast"))).toBe(false); expect(t.slots[0]).toBe(first);
    expect(t.event(event("swarm-cast", 9, 121))).toBe(false);
    expect(t.event(event("swarm-burst", 8, 120))).toBe(true); expect(t.slots[0]!.burstAt).toBeNull();
    expect(t.slots[1]!.burstAt).toBe(120 + plan.burstTick);
    expect(t.event(event("swarm-end"))).toBe(true); expect(t.slots[0]).toBeNull(); expect(t.slots[1]).not.toBeNull();
    expect(t.event(event("swarm-burst", 99))).toBe(false);
    expect(t.event(event("swarm-cast", 10, 122))).toBe(true);
    t.reset(); expect(t.slots).toEqual([null, null]);
  });
  it("rejects mismatched event identity and expires at the packet's own end", () => {
    const t = new SwarmTimeline(); expect(t.event({ ...event("swarm-cast"), castId: 99 })).toBe(false);
    t.event(event("swarm-cast")); t.expire(100 + plan.endTick - 0.01); expect(t.slots[0]).not.toBeNull();
    t.expire(100 + plan.endTick); expect(t.slots[0]).toBeNull();
  });
  it("freezes interpolation throughout pause, resumes on ticks, and resets for a new match", () => {
    const c = new SwarmClock(); expect(c.sample(100, 0.25, 1 / 60)).toBe(99.25);
    expect(c.sample(100, 0.9, 0)).toBe(99.25); expect(c.sample(100, 0, 0)).toBe(99.25);
    expect(c.sample(101, 0.5, 1 / 60)).toBe(100.5);
    c.reset(); expect(c.sample(1, 0, 0)).toBe(0);
  });
});

// A tiny instrument rig for Node: validates real object/pass construction without a GPU or media decoding.
function instrumentAssets(): import("../../src/view/skills/qi-dragon-swarm").SwarmAssets {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.1, 1, 0, 0, 2, 0.1], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 0.5, 0.5, 1, 1], 2));
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0], 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const bones = Array.from({ length: 4 }, (_, i) => { const b = new THREE.Bone(); b.name = "bone_" + String(i).padStart(2, "0"); b.position.y = i === 0 ? 0 : 1; return b; });
  for (let i = 1; i < 4; i += 1) bones[i - 1]!.add(bones[i]!);
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ map: new THREE.Texture() }));
  mesh.add(bones[0]!); mesh.bind(new THREE.Skeleton(bones));
  const model = new THREE.Group(); model.add(mesh);
  return { model, scales: new THREE.Texture(), flame: new THREE.Texture(), glint: new THREE.Texture(), flare: new THREE.Texture(), halo: new THREE.Texture(), ring: new THREE.Texture(), swirl: new THREE.Texture() };
}

describe("quality tiers and actual scene pass budgets", () => {
  it("selects manifest URLs without losing version keys; Low has no model or bloom", () => {
    const m = { version: 1, models: { "skills/qi-dragon": { tiers: { high: { url: "/high.glb?v=1" }, medium: { url: "/medium.glb?v=2" } } } } };
    expect(swarmModelUrl(m, "high")).toBe("/high.glb?v=1");
    expect(swarmModelUrl(m, "ultra")).toBe("/high.glb?v=1");
    expect(swarmModelUrl(m, "medium")).toBe("/medium.glb?v=2"); expect(swarmModelUrl(m, "low")).toBeNull();
    expect(swarmTier("low")).toEqual({ modelTier: null, dragons: 5, prepasses: 0, skinnedDraws: 0, bloom: false });
    expect(() => swarmModelUrl({ version: 1, models: {} }, "medium")).toThrow("missing model tier");
  });
  it.each(["high", "medium", "low", "ultra"] as const)("%s builds and draws the promised passes, even with two overlapping casts", async (tier) => {
    const assets = instrumentAssets(); if (tier === "low") (assets as { model: THREE.Object3D | null }).model = null;
    const view = new QiDragonSwarm(new THREE.PerspectiveCamera(), tier, () => false, Promise.resolve(assets));
    await view.ready; view.event(event("swarm-cast")); view.event(event("swarm-cast", 8));
    const age = Math.min(...plan.dragons.map((d) => d.diveTick)) - 1;
    view.frame(101 + age, 0, 1 / 60);
    expect(view.group.children).toHaveLength(2);
    for (const swarm of view.group.children) {
      let colour = 0, depth = 0, skinned = 0;
      swarm.traverseVisible((o) => {
        const mesh = o as THREE.SkinnedMesh; if (!mesh.isSkinnedMesh) return;
        skinned += 1;
        if ((mesh.material as THREE.Material).colorWrite) colour += 1; else depth += 1;
      });
      if (tier === "low") expect(swarm.children.filter((o) => o.name === "qi-dragon-path-strip")).toHaveLength(5);
      expect(colour).toBe(tier === "low" ? 0 : 5);
      expect(depth).toBe(swarmTier(tier).prepasses); expect(skinned).toBe(swarmTier(tier).skinnedDraws);
    }
    view.event(event("swarm-end")); view.frame(101 + age, 0, 0);
    expect(view.group.children[0]!.visible).toBe(false); expect(view.group.children[1]!.visible).toBe(true);
    view.reset(); expect(view.group.children.every((s) => !s.visible)).toBe(true);
    view.dispose(); expect(view.group.children).toHaveLength(0);
  });
  it("poses every spine joint on the sim track; a paused frame cannot move it", async () => {
    const view = new QiDragonSwarm(new THREE.PerspectiveCamera(), "medium", () => false, Promise.resolve(instrumentAssets()));
    await view.ready; view.event(event("swarm-cast")); view.frame(151, 0.5, 1 / 60);
    const expected = new THREE.Vector3(), actual = new THREE.Vector3(), p = decodeSwarm(packet)!, head = swarmBody(p, p.dragons[0]!, 50.5, body());
    const root = view.group.children[0]!.children.find((o) => o.getObjectByName("bone_00"))!;
    for (let i = 0; i < 4; i += 1) {
      const bone = root.getObjectByName("bone_0" + i)!;
      swarmPoint(p.dragons[0]!, head.rawHeadMm - p.bodyMm * i / 4, expected, true);
      bone.getWorldPosition(actual); expect(actual.distanceTo(expected)).toBeLessThan(1e-8);
    }
    const bone = root.getObjectByName("bone_00")!, before = bone.getWorldPosition(new THREE.Vector3());
    view.frame(151, 0.99, 0); expect(bone.getWorldPosition(actual).distanceTo(before)).toBe(0);
    view.dispose();
  });
  it("reduces auxiliary motion and only bursts the pearl after the matching event", async () => {
    let reduced = false;
    const view = new QiDragonSwarm(new THREE.PerspectiveCamera(), "medium", () => reduced, Promise.resolve(instrumentAssets()));
    await view.ready; view.event(event("swarm-cast"));
    view.frame(101 + plan.burstTick, 0, 1 / 60);
    const pearl = view.group.children[0]!.children[0]!, ring = pearl.children[2] as THREE.Sprite;
    expect(ring.scale.x).toBeCloseTo(3.6);
    view.event(event("swarm-burst")); view.frame(101 + plan.burstTick + 5, 0, 1 / 60); expect(ring.scale.x).toBeGreaterThan(3.6);
    reduced = true; view.frame(101 + plan.burstTick + 6, 0, 1 / 60);
    expect(ring.scale.x).toBeCloseTo(3.6); expect(ring.material.rotation).toBe(0);
    view.frame(101 + plan.burstTick + 12, 0, 1 / 60); expect(pearl.visible).toBe(false);
    const points = view.group.children[0]!.children.find((o) => (o as THREE.Points).isPoints)!; expect(points.visible).toBe(false);
    view.dispose();
  });
});

it("warms both output variants and both pooled casts without starting or changing the timeline", async () => {
  const view = new QiDragonSwarm(new THREE.PerspectiveCamera(), "high", () => false, Promise.resolve(instrumentAssets()));
  await view.ready;
  const before: boolean[] = []; view.group.traverse((o) => before.push(o.visible));
  let target: THREE.WebGLRenderTarget | null = null, draws = 0, compiles = 0, uploads = 0;
  const renderer = {
    getRenderTarget: () => target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget: (to: THREE.WebGLRenderTarget | null) => { target = to; },
    initTexture: () => { uploads += 1; },
    compileAsync: async () => { compiles += 1; expect(view.group.children.every((o) => o.visible)).toBe(true); },
    clear: () => {}, render: () => { draws += 1; },
  } as unknown as THREE.WebGLRenderer;
  await view.prewarm(renderer);
  const after: boolean[] = []; view.group.traverse((o) => after.push(o.visible));
  expect(after).toEqual(before); expect(compiles).toBe(2); expect(draws).toBe(1); expect(uploads).toBeGreaterThan(10);
  expect(target).toBeNull(); expect(view.timeline.slots).toEqual([null, null]); expect(view.clock.tick).toBe(-1);
  view.dispose();
});
