/**
 * The grey-box scene on Lane 1's renderer (canon §8.1, §8.2, §21.1): the
 * procedural ground (ground.ts), gates A and B (two posts and a lintel), the
 * two Trận Trụ (stone columns; cracked after two rams), the Trận Tâm (a stone
 * disc with a rune ring that turns urgent orange under 30 % Trận Lực), the
 * Kết Giới ring (r 9 m), the Tâm nhãn (pale when lit; dark with an urgent
 * ring while a beast holds it, the Tẩy word is up), the 6 mechanism slot
 * marks (prep and breaks only), the built mechanisms as primitive
 * placeholders, and the sky route hint (dashed lines from the top corners at
 * flight height). Ramp shading in 3 steps (toon gradient) and a temporary ink
 * outline (inverted hull) on the solid pieces. Primitives only (canon D27).
 * Reads the stage once and the world each frame; never writes the world.
 * Owner: Lane 6.
 */
import * as THREE from "three";
import type { FrameInfo, Presenter } from "../app/contracts";
import { THANH_THACH_AI } from "../content/data/stage-m0a";
import { FIELD } from "../content/rules";
import type { MechanismId, MechSlotDef, Phase, SimEvent, StageDef, World } from "../content/types";
import { HEART_LOW_PCT, SEMANTIC } from "../ui/styles/palette";
import { createActors, FLY_DRAW_M, type ActorsView } from "./actors";
import { createFx, type FxDeps, type FxView } from "./fx";
import { createGround } from "./ground";
import { createPickups, type PickupsView } from "./pickups";
import { createPlayerView, type PlayerView } from "./player-view";
import type { Renderer3D } from "./renderer";
import { createTelegraphView, type TelegraphView } from "./telegraphs";

export { HEART_LOW_PCT };

export const STAGE_COLOURS = {
  stone: "#d8d2c0",
  pillar: "#8c8d88",
  pillarCracked: "#6c6862",
  gate: "#6e655a",
  ink: "#1b1d24",
  barrier: "#eef2e6",
  rune: "#f3ecd6",
  nodeOn: "#dcefe6",
  nodeOff: "#3b3f48",
  mark: "#f4efe2",
  sky: "#eef0f2",
  mech: { "kiem-thung": "#9aa3ad", "loi-phu-tru": "#6e5a8a", "phong-an-vong": "#5f7d78" } as Readonly<Record<MechanismId, string>>,
} as const;

/** Slot mark sizes (metres): a strip 4 × 2 m laid towards the heart (Kiếm Thung, canon §8.3), a post r 0.8 m. */
export const SLOT_MARK = { stripLength: 4, stripWidth: 2, postRadius: 0.8 } as const;

/** Gate placeholder (metres): 0.6 m inside the far edge, posts ±2.2 m, its top under VIEW.headroomM (tests/view/stage.test.ts). */
export const GATE_M = { inset: 0.6, halfWidth: 2.2, postHeight: 1.9, lintel: 0.35 } as const;

/** Mechanism slot marks show only in prep and breaks (canon §8.2). */
export function marksVisible(phase: Phase): boolean {
  return phase === "prep" || phase === "break";
}

/** Heading (radians, about +y) that lays a strip slot along its path towards the heart. */
export function slotYaw(slot: Pick<MechSlotDef, "at">): number {
  return Math.atan2(-slot.at.xMm, -slot.at.zMm);
}

/** The rune ring colour for Trận Lực `heart` of `max`. */
export function heartColour(heart: number, max: number, urgent: string): string {
  return max > 0 && heart * 100 < max * HEART_LOW_PCT ? urgent : STAGE_COLOURS.rune;
}

let rampTexture: THREE.DataTexture | null = null;

/** Ramp shading in 3 steps (92 / 168 / 255, as the crowd's). */
function ramp(): THREE.DataTexture {
  if (rampTexture === null) {
    rampTexture = new THREE.DataTexture(new Uint8Array([92, 92, 92, 255, 168, 168, 168, 255, 255, 255, 255, 255]), 3, 1);
    rampTexture.minFilter = THREE.NearestFilter;
    rampTexture.magFilter = THREE.NearestFilter;
    rampTexture.needsUpdate = true;
  }
  return rampTexture;
}

