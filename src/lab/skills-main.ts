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
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import type { Quality } from "../content/types";
import { CameraZoom } from "../view/camera-zoom";
import { createRenderer, placeCamera } from "../view/renderer";
import { K5_MAX, KiemFx, type KiemHost, type KiemSlot, type KiemTextures } from "../view/skills/kiem";
import { loadSwordModels, loadWeaponModel, standInModel, type BladeSet } from "../view/skills/blades";
import { SpritePool } from "../view/skills/fxkit";
import { DEFAULT_WEAPON, weaponById, weaponsOf, type WeaponId } from "../view/skills/weapons";
import { CLIP_RELEASE_S, LabCaster, type CasterClip } from "./caster";
import { LabHerd, type HerdMode } from "./herd";
import { applyLook, buildField, LAB_ASSETS } from "./look";
import { collectLayerNames, MotionProbe } from "./motion-probe";
import { CameraKick, FlashLights, smooth01 } from "./feel";
import { SCREEN_TIERS, ScreenFx, ULT_CLIMAX_FRAMES, type ImpactRole, type ScreenTier } from "../view/screen-fx";
import { LabBus, type Material } from "./events";
import { DeathFx } from "./death-fx";
import { VictimDirector } from "./victims";
import { CutIn, CUTIN_ART } from "./cutin";
import { LabSound, type SoundTake } from "./sound";
import { createSkillNumbers } from "../view/hitfx";
import { DamageCompiler } from "../view/damage-compile";
import { Rand } from "../view/skills/fxkit";
import { VAN_KIEM_COLOUR, VAN_KIEM_SWORDS, VanKiemFx, type SwordPose, type VanKiemPhase } from "../view/skills/van-kiem";
import { CasterPresence } from "./presence";
import { SWORD_LIGHT } from "../view/skills/sword-material";
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
// ?dpr=1 pins the pixel ratio (captures and perf runs; otherwise D57's dynamic resolution floats it).
const pinDpr = Number(params.get("dpr") ?? "");
if (pinDpr > 0) view.pinPixelRatio(pinDpr);
const look = applyLook(view, { exposure: Number(params.get("exposure") ?? "0.72"), bloom: Number(params.get("bloom") ?? "0.45") });
const BLOOM_STRENGTH = view.stage.bloom.strength;

/**
 * The post chain (power pass round 3a, P0; ChatGPT's diagnosis of 03/11/2026 asked for it to be checked, not
 * assumed). On High and Ultra a frame is:
 * 1. RenderPass: the scene in LINEAR HDR into the composer's half-float target (MSAA on its two targets, D57). No
 *    tone mapping and no sRGB there: three applies both only when it draws to the screen.
 * 2. HdrProbe (lab only, disabled unless armed): copies that buffer to the CPU, so the values that enter the bloom
 *    can be read (__lab.hdr).
 * 3. UnrealBloomPass: luminance above its threshold (1) spreads, added onto the same linear buffer.
 * 4. ScreenPass (screen-fx.ts): darkening, vignette, desaturation, still on linear HDR.
 * 5. OutputPass: exposure, the renderer's tone mapping (Neutral) and the sRGB encode, from here on display values.
 * 6. Anything after the OutputPass works on display values (round 3a's graphic impact frame).
 * Then renderer.addOverlay draws the damage numbers over the finished frame; the DOM (cut-in, word tags) sits on
 * top. Low and Medium draw straight to the screen (no composer): tone mapping happens in each material.
 */
class HdrProbe extends Pass {
  rgb: Float32Array | null = null;
  width = 0;
  height = 0;
  constructor() {
    super();
    this.needsSwap = false;
    this.enabled = false;
  }
  override render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    const w = read.width;
    const h = read.height;
    const buf = new Uint16Array(w * h * 4);
    renderer.readRenderTargetPixels(read, 0, 0, w, h, buf);
    const rgb = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i += 1) {
      rgb[i * 3] = THREE.DataUtils.fromHalfFloat(buf[i * 4]!);
      rgb[i * 3 + 1] = THREE.DataUtils.fromHalfFloat(buf[i * 4 + 1]!);
      rgb[i * 3 + 2] = THREE.DataUtils.fromHalfFloat(buf[i * 4 + 2]!);
    }
    this.rgb = rgb;
    this.width = w;
    this.height = h;
    this.enabled = false;
  }
}
const hdrProbe = new HdrProbe();
view.stage.composer.insertPass(hdrProbe, Math.max(1, view.stage.composer.passes.findIndex((p) => p instanceof RenderPass) + 1));
const TONE_NAMES: Record<number, string> = { [THREE.NoToneMapping]: "none", [THREE.LinearToneMapping]: "linear", [THREE.NeutralToneMapping]: "neutral", [THREE.ACESFilmicToneMapping]: "aces" };
/** The chain as it stands (P0's record): passes in order, the target's type and colour space, tone mapping, bloom, fog. */
function pipeline(): Record<string, unknown> {
  const c = view.stage.composer;
  const rt = c.renderTarget1;
  const r = view.stage.renderer;
  const fog = view.scene.fog as THREE.Fog | null;
  return {
    passes: c.passes.map((p) => ({ name: p.constructor.name, enabled: p.enabled, needsSwap: p.needsSwap, renderToScreen: p.renderToScreen })),
    composerOn: view.stage.bloom.enabled,
    target: { type: rt.texture.type === THREE.HalfFloatType ? "HalfFloat" : rt.texture.type === THREE.FloatType ? "Float" : String(rt.texture.type), samples: rt.samples, colorSpace: rt.texture.colorSpace || "linear (none)", size: [rt.width, rt.height] },
    renderer: { toneMapping: TONE_NAMES[r.toneMapping] ?? String(r.toneMapping), exposure: r.toneMappingExposure, outputColorSpace: r.outputColorSpace, pixelRatio: r.getPixelRatio() },
    bloom: { strength: view.stage.bloom.strength, radius: view.stage.bloom.radius, threshold: view.stage.bloom.threshold, enabled: view.stage.bloom.enabled },
    fog: fog === null ? null : { near: +fog.near.toFixed(1), far: +fog.far.toFixed(1), color: "#" + fog.color.getHexString() },
  };
}
const savedFog = { near: 0, far: 0 };
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
// Round 2: the darkening dims the world's lights (sun, hemisphere, key, rims, image-based light), so every additive
// VFX layer keeps its light over a dark field; the pass adds a vignette and drains the world's colour.
const worldLights: { light: THREE.Light; base: number }[] = [];
let envBase = -1;
void look.ready.then(() => (envBase = view.scene.environmentIntensity));
function worldLight(k: number): void {
  if (worldLights.length === 0) {
    for (const l of [look.sun, view.stage.hemisphere, view.stage.keyLight, ...view.stage.rimLights]) worldLights.push({ light: l, base: l.intensity });
  }
  for (const w of worldLights) w.light.intensity = w.base * k;
  if (envBase >= 0) view.scene.environmentIntensity = envBase * k;
  // The real skill swords keep the scene's normal light on the darkened field (sword-material.ts SWORD_LIGHT).
  SWORD_LIGHT.value = 1 / Math.max(0.3, k);
}
/**
 * The figures for the graphic impact frame (round 3a, P2): beasts, Lam and the held sword as alpha coverage, drawn
 * with this frame's camera into the pass's half-size mask, the ground and the VFX hidden, one plain material (no
 * lights, no fog, no shadow-map update). Dying beasts show whole for those 1–3 frames.
 */
const maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
const maskClear = new THREE.Color();
function drawActorMask(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void {
  const scene = view.scene;
  const { ground, fx: fxLayer } = view.layers;
  const groundOn = ground.visible;
  const fxOn = fxLayer.visible;
  const background = scene.background;
  const override = scene.overrideMaterial;
  const shadows = renderer.shadowMap.autoUpdate;
  const autoClear = renderer.autoClear;
  renderer.getClearColor(maskClear);
  const clearAlpha = renderer.getClearAlpha();
  ground.visible = false;
  fxLayer.visible = false;
  scene.background = null;
  scene.overrideMaterial = maskMaterial;
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  renderer.render(scene, view.camera);
  renderer.setClearColor(maskClear, clearAlpha);
  renderer.autoClear = autoClear;
  renderer.shadowMap.autoUpdate = shadows;
  scene.overrideMaterial = override;
  scene.background = background;
  ground.visible = groundOn;
  fxLayer.visible = fxOn;
}
const screen = new ScreenFx({ composer: view.stage.composer, composerOn: () => view.stage.bloom.enabled, addOverlay: (o) => view.addOverlay(o), worldLight, drawActorMask });
screen.intensity = Math.max(0, Math.min(1, Number(params.get("fx") ?? "1")));
// The authored impact masks (round 3a, ChatGPT-made sheets of 03/11/2026, white ink on black, used as alpha): radial
// rays and a sword-streak field on the full frames, a burst star and a slash crescent on local hits, a cracked brush
// burst at the climax's strike. Dev assets in art-src (never shipped).
/** The slash crescent mask: key 7's finisher slash takes its shape (round 3b, item 4). */
let slashCrescent: THREE.Texture | null = null;
{
  const dir = "/art-src/skills/impact-tex/";
  const mask = (name: string): THREE.Texture => {
    const t = texLoader.load(dir + name + "-mask.png");
    t.colorSpace = THREE.NoColorSpace;
    return t;
  };
  slashCrescent = mask("slash-crescent");
  screen.setShapes({ rays: mask("radial-rays"), streaks: mask("sword-streak-field"), burst: mask("burst-star"), slash: slashCrescent, crack: mask("cracked-brush-burst") });
}
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
  // The ultimate's climax takes its own graphic states (a dark frame with a white burst, then an inverted brush burst,
  // each held 4 frames) centred on the heaven sword; other finishers their tier's, centred on the blow.
  if (slot === "k5" && role === "finisher") screen.focus(ultAim.x, 1.2, ultAim.z);
  else if (role === "finisher" && lastHit.set) screen.focus(lastHit.x, lastHit.y, lastHit.z);
  screen.impact(tierOf(slot), role, slot === "k5" && role === "finisher" ? ULT_CLIMAX_FRAMES : undefined);
  // The ultimate's last wave is its climax: the world-change sound answers on this frame; the world stays dark a
  // moment for the scars to glow, then the light comes back.
  if (slot === "k5" && role === "finisher") {
    worldEvent("k5", "climax");
    ultDarkEnd = labTime + 0.45;
  }
}
/** The last blow's point (a finisher's graphic frames centre on it; its strike event comes before its stop). */
const lastHit = { x: 0, y: 0, z: 0, set: false };
/** Slot 1 and the basic blow never tint the whole screen (round 2: both judges called the green wash a filter). */
function localOnly(slot: string): boolean {
  return slot === "auto" || slot === "k1";
}
/** The ultimate's held darkening: from its cut-in to a moment after its climax (lab seconds; −1 open-ended). */
let ultDark = false;
let ultDarkEnd = -1;
bus.on((e) => {
  if (e.kind === "release") {
    screen.release(e.tier, localOnly(e.slot));
  } else if (e.kind === "impact" && e.role !== "secondary") {
    // Primary blows take one local graphic frame where they land (an inverted burst), never the whole screen.
    screen.localFlash(e.x, e.y, e.z, e.tier, 1, e.dx, e.dz);
    lastHit.x = e.x;
    lastHit.y = e.y;
    lastHit.z = e.z;
    lastHit.set = true;
  }
});
// Sound hooks (canon D58 (6), sound.ts): files under art-src/lab/audio/<event-id>/, silent when absent; the same
// events as the body, VFX, camera and hit-stop, on the same frame. Audio starts on the first key or click.
const sound = new LabSound();
bus.on((e) => sound.on(e));
const unlockAudio = (): void => sound.unlock();
window.addEventListener("keydown", unlockAudio);
window.addEventListener("pointerdown", unlockAudio);
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
  // Every skill shouts on its release (big ones a donghua line, small ones a cry); Phi Kiếm stays quiet. Thiên
  // Hà's callout comes with its cut-in instead.
  if (slot !== "auto" && slot !== "k5") {
    const c = bus.callout;
    c.slot = slot;
    c.tier = r.tier;
    bus.emit(c);
  }
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
  // The basic shot's and slot 1's target flashes a one-frame white-cyan silhouette (round 3a, P8).
  if ((slot === "auto" || slot === "k1") && role !== "secondary") herd.silhouette(target);
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
// Damage numbers (canon D58 (5)): compiled per target over 150 ms (key 7: 500 ms), a cluster total for 5+ small
// beasts together, gold-edged crits, the skill's colour on the lower stroke. Lab hits are stand-ins: each skill's
// damage comes from canon §12.1 in W (1 W = 90 × g(K), g = 1.12^K; ?realm=K, default 0) with a seeded 15 % crit.
// Elegant serif numerals (Cormorant Garamond, OFL; loaded before the atlas is painted at the first number).
const numbers = createSkillNumbers(view, 140, 'italic 700 54px "Cormorant Garamond", "Be Vietnam Pro", serif');
const compiler = new DamageCompiler(numbers);
const realmG = Math.pow(1.12, Math.max(0, Number(params.get("realm") ?? "0") || 0));
const W_HP = 90 * realmG;
/** Canon §12.1 per blow, in W (key 7 is not in the canon yet: a stand-in). */
const SKILL_W: Record<string, number> = { auto: 0.25, k1: 0.37, k2: 2.5, guard: 0.3, dash: 0.3, k4: 0.15, k5: 2.0, k7: 0.35 };
const critRand = new Rand(1503);
const dmgRand = new Rand(907);
/** Releases so far (an attack id each) and the latest attack of each skill; K2's hits so far in its attack (−15 % each). */
let attacks = 0;
const attackOf: Record<string, number> = {};
/** The latest cast's compiled damage and blows per skill (stand-in numbers; K5 must out-hit key 7, round 3b). */
const castDamage: Record<string, number> = {};
const castHits: Record<string, number> = {};
const hitsOf: Record<string, number> = {};
/** The skill's colour for its numbers (sRGB hex of its halo), cached per slot for the equipped weapon (no key string per blow). */
const numberRgb: Record<string, number> = {};
let numberRgbWeapon = "";
const tmpColour = new THREE.Color();
/** Key 7's number tint (linear): Clear Wind's jade-cyan. */
const VAN_KIEM_TINT = VAN_KIEM_COLOUR;
/** The clock key 7's sweep starts (s, F192). */
const VAN_SWEEP_AT = 192 / 60;
function skillRgb(slot: string): number {
  if (numberRgbWeapon !== fx.weapon) {
    for (const k of Object.keys(numberRgb)) delete numberRgb[k];
    numberRgbWeapon = fx.weapon;
  }
  let v = numberRgb[slot];
  if (v === undefined) {
    const h = slot === "k7" ? VAN_KIEM_TINT : fx.paletteOf(slot as KiemSlot).halo;
    v = tmpColour.setRGB(h[0], h[1], h[2]).getHex(THREE.SRGBColorSpace);
    numberRgb[slot] = v;
  }
  return v;
}
bus.on((e) => {
  if (e.kind === "release") {
    attacks += 1;
    attackOf[e.slot] = attacks;
    hitsOf[e.slot] = 0;
    castDamage[e.slot] = 0;
    castHits[e.slot] = 0;
    // Field-wide, ultimate and multi-target skills show one running headline total at the top of the view (round
    // 3a: their small blows count only there).
    if (e.slot === "k7" || e.slot === "k5" || e.slot === "k2" || e.slot === "k4") compiler.headline(attacks);
  } else if (e.kind === "impact") {
    const n = hitsOf[e.slot] ?? 0;
    hitsOf[e.slot] = n + 1;
    let w = SKILL_W[e.slot] ?? 0.3;
    if (e.slot === "k2") w *= Math.max(0.4, 1 - 0.15 * n);
    if (e.role === "finisher" && e.slot === "k7") w = 1.5;
    if (e.role === "secondary" && e.slot !== "k4" && e.slot !== "k7") w *= 0.6;
    const crit = critRand.next() < 0.15;
    const dmg = w * W_HP * dmgRand.range(0.92, 1.08) * (crit ? 1.5 : 1);
    castDamage[e.slot] = (castDamage[e.slot] ?? 0) + dmg;
    castHits[e.slot] = (castHits[e.slot] ?? 0) + 1;
    // Key 7 is an area attack: its blows on small beasts add up per 8 m cell over 1 s (about 70 % fewer numbers).
    compiler.add(attackOf[e.slot] ?? 0, e.target, dmg, crit, e.x, e.y, e.z, skillRgb(e.slot), e.beastTier, 0.15, e.role === "finisher" || e.power >= 0.9, e.slot === "k7");
    if (e.role === "finisher") compiler.finisher(attackOf[e.slot] ?? 0);
  }
});
// Deaths that change the silhouette: a light burst, spirit threads and ink flecks on the death event's frame.
/** Set while key 7 lands a blow: its deaths dissolve into ink and qi motes. */
let inkDeath = false;
const deathFx = new DeathFx(view.layers.fx, { flare: textures.flare, shock: textures.shock, splash: textures.splash, glow: textures.glow, scorch: textures.scorch }, quality === "low");
// Victim tiers (round 3a, P6): per cast of key 7 or K5, a few hero victims launched and pinned by a planted sword,
// a shared hop for the secondary ones, the rim flash and dissolve for the rest; a hero's kill bursts after its pin.
const victims = new VictimDirector(
  view.layers.fx,
  herd,
  { ring: textures.ring, star: textures.star, scorch: textures.scorch },
  view.camera,
  () => ({ width: innerWidth, height: innerHeight }),
  (x, y, z, dx, dz, rgb, beastTier) => deathFx.spawn(x, y, z, dx, dz, rgb, beastTier),
);
bus.on((e) => {
  if (e.kind === "release") victims.cast(e.slot);
  else if (e.kind === "impact") victims.impact(e, frameNo);
  else if (e.kind === "death" && !herd.isHero(e.target)) {
    // Key 7's deaths dissolve into ink and qi motes (round 3b, item 4); the other skills keep their light burst.
    if (inkDeath) deathFx.dissolve(e.x, e.y, e.z, e.dx, e.dz, e.beastTier);
    else deathFx.spawn(e.x, e.y, e.z, e.dx, e.dz, e.rgb, e.beastTier);
  }
});
// Key 7, Vạn Kiếm Triều Tông (canon D58 (2), POWER_RESEARCH): the field-wide prototype on the skill tier with an
// ultimate-strength finisher. Its timeline calls the screen effects and the bus on the frame each phase starts.
function worldEvent(slot: string, phase: "open" | "hush" | "climax" | "close"): void {
  const w = bus.world;
  w.slot = slot;
  w.phase = phase;
  bus.emit(w);
}
const van = new VanKiemFx(
  {
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
    struck(target, dx, dz, power, role, killed) {
      // The first of the eight blades is the volley's primary blow (one stop); the others land as secondary hits.
      if (role === "primary" && !vanFirstHit) {
        vanFirstHit = true;
        screen.impact("skill", "primary");
      } else if (role === "primary") screen.impact("skill", "secondary");
      // The hunt's hundreds of blows hold a low rumble under the shake (never stacking into a constant jolt).
      else if (role === "secondary" && van.clock < VAN_SWEEP_AT) screen.rumble(2.6, 0.14);
      // The finisher's cut flashes each body white on its blow (round 3b, item 4).
      if (van.clock >= VAN_SWEEP_AT) herd.silhouette(target);
      inkDeath = true;
      emitImpact("k7", target, dx, dz, power, role, killed, skillRgb("k7"));
      inkDeath = false;
    },
    phase(p: VanKiemPhase) {
      if (p === "open") {
        // The sky darkens and the world's colour drains while the river runs (the ultimate's held level).
        screen.holdDark(SCREEN_TIERS.ultimate.hold, SCREEN_TIERS.ultimate.desat);
        worldEvent("k7", "open");
      } else if (p === "hush") {
        // A breath before the cut: the world sinks a little deeper before the graphic frames.
        screen.holdDark(Math.min(0.8, SCREEN_TIERS.ultimate.hold + 0.12), SCREEN_TIERS.ultimate.desat);
        worldEvent("k7", "hush");
      }
      else if (p === "climax") {
        // The finisher at ultimate strength: a 100 ms stop, 0.3x slow motion, punch and two graphic frames (dark,
        // inverted) then a hard return; the world stays dark for the scars to glow.
        screen.focus(0, 0.5, -6.5);
        screen.impact("ultimate", "finisher");
        kick.impulse(4 * KICK_M_PER_PX, 0, 1);
        worldEvent("k7", "climax");
      } else if (p === "close") {
        screen.holdDark(SCREEN_TIERS.ultimate.hold * 0.55, SCREEN_TIERS.ultimate.desat * 0.55);
        worldEvent("k7", "close");
      } else if (p === "end") {
        screen.holdDark(0);
        herd.toughness = 1;
      }
    },
    flyby(x, y, z, speed) {
      const f = bus.flyby;
      f.x = x;
      f.y = y;
      f.z = z;
      f.speed = speed;
      bus.emit(f);
    },
    flash(at, colour, intensity) {
      lights.flash(at, view.camera.position, colour, intensity);
    },
  },
  { glow: textures.glow, slash: textures.slash, star: textures.star, ring: textures.ring, scorch: textures.scorch, noise: ribbonNoise, slashMask: slashCrescent },
  VAN_KIEM_SWORDS[quality],
);
/**
 * The ultimate's cut-in (canon D58 (4)): Thiên Hà's last key starts it; the world and the typing timer hold while it
 * plays (lab time), then the skill fires. Style C, ink and light, the owner's pick of 03/11: she gathers with eyes
 * closed, then cuts to the shout on the callout's "天", which starts 1.08 s into callout-k5/01.ogg (retune `shoutAt`
 * with that file); 1.7 s in all.
 */
