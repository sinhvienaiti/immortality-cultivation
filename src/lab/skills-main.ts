/**
 * Skills lab (/skills-lab.html, dev-only, never built): the Kiếm skills on
 * the game's renderer and camera (55°, FOV 28°), the lookdev field and light,
 * stand-in beasts and caster, so the owner reviews each skill before it goes
 * into the game (skill game-vfx-layered "Demo or lab first"; owner 02/11).
 * Keys: 0 Phi Kiếm, 1 Ngự Kiếm Quyết, 2 Nhất Tuyến Xuyên Vân, 3 Hồi Kiếm Hộ
 * Thân, 4 Lưu Quang Bộ, 5 Lạc Kiếm Trận, 6 Thiên Hà Kiếm Vũ, B an enemy blow
 * at the guard, R reset. A key is the word's last correct keystroke (canon
 * D58, instant cast): the release fires on that frame. ?typed=1 (or the
 * panel's checkbox) types the word at the chosen WPM first: the charge
 * follows the letters and the release comes on the last one.
 * Flags: ?q= tier, ?wpm=45, ?typed=1, ?herd=still|march, ?fixed=1 (no rAF: the capture
 * scenario steps frames with __lab.step), ?ui=0 hides the panel,
 * ?weapon=<id> the equipped sword (D55, default clear-wind; weapons.ts): its
 * blade and element colours drive every skill. W cycles the four swords.
 * ?probe=0 turns off the motion probe (motion-probe.ts, read by
 * __lab.metrics(); MOTION_PLAN step 1). __lab.walkTo / walkPath / faceTo move
 * and turn the caster for the movement sequence (lab-motion.mjs).
 * The caster holds the equipped weapon (hand-sword.ts, its GLB with its own
 * maps and its tassel; ?hand=0 hides it, ?grip=tilt,roll,yaw,x,y,z tunes the
 * fist; the wrist keeps it out of Lam's body, body-proxy.ts, ?clear=0 holds it
 * rigid; __lab.handHits checks it against the skinned mesh, __lab.bright reads
 * the bloom pass's bright buffer). ?k5n=<n> sets Thiên Hà's swarm size (≤ K5_MAX) and __lab.perf /
 * __lab.swarm measure its frame cost with the full mesh, the LOD or the
 * stand-in (lab-k5-perf.mjs).
 */
import * as THREE from "three";
import type { Quality } from "../content/types";
import { CameraZoom } from "../view/camera-zoom";
import { createRenderer, placeCamera } from "../view/renderer";
import { K5_MAX, KiemFx, type KiemHost, type KiemSlot, type KiemTextures } from "../view/skills/kiem";
import { loadBladeGeometry, loadWeaponModel, standInBlade } from "../view/skills/blades";
import { SpritePool } from "../view/skills/fxkit";
import { DEFAULT_WEAPON, weaponById, weaponsOf, type WeaponId } from "../view/skills/weapons";
import { CLIP_RELEASE_S, LabCaster, type CasterClip } from "./caster";
import { LabHerd, type HerdMode } from "./herd";
import { applyLook, buildField, LAB_ASSETS } from "./look";
import { collectLayerNames, MotionProbe } from "./motion-probe";
import { CameraKick, FlashLights, smooth01 } from "./feel";
import { ScreenFx, type ImpactRole, type ScreenTier } from "../view/screen-fx";
import { LabBus, type Material } from "./events";
import { DeathFx } from "./death-fx";
import { CasterPresence } from "./presence";
import { DEFAULT_GRIP, HandSword, type GripPose } from "./hand-sword";
import { BodyProxy } from "./body-proxy";

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
// Player zoom (canon D57): the whole field by default, wheel or = / - toward a close view on Lam, Z toggles.
const zoom = new CameraZoom();
/** A fixed camera set by __lab.camera (not "play"): the zoom leaves it alone until "play" again. */
let customCamera = false;
const kick = new CameraKick();
// Screen effects by tier (canon D58 (3), POWER_RESEARCH.md): trauma shake, punch, hit-stop, slow motion,
// darkening, flash and edge split in one pass before the OutputPass. Made before any other overlay, so its
// fallback quad (Low, Medium) draws under the damage numbers. ?fx=0..1 is the accessibility intensity.
const screen = new ScreenFx({ composer: view.stage.composer, composerOn: () => view.stage.bloom.enabled, addOverlay: (o) => view.addOverlay(o) });
screen.intensity = Math.max(0, Math.min(1, Number(params.get("fx") ?? "1")));
/** One event, every listener on the same frame (events.ts). */
const bus = new LabBus();
/** Each lab skill's screen tier: Phi Kiếm a basic blow, Thiên Hà the ultimate, the rest (key 7 too) skills. */
function tierOf(slot: string): ScreenTier {
  return slot === "auto" ? "basic" : slot === "k5" ? "ultimate" : "skill";
}
/** Lab frames drawn (the screen-impact dedupe: hitStop and shake of one blow arrive on one frame). */
let frameNo = 0;
const lastImpact = { frame: -1, slot: "" };
/**
 * KiemFx asks for a hit-stop and a shake per strike (its old per-skill numbers); the tier table decides now.
 * The stop's length tells the role: Lạc Kiếm Trận's 50 ms beats are secondary hits, Nhất Tuyến's lone cut and
 * Thiên Hà's last wave (83 ms) are finishers.
 */