function toon(colour: string): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color: colour, gradientMap: ramp() });
}

const inkMaterial = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: STAGE_COLOURS.ink, side: THREE.BackSide });

/** A solid with its ink hull (the same geometry scaled up, back faces, ink). */
function inked(geometry: THREE.BufferGeometry, material: THREE.Material, hull = 1.06): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(geometry, material);
  body.name = "body";
  const ink = new THREE.Mesh(geometry, inkMaterial());
  ink.name = "ink";
  ink.scale.setScalar(hull);
  group.add(ink, body);
  return group;
}

function flatRing(inner: number, outer: number, colour: string, opacity: number, segments = 96): THREE.Mesh {
  const geometry = new THREE.RingGeometry(inner, outer, segments);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false }));
  mesh.renderOrder = 1;
  return mesh;
}

function flatDisc(radius: number, colour: string, opacity: number): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(radius, 48);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: colour, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
  mesh.renderOrder = 1;
  return mesh;
}

/** Outline points (x, z pairs) of a slot mark at the origin, before its yaw: a strip's rectangle, a post's circle. */
export function slotOutline(kind: MechSlotDef["kind"]): number[] {
  if (kind === "strip") {
    const l = SLOT_MARK.stripLength / 2;
    const w = SLOT_MARK.stripWidth / 2;
    return [-w, -l, w, -l, w, l, -w, l];
  }
  const out: number[] = [];
  for (let k = 0; k < 24; k += 1) {
    const a = (k / 24) * Math.PI * 2;
    out.push(Math.cos(a) * SLOT_MARK.postRadius, Math.sin(a) * SLOT_MARK.postRadius);
  }
  return out;
}

/** A mechanism's placeholder (primitives; canon D27). */
function mechanismModel(mech: MechanismId, kind: MechSlotDef["kind"]): THREE.Group {
  const material = toon(STAGE_COLOURS.mech[mech]);
  const group = new THREE.Group();
  if (mech === "kiem-thung" || kind === "strip") {
    const plank = inked(new THREE.BoxGeometry(SLOT_MARK.stripWidth * 0.9, 0.22, SLOT_MARK.stripLength * 0.94), material, 1.04);
    plank.position.y = 0.11;
    group.add(plank);
    // Sword stakes in two rows (one instanced draw).
    const stakes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.7, 6).translate(0, 0.35, 0), material, 10);
    const m = new THREE.Matrix4();
    for (let k = 0; k < 10; k += 1) stakes.setMatrixAt(k, m.makeTranslation(k % 2 === 0 ? -0.45 : 0.45, 0.2, -1.6 + Math.floor(k / 2) * 0.8));
    stakes.name = "stakes";
    group.add(stakes);
    return group;
  }
  const post = inked(new THREE.CylinderGeometry(0.22, 0.3, mech === "loi-phu-tru" ? 2.2 : 1.8, 12), material);
  post.position.y = mech === "loi-phu-tru" ? 1.1 : 0.9;
  group.add(post);
  if (mech === "loi-phu-tru") {
    const orb = inked(new THREE.SphereGeometry(0.36, 16, 12), material, 1.08);
    orb.position.y = 2.45;
    orb.name = "top";
    group.add(orb);
  } else {
    const ring = inked(new THREE.TorusGeometry(0.62, 0.07, 8, 32), material, 1.12);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.85;
    ring.name = "top";
    group.add(ring);
  }
  return group;
}

export interface StageView extends Presenter {
  readonly group: THREE.Group;
  /** The slot marks show (prep and breaks). */
  readonly marksShown: boolean;
  /** Highlights mechanism slot `index` (shop cursor; −1 none). */
  highlightSlot(index: number): void;
  /** A slot's ground point in metres (null: no such slot). */
  slotPoint(index: number): { readonly x: number; readonly z: number } | null;
}

export interface StageViewOptions {
  /** Reduced motion (canon §24): the rune ring and highlights hold still. */
  readonly reduced?: () => boolean;
}