const cutin = new CutIn(document.body);
const ULT_HOLD = Number(params.get("cutin") ?? "1.7") || 1.7;
/** Holds this short (scenarios pass ?cutin=0.05 to skip the cut-in) show no painting and no cut. */
const ULT_ART = ULT_HOLD >= 0.6 ? CUTIN_ART.c : undefined;
const ULT_CUTIN = {
  name: "MILKY-WAY SWORD RAIN",
  hanzi: "天河劍雨",
  seconds: ULT_HOLD,
  ...(ULT_ART ? { art: ULT_ART } : {}),
  // A shorter hold (?cutin=, the old measurement scenarios pin 0.9) cuts to the shout earlier, never not at all.
  shoutAt: Math.min(1.08, 0.64 * ULT_HOLD),
};
if (ULT_ART) cutin.preload(ULT_ART);
const ultAim = { x: 0, z: -9 };
function startUltimate(tx: number, tz: number): void {
  ultAim.x = tx;
  ultAim.z = tz;
  typing = null;
  cutin.start(ULT_CUTIN);
  // The world stops now: the callout and the world-change sound, a short flash in the skill's colour.
  const c = bus.callout;
  c.slot = "k5";
  c.tier = "ultimate";
  bus.emit(c);
  worldEvent("k5", "open");
  // The world darkens under the cut-in (before the release), so the swords blaze against the dark when it fires.
  ultDark = true;
  ultDarkEnd = -1;
  screen.punch(0.012, 0.2);
}
/** A big skill fires: at the whole-field fit a short dolly push (zoomed in, the wide framing is the camera's move). */
function bigSkillBeat(): void {
  if (zoom.wanted === 0 && zoom.value < 0.02) zoom.push();
}
function fireUltimate(): void {
  probe.lastKey("k5");
  screen.cut();
  bigSkillBeat();
  caster.release("k5", ultAim.x, ultAim.z);
  emitRelease("k5", ultAim.x, ultAim.z);
  queueCast("k5", ultAim.x, ultAim.z);
}
/** Key 7 waits for the caster's update (its blades leave from the hand as drawn), like the other casts. */
let pendingVan = false;
let vanFirstHit = false;
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
  if (ok) {
    await van.setWeapon(def);
    // The pinned swords of the hero victims: the same real sword (its full model).
    victims.setSword((await loadSwordModels(def)).full);
    for (const f of weaponListeners) f(def.id);
  }
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

