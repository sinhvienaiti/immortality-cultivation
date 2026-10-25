// Source: games/dragon-hold/src/view/telegraphs.ts @06cd4e6 (adapted: canon §10.6 shapes circle, cone (a flat-ended wedge), line, cell drawn exactly as local/zones.ts tests them; fill from the event's ticks; stripes; flat field; summon calls as a ring wave; no aura or ally owners)
/**
 * Enemy telegraphs on the ground (canon §10.6, §21.1): red #FF4A4A (kit
 * semantic danger, never anything else) filling from the start tick to the
 * strike tick of the `telegraph` event, with stripes, a bold rim and a dark
 * outer edge that reads on dó paper, and a red "!" badge over the beast
 * winding up (or over the shape when it has no source). The drawn shape is
 * exactly the one `local/zones.ts insideShape` tests at the strike tick
 * (circle on (toX, toZ); cone from (x, z) towards (toX, toZ), length reach,
 * end chord width, a flat-ended wedge; line of that length and width; cell a
 * square of side reach on (toX, toZ)), so what the player sees is what hits.
 * A summon call (Tru Đàn, Gọi Đàn: no damage) is an outline with a ring wave.
 * The fill runs on world ticks (hit-stop slows it like the world); `strike`
 * flashes then fades, `cancel` fades. Reduced motion: stripes hold still, no
 * throb. A pool of meshes (each with an x-ray twin that shows the outline
 * through bodies); only live ones are drawn.
 * Owner: Lane 6.
 */
import * as THREE from "three";
import type { FrameInfo, Presenter } from "../app/contracts";
import { TELEGRAPHS } from "../content/data/telegraphs";
import type { BeastRef, EventOf, SimEvent, TelegraphShape, World } from "../content/types";
import { SEMANTIC_COLORS } from "../kit/ui/tokens";
import { uToM } from "../sim/fixed";
import type { BeastAnchor, Point3 } from "./actors";
import type { Renderer3D } from "./renderer";

/** canon §21.1: enemy danger red only. */
export const TELEGRAPH_COLOUR = SEMANTIC_COLORS.danger;
const DARK_EDGE = "#2a0606";

const POOL = 24;
/** Rim and dark edge widths on the ground (metres). */
export const RIM_M = 0.2;
export const EDGE_M = 0.08;
const FADE_S = 0.2;
const STRIKE_S = 0.12;
const MARK_SIZE_M = 1.5;
const TICK_HZ = 60;

export const SHAPE_ID: Readonly<Record<TelegraphShape, number>> = { circle: 0, cell: 1, line: 2, cone: 3 };

/**
 * The shape's ground frame (metres): origin (ox, oz), forward (fx, fz),
 * right (rx, rz); local coordinates are a = across (along right), b = along
 * (along forward); the quad spans a ∈ [aMin, aMax], b ∈ [bMin, bMax].
 */
export interface ShapeFrame {
  ox: number;
  oz: number;
  fx: number;
  fz: number;
  rx: number;
  rz: number;
  aMin: number;
  aMax: number;
  bMin: number;
  bMax: number;
  reach: number;
  half: number;
}

type ShapeEvent = Pick<EventOf<"telegraph">, "shape" | "x" | "z" | "toX" | "toZ" | "reachM" | "widthM">;

