import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { COLOURS, CROWD_MODE, SIZES_PX_1080, TT_BUDGETS } from "../../src/content/rules";
import type { SpeciesId } from "../../src/content/types";
import { CLIP, CROWD_LOOKS, KIND, TINT, TINT_HEX, createCrowd, lodBlock, lookFromPlaceholder, selectKth, stepModeSwitch, triangleCount, type Crowd, type CrowdInstance, type ModeSwitchState } from "../../src/view/crowd";
import { MODE_SWITCH, type ImpostorAtlas } from "../../src/view/impostor";
import { fitCamera } from "../../src/view/renderer";
import type { Renderer3D } from "../../src/view/renderer";

const SPECIES: readonly SpeciesId[] = ["thach-thu", "phong-lang", "hoa-nha", "nham-vien", "thiet-giap-tru", "lang-dau-dan", "thiet-boi-lang-vuong"];

/** The renderer parts the crowd touches (no WebGL in node). */
function fakeRenderer(): Renderer3D {
  return { layers: { ground: new THREE.Group(), actors: new THREE.Group(), fx: new THREE.Group() } } as unknown as Renderer3D;
}

const instance = (over: Partial<CrowdInstance> = {}): CrowdInstance => ({ x: 0, y: 0, z: 0, heading: 0, clip: CLIP.move, clipTime: 0, flash: 0, squash: 1, dissolve: 0, tint: 0, size: 1, ...over });

/** The body mesh of a species layer. */
function body(crowd: Crowd, species: SpeciesId): THREE.InstancedMesh {
  const mesh = crowd.group.getObjectByName("crowd-" + species);
  if (!(mesh instanceof THREE.InstancedMesh)) throw new Error("no layer " + species);
  return mesh;
}

function positionOf(mesh: THREE.InstancedMesh, index: number): THREE.Vector3 {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(index, m);
  return new THREE.Vector3().setFromMatrixPosition(m);
}