/** A lab key's skill: the seven Kiếm slots, and key 7's field-wide prototype (always cast at once). */
type LabSlot = KiemSlot | "k7";

function type(slot: LabSlot): void {
  // Keys wait while the cut-in holds the world (the typing timer is stopped too).
  if (cutin.active) return;
  if (slot === "k5" && !typedMode) {
    probe.event("cutin", "k5");
    startUltimate(TARGET.k5[0], TARGET.k5[1]);
    return;
  }
  if (slot === "k7") {
    typing = null;
    probe.lastKey("k7");
    screen.cut();
    // The body takes key 7's own release (the motion lane's sky edict, round 3: two fingers up and forward); the
    // eight blades leave the hand.
    caster.release("k7", 0, -8);
    emitRelease("k7", 0, -8);
    bigSkillBeat();
    pendingVan = true;
    vanFirstHit = false;
    // A tide's toughness while key 7 runs: its ~400 dives spread over the herd and the cut still has beasts to cut.
    herd.toughness = 1.4;
    return;
  }
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
  const ce = bus.cast;
  ce.slot = slot;
  ce.x = caster.x;
  ce.z = caster.z;
  bus.emit(ce);
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
  if (pendingVan) {
    pendingVan = false;
    van.cast();
    // The release at the caster (round 3b, item 5): a burst column behind the body and a ground ring, on this frame.
    fx.burst("k1", 3);
    // The first visible action of key 7 (its eight blades leave now): the probe's VFX release.
    probe.flash();
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
    if (typing.typed >= typing.letters && typing.slot === "k5") {
      // Thiên Hà's last letter: the cut-in first, the release when it ends.
      startUltimate(typing.tx, typing.tz);
      break;
    }
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
  victims.reset();
  compiler.reset();
  numbers.clear();
  van.reset();
  cutin.stop();
  ultDark = false;
  ultDarkEnd = -1;
  sound.reset();
  pendingVan = false;
  herd.toughness = 1;
  lights.reset();
  probe.reset();
  bus.resetCounts();
  caster.resetChecks();
  handSword?.reset();
}

const KEYS: Record<string, LabSlot> = { "0": "auto", "1": "k1", "2": "k2", "3": "guard", "4": "dash", "5": "k4", "6": "k5", "7": "k7" };
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
    ["7", "Vạn Kiếm Triều Tông · Ten-Thousand Sword Convergence"],
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
  // The cut-in holds the world (and the typing timer, which runs on world time); its last frame fires the ultimate.
  if (cutin.update(dt)) fireUltimate();
  const world = cutin.active ? 0 : screen.advance(dt);
  // The ultimate's held darkening ends a moment after its climax (key 7 sets its own from its phases).
  if (ultDark && ultDarkEnd >= 0 && labTime >= ultDarkEnd) {
    ultDark = false;
    ultDarkEnd = -1;
    if (!van.running) screen.holdDark(0);
  } else if (ultDark) screen.holdDark(SCREEN_TIERS.ultimate.hold, SCREEN_TIERS.ultimate.desat);
  updateTyping(world);
  updateBolt(world);
  herd.update(world);
  caster.update(world);
  flushTyping();
  // The real dt too: timelines on sim ticks (the K4 beats) do not slow in a hit-stop.
  fx.update(world, dt);
  van.update(world);
  // The weapon in the hand reads this frame's handAway (thrown by Phi Kiếm or Nhất Tuyến) and the typing glow.
  handSword?.update(world, dt, fx, view.camera);
  presence.update(world, dt, caster.x, caster.z, fx);
  deathFx.update(world);
  victims.update(world);
  // Numbers are UI: they compile and float on real time (through a hit-stop or the cut-in).
  compiler.update(dt);
  numbers.update(dt);
  sound.update(dt);
  enemyBolt.update(world);
  // Camera kick (a damped spring along the blow) and shake (strikes), in metres, on real time: they play through a hit-stop.
  // The base pose: the whole-field fit blended toward the close view on Lam (zoom 0 is exactly the fit, so a resize
  // refits too). On real time: zooming stays smooth through a hit-stop.
  // Big skills never leave the frame (power pass round 2): while key 7, the ultimate's cut-in or the ultimate
  // plays, the view eases out to the whole field (0.25 s) and holds; then back to the player's zoom.
  zoom.holdWide(cutin.active || van.running || fx.isRunning("k5"));
  if (!customCamera && !followShown) {
    zoom.update(view.camera, view.fit, 0, caster.x, caster.z, dt);
    camBase.copy(view.camera.position);
  } else if (camBase.lengthSq() === 0) camBase.copy(view.camera.position);
  kick.update(dt);
  screen.update(dt, view.camera);
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
      type(slot: KiemSlot | "k7"): void;
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
      /** The camera's framing now: the player's zoom (wanted, shown), a big skill's wide weight and the camera distance (m). */
      framing(): Record<string, number>;
      /** The hand prop's state (loaded, dissolve, jade and core levels, length, triangles) and its grip. */
      hand(): Record<string, unknown>;
      /** Tunes the grip (degrees, metres in the hand's frame); missing fields keep theirs. */
      setGrip(g: Partial<GripPose>): void;
      /** Shows or hides the hand prop. */
      showHand(on: boolean): void;
      /** Lab debugging: the fx layer's meshes now (render order, shown, instances drawn). */
      fxMeshes(): { order: number; visible: boolean; count: number }[];
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
      /** The screen effects shown this frame (darkening, the graphic impact frame's step and mode, shake px, roll, punch, world speed). */
      screen(): Record<string, number | boolean>;
      /** The post chain as it stands (round 3a, P0): passes in order, target type and colour space, tone mapping, bloom, fog. */
      pipeline(): Record<string, unknown>;
      /**
       * Capture variants of the chain (round 3a, P0), applied and the frame redrawn (no time passes): tone mapping
       * ("neutral" the game's, "linear" exposure and a clamp, "none"), bloom strength (null: the lab's), the screen
       * pass on or off, the fog on or off. post({}) puts everything back.
       */
      post(opts: { tone?: "neutral" | "linear" | "none"; bloom?: number | null; screen?: boolean; fog?: boolean }): Record<string, unknown>;
      /**
       * The linear HDR buffer as it enters the bloom (round 3a, P0), redrawn now: luminance histogram and shares over
       * the box [x0, y0, x1, y1] (shares of the frame, y down), the brightest, and per visible key-7 sword class the
       * peak luminance along its blade (median and max over the swords: what the bloom's threshold of 1 sees).
       */
      hdr(x0?: number, y0?: number, x1?: number, y1?: number): Record<string, unknown>;
      /** Screen-effect intensity 0–1 (accessibility). */
      setFx(intensity: number): void;
      /** Event counts since the last reset (release, impact, death, flyby, world, callout). */
      events(): Record<string, number>;
      /** Damage numbers since the last reset: numbers shown, packets in a total only, live now by kind, dropped by the field. */
      numbers(): Record<string, number>;
      /** The last key-7 or K5 cast's victim tiers (round 3a, P6): heroes (shove and most screen motion, px at 1080p), secondary and background counts. */
      victims(): Record<string, unknown>;
      /** Beast i on screen now (CSS px of its middle), its height in the air (m), alive, a hero victim. */
      beast(i: number): { x: number; y: number; air: number; alive: boolean; hero: boolean };
      /** Key 7's state: its clock (s, −1 idle), swords drawn, strikes so far. */
      van(): { clock: number; shown: number; strikes: number; dives: number };
      /** The cut-in's time (s), −1 when none runs. */
      cutin(): number;
      /** Drawn length (CSS px) of the visible flying blades this frame, Kiếm skills and key 7: count, p10, median. */
      bladePx(): Record<string, number>;
      /** Sound hooks: files found per event id, what was asked since reset (heard or silent), sounds started. */
      sound(): { found: Record<string, number>; asked: Record<string, number>; played: number };
      /**
       * Sound for fixed-step videos: from now the lab logs what it would play on its own clock instead of playing it;
       * resolves when the files are known. Mix the log with scripts/visual/mix-lab-sound.mjs.
       */
      soundRecord(): Promise<void>;
      /** The sounds logged since soundRecord(). */
      soundTakes(): readonly SoundTake[];
      /** The swarm's geometry: the weapon's full mesh, its LOD (WeaponDef.swarm) or the stand-in jian; resolves its triangle count. */
      swarm(mode: "full" | "lod" | "standin"): Promise<number>;
    };
  }
}