/** The ground frame of a telegraph's shape (types.ts SimEvent telegraph). */
export function shapeFrame(event: ShapeEvent, out: ShapeFrame = { ox: 0, oz: 0, fx: 0, fz: 1, rx: 1, rz: 0, aMin: 0, aMax: 0, bMin: 0, bMax: 0, reach: 0, half: 0 }): ShapeFrame {
  const reach = Math.max(0.01, event.reachM);
  const half = Math.max(0.01, event.widthM / 2);
  out.reach = reach;
  out.half = half;
  if (event.shape === "circle" || event.shape === "cell") {
    // Centred on (toX, toZ), world axes (a cell is axis-aligned, as local/zones.ts tests it).
    out.ox = event.toX;
    out.oz = event.toZ;
    out.fx = 0;
    out.fz = 1;
    out.rx = 1;
    out.rz = 0;
    const extent = event.shape === "circle" ? reach : reach / 2;
    out.aMin = out.bMin = -extent;
    out.aMax = out.bMax = extent;
    return out;
  }
  let fx = event.toX - event.x;
  let fz = event.toZ - event.z;
  const length = Math.hypot(fx, fz);
  if (length < 1e-6) {
    fx = 0;
    fz = 1;
  } else {
    fx /= length;
    fz /= length;
  }
  out.ox = event.x;
  out.oz = event.z;
  out.fx = fx;
  out.fz = fz;
  // Right of forward on the ground (x east, z south): (−fz, fx) turned the other way is left; either works for |a|.
  out.rx = fz;
  out.rz = -fx;
  out.aMin = -half;
  out.aMax = half;
  out.bMin = 0;
  out.bMax = reach;
  return out;
}

/** Local coordinates (a across, b along) of a ground point in a frame. */
export function toLocal(frame: ShapeFrame, x: number, z: number): { a: number; b: number } {
  const dx = x - frame.ox;
  const dz = z - frame.oz;
  return { a: dx * frame.rx + dz * frame.rz, b: dx * frame.fx + dz * frame.fz };
}

/** Whether local point (a, b) is inside the drawn shape (the fragment shader's test, in TypeScript). */
export function insideDrawn(shape: TelegraphShape, frame: Pick<ShapeFrame, "reach" | "half">, a: number, b: number): boolean {
  const { reach, half } = frame;
  switch (shape) {
    case "circle":
      return a * a + b * b <= reach * reach;
    case "cell":
      return Math.abs(a) * 2 <= reach && Math.abs(b) * 2 <= reach;
    case "line":
      return b >= 0 && b <= reach && Math.abs(a) <= half;
    case "cone":
      return b >= 0 && b <= reach && Math.abs(a) * reach <= b * half;
  }
}