describe("crowd modes (canon §20.3)", () => {
  it("builds 'procedural' on the renderer's actors layer; every tier draws procedural until HN0", () => {
    const renderer = fakeRenderer();
    const crowd = createCrowd(renderer, "procedural");
    expect(crowd.mode).toBe("procedural");
    expect(renderer.layers.actors.children).toContain(crowd.group);
    for (const q of ["low", "medium", "high", "ultra"] as const) expect(CROWD_MODE[q]).toBe("procedural");
    crowd.dispose();
    expect(renderer.layers.actors.children).not.toContain(crowd.group);
  });

  it("bones stays a type only (canon §20.3: not built at M0a)", () => {
    expect(() => createCrowd(fakeRenderer(), "bones")).toThrow(/type only/);
  });

  it("vat bakes the placeholder gait in the page and draws one VAT layer (and its hull) per species", () => {
    const crowd = createCrowd(fakeRenderer(), "vat", { capacity: 8, lodTris: 1000 });
    expect(crowd.mode).toBe("vat");
    crowd.add(1, "phong-lang");
    crowd.add(2, "hoa-nha");
    crowd.set(1, instance({ clip: CLIP.attack, clipTime: 0.3 }));
    crowd.update(1 / 60);
    const mesh = crowd.group.getObjectByName("crowd-vat-phong-lang") as THREE.InstancedMesh;
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(mesh.count).toBe(1);
    expect(mesh.geometry.getAttribute("aVatId")).toBeDefined();
    const anim = mesh.geometry.getAttribute("aVatAnim").array as Float32Array;
    // Clip and its time (Idle and Move loops carry the beast's own phase offset; Attack plays from 0).
    expect(anim[0]).toBe(CLIP.attack);
    expect(anim[1]).toBeCloseTo(0.3, 6);
    // A clip change blends from the previous clip (Move) over 0.15 s.
    expect(anim[2]).toBe(CLIP.move);
    expect((mesh.geometry.getAttribute("aVatBlend").array as Float32Array)[0]).toBeCloseTo(1 / 60 / 0.15, 5);
    expect(crowd.kinds()).toEqual({ procedural: 0, vat: 2, impostor: 0 });
    // Body + hull per layer in use, one for the shadows; triangles of the tier's block.
    expect(crowd.drawCalls()).toBe(2 * 2 + 1);
    expect(crowd.triangles()).toBe(2 * 972 * 2);
    // Both textures of each species' VAT count against the tier's texture budget.
    expect(crowd.textureBytes()).toBeGreaterThan(0);
    expect(crowd.textures().length).toBe(4);
    crowd.dispose();
  });

  it("impostor needs a WebGL renderer to bake, or a baked atlas", () => {
    expect(() => {
      const crowd = createCrowd(fakeRenderer(), "impostor");
      crowd.add(1, "phong-lang");
    }).toThrow(/WebGL renderer/);
    const crowd = createCrowd(fakeRenderer(), "impostor", { capacity: 4, impostor: () => fakeAtlas() });
    crowd.add(1, "phong-lang");
    crowd.set(1, instance({ x: 2, z: -3 }));
    crowd.update(1 / 60);
    expect(crowd.kinds()).toEqual({ procedural: 0, vat: 0, impostor: 1 });
    // A quad per beast, one draw call per layer, no hull (the ink is baked in).
    expect(crowd.triangles()).toBe(2);
    expect(crowd.drawCalls()).toBe(1 + 1);
    const imp = crowd.group.getObjectByName("crowd-imp-phong-lang") as THREE.InstancedMesh;
    // Fully faded in from the start.
    expect((imp.geometry.getAttribute("aImp").array as Float32Array)[1]).toBe(1);
    crowd.dispose();
  });

  it("the ladder moves a beast between VAT and impostor only after 1 s past the rule, then crossfades 0.2 s", () => {
    const crowd = createCrowd(fakeRenderer(), "vat", { capacity: 8, lodTris: 300, impostor: () => fakeAtlas() });
    crowd.add(1, "thach-thu");
    crowd.add(2, "phong-lang");
    crowd.set(1, instance());
    crowd.set(2, instance());
    crowd.update(1 / 60);
    expect(crowd.kinds()).toEqual({ procedural: 0, vat: 2, impostor: 0 });
    // L3: the swarm goes to impostors.
    crowd.setImpostorRule({ kind: "swarm" });
    const dt = 0.05;
    let frames = 0;
    while (crowd.kinds().impostor === 0 && frames < 100) {
      crowd.update(dt);
      frames += 1;
    }
    expect(frames * dt).toBeCloseTo(1, 1);
    // Crossfading: drawn in both kinds, complementary fades.
    expect(crowd.kinds()).toEqual({ procedural: 0, vat: 2, impostor: 1 });
    for (let k = 0; k < 4; k += 1) crowd.update(dt);
    expect(crowd.kinds()).toEqual({ procedural: 0, vat: 1, impostor: 1 });
    // L5 with an elite: plain beasts go, the elite stays on VAT.
    crowd.set(2, instance({ elite: true }));
    crowd.setImpostorRule({ kind: "plain" });
    for (let k = 0; k < 40; k += 1) crowd.update(dt);
    expect(crowd.kinds()).toEqual({ procedural: 0, vat: 1, impostor: 1 });
    crowd.dispose();
  });
});

