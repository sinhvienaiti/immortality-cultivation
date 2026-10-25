import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { FrameInfo } from "../../src/app/contracts";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { COLOURS, FIELD } from "../../src/content/rules";
import type { LocalState, MechanismId, Phase, World } from "../../src/content/types";
import { corridors, corridorWeight, createGround, decalSpots, fieldBox } from "../../src/view/ground";
import type { DamageNumbers, HitFx, InkSmoke } from "../../src/view/hitfx";
import { VIEW, type Renderer3D } from "../../src/view/renderer";
import { createGreyBoxView, createStageView, GATE_M, heartColour, marksVisible, SLOT_MARK, slotOutline, slotYaw, STAGE_COLOURS } from "../../src/view/stage";
import type { SwordPool } from "../../src/view/swords";

/** canon §8.1–8.3, §21.1, M0A_PLAN §6.6 item 1: the grey-box pass on Lane 1's renderer. */

const M = 60_000;
const stage = THANH_THACH_AI;

function fakeRenderer(): Renderer3D {
  return { layers: { ground: new THREE.Group(), actors: new THREE.Group(), fx: new THREE.Group() } } as unknown as Renderer3D;
}

const info: FrameInfo = { dt: 1 / 60, worldDt: 1 / 60, alpha: 0, now: 0, local: {} as LocalState };

function stageWorld(over: { phase?: Phase; heart?: number; built?: readonly (readonly [number, MechanismId, number])[]; nodeOn?: boolean; cracked?: boolean } = {}): World {
  const slots = stage.field.mechSlots.map((slot) => ({ index: slot.index, mech: null as MechanismId | null, level: 0, paid: 0, breakId: 0, nextFire: 0 }));
  for (const [index, mech, level] of over.built ?? []) Object.assign(slots[index]!, { mech, level });
  return {
    stage,
    tick: 10,
    phase: over.phase ?? "prep",
    mechanisms: { slots },
    formation: {
      heart: over.heart ?? 1000,
      heartMax: 1000,
      nodes: [{ id: "tam-nhan", at: { x: 0, z: 3 * M }, on: over.nodeOn ?? true, capturedBy: null, captureFrom: -1, relightAt: -1, cleanse: -1 }],
      pillars: stage.field.pillars.map((pillar) => ({ id: pillar.id, at: { x: pillar.at.xMm * 60, z: pillar.at.zMm * 60 }, radiusU: 0, rams: 0, cracked: over.cracked ?? false })),
    },
  } as unknown as World;
}

const colourOf = (object: THREE.Object3D | undefined): string => {
  const mesh = object as THREE.Mesh;
  const material = (mesh.material ?? (mesh.getObjectByName("body") as THREE.Mesh).material) as THREE.MeshBasicMaterial;
  return "#" + material.color.getHexString();
};

describe("the ground (canon §8.1, §21.1)", () => {
  it("covers the 40 × 26 m field with a corridor from each ground gate to the heart edge", () => {
    expect(fieldBox(stage)).toEqual({ minX: -20, maxX: 20, minZ: -18, maxZ: 8 });
    const list = corridors(stage);
    expect(list).toHaveLength(2);
    for (const c of list) {
      expect(Math.hypot(c.bx, c.bz)).toBeCloseTo(FIELD.heartEdgeMm / 1000, 6);
      expect(corridorWeight(c.ax, c.az, list)).toBe(1);
      expect(corridorWeight((c.ax + c.bx) / 2, (c.az + c.bz) / 2, list)).toBe(1);
    }
    expect(corridorWeight(0, 7, list)).toBe(0);
    expect(corridorWeight(19, 7, list)).toBe(0);
  });

  it("puts the same ink decals for the same seed, off the corridors and the heart (view only)", () => {
    const a = decalSpots(stage, 36, 7);
    expect(decalSpots(stage, 36, 7)).toEqual(a);
    expect(decalSpots(stage, 36, 8)).not.toEqual(a);
    const list = corridors(stage);
    let off = 0;
    for (let k = 0; k < 36; k += 1) {
      const x = a[k * 5]!;
      const z = a[k * 5 + 1]!;
      expect(x).toBeGreaterThanOrEqual(-20);
      expect(x).toBeLessThanOrEqual(20);
      expect(z).toBeGreaterThanOrEqual(-18);
      expect(z).toBeLessThanOrEqual(8);
      if (corridorWeight(x, z, list) < 0.5 && Math.hypot(x, z) > 3) off += 1;
    }
    // A spot that found no clear place in 8 tries keeps its last draw: nearly all are clear.
    expect(off).toBeGreaterThanOrEqual(33);
  });

  it("is built from 5 parts (surround, field, grid, decals, border), no image file", () => {
    const ground = createGround(stage);
    expect(ground.children.map((child) => child.name)).toEqual(["ground-surround", "ground-field", "ground-grid", "ground-decals", "ground-border"]);
    ground.traverse((object) => {
      const material = (object as THREE.Mesh).material as THREE.Material & { map?: THREE.Texture | null };
      if (material) expect(material.map ?? null).toBeNull();
    });
  });
});

