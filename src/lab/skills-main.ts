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
 * scenario steps frames with __lab.step), ?ui=0 hides the panel,
 * ?weapon=<id> the equipped sword (D55, default clear-wind; weapons.ts): its
 * blade and element colours drive every skill. W cycles the four swords.
 * ?probe=0 turns off the motion probe (motion-probe.ts, read by
 * __lab.metrics(); MOTION_PLAN step 1). __lab.walkTo / walkPath / faceTo move
 * and turn the caster for the movement sequence (lab-motion.mjs).
 */
import * as THREE from "three";
import type { Quality } from "../content/types";
import { createRenderer, placeCamera } from "../view/renderer";
import { KiemFx, type KiemHost, type KiemSlot, type KiemTextures } from "../view/skills/kiem";
import { SpritePool } from "../view/skills/fxkit";
import { DEFAULT_WEAPON, weaponById, weaponsOf, type WeaponId } from "../view/skills/weapons";
import { CLIP_RELEASE_S, LabCaster, type CasterClip } from "./caster";
import { LabHerd, type HerdMode } from "./herd";
import { applyLook, buildField, LAB_ASSETS } from "./look";
import { collectLayerNames, MotionProbe } from "./motion-probe";
import { CameraKick, CameraShake, FlashLights, HitStop, smooth01 } from "./feel";
import { CasterPresence } from "./presence";

const params = new URLSearchParams(location.search);
const quality = (["low", "medium", "high", "ultra"].includes(params.get("q") ?? "") ? params.get("q") : "high") as Quality;
let wpm = Number(params.get("wpm") ?? "45");
const fixed = params.get("fixed") === "1";
const probeOn = params.get("probe") !== "0";
const probe = new MotionProbe();

const host = document.getElementById("ic-lab");
if (host === null) throw new Error("lab host missing");
const view = createRenderer(host, quality);
const look = applyLook(view, { exposure: Number(params.get("exposure") ?? "0.72"), bloom: Number(params.get("bloom") ?? "0.45") });
// Mid-dark paving, as the map concept asks for the Kết Giới (word tags and skills read on it).
buildField(view, { tint: params.get("ground") ?? "#7c848b", repeat: 6 });

const texLoader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
/** A Kenney CC0 particle texture (art-src/lab/tex), loaded once however many layers share it. */
function tex(name: string): THREE.Texture {
  let t = texCache.get(name);
  if (t === undefined) {
    t = texLoader.load(LAB_ASSETS + "tex/" + name + ".png");
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(name, t);
  }
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
  shock: tex("circle_03"),
  halo: tex("light_01"),
  twirl: tex("twirl_01"),
};
const ribbonNoise = tex("smoke_01");

const herd = new LabHerd();
const caster = new LabCaster();
view.layers.actors.add(herd.group, caster.root);