function screenImpact(ms: number): void {
  const slot = fx.striking;
  if (lastImpact.frame === frameNo && lastImpact.slot === slot) return;
  lastImpact.frame = frameNo;
  lastImpact.slot = slot;
  const role: ImpactRole = ms < 0 ? "secondary" : slot === "k4" && ms <= 50 ? "secondary" : ms >= 80 || slot === "k2" ? "finisher" : "primary";
  screen.setFlashColor(fx.paletteOf(slot).flash);
  screen.impact(tierOf(slot), role);
}
bus.on((e) => {
  if (e.kind === "release") {
    if (e.slot !== "k7" && e.slot !== "auto") screen.setFlashColor(fx.paletteOf(e.slot as KiemSlot).flash);
    screen.release(e.tier);
  }
});
/** The release event: on the key's frame, before the VFX cast (they read the hand after the caster's update). */
function emitRelease(slot: string, tx: number, tz: number): void {
  const r = bus.release;
  r.slot = slot;
  r.tier = tierOf(slot);
  r.x = caster.x;
  r.z = caster.z;
  const dx = tx - caster.x;
  const dz = tz - caster.z;
  const l = Math.hypot(dx, dz) || 1;
  r.dx = dx / l;
  r.dz = dz / l;
  r.frame = frameNo;
  r.time = labTime;
  bus.emit(r);
}
/** Lab time on real seconds (the key's time stamp). */
let labTime = 0;
/** The impact sound's material by beast class: swarm and small beasts flesh, the armoured boar and the king stone. */
function materialOf(beastTier: number): Material {
  return beastTier >= 2 ? "stone" : "flesh";
}
/**
 * A blow landed (KiemHost.struck, or a key-7 sword): one impact event (screen, numbers, sound), and a death
 * event when it killed. The basic blow's hit-stop is local: its beast holds still for 14 ms.
 */
