import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { FrameInfo } from "../../src/app/contracts";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { ELITES, GENERAL, SIZES_PX_1080 } from "../../src/content/rules";
import type { BeastState, LocalState, SimEvent, SpeciesId, World } from "../../src/content/types";
import { quyetBand } from "../../src/ui/screen-zones";
import { clipOf, createActors, drawnLift, drawSize, FLY_DRAW_M, layerOf, strideOf, tintMixOf, tintOf, type Point3 } from "../../src/view/actors";
import { CLIP, CROWD_LOOKS, TINT } from "../../src/view/crowd";
import { PLAYER_LOOK } from "../../src/view/player-view";
import { fitCamera, VIEW, type Renderer3D } from "../../src/view/renderer";

/** canon §10.3–10.5, §10.9, §21.1, D48: beasts through Lane 1's crowd, sizes and frame at 1080p. */

const M = 60_000;

function fakeRenderer(): Renderer3D {
  return { layers: { ground: new THREE.Group(), actors: new THREE.Group(), fx: new THREE.Group() } } as unknown as Renderer3D;
}

function beast(slot: number, over: Partial<BeastState> = {}): BeastState {
  return {
    slot,
    serial: slot + 100,
    alive: true,
    freed: false,
    species: "phong-lang",
    tier: "small",
    elite: null,
    general: false,
    boss: false,
    cluster: -1,
    x: 0,
    z: -10 * M,
    y: 0,
    mode: "walk",
    seal: -1,
    posture: null,
    hardUntil: -1,
    slows: [],
    ...over,
  } as BeastState;
}

const world = (tick: number, list: BeastState[]): World => ({ tick, beasts: { list } }) as unknown as World;
const info = (dt: number, alpha = 0, now = 0): FrameInfo => ({ dt, worldDt: dt, alpha, now, local: {} as LocalState });

describe("beast look rules", () => {
  it("plays Move while walking, Attack while biting, throwing, diving or capturing, else Idle", () => {
    expect(clipOf("walk")).toBe(CLIP.move);
    for (const mode of ["bite", "throw", "dive", "capture"] as const) expect(clipOf(mode)).toBe(CLIP.attack);
    for (const mode of ["hold", "stunned", "downed", "roar"] as const) expect(clipOf(mode)).toBe(CLIP.idle);
    expect(strideOf("walk")).toBe(1);
    expect(strideOf("stunned")).toBe(0);
    expect(strideOf("ram")).toBeGreaterThan(1);
  });

  it("tints the strongest status first: Ấn, phá thế, held, slowed, elite, the general's aura", () => {
    const b = beast(0, { elite: "cuong", general: false });
    expect(tintOf(b, 100)).toBe(TINT.elite);
    b.slows.push({ source: "barrier", pct: 15, until: 200 });
    expect(tintOf(b, 100)).toBe(TINT.slow);
    expect(tintOf(b, 250)).toBe(TINT.elite);
    b.hardUntil = 300;
    expect(tintOf(b, 100)).toBe(TINT.held);
    b.posture = { value: 0, max: 40, brokenUntil: 400, immuneUntil: 900 };
    expect(tintOf(b, 100)).toBe(TINT.broken);
    b.seal = 3;
    expect(tintOf(b, 100)).toBe(TINT.seal);
    expect(tintOf(beast(1, { general: true }), 0)).toBe(TINT.aura);
    expect(tintMixOf(TINT.none)).toBe(0);
    expect(tintMixOf(TINT.seal)).toBeGreaterThan(tintMixOf(TINT.elite));
  });

  it("draws the thú tướng on its family's layer × GENERAL.sizePm and elites × ELITES.sizePm (canon §10.3, §10.4, §21.2)", () => {
    expect(layerOf("lang-dau-dan")).toBe("phong-lang");
    expect(layerOf("thiet-boi-lang-vuong")).toBe("thiet-boi-lang-vuong");
    expect(layerOf("thach-thu")).toBe("thach-thu");
    expect(drawSize({ elite: "cuong", general: false })).toBe(ELITES.sizePm / 1000);
    expect(drawSize({ elite: null, general: true })).toBe(GENERAL.sizePm / 1000);
    expect(drawSize({ elite: null, general: false })).toBe(1);
  });

  it("draws flyers lower than the sim's flight height, never above the camera's headroom", () => {
    expect(FLY_DRAW_M + CROWD_LOOKS["hoa-nha"].sizeM[1]).toBeLessThanOrEqual(VIEW.headroomM + 1e-9);
    expect(drawnLift(4)).toBeCloseTo(FLY_DRAW_M, 9);
    expect(drawnLift(2)).toBeCloseTo(FLY_DRAW_M / 2, 9);
    expect(drawnLift(0)).toBe(0);
    expect(drawnLift(9)).toBe(FLY_DRAW_M);
  });
});