/** Share of the charge done at world tick `tick` + `alpha` (0–1). */
export function fillAt(startTick: number, strikeTick: number, tick: number, alpha: number): number {
  const span = strikeTick - startTick;
  if (span <= 0) return 1;
  const value = (tick + alpha - startTick) / span;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** A telegraph that hits nothing (a summon call): drawn as an outline and a ring wave. */
export function isSummonCall(def: string): boolean {
  const strike = TELEGRAPHS[def]?.strike;
  return strike !== undefined && strike.playerHp <= 0 && strike.formation <= 0 && strike.formationPm <= 0 && strike.knockMm <= 0;
}

const VERTEX = /* glsl */ `
attribute vec2 aLocal;
varying vec2 vLocal;
void main() {
  vLocal = aLocal;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

// vLocal: (a across, b along) in metres. uShape: 0 circle, 1 cell, 2 line, 3 cone (insideDrawn in TS).
const FRAGMENT = /* glsl */ `
uniform float uShape;
uniform float uReach;
uniform float uHalf;
uniform float uFill;
uniform float uAlpha;
uniform float uTime;
uniform float uMotion;
uniform float uWave;
uniform vec3 uColor;
uniform vec3 uDark;
varying vec2 vLocal;
void main() {
  float a = vLocal.x;
  float b = vLocal.y;
  float edge;
  float progress;
  if (uShape < 0.5) {
    float r = length(vLocal);
    if (r > uReach) discard;
    edge = uReach - r;
    progress = r / uReach;
  } else if (uShape < 1.5) {
    float m = max(abs(a), abs(b));
    if (m * 2.0 > uReach) discard;
    edge = uReach * 0.5 - m;
    progress = m * 2.0 / uReach;
  } else if (uShape < 2.5) {
    if (b < 0.0 || b > uReach || abs(a) > uHalf) discard;
    edge = min(uHalf - abs(a), min(b, uReach - b));
    progress = b / uReach;
  } else {
    if (b < 0.0 || b > uReach || abs(a) * uReach > b * uHalf) discard;
    float side = (b * uHalf / uReach - abs(a)) * uReach / sqrt(uReach * uReach + uHalf * uHalf);
    edge = min(side, uReach - b);
    progress = b / uReach;
  }
  float dark = 1.0 - smoothstep(${(EDGE_M * 0.5).toFixed(3)}, ${EDGE_M.toFixed(3)}, edge);
  float rim = (1.0 - smoothstep(${(EDGE_M + RIM_M * 0.7).toFixed(3)}, ${(EDGE_M + RIM_M).toFixed(3)}, edge)) * (1.0 - dark);
  float filled = step(progress, uFill);
  // Stripes: diagonal hatch on round and square shapes, chevrons running forward on lines and cones.
  float t = uTime * uMotion;
  float stripe = uShape < 1.5 ? step(0.55, fract((a + b) / 0.7 - t * 0.8)) : step(0.55, fract(b / 0.9 - abs(a) / 1.4 - t * 1.4));
  float due = smoothstep(0.7, 1.0, uFill) * uMotion;
  float throb = 1.0 + due * 0.3 * (0.5 + 0.5 * sin(uTime * 24.0));
  float alpha;
  vec3 color;
  if (uWave > 0.5) {
    // A summon call: outline, and a ring at the charge front.
    float front = 1.0 - smoothstep(0.0, 0.06, abs(progress - uFill));
    alpha = rim * 0.9 + front * 0.75 + stripe * 0.06;
    color = mix(uColor, uDark, dark);
    alpha = max(alpha, dark * 0.8);
  } else {
    alpha = 0.16 + filled * (0.36 + due * 0.12) + stripe * (filled > 0.5 ? 0.16 : 0.1) + rim * 0.9;
    color = mix(uColor * throb, uDark, dark);
    alpha = max(alpha, dark * 0.85);
  }
#ifdef XRAY
  // Seen through a body: the rim and the dark edge only.
  alpha = max(rim * 0.85, dark * 0.7) + filled * 0.08;
#endif
  gl_FragColor = vec4(color, min(1.0, alpha) * uAlpha);
}`;

interface Slot {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  xray: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  mark: THREE.Sprite;
  active: boolean;
  id: number;
  startTick: number;
  strikeTick: number;
  /** Seconds left of the strike flash (−1 none) and of the fade (−1 not fading). */
  strike: number;
  fade: number;
  source: BeastRef | null;
  frame: ShapeFrame;
  centreX: number;
  centreZ: number;
}

/** The "!" badge: a red disc with a dark ring and a white mark (one shared texture). */
function markTexture(): THREE.Texture {
  const size = 64;
  const canvas = globalThis.document?.createElement("canvas");
  if (!canvas) return new THREE.Texture();
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  if (g) {
    g.beginPath();
    g.arc(32, 32, 29, 0, Math.PI * 2);
    g.fillStyle = DARK_EDGE;
    g.fill();
    g.beginPath();
    g.arc(32, 32, 25, 0, Math.PI * 2);
    g.fillStyle = TELEGRAPH_COLOUR;
    g.fill();
    g.fillStyle = "#ffffff";
    g.fillRect(28, 13, 8, 25);
    g.beginPath();
    g.arc(32, 46, 4.5, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface TelegraphView extends Presenter {
  /** Telegraphs drawn now (charging, flashing or fading). */
  readonly live: number;
  /** The live telegraph `id`'s fill (0–1), or −1 (scenarios, tests). */
  fillOf(id: number): number;
  clear(): void;
}

export interface TelegraphViewOptions {
  /** Where a source beast is drawn (actors view); without it the world's position is used. */
  readonly locate?: (slot: number, serial: number, anchor: BeastAnchor, out: Point3) => boolean;
  readonly reduced?: () => boolean;
}

export function createTelegraphView(renderer: Renderer3D, options: TelegraphViewOptions = {}): TelegraphView {
  const reduced = options.reduced ?? (() => false);
  const group = new THREE.Group();
  group.name = "telegraphs";
  renderer.layers.fx.add(group);
  const badge = markTexture();
  const markMaterial = new THREE.SpriteMaterial({ map: badge, depthTest: false, depthWrite: false, transparent: true });
  const slots: Slot[] = [];
  const point: Point3 = { x: 0, y: 0, z: 0 };
  let time = 0;
  for (let k = 0; k < POOL; k += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
    geometry.setAttribute("aLocal", new THREE.BufferAttribute(new Float32Array(8), 2));
    geometry.setIndex([0, 2, 1, 2, 3, 1]);
    const uniforms = {
      uShape: { value: 0 },
      uReach: { value: 1 },
      uHalf: { value: 1 },
      uFill: { value: 0 },
      uAlpha: { value: 1 },
      uTime: { value: 0 },
      uMotion: { value: 1 },
      uWave: { value: 0 },
      uColor: { value: new THREE.Color(TELEGRAPH_COLOUR) },
      uDark: { value: new THREE.Color(DARK_EDGE) },
    };
    const common = { vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
    const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ uniforms, ...common }));
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 3;
    const xray = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ uniforms, defines: { XRAY: 1 }, depthFunc: THREE.GreaterDepth, ...common }));
    xray.frustumCulled = false;
    xray.visible = false;
    xray.renderOrder = 3;
    const mark = new THREE.Sprite(markMaterial);
    mark.scale.setScalar(MARK_SIZE_M);
    mark.visible = false;
    mark.renderOrder = 12;
    group.add(mesh, xray, mark);
    slots.push({ mesh, xray, mark, active: false, id: -1, startTick: 0, strikeTick: 0, strike: -1, fade: -1, source: null, frame: shapeFrame({ shape: "circle", x: 0, z: 0, toX: 0, toZ: 0, reachM: 1, widthM: 1 }), centreX: 0, centreZ: 0 });
  }

  const layout = (slot: Slot): void => {
    const f = slot.frame;
    const position = slot.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const local = slot.mesh.geometry.getAttribute("aLocal") as THREE.BufferAttribute;
    for (let i = 0; i < 4; i += 1) {
      const a = i % 2 === 0 ? f.aMin : f.aMax;
      const b = i < 2 ? f.bMin : f.bMax;
      position.setXYZ(i, f.ox + f.rx * a + f.fx * b, 0.06, f.oz + f.rz * a + f.fz * b);
      local.setXY(i, a, b);
    }
    position.needsUpdate = true;
    local.needsUpdate = true;
    slot.mesh.geometry.computeBoundingSphere();
    slot.centreX = f.ox + f.fx * (f.bMin + f.bMax) * 0.5;
    slot.centreZ = f.oz + f.fz * (f.bMin + f.bMax) * 0.5;
  };

  const show = (event: EventOf<"telegraph">): void => {
    let slot = slots.find((item) => item.active && item.id === event.id) ?? slots.find((item) => !item.active);
    // Full: the oldest one gives way.
    slot ??= slots.reduce((oldest, item) => (item.startTick < oldest.startTick ? item : oldest));
    slot.active = true;
    slot.id = event.id;
    slot.startTick = event.tick;
    slot.strikeTick = event.strikeTick;
    slot.strike = -1;
    slot.fade = -1;
    slot.source = event.source;
    shapeFrame(event, slot.frame);
    layout(slot);
    const uniforms = slot.mesh.material.uniforms;
    uniforms.uShape!.value = SHAPE_ID[event.shape];
    uniforms.uReach!.value = slot.frame.reach;
    uniforms.uHalf!.value = slot.frame.half;
    uniforms.uFill!.value = 0;
    uniforms.uAlpha!.value = 1;
    uniforms.uWave!.value = isSummonCall(event.def) ? 1 : 0;
    slot.mesh.visible = true;
    slot.xray.visible = true;
  };

  const find = (id: number): Slot | null => slots.find((item) => item.active && item.id === id) ?? null;

  const hide = (slot: Slot): void => {
    slot.active = false;
    slot.mesh.visible = false;
    slot.xray.visible = false;
    slot.mark.visible = false;
  };

  return {
    get live(): number {
      return slots.filter((slot) => slot.active).length;
    },
    fillOf(id: number): number {
      const slot = find(id);
      return slot === null ? -1 : (slot.mesh.material.uniforms.uFill!.value as number);
    },
    clear(): void {
      for (const slot of slots) hide(slot);
    },
    onEvents(events: readonly SimEvent[], _world: World): void {
      for (const event of events) {
        if (event.type === "telegraph") {
          if (event.stage === "start") show(event);
          else {
            const slot = find(event.id);
            if (slot === null) continue;
            if (event.stage === "strike") {
              slot.strike = STRIKE_S;
              slot.mesh.material.uniforms.uFill!.value = 1;
            } else slot.fade = FADE_S;
          }
        } else if (event.type === "phase" && (event.phase === "break" || event.phase === "victory" || event.phase === "defeat")) {
          for (const slot of slots) if (slot.active && slot.fade < 0) slot.fade = FADE_S;
        }
      }
    },
    frame(world: World, info: FrameInfo): void {
      time += info.worldDt;
      const motion = reduced() ? 0 : 1;
      for (const slot of slots) {
        if (!slot.active) continue;
        const uniforms = slot.mesh.material.uniforms;
        uniforms.uTime!.value = time;
        uniforms.uMotion!.value = motion;
        if (slot.strike < 0 && slot.fade < 0) {
          uniforms.uFill!.value = fillAt(slot.startTick, slot.strikeTick, world.tick, info.alpha);
          // No strike event a second past its tick (a missed batch): let it go.
          if (world.tick > slot.strikeTick + TICK_HZ) slot.fade = FADE_S;
        }
        if (slot.strike >= 0) {
          slot.strike -= info.worldDt;
          uniforms.uAlpha!.value = 1.25;
          if (slot.strike < 0) slot.fade = FADE_S;
        }
        if (slot.fade >= 0) {
          slot.fade -= info.dt;
          uniforms.uAlpha!.value = Math.max(0, slot.fade / FADE_S);
          if (slot.fade <= 0) {
            hide(slot);
            continue;
          }
        }
        // The "!" over the beast winding up (or over the shape), gone once it strikes.
        const charging = slot.strike < 0 && slot.fade < 0;
        let at = false;
        const source = slot.source;
        if (charging && source !== null) {
          if (options.locate) at = options.locate(source.slot, source.serial, "top", point);
          else {
            const beast = world.beasts.list[source.slot];
            if (beast !== undefined && beast.alive && beast.serial === source.serial) {
              point.x = uToM(beast.x);
              point.y = uToM(beast.y) + 2.2;
              point.z = uToM(beast.z);
              at = true;
            }
          }
        }
        if (charging && !at) {
          point.x = slot.centreX;
          point.y = 1.2;
          point.z = slot.centreZ;
          at = true;
        }
        slot.mark.visible = charging && at;
        if (slot.mark.visible) {
          slot.mark.position.set(point.x, point.y + MARK_SIZE_M * 0.5, point.z);
          const pop = motion === 0 ? 1 : 1 + 0.1 * Math.sin(time * 16);
          slot.mark.scale.setScalar(MARK_SIZE_M * pop);
        }
      }
    },
    dispose(): void {
      for (const slot of slots) {
        slot.mesh.geometry.dispose();
        slot.mesh.material.dispose();
        slot.xray.material.dispose();
      }
      markMaterial.dispose();
      badge.dispose();
      group.removeFromParent();
    },
  };
}
