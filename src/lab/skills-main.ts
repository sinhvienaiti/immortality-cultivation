/**
 * Skills lab (/skills-lab.html, dev-only, never built): the Kiếm skills on
 * the game's renderer and camera (55°, FOV 28°), the lookdev field and light,
 * stand-in beasts and caster, so the owner reviews each skill before it goes
 * into the game (skill game-vfx-layered "Demo or lab first"; owner 02/11).
 * Keys: 0 Phi Kiếm, 1 Ngự Kiếm Quyết, 2 Nhất Tuyến Xuyên Vân, 3 Hồi Kiếm Hộ
 * Thân, 4 Lưu Quang Bộ, 5 Lạc Kiếm Trận, 6 Thiên Hà Kiếm Vũ, 8 the next pillar or element ultimate of
 * art-src/lab/vfx/ult/ and 9 the next design of the skills expansion (art-src/lab/vfx/expansion/) as their video layers
 * on the field, Shift+8 and Shift+9 back (showcase.ts; __lab.showcase, __lab.expansion), B an enemy blow
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
 * Element (canon D59, ELEMENT_LAYER.md): ?element=metal|fire|water|thunder|… (default metal; elements.ts lists them; the
 * elements after Fire draw their folder's clips by role, element-clips.ts, __lab.clipKit()), the panel's Element list, E cycles the
 * registered elements, __lab.element(id) sets one (resolves the active id; no id: the active one). The skills keep
 * their shapes and take the element's material (element-kit.ts); the sound bus plays "<event>-<element>" files when
 * they exist. ?bladeHeat=furnace draws Fire's blade as before SWORD_AURA's Q3 (the whole face hot iron), for comparison.
 * ?slash=tongues keeps Fire key 7's old finisher tongues for A/B (default: the owner's Firefly strip).
 * ?dark=b draws Dark in palette B (black, cold silver-grey rims) instead of the owner's pick A (black, ember crimson).
 * ?cut=sabre draws every slash as the lopsided swept swing kept for the Sabre school, not the Sword's symmetric crescent.
 * ?stripK=<positive number> overrides Fire's measured finisher strip repeat count in this lab only.
 * Sword aura (docs/games/tu-tien/skills/SWORD_AURA.md §5.1): ?aura=off|a (default off: today's look; a =
 * wind-silk-mantle), the panel's Aura list, A toggles it, __lab.aura(id) sets it, __lab.auraLayer(name, on, intensity)
 * switches one layer (MantleSheath, MantleHull, SilkTail, MantleHalo, TipStar); ?motion=reduce (resolveReducedMotion)
 * gives the reduced-motion version of each layer. ?streak=1..4 picks the mantle's qi-streak candidate
 * (art-src/lab/vfx/aura/qi-streak-<n>.png; default 3, the prep's recommendation until the owner picks one),
 * ?plates=graded the graded plates (default even).
 * ?key2=twin-pearl: key 2 (and its panel button) casts Twin Dragons, One Burning Pearl's grey box instead
 * (DRAGON_SKILL.md §9; twin-pearl-greybox.ts): a real sim world with the header flag swordKey2,
 * selectable field-wide tides and the cast's hit volumes drawn as translucent shapes with phase labels;
 * L cycles layouts, N restores the tide, V brings the boss in; __lab.twinPearl reads each cast's numbers (key-to-first-hit too).
 */
import * as THREE from "three";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import type { Quality } from "../content/types";
import { CameraZoom } from "../view/camera-zoom";
import { LabOrbit } from "./orbit";
import { createRenderer, placeCamera } from "../view/renderer";
import { K5_MAX, SwordSkillFx, type SwordSkillHost, type SwordSlot, type SwordSkillTextures } from "../view/skills/sword-skills";
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
import { CutIn, CUTIN_ART, CUTIN_SHOUT_CANDIDATES } from "./cutin";
import { LabSound, type SoundTake } from "./sound";
import { createSkillNumbers } from "../view/hitfx";
import { DamageCompiler } from "../view/damage-compile";
import { Rand } from "../view/skills/fxkit";
import { MYRIAD_SWORDS_PER_TIER, MyriadSwordsFx, type SwordPose, type MyriadSwordsPhase } from "../view/skills/myriad-swords";
import { DEFAULT_ELEMENT, elementById, elementKits, registerElement } from "../view/skills/elements";
import { DARK_B } from "../view/skills/element-dark";
import { ElementStage } from "../view/skills/element-stage";
import type { DeathArgs } from "../view/skills/element-kit";
import type { FlipbookMode } from "../view/skills/flipbook";
import { runFlipbookProbe, type FlipbookProbeReport } from "./flipbook-probe";
import { CasterPresence } from "./presence";
import { applyBladeLook, SWORD_LIGHT } from "../view/skills/sword-material";
import { BRUSH, FIRE_FURNACE_BLADE, FIRE_LAB, firePrewarmStatus, prewarmFire, type FireAudit, type FirePrewarm } from "../view/skills/element-fire";
import { FlameSlash } from "../view/skills/flame-slash";
import { clipAudit, crescentOf, SLASH_STYLE, type ClipAudit } from "../view/skills/element-clips";
import { EXPANSION_SHOWCASE, Showcase, ULT_SHOWCASE, type ShowcaseHost } from "./showcase";
import { MeteorRain, type MeteorReport } from "./meteor-rain";
import { ClipSkillRunner, describeClipSkill, KEY8_NAV, KEY8_SKILLS, KEY9_NAV, KEY9_SKILLS, type ClipCastReport, type ClipSkill, type ClipSkillHost } from "./clip-skills";
import { AURA_LAYERS, AURA_NAMES, auraIdOf, SwordAura, type AuraId } from "../view/skills/sword-aura";
import { WindSilkMantle } from "../view/skills/aura-mantle";
import { AuraSolo } from "./aura-solo";
import { AuraGpuTimer, drawSwordMask, partsCoverage } from "./aura-gates";
import { flameOf } from "../view/skills/sword-skills";
import { resolveReducedMotion } from "../ui/skin";
import { expectedTicks, gradeOf } from "../typing/grading";
import { DEFAULT_GRIP, HandSword, type GripPose } from "./hand-sword";
import { BodyProxy } from "./body-proxy";
import { TwinPearlGreybox, type TwinCastReport } from "./twin-pearl-greybox";