describe("the actors view", () => {
  it("adds every live beast to the crowd, interpolates between ticks and locates it", () => {
    const renderer = fakeRenderer();
    const actors = createActors(renderer, { capacity: 64 });
    const wolf = beast(0, { x: 0, z: -10 * M });
    const general = beast(1, { species: "lang-dau-dan", general: true, tier: "general", x: 6 * M, z: -12 * M });
    const crow = beast(2, { species: "hoa-nha", x: -20 * M, z: -18 * M, y: 4 * M });
    const list = [wolf, general, crow];
    actors.frame(world(10, list), info(1 / 60));
    expect(actors.drawn).toBe(3);
    expect(actors.crowd.instances("phong-lang")).toBe(2);
    expect(actors.crowd.instances("hoa-nha")).toBe(1);
    wolf.x = 1 * M;
    actors.frame(world(11, list), info(1 / 60, 0.5));
    const p: Point3 = { x: 0, y: 0, z: 0 };
    expect(actors.locate(0, 100, "base", p)).toBe(true);
    expect(p.x).toBeCloseTo(0.5, 9);
    expect(p.z).toBeCloseTo(-10, 9);
    expect(p.y).toBe(0);
    // A flyer's body sits at the drawn flight height.
    expect(actors.locate(2, 102, "center", p)).toBe(true);
    expect(p.y).toBeCloseTo(FLY_DRAW_M + CROWD_LOOKS["hoa-nha"].sizeM[1] / 2, 9);
    // A reused slot with a new serial is another beast.
    expect(actors.locate(0, 999, "base", p)).toBe(false);
    actors.dispose();
    expect(renderer.layers.actors.children).toHaveLength(0);
  });

  it("draws a body entering at a sky corner or a gate just inside the field (canon D48), the sim position untouched", () => {
    const actors = createActors(fakeRenderer(), { capacity: 8 });
    const crow = beast(0, { species: "hoa-nha", x: -20 * M, z: -18 * M, y: 4 * M });
    const king = beast(1, { species: "thiet-boi-lang-vuong", tier: "boss", boss: true, x: -15 * M, z: -18 * M });
    actors.frame({ tick: 1, stage: THANH_THACH_AI, beasts: { list: [crow, king] } } as unknown as World, info(1 / 60));
    const p: Point3 = { x: 0, y: 0, z: 0 };
    actors.locate(0, 100, "base", p);
    const crowReach = Math.hypot(CROWD_LOOKS["hoa-nha"].sizeM[0], CROWD_LOOKS["hoa-nha"].sizeM[2]) / 2;
    expect(p.x).toBeCloseTo(-20 + crowReach, 9);
    expect(p.z).toBeCloseTo(-18 + crowReach, 9);
    actors.locate(1, 101, "base", p);
    const kingReach = Math.hypot(CROWD_LOOKS["thiet-boi-lang-vuong"].sizeM[0], CROWD_LOOKS["thiet-boi-lang-vuong"].sizeM[2]) / 2;
    expect(p.x).toBe(-15);
    // Taller than the headroom: further in by the excess height over tan(tilt).
    const excess = (CROWD_LOOKS["thiet-boi-lang-vuong"].sizeM[1] - VIEW.headroomM) / Math.tan((VIEW.tiltDeg * Math.PI) / 180);
    expect(p.z).toBeCloseTo(-18 + kingReach + Math.max(0, excess), 9);
    expect(crow.x).toBe(-20 * M);
    // The Vương's whole body at its entry is in frame with the Bàn Quyết band below, whichever way it faces (1080p).
    const camera = gameCamera(1920, 1080);
    const [w, h, l] = CROWD_LOOKS["thiet-boi-lang-vuong"].sizeM;
    const v = new THREE.Vector3();
    for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 8) {
      for (let i = 0; i < 8; i += 1) {
        const a = i & 1 ? w / 2 : -w / 2;
        const b = i & 4 ? l / 2 : -l / 2;
        v.set(p.x + a * Math.cos(yaw) + b * Math.sin(yaw), i & 2 ? h : 0, p.z - a * Math.sin(yaw) + b * Math.cos(yaw)).project(camera);
        expect(v.y, "yaw " + yaw.toFixed(2)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("dissolves a dead beast where it fell, and fades one that left without a death", () => {
    const actors = createActors(fakeRenderer(), { capacity: 16 });
    const a = beast(0);
    const b = beast(1, { x: 3 * M });
    actors.frame(world(1, [a, b]), info(1 / 60));
    expect(actors.drawn).toBe(2);
    a.alive = false;
    b.alive = false;
    b.freed = true;
    const death: SimEvent = { tick: 2, type: "death", beast: { slot: 0, serial: 100 }, species: "phong-lang", by: "slot1", x: 0, z: -10, cluster: -1, clusterDone: false, tier: 2 };
    actors.onEvents([death], world(2, [a, b]));
    actors.frame(world(2, [a, b]), info(1 / 60));
    expect(actors.drawn).toBe(2);
    for (let k = 0; k < 40; k += 1) actors.frame(world(3 + k, [a, b]), info(1 / 60));
    expect(actors.drawn).toBe(0);
    expect(actors.crowd.size).toBe(0);
  });

  it("holds 300 live beasts like the bench (canon §20.3)", () => {
    const actors = createActors(fakeRenderer());
    const species: SpeciesId[] = ["thach-thu", "phong-lang", "hoa-nha", "nham-vien", "thiet-giap-tru"];
    const list = Array.from({ length: 300 }, (_, k) => beast(k, { species: species[k % 5]!, x: ((k % 30) - 15) * M, z: -Math.floor(k / 30) * M, cluster: k % 5 === 0 ? Math.floor(k / 35) : -1 }));
    actors.frame(world(1, list), info(1 / 60));
    expect(actors.drawn).toBe(300);
    expect(actors.crowd.size).toBe(300);
    for (let k = 0; k < 5; k += 1) actors.frame(world(2 + k, list), info(1 / 60));
    expect(actors.drawn).toBe(300);
  });
});

/** Screen height in 1080p px of a box (width, height, length in m) standing at (x, z) with `lift`, under the fitted camera. */
function pxHeight(camera: THREE.PerspectiveCamera, w: number, h: number, l: number, x: number, z: number, lift = 0): number {
  const v = new THREE.Vector3();
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 8; i += 1) {
    v.set(x + (i & 1 ? w / 2 : -w / 2), lift + (i & 2 ? h : 0), z + (i & 4 ? l / 2 : -l / 2)).project(camera);
    const y = (-v.y * 0.5 + 0.5) * 1080;
    min = Math.min(min, y);
    max = Math.max(max, y);
  }
  return max - min;
}

/** The fixed camera for a view with the Bàn Quyết band kept clear below (screen-zones.ts viewInsets). */
function gameCamera(width: number, height: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera();
  fitCamera(camera, width / height, { insetBottom: quyetBand(width, height) / height });
  return camera;
}

describe("sizes and frame on screen (canon §21.1, D48)", () => {
  it("meets the 1080p minimums at the far edge with the Bàn Quyết band below: player 64, general 80, elites × 1.25", () => {
    const camera = gameCamera(1920, 1080);
    const wolf = CROWD_LOOKS["phong-lang"].sizeM;
    const general = GENERAL.sizePm / 1000;
    expect(pxHeight(camera, wolf[0] * general, wolf[1] * general, wolf[2] * general, -15, -18)).toBeGreaterThanOrEqual(SIZES_PX_1080.general);
    const elite = ELITES.sizePm / 1000;
    for (const [species, tier] of [["phong-lang", "small"], ["hoa-nha", "small"], ["nham-vien", "medium"], ["thiet-giap-tru", "medium"]] as const) {
      const look = CROWD_LOOKS[species];
      const lift = look.gait === "flyer" ? FLY_DRAW_M : 0;
      const x = look.gait === "flyer" ? -20 : -15;
      expect(pxHeight(camera, look.sizeM[0], look.sizeM[1], look.sizeM[2], x, -18, lift), species).toBeGreaterThanOrEqual(SIZES_PX_1080[tier]);
      expect(pxHeight(camera, look.sizeM[0] * elite, look.sizeM[1] * elite, look.sizeM[2] * elite, x, -18, lift), species + " elite").toBeGreaterThanOrEqual(SIZES_PX_1080[tier] * elite);
    }
    const r = PLAYER_LOOK.radiusM * 2;
    for (const x of [-18, 0, 18]) expect(pxHeight(camera, r, PLAYER_LOOK.heightM, r, x, -18), "player at x " + x).toBeGreaterThanOrEqual(SIZES_PX_1080.player);
  });

  it("keeps a flyer entering at either sky corner, and a beast at either gate, inside the frame at 1280 × 720, 1920 × 1080 and 16:10", () => {
    const crow = CROWD_LOOKS["hoa-nha"].sizeM;
    const v = new THREE.Vector3();
    for (const [width, height] of [[1280, 720], [1920, 1080], [1440, 900]] as const) {
      const camera = gameCamera(width, height);
      for (const entry of THANH_THACH_AI.field.skyEntries) {
        for (const dy of [0, crow[1]]) {
          v.set(entry.xMm / 1000, FLY_DRAW_M + dy, entry.zMm / 1000).project(camera);
          expect(Math.abs(v.x), width + "×" + height + " x").toBeLessThanOrEqual(1);
          expect(v.y, width + "×" + height + " top").toBeLessThanOrEqual(1);
          // Above the Bàn Quyết band.
          expect(v.y).toBeGreaterThan(-1 + (2 * quyetBand(width, height)) / height);
        }
      }
      for (const gate of THANH_THACH_AI.field.gates) {
        v.set(gate.at.xMm / 1000, CROWD_LOOKS["nham-vien"].sizeM[1], gate.at.zMm / 1000).project(camera);
        expect(v.y, "a Nham Viên's head at gate " + gate.id).toBeLessThanOrEqual(1);
      }
    }
  });
});