// Camera kick, hit stop and impact lights, owned by the lab (the game has its own in feedback-profile.ts): feel.ts.
const camBase = new THREE.Vector3();
const kick = new CameraKick();
// Camera shake on strikes (round 2 "weight"): 0.1–0.2 m dying in ~120 ms, halved at Low, × 0.75 at Medium.
const shake = new CameraShake(quality === "low" ? 0.5 : quality === "medium" ? 0.75 : 1);
const stop = new HitStop();
/** About 2 cm of kick per "px" a skill asks for (the old lab scale). */
const KICK_M_PER_PX = 0.02;
// The kit stage's one impact light jumps to each new flash at full strength: the lab lights its flashes itself.
view.stage.impactLight.removeFromParent();
const lights = new FlashLights(view.layers.fx, quality === "low" ? 1 : quality === "medium" ? 2 : 3);

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
    probe.flash();
    lights.flash(at, view.camera.position, colour, intensity);
  },
  impulse(px, dx, dz) {
    const l = Math.hypot(dx, dz) || 1;
    kick.impulse(px * KICK_M_PER_PX, dx / l, dz / l);
  },
  hitStop(ms) {
    stop.start(ms);
  },
  shake(metres) {
    shake.add(metres);
  },
  pull(x, z, r, seconds) {
    herd.pull(x, z, r, seconds);
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
// The caster's presence: a ground ring and a key rim that follow it, and the sparks of a blow landing on it (presence.ts).
const presence = new CasterPresence(view.layers.fx, textures.glow, textures.shock);

// The equipped sword (D55). Only swords: the sabre and spear skills are not built yet.
const SWORDS = weaponsOf("sword");
const weaponListeners: ((id: WeaponId) => void)[] = [];
async function setWeapon(id: string): Promise<boolean> {
  const def = weaponById(id);
  if (def === undefined) {
    console.warn(`[lab] unknown weapon "${id}"; swords: ${SWORDS.map((w) => w.id).join(", ")}`);
    return false;
  }
  const ok = await fx.setWeapon(def);
  if (ok) for (const f of weaponListeners) f(def.id);
  return ok;
}
function cycleWeapon(): void {
  const i = SWORDS.findIndex((w) => w.id === fx.weapon);
  void setWeapon(SWORDS[(i + 1) % SWORDS.length]!.id);
}

// An enemy blow for the guard demo: a red bolt (enemy colour, canon §21.1) from a beast to the caster.
const enemyBolt = new SpritePool(8, textures.glow, "add", "camera", 16);
view.layers.fx.add(enemyBolt.mesh);
// The bolt sheds its light at a rate (60/s, the same at any frame rate), easing in over 0.1 s, and fades
// where it struck for 0.1 s instead of vanishing (MOTION_PLAN step 3).
const bolt = { active: false, x: 0, z: 0, t: 0, acc: 0, end: -1 };
function enemyShot(): void {
  const b = herd.nearest(caster.x, caster.z - 6, 8);
  bolt.active = true;
  bolt.x = b >= 0 ? herd.x(b) : caster.x + 4;
  bolt.z = b >= 0 ? herd.z(b) : caster.z - 6;
  bolt.t = 0;
  bolt.acc = 0;
  bolt.end = -1;
}
function updateBolt(dt: number): void {
  if (!bolt.active) return;
  bolt.t += dt;
  if (bolt.end < 0) {
    const dx = caster.x - bolt.x;
    const dz = caster.z - bolt.z;
    const d = Math.hypot(dx, dz);
    const step = 9 * dt;
    if (d <= 2.1) {
      bolt.end = 0;
      if (!fx.block(bolt.x, bolt.z)) {
        // The caster shows the blow as a red-white rim flash and a stagger (caster.hit); no red light over the body.
        probe.event("hit");
        caster.hit(bolt.x, bolt.z);
        presence.hit(caster.x, caster.z, bolt.x, bolt.z);
        shake.add(0.12);
      }
    } else {
      bolt.x += (dx / d) * step;
      bolt.z += (dz / d) * step;
    }
  } else {
    bolt.end += dt;
    if (bolt.end >= 0.1) {
      bolt.active = false;
      return;
    }
  }
  const k = smooth01(bolt.t / 0.1) * (bolt.end < 0 ? 1 : 1 - smooth01(bolt.end / 0.1));
  bolt.acc += 60 * dt;
  while (bolt.acc >= 1) {
    bolt.acc -= 1;
    emitBolt(k);
  }
}
function emitBolt(k: number): void {
  const s = enemyBolt.spec.reset();
  s.a = k;
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
    probe.lastKey("auto");
    // A release cuts a hit-stop still holding: the body answers the last key within the 50 ms gate (feel.ts cut).
    stop.cut();
    caster.release("auto", TARGET.auto[0], TARGET.auto[1]);
    queueCast("auto", 0, 0);
    return;
  }
  probe.event("type", slot);
  const [tx, tz] = TARGET[slot];
  // The body turns to the word's target while it is typed (the dash too: it leaves that way).
  if (slot !== "guard") caster.face(tx - caster.x, tz - caster.z);
  typing = { slot, letters: WORD_LEN[slot], typed: 0, next: 0, tx, tz };
}

// Keys and casts reach the VFX after the caster's update, so they leave from the hand as drawn (MOTION_PLAN step 2.3).
const pending = { charge: false, cast: false, slot: "auto" as KiemSlot, castSlot: "auto" as KiemSlot, p: 0, tx: 0, tz: 0, cx: 0, cz: 0 };
function queueCast(slot: KiemSlot, tx: number, tz: number): void {
  pending.cast = true;
  pending.castSlot = slot;
  pending.cx = tx;
  pending.cz = tz;
}
function flushTyping(): void {
  if (pending.charge) {
    pending.charge = false;
    fx.setCharge(pending.slot, pending.p, pending.tx, pending.tz);
  }
  if (pending.cast) {
    pending.cast = false;
    fx.cast(pending.castSlot, pending.cx, pending.cz);
  }
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
      probe.lastKey(typing.slot);
      stop.cut();
      caster.release(typing.slot, typing.tx, typing.tz);
      queueCast(typing.slot, typing.tx, typing.tz);
      typing = null;
      break;
    }
    caster.charge(typing.slot, p, typing.tx, typing.tz, typing.letters - typing.typed);
    pending.charge = true;
    pending.slot = typing.slot;
    pending.p = p;
    pending.tx = typing.tx;
    pending.tz = typing.tz;
  }
}