describe("the stage view", () => {
  it("shows the 6 mechanism slot marks only in prep and breaks (canon §8.2)", () => {
    expect((["prep", "warning", "wave", "break", "lull", "boss", "victory", "defeat"] as const).filter(marksVisible)).toEqual(["prep", "break"]);
    const renderer = fakeRenderer();
    const view = createStageView(renderer, stage);
    expect(renderer.layers.ground.children).toContain(view.group);
    const marks = view.group.getObjectByName("slot-marks") as THREE.LineSegments;
    const segments = (marks.geometry.getAttribute("position").count as number) / 2;
    const strips = stage.field.mechSlots.filter((slot) => slot.kind === "strip").length;
    expect(segments).toBe(strips * 4 + (stage.field.mechSlots.length - strips) * 24);
    view.frame(stageWorld({ phase: "wave" }), info);
    expect(view.marksShown).toBe(false);
    expect(marks.visible).toBe(false);
    view.frame(stageWorld({ phase: "break" }), info);
    expect(marks.visible).toBe(true);
    view.highlightSlot(2);
    const highlight = view.group.getObjectByName("slot-highlight")!;
    expect(highlight.visible).toBe(true);
    expect(highlight.position.x).toBeCloseTo(stage.field.mechSlots[2]!.at.xMm / 1000, 6);
    view.frame(stageWorld({ phase: "wave" }), info);
    expect(highlight.visible).toBe(false);
    view.dispose();
    expect(renderer.layers.ground.children).toHaveLength(0);
  });

  it("keeps both gates whole in the frame: just inside the far edge, under the camera's headroom (canon D48)", () => {
    const view = createStageView(fakeRenderer(), stage);
    for (const gate of stage.field.gates.filter((item) => item.ground)) {
      const box = new THREE.Box3();
      for (const child of view.group.children) {
        const at = child.position;
        if (Math.abs(at.x - gate.at.xMm / 1000) <= GATE_M.halfWidth + 0.01 && Math.abs(at.z - (gate.at.zMm / 1000 + GATE_M.inset)) < 0.01) box.expandByObject(child);
      }
      expect(box.isEmpty(), "gate " + gate.id).toBe(false);
      expect(box.max.y).toBeLessThanOrEqual(VIEW.headroomM);
      expect(box.min.z).toBeGreaterThanOrEqual(stage.field.minZMm / 1000);
    }
  });

  it("lays a strip slot along its way to the heart (Kiếm Thung 4 × 2 m)", () => {
    for (const slot of stage.field.mechSlots) {
      const yaw = slotYaw(slot);
      // Local +z turned by the yaw points at the heart.
      const dir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const toHeart = new THREE.Vector3(-slot.at.xMm, 0, -slot.at.zMm).normalize();
      expect(dir.dot(toHeart)).toBeCloseTo(1, 6);
    }
    expect(slotOutline("strip")).toEqual([-1, -2, 1, -2, 1, 2, -1, 2]);
    expect(slotOutline("post")).toHaveLength(48);
    expect(SLOT_MARK.stripLength * SLOT_MARK.stripWidth).toBe(8);
  });

  it("builds, upgrades and removes mechanism placeholders from the world's slots", () => {
    const view = createStageView(fakeRenderer(), stage);
    view.frame(stageWorld({ built: [[1, "loi-phu-tru", 1]] }), info);
    const first = view.group.getObjectByName("mech-1")!;
    expect(first).toBeDefined();
    expect(first.scale.y).toBe(1);
    view.frame(stageWorld({ built: [[1, "loi-phu-tru", 3]] }), info);
    const upgraded = view.group.getObjectByName("mech-1")!;
    expect(upgraded).not.toBe(first);
    expect(upgraded.scale.y).toBeCloseTo(1.36, 6);
    // A trigger glows (emissive) and fades.
    view.onEvents([{ tick: 10, type: "mechanism", stage: "trigger", slot: 1, mech: "loi-phu-tru", level: 3, x: 0, z: 0 }], stageWorld());
    view.frame(stageWorld({ built: [[1, "loi-phu-tru", 3]] }), info);
    const body = upgraded.getObjectByName("body") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>;
    expect(body.material.emissive.r).toBeGreaterThan(0);
    view.frame(stageWorld(), info);
    expect(view.group.getObjectByName("mech-1")).toBeUndefined();
  });

  it("turns the rune ring urgent under 30 % Trận Lực, the Tâm nhãn dark when taken, a cracked Trận Trụ darker", () => {
    expect(heartColour(300, 1000, COLOURS.urgent)).toBe(STAGE_COLOURS.rune);
    expect(heartColour(299, 1000, COLOURS.urgent)).toBe(COLOURS.urgent);
    const view = createStageView(fakeRenderer(), stage);
    view.frame(stageWorld({ heart: 250, nodeOn: false, cracked: true }), info);
    expect(colourOf(view.group.getObjectByName("rune"))).toBe(COLOURS.urgent.toLowerCase());
    expect(colourOf(view.group.getObjectByName("node-tam-nhan"))).toBe(STAGE_COLOURS.nodeOff);
    expect(colourOf(view.group.getObjectByName("node-ring-tam-nhan"))).toBe(COLOURS.urgent.toLowerCase());
    const pillar = view.group.getObjectByName("pillar-west")!;
    expect(colourOf(pillar)).toBe(STAGE_COLOURS.pillarCracked);
    expect(pillar.rotation.z).not.toBe(0);
    view.frame(stageWorld(), info);
    expect(colourOf(view.group.getObjectByName("rune"))).toBe(STAGE_COLOURS.rune);
    expect(colourOf(view.group.getObjectByName("node-tam-nhan"))).toBe(STAGE_COLOURS.nodeOn);
  });
});

