/**
 * Skills lab (/skills-lab.html, dev-only, never built): the Kiếm skills on
 * the game's renderer and camera (55°, FOV 28°), the lookdev field and light,
 * stand-in beasts and caster, so the owner reviews each skill before it goes
 * into the game (skill game-vfx-layered "Demo or lab first"; owner 02/11).
 * Keys: 0 Phi Kiếm, 1 Ngự Kiếm Quyết, 2 Nhất Tuyến Xuyên Vân, 3 Hồi Kiếm Hộ
 * Thân, 4 Lưu Quang Bộ, 5 Lạc Kiếm Trận, 6 Thiên Hà Kiếm Vũ, B an enemy blow
 * at the guard, R reset. Each skill is "typed" at the chosen WPM: the charge
 * follows the letters and the release comes on the last one.
 * Flags: ?q= tier, ?wpm=45, ?herd=still|march, ?fixed=1 (no rAF: the capture
 * scenario steps frames with __lab.step), ?ui=0 hides the panel.
 */
import * as THREE from "three";
import type { Quality } from "../content/types";
import { createRenderer, placeCamera } from "../view/renderer";
import { KiemFx, type KiemHost, type KiemSlot, type KiemTextures } from "../view/skills/kiem";
import { SpritePool } from "../view/skills/fxkit";
import { LabCaster, type CasterClip } from "./caster";
import { LabHerd, type HerdMode } from "./herd";
import { applyLook, buildField, LAB_ASSETS } from "./look";

const params = new URLSearchParams(location.search);
const quality = (["low", "medium", "high", "ultra"].includes(params.get("q") ?? "") ? params.get("q") : "high") as Quality;
let wpm = Number(params.get("wpm") ?? "45");
const fixed = params.get("fixed") === "1";

const host = document.getElementById("ic-lab");
if (host === null) throw new Error("lab host missing");
const view = createRenderer(host, quality);
const look = applyLook(view, { exposure: Number(params.get("exposure") ?? "0.72"), bloom: Number(params.get("bloom") ?? "0.45") });
// Mid-dark paving, as the map concept asks for the Kết Giới (word tags and skills read on it).
buildField(view, { tint: params.get("ground") ?? "#7c848b", repeat: 6 });