describe("ladder L4 (canon §20.3): plain beasts beyond the nearest `keep` to the screen centre", () => {
  it("selectKth finds the k-th smallest in place", () => {
    const values = new Float32Array([5, 1, 4, 2, 3, 9, 9]);
    expect(selectKth(values, 5, 0)).toBe(1);
    expect(selectKth(values, 5, 2)).toBe(3);
    expect(selectKth(new Float32Array([5, 1, 4, 2, 3]), 5, 4)).toBe(5);
  });

  it("keeps the nearest on VAT and sends the rest to impostors after the hold", () => {
    // No camera in node: the crowd ranks by ground distance from the heart instead.
    const crowd = createCrowd(fakeRenderer(), "vat", { capacity: 8, lodTris: 300, impostor: () => fakeAtlas(), impostorRule: { kind: "far", keep: 3 } });
    for (let id = 1; id <= 6; id += 1) {
      crowd.add(id, "phong-lang");
      crowd.set(id, instance({ x: id * 2 }));
    }
    crowd.update(0.02);
    // Fresh beasts take their kind at once.
    expect(crowd.kinds()).toEqual({ procedural: 0, vat: 3, impostor: 3 });
    // Beast 6 walks to the middle: it goes back to VAT after 1 s; beast 3 (now 4th nearest) leaves.
    crowd.set(6, instance({ x: 0.5 }));
    for (let k = 0; k < 40; k += 1) crowd.update(0.05);
    expect(crowd.kinds()).toEqual({ procedural: 0, vat: 3, impostor: 3 });
    const vat = crowd.group.getObjectByName("crowd-vat-phong-lang") as THREE.InstancedMesh;
    const xs: number[] = [];
    for (let k = 0; k < vat.count; k += 1) xs.push(positionOf(vat, k).x);
    expect(xs.sort((a, b) => a - b)).toEqual([0.5, 2, 4]);
    crowd.dispose();
  });
});

/** An atlas stand-in (no WebGL in node): a 1 × 1 texture, 16 × 8 cells. */
function fakeAtlas(): ImpostorAtlas {
  const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  return { texture, directions: 16, phases: 8, cellPx: 128, frameM: 1.5, centreY: 0.5, cycleS: 0.6, bytes: 4, source: "test", dispose: () => texture.dispose() };
}

describe("draw-kind switch (canon §20.3 L4: 1 s on the other side, 0.2 s blend)", () => {
  it("waits 1 s without a break, then fades over 0.2 s; a reversal mid-blend turns the fade round", () => {
    const state: ModeSwitchState = { mode: KIND.vat, fade: 1, pending: 0 };
    expect(MODE_SWITCH).toEqual({ holdS: 1, blendS: 0.2 });
    stepModeSwitch(state, KIND.impostor, 0.5);
    expect(state).toEqual({ mode: KIND.vat, fade: 1, pending: 0.5 });
    // A break resets the wait.
    stepModeSwitch(state, KIND.vat, 0.1);
    expect(state.pending).toBe(0);
    stepModeSwitch(state, KIND.impostor, 0.6);
    stepModeSwitch(state, KIND.impostor, 0.4);
    expect(state.mode).toBe(KIND.impostor);
    // A long frame finishes the 0.2 s blend at once.
    expect(state.fade).toBe(1);
    const fresh: ModeSwitchState = { mode: KIND.vat, fade: 1, pending: 0 };
    stepModeSwitch(fresh, KIND.impostor, 1);
    // Switched this frame: the fade starts from 0 and takes its first step.
    expect(fresh.mode).toBe(KIND.impostor);
    expect(fresh.fade).toBe(1);
    const mid: ModeSwitchState = { mode: KIND.impostor, fade: 0.25, pending: 0 };
    stepModeSwitch(mid, KIND.vat, 1);
    // Back towards VAT from where it stood (0.75 of the way still VAT), then a step.
    expect(mid.mode).toBe(KIND.vat);
    expect(mid.fade).toBe(1);
    const slow: ModeSwitchState = { mode: KIND.impostor, fade: 0.25, pending: 0.99 };
    stepModeSwitch(slow, KIND.vat, 0.02);
    expect(slow.mode).toBe(KIND.vat);
    expect(slow.fade).toBeCloseTo(0.75 + 0.02 / 0.2, 5);
  });
});