describe("the whole grey-box view (integration wiring)", () => {
  it("builds the scene parts in call order on one renderer and disposes them all", () => {
    const renderer = fakeRenderer();
    const calls: string[] = [];
    const hitFx = { spark: () => calls.push("spark"), update() {}, dispose: () => calls.push("hitfx-dispose") } as unknown as HitFx;
    const numbers = { show: () => calls.push("number"), update() {}, dispose() {} } as unknown as DamageNumbers;
    const smoke = { puff: () => calls.push("puff"), update() {}, dispose() {} } as unknown as InkSmoke;
    const swords = { capacity: 500, live: 0, volley: () => 0, update() {}, dispose() {} } as unknown as SwordPool;
    const view = createGreyBoxView(renderer, { fxDeps: { hitFx: () => hitFx, damageNumbers: () => numbers, inkSmoke: () => smoke, swords: () => swords } });
    expect(view.presenters).toEqual([view.stage, view.actors, view.player, view.telegraphs, view.fx]);
    expect(view.pickups).toBeNull();
    expect(view.fx.missing).toEqual([]);
    expect(view.worldDt(1 / 60, 1000)).toBeCloseTo(1 / 60, 9);
    expect(renderer.layers.ground.children.length + renderer.layers.actors.children.length + renderer.layers.fx.children.length).toBeGreaterThan(0);
    view.dispose();
    expect(calls).toContain("hitfx-dispose");
    expect(renderer.layers.ground.children).toHaveLength(0);
    expect(renderer.layers.actors.children).toHaveLength(0);
    expect(renderer.layers.fx.children).toHaveLength(0);
  });
});