function emitImpact(slot: string, target: number, dx: number, dz: number, power: number, role: ImpactRole, killed: boolean, rgb: number): void {
  const e = bus.impact;
  e.slot = slot;
  e.tier = tierOf(slot);
  e.role = role;
  e.target = target;
  e.x = herd.x(target);
  e.y = herd.midY(target);
  e.z = herd.z(target);
  e.dx = dx;
  e.dz = dz;
  e.power = power;
  e.killed = killed;
  e.beastTier = herd.tier(target);
  e.material = materialOf(e.beastTier);
  e.rgb = rgb;
  bus.emit(e);
  if (e.tier === "basic") herd.holdBeast(target, 0.014);
  if (killed) {
    const d = bus.death;
    d.target = target;
    d.x = e.x;
    d.y = e.y;
    d.z = e.z;
    d.dx = dx;
    d.dz = dz;
    d.rgb = rgb;
    d.beastTier = e.beastTier;
    bus.emit(d);
  }
}
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
    screenImpact(ms);
  },
  shake() {
    // A shake with no stop on its frame (Lưu Quang Bộ's arrival): a secondary blow of its tier.
    screenImpact(-1);
  },
  pull(x, z, r, seconds) {
    herd.pull(x, z, r, seconds);
  },
  struck(target, dx, dz, power, light, killed) {
    const slot = fx.striking;
    emitImpact(slot, target, dx, dz, power, light ? "secondary" : "primary", killed, fx.paletteOf(slot).flashHex);
  },
  moveCaster(x, z) {
    caster.moveTo(x, z);
  },
  play(clip: CasterClip) {
    caster.play(clip);
  },
};
const k5n = Number(params.get("k5n") ?? "");
const fx = new KiemFx(hostApi, { ...textures }, quality, Number.isFinite(k5n) && k5n > 0 ? { k5Blades: Math.min(K5_MAX, k5n) } : {});
// ?trim=0: every blade slot drawn, hidden ones too (how BladeSet drew before 02/11; measurement only).
fx.blades.drawAll = params.get("trim") === "0";
/** The weapon in the caster's hand (after load: it hangs off Lam's hand bone) and the body it keeps out of. */
let handSword: HandSword | null = null;
let bodyProxy: BodyProxy | null = null;
/** ?grip=tilt,roll,yaw,x,y,z (degrees, metres); an empty or missing field keeps DEFAULT_GRIP's. */
function gripFromParams(): GripPose {
  const parts = (params.get("grip") ?? "").split(",");
  const d = DEFAULT_GRIP;
  const pick = (i: number, f: number): number => {
    const t = parts[i]?.trim() ?? "";
    const v = Number(t);
    return t !== "" && Number.isFinite(v) ? v : f;
  };
  return { tiltDeg: pick(0, d.tiltDeg), rollDeg: pick(1, d.rollDeg), yawDeg: pick(2, d.yawDeg), x: pick(3, d.x), y: pick(4, d.y), z: pick(5, d.z) };
}
void ribbonNoise;
// Deaths that change the silhouette: a light burst, spirit threads and ink flecks on the death event's frame.
const deathFx = new DeathFx(view.layers.fx, { flare: textures.flare, shock: textures.shock, splash: textures.splash, glow: textures.glow }, quality === "low");
bus.on((e) => {
  if (e.kind === "death") deathFx.spawn(e.x, e.y, e.z, e.dx, e.dz, e.rgb, e.beastTier);
});
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
        screen.shake(4, 0.12);
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

/**
 * Instant cast (canon D58 (1), the default): a skill key IS the word's last correct keystroke, so the release
 * fires on this frame and the first blade leaves at once. ?typed=1 or the panel's checkbox types the word at
 * the WPM first (the charge follows the letters, the release comes on the last one), as before the power pass.
 */
let typedMode = params.get("typed") === "1";