describe("crowd instances", () => {
  it("adds, sets, swaps on remove and keeps the others where they were", () => {
    const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: 8 });
    for (let id = 1; id <= 3; id += 1) {
      expect(crowd.add(id, "phong-lang")).toBe(true);
      crowd.set(id, instance({ x: id, z: -id }));
    }
    expect(crowd.size).toBe(3);
    expect(crowd.instances("phong-lang")).toBe(3);
    crowd.remove(1);
    crowd.update(1 / 60);
    expect(crowd.has(1)).toBe(false);
    expect(crowd.size).toBe(2);
    const mesh = body(crowd, "phong-lang");
    expect(mesh.count).toBe(2);
    const xs = [positionOf(mesh, 0).x, positionOf(mesh, 1).x].sort();
    expect(xs).toEqual([2, 3]);
    // Setting a moved id writes its new slot.
    crowd.set(3, instance({ x: 7 }));
    expect([positionOf(mesh, 0).x, positionOf(mesh, 1).x].sort()).toEqual([2, 7]);
    crowd.dispose();
  });

  it("re-adding an id replaces it; a full layer says no", () => {
    const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: 2 });
    expect(crowd.add(5, "phong-lang")).toBe(true);
    expect(crowd.add(5, "hoa-nha")).toBe(true);
    expect(crowd.size).toBe(1);
    expect(crowd.instances("phong-lang")).toBe(0);
    expect(crowd.instances("hoa-nha")).toBe(1);
    expect(crowd.add(6, "hoa-nha")).toBe(true);
    expect(crowd.add(7, "hoa-nha")).toBe(false);
    expect(crowd.size).toBe(2);
    crowd.dispose();
  });

  it("writes flash, dissolve, tint, clip and the clip's stride into the instance attributes", () => {
    const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: 4 });
    crowd.add(1, "nham-vien");
    crowd.set(1, instance({ flash: 0.5, dissolve: 0.25, tint: TINT.slow, clip: CLIP.attack, clipTime: 0.2 }));
    const geometry = body(crowd, "nham-vien").geometry;
    const state = geometry.getAttribute("aState").array as Float32Array;
    const anim = geometry.getAttribute("aAnim").array as Float32Array;
    const look = geometry.getAttribute("aLook").array as Float32Array;
    expect([...state.slice(0, 4)]).toEqual([0.5, 0.25, TINT.slow, expect.closeTo(0.85, 5)]);
    expect(anim[0]).toBe(1); // biped gait id
    expect(anim[2]).toBeCloseTo(0.4, 6); // attack stride
    expect(anim[3]).toBeCloseTo(0.2, 6);
    expect(look[2]).toBe(CLIP.attack);
    crowd.set(1, instance({ clip: CLIP.idle }));
    expect(anim[2]).toBeCloseTo(0.12, 6);
    crowd.set(1, instance({ clip: CLIP.move }));
    expect(anim[2]).toBe(1);
    crowd.dispose();
  });

  it("scales the drawn size and squash on the look", () => {
    const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: 2 });
    crowd.add(1, "thiet-giap-tru");
    crowd.set(1, instance({ size: 1.25 }));
    const m = new THREE.Matrix4();
    body(crowd, "thiet-giap-tru").getMatrixAt(0, m);
    const scale = new THREE.Vector3();
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    const [w, h, l] = CROWD_LOOKS["thiet-giap-tru"].sizeM;
    expect(scale.x).toBeCloseTo(w * 1.25, 5);
    expect(scale.y).toBeCloseTo(h * 1.25, 5);
    expect(scale.z).toBeCloseTo(l * 1.25, 5);
    crowd.dispose();
  });

  it("writes the instance matrix Matrix4.compose would (yaw, squash, size, hover, knock-back)", () => {
    const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: 2 });
    crowd.add(1, "hoa-nha");
    const state = instance({ x: 3.5, y: 0.2, z: -7.25, heading: 2.1, squash: 0.93, size: 1.25, dissolve: 0.4, knockX: 0.11, knockZ: -0.05 });
    crowd.set(1, state);
    const look = CROWD_LOOKS["hoa-nha"];
    const size = 1.25 * (1 - 0.4 * 0.25);
    const expected = new THREE.Matrix4().compose(
      new THREE.Vector3(3.5 + 0.11, 0.2 + look.hoverM - 0.4 * 0.25, -7.25 - 0.05),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 2.1),
      new THREE.Vector3(look.sizeM[0] * (2 - 0.93) * size, look.sizeM[1] * 0.93 * size, look.sizeM[2] * (2 - 0.93) * size),
    );
    const got = new THREE.Matrix4();
    body(crowd, "hoa-nha").getMatrixAt(0, got);
    got.elements.forEach((value, k) => expect(value, "element " + k).toBeCloseTo(expected.elements[k]!, 5));
    crowd.dispose();
  });

  it("counts its draw calls (body + outline per layer in use, one for all shadows) and the outline toggle", () => {
    const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: 4 });
    expect(crowd.drawCalls()).toBe(0);
    crowd.add(1, "phong-lang");
    crowd.add(2, "hoa-nha");
    crowd.prepare("nham-vien");
    expect(crowd.drawCalls()).toBe(2 * 2 + 1);
    crowd.setOutlines(false);
    expect(crowd.drawCalls()).toBe(2 + 1);
    expect(crowd.group.getObjectByName("crowd-outline-hoa-nha")?.visible).toBe(false);
    crowd.dispose();
  });

  it("draws one ground mark per walker, a spot and a tether per flyer, and the swarm rings", () => {
    const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: 4 });
    crowd.add(1, "phong-lang");
    crowd.add(2, "hoa-nha");
    crowd.set(1, instance());
    crowd.set(2, instance());
    crowd.setRings([{ x: 0, y: 0, z: 0, radius: 1.3, colour: "#9a8c73", alpha: 0.8 }]);
    crowd.update(1 / 60);
    const shadows = crowd.group.getObjectByName("crowd-shadows") as THREE.Mesh<THREE.InstancedBufferGeometry>;
    expect(shadows.geometry.instanceCount).toBe(1 + 2 + 1);
    // The ring (last mark) carries its colour, parsed once and reused frame after frame.
    const ring = new THREE.Color("#9a8c73");
    const colours = shadows.geometry.getAttribute("iColor").array as Float32Array;
    expect([colours[9], colours[10], colours[11]]).toEqual([expect.closeTo(ring.r, 5), expect.closeTo(ring.g, 5), expect.closeTo(ring.b, 5)]);
    for (let frame = 0; frame < 10; frame += 1) crowd.update(1 / 60);
    expect((crowd as unknown as { ringColours: Map<string, THREE.Color> }).ringColours.size).toBe(1);
    crowd.dispose();
  });

  it("reuses its records: add/remove churn does not grow them (no allocation per frame)", () => {
    const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: 64 });
    for (let id = 0; id < 40; id += 1) crowd.add(id, SPECIES[id % 5]!);
    const internals = crowd as unknown as { pool: unknown[]; liveList: unknown[] };
    const records = () => internals.pool.length + internals.liveList.length;
    const before = records();
    for (let round = 0; round < 1000; round += 1) {
      const id = round % 40;
      crowd.remove(id);
      crowd.add(id, SPECIES[(id + round) % 5]!);
      crowd.set(id, instance({ x: round % 7 }));
      crowd.update(1 / 60);
    }
    expect(records()).toBe(before);
    expect(crowd.size).toBe(40);
    crowd.dispose();
  });

  it("subdivides the bench block to the tier's LOD triangles (canon §20.2)", () => {
    for (const q of ["low", "medium", "high"] as const) {
      const tris = TT_BUDGETS[q].lodTris;
      const count = triangleCount(lodBlock(tris));
      expect(count).toBeLessThanOrEqual(tris);
      expect(count).toBeGreaterThanOrEqual(tris * 0.85);
    }
    const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: 4, lodTris: 1000 });
    crowd.add(1, "phong-lang");
    crowd.add(2, "phong-lang");
    expect(crowd.triangles()).toBe(2 * 972 * 2);
    crowd.dispose();
  });
});