interface MechRec {
  /** The mechanism and level its model shows (a change rebuilds it). */
  mech: MechanismId | null;
  level: number;
  group: THREE.Group | null;
  /** The model's toon materials (the trigger glow writes their emissive). */
  readonly materials: THREE.MeshToonMaterial[];
  flash: number;
  lit: boolean;
}

/** The scene of `stage` on the renderer's ground layer. */
export function createStageView(renderer: Renderer3D, stage: StageDef = THANH_THACH_AI, options: StageViewOptions = {}): StageView {
  const urgent = SEMANTIC.urgent;
  const reduced = options.reduced ?? (() => false);
  const field = stage.field;
  const group = new THREE.Group();
  group.name = "stage";
  group.add(createGround(stage));

  // Kết Giới (r 9 m): an ivory ring and a faint fill.
  const barrierM = field.barrierRadiusMm / 1000;
  const barrier = flatRing(barrierM - 0.12, barrierM + 0.12, STAGE_COLOURS.barrier, 0.6, 160);
  barrier.position.y = 0.03;
  barrier.name = "barrier";
  const barrierFill = flatDisc(barrierM, STAGE_COLOURS.barrier, 0.05);
  barrierFill.position.y = 0.025;
  group.add(barrier, barrierFill);

  // Trận Tâm: a stone disc, a centre stone and a rune ring at the heart edge.
  const edgeM = FIELD.heartEdgeMm / 1000;
  const heart = inked(new THREE.CylinderGeometry(edgeM * 0.85, edgeM * 0.95, 0.45, 40), toon(STAGE_COLOURS.stone), 1.04);
  heart.position.y = 0.22;
  heart.name = "heart";
  const heartStone = inked(new THREE.CylinderGeometry(0.35, 0.5, 1.4, 8), toon(STAGE_COLOURS.stone));
  heartStone.position.y = 1.1;
  const rune = flatRing(edgeM - 0.12, edgeM + 0.06, STAGE_COLOURS.rune, 0.9, 64);
  rune.position.y = 0.04;
  rune.name = "rune";
  group.add(heart, heartStone, rune);

  // Tâm nhãn: pale when lit; dark with an urgent ring while a beast holds it.
  const nodes = field.nodes.map((node) => {
    const disc = flatDisc(0.75, STAGE_COLOURS.nodeOn, 1);
    const ring = flatRing(0.8, 0.98, STAGE_COLOURS.nodeOn, 0.95, 40);
    disc.position.set(node.at.xMm / 1000, 0.035, node.at.zMm / 1000);
    ring.position.set(node.at.xMm / 1000, 0.04, node.at.zMm / 1000);
    disc.name = "node-" + node.id;
    ring.name = "node-ring-" + node.id;
    group.add(disc, ring);
    return { id: node.id, disc, ring, on: true };
  });

  // Trận Trụ.
  const pillars = field.pillars.map((pillar) => {
    const r = pillar.radiusMm / 1000;
    const material = toon(STAGE_COLOURS.pillar);
    const column = inked(new THREE.CylinderGeometry(r * 0.92, r * 1.1, 3.4, 16), material, 1.05);
    column.position.set(pillar.at.xMm / 1000, 1.7, pillar.at.zMm / 1000);
    column.name = "pillar-" + pillar.id;
    group.add(column);
    return { id: pillar.id, column, material, cracked: false };
  });

  // Gates: two posts and a lintel per ground gate, just inside the far edge and
  // under the camera's headroom there (renderer.ts VIEW.headroomM), so the whole gate stays in frame (canon D48).
  const gateMaterial = toon(STAGE_COLOURS.gate);
  for (const gate of field.gates) {
    if (!gate.ground) continue;
    const x = gate.at.xMm / 1000;
    const z = gate.at.zMm / 1000 + GATE_M.inset;
    for (const side of [-GATE_M.halfWidth, GATE_M.halfWidth]) {
      const post = inked(new THREE.BoxGeometry(0.6, GATE_M.postHeight, 0.6), gateMaterial, 1.06);
      post.position.set(x + side, GATE_M.postHeight / 2, z);
      group.add(post);
    }
    const lintel = inked(new THREE.BoxGeometry(GATE_M.halfWidth * 2 + 1, GATE_M.lintel, 0.7), gateMaterial, 1.05);
    lintel.position.set(x, GATE_M.postHeight + GATE_M.lintel / 2 - 0.05, z);
    lintel.name = "gate-" + gate.id;
    group.add(lintel);
  }

  // Sky route hint: dashed lines from the top corners at flight height, and their ground shadow.
  // At the drawn flight height (actors.ts FLY_DRAW_M), where the Hỏa Nha fly.
  const flyM = FLY_DRAW_M;
  const skyPoints: number[] = [];
  const skyShadow: number[] = [];
  for (const entry of field.skyEntries) {
    const x = entry.xMm / 1000;
    const z = entry.zMm / 1000;
    skyPoints.push(x, flyM, z, 0, flyM, 0);
    skyShadow.push(x, 0.03, z, 0, 0.03, 0);
  }
  const skyGeometry = new THREE.BufferGeometry();
  skyGeometry.setAttribute("position", new THREE.Float32BufferAttribute(skyPoints, 3));
  const sky = new THREE.LineSegments(skyGeometry, new THREE.LineDashedMaterial({ color: STAGE_COLOURS.sky, dashSize: 0.8, gapSize: 0.6, transparent: true, opacity: 0.7, depthWrite: false }));
  sky.computeLineDistances();
  sky.name = "sky-route";
  const shadowGeometry = new THREE.BufferGeometry();
  shadowGeometry.setAttribute("position", new THREE.Float32BufferAttribute(skyShadow, 3));
  const skyGround = new THREE.LineSegments(shadowGeometry, new THREE.LineDashedMaterial({ color: STAGE_COLOURS.ink, dashSize: 0.3, gapSize: 0.7, transparent: true, opacity: 0.3, depthWrite: false }));
  skyGround.computeLineDistances();
  skyGround.name = "sky-route-shadow";
  group.add(sky, skyGround);

  // Mechanism slot marks (one line draw) and the shop cursor's highlight.
  const markPoints: number[] = [];
  for (const slot of field.mechSlots) {
    const outline = slotOutline(slot.kind);
    const yaw = slotYaw(slot);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const cx = slot.at.xMm / 1000;
    const cz = slot.at.zMm / 1000;
    const n = outline.length / 2;
    for (let k = 0; k < n; k += 1) {
      const ax = outline[k * 2]!;
      const az = outline[k * 2 + 1]!;
      const bx = outline[((k + 1) % n) * 2]!;
      const bz = outline[((k + 1) % n) * 2 + 1]!;
      markPoints.push(cx + ax * c + az * s, 0.05, cz - ax * s + az * c, cx + bx * c + bz * s, 0.05, cz - bx * s + bz * c);
    }
  }
  const markGeometry = new THREE.BufferGeometry();
  markGeometry.setAttribute("position", new THREE.Float32BufferAttribute(markPoints, 3));
  const marks = new THREE.LineSegments(markGeometry, new THREE.LineBasicMaterial({ color: STAGE_COLOURS.mark, transparent: true, opacity: 0.9, depthWrite: false }));
  marks.name = "slot-marks";
  marks.renderOrder = 2;
  group.add(marks);
  const highlight = flatDisc(1, STAGE_COLOURS.mark, 0.28);
  highlight.name = "slot-highlight";
  highlight.visible = false;
  group.add(highlight);

  const mechs: MechRec[] = field.mechSlots.map(() => ({ mech: null, level: 0, group: null, materials: [], flash: 0, lit: false }));
  let marksShown = true;
  let highlighted = -1;
  let time = 0;
  let runeUrgent = false;
  const runeMaterial = rune.material as THREE.MeshBasicMaterial;

  renderer.layers.ground.add(group);

  const disposeGroup = (node: THREE.Object3D): void => {
    node.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.Material | undefined;
      if (material && material !== gateMaterial) material.dispose();
    });
  };

  const placeHighlight = (): void => {
    const slot = highlighted >= 0 ? field.mechSlots[highlighted] : undefined;
    highlight.visible = slot !== undefined && marksShown;
    if (slot === undefined) return;
    const strip = slot.kind === "strip";
    highlight.scale.set(strip ? SLOT_MARK.stripWidth / 2 : SLOT_MARK.postRadius, 1, strip ? SLOT_MARK.stripLength / 2 : SLOT_MARK.postRadius);
    highlight.rotation.y = slotYaw(slot);
    highlight.position.set(slot.at.xMm / 1000, 0.045, slot.at.zMm / 1000);
  };

  const syncMechs = (world: World, dt: number): void => {
    const states = world.mechanisms?.slots;
    for (let index = 0; index < field.mechSlots.length; index += 1) {
      const slot = field.mechSlots[index]!;
      const state = states?.[index];
      const rec = mechs[index]!;
      const mech = state?.mech ?? null;
      const level = mech === null ? 0 : (state?.level ?? 0);
      // Rebuilt only when the slot changed (build, upgrade, sale).
      if (mech !== rec.mech || level !== rec.level) {
        if (rec.group) {
          group.remove(rec.group);
          disposeGroup(rec.group);
          rec.group = null;
          rec.materials.length = 0;
        }
        rec.mech = mech;
        rec.level = level;
        if (mech !== null) {
          const model = mechanismModel(mech, slot.kind);
          model.position.set(slot.at.xMm / 1000, 0, slot.at.zMm / 1000);
          model.rotation.y = slotYaw(slot);
          // Level 2 and 3 stand taller (view only).
          model.scale.y = 1 + 0.18 * Math.max(0, level - 1);
          model.name = "mech-" + index;
          model.traverse((object) => {
            const material = (object as THREE.Mesh).material;
            if (material instanceof THREE.MeshToonMaterial && !rec.materials.includes(material)) rec.materials.push(material);
          });
          rec.group = model;
          group.add(model);
        }
      }
      if (rec.group && (rec.flash > 0 || rec.lit)) {
        rec.flash = Math.max(0, rec.flash - dt * 4);
        rec.lit = rec.flash > 0;
        const glow = rec.flash * 0.6;
        for (let k = 0; k < rec.materials.length; k += 1) rec.materials[k]!.emissive.setScalar(glow);
      }
    }
  };

  return {
    group,
    get marksShown() {
      return marksShown;
    },
    highlightSlot(index: number): void {
      highlighted = index;
      placeHighlight();
    },
    slotPoint(index: number) {
      const slot = field.mechSlots[index];
      return slot ? { x: slot.at.xMm / 1000, z: slot.at.zMm / 1000 } : null;
    },
    onEvents(events: readonly SimEvent[], _world: World): void {
      for (const event of events) {
        if (event.type === "mechanism" && event.stage === "trigger") {
          const rec = mechs[event.slot];
          if (rec) rec.flash = 1;
        }
      }
    },
    frame(world: World, info: FrameInfo): void {
      time += info.dt;
      const show = marksVisible(world.phase);
      if (show !== marksShown) {
        marksShown = show;
        marks.visible = show;
        placeHighlight();
      }
      const formation = world.formation;
      // Tâm nhãn on/off (indexed loops: nothing allocates per frame).
      const nodeStates = formation?.nodes;
      for (let k = 0; k < nodes.length; k += 1) {
        const node = nodes[k]!;
        let on = true;
        if (nodeStates) for (let n = 0; n < nodeStates.length; n += 1) if (nodeStates[n]!.id === node.id) on = nodeStates[n]!.on;
        if (on !== node.on) {
          node.on = on;
          (node.disc.material as THREE.MeshBasicMaterial).color.set(on ? STAGE_COLOURS.nodeOn : STAGE_COLOURS.nodeOff);
          (node.ring.material as THREE.MeshBasicMaterial).color.set(on ? STAGE_COLOURS.nodeOn : urgent);
        }
      }
      // Cracked Trận Trụ: darker and leaning a little.
      const pillarStates = formation?.pillars;
      for (let k = 0; k < pillars.length; k += 1) {
        const pillar = pillars[k]!;
        let cracked = false;
        if (pillarStates) for (let n = 0; n < pillarStates.length; n += 1) if (pillarStates[n]!.id === pillar.id) cracked = pillarStates[n]!.cracked;
        if (cracked !== pillar.cracked) {
          pillar.cracked = cracked;
          pillar.material.color.set(cracked ? STAGE_COLOURS.pillarCracked : STAGE_COLOURS.pillar);
          pillar.column.rotation.z = cracked ? (pillar.column.position.x < 0 ? 0.07 : -0.07) : 0;
        }
      }
      // Rune ring: Trận Lực under 30 % turns urgent and breathes (still with reduced motion).
      const low = heartColour(formation?.heart ?? 1, formation?.heartMax ?? 1, urgent) === urgent;
      if (low !== runeUrgent) {
        runeUrgent = low;
        runeMaterial.color.set(low ? urgent : STAGE_COLOURS.rune);
      }
      runeMaterial.opacity = low && !reduced() ? 0.65 + 0.3 * Math.sin(time * 5) : 0.9;
      syncMechs(world, info.dt);
    },
    dispose(): void {
      group.removeFromParent();
      disposeGroup(group);
      gateMaterial.dispose();
    },
  };
}

