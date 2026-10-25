import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BEAST_LOD_TRIS, IC_MODEL_CONTRACTS, checkModel, missingClips, missingSockets } from "../../src/content/model-contracts";
import { TT_BUDGETS } from "../../src/content/rules";
import { WALKER_BLEND, WALKER_CLIPS, createWalker } from "../../src/view/walker-rig";
import { RIG_TRIS, buildPlaceholderRig, skinnedRoles } from "../../src/view/bench/rigs";

const step = (update: (dt: number) => void, seconds: number, dt = 1 / 60): void => {
  for (let t = 0; t < seconds - 1e-9; t += dt) update(dt);
};

describe("walker rig (canon §21.2, D44: idle | run | dash, no flight)", () => {
  it("starts on Idle and cross-fades the loops in 0.3 s", () => {
    const rig = buildPlaceholderRig("cultivator");
    const walker = createWalker(rig.object, rig.clips);
    expect(walker.weight("idle")).toBe(1);
    expect(walker.weight("run")).toBe(0);
    walker.setLocomotion("run");
    step((dt) => walker.update(dt), WALKER_BLEND.loopS / 2);
    expect(walker.weight("run")).toBeCloseTo(0.5, 1);
    expect(walker.weight("idle")).toBeCloseTo(0.5, 1);
    step((dt) => walker.update(dt), WALKER_BLEND.loopS);
    expect(walker.weight("run")).toBe(1);
    expect(walker.weight("idle")).toBe(0);
    walker.setLocomotion("dash");
    step((dt) => walker.update(dt), 1);
    expect(walker.weight("dash")).toBe(1);
    expect(walker.locomotion).toBe("dash");
    walker.dispose();
  });

  it("plays one-shots over the loops (fade in, out at the end) and finds clips by the contract's names", () => {
    const rig = buildPlaceholderRig("cultivator");
    const walker = createWalker(rig.object, rig.clips);
    expect(walker.clipNames).toEqual(expect.arrayContaining(["Idle", "Run", "Dash", "Cast_Short", "Hit"]));
    const seconds = walker.play("Cast_Short");
    expect(seconds).toBeCloseTo(0.6, 6);
    expect(walker.play("Victory")).toBe(0);
    // While the cast plays, the loops give up their share; after it, Idle is whole again.
    const chest = rig.object.getObjectByName("Chest")!;
    const rest = chest.quaternion.clone();
    step((dt) => walker.update(dt), 0.3);
    expect(chest.quaternion.angleTo(rest)).toBeGreaterThan(0.05);
    step((dt) => walker.update(dt), 1.5);
    expect(walker.weight("idle")).toBe(1);
    expect(walker.socket("FX_CAST_R")).not.toBeNull();
    expect(walker.socket("FX_NOPE")).toBeNull();
    walker.dispose();
  });

  it("an extra loop name list or rate is taken; a dash without a Dash clip runs the run clip faster", () => {
    const rig = buildPlaceholderRig("general");
    const walker = createWalker(rig.object, rig.clips);
    // Quadrupeds have Move, not Run: the loop lists fall back (canon §21.3 clip names).
    expect(WALKER_CLIPS.run).toContain("Move");
    walker.setLocomotion("run");
    step((dt) => walker.update(dt), 0.5);
    expect(walker.weight("run")).toBe(1);
    // Run and dash both play Move, each with its own action (dash 1.6 × faster).
    const mixer = (walker as unknown as { mixer: THREE.AnimationMixer }).mixer;
    const loops = (walker as unknown as { loops: { action: THREE.AnimationAction }[] }).loops;
    expect(loops[1]!.action).not.toBe(loops[2]!.action);
    expect(loops[1]!.action.getEffectiveTimeScale()).toBe(1);
    expect(loops[2]!.action.getEffectiveTimeScale()).toBeCloseTo(1.6, 6);
    expect(loops[1]!.action.getEffectiveWeight()).toBeCloseTo(1, 6);
    expect(loops[2]!.action.getEffectiveWeight()).toBe(0);
    expect(mixer).toBeDefined();
    walker.dispose();
  });
});