describe("grey-box looks (canon §10.9, §21.1, D27)", () => {
  it("one look per species, the gait of its family", () => {
    expect(Object.keys(CROWD_LOOKS).sort()).toEqual([...SPECIES].sort());
    expect(CROWD_LOOKS["thach-thu"].gait).toBe("swarm");
    expect(CROWD_LOOKS["hoa-nha"].gait).toBe("flyer");
    expect(CROWD_LOOKS["hoa-nha"].hoverM).toBeGreaterThan(1);
    expect(CROWD_LOOKS["nham-vien"].gait).toBe("biped");
    for (const s of ["phong-lang", "thiet-giap-tru", "lang-dau-dan", "thiet-boi-lang-vuong"] as const) expect(CROWD_LOOKS[s].gait).toBe("quadruped");
    // Biped tall, quadruped long and low.
    const [, bh, bl] = CROWD_LOOKS["nham-vien"].sizeM;
    expect(bh).toBeGreaterThan(bl);
    const [, qh, ql] = CROWD_LOOKS["phong-lang"].sizeM;
    expect(ql).toBeGreaterThan(qh);
  });

  it("never uses a semantic colour of the kit; tints neither", () => {
    const semantic = Object.values(COLOURS).map((c) => c.toLowerCase());
    const colours = SPECIES.map((s) => CROWD_LOOKS[s].colour.toLowerCase());
    for (const c of [...colours, ...TINT_HEX.map((t) => t.toLowerCase())]) expect(semantic).not.toContain(c);
    // The five chapter-1 families read apart by colour (shape first, colour second).
    expect(new Set(colours.slice(0, 5)).size).toBe(5);
  });

  /** Screen height in px at 1920 × 1080 of a look standing at (x, z), with its hover. */
  function pxHeight(species: SpeciesId, x: number, z: number, size = 1): number {
    const camera = new THREE.PerspectiveCamera();
    fitCamera(camera, 1920 / 1080);
    const look = CROWD_LOOKS[species];
    const [w, h, l] = look.sizeM.map((v) => v * size) as [number, number, number];
    const v = new THREE.Vector3();
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 8; i += 1) {
      v.set(x + (i & 1 ? w / 2 : -w / 2), look.hoverM + (i & 2 ? h : 0), z + (i & 4 ? l / 2 : -l / 2)).project(camera);
      const y = (-v.y * 0.5 + 0.5) * 1080;
      min = Math.min(min, y);
      max = Math.max(max, y);
    }
    return max - min;
  }

  it("meets the 1080p sizes of canon §21.1 at the far gates, the smallest place on screen", () => {
    const tier: Record<SpeciesId, keyof typeof SIZES_PX_1080> = {
      "thach-thu": "swarm",
      "phong-lang": "small",
      "hoa-nha": "small",
      "nham-vien": "medium",
      "thiet-giap-tru": "medium",
      "lang-dau-dan": "general",
      "thiet-boi-lang-vuong": "boss",
    };
    for (const species of SPECIES) {
      // Ground beasts at gate A (−15; −18); flyers at the sky entry (−20; −18).
      const x = CROWD_LOOKS[species].gait === "flyer" ? -20 : -15;
      expect(pxHeight(species, x, -18), species).toBeGreaterThanOrEqual(SIZES_PX_1080[tier[species]]);
    }
  });

  it("maps a content placeholder (mm) to a look (m)", () => {
    const look = lookFromPlaceholder({ gait: "flyer", colour: "#8c4a3e", heightMm: 550, lengthMm: 1200, widthMm: 1800 });
    expect(look.sizeM).toEqual([1.8, 0.55, 1.2]);
    expect(look.hoverM).toBeGreaterThan(1);
    expect(lookFromPlaceholder({ gait: "biped", colour: "#000000", heightMm: 2000, lengthMm: 900, widthMm: 1000 }).shape).toBe("capsule");
  });
});