function type(slot: KiemSlot): void {
  if (slot === "auto" || !typedMode) {
    typing = null;
    probe.lastKey(slot);
    // A release cuts a hit-stop still holding: the body answers the last key within the 50 ms gate.
    screen.cut();
    const [tx, tz] = slot === "auto" ? TARGET.auto : TARGET[slot];
    caster.release(slot, tx, tz);
    emitRelease(slot, tx, tz);
    queueCast(slot, slot === "auto" ? 0 : tx, slot === "auto" ? 0 : tz);
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
      screen.cut();
      caster.release(typing.slot, typing.tx, typing.tz);
      emitRelease(typing.slot, typing.tx, typing.tz);
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
  screen.reset();
  kick.reset();
  presence.reset();
  deathFx.reset();
  lights.reset();
  probe.reset();
  bus.resetCounts();
  caster.resetChecks();
  handSword?.reset();
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
  else if (e.key === "=" || e.key === "+") zoom.zoomIn();
  else if (e.key === "-" || e.key === "_") zoom.zoomOut();
  else if (e.key === "z" || e.key === "Z") zoom.toggle();
});
window.addEventListener(
  "wheel",
  (e) => {
    // The panel scrolls normally; the field zooms.
    if (e.target instanceof Element && e.target.closest("button, input, select, label") !== null) return;
    e.preventDefault();
    zoom.wheel(e.deltaY, e.deltaMode);
  },
  { passive: false },
);

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
    ["Z", "Zoom: close view / whole field (wheel, = and - too)"],
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
  // Typed charge (?typed=1): the word is typed at the WPM before the release; off, a key casts at once (D58).
  const tl = document.createElement("label");
  tl.style.cssText = "display:flex;gap:6px;align-items:center";
  const typedBox = document.createElement("input");
  typedBox.type = "checkbox";
  typedBox.checked = typedMode;
  typedBox.onchange = () => {
    typedMode = typedBox.checked;
    typing = null;
  };
  tl.append(typedBox, document.createTextNode("Typed charge (type the word first)"));
  panel.append(tl);
  // Screen-effect intensity (accessibility: shake, punch, darkening, flash, split; 0 turns them off).
  const il = document.createElement("label");
  il.style.cssText = "display:flex;gap:6px;align-items:center";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = String(Math.round(screen.intensity * 100));
  slider.oninput = () => (screen.intensity = Number(slider.value) / 100);
  il.append(document.createTextNode("Screen effects"), slider);
  panel.append(il);
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
  frameNo += 1;
  labTime += dt;
  // Last frame's roll and punch come off before the camera is placed again.
  screen.restoreCamera(view.camera);
  const world = screen.advance(dt);
  updateTyping(world);
  updateBolt(world);
  herd.update(world);
  caster.update(world);
  flushTyping();
  // The real dt too: timelines on sim ticks (the K4 beats) do not slow in a hit-stop.
  fx.update(world, dt);
  // The weapon in the hand reads this frame's handAway (thrown by Phi Kiếm or Nhất Tuyến) and the typing glow.
  handSword?.update(world, dt, fx, view.camera);
  presence.update(world, dt, caster.x, caster.z, fx);
  deathFx.update(world);
  enemyBolt.update(world);
  // Camera kick (a damped spring along the blow) and shake (strikes), in metres, on real time: they play through a hit-stop.
  // The base pose: the whole-field fit blended toward the close view on Lam (zoom 0 is exactly the fit, so a resize
  // refits too). On real time: zooming stays smooth through a hit-stop.
  if (!customCamera && !followShown) {
    zoom.update(view.camera, view.fit, 0, caster.x, caster.z, dt);
    camBase.copy(view.camera.position);
  } else if (camBase.lengthSq() === 0) camBase.copy(view.camera.position);
  kick.update(dt);
  screen.update(dt, view.camera, innerHeight);
  lights.update(dt);
  const so = screen.offset;
  view.camera.position.set(camBase.x + kick.x + so.x, camBase.y + so.y, camBase.z + kick.z + so.z);
  screen.applyCamera(view.camera);
  view.render(dt);
  // After the draw: world matrices are fresh and the probe reads what was shown.
  if (probeOn) {
    probe.sample(dt);
    caster.check(probe.lastFrame);
  }
}