const texLoader = new THREE.TextureLoader();
function tex(name: string): THREE.Texture {
  const t = texLoader.load(LAB_ASSETS + "tex/" + name + ".png");
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const textures: KiemTextures = {
  glow: tex("circle_05"),
  flare: tex("star_09"),
  star: tex("star_07"),
  spark: tex("circle_05"),
  trace: tex("trace_06"),
  slash: tex("slash_02"),
  mote: tex("circle_05"),
  smoke: tex("smoke_07"),
  splash: tex("dirt_02"),
  scorch: tex("dirt_03"),
  ring: tex("circle_02"),
};
const ribbonNoise = tex("smoke_01");

const herd = new LabHerd();
const caster = new LabCaster();
view.layers.actors.add(herd.group, caster.root);

// Camera kick and hit stop, owned by the lab (the game has its own in feedback-profile.ts).
const camBase = new THREE.Vector3();
let camKick = 0;
let kickX = 0;
let kickZ = 0;
let stopLeft = 0;

const hostApi: KiemHost = {
  layer: view.layers.fx,
  camera: view.camera,
  targets: herd,
  caster(out) {
    out.x = caster.x;
    out.z = caster.z;
    out.fx = caster.fx;
    out.fz = caster.fz;
  },
  hand(out) {
    caster.hand(out);
  },
  flash(at, colour, intensity) {
    view.stage.flash(at, colour, intensity);
  },
  impulse(px, dx, dz) {
    const l = Math.hypot(dx, dz) || 1;
    camKick = Math.max(camKick, px);
    kickX = dx / l;
    kickZ = dz / l;
  },
  hitStop(ms) {
    stopLeft = Math.max(stopLeft, ms / 1000);
  },
  moveCaster(x, z) {
    caster.moveTo(x, z);
  },
  play(clip: CasterClip) {
    caster.play(clip);
  },
};
const fx = new KiemFx(hostApi, { ...textures }, quality);
void ribbonNoise;

// An enemy blow for the guard demo: a red bolt (enemy colour, canon §21.1) from a beast to the caster.
const enemyBolt = new SpritePool(8, textures.glow, "add", "camera", 16);
view.layers.fx.add(enemyBolt.mesh);
const bolt = { active: false, x: 0, z: 0, t: 0 };
function enemyShot(): void {
  const b = herd.nearest(caster.x, caster.z - 6, 8);
  bolt.active = true;
  bolt.x = b >= 0 ? herd.x(b) : caster.x + 4;
  bolt.z = b >= 0 ? herd.z(b) : caster.z - 6;
  bolt.t = 0;
}
function updateBolt(dt: number): void {
  if (!bolt.active) return;
  const dx = caster.x - bolt.x;
  const dz = caster.z - bolt.z;
  const d = Math.hypot(dx, dz);
  const step = 9 * dt;
  if (d <= 2.1) {
    bolt.active = false;
    if (!fx.block(bolt.x, bolt.z)) view.stage.flash(new THREE.Vector3(caster.x, 1, caster.z), "#ff4a4a", 6);
    return;
  }
  bolt.x += (dx / d) * step;
  bolt.z += (dz / d) * step;
  const s = enemyBolt.spec.reset();
  s.x = bolt.x;
  s.y = 1.0;
  s.z = bolt.z;
  s.life = 0.12;
  s.size0 = 0.55;
  s.size1 = 0.3;
  s.r = 3.2;
  s.g = 0.55;
  s.b = 0.5;
  enemyBolt.emit();
}

// Typing simulation: letters at the chosen WPM (5 letters a word), the charge follows them.
interface Typing {
  slot: KiemSlot;
  letters: number;
  typed: number;
  next: number;
  tx: number;
  tz: number;
}
let typing: Typing | null = null;
const WORD_LEN: Record<KiemSlot, number> = { auto: 0, k1: 5, k2: 6, guard: 5, dash: 4, k4: 6, k5: 8 };
const TARGET: Record<KiemSlot, [number, number]> = { auto: [0, -8], k1: [0, -8], k2: [0.2, -12], guard: [0, 3], dash: [5, 3], k4: [-5, -7], k5: [0, -9] };

function type(slot: KiemSlot): void {
  if (slot === "auto") {
    fx.cast("auto", 0, 0);
    return;
  }
  const [tx, tz] = TARGET[slot];
  if (slot !== "guard" && slot !== "dash") caster.face(tx - caster.x, tz - caster.z);
  typing = { slot, letters: WORD_LEN[slot], typed: 0, next: 0, tx, tz };
}

function updateTyping(dt: number): void {
  if (!typing) return;
  typing.next -= dt;
  const perLetter = 60 / (wpm * 5);
  while (typing && typing.next <= 0) {
    typing.typed += 1;
    typing.next += perLetter;
    const p = typing.typed / typing.letters;
    if (typing.typed >= typing.letters) {
      fx.cast(typing.slot, typing.tx, typing.tz);
      typing = null;
      break;
    }
    fx.setCharge(typing.slot, p, typing.tx, typing.tz);
  }
}

function reset(): void {
  typing = null;
  fx.reset();
  herd.respawnAll();
  caster.moveTo(0, 3);
  caster.face(0, -1);
  bolt.active = false;
  enemyBolt.clear();
  stopLeft = 0;
  camKick = 0;
}

const KEYS: Record<string, KiemSlot> = { "0": "auto", "1": "k1", "2": "k2", "3": "guard", "4": "dash", "5": "k4", "6": "k5" };
window.addEventListener("keydown", (e) => {
  const slot = KEYS[e.key];
  if (slot) type(slot);
  else if (e.key === "b" || e.key === "B") enemyShot();
  else if (e.key === "r" || e.key === "R") reset();
});

// Panel.
if (params.get("ui") !== "0") {
  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;left:12px;top:12px;z-index:10;display:flex;flex-direction:column;gap:6px;font:13px system-ui;color:#e6e9ef";
  const names: [string, string][] = [
    ["0", "Phi Kiếm · Flying Sword"],
    ["1", "Ngự Kiếm Quyết · Threefold Sword Command"],
    ["2", "Nhất Tuyến Xuyên Vân · Cloud-Piercing Line"],
    ["3", "Hồi Kiếm Hộ Thân · Returning Sword Aegis"],
    ["4", "Lưu Quang Bộ · Flowing-Light Step"],
    ["5", "Lạc Kiếm Trận · Falling Sword Array"],
    ["6", "Thiên Hà Kiếm Vũ · Milky-Way Sword Rain"],
    ["B", "Enemy blow (test the guard)"],
    ["R", "Reset"],
  ];
  for (const [key, name] of names) {
    const b = document.createElement("button");
    b.textContent = key + " · " + name;
    b.style.cssText = "text-align:left;padding:6px 10px;background:rgba(14,18,26,.78);color:#e6e9ef;border:1px solid #3a4558;border-radius:6px;cursor:pointer";
    b.onclick = () => window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    panel.append(b);
  }
  const w = document.createElement("label");
  w.textContent = "WPM ";
  const input = document.createElement("input");
  input.type = "number";
  input.value = String(wpm);
  input.style.cssText = "width:60px";
  input.onchange = () => (wpm = Math.max(10, Number(input.value) || 45));
  w.append(input);
  panel.append(w);
  document.body.append(panel);
}

// Loop.
function frame(dt: number): void {
  let world = dt;
  if (stopLeft > 0) {
    stopLeft -= dt;
    world = dt * 0.05;
  }
  updateTyping(world);
  updateBolt(world);
  herd.update(world);
  caster.update(world);
  fx.update(world);
  enemyBolt.update(world);
  // Camera kick: a spring along the blow, in metres (~1 px ≈ 2 cm at this distance).
  if (camBase.lengthSq() === 0) camBase.copy(view.camera.position);
  camKick = Math.max(0, camKick - dt * 30);
  const k = camKick * 0.02 * Math.sin(Math.min(1, camKick / 4) * Math.PI);
  view.camera.position.set(camBase.x + kickX * k, camBase.y, camBase.z + kickZ * k);
  view.render(dt);
}

declare global {
  interface Window {
    __lab?: {
      ready: boolean;
      type(slot: KiemSlot): void;
      cast(slot: KiemSlot, tx: number, tz: number): void;
      enemyShot(): void;
      step(frames: number): void;
      reset(): void;
      setHerd(mode: HerdMode): void;
      setWpm(v: number): void;
      typing(): boolean;
      /** "play" (the game's fixed camera) or "close" on (x, z) at 55° from `distanceM`. */
      camera(mode: "play" | "close", x?: number, z?: number, distanceM?: number): void;
    };
  }
}

void (async () => {
  await Promise.all([herd.load(), caster.load(), look.ready]);
  window.__lab = {
    ready: true,
    type,
    cast: (slot, tx, tz) => fx.cast(slot, tx, tz),
    enemyShot,
    step(frames: number) {
      for (let i = 0; i < frames; i += 1) frame(1 / 60);
    },
    reset,
    setHerd: (mode) => herd.setMode(mode),
    setWpm: (v) => (wpm = v),
    typing: () => typing !== null,
    camera(mode, x = 0, z = -6, distanceM = 15) {
      if (mode === "play") view.resize();
      else placeCamera(view.camera, 55, distanceM, x, z);
      camBase.copy(view.camera.position);
      frame(1 / 60);
    },
  };
  if (params.get("herd") === "march") herd.setMode("march");
  if (!fixed) {
    let last = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  } else {
    frame(1 / 60);
  }
})();