const params = new URLSearchParams(location.search);
// ?cut=sabre: the lopsided swept swing (kept for the Sabre school) in place of the Sword's symmetric crescent (read once).
if (params.get("cut") === "sabre") SLASH_STYLE.style = "sabre";
// ?dark=b: Dark in palette B (black, silver-grey rims) in place of the owner's pick A, to compare them (read once).
if (params.get("dark") === "b") registerElement(DARK_B);
else if (params.get("dark") !== null && params.get("dark") !== "a") console.warn(`[lab] ?dark=${params.get("dark")}: a or b; a is used`);
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
const prewarmLoads: Promise<void>[] = [];
/** Keep load completion for GPU prewarm; callers retain the same texture and colour-space setup. */
function prewarmTexture(url: string): THREE.Texture {
  let done!: () => void, failed!: (reason: unknown) => void;
  const loaded = new Promise<void>((resolve, reject) => { done = resolve; failed = reject; });
  prewarmLoads.push(loaded);
  // The load-time prewarm awaits the original rejection; avoid an unhandled rejection before it starts.
  void loaded.catch(() => undefined);
  return texLoader.load(url, done, undefined, failed);
}
const texCache = new Map<string, THREE.Texture>();
/** A Kenney CC0 particle texture (art-src/lab/tex), loaded once however many layers share it. */
function tex(name: string): THREE.Texture {
  let t = texCache.get(name);
  if (t === undefined) {
    t = prewarmTexture(LAB_ASSETS + "tex/" + name + ".png");
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(name, t);
  }
  return t;
}
const textures: SwordSkillTextures = {
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
// ?key2=twin-pearl: the grey box of key 2 on its own sim world; the stand-in herd hides (the grey box draws the sim's beasts).
const greybox = params.get("key2") === "twin-pearl" ? new TwinPearlGreybox(view.camera, () => ({ x: caster.x, y: 1.2, z: caster.z })) : null;
if (greybox !== null) {
  view.layers.fx.add(greybox.group);
  herd.group.visible = false;
}
/** The last key's event time (the grey box measures key-to-first-hit from it). */
let lastKeyStamp = 0;

// Camera kick, hit stop and impact lights, owned by the lab (the game has its own in feedback-profile.ts): feel.ts.
const camBase = new THREE.Vector3();
// Player zoom (canon D57): the whole field by default, wheel or = / - toward a close view on Lam, Z toggles.
const zoom = new CameraZoom();
/** O: an orbit view all round the field (lab only; owner preview 03/11). */
const freeOrbit = new LabOrbit(view.stage.renderer.domElement);
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
    const t = prewarmTexture(dir + name + "-mask.png");
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
  if (slot === "k8" || slot === "k9") return clipSkillNow?.damage === "ult" ? "ultimate" : "skill";
  return slot === "auto" ? "basic" : slot === "k5" ? "ultimate" : "skill";
}
/** The key-8 or key-9 skill landing now (clip-skills.ts): its tier, its damage weight and its colour for the shared hit path. */
let clipSkillNow: ClipSkill | null = null;
let clipRgb = 0xffffff;
/** Set while a key-8 skill lands a blow: its deaths take the lab's light burst (the Kiếm skills draw theirs in their strike). */
let clipDeath = false;
/** Lab frames drawn (the screen-impact dedupe: hitStop and shake of one blow arrive on one frame). */
let frameNo = 0;
const lastImpact = { frame: -1, slot: "" };
/**
 * SwordSkillFx asks for a hit-stop and a shake per strike (its old per-skill numbers); the tier table decides now.
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
const sound = new LabSound(elementKits().map((k) => k.sound));
bus.on((e) => sound.on(e));
// ?key2=twin-pearl measures key-to-first-hit, and the first unlock creates the AudioContext (60–120 ms on the main
// thread, measured 04/11): there it waits until the key's frame is drawn (Chrome keeps the page's user activation;
// Safari may start the context suspended until the next key resumes it). Every other lab session unlocks on the key.
let unlockQueued = false;
const unlockAudio = (): void => {
  if (greybox === null || unlockQueued) {
    sound.unlock();
    return;
  }
  unlockQueued = true;
  requestAnimationFrame(() => setTimeout(() => sound.unlock(), 0));
};
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
  if (slot !== "auto" && slot !== "k5" && slot !== "k8" && slot !== "k9" && slot !== "km") {
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
 * A blow landed (SwordSkillHost.struck, or a key-7 sword): one impact event (screen, numbers, sound), and a death
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

const hostApi: SwordSkillHost = {
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
const fx = new SwordSkillFx(hostApi, { ...textures }, quality, Number.isFinite(k5n) && k5n > 0 ? { k5Blades: Math.min(K5_MAX, k5n) } : {});
// ?trim=0: every blade slot drawn, hidden ones too (how BladeSet drew before 02/11; measurement only).
fx.blades.drawAll = params.get("trim") === "0";
// The flying swords' aura (SWORD_AURA §4.8): one owner for both sword modules; off by default (today's look).
const swordAura = new SwordAura(quality);
swordAura.reduced = resolveReducedMotion("system", typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches, params.get("motion"));
swordAura.setDirection(auraIdOf(params.get("aura")));
fx.setAura(swordAura);
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
const SKILL_W: Record<string, number> = { auto: 0.25, k1: 0.37, k2: 2.5, guard: 0.3, dash: 0.3, k4: 0.15, k5: 2.0, k7: 0.35, km: 0.8 };
/** Keys 8 and 9's blows by damage tier (lab stand-ins: a light blow as slot 1's, a heavy one, an ultimate's as K5's), × the strike's power. */
const CLIP_W: Record<ClipSkill["damage"], number> = { light: 0.4, heavy: 1.2, ult: 2.0 };
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
/** The clock key 7's sweep starts (s, F192). */
const MYRIAD_SWEEP_AT = 192 / 60;
function skillRgb(slot: string): number {
  // Cached per weapon and element (a key string only when either changes).
  if (numberRgbWeapon !== fx.weapon + "/" + fx.element.id) {
    for (const k of Object.keys(numberRgb)) delete numberRgb[k];
    numberRgbWeapon = fx.weapon + "/" + fx.element.id;
  }
  if (slot === "k8" || slot === "k9") return clipRgb;
  // The meteor rain (key M) in the element's slot-1 colour.
  if (slot === "km") return skillRgb("k1");
  let v = numberRgb[slot];
  if (v === undefined) {
    // Key 7 takes its element's number tint (Metal: Clear Wind's jade-cyan).
    const h = slot === "k7" ? myriad.tone.number : fx.paletteOf(slot as SwordSlot).halo;
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
    if (e.slot === "k7" || e.slot === "k5" || e.slot === "k2" || e.slot === "k4" || e.slot === "k8" || e.slot === "k9" || e.slot === "km") compiler.headline(attacks);
  } else if (e.kind === "impact") {
    const n = hitsOf[e.slot] ?? 0;
    hitsOf[e.slot] = n + 1;
    const clip = e.slot === "k8" || e.slot === "k9";
    let w = clip ? CLIP_W[clipSkillNow?.damage ?? "heavy"] * Math.max(0.15, e.power) : SKILL_W[e.slot] ?? 0.3;
    if (e.slot === "k2") w *= Math.max(0.4, 1 - 0.15 * n);
    if (e.role === "finisher" && e.slot === "k7") w = 1.5;
    if (e.role === "secondary" && e.slot !== "k4" && e.slot !== "k7" && !clip) w *= 0.6;
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
  (x, y, z, dx, dz, rgb, beastTier) => {
    // A held kill of a hero victim: the element's own death when it has one (it replaces the lab's light burst).
    if (!elementDeath(x, y, z, dx, dz, beastTier >= 2 ? 0.8 : 0.45, true)) deathFx.spawn(x, y, z, dx, dz, rgb, beastTier);
  },
);
const deathArgs: DeathArgs = { slot: "k1", at: new THREE.Vector3(), dx: 0, dz: -1, radius: 0.5, pal: weaponById(DEFAULT_WEAPON)!.glow };
/**
 * A death in the element's material (canon D59: replace, never stack): with a kit whose death hook draws, the lab's
 * own death layers (death-fx.ts) stay out. `draw`: the hook has not drawn this death yet (key 7's and the held hero
 * kills; the Kiếm skills call it from their strike). False: Metal, the lab's layers draw.
 */
function elementDeath(x: number, y: number, z: number, dx: number, dz: number, radius: number, draw: boolean): boolean {
  const hook = stage.hooksOf(fx.element).sword?.death;
  if (hook === undefined) return false;
  if (!draw) return true;
  const a = deathArgs;
  a.at.set(x, y, z);
  a.dx = dx;
  a.dz = dz;
  a.radius = radius;
  a.pal = fx.paletteOf("k1");
  return hook(a);
}
bus.on((e) => {
  if (e.kind === "release") victims.cast(e.slot);
  else if (e.kind === "impact") victims.impact(e, frameNo);
  else if (e.kind === "death" && !herd.isHero(e.target)) {
    // A key-8 skill's kill: the lab's light burst in its colour (its clip is the element's material).
    if (clipDeath) {
      deathFx.spawn(e.x, e.y, e.z, e.dx, e.dz, e.rgb, e.beastTier);
      return;
    }
    // An element with its own death draws it (key 7's here; the Kiếm skills' in their strike).
    if (elementDeath(e.x, e.y, e.z, e.dx, e.dz, herd.radius(e.target), inkDeath)) return;
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
const myriad = new MyriadSwordsFx(
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
      if (role === "primary" && !myriadFirstHit) {
        myriadFirstHit = true;
        screen.impact("skill", "primary");
      } else if (role === "primary") screen.impact("skill", "secondary");
      // The hunt's hundreds of blows hold a low rumble under the shake (never stacking into a constant jolt).
      else if (role === "secondary" && myriad.clock < MYRIAD_SWEEP_AT) screen.rumble(2.6, 0.14);
      // The finisher's cut flashes each body white on its blow (round 3b, item 4).
      if (myriad.clock >= MYRIAD_SWEEP_AT) herd.silhouette(target);
      inkDeath = true;
      emitImpact("k7", target, dx, dz, power, role, killed, skillRgb("k7"));
      inkDeath = false;
    },
    phase(p: MyriadSwordsPhase) {
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
  MYRIAD_SWORDS_PER_TIER[quality],
);
myriad.setAura(swordAura);
const auraListeners: ((id: AuraId) => void)[] = [];
/** Sets the sword aura's direction (off, a); returns the active one. */
function setAura(id: AuraId): AuraId {
  swordAura.setDirection(id);
  for (const f of auraListeners) f(swordAura.direction);
  return swordAura.direction;
}
/**
 * The ultimate's cut-in (canon D58 (4)): Thiên Hà's last key starts it; the world and the typing timer hold while it
 * plays (lab time), then the skill fires. Style C, ink and light, the owner's pick of 03/11: she gathers with eyes
 * closed, then cuts to the shout on the callout's "天", which starts 1.08 s into callout-k5/01.ogg (retune `shoutAt`
 * with that file); 1.7 s in all.
 */
const cutin = new CutIn(document.body);
const ULT_HOLD = Number(params.get("cutin") ?? "1.7") || 1.7;
/** ?cutinArt=a|b|c picks the painting style (owner preview, 03/11 evening: he asked to try B, the anime cel). */
/** ?cutinShout=c1..c4|b1..b3 swaps only the shout frame for an elegant-face candidate, skin matched to the gather (owner preview, 03/11 evening). */
const SHOUT_ID = params.get("cutinShout") ?? "c3"; // the owner picked C3 (03/11 night)
const SHOUT_PICK = CUTIN_SHOUT_CANDIDATES[Object.hasOwn(CUTIN_SHOUT_CANDIDATES, SHOUT_ID) ? SHOUT_ID : "c3"];
const ART_PARAM = (["a", "b", "c"] as const).find((k) => k === params.get("cutinArt"));
const CUTIN_STYLE = ART_PARAM ?? SHOUT_PICK?.style ?? "c";
if (SHOUT_PICK && SHOUT_PICK.style !== CUTIN_STYLE) console.warn(`cutinShout is a style ${SHOUT_PICK.style} candidate; cutinArt=${CUTIN_STYLE} keeps its own shout`);
const ART_BASE = SHOUT_PICK && SHOUT_PICK.style === CUTIN_STYLE ? { ...CUTIN_ART[CUTIN_STYLE], shout: SHOUT_PICK.shout } : CUTIN_ART[CUTIN_STYLE];
/** Holds this short (scenarios pass ?cutin=0.05 to skip the cut-in) show no painting and no cut. */
const ULT_ART = ULT_HOLD >= 0.6 ? ART_BASE : undefined;
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
let pendingMyriad = false;
let myriadFirstHit = false;
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
    await myriad.setWeapon(def);
    // The aura's anchors: the full model's (every tier is the same GLB).
    const models = await loadSwordModels(def);
    swordAura.setAnchors(models.full.aura, models.full.pommelY);
    auraSolo.setModel(models.full, def.motif !== undefined && def.motif.silk ? def.motif.silkDeep : null);
    // The lead blades' hull (High and Ultra): the weapon's LOD blade, smoothed (an invisible light-carrying shell).
    auraMantle.setHullSource(models.lod.real ? models.lod.geometry : null, models.full.aura, view.layers.fx);
    if (def.motif !== undefined) swordAura.silkLight = def.motif.silkLight;
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

// The element (canon D59): one stage the element kits draw with, shared by the Kiếm skills and key 7. A kit's
// texture name is a Kenney sheet in art-src/lab/tex, or a path under art-src/lab/vfx/ (with a "/").
const VFX_BASE = "/art-src/lab/vfx/";
function kitTexture(name: string): THREE.Texture {
  if (!name.includes("/")) return tex(name);
  let t = texCache.get(name);
  if (t === undefined) {
    t = prewarmTexture(VFX_BASE + name);
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(name, t);
  }
  return t;
}
// The sword aura's direction (the owner's pick: A, the Wind-Silk Mantle, with C's tip star). Its body is painted with
// a qi-streak mask (game-art-pipeline candidates, art-src/lab/vfx/aura/manifest.json): ?streak=<n>, default 3 (the
// prep's recommendation; the owner has not picked one yet). Missing file: a flat body.
const AURA_STREAK = Math.max(1, Math.min(4, Math.round(Number(params.get("streak") ?? "3")) || 3));
const auraMantle = new WindSilkMantle(quality, null);
texLoader.load(
  VFX_BASE + `aura/qi-streak-${AURA_STREAK}.png`,
  (t) => {
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    t.needsUpdate = true;
    auraMantle.setStreak(t);
  },
  undefined,
  () => console.warn("[lab] qi-streak mask missing: the mantle's body is flat"),
);
auraMantle.setGraded(params.get("plates") === "graded");
swordAura.install(auraMantle);
for (const m of swordAura.meshes) view.layers.fx.add(m);
// The aura's solo flight (__lab.auraSolo, §5.1): one sword on a fixed 6 s script.
const auraSolo = new AuraSolo(view.layers.fx, textures.trace);
// A kit's big blow asks for its screen accent (Fire: the warm flash).
const lightAt = new THREE.Vector3();
const stage = new ElementStage({ layer: view.layers.fx, camera: view.camera, quality, textures, texture: kitTexture, vfxBase: VFX_BASE, accent: (_x, _y, _z, k) => screen.warm(k), light: (x, y, z, colour, intensity) => lights.flash(lightAt.set(x, y, z), view.camera.position, colour, intensity, true) });
// Keys 8 and 9: the pillar skills and element ultimates, and the skills expansion's 30 designs, as their video layers on
// the field (showcase.ts; not in the sim).
const showcaseHost: ShowcaseHost = {
  camera: view.camera,
  nearest: (x, z, r) => herd.nearest(x, z, r),
  at: (i, out) => out.set(herd.x(i), 0, herd.z(i)),
  caster: (out) => out.set(caster.x, 0, caster.z),
  light: (at, colour, intensity) => lights.flash(at, view.camera.position, colour, intensity, true),
  accent: (k) => screen.warm(k),
  shake: (px, seconds, roll) => screen.shake(px, seconds, roll),
  captionHost: document.body,
};
const showcase = new Showcase(stage.flipbooks, showcaseHost, ULT_SHOWCASE);
const expansion = new Showcase(stage.flipbooks, showcaseHost, EXPANSION_SHOWCASE);
// Their video cards play in real time; with fixed steps (captures) they are seeked along world time (one bank for both).
showcase.driven = fixed;
// ?video=0: the atlases (6 fps) instead of the clips' 1080p videos, to compare.
showcase.videos = params.get("video") !== "0";
// Keys 8 and 9 cast their skills on the herd (clip-skills.ts, lab-castable-skills.md): key 8 the pillars and ultimates,
// key 9 the expansion batch by batch. The strikes land on the clip's frames through the same hit path as keys 0–7
// (emitImpact, the screen's tier, the kick, the lights).
const clipTmp = new THREE.Vector3();
function clipHost(slot: "k8" | "k9", sc: Showcase): ClipSkillHost {
  return {
    targets: herd,
    layer: view.layers.fx,
    player: stage.flipbooks,
    caster: (out) => out.set(caster.x, 0, caster.z),
    release(skill, at) {
      clipSkillNow = skill;
      emitRelease(slot, at.x, at.z);
    },
    blow(skill, i, dx, dz, power, role) {
      clipSkillNow = skill;
      clipRgb = tmpColour.set(sc.item(skill.id).light).getHex(THREE.SRGBColorSpace);
      const killed = herd.hit(i, dx, dz, power, clipRgb);
      clipDeath = true;
      emitImpact(slot, i, dx, dz, power, role, killed, clipRgb);
      clipDeath = false;
      return killed;
    },
    strike(skill, at, role, colour) {
      clipSkillNow = skill;
      const ult = skill.damage === "ult";
      // The tier's shake and hit-stop (a later strike: the secondary blow's shake only), the kick along the blow, the light.
      screen.impact(ult ? "ultimate" : "skill", role);
      if (role === "primary") {
        const dx = at.x - caster.x;
        const dz = at.z - caster.z;
        const l = Math.hypot(dx, dz) || 1;
        kick.impulse((ult ? 5 : 3) * KICK_M_PER_PX, dx / l, dz / l);
        if (ult) screen.warm(0.6);
      }
      lights.flash(clipTmp.set(at.x, 1.5, at.z), view.camera.position, colour, ult ? 9 : 6, true);
    },
    status(i, kind, seconds, rim, colour) {
      herd.status(i, rim, seconds, tmpColour.set(colour).getHex(THREE.SRGBColorSpace));
      if (kind === "stun" || kind === "bind") herd.holdBeast(i, seconds);
      else if (kind === "slow") herd.slow(i, seconds, 0.35);
    },
  };
}
const clipSkills = new ClipSkillRunner(showcase, clipHost("k8", showcase), KEY8_SKILLS, KEY8_NAV);
const clipSkills9 = new ClipSkillRunner(expansion, clipHost("k9", expansion), KEY9_SKILLS, KEY9_NAV, clipSkills);
// Key M: the slanted meteor rain (canon D62, meteor-rain.ts) in the element E has on; its marks share key 8's.
const meteorAt = new THREE.Vector3();
const meteor = new MeteorRain({
  targets: herd,
  stage,
  camera: view.camera,
  layer: view.layers.fx,
  kit: () => fx.element,
  pal: () => fx.paletteOf("k1"),
  caster: (out) => out.set(caster.x, 0, caster.z),
  prepareMark: (folder) => clipSkills.prepareMark(folder),
  mark: (folder, x, z, size, delay, life) => clipSkills.mark(folder, x, z, size, delay, life),
  release: (at) => emitRelease("km", at.x, at.z),
  blow(i, dx, dz, power, role) {
    const rgb = fx.paletteOf("k1").flashHex;
    const killed = herd.hit(i, dx, dz, power, rgb);
    clipDeath = true;
    emitImpact("km", i, dx, dz, power, role, killed, rgb);
    clipDeath = false;
    return killed;
  },
  strike(at, role) {
    // Each landing a skill-tier blow (the first its stop and shake, the rest a lighter shake), the kick, the light.
    screen.impact("skill", role);
    if (role === "primary") kick.impulse(3 * KICK_M_PER_PX, 0.34, -0.94);
    lights.flash(meteorAt.set(at.x, 1.2, at.z), view.camera.position, fx.paletteOf("k1").flashHex, 5, true);
  },
  status(i) {
    const f = fx.element.foe;
    if (f !== null) herd.status(i, f.kind, f.seconds, f.rgb);
  },
});
const prewarmReports: ReturnType<ElementStage["prewarm"]>[] = [];
const elementListeners: ((id: string) => void)[] = [];
/** SWORD_AURA Q3: ?bladeHeat=furnace keeps Fire's old blade (hot iron over the whole face) for comparison. */
const BLADE_HEAT = params.get("bladeHeat");
// SWORD_AURA §5.5: ?riverSheath=1 puts the Fire round's removed flame cards back on key 7's river (the "burning planks"
// comparison sheet only).
FIRE_LAB.riverSheath = params.get("riverSheath") === "1";
// INTEGRATION_PLAN CX-H (ticket 264): ?impact=lotus puts key 1's old Fire hit back (the lotus, the fire point, the code
// scorch and the ground fire); the default is the brushfire card.
const IMPACT = params.get("impact");
FIRE_LAB.impact = IMPACT === "lotus" ? "lotus" : "brush";
if (IMPACT !== null && IMPACT !== "lotus" && IMPACT !== "brush") console.warn(`[lab] ?impact=${IMPACT}: brush or lotus; brush is used`);
FIRE_LAB.slashTongues = params.get("slash") === "tongues";
const stripK = Number(params.get("stripK"));
FlameSlash.stripK = Number.isFinite(stripK) && stripK > 0 ? stripK : null;
/** Puts every skill in element `id`'s material (its flipbooks loaded first); false for an unknown id. */
async function setElement(id: string): Promise<boolean> {
  const kit = elementById(id);
  if (kit === undefined) {
    console.warn(`[lab] unknown element "${id}"; elements: ${elementKits().map((k) => k.id).join(", ")}`);
    return false;
  }
  await stage.prepare(kit);
  fx.setElement(kit, stage);
  myriad.setElement(kit, stage);
  if (BLADE_HEAT === "furnace" && kit.id === "fire") applyBladeLook(FIRE_FURNACE_BLADE);
  swordAura.setElement(kit);
  auraSolo.setFlame(flameOf(kit, stage));
  sound.element = kit.sound;
  // The screen accent, the herd's hit silhouette and the hero victims' plants follow the element (Metal: their own).
  const flash = kit.screen.flash;
  // A frame palette with its own roles is another program: compile it now, not on the first blow.
  if (screen.setAccent(flash === null ? null : [flash.tint[0] * flash.strength, flash.tint[1] * flash.strength, flash.tint[2] * flash.strength], kit.screen.frames ?? null)) screen.prewarm(view.stage.renderer);
  const metal = kit.attach === undefined;
  const t = myriad.tone;
  // A hit carries the attacker's colour and a kill burns away in it when the element says so (Fire, round 3: its
  // white-gold silhouette read white-pink and its kills' edge raw-flesh coral).
  const foeFlash = kit.foe?.flash;
  herd.setElementLook(metal ? null : foeFlash !== undefined ? [foeFlash[0], foeFlash[1], foeFlash[2]] : [t.core[0] * 2.2, t.core[1] * 2.2, t.core[2] * 2.2], metal ? null : [t.halo[0], t.halo[1], t.halo[2]]);
  herd.setBurn(kit.foe?.burn ?? null);
  // The caster's ground ring is one of the seal's rings: the element's sigil look (Metal: its added light), on a
  // lighter underlay (its broad falloff would lie under the feet as a dark donut).
  presence.presenceRing.setSolid(kit.sigil === undefined ? null : { ...kit.sigil, sootAlpha: kit.sigil.sootAlpha * 0.35 });
  // The hero victims' plant in the element's material (replace, never stack): its hook draws it, else Metal's.
  victims.setPlant(stage.hooksOf(kit).stream?.plant ?? null);
  victims.setTone(metal ? null : { star: [t.core[0] * 3.2, t.core[1] * 3.2, t.core[2] * 3.2], ring: [t.halo[0], t.halo[1], t.halo[2]], rim: [t.halo[0] * 0.85, t.halo[1] * 0.85, t.halo[2] * 0.85] });
  for (const f of elementListeners) f(kit.id);
  return true;
}
function cycleElement(): void {
  const kits = elementKits();
  const i = kits.findIndex((k) => k.id === fx.element.id);
  void setElement(kits[(i + 1) % kits.length]!.id);
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
  slot: SwordSlot;
  letters: number;
  typed: number;
  next: number;
  tx: number;
  tz: number;
}
let typing: Typing | null = null;
const WORD_LEN: Record<SwordSlot, number> = { auto: 0, k1: 5, k2: 6, guard: 5, dash: 4, k4: 6, k5: 8 };
const TARGET: Record<SwordSlot, [number, number]> = { auto: [0, -8], k1: [0, -8], k2: [0.2, -12], guard: [0, 3], dash: [5, 3], k4: [-5, -7], k5: [0, -9] };

/**
 * Instant cast (canon D58 (1), the default): a skill key IS the word's last correct keystroke, so the release
 * fires on this frame and the first blade leaves at once. ?typed=1 or the panel's checkbox types the word at
 * the WPM first (the charge follows the letters, the release comes on the last one), as before the power pass.
 */
let typedMode = params.get("typed") === "1";

/** A lab key's skill: the seven Kiếm slots, and key 7's field-wide prototype (always cast at once). */
type LabSlot = SwordSlot | "k7";

function type(slot: LabSlot): void {
  // Keys wait while the cut-in holds the world (the typing timer is stopped too).
  if (cutin.active) return;
  if (slot === "k2" && greybox !== null) {
    // The grey box casts on this key (D58 instant cast): the sim's F0 runs now, no VFX, the body still answers.
    typing = null;
    probe.lastKey("k2");
    caster.release("k2", 0, -9);
    greybox.cast(lastKeyStamp > 0 ? lastKeyStamp : performance.now());
    lastKeyStamp = 0;
    return;
  }
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
    pendingMyriad = true;
    myriadFirstHit = false;
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
const pending = { charge: false, cast: false, slot: "auto" as SwordSlot, castSlot: "auto" as SwordSlot, p: 0, tx: 0, tz: 0, cx: 0, cz: 0 };
function queueCast(slot: SwordSlot, tx: number, tz: number): void {
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
  if (pendingMyriad) {
    pendingMyriad = false;
    myriad.cast();
    // The release at the caster (round 3b, item 5): a burst column behind the body and a ground ring, on this frame.
    fx.burst("k1", 3, "k7");
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
      // The word's grade (src/typing/grading.ts): the lab types without errors at the WPM, so it reads perfect (flash
      // when faster than 0.85 of the expected time); a perfect or flash word pulses its swords' rings (SWORD_AURA §4.9).
      const grade = gradeOf({ errors: 0, letters: typing.letters, keyTicks: Math.round((typing.letters - 1) * perLetter * 60), expectedTicks: expectedTicks(typing.letters, Math.round(wpm * 1000)) });
      if (grade === "perfect" || grade === "flash") swordAura.graded();
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
  greybox?.reset();
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
  myriad.reset();
  clipSkills.clear();
  clipSkills9.clear();
  meteor.reset();
  auraSolo.stop();
  swordAura.hide();
  stage.reset();
  cutin.stop();
  ultDark = false;
  ultDarkEnd = -1;
  sound.reset();
  pendingMyriad = false;
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
  lastKeyStamp = e.timeStamp;
  const slot = KEYS[e.key];
  if (slot) type(slot);
  // 8 casts the selected pillar or ultimate on the herd, Shift+8 selects the next (Shift+8 types "*" on most layouts).
  else if (e.code === "Digit8" || e.key === "8" || e.key === "*") void (e.shiftKey || e.key === "*" ? clipSkills.selectNext() : clipSkills.cast());
  // 9 casts the selected new skill (SKILLS_EXPANSION; a design without its row yet plays as its video), Shift+9 selects the next ("(" on most layouts).
  else if (e.code === "Digit9" || e.key === "9" || e.key === "(") void (e.shiftKey || e.key === "(" ? clipSkills9.selectNext() : clipSkills9.cast());
  // M the slanted meteor rain in the element on (E).
  else if (e.key === "m" || e.key === "M") meteor.cast();
  else if (greybox !== null && (e.key === "l" || e.key === "L")) greybox.nextLayout();
  else if (greybox !== null && (e.key === "n" || e.key === "N")) greybox.refillAll();
  else if (greybox !== null && (e.key === "v" || e.key === "V")) greybox.addBoss();
  else if (e.key === "b" || e.key === "B") enemyShot();
  else if (e.key === "r" || e.key === "R") reset();
  else if (e.key === "w" || e.key === "W") cycleWeapon();
  else if (e.key === "e" || e.key === "E") cycleElement();
  else if (e.key === "=" || e.key === "+") zoom.zoomIn();
  else if (e.key === "-" || e.key === "_") zoom.zoomOut();
  else if (e.key === "z" || e.key === "Z") zoom.toggle();
  else if (e.key === "o" || e.key === "O") freeOrbit.toggle();
  else if (e.key === "a" || e.key === "A") setAura(swordAura.direction === "off" ? "a" : "off");
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
    ["8", "Tung cột trụ hoặc tuyệt kỹ đang chọn lên bầy quái (Shift+8 chọn mục kế; không hồi chiêu) · Pillars and ultimates"],
    ["9", "Tung kỹ năng mới đang chọn (diện rộng, thần thú…; mục chưa có thông số chỉ phát video; Shift+9 chọn mục kế) · Skills expansion"],
    ["M", "Mưa sao băng nghiêng theo hệ đang chọn (E): ấn đánh dấu, rơi chéo 20°, đất cháy sau đòn · Slanted meteor rain"],
    ["B", "Enemy blow (test the guard)"],
    ["R", "Reset"],
    ["W", "Next sword"],
    ["E", "Next element"],
    ["Z", "Zoom: close view / whole field (wheel, = and - too)"],
    ["O", "Orbit: drag to turn the view all round (O again: play camera)"],
    ["A", "Sword aura on / off"],
  ];
  if (greybox !== null) {
    names[2] = ["2", "Twin Dragons, One Burning Pearl · grey box (sim volumes)"];
    names.push(["L", "Grey box: next layout"], ["N", "Grey box: restore this layout"], ["V", "Grey box: boss at gate A"]);
  }
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
  // Element selector (canon D59): the registered kits; one still being built names the look it draws as.
  const el = document.createElement("label");
  el.textContent = "Element ";
  const elSelect = document.createElement("select");
  elSelect.style.cssText = select.style.cssText;
  for (const kit of elementKits()) {
    const o = document.createElement("option");
    o.value = kit.id;
    o.textContent = kit.fallback !== undefined ? `${kit.name} (draws as ${kit.fallback} until built)` : kit.name;
    o.title = kit.verb;
    elSelect.append(o);
  }
  elSelect.value = fx.element.id;
  elSelect.onchange = () => void setElement(elSelect.value);
  elementListeners.push((id) => (elSelect.value = id));
  el.append(elSelect);
  panel.append(el);
  // Keys 8 and 9's lists (showcase.ts): any item directly; they fill as their clips arrive.
  // Key 8's list casts the chosen skill and names its stats (shape, radius, strikes, damage).
  const showcaseList = (label: string, sc: Showcase, empty: string, kinds: Record<string, string>, castable?: { cast(id: string): void; detail(id: string): string | undefined }): void => {
    const sl = document.createElement("label");
    sl.textContent = label + " ";
    const scSelect = document.createElement("select");
    scSelect.style.cssText = select.style.cssText + (castable !== undefined ? ";max-width:440px" : ";max-width:300px");
    const fill = (): void => {
      const keep = scSelect.value;
      scSelect.replaceChildren();
      const none = document.createElement("option");
      none.value = "";
      none.textContent = empty;
      scSelect.append(none);
      for (const id of sc.ids()) {
        const it = sc.item(id);
        const o = document.createElement("option");
        o.value = id;
        const detail = castable?.detail(id);
        o.textContent = `${it.code !== undefined ? it.code + " · " : ""}${kinds[it.kind] ?? it.kind} · ${it.element[1] || "?"} · ${it.en}` + (detail !== undefined ? ` · ${detail}` : "");
        scSelect.append(o);
      }
      scSelect.value = keep;
    };
    fill();
    sc.onList(fill);
    scSelect.onchange = () => {
      if (scSelect.value !== "") {
        if (castable !== undefined) castable.cast(scSelect.value);
        else sc.play(scSelect.value);
      }
      scSelect.blur();
    };
    sl.append(scSelect);
    panel.append(sl);
  };
  showcaseList("Kỹ năng (8)", showcase, "— chọn cột trụ hoặc tuyệt kỹ để tung —", { pillar: "Cột trụ", ultimate: "Tuyệt kỹ" }, {
    cast: (id) => void clipSkills.cast(id),
    detail: (id) => {
      const sk = clipSkills.skill(id);
      return sk !== undefined ? describeClipSkill(sk) : undefined;
    },
  });
  showcaseList("Kỹ năng mới (9)", expansion, "— chọn kỹ năng mới để tung —", { area: "Diện rộng", avatar: "Pháp tướng", beast: "Thần thú", treasure: "Pháp bảo" }, {
    cast: (id) => void clipSkills9.cast(id),
    detail: (id) => {
      const sk = clipSkills9.skill(id);
      return sk !== undefined ? describeClipSkill(sk) : undefined;
    },
  });
  // Sword aura selector (SWORD_AURA §5.1): off (today's look) or the owner's pick.
  const al = document.createElement("label");
  al.textContent = "Aura ";
  const auraSelect = document.createElement("select");
  auraSelect.style.cssText = select.style.cssText;
  for (const [id, name] of [["off", "Off (today)"], ["a", "Wind-Silk Mantle + tip star"]] as const) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = name;
    o.title = AURA_NAMES[id];
    auraSelect.append(o);
  }
  auraSelect.value = swordAura.direction;
  auraSelect.onchange = () => void setAura(auraIdOf(auraSelect.value));
  auraListeners.push((id) => (auraSelect.value = id));
  al.append(auraSelect);
  panel.append(al);
  document.body.append(panel);
}

// Loop.
let lastWorldDt = 0;
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
  lastWorldDt = world;
  // The ultimate's held darkening ends a moment after its climax (key 7 sets its own from its phases).
  if (ultDark && ultDarkEnd >= 0 && labTime >= ultDarkEnd) {
    ultDark = false;
    ultDarkEnd = -1;
    if (!myriad.running) screen.holdDark(0);
  } else if (ultDark) screen.holdDark(SCREEN_TIERS.ultimate.hold, SCREEN_TIERS.ultimate.desat);
  updateTyping(world);
  updateBolt(world);
  herd.update(world);
  caster.update(world);
  flushTyping();
  // The real dt too: timelines on sim ticks (the K4 beats) do not slow in a hit-stop.
  stage.begin();
  swordAura.begin();
  fx.update(world, dt);
  myriad.update(world);
  clipSkills.update(world);
  clipSkills9.update(world);
  meteor.update(world);
  auraSolo.update(world, view.camera, swordAura, fx.element.trail.flame !== undefined);
  // The aura wears the swords as both modules drew them this frame (CSS viewport for its crowding count).
  swordAura.viewW = innerWidth;
  swordAura.viewH = innerHeight;
  swordAura.end(world, view.camera);
  // The element kits' own layers move and upload after both skill sets have drawn into them.
  stage.update(world);
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
  zoom.holdWide(cutin.active || myriad.running || fx.isRunning("k5"));
  if (!customCamera && !followShown) {
    zoom.update(view.camera, view.fit, 0, caster.x, caster.z, dt);
    // O: re-aim the zoom's pose round the field before the kick and the shake are added on top (owner preview, 03/11).
    freeOrbit.apply(view.camera, dt);
    camBase.copy(view.camera.position);
  } else if (camBase.lengthSq() === 0) camBase.copy(view.camera.position);
  kick.update(dt);
  screen.update(dt, view.camera);
  lights.update(dt);
  const so = screen.offset;
  view.camera.position.set(camBase.x + kick.x + so.x, camBase.y + so.y, camBase.z + kick.z + so.z);
  screen.applyCamera(view.camera);
  // The grey box steps its sim world on real time (through a hit-stop) and places its volumes for this frame.
  greybox?.update(dt);
  view.render(dt);
  greybox?.afterRender();
  // After the draw: world matrices are fresh and the probe reads what was shown.
  if (probeOn) {
    probe.sample(dt);
    caster.check(probe.lastFrame);
  }
}

// A second view of the same frame for captures: the caster close up at 55° (no time passes).
const savedCamPos = new THREE.Vector3();
/** The fx layers' own visibility while __lab.debugShow("fx", false) hides them. */
const fxShown = new Map<THREE.Object3D, boolean>();
/** Mesh visibility kept independently while __lab.fxSolo isolates a layer on the current frame. */
const soloShown = new Map<THREE.Object3D, boolean>();
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
/** The aura gates' tools (aura-gates.ts): the mask's restore, the per-layer GPU timer. */
let maskRestore: (() => void) | null = null;
let auraGpu: AuraGpuTimer | null = null;

declare global {
  interface Window {
    __lab?: {
      ready: boolean;
      /** Ticket 258b: GPU checks of FlipbookPool v2 (programs, GPU vs CPU, mask decode); off-screen, no time passes. */
      flipbookProbe(): Promise<FlipbookProbeReport>;
      /** Load-time GPU uploads/programs for Fire and Metal; reading this does not render or emit. */
      prewarmReport(): ReturnType<ElementStage["prewarm"]>[];
      type(slot: SwordSlot | "k7"): void;
      cast(slot: SwordSlot, tx: number, tz: number): void;
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
      /** Canon D59: puts the skills in element `id` (metal, fire, …) and resolves the active element's id; no id: the active one. */
      element(id?: string): Promise<string>;
      /** SWORD_AURA §5.1: sets the sword aura ("off", "a" or "wind-silk-mantle"); returns the active one. No id: the active one. */
      aura(id?: string): string;
      /** One aura layer on or off with an intensity (MantleSheath, MantleHull, SilkTail, MantleHalo, TipStar); returns every layer's state. */
      auraLayer(name?: string, on?: boolean, intensity?: number): Record<string, { on: boolean; intensity: number }>;
      /** The aura's records this frame: swords wearing it, Fire's licking flames, reduced motion. */
      auraInfo(): Record<string, unknown>;
      /**
       * Redraws this frame (no time passes) with one aura part hidden or shown: "mantle" (MantleSheath), "star"
       * (TipStar), "silk" (the ribbons: SilkTail and the other trails), "halo" (the far swords' MantleHalo), "all".
       */
      auraShow(part: "mantle" | "star" | "silk" | "halo" | "all", on: boolean): void;
      /** SWORD_AURA §5.1: one Clear Wind on a fixed 6 s flight (waiting while typed, release, S, a sharp turn and dive, the hit, return, melt). */
      auraSolo(): boolean;
      /** SWORD_AURA §6: draws the swords' geometric mask to the screen (true; aura-gates.ts), or puts the frame back (false). No time passes. */
      swordMask(on: boolean): void;
      /** SWORD_AURA §6 "Chồng lớp": each aura part drawn alone; pixels covered by 0, 1, 2, 3+ parts (half resolution). */
      auraParts(): { size: number[]; byCount: number[]; parts: Record<string, number> };
      /** GPU ms of each aura layer's draw over `frames` frames (one layer a frame in turn), or why not. */
      auraGpu(frames: number): Record<string, unknown>;
      /**
       * Plays flipbook clip `id` of art-src/lab/vfx/<folder>/ once at (x, y, z), `sizeM` tall, on the ground's soft fade (a
       * look at a clip in the lab's light; `mode` overrides the manifest's). Resolves false when the clip is missing.
       */
      clip(folder: string, id: string, x: number, y: number, z: number, sizeM: number, mode?: FlipbookMode): Promise<boolean>;
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
      /** Lab debugging: every named mesh in the fx layer, at any depth, that draws now (name, render order, instances). */
      fxNamed(): { name: string; order: number; count: number }[];
      /** Key 1's Fire hit mode, clip readiness, hit counters, drawn age (ticks) and impact-light levels (ticket 264). */
      fireImpact(mode?: "brush" | "lotus"): FirePrewarm & { mode: "brush" | "lotus"; ready: boolean; audit: FireAudit; ageTicks: number; lights: number[] };
      /** An element kit drawn from clips (element-clips.ts): its clips' spawns by role since the last reset and its pools by role (null: Metal, Fire). */
      clipKit(): ClipAudit | null;
      /** Crescents drawn from Metal's and Fire's slash clips since load (crescentOf; Metal's also stands in, tinted). */
      crescents(): { metal: number; fire: number };
      /** Key 8 (clip-skills.ts): casts pillar or ultimate `id` on the herd (none: the selected); what it cast and every id it has. */
      showcase(id?: string): { played: string | null; ids: string[] };
      /** The last key-8 (or key-9) cast: its aim, its strikes' times (the clip's frames), its first blow, blows and kills. */
      clipSkill(key?: 8 | 9): (ClipCastReport & { active: number }) | null;
      /** Key M (meteor-rain.ts): casts the slanted meteor rain (cast true) or reads the last one. */
      meteor(cast?: boolean): (MeteorReport & { active: boolean }) | null;
      /** Key 9 (clip-skills.ts, SKILLS_EXPANSION): casts new skill `id` (none: the selected; one without its row plays as its video); what it cast and every id it has. */
      expansion(id?: string): { played: string | null; ids: string[] };
      /** Shows only fx meshes with this name prefix, keeping their own visibility; null restores them. No time passes. */
      fxSolo(prefix: string | null): number;
      /** Lab debugging: shows or hides every fx mesh whose name starts with `prefix` and redraws the frame (no time passes). */
      fxShowNamed(prefix: string, on: boolean): number;
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
      /** Key 7's (Myriad Swords) state: its clock (s, −1 idle), swords drawn, strikes so far. The short name stays for the capture scenarios. */
      van():{ clock: number; shown: number; strikes: number; dives: number };
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
      /** ?key2=twin-pearl only: the grey box (cast now, each cast's numbers, refill, the Vương, the sim world's tick). */
      twinPearl?: {
        cast(): void;
        reports(): readonly TwinCastReport[];
        refill(): void;
        layout(): void;
        boss(): void;
        tick(): number;
        alive(): { ground: number; crows: number };
      };
    };
  }
}

void (async () => {
  const wanted = params.get("weapon") ?? DEFAULT_WEAPON;
  const equipped = setWeapon(wanted).then((ok) => (ok ? true : setWeapon(DEFAULT_WEAPON)));
  const wantedElement = params.get("element") ?? DEFAULT_ELEMENT;
  const elemented = setElement(wantedElement).then((ok) => (ok ? true : setElement(DEFAULT_ELEMENT)));
  // The cut-in's and the numbers' fonts, loaded before the first use (a capture never shows a fallback face).
  const fonts = Promise.all([
    document.fonts.load('400 120px "Ma Shan Zheng"', ULT_CUTIN.hanzi),
    // The cut-in's name is set in 700 (its title is laid out from the measured width).
    document.fonts.load('700 36px "Cormorant Garamond"', ULT_CUTIN.name),
    document.fonts.load('italic 700 54px "Cormorant Garamond"', "0123456789.KM×"),
  ]).catch(() => undefined);
  await Promise.all([herd.load(), caster.load(), look.ready, equipped, elemented, fonts]);
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
  await Promise.all(prewarmLoads);
  screen.prewarm(view.stage.renderer);
  // The aura's programs (mantle, tip star, the silk ribbons, the far swords' halo) compile now, aura on or off, for both
  // targets they may draw into: the post chain's buffer (bloom on: linear, no tone map in the material) and the screen
  // (Low). Compiled for the screen only, the post chain's variant compiled on the first cast instead (+13 ms on key 1's
  // first frame, +28 ms on key 7's, 03/11).
  {
    const r = view.stage.renderer;
    const was = r.getRenderTarget();
    try {
      for (const target of [view.stage.composer.readBuffer, null]) {
        r.setRenderTarget(target);
        swordAura.prewarm(r, view.camera);
        fx.prewarmAura(r, view.camera);
        myriad.prewarmAura(r, view.camera);
        greybox?.prewarm(r, view.camera);
      }
      // Fire uploads once and compiles with the real scene/lights in the active pipeline's target.
      r.setRenderTarget(view.stage.bloom.enabled ? view.stage.composer.readBuffer : null);
      await prewarmFire(stage, r, view.camera, view.scene);
      const active = fx.element.id;
      try {
        for (const id of ["fire", "metal"]) {
          await setElement(id);
          await Promise.all(prewarmLoads);
          const masks = screen.prewarmTextures(r);
          prewarmReports.push(numbers.prewarm(view.scene, () =>
            stage.prewarm(fx.element, r, view.scene, view.stage.composer.readBuffer, masks, () => { screen.prewarm(r); })));
        }
      } finally {
        await setElement(active);
      }
    } finally {
      r.setRenderTarget(was);
    }
  }
  caster.onState = (kind, detail) => {
    if (kind === "clip") probe.clip(detail);
    else probe.event(kind, detail);
  };
  caster.start();
  window.__lab = {
    ready: true,
    flipbookProbe: () => runFlipbookProbe(view.stage.renderer),
    prewarmReport: () => structuredClone(prewarmReports),
    type,
    // The caster acts the slot first: SwordSkillHost.play names only a clip (K4 asks for Skill2 like the guard, K1 for Attack
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
    async element(id) {
      if (id !== undefined) await setElement(id);
      return fx.element.id;
    },
    aura(id) {
      if (id !== undefined) setAura(auraIdOf(id));
      return swordAura.direction;
    },
    auraLayer(name, on = true, intensity = 1) {
      if (name !== undefined) swordAura.setLayer(name, on, intensity);
      const out: Record<string, { on: boolean; intensity: number }> = {};
      for (const l of AURA_LAYERS) out[l] = { ...swordAura.layers[l] };
      return out;
    },
    auraSolo() {
      auraSolo.start();
      return true;
    },
    swordMask(on) {
      if (on) {
        maskRestore?.();
        const d = myriad.auraDebug;
        const a = swordAura.anchors;
        const lead = [fx.blades.mesh, d.lead, auraSolo.blade.mesh];
        const mid = [fx.blades.swarm, d.mid].filter((m): m is THREE.InstancedMesh => m !== null);
        maskRestore = drawSwordMask(view.stage.renderer, view.scene, view.camera, lead, mid, a?.bladeFrom ?? 0.085, a?.guardFrom ?? -0.125);
      } else {
        maskRestore?.();
        maskRestore = null;
        view.render(0);
      }
    },
    auraParts() {
      const d = myriad.auraDebug;
      const parts: Record<string, THREE.Object3D[]> = { mantle: [swordAura.meshes[0]!], star: [swordAura.meshes[1]!], silk: [fx.ribbonMesh, d.ribbons, auraSolo.silk.mesh] };
      if (auraMantle.hull !== null) parts.hull = [auraMantle.hull];
      const r = partsCoverage(view.stage.renderer, view.scene, view.camera, parts);
      view.render(0);
      return r;
    },
    auraGpu(frames) {
      auraGpu ??= new AuraGpuTimer(view.stage.renderer, swordAura.timed);
      auraGpu.arm(true);
      for (let i = 0; i < frames; i += 1) {
        frame(1 / 60);
        auraGpu.frame();
      }
      auraGpu.arm(false);
      return auraGpu.report(view.info().gpu);
    },
    auraShow(part, on) {
      const meshes = swordAura.meshes;
      if (part === "mantle" || part === "all") {
        meshes[0]!.visible = on && (meshes[0] as THREE.Mesh & { geometry: THREE.InstancedBufferGeometry }).geometry.instanceCount > 0;
        if (auraMantle.hull !== null) auraMantle.hull.visible = on && auraMantle.hull.count > 0;
      }
      if (part === "star" || part === "all") meshes[1]!.visible = on && (meshes[1] as THREE.Mesh & { geometry: THREE.InstancedBufferGeometry }).geometry.instanceCount > 0;
      // Fire's SilkTail is its flame trail, drawn with the aura off too: "all" keeps it (only "silk" hides it).
      if (part === "silk" || (part === "all" && fx.element.trail.flame === undefined)) {
        fx.ribbonMesh.visible = on;
        myriad.auraDebug.ribbons.visible = on;
        auraSolo.silk.mesh.visible = on;
      }
      if (part === "halo" || part === "all") myriad.auraDebug.far.setHalo(on && swordAura.on);
      view.render(0);
    },
    auraInfo: () => ({ direction: swordAura.direction, name: AURA_NAMES[swordAura.direction], swords: swordAura.count, flames: swordAura.flames(), reduced: swordAura.reduced, quality, streak: AURA_STREAK, plates: auraMantle.graded ? "graded" : "even", anchors: swordAura.anchors === null ? null : { bladeFrom: swordAura.anchors.bladeFrom, guardFrom: swordAura.anchors.guardFrom, ring: swordAura.anchors.ring, pommelY: swordAura.pommelY, profile: Array.from(swordAura.anchors.profile).filter((_, i) => i % 8 === 0).map((v) => +v.toFixed(4)) } }),
    async clip(folder, id, x, y, z, sizeM, mode) {
      await stage.flipbooks.ready(folder);
      const pool = stage.flipbooks.pool(folder, id, mode !== undefined ? { mode } : {});
      if (!pool.ready) return false;
      pool.spawn(screenV.set(x, y, z), sizeM, { ground: 0 });
      return true;
    },
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
    fxNamed() {
      const out: { name: string; order: number; count: number }[] = [];
      view.layers.fx.traverseVisible((c) => {
        const g = (c as THREE.Mesh).geometry as (THREE.BufferGeometry & { instanceCount?: number }) | undefined;
        if (c.name !== "" && g !== undefined) out.push({ name: c.name, order: c.renderOrder, count: g.instanceCount ?? -1 });
      });
      return out;
    },
    fireImpact(mode) {
      if (mode !== undefined) FIRE_LAB.impact = mode;
      const audit = { ...FIRE_LAB.audit };
      return {
        mode: FIRE_LAB.impact,
        ready: stage.flipbooks.loaded(BRUSH.folder).includes(BRUSH.id),
        ...firePrewarmStatus(stage, view.stage.renderer),
        audit,
        ageTicks: audit.firstAt < 0 ? -1 : Math.round((stage.time - audit.firstAt - lastWorldDt) * 60) + 0,
        lights: lights.levels(),
      };
    },
    crescents() {
      return { metal: crescentOf(stage, "metal").spawned, fire: crescentOf(stage, "fire").spawned };
    },
    showcase(id) {
      return { played: clipSkills.cast(id), ids: showcase.ids() };
    },
    meteor(cast = false) {
      if (cast) meteor.cast();
      const r = meteor.last;
      return r === null ? null : { ...r, impactAt: [...r.impactAt], markAt: [...r.markAt], active: meteor.active };
    },
    clipSkill(key = 8) {
      const runner = key === 9 ? clipSkills9 : clipSkills;
      const r = runner.last;
      return r === null ? null : { ...r, strikeAt: [...r.strikeAt], active: runner.active };
    },
    expansion(id) {
      return { played: clipSkills9.cast(id), ids: expansion.ids() };
    },
    clipKit() {
      const a = clipAudit(stage, fx.element.id);
      return a === null ? null : { spawned: { ...a.spawned }, pools: { ...a.pools }, bodies: { ...a.bodies }, bodyPools: { ...a.bodyPools } };
    },
    fxSolo(prefix) {
      let n = 0;
      view.layers.fx.traverse((c) => {
        if ((c as THREE.Mesh).geometry === undefined) return;
        if (prefix === null) {
          const shown = soloShown.get(c);
          if (shown !== undefined) c.visible = shown;
        } else {
          if (!soloShown.has(c)) soloShown.set(c, c.visible);
          c.visible = c.name !== "" && c.name.startsWith(prefix) && soloShown.get(c)!;
        }
        if (c.visible) n += 1;
      });
      if (prefix === null) soloShown.clear();
      view.render(0);
      return n;
    },
    fxShowNamed(prefix, on) {
      // Hidden by name, shown back by name: a pool's own update re-shows it next frame anyway (no time passes here).
      let n = 0;
      view.layers.fx.traverse((c) => {
        if (c.name !== "" && c.name.startsWith(prefix) && (c as THREE.Mesh).geometry !== undefined) {
          c.visible = on;
          n += 1;
        }
      });
      view.render(0);
      return n;
    },
    debugShow(part, on) {
      // Lab debugging: hide a part and redraw this frame (no time passes).
      if (part === "swarm") {
        if (fx.blades.swarm !== null) fx.blades.swarm.visible = on;
      } else if (part === "blades") fx.blades.mesh.visible = on;
      else if (part === "fx") {
        // Hiding remembers each layer's own state and showing puts it back (pools and sigils hidden while empty stay so).
        for (const c of view.layers.fx.children) {
          if (c === fx.blades.mesh) continue;
          if (!on) {
            fxShown.set(c, c.visible);
            c.visible = false;
          } else c.visible = fxShown.get(c) ?? true;
        }
        if (on) fxShown.clear();
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
      for (let i = 0; i < myriad.swordCount; i += 1) {
        if (!myriad.poseOf(i, pose)) continue;
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
    van: () => ({ clock: myriad.clock, shown: myriad.shownCount(), strikes: myriad.strikes, dives: myriad.dives }),
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
      for (let i = 0; i < myriad.swordCount; i += 1) {
        if (!myriad.poseOf(i, pose)) continue;
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
  if (greybox !== null) {
    window.__lab.twinPearl = {
      cast: () => type("k2"),
      reports: () => greybox.reports,
      refill: () => greybox.refillAll(),
      layout: () => greybox.nextLayout(),
      boss: () => greybox.addBoss(),
      tick: () => greybox.world.tick,
      alive: () => {
        let ground = 0;
        let crows = 0;
        for (const b of greybox.world.beasts.list) if (b.alive) b.gate === "sky" ? (crows += 1) : (ground += 1);
        return { ground, crows };
      },
    };
  }
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