// ── The whole grey-box view for integration (M0A_PLAN §6.9) ─────────────────

export interface GreyBoxOptions {
  readonly stage?: StageDef;
  /** This machine's seat (player view, own effects, motes). */
  readonly seat?: number;
  /** Reduced motion now (skin.ts watchMotion): every part asks each frame. */
  readonly reduced?: () => boolean;
  /** The DOM overlay for the Linh Sa motes (#ic-overlay); without it there are no motes. */
  readonly overlay?: HTMLElement;
  /** Where motes fly (the HUD's Linh Sa chip, hud.ts linhSaAnchor). */
  readonly moteTarget?: () => { readonly x: number; readonly y: number } | null;
  /** Lane 1 factories (tests and previews pass stand-ins). */
  readonly fxDeps?: Partial<FxDeps>;
}

export interface GreyBoxView {
  readonly stage: StageView;
  readonly actors: ActorsView;
  readonly player: PlayerView;
  readonly telegraphs: TelegraphView;
  readonly fx: FxView;
  readonly pickups: PickupsView | null;
  /** Every part in the order the app calls them (onEvents for all, then frame for all). */
  readonly presenters: readonly Presenter[];
  /** World seconds of a frame (the feedback profile's hit stop): the loop's world clock (FrameInfo.worldDt). */
  worldDt(dt: number, nowMs: number): number;
  dispose(): void;
}