// A second view of the same frame for captures: the caster close up at 55° (no time passes).
const savedCamPos = new THREE.Vector3();
/** The orbit view's angles (view("orbit")): yaw from the south, pitch above level, degrees; its centre: the right hand or the held sword's middle. */
const orbit = { yawDeg: 30, pitchDeg: 25, onSword: false };
const savedCamQuat = new THREE.Quaternion();
let followShown = false;
function showView(mode: "follow" | "play" | "orbit", distanceM: number): void {
  if (mode === "follow") {
    if (!followShown) {
      savedCamPos.copy(view.camera.position);
      savedCamQuat.copy(view.camera.quaternion);
    }
    followShown = true;
    placeCamera(view.camera, 55, distanceM, caster.x, caster.z, 0.9);
    view.render(0);
  } else if (mode === "orbit") {
    // Inspection: the caster's right hand from an orbit (yaw round it from the south, pitch above the level).
    if (!followShown) {
      savedCamPos.copy(view.camera.position);
      savedCamQuat.copy(view.camera.quaternion);
    }
    followShown = true;
    caster.hand(screenV);
    let dropY = 0.1;
    // The judges' turntable: centred on the sword (tip to pommel end) instead of the fist.
    const segs = orbit.onSword && handSword !== null ? handSword.probeSegments() : [];
    if (segs.length > 0) {
      screenV.addVectors(segs[0]!.b, segs[4]!.b).multiplyScalar(0.5);
      dropY = 0;
    }
    const yaw = (orbit.yawDeg * Math.PI) / 180;
    const pitch = (orbit.pitchDeg * Math.PI) / 180;
    view.camera.position.set(screenV.x + Math.sin(yaw) * Math.cos(pitch) * distanceM, screenV.y + Math.sin(pitch) * distanceM, screenV.z + Math.cos(yaw) * Math.cos(pitch) * distanceM);
    view.camera.lookAt(screenV.x, screenV.y - dropY, screenV.z);
    view.camera.updateMatrixWorld(true);
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
      /**
       * Redraws the current frame from a close camera on the caster ("follow", 55°, `distanceM`), from an orbit round
       * the right hand ("orbit": setOrbit's angles, for the hand prop) or puts the play camera back ("play").
       */
      view(mode: "follow" | "play" | "orbit", distanceM?: number): void;
      /** The orbit view's yaw (from the south) and pitch (above level), degrees; `onSword` centres it on the held sword. */
      setOrbit(yawDeg: number, pitchDeg: number, onSword?: boolean): void;
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
      /** Canon D57 zoom: with a value 0 (whole field) to 1 (close view on Lam) jumps there; returns the shown zoom. */
      zoom(value?: number): number;
      /** The hand prop's state (loaded, dissolve, jade and core levels, length, triangles) and its grip. */
      hand(): Record<string, unknown>;
      /** Tunes the grip (degrees, metres in the hand's frame); missing fields keep theirs. */
      setGrip(g: Partial<GripPose>): void;
      /** Shows or hides the hand prop. */
      showHand(on: boolean): void;
      /** Lab debugging: shows or hides a part ("swarm", "blades", every other "fx" layer, "actors") and redraws the frame. */
      debugShow(part: "swarm" | "blades" | "fx" | "actors", on: boolean): void;
      /** Forces the hand prop's jade and ridge-core levels (−1: live), for the bloom check. */
      forceHandGlow(jade: number, core: number): void;
      /**
       * The bloom pass's bright buffer as last drawn (threshold 1): pixels over it (luminance > 0.002), their summed
       * luminance, the brightest and the non-finite ones (half-float Inf or NaN), within the screen box [x0, y0, x1,
       * y1] (shares of the frame, y down).
       */
      bright(x0?: number, y0?: number, x1?: number, y1?: number): { pixels: number; share: number; sum: number; max: number; size: number[]; nonFinite: number; yellow: number; yellowTop: number[][] };
      /**
       * The hand prop against Lam's skinned mesh this frame (a probe, not per frame): every place a sword segment
       * (blade middle and edges, across the guard, the pommel) crosses the body, with the bone that owns it, and the
       * tip's and pommel's height above the paving.
       */
      handHits(): { hits: { part: string; t: number; bone: string }[]; tipY: number; endY: number; axis?: number[] } | null;
      /**
       * Steps `frames` frames of `dt` and times each (CPU of the frame, then a 1-pixel read that waits for the GPU):
       * per-frame ms (cpu, total), draw calls, triangles, blades drawn (hero, swarm) and the GPU string.
       */
      perf(frames: number, dt?: number): { cpu: number[]; total: number[]; drawCalls: number; triangles: number; hero: number; swarm: number; gpu: string; k5n: number };
      /** The screen effects shown this frame (darkening, flash, split, shake px, roll, punch, world speed). */
      screen(): Record<string, number | boolean>;
      /** Screen-effect intensity 0–1 (accessibility). */
      setFx(intensity: number): void;
      /** Event counts since the last reset (release, impact, death, flyby, world, callout). */
      events(): Record<string, number>;
      /** The swarm's geometry: the weapon's full mesh, its LOD (WeaponDef.swarm) or the stand-in jian; resolves its triangle count. */
      swarm(mode: "full" | "lod" | "standin"): Promise<number>;
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
  // The weapon in the right hand (after the probe and presence attach: they never see its mesh).
  const handBone = caster.model?.getObjectByName("hand_r") ?? null;
  if (handBone !== null) {
    handSword = new HandSword(handBone, view.layers.actors, gripFromParams());
    handSword.enabled = params.get("hand") !== "0";
    // The body the sword keeps out of: every part but the holding arm and the tail (?clear=0: rigid in the fist).
    bodyProxy = new BodyProxy(caster.model!, ["root", "lowerarm_r", "hand_r", "tail_01", "tail_02", "tail_03", "tail_04", "tail_05"]);
    handSword.setBody(bodyProxy, caster.model!);
    handSword.clearance = params.get("clear") !== "0";
    await handSword.setWeapon(fx.weaponInfo);
    weaponListeners.push((id) => {
      const def = weaponById(id);
      if (def !== undefined) void handSword?.setWeapon(def);
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
      screen.cut();
      caster.release(slot, tx, tz);
      emitRelease(slot, tx, tz);
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
    setOrbit(yawDeg, pitchDeg, onSword = false) {
      orbit.yawDeg = yawDeg;
      orbit.pitchDeg = pitchDeg;
      orbit.onSword = onSword;
    },
    caster: () => ({ x: caster.x, z: caster.z, fx: caster.fx, fz: caster.fz }),
    reset,
    setHerd: (mode) => herd.setMode(mode),
    setWpm: (v) => (wpm = v),
    typing: () => typing !== null,
    boltActive: () => bolt.active,
    setWeapon,
    weapon: () => fx.weapon,
    zoom(value) {
      if (value !== undefined) {
        customCamera = false;
        zoom.set(value);
        frame(0);
      }
      return zoom.value;
    },
    camera(mode, x = 0, z = -6, distanceM = 15) {
      customCamera = mode !== "play";
      zoom.set(0);
      if (mode === "play") view.resize();
      else placeCamera(view.camera, 55, distanceM, x, z);
      camBase.copy(view.camera.position);
      frame(1 / 60);
    },
    hand: () => ({
      ...(handSword?.info ?? { loaded: false }),
      grip: handSword?.gripPose ?? null,
      body: bodyProxy === null ? null : bodyProxy.names.map((n, k) => n + " " + bodyProxy!.radius[k]!.toFixed(3)),
    }),
    setGrip(g) {
      if (handSword !== null) handSword.setGrip({ ...handSword.gripPose, ...g });
    },
    showHand(on) {
      if (handSword !== null) handSword.enabled = on;
    },
    debugShow(part, on) {
      // Lab debugging: hide a part and redraw this frame (no time passes).
      if (part === "swarm") {
        if (fx.blades.swarm !== null) fx.blades.swarm.visible = on;
      } else if (part === "blades") fx.blades.mesh.visible = on;
      else if (part === "fx") {
        for (const c of view.layers.fx.children) if (c !== fx.blades.mesh) c.visible = on;
      } else view.layers.actors.visible = on;
      view.render(0);
    },
    forceHandGlow(jade, core) {
      if (handSword !== null) {
        handSword.force.jade = jade;
        handSword.force.core = core;
      }
    },
    bright(x0 = 0, y0 = 0, x1 = 1, y1 = 1) {
      const rt = view.stage.bloom.renderTargetBright;
      const w = rt.width;
      const h = rt.height;
      const buf = new Uint16Array(w * h * 4);
      view.stage.renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
      let pixels = 0;
      let sum = 0;
      let max = 0;
      let all = 0;
      let nonFinite = 0;
      const yellow: number[][] = [];
      // Render-target rows run bottom-up.
      for (let y = Math.floor(y0 * h); y < Math.floor(y1 * h); y += 1) {
        const row = h - 1 - y;
        for (let x = Math.floor(x0 * w); x < Math.floor(x1 * w); x += 1) {
          const o = (row * w + x) * 4;
          if ((buf[o]! & 0x7c00) === 0x7c00 || (buf[o + 1]! & 0x7c00) === 0x7c00 || (buf[o + 2]! & 0x7c00) === 0x7c00) nonFinite += 1;
          const l = 0.2126 * THREE.DataUtils.fromHalfFloat(buf[o]!) + 0.7152 * THREE.DataUtils.fromHalfFloat(buf[o + 1]!) + 0.0722 * THREE.DataUtils.fromHalfFloat(buf[o + 2]!);
          all += 1;
          const rr = THREE.DataUtils.fromHalfFloat(buf[o]!);
          const gg = THREE.DataUtils.fromHalfFloat(buf[o + 1]!);
          const bb = THREE.DataUtils.fromHalfFloat(buf[o + 2]!);
          // The most yellow bright pixels (red and green over blue): a hue no Kiếm palette has.
          if (l > 0.002 && (rr + gg) / 2 - bb > 0.3 * l) yellow.push([x, y, +rr.toFixed(2), +gg.toFixed(2), +bb.toFixed(2)]);
          if (l > 0.002) {
            pixels += 1;
            sum += l;
            if (l > max) max = l;
          }
        }
      }
      yellow.sort((a, b) => b[2]! + b[3]! - b[4]! * 2 - (a[2]! + a[3]! - a[4]! * 2));
      return { pixels, share: pixels / Math.max(1, all), sum, max, size: [w, h], nonFinite, yellow: yellow.length, yellowTop: yellow.slice(0, 8) };
    },
    handHits() {
      const model = caster.model;
      if (handSword === null || model === null) return null;
      const segs = handSword.probeSegments();
      if (segs.length === 0) return { hits: [], tipY: -1, endY: -1 };
      const skinned: THREE.SkinnedMesh[] = [];
      model.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
      });
      model.updateMatrixWorld(true);
      for (const s of skinned) {
        s.skeleton.update();
        s.computeBoundingSphere();
      }
      const ray = new THREE.Raycaster();
      const dir = new THREE.Vector3();
      const hits: { part: string; t: number; bone: string }[] = [];
      for (const seg of segs) {
        const len = seg.a.distanceTo(seg.b);
        // Both ways: a segment that starts inside the body only meets back faces going out.
        for (const [from, to] of [[seg.a, seg.b], [seg.b, seg.a]] as const) {
          dir.subVectors(to, from).normalize();
          ray.set(from, dir);
          ray.far = len;
          for (const h of ray.intersectObjects(skinned, false)) {
            const mesh = h.object as THREE.SkinnedMesh;
            const si = mesh.geometry.getAttribute("skinIndex");
            const sw = mesh.geometry.getAttribute("skinWeight");
            let bone = "?";
            if (h.face && si && sw) {
              let best = -1;
              for (let k = 0; k < 4; k += 1) if (best < 0 || sw.getComponent(h.face.a, k) > sw.getComponent(h.face.a, best)) best = k;
              bone = mesh.skeleton.bones[si.getComponent(h.face.a, best)]?.name ?? "?";
            }
            const t = from === seg.a ? h.distance / len : 1 - h.distance / len;
            hits.push({ part: seg.part, t: Math.round(t * 100) / 100, bone });
          }
        }
      }
      const axis = dir.subVectors(segs[0]!.b, segs[0]!.a).normalize();
      return { hits, tipY: segs[0]!.b.y, endY: segs[4]!.b.y, axis: [axis.x, axis.y, axis.z] };
    },
    perf(frames, dt = 1 / 60) {
      const renderer = view.stage.renderer;
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      const cpu: number[] = [];
      const total: number[] = [];
      for (let i = 0; i < frames; i += 1) {
        const t0 = performance.now();
        frame(dt);
        const t1 = performance.now();
        renderer.setRenderTarget(null);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        cpu.push(t1 - t0);
        total.push(performance.now() - t0);
      }
      const info = view.info();
      const drawn = { hero: 0, swarm: 0 };
      fx.blades.drawn(drawn);
      return { cpu, total, drawCalls: info.drawCalls, triangles: info.triangles, hero: drawn.hero, swarm: drawn.swarm, gpu: info.gpu, k5n: Number.isFinite(k5n) && k5n > 0 ? Math.min(K5_MAX, k5n) : -1 };
    },
    screen: () => ({ ...screen.shown }),
    setFx: (k) => (screen.intensity = Math.max(0, Math.min(1, k))),
    events: () => ({ ...bus.counts }),
    async swarm(mode) {
      const def = fx.weaponInfo;
      const hero = await loadBladeGeometry(def.model, def.fit);
      // No LOD file (not built yet): −1, the swarm keeps what it draws.
      if (mode === "lod" && (def.swarm === undefined || (await loadWeaponModel(def.swarm)) === null)) return -1;
      const g = mode === "standin" ? standInBlade() : mode === "lod" ? await loadBladeGeometry(def.swarm, def.fit) : hero;
      fx.blades.setGeometry(hero, g);
      const index = g.getIndex();
      return (index !== null ? index.count : g.getAttribute("position").count) / 3;
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