function reset(): void {
  typing = null;
  fx.reset();
  herd.respawnAll();
  caster.place(0, 3, 0, -1);
  pending.charge = pending.cast = false;
  bolt.active = false;
  enemyBolt.clear();
  stop.reset();
  kick.reset();
  shake.reset();
  presence.reset();
  lights.reset();
  probe.reset();
  caster.resetChecks();
}

const KEYS: Record<string, KiemSlot> = { "0": "auto", "1": "k1", "2": "k2", "3": "guard", "4": "dash", "5": "k4", "6": "k5" };
window.addEventListener("keydown", (e) => {
  // Keys typed into the panel (the WPM field, the sword list's type-ahead) are not lab hotkeys.
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const slot = KEYS[e.key];
  if (slot) type(slot);
  else if (e.key === "b" || e.key === "B") enemyShot();
  else if (e.key === "r" || e.key === "R") reset();
  else if (e.key === "w" || e.key === "W") cycleWeapon();
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
    ["W", "Next sword"],
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
  // Weapon selector: the four wave-1 swords (WEAPON_DESIGN §6); shapes are the stand-in until their GLBs exist.
  const wl = document.createElement("label");
  wl.textContent = "Sword ";
  const select = document.createElement("select");
  select.style.cssText = "padding:4px 6px;background:rgba(14,18,26,.9);color:#e6e9ef;border:1px solid #3a4558;border-radius:6px";
  for (const def of SWORDS) {
    const o = document.createElement("option");
    o.value = def.id;
    o.textContent = `${def.name} · ${def.element}`;
    o.title = def.mark;
    select.append(o);
  }
  select.value = fx.weapon;
  select.onchange = () => void setWeapon(select.value);
  weaponListeners.push((id) => (select.value = id));
  wl.append(select);
  panel.append(wl);
  document.body.append(panel);
}

// Loop.
function frame(dt: number): void {
  // Hit-stop: part frames counted, an eased exit (feel.ts). The world runs on per-second rates and
  // time-sampled trails, so a variable rAF step shows the same motion at 60 and 120 Hz (appendix C §2.7).
  const world = stop.advance(dt);
  updateTyping(world);
  updateBolt(world);
  herd.update(world);
  caster.update(world);
  flushTyping();
  // The real dt too: timelines on sim ticks (the K4 beats) do not slow in a hit-stop.
  fx.update(world, dt);
  presence.update(world, dt, caster.x, caster.z, fx);
  enemyBolt.update(world);
  // Camera kick (a damped spring along the blow) and shake (strikes), in metres, on real time: they play through a hit-stop.
  if (camBase.lengthSq() === 0) camBase.copy(view.camera.position);
  kick.update(dt);
  shake.update(dt, view.camera);
  lights.update(dt);
  view.camera.position.set(camBase.x + kick.x + shake.x, camBase.y + shake.y, camBase.z + kick.z + shake.z);
  view.render(dt);
  // After the draw: world matrices are fresh and the probe reads what was shown.
  if (probeOn) {
    probe.sample(dt);
    caster.check(probe.lastFrame);
  }
}

// A second view of the same frame for captures: the caster close up at 55° (no time passes).
const savedCamPos = new THREE.Vector3();
const savedCamQuat = new THREE.Quaternion();
let followShown = false;
function showView(mode: "follow" | "play", distanceM: number): void {
  if (mode === "follow") {
    if (!followShown) {
      savedCamPos.copy(view.camera.position);
      savedCamQuat.copy(view.camera.quaternion);
    }
    followShown = true;
    placeCamera(view.camera, 55, distanceM, caster.x, caster.z, 0.9);
    view.render(0);
  } else if (followShown) {
    followShown = false;
    view.camera.position.copy(savedCamPos);
    view.camera.quaternion.copy(savedCamQuat);
    view.camera.updateMatrixWorld(true);
  }
}
const screenV = new THREE.Vector3();

declare global {
  interface Window {
    __lab?: {
      ready: boolean;
      type(slot: KiemSlot): void;
      cast(slot: KiemSlot, tx: number, tz: number): void;
      enemyShot(): void;
      /** Steps `frames` frames of `dt` seconds (default 1/60). */
      step(frames: number, dt?: number): void;
      /** One frame of `dt`; returns [probe frame, caster screen x, y (CSS px, chest height)]. */
      tick(dt?: number): [number, number, number];
      /** Walks through [x, z, speed m/s, …] (the Animator: speed springs, walk ↔ run, strafe with `keepFacing`). */
      walkPath(points: number[], keepFacing?: boolean): void;
      walkTo(x: number, z: number, speedMps: number, keepFacing?: boolean): void;
      /** Turns to face the point (yaw spring; turn in place past 60°). */
      faceTo(x: number, z: number): void;
      moving(): boolean;
      /** A scenario phase label in the probe's markers. */
      mark(label: string): void;
      /** The motion probe's report (MOTION_PLAN step 1). */
      metrics(): Record<string, unknown>;
      /** The Animator's state and its clip analysis (strike timings, gaits; MOTION_PLAN step 2). */
      anim(): Record<string, unknown>;
      /** Redraws the current frame from a close camera on the caster ("follow", 55°, `distanceM`) or puts the play camera back ("play"). */
      view(mode: "follow" | "play", distanceM?: number): void;
      caster(): { x: number; z: number; fx: number; fz: number };
      reset(): void;
      setHerd(mode: HerdMode): void;
      setWpm(v: number): void;
      typing(): boolean;
      /** True while the test enemy bolt is still flying at the caster. */
      boltActive(): boolean;
      /** Equips a sword by id (D55); resolves false for an unknown id or a sabre or spear. */
      setWeapon(id: string): Promise<boolean>;
      /** The equipped weapon's id. */
      weapon(): string;
      /** "play" (the game's fixed camera) or "close" on (x, z) at 55° from `distanceM`. */
      camera(mode: "play" | "close", x?: number, z?: number, distanceM?: number): void;
    };
  }
}

void (async () => {
  const wanted = params.get("weapon") ?? DEFAULT_WEAPON;
  const equipped = setWeapon(wanted).then((ok) => (ok ? true : setWeapon(DEFAULT_WEAPON)));
  await Promise.all([herd.load(), caster.load(), look.ready, equipped]);
  if (caster.model !== null) {
    presence.attach(caster.model);
    const names = collectLayerNames(fx, new Map());
    collectLayerNames(presence, names);
    names.set(enemyBolt.mesh, "enemyBolt");
    probe.attach({
      root: caster.root,
      model: caster.model,
      heightM: caster.heightM,
      clips: caster.clipKeys.map((key, i) => ({ key, action: caster.clipActions[i]!, loop: LabCaster.loops(key), releaseS: CLIP_RELEASE_S[key], refClip: caster.clipRefs[i] ?? undefined })),
      fxLayer: view.layers.fx,
      layerNames: names,
      blades: fx.blades,
      flashLayers: ["flare", "star", "glow", "spark", "motes", "shock", "groundShock", "groundRing", "beams", "slash", "backGlow", "backStar", "hitSparks", "hitRing"],
    });
  }
  caster.onState = (kind, detail) => {
    if (kind === "clip") probe.clip(detail);
    else probe.event(kind, detail);
  };
  caster.start();
  window.__lab = {
    ready: true,
    type,
    // The caster acts the slot first: KiemHost.play names only a clip (K4 asks for Skill2 like the guard, K1 for Attack
    // like Phi Kiếm), so a cast left to play() acted the wrong skill (review fix).
    cast: (slot, tx, tz) => {
      stop.cut();
      caster.release(slot, tx, tz);
      fx.cast(slot, tx, tz);
    },
    enemyShot,
    step(frames: number, dt = 1 / 60) {
      for (let i = 0; i < frames; i += 1) frame(dt);
    },
    tick(dt = 1 / 60) {
      frame(dt);
      screenV.set(caster.x, 0.9, caster.z).project(view.camera);
      return [probe.lastFrame, Math.round((screenV.x * 0.5 + 0.5) * innerWidth), Math.round((-screenV.y * 0.5 + 0.5) * innerHeight)];
    },
    walkPath: (points, keepFacing = false) => caster.walkPath(points, keepFacing),
    walkTo: (x, z, speedMps, keepFacing = false) => caster.walkTo(x, z, speedMps, keepFacing),
    faceTo: (x, z) => caster.faceTo(x, z),
    moving: () => caster.moving,
    mark: (label) => probe.event("phase", label),
    metrics: () => ({ ...probe.metrics(), arms: caster.armReport() }),
    anim: () => caster.debug(),
    view: (mode, distanceM = 6) => showView(mode, distanceM),
    caster: () => ({ x: caster.x, z: caster.z, fx: caster.fx, fz: caster.fz }),
    reset,
    setHerd: (mode) => herd.setMode(mode),
    setWpm: (v) => (wpm = v),
    typing: () => typing !== null,
    boltActive: () => bolt.active,
    setWeapon,
    weapon: () => fx.weapon,
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