/**
 * The grey-box scene on one renderer: stage and ground, beasts, this
 * machine's player and the wards, telegraphs, effects, Linh Sa motes. Effects
 * and telegraphs find a beast where the actors view draws it (flyers
 * included). The HUD and other DOM parts are separate presenters (src/ui).
 */
export function createGreyBoxView(renderer: Renderer3D, options: GreyBoxOptions = {}): GreyBoxView {
  const reduced = options.reduced ?? (() => false);
  const seat = options.seat ?? 0;
  const stage = createStageView(renderer, options.stage ?? THANH_THACH_AI, { reduced });
  const actors = createActors(renderer, { reduced });
  const locate = actors.locate.bind(actors);
  const player = createPlayerView(renderer, { seat, reduced });
  const telegraphs = createTelegraphView(renderer, { locate, reduced });
  const fx = createFx(renderer, { locate, reduced, seat, ...(options.fxDeps ? { deps: options.fxDeps } : {}) });
  const pickups = options.overlay ? createPickups(renderer, options.overlay, { seat, reduced, ...(options.moteTarget ? { target: options.moteTarget } : {}) }) : null;
  const presenters: Presenter[] = [stage, actors, player, telegraphs, fx];
  if (pickups !== null) presenters.push(pickups);
  return {
    stage,
    actors,
    player,
    telegraphs,
    fx,
    pickups,
    presenters,
    worldDt: (dt, nowMs) => fx.worldDt(dt, nowMs),
    dispose(): void {
      for (let k = presenters.length - 1; k >= 0; k -= 1) presenters[k]!.dispose();
    },
  };
}