describe("placeholder rigs of case E (canon §20.3, PB-21, PB-34)", () => {
  it("person 15 000 triangles, Vương 45 000, with their bones counted", () => {
    for (const kind of ["cultivator", "general", "boss"] as const) {
      const rig = buildPlaceholderRig(kind);
      expect(rig.triangles, kind).toBeLessThanOrEqual(RIG_TRIS[kind]);
      expect(rig.triangles, kind).toBeGreaterThanOrEqual(RIG_TRIS[kind] * 0.9);
      expect(rig.bones).toBeGreaterThanOrEqual(20);
      const walker = createWalker(rig.object, rig.clips);
      expect(walker.bones).toBe(rig.bones);
      // The ink hull draws the body again on the same skeleton.
      expect(walker.triangles).toBe(rig.triangles * 2);
      const meshes: THREE.SkinnedMesh[] = [];
      rig.object.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
      });
      expect(meshes.length).toBe(2);
      expect(meshes[0]!.skeleton).toBe(meshes[1]!.skeleton);
      walker.dispose();
    }
  });

  it("meets the local model contracts it stands in for", () => {
    const facts = (kind: "cultivator" | "general" | "boss") => {
      const rig = buildPlaceholderRig(kind);
      const sockets: string[] = [];
      rig.object.traverse((o) => {
        if (o.name.startsWith("FX_")) sockets.push(o.name);
      });
      return { triangles: rig.triangles, clips: rig.clips.map((c) => c.name), sockets };
    };
    expect(checkModel("cultivators", facts("cultivator"))).toEqual([]);
    expect(checkModel("beast-kings", facts("boss"))).toEqual([]);
    expect(checkModel("beast-kings", facts("general"))).toEqual([]);
  });

  it("case E draws the tier's SkinnedMesh cap: the player, 2 bots, a general, the Vương, then spares", () => {
    expect(skinnedRoles(TT_BUDGETS.low.skinnedMax)).toEqual(["cultivator", "cultivator", "cultivator", "general", "boss", "cultivator"]);
    expect(skinnedRoles(TT_BUDGETS.high.skinnedMax).length).toBe(8);
    expect(skinnedRoles(10).length).toBe(10);
    expect(skinnedRoles(2)).toEqual(["cultivator", "cultivator"]);
  });
});

describe("local model contracts (canon §21.2, D44)", () => {
  it("cultivators, beasts, beast-kings with the canon's clips and triangle ranges", () => {
    expect(IC_MODEL_CONTRACTS.cultivators.clips).toEqual(["Idle", "Run", "Cast_Short", "Hit"]);
    expect([IC_MODEL_CONTRACTS.cultivators.minTris, IC_MODEL_CONTRACTS.cultivators.maxTris]).toEqual([8000, 30_000]);
    expect(IC_MODEL_CONTRACTS.beasts.clips).toEqual(["Idle", "Move", "Attack", "Death"]);
    expect([IC_MODEL_CONTRACTS.beasts.minTris, IC_MODEL_CONTRACTS.beasts.maxTris]).toEqual([800, 3000]);
    expect([IC_MODEL_CONTRACTS["beast-kings"].minTris, IC_MODEL_CONTRACTS["beast-kings"].maxTris]).toEqual([12_000, 45_000]);
    expect([IC_MODEL_CONTRACTS["beast-kings"].minClips, IC_MODEL_CONTRACTS["beast-kings"].maxClips]).toEqual([8, 10]);
    expect(IC_MODEL_CONTRACTS.beasts.draw).toBe("vat");
    // The beast LOD per tier is canon §20.2's crowd triangles.
    for (const q of ["low", "medium", "high", "ultra"] as const) expect(BEAST_LOD_TRIS[q]).toBe(TT_BUDGETS[q].lodTris);
  });

  it("names every way a model breaks its contract", () => {
    expect(missingClips(IC_MODEL_CONTRACTS.beasts, ["Idle", "Move_V2", "Death"])).toEqual(["Attack"]);
    expect(missingSockets(IC_MODEL_CONTRACTS.cultivators, ["FX_CORE"])).toEqual(["FX_CAST_R", "FX_BACK"]);
    const problems = checkModel("beasts", { triangles: 5000, clips: ["Idle", "Move", "Attack", "Death"], sockets: [] });
    expect(problems).toEqual(["triangles 5000 outside 800–3000"]);
    expect(checkModel("beasts", { triangles: 1500, clips: ["Idle", "Move", "Attack", "Death"], sockets: [] })).toEqual([]);
    // A flying hero's clips (the kit's Hero_*) are not a walking cultivator.
    expect(checkModel("cultivators", { triangles: 30_000, clips: ["Hero_Fly", "Hero_Idle_Hover", "Hero_Cast", "Hero_Hit"], sockets: ["FX_CORE", "FX_CAST_R"] })).toEqual(
      expect.arrayContaining(["missing clip Run", "missing clip Cast_Short", "missing socket FX_BACK"]),
    );
  });
});