void (async () => {
  const wanted = params.get("weapon") ?? DEFAULT_WEAPON;
  const equipped = setWeapon(wanted).then((ok) => (ok ? true : setWeapon(DEFAULT_WEAPON)));
  // The cut-in's and the numbers' fonts, loaded before the first use (a capture never shows a fallback face).
  const fonts = Promise.all([
    document.fonts.load('400 120px "Ma Shan Zheng"', ULT_CUTIN.hanzi),
    // The cut-in's name is set in 700 (its title is laid out from the measured width).
    document.fonts.load('700 36px "Cormorant Garamond"', ULT_CUTIN.name),
    document.fonts.load('italic 700 54px "Cormorant Garamond"', "0123456789.KM×"),
  ]).catch(() => undefined);
  await Promise.all([herd.load(), caster.load(), look.ready, equipped, fonts]);
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
  // The graphic frame's programs (the mask over instanced and skinned figures, the frame) compile now, not on the
  // first climax.
  screen.prewarm(view.stage.renderer);
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
    framing: () => ({ wanted: zoom.wanted, shown: zoom.value, wide: zoom.wideShown, distanceM: view.camera.position.distanceTo(screenV.set(0, 0, view.fit.targetZ)) }),
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
    fxMeshes: () =>
      view.layers.fx.children.map((c) => {
        const g = (c as THREE.Mesh).geometry as THREE.InstancedBufferGeometry | undefined;
        return { order: c.renderOrder, visible: c.visible, count: g?.instanceCount ?? -1 };
      }),
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
    pipeline,
    post(opts) {
      const r = view.stage.renderer;
      const fog = view.scene.fog as THREE.Fog | null;
      r.toneMapping = opts.tone === "linear" ? THREE.LinearToneMapping : opts.tone === "none" ? THREE.NoToneMapping : THREE.NeutralToneMapping;
      view.stage.bloom.strength = opts.bloom === undefined || opts.bloom === null ? BLOOM_STRENGTH : opts.bloom;
      screen.bypass = opts.screen === false;
      if (fog !== null) {
        if (savedFog.far === 0) {
          savedFog.near = fog.near;
          savedFog.far = fog.far;
        }
        if (opts.fog === false) {
          fog.near = 1e5;
          fog.far = 1e5 + 1;
        } else if (fog.near >= 1e5) {
          fog.near = savedFog.near;
          fog.far = savedFog.far;
        }
      }
      screen.update(0, view.camera);
      view.render(0);
      return pipeline();
    },
    hdr(x0 = 0, y0 = 0, x1 = 1, y1 = 1) {
      hdrProbe.enabled = true;
      view.render(0);
      const rgb = hdrProbe.rgb;
      const w = hdrProbe.width;
      const h = hdrProbe.height;
      if (rgb === null || w === 0) return { error: "no read" };
      const lumAt = (x: number, y: number): number => {
        const o = ((h - 1 - y) * w + x) * 3;
        return 0.2126 * rgb[o]! + 0.7152 * rgb[o + 1]! + 0.0722 * rgb[o + 2]!;
      };
      const edges = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16];
      const hist = new Array<number>(edges.length + 1).fill(0);
      let n = 0;
      let sum = 0;
      let max = 0;
      const over: number[] = [];
      for (let y = Math.floor(y0 * h); y < Math.floor(y1 * h); y += 1) {
        for (let x = Math.floor(x0 * w); x < Math.floor(x1 * w); x += 1) {
          const l = lumAt(x, y);
          n += 1;
          sum += l;
          if (l > max) max = l;
          let b = 0;
          while (b < edges.length && l >= edges[b]!) b += 1;
          hist[b] = hist[b]! + 1;
          if (l > 1) over.push(l);
        }
      }
      over.sort((a, b) => a - b);
      const q = (p: number): number => (over.length === 0 ? 0 : +over[Math.min(over.length - 1, Math.floor(p * (over.length - 1)))]!.toFixed(2));
      // Each visible key-7 sword: the brightest pixel within 2 px of 7 points along its blade (base to 90 %).
      const pose: SwordPose = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, len: 0, cls: 0 };
      const cores: number[][] = [[], [], []];
      const pv = new THREE.Vector3();
      for (let i = 0; i < van.swordCount; i += 1) {
        if (!van.poseOf(i, pose)) continue;
        let peak = 0;
        for (let k = 0; k < 7; k += 1) {
          const t = -0.45 + (k / 6) * 0.85;
          pv.set(pose.x + pose.dx * pose.len * t, pose.y + pose.dy * pose.len * t, pose.z + pose.dz * pose.len * t).project(view.camera);
          if (pv.z > 1 || Math.abs(pv.x) > 1 || Math.abs(pv.y) > 1) continue;
          const cx = Math.round((pv.x * 0.5 + 0.5) * w);
          const cy = Math.round((-pv.y * 0.5 + 0.5) * h);
          for (let yy = cy - 2; yy <= cy + 2; yy += 1) {
            for (let xx = cx - 2; xx <= cx + 2; xx += 1) {
              if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
              const l = lumAt(xx, yy);
              if (l > peak) peak = l;
            }
          }
        }
        cores[pose.cls]!.push(peak);
      }
      const summary = (a: number[]): Record<string, number> => {
        const s2 = [...a].sort((p, r) => p - r);
        return { n: s2.length, median: s2.length ? +s2[Math.floor(s2.length / 2)]!.toFixed(2) : 0, p10: s2.length ? +s2[Math.floor(s2.length * 0.1)]!.toFixed(2) : 0, max: s2.length ? +s2[s2.length - 1]!.toFixed(2) : 0 };
      };
      return {
        size: [w, h],
        exposure: view.stage.renderer.toneMappingExposure,
        mean: +(sum / Math.max(1, n)).toFixed(4),
        max: +max.toFixed(2),
        overOne: +(over.length / Math.max(1, n)).toFixed(5),
        overFour: +(over.filter((l) => l > 4).length / Math.max(1, n)).toFixed(5),
        overOneP50: q(0.5),
        overOneP99: q(0.99),
        edges,
        hist: hist.map((c) => +(c / Math.max(1, n)).toFixed(4)),
        swords: { lead: summary(cores[0]!), mid: summary(cores[1]!), far: summary(cores[2]!) },
      };
    },
    setFx: (k) => (screen.intensity = Math.max(0, Math.min(1, k))),
    events: () => ({ ...bus.counts }),
    numbers() {
      // Live numbers by kind (round 3a, P7: at most 2 headlines, 4 victims, 2 crits or elites; 8 in all).
      const f = numbers.field;
      let headlines = 0;
      let crits = 0;
      let victims = 0;
      for (let i = 0; i < f.alive.length; i += 1) {
        if (f.alive[i] === 0) continue;
        if (f.tier[i]! >= 5) headlines += 1;
        else if (f.tier[i]! >= 4) crits += 1;
        else victims += 1;
      }
      return { shown: compiler.shown, totalOnly: compiler.totalOnly, clusters: compiler.clusters, live: numbers.live, headlines, victims, crits, dropped: f.dropped, castK7: castDamage.k7 ?? 0, castK5: castDamage.k5 ?? 0, hitsK7: castHits.k7 ?? 0, hitsK5: castHits.k5 ?? 0 };
    },
    victims: () => victims.report(),
    beast(i) {
      screenV.set(herd.x(i), herd.midY(i) + herd.airY(i), herd.z(i)).project(view.camera);
      return { x: Math.round((screenV.x * 0.5 + 0.5) * innerWidth), y: Math.round((-screenV.y * 0.5 + 0.5) * innerHeight), air: +herd.airY(i).toFixed(2), alive: herd.alive(i), hero: herd.isHero(i) };
    },
    van: () => ({ clock: van.clock, shown: van.shownCount(), strikes: van.strikes, dives: van.dives }),
    cutin: () => cutin.time,
    bladePx() {
      const out: Record<string, number> = {};
      const ga = new THREE.Vector3();
      const gb = new THREE.Vector3();
      const stats = (name: string, px: number[]): void => {
        px.sort((p, q) => p - q);
        out[name + "N"] = px.length;
        out[name + "P10"] = px.length > 0 ? Math.round(px[Math.floor(px.length * 0.1)]!) : -1;
        out[name + "Median"] = px.length > 0 ? Math.round(px[Math.floor(px.length * 0.5)]!) : -1;
      };
      const span = (): number => {
        ga.project(view.camera);
        gb.project(view.camera);
        return Math.hypot(((gb.x - ga.x) * innerWidth) / 2, ((gb.y - ga.y) * innerHeight) / 2);
      };
      const kiem: number[] = [];
      const set = fx.blades;
      for (let i = 0; i < set.capacity; i += 1) {
        if (!set.isVisible(i) || set.len[i]! < 0.3) continue;
        const L = set.len[i]!;
        ga.set(set.cx[i]! - set.tx[i]! * L * 0.45, set.cy[i]! - set.ty[i]! * L * 0.45, set.cz[i]! - set.tz[i]! * L * 0.45);
        gb.set(ga.x + set.tx[i]! * L, ga.y + set.ty[i]! * L, ga.z + set.tz[i]! * L);
        kiem.push(span());
      }
      stats("kiem", kiem);
      // Key 7 by class (round 3a: lead, mid, far), base to tip as drawn.
      const pose: SwordPose = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, len: 0, cls: 0 };
      const byCls: number[][] = [[], [], []];
      for (let i = 0; i < van.swordCount; i += 1) {
        if (!van.poseOf(i, pose)) continue;
        const h = pose.len * 0.5;
        ga.set(pose.x - pose.dx * h, pose.y - pose.dy * h, pose.z - pose.dz * h);
        gb.set(pose.x + pose.dx * h, pose.y + pose.dy * h, pose.z + pose.dz * h);
        byCls[pose.cls]!.push(span());
      }
      stats("vanLead", byCls[0]!);
      stats("vanMid", byCls[1]!);
      stats("vanFar", byCls[2]!);
      return out;
    },
    sound: () => ({ found: sound.found(), asked: { ...sound.asked }, played: sound.played }),
    soundRecord: () => sound.record(),
    soundTakes: () => sound.takes(),
    async swarm(mode) {
      const def = fx.weaponInfo;
      const models = await loadSwordModels(def);
      // No LOD file (not built yet): −1, the mid swords keep what they draw.
      if (mode === "lod" && (def.swarm === undefined || (await loadWeaponModel(def.swarm)) === null)) return -1;
      const m = mode === "standin" ? standInModel() : mode === "lod" ? models.lod : models.full;
      fx.blades.setModel(models.full, m);
      return m.triangles;
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
