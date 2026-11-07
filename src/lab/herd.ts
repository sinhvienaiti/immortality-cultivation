/**
 * Dev-only stand-in beasts for the skills lab (never shipped): the reuse rule
 * (owner 01/11, MONSTER_MODEL_INVENTORY.md) gives us Tripo originals of other
 * games until Tu Tiên's own beasts pass their gate: Dragonhold's blight-wolf
 * (Phong Lang) and tusk-boar (Thiết Giáp Trư), Wordwoven's kamaitachi (Thạch
 * Thử). One InstancedMesh per species. Implements the skills' TargetField.
 * Reactions (power pass, canon D58 (5), POWER_RESEARCH §4): a hit lights a
 * rim (fresnel) in the attacker's colour for 2–4 frames (3 on elites and the
 * king) with a one-frame body brighten, kicks the body back 5–30 cm along the
 * blow on a critically damped spring (out in ~80 ms, home in ~0.4 s: never a
 * one-frame push), and holds it still for a local hit-stop when asked
 * (holdBeast). Only elites (tier 2–3) and big strikes (power ≥ 0.8) stagger:
 * 80 ms of no walking and a tip away from the blow, then 120 ms of immunity,
 * so a running reaction is never restarted by more hits (DMC5's rule). The
 * king (tier 4, a rescaled tusk-boar stand-in) never moves at the root: it
 * only tips 1–3° about its feet. A death dissolves the body through a noise
 * mask with a glowing edge in the killer's colour (VFX_STANDARD §3.3 "tan có
 * viền"), no shrink; the lab's death-fx.ts adds spirit threads, ink flecks
 * and a light burst on the same frame. Round 2 (both blind judges: "the beasts
 * barely flinch, turn into pale ghosts inside the vortex and look untouched
 * afterwards"): big hits (power ≥ 0.95) slide the beast back 0.3–0.8 m
 * along the blow (it stays there), the finisher's light (power > 1.1, or
 * `launch`) flings small beasts up in one flip, elites stagger for 0.22 s
 * with a 17° tip, and a death is a 0.32 s slice-dissolve from the cut plane
 * outward with a hot edge in the killer's saturated colour (death-fx.ts
 * shatters the body into spirit sparks and leaves a ground scorch); a
 * respawn rises from the ground with a dim ember edge, never a pale glow
 * (the "bleached beasts left standing" after K5 were respawns dissolving in
 * with a cool white HDR edge in the vortex's middle). K5's vortex
 * (`pull`) draws the beasts in its zone toward its heart in a swirl, the dying
 * ones lifted into it as they dissolve; a respawn dissolves in from the
 * ground with a cool edge and rises (no teleport, no pop). Round 3a (P6,
 * victim tiers: "the player's eye needs a few spectacular proof points"):
 * the lab's victim director (victims.ts) picks per cast 4–8 HERO victims
 * (`heroVictim`: a one-frame white-cyan silhouette, an 0.4 m shove on the
 * blow's frame, a real launch with 1.25 turns, then lying pinned for about a
 * second while the director plants a sword through it; a kill dissolves after
 * the pin), SECONDARY victims (`hop`: a shared hop with the rim flash) and
 * background ones (the rim flash and the dissolve). The finisher's light no
 * longer launches every small beast by itself. Allocates nothing per frame.
 */
import * as THREE from "three";
import { TAG_MASK_GLSL, TAG_UNIFORMS } from "../view/skills/tag-mask";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { FoeStatusKind } from "../view/skills/element-kit";
import type { TargetField } from "../view/skills/targets";
import { LAB_ASSETS } from "./look";
import { ThunderBodyReaction } from "./thunder-impact-r2";

interface Species {
  readonly file: string;
  readonly lengthM: number;
  readonly yaw: number; // model forward → +x (radians added)
  readonly hp: number;
  readonly tier: number;
  readonly radius: number;
}

const SPECIES: readonly Species[] = [
  { file: "blight-wolf.glb", lengthM: 1.55, yaw: 0, hp: 4, tier: 1, radius: 0.45 },
  { file: "tusk-boar.glb", lengthM: 1.7, yaw: 0, hp: 7, tier: 2, radius: 0.55 },
  { file: "kamaitachi.glb", lengthM: 1.05, yaw: 0, hp: 2, tier: 0, radius: 0.32 },
  // The king's stand-in (power pass): the tusk-boar at twice its size (reuse rule: rescale before new models).
  { file: "tusk-boar.glb", lengthM: 3.6, yaw: 0, hp: 60, tier: 4, radius: 1.2 },
];
/** Where the king stands (east flank, clear of the other skills' aim points). */
const KING_AT = [15, -9] as const;

export type HerdMode = "still" | "march";

const MAX = 100;
/** Knockback: a critically damped spring (rad/s): an impulse peaks after 1/ω (~80 ms) and is home in ~0.4 s. */
const KNOCK_W = 12;
/** Stagger tilt: an underdamped spring (rad/s, ζ): it tips away from the blow, overshoots once and settles. */
const TILT_W = 15;
const TILT_Z = 0.45;
/** A death slices away over this time (s); a respawn dissolves in over SPAWN_S, rising from SPAWN_SINK m down. */
const DIE_S = 0.32;
const SPAWN_S = 0.5;
const SPAWN_SINK = 0.25;
/** Gone this long (s) before a dead slot respawns (power pass: 1.6 s, so the tide refills during a field-wide skill). */
const GONE_S = 1.6;
const GONE_CLEAR_S = 3.2;
/** Rim flash (s): 2 frames on small beasts, 3 on elites and the king; its HDR level (× the blow's colour). */
const RIM_S = 0.034;
const RIM_ELITE_S = 0.05;
const RIM_LEVEL = 2.6;
/** An element's status on a beast (canon D59, TargetField.status): its rim level (× its colour) and the share of its time it fades over at the end. */
const STATUS_LEVEL = 1.6;
const STATUS_FADE = 0.3;
/** Status kinds that flicker on the rim (fire). */
const FLICKER: ReadonlySet<FoeStatusKind> = new Set<FoeStatusKind>(["burn", "shocked"]);
/** Recoil along the blow (m): 5–30 cm by power; elites take 60 %; the king none. */
const RECOIL_MIN = 0.05;
const RECOIL_MAX = 0.3;
/** Stagger (s) of big strikes and of elites (longer), then immunity (s) from its start, so more hits never restart it. */
const STAGGER_S = 0.08;
const STAGGER_ELITE_S = 0.22;
const IMMUNE_S = 0.12;
const IMMUNE_ELITE_S = 0.26;
/** Peak tip (rad) of a small beast's flinch, a big strike's stagger, an elite's (17°) and the king's upper-body recoil (4°). */
const TIP_SMALL = 0.07;
const TIP_STAGGER = 0.16;
const TIP_ELITE = 0.3;
const TIP_KING = 0.07;
/** Knockback slide of a big hit (power ≥ SLIDE_POWER): 0.3–0.8 m by power, elites half, the king none; decay rate (1/s). */
const SLIDE_POWER = 0.95;
const SLIDE_MIN = 0.3;
const SLIDE_MAX = 0.8;
const SLIDE_K = 9;
/** A launch (`launch`): up-speed (m/s), gravity (m/s²), along-the-blow speed (m/s); small beasts only. */
const LAUNCH_VY = 5.6;
const LAUNCH_G = -16;
const LAUNCH_V = 3.4;
/** Peak of the underdamped tilt spring per unit kick (1/ω × its first-peak share at ζ = TILT_Z). */
const TILT_PEAK = 0.62 / 15;
/** Hero victims: the shove on the blow's frame (m), the launch's up-speed (m/s) and along-the-blow speed, its turns, the pin (s). */
const HERO_SHOVE_M = 0.4;
const HERO_VY = 6.4;
const HERO_V = 2.2;
const HERO_TURNS = 1.25;
const PIN_S = 1.0;
/** A secondary victim's hop: up-speed (m/s), about 0.3 m. */
const HOP_VY = 3.2;
/** The respawn's edge colour (linear): a dim ember, below bloom (a cool white HDR edge read as bleached ghosts). */
const SPAWN_EDGE = [0.42, 0.1, 0.06] as const;

/** Per-instance dissolve: the vertex passes its threshold, edge colour and model-space point to the fragment. */
const DISSOLVE_VERT_PARS = "attribute float iDissolve;\nattribute vec3 iEdge;\nattribute vec3 iRim;\nattribute vec4 iCut;\nattribute float iWhite;\nvarying float vDissolve;\nvarying vec3 vEdge;\nvarying vec3 vRim;\nvarying vec4 vCut;\nvarying vec3 vDisP;\nvarying float vWhite;\n";
const DISSOLVE_VERT = "#include <begin_vertex>\n\tvDissolve = iDissolve;\n\tvEdge = iEdge;\n\tvRim = iRim;\n\tvCut = iCut;\n\tvDisP = position;\n\tvWhite = iWhite;";
/**
 * The element's look on the herd (canon D59): the one-frame hit silhouette's light (linear HDR; Metal white-cyan,
 * Fire white-gold) and a hero victim's rim (linear; Metal cyan). Set by the lab's element switch.
 */
const HERD_LOOK = {
  white: { value: new THREE.Vector3(1.5, 2.0, 2.2) },
  // An element's burning-away kill edge (LAB_BURN): hot, mid, deep, and the char behind it (w).
  burnHot: { value: new THREE.Vector3() },
  burnMid: { value: new THREE.Vector3() },
  burnDeep: { value: new THREE.Vector3() },
  burnChar: { value: 0 },
};
const HERO_RIM: [number, number, number] = [0.06, 0.55, 0.95];

const DISSOLVE_FRAG_PARS = `uniform vec3 uLabWhite;
#ifdef LAB_BURN
uniform vec3 uLabBurnHot;
uniform vec3 uLabBurnMid;
uniform vec3 uLabBurnDeep;
uniform float uLabChar;
#endif
varying float vWhite;
varying float vDissolve;
varying vec3 vEdge;
varying vec3 vRim;
varying vec4 vCut;
varying vec3 vDisP;
float labHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float labNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(labHash3(i), labHash3(i + vec3(1.0, 0.0, 0.0)), u.x), mix(labHash3(i + vec3(0.0, 1.0, 0.0)), labHash3(i + vec3(1.0, 1.0, 0.0)), u.x), u.y);
  float b = mix(mix(labHash3(i + vec3(0.0, 0.0, 1.0)), labHash3(i + vec3(1.0, 0.0, 1.0)), u.x), mix(labHash3(i + vec3(0.0, 1.0, 1.0)), labHash3(i + vec3(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(a, b, u.z);
}
float labDissolveN() {
  float n = labNoise3(vDisP * 4.0) * 0.65 + labNoise3(vDisP * 11.0 + 3.1) * 0.35;
  // A death's slice (vCut.w = the body's mid height): it eats from the cut plane outward, ragged by the noise.
  if (vCut.w > 0.001) n = abs(dot(vDisP - vec3(0.0, vCut.w, 0.0), vCut.xyz)) / (vCut.w * 1.9) * 0.82 + n * 0.18;
  return n;
}
`;
/**
 * The dissolve's glowing edge (emissive): in the edge colour; with an element's burn (LAB_BURN, Fire) a kill instead
 * burns away: white-gold at the very edge, amber, then orange, and the body charred just behind it.
 */
const DISSOLVE_EDGE = [
  "#ifdef LAB_BURN",
  "\tif ( vDissolve > 0.0 && vCut.w > 0.001 ) {",
  "\t\tfloat labW = labDn - labTh;",
  "\t\ttotalEmissiveRadiance += uLabBurnHot * ( 1.0 - smoothstep( 0.0, 0.025, labW ) ) + uLabBurnMid * smoothstep( 0.0, 0.02, labW ) * ( 1.0 - smoothstep( 0.03, 0.075, labW ) ) + uLabBurnDeep * smoothstep( 0.05, 0.08, labW ) * ( 1.0 - smoothstep( 0.09, 0.17, labW ) );",
  "\t\tdiffuseColor.rgb *= mix( 1.0 - uLabChar, 1.0, smoothstep( 0.1, 0.3, labW ) );",
  "\t} else if ( vDissolve > 0.0 ) totalEmissiveRadiance += vEdge * ( 1.0 - smoothstep( 0.0, 0.09, labDn - labTh ) );",
  "#else",
  "\tif ( vDissolve > 0.0 ) totalEmissiveRadiance += vEdge * ( 1.0 - smoothstep( 0.0, 0.09, labDn - labTh ) );",
  "#endif",
].join("\n");
/** Discard below the threshold (−0.05 at 0: nothing; 1.05 at 1: all). */
const DISSOLVE_DISCARD = "\tfloat labDn = labDissolveN();\n\tfloat labTh = vDissolve * 1.1 - 0.05;\n\tif ( vDissolve > 0.0 && labDn < labTh ) discard;";

export class LabHerd implements TargetField {
  readonly size = MAX;
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
  /** Kills burn away (an element's FoeStatus.burn, setBurn). */
  private burnOn = false;
  private readonly dissolveAttr: THREE.InstancedBufferAttribute[] = [];
  private readonly edgeAttr: THREE.InstancedBufferAttribute[] = [];
  private readonly rimAttr: THREE.InstancedBufferAttribute[] = [];
  private readonly cutAttr: THREE.InstancedBufferAttribute[] = [];
  private readonly whiteAttr: THREE.InstancedBufferAttribute[] = [];
  private readonly heights: number[] = [];
  private readonly sp = new Int8Array(MAX);
  private readonly slot = new Int16Array(MAX); // instance index within its species
  private readonly px = new Float32Array(MAX);
  private readonly pz = new Float32Array(MAX);
  private readonly hx = new Float32Array(MAX); // home (still) or spawn (march)
  private readonly hz = new Float32Array(MAX);
  private readonly yaw = new Float32Array(MAX);
  private readonly hp = new Float32Array(MAX);
  private readonly flash = new Float32Array(MAX);
  /** Rim flash left (s) and its length; a local hit-stop left (s); stagger left (s); reaction immunity left (s). */
  private readonly rimT = new Float32Array(MAX);
  private readonly rimLen = new Float32Array(MAX);
  private readonly hold = new Float32Array(MAX);
  /** A clip skill's slow: seconds left and the pace kept (clip-skills.ts). */
  private readonly slowT = new Float32Array(MAX);
  private readonly slowK = new Float32Array(MAX);
  private readonly stag = new Float32Array(MAX);
  private readonly immune = new Float32Array(MAX);
  /** The element's status: time left (s), its length, its kind's flicker and its colour (0xRRGGBB). */
  private readonly statusT = new Float32Array(MAX);
  private readonly statusLen = new Float32Array(MAX);
  private readonly statusFlicker = new Uint8Array(MAX);
  private readonly statusRgb = new Int32Array(MAX);
  /** Knockback offset and its velocity (critically damped spring to 0). */
  private readonly rx = new Float32Array(MAX);
  private readonly rz = new Float32Array(MAX);
  private readonly rvx = new Float32Array(MAX);
  private readonly rvz = new Float32Array(MAX);
  /** Knockback slide velocity (m/s, decays at SLIDE_K); air height (m), its speed, and a flip about (ax, az) while airborne. */
  private readonly svx = new Float32Array(MAX);
  private readonly svz = new Float32Array(MAX);
  private readonly air = new Float32Array(MAX);
  private readonly airV = new Float32Array(MAX);
  private readonly flip = new Float32Array(MAX);
  private readonly flipV = new Float32Array(MAX);
  /** The killing blow's ground direction (the slice plane's). */
  private readonly kdx = new Float32Array(MAX);
  private readonly kdz = new Float32Array(MAX);
  /** Stagger tilt (rad) and its rate, about the ground axis (ax, az) ⟂ the last blow. */
  private readonly tilt = new Float32Array(MAX);
  private readonly tiltV = new Float32Array(MAX);
  private readonly thunderBody = new ThunderBodyReaction(MAX);
  private readonly ax = new Float32Array(MAX);
  private readonly az = new Float32Array(MAX);
  /** > 0 while dying (s since the killing blow); the slot then waits `gone` s and respawns. */
  private readonly dying = new Float32Array(MAX);
  private readonly gone = new Float32Array(MAX); // > 0 until respawn
  /** ≥ 0 while dissolving in after a respawn (s); −1 none. */
  private readonly spawn = new Float32Array(MAX).fill(-1);
  /** March: ≥ 0 while dissolving out at the heart before going back to the gate (s); −1 none. */
  private readonly leave = new Float32Array(MAX).fill(-1);
  private readonly live = new Uint8Array(MAX);
  private readonly tint = new Int32Array(MAX);
  /** Caught by the running vortex (1), and its lift as it dissolves. */
  private readonly caught = new Uint8Array(MAX);
  /** Dissolve and lift as last drawn, and as they stood at the killing blow (a death starts from them). */
  private readonly shownDis = new Float32Array(MAX);
  private readonly shownLift = new Float32Array(MAX);
  private readonly die0 = new Float32Array(MAX);
  private readonly lift0 = new Float32Array(MAX);
  private readonly vortex = { on: false, x: 0, z: 0, r: 0, t: 0, until: 0 };
  /** Hero victims (round 3a, P6): 1 while launched, the pin left (s), a kill held until the pin ends, the white frame shown. */
  private readonly hero = new Uint8Array(MAX);
  private readonly pin = new Float32Array(MAX);
  private readonly heldDeath = new Uint8Array(MAX);
  private readonly whiteShown = new Uint8Array(MAX);
  /** A hero victim lands and is pinned at (x, z), struck along (dx, dz): the director plants its sword. */
  onPin: ((i: number, x: number, z: number, dx: number, dz: number) => void) | null = null;
  /** A held kill starts dissolving after its pin (the director answers with the death's VFX). */
  onDie: ((i: number) => void) | null = null;
  private count = 0;
  private mode: HerdMode = "still";
  /**
   * Stand-in HP scale (power pass): a field-wide skill meets a tide, not 87 beasts. Key 7 sets 2 while it runs, so
   * its ~800 strikes spread over the herd and the finisher has beasts left to cut; 1 otherwise.
   */
  toughness = 1;
  /** The real-sim swarm lab keeps deaths gone until Reset. Other lab modes retain their refill. */
  autoRespawn = true;
  private time = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qt = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly pv = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly e = new THREE.Euler();
  private readonly c = new THREE.Color();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    const perSpecies = [0, 0, 0, 0];
    this.layout(perSpecies);
    for (let k = 0; k < SPECIES.length; k += 1) {
      const def = SPECIES[k]!;
      const gltf = await loader.loadAsync(LAB_ASSETS + "models/" + def.file);
      let mesh: THREE.Mesh | null = null;
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (mesh === null && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
      });
      if (mesh === null) throw new Error("no mesh in " + def.file);
      const src = mesh as THREE.Mesh;
      const geometry = src.geometry.clone();
      geometry.applyMatrix4(src.matrixWorld);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const sizeX = box.max.x - box.min.x;
      const sizeZ = box.max.z - box.min.z;
      const along = Math.max(sizeX, sizeZ);
      const scale = def.lengthM / along;
      // Feet on the ground, centred.
      geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      geometry.scale(scale, scale, scale);
      // Long axis along x: turn models whose long side is z.
      if (sizeZ > sizeX) geometry.rotateY(Math.PI / 2);
      geometry.rotateY(def.yaw);
      geometry.computeBoundingBox();
      this.heights[k] = geometry.boundingBox!.max.y;
      const n = Math.max(1, perSpecies[k]!);
      const dis = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      const edge = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      const rim = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      const cut = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
      const white = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      white.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("iWhite", white);
      this.whiteAttr[k] = white;
      dis.setUsage(THREE.DynamicDrawUsage);
      edge.setUsage(THREE.DynamicDrawUsage);
      rim.setUsage(THREE.DynamicDrawUsage);
      cut.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("iDissolve", dis);
      geometry.setAttribute("iEdge", edge);
      geometry.setAttribute("iRim", rim);
      geometry.setAttribute("iCut", cut);
      const material = (Array.isArray(src.material) ? src.material[0]! : src.material) as THREE.MeshStandardMaterial;
      LabHerd.dissolvable(material);
      // An element switched before the models arrived (the lab's ?element=) still burns its kills away.
      LabHerd.burnable(material, this.burnOn);
      const inst = new THREE.InstancedMesh(geometry, material, n);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      // The shadow dissolves with the body (the default depth material knows nothing of the mask).
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      LabHerd.dissolvableDepth(depth);
      inst.customDepthMaterial = depth;
      this.meshes[k] = inst;
      this.dissolveAttr[k] = dis;
      this.edgeAttr[k] = edge;
      this.rimAttr[k] = rim;
      this.cutAttr[k] = cut;
      this.group.add(inst);
    }
    this.update(0);
  }

  /** The species' own material, with the per-instance noise dissolve and its glowing edge (emissive, HDR only on the thin edge). */
  private static dissolvable(material: THREE.MeshStandardMaterial): void {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uLabWhite = HERD_LOOK.white;
      shader.uniforms.uLabBurnHot = HERD_LOOK.burnHot;
      shader.uniforms.uLabBurnMid = HERD_LOOK.burnMid;
      shader.uniforms.uLabBurnDeep = HERD_LOOK.burnDeep;
      shader.uniforms.uLabChar = HERD_LOOK.burnChar;
      shader.uniforms.uTagMask = TAG_UNIFORMS.uTagMask;
      shader.uniforms.uTagK = TAG_UNIFORMS.uTagK;
      shader.vertexShader = DISSOLVE_VERT_PARS + shader.vertexShader.replace("#include <begin_vertex>", DISSOLVE_VERT);
      shader.fragmentShader =
        TAG_MASK_GLSL +
        DISSOLVE_FRAG_PARS +
        shader.fragmentShader
          .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n" + DISSOLVE_DISCARD)
          .replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\n" + DISSOLVE_EDGE +
              // The hit rim: fresnel in the blow's colour (HDR on the silhouette, a faint fill inside so it reads at 30 px).
              "\n\tfloat labRim = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );\n\ttotalEmissiveRadiance += vRim * ( 0.12 + 1.6 * labRim * labRim );" +
              // A hero victim's one-frame silhouette: the whole body white-cyan light (round 3a, P6).
              "\n\tdiffuseColor.rgb *= 1.0 - vWhite;\n\ttotalEmissiveRadiance = mix( totalEmissiveRadiance, uLabWhite, vWhite );" +
              // Its glow (hit rim, status, silhouette, burn) keeps only the tag mask's share behind a word tag (tag-mask.ts).
              "\n\ttotalEmissiveRadiance *= vxTagKeep();",
          );
    };
    material.customProgramCacheKey = () => "lab-herd-dissolve";
    material.needsUpdate = true;
  }

  private static dissolvableDepth(material: THREE.MeshDepthMaterial): void {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = DISSOLVE_VERT_PARS + shader.vertexShader.replace("#include <begin_vertex>", DISSOLVE_VERT);
      shader.fragmentShader = DISSOLVE_FRAG_PARS + shader.fragmentShader.replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n" + DISSOLVE_DISCARD);
    };
    material.customProgramCacheKey = () => "lab-herd-dissolve-depth";
  }

  /** Clusters for still mode (skills aimed at fixed spots) plus a scatter; counts per species out. */
  private layout(perSpecies: number[]): void {
    const spots: [number, number, number, number][] = [
      // x, z, radius, count
      [-5, -7, 1.9, 9],
      [0, -10, 2.2, 11],
      [5, -6, 1.9, 9],
      [-9, -12, 2.4, 8],
      [9, -12, 2.4, 8],
      [0, -15, 2.6, 9],
      [-2.5, -4.5, 1.2, 3],
      [2.5, -4.5, 1.2, 3],
      // The flanks and gates (power pass: key 7 reaches nearly the whole 40 m field).
      [-15, -15, 2.2, 7],
      [15, -15.5, 2.0, 6],
      [-15.5, -4, 2.0, 7],
      [15.5, -3, 1.8, 6],
    ];
    let n = 0;
    let seed = 17;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const [x, z, r, count] of spots) {
      for (let i = 0; i < count && n < MAX; i += 1) {
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * r;
        const k = rnd() < 0.5 ? 0 : rnd() < 0.55 ? 2 : 1;
        this.sp[n] = k;
        this.slot[n] = perSpecies[k]!;
        perSpecies[k] = perSpecies[k]! + 1;
        this.hx[n] = x + Math.cos(a) * d;
        this.hz[n] = z + Math.sin(a) * d;
        this.px[n] = this.hx[n]!;
        this.pz[n] = this.hz[n]!;
        // Facing the heart (+z, south) with a little spread.
        this.yaw[n] = Math.atan2(-(this.hz[n]! - 3), -(this.hx[n]! - 0)) + (rnd() - 0.5) * 0.5;
        this.hp[n] = SPECIES[k]!.hp;
        this.live[n] = 1;
        n += 1;
      }
    }
    // The king, alone on the east flank.
    if (n < MAX) {
      const k = 3;
      this.sp[n] = k;
      this.slot[n] = perSpecies[k]!;
      perSpecies[k] = perSpecies[k]! + 1;
      this.hx[n] = this.px[n] = KING_AT[0];
      this.hz[n] = this.pz[n] = KING_AT[1];
      this.yaw[n] = Math.atan2(-(KING_AT[1] - 3), -KING_AT[0]);
      this.hp[n] = SPECIES[k]!.hp;
      this.live[n] = 1;
      n += 1;
    }
    this.count = n;
  }

  setMode(mode: HerdMode): void {
    this.mode = mode;
    this.respawnAll();
  }

  respawnAll(): void {
    for (let i = 0; i < this.count; i += 1) {
      this.px[i] = this.hx[i]!;
      this.pz[i] = this.hz[i]!;
      this.hp[i] = SPECIES[this.sp[i]!]!.hp;
      this.live[i] = 1;
      this.dying[i] = 0;
      this.gone[i] = 0;
      this.spawn[i] = -1;
      this.leave[i] = -1;
      this.flash[i] = 0;
      this.rimT[i] = this.hold[i] = this.stag[i] = this.immune[i] = this.slowT[i] = 0;
      this.statusT[i] = 0;
      this.rx[i] = this.rz[i] = this.rvx[i] = this.rvz[i] = 0;
      this.svx[i] = this.svz[i] = this.air[i] = this.airV[i] = this.flip[i] = this.flipV[i] = 0;
      this.tilt[i] = this.tiltV[i] = 0;
      this.thunderBody.clear(i);
      this.caught[i] = 0;
      this.shownDis[i] = this.shownLift[i] = 0;
      this.hero[i] = this.heldDeath[i] = this.whiteShown[i] = 0;
      this.pin[i] = 0;
    }
    for (const a of this.whiteAttr) {
      (a.array as Float32Array).fill(0);
      a.needsUpdate = true;
    }
    // A death cut short keeps its slice plane on the instance (only a finished death clears it): clear them all,
    // or the next leave or spawn dissolve (march) eats along that stale plane instead of the noise.
    for (const a of this.cutAttr) {
      (a.array as Float32Array).fill(0);
      a.needsUpdate = true;
    }
    this.vortex.on = false;
  }

  /** K5's vortex: the beasts within `r` of (x, z) now are drawn toward it in a swirl for `seconds` (eased in and out). */
  pull(x: number, z: number, r: number, seconds: number): void {
    const v = this.vortex;
    v.on = true;
    v.x = x;
    v.z = z;
    v.r = r;
    v.t = 0;
    v.until = seconds;
    for (let i = 0; i < this.count; i += 1) {
      const dx = this.px[i]! - x;
      const dz = this.pz[i]! - z;
      this.caught[i] = this.live[i] === 1 && dx * dx + dz * dz <= (r + 0.5) * (r + 0.5) ? 1 : 0;
    }
  }

  /** A beast dissolving out at the heart (march) is no target: it reappears at the gate (review fix). */
  alive(i: number): boolean {
    return i >= 0 && i < this.count && this.live[i] === 1 && this.dying[i] === 0 && this.leave[i]! < 0 && this.hero[i] === 0 && this.pin[i]! <= 0 && this.heldDeath[i] === 0;
  }

  /** The beast's height above the ground now (a launch or a hop), m. */
  airY(i: number): number {
    return this.air[i]!;
  }

  /** True while beast `i` is a hero victim (launched or pinned). */
  isHero(i: number): boolean {
    return this.hero[i] === 1 || this.pin[i]! > 0;
  }

  /**
   * Makes beast `i` (just struck along (dx, dz)) a hero victim: a one-frame white-cyan silhouette now, an 0.4 m
   * shove along the blow, a launch with 1.25 turns, then lying pinned for PIN_S on landing (onPin); a kill (the hit
   * that just landed) is held until the pin ends, then dissolves (onDie). Small and medium beasts (tier ≤ 2) only.
   */
  heroVictim(i: number, dx: number, dz: number): boolean {
    if (i < 0 || i >= this.count || this.tier(i) >= 3 || this.hero[i] === 1 || this.pin[i]! > 0) return false;
    if (this.live[i] !== 1 || this.leave[i]! >= 0 || this.spawn[i]! >= 0) return false;
    if (this.dying[i]! > 0) {
      this.dying[i] = 0;
      this.heldDeath[i] = 1;
    }
    this.hero[i] = 1;
    this.whiteNow(i);
    // The shove reads on the blow's frame (~18 px at the play camera), then the flight carries it on.
    this.px[i] = this.px[i]! + dx * HERO_SHOVE_M;
    this.pz[i] = this.pz[i]! + dz * HERO_SHOVE_M;
    // A medium beast (the boar) flies lower.
    const vy = this.tier(i) >= 2 ? HERO_VY * 0.8 : HERO_VY;
    this.airV[i] = vy;
    this.air[i] = 0.001;
    this.svx[i] = dx * HERO_V;
    this.svz[i] = dz * HERO_V;
    this.flip[i] = 0;
    this.flipV[i] = (Math.PI * 2 * HERO_TURNS) / ((2 * vy) / -LAUNCH_G);
    this.ax[i] = dz;
    this.az[i] = -dx;
    this.tilt[i] = this.tiltV[i] = 0;
    this.rx[i] = this.rz[i] = this.rvx[i] = this.rvz[i] = 0;
    return true;
  }

  /** A secondary victim's hop (about 0.3 m, no turn), shared by every one struck on the frame. */
  hop(i: number): void {
    if (i < 0 || i >= this.count || this.air[i]! > 0.05 || this.hero[i] === 1 || this.pin[i]! > 0) return;
    if (this.tier(i) >= 4) return;
    this.airV[i] = this.tier(i) >= 2 ? HOP_VY * 0.7 : HOP_VY;
    this.air[i] = 0.001;
  }

  /**
   * The element's look on the herd (canon D59): the one-frame hit silhouette's light (linear HDR; null: Metal's
   * white-cyan) and a hero victim's rim (linear; null: Metal's cyan). Load time.
   */
  setElementLook(white: readonly number[] | null, heroRim: readonly number[] | null): void {
    if (white === null) HERD_LOOK.white.value.set(1.5, 2.0, 2.2);
    else HERD_LOOK.white.value.set(white[0]!, white[1]!, white[2]!);
    const r = heroRim ?? [0.06, 0.55, 0.95];
    HERO_RIM[0] = r[0]!;
    HERO_RIM[1] = r[1]!;
    HERO_RIM[2] = r[2]!;
  }

  /**
   * An element's burning-away kill edge (canon D59, element-kit.ts FoeStatus.burn; Fire, round 3: the dissolve edge
   * in the killer's colour cubed read as a raw-flesh coral); null: the edge in the killer's colour. Recompiles the
   * species' programs (load time, on an element switch).
   */
  setBurn(burn: { hot: readonly number[]; mid: readonly number[]; deep: readonly number[]; char: number } | null): void {
    if (burn !== null) {
      HERD_LOOK.burnHot.value.set(burn.hot[0]!, burn.hot[1]!, burn.hot[2]!);
      HERD_LOOK.burnMid.value.set(burn.mid[0]!, burn.mid[1]!, burn.mid[2]!);
      HERD_LOOK.burnDeep.value.set(burn.deep[0]!, burn.deep[1]!, burn.deep[2]!);
      HERD_LOOK.burnChar.value = burn.char;
    }
    this.burnOn = burn !== null;
    for (const mesh of this.meshes) LabHerd.burnable(mesh.material as THREE.MeshStandardMaterial, this.burnOn);
  }

  /** Adds or removes LAB_BURN on a species' material (a recompile only when it changes). */
  private static burnable(m: THREE.MeshStandardMaterial, on: boolean): void {
    const d = (m.defines ??= {}) as Record<string, string>;
    if (on === "LAB_BURN" in d) return;
    if (on) d.LAB_BURN = "";
    else delete d.LAB_BURN;
    m.needsUpdate = true;
  }

  /** A one-frame white-cyan silhouette on a struck beast (the basic shot's and slot 1's target, round 3a P8). */
  silhouette(i: number): void {
    if (i >= 0 && i < this.count && this.live[i] === 1) this.whiteNow(i);
  }

  /** The white-cyan silhouette on this frame's draw (cleared by the next update). */
  private whiteNow(i: number): void {
    const a = this.whiteAttr[this.sp[i]!];
    if (a === undefined) return;
    a.setX(this.slot[i]!, 1);
    a.needsUpdate = true;
    this.whiteShown[i] = 1;
  }
  x(i: number): number {
    return this.px[i]! + this.rx[i]!;
  }
  z(i: number): number {
    return this.pz[i]! + this.rz[i]!;
  }
  midY(i: number): number {
    return (this.heights[this.sp[i]!] ?? 0.8) * 0.55;
  }
  radius(i: number): number {
    return SPECIES[this.sp[i]!]!.radius;
  }
  tier(i: number): number {
    return SPECIES[this.sp[i]!]!.tier;
  }

  nearest(x: number, z: number, maxR: number, skip = -1): number {
    let best = -1;
    let bestD = maxR * maxR;
    for (let i = 0; i < this.count; i += 1) {
      if (i === skip || !this.alive(i)) continue;
      const dx = this.x(i) - x;
      const dz = this.z(i) - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  inCircle(x: number, z: number, r: number, out: Int32Array): number {
    let n = 0;
    for (let i = 0; i < this.count && n < out.length; i += 1) {
      if (!this.alive(i)) continue;
      const dx = this.x(i) - x;
      const dz = this.z(i) - z;
      const rr = r + this.radius(i);
      if (dx * dx + dz * dz <= rr * rr) out[n++] = i;
    }
    return n;
  }

  inCapsule(ax: number, az: number, bx: number, bz: number, halfW: number, out: Int32Array): number {
    let n = 0;
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz || 1;
    for (let i = 0; i < this.count && n < out.length; i += 1) {
      if (!this.alive(i)) continue;
      const px = this.x(i) - ax;
      const pz = this.z(i) - az;
      const t = Math.max(0, Math.min(1, (px * vx + pz * vz) / len2));
      const dx = px - vx * t;
      const dz = pz - vz * t;
      const rr = halfW + this.radius(i);
      if (dx * dx + dz * dz <= rr * rr) out[n++] = i;
    }
    return n;
  }

  /** The element's status on beast `i` (TargetField.status): its rim glows in `rgb` once the hit's flash is over, flickering for fire, fading at the end. */
  status(i: number, kind: FoeStatusKind, seconds: number, rgb: number): void {
    if (!this.alive(i) || seconds <= 0) return;
    this.statusT[i] = this.statusLen[i] = seconds;
    this.statusFlicker[i] = FLICKER.has(kind) ? 1 : 0;
    this.statusRgb[i] = rgb;
  }

  /** A local hit-stop: beast `i` holds still for `seconds` (the basic blow's stop is its target's alone). */
  holdBeast(i: number, seconds: number): void {
    if (i >= 0 && i < this.count) this.hold[i] = Math.max(this.hold[i]!, seconds);
  }

  /** Beast `i` moves at `k` of its pace for `seconds` (a clip skill's slow; a hold still stops it). */
  slow(i: number, seconds: number, k: number): void {
    if (i < 0 || i >= this.count) return;
    this.slowT[i] = Math.max(this.slowT[i]!, seconds);
    this.slowK[i] = k;
  }

  /** Show a production sim hit with its exact remaining health, keeping the existing reaction/dissolve. */
  hitFromSim(i: number, dx: number, dz: number, power: number, rgb: number, hpFraction: number): void {
    if (!this.alive(i)) return;
    const remaining = Math.max(0, hpFraction) * SPECIES[this.sp[i]!]!.hp;
    this.hp[i] = remaining + (power >= 0.9 ? 3 : power >= 0.5 ? 2 : 1) / this.toughness;
    this.hit(i, dx, dz, power, rgb);
  }

  /** Thunder R3: replace only the generic tilt, preserving HP, stun, recoil and the existing rim. */
  thunderImpact(i: number, dx: number, dz: number): void {
    if (!this.alive(i)) return;
    this.tilt[i] = this.tiltV[i] = 0;
    this.thunderBody.strike(i, dx, dz);
  }

  /** `rimS`: the rim flash's length (s; default 2–4 frames; the five-phase samples ask for about 0.1 s). */
  hit(i: number, dx: number, dz: number, power: number, rgb: number, rimS?: number): boolean {
    if (!this.alive(i)) return false;
    const tier = this.tier(i);
    const king = tier >= 4;
    const elite = tier >= 2 && !king;
    // Rim flash, 2–4 frames, in the attacker's colour; the body brightens on the first frames only.
    this.rimT[i] = this.rimLen[i] = rimS ?? (elite || king ? RIM_ELITE_S : RIM_S);
    this.flash[i] = 1;
    this.tint[i] = rgb;
    // A big hit slides the beast back 0.3–0.8 m along the blow (it stays where it lands; elites half); the
    // finisher's light flings small beasts up in one flip. The king never moves at the root.
    if (!king && power >= SLIDE_POWER) {
      {
        const d = (SLIDE_MIN + (SLIDE_MAX - SLIDE_MIN) * Math.min(1, (power - SLIDE_POWER) / 0.25)) * (elite ? 0.5 : 1);
        // Exponential decay: distance = v0 / SLIDE_K; a slide already running keeps the faster of the two.
        const v0 = d * SLIDE_K;
        const cur = this.svx[i]! * dx + this.svz[i]! * dz;
        if (v0 > cur) {
          this.svx[i] = dx * v0;
          this.svz[i] = dz * v0;
        }
      }
    }
    // Recoil 5–30 cm along the blow: a velocity impulse on the critically damped spring (peak = push, ~80 ms out).
    // The king never moves at the root. The spring's speed is capped so stacked blows never throw a beast past 30 cm.
    if (!king) {
      const push = Math.min(RECOIL_MAX, RECOIL_MIN + 0.25 * power) * (elite ? 0.6 : 1);
      const v = push * KNOCK_W * Math.E;
      let vx = this.rvx[i]! + dx * v;
      let vz = this.rvz[i]! + dz * v;
      const cap = RECOIL_MAX * KNOCK_W * Math.E;
      const sp = Math.hypot(vx, vz);
      if (sp > cap) {
        vx *= cap / sp;
        vz *= cap / sp;
      }
      this.rvx[i] = vx;
      this.rvz[i] = vz;
    }
    // Tip away from the blow, only when no reaction runs (immunity): a stagger on elites and big strikes, a
    // flinch on small beasts, 1–3° on the king.
    if (this.immune[i]! <= 0) {
      const big = power >= 0.8;
      const tip = king ? TIP_KING : elite ? TIP_ELITE : big ? TIP_STAGGER : TIP_SMALL;
      // A new axis only once the last tip has nearly settled (turning a tipped body's axis would jump it).
      if (Math.abs(this.tilt[i]!) < 0.02) {
        this.ax[i] = dz;
        this.az[i] = -dx;
      }
      this.tiltV[i] = this.tiltV[i]! + tip / TILT_PEAK;
      if (elite || big || king) {
        this.stag[i] = king ? 0 : elite ? STAGGER_ELITE_S : STAGGER_S;
        this.immune[i] = elite ? IMMUNE_ELITE_S : IMMUNE_S;
      } else {
        this.immune[i] = RIM_S;
      }
    }
    this.hp[i] = this.hp[i]! - (power >= 0.9 ? 3 : power >= 0.5 ? 2 : 1) / this.toughness;
    if (this.hp[i]! <= 0) {
      this.thunderBody.clear(i);
      this.dying[i] = 1e-4;
      // The slice runs along this blow.
      this.kdx[i] = dx;
      this.kdz[i] = dz;
      // Killed while still dissolving in (or out): the death goes on from what is shown, and the spawn or
      // leave stops for good (it used to snap the body back whole, then resume the leave after the respawn).
      this.die0[i] = this.shownDis[i]!;
      this.lift0[i] = this.shownLift[i]!;
      this.spawn[i] = -1;
      this.leave[i] = -1;
      return true;
    }
    return false;
  }

  /**
   * Flings a small beast up along (dx, dz) in one flip (the finisher's light): it lands upright about 0.7 s
   * later, or dies in the air. Elites and the king only stagger.
   */
  launch(i: number, dx: number, dz: number): void {
    if (i < 0 || i >= this.count || this.tier(i) >= 2) return;
    if (this.air[i]! > 0.05) return;
    const vy = LAUNCH_VY * (0.9 + 0.2 * ((i * 37) % 10) / 10);
    this.airV[i] = vy;
    this.air[i] = 0.001;
    this.svx[i] = dx * LAUNCH_V;
    this.svz[i] = dz * LAUNCH_V;
    // One whole turn over the flight (2 vy / g), tumbling away from the blow.
    this.flip[i] = 0;
    this.flipV[i] = (Math.PI * 2) / ((2 * vy) / -LAUNCH_G);
    this.ax[i] = dz;
    this.az[i] = -dx;
    this.tilt[i] = this.tiltV[i] = 0;
  }

  update(dt: number): void {
    this.time += dt;
    const vx = this.vortex;
    let pullK = 0;
    if (vx.on) {
      vx.t += dt;
      // Eased in over 0.3 s, out over the last 0.4 s.
      const a = Math.min(1, vx.t / 0.3);
      const b = Math.min(1, Math.max(0, (vx.until - vx.t) / 0.4));
      pullK = a * a * (3 - 2 * a) * (b * b * (3 - 2 * b));
      if (vx.t >= vx.until) {
        vx.on = false;
        // A caught beast still dissolving keeps its lift to the end (dropping it fell ~0.4 m in a frame).
        for (let i = 0; i < this.count; i += 1) if (this.dying[i] === 0) this.caught[i] = 0;
      }
    }
    for (let i = 0; i < this.count; i += 1) {
      const k = this.sp[i]!;
      const mesh = this.meshes[k];
      if (!mesh) continue;
      const idx = this.slot[i]!;
      const dis = this.dissolveAttr[k]!;
      const edge = this.edgeAttr[k]!;
      const rimA = this.rimAttr[k]!;
      const cutA = this.cutAttr[k]!;
      // A hero victim's white silhouette lasts the one frame it was drawn on.
      if (this.whiteShown[i] === 1) {
        this.whiteAttr[k]!.setX(idx, 0);
        this.whiteShown[i] = 0;
      }
      // Reaction timers. A local hit-stop holds this beast still (its springs and walk wait).
      this.immune[i] = Math.max(0, this.immune[i]! - dt);
      const held = this.hold[i]! > 0;
      if (held) this.hold[i] = Math.max(0, this.hold[i]! - dt);
      const slowed = this.slowT[i]! > 0;
      if (slowed) this.slowT[i] = Math.max(0, this.slowT[i]! - dt);
      const bdt = held ? 0 : slowed ? dt * this.slowK[i]! : dt;
      const staggered = this.stag[i]! > 0;
      if (staggered) this.stag[i] = Math.max(0, this.stag[i]! - bdt);
      if (this.rimT[i]! > 0) {
        const r = this.rimT[i]! / Math.max(1e-3, this.rimLen[i]!);
        const rgb = this.tint[i]!;
        const lv = RIM_LEVEL * r;
        rimA.setXYZ(idx, (((rgb >> 16) & 255) / 255) * lv, (((rgb >> 8) & 255) / 255) * lv, ((rgb & 255) / 255) * lv);
        this.rimT[i] = Math.max(0, this.rimT[i]! - dt);
      } else if (this.pin[i]! > 0 || this.hero[i] === 1) {
        // A hero victim keeps a cyan rim while it flies and lies pinned (it reads at a quarter of the frame's size).
        const lv = 1.4 * Math.min(1, this.hero[i] === 1 ? 1 : this.pin[i]! / 0.3);
        rimA.setXYZ(idx, HERO_RIM[0] * lv, HERO_RIM[1] * lv, HERO_RIM[2] * lv);
      } else if (this.statusT[i]! > 0 && this.dying[i] === 0) {
        const left = this.statusT[i]! / Math.max(1e-3, this.statusLen[i]!);
        const flick = this.statusFlicker[i] === 1 ? 0.62 + 0.38 * Math.sin(this.time * 29 + i * 7.3) * Math.sin(this.time * 13 + i * 2.1) : 1;
        const lv = STATUS_LEVEL * Math.min(1, left / STATUS_FADE) * flick;
        const rgb = this.statusRgb[i]!;
        rimA.setXYZ(idx, (((rgb >> 16) & 255) / 255) * lv, (((rgb >> 8) & 255) / 255) * lv, ((rgb & 255) / 255) * lv);
      } else rimA.setXYZ(idx, 0, 0, 0);
      if (this.statusT[i]! > 0) this.statusT[i] = Math.max(0, this.statusT[i]! - dt);
      if (this.gone[i]! > 0) {
        this.gone[i] = this.gone[i]! - dt;
        mesh.setMatrixAt(idx, this.zero);
        if (this.gone[i]! <= 0) {
          // Back at its home (or the gate), dissolving in from the ground.
          this.gone[i] = 0;
          this.px[i] = this.hx[i]!;
          this.pz[i] = this.hz[i]!;
          this.hp[i] = SPECIES[k]!.hp;
          this.live[i] = 1;
          this.spawn[i] = 0;
          this.rx[i] = this.rz[i] = this.rvx[i] = this.rvz[i] = 0;
          this.tilt[i] = this.tiltV[i] = 0;
          this.flash[i] = 0;
        } else {
          continue;
        }
      }
      // Knockback slide (decays; slower in the air), the flight and its flip.
      if (this.svx[i] !== 0 || this.svz[i] !== 0) {
        this.px[i] = this.px[i]! + this.svx[i]! * bdt;
        this.pz[i] = this.pz[i]! + this.svz[i]! * bdt;
        const kd = Math.exp(-(this.air[i]! > 0 ? 1.2 : SLIDE_K) * bdt);
        this.svx[i] = this.svx[i]! * kd;
        this.svz[i] = this.svz[i]! * kd;
        if (Math.abs(this.svx[i]!) + Math.abs(this.svz[i]!) < 0.01) this.svx[i] = this.svz[i] = 0;
      }
      if (this.air[i]! > 0) {
        this.airV[i] = this.airV[i]! + LAUNCH_G * bdt;
        this.air[i] = this.air[i]! + this.airV[i]! * bdt;
        this.flip[i] = this.flip[i]! + this.flipV[i]! * bdt;
        if (this.air[i]! <= 0) {
          if (this.hero[i] === 1) {
            // A hero victim lands on its side (its 1.25 turns end a quarter turn over) and is pinned there.
            let tl = this.flip[i]! % (Math.PI * 2);
            if (tl > Math.PI) tl -= Math.PI * 2;
            this.tilt[i] = tl;
            this.tiltV[i] = 0;
            this.hero[i] = 0;
            this.pin[i] = PIN_S;
            const sl = Math.hypot(this.svx[i]!, this.svz[i]!) || 1;
            const ddx = this.svx[i]! / sl;
            const ddz = this.svz[i]! / sl;
            this.air[i] = this.airV[i] = this.flip[i] = this.flipV[i] = this.svx[i] = this.svz[i] = 0;
            this.onPin?.(i, this.x(i), this.z(i), ddx, ddz);
          } else {
            // Lands upright with a squash.
            this.air[i] = this.airV[i] = this.flip[i] = this.flipV[i] = 0;
            this.flash[i] = Math.max(this.flash[i]!, 0.6);
          }
        }
      }
      // A pinned hero victim lies still; then a held kill dissolves, a survivor gets up.
      if (this.pin[i]! > 0) {
        this.pin[i] = Math.max(0, this.pin[i]! - bdt);
        if (this.pin[i] === 0) {
          if (this.heldDeath[i] === 1) {
            this.heldDeath[i] = 0;
            this.dying[i] = 1e-4;
            this.die0[i] = 0;
            this.lift0[i] = 0;
            this.onDie?.(i);
          }
        }
      }
      let lift = 0;
      let dissolve = 0;
      if (this.dying[i]! > 0) {
        this.dying[i] = this.dying[i]! + dt;
        const u = Math.min(1, this.dying[i]! / DIE_S);
        const e = u * u * (3 - 2 * u);
        const d0 = this.die0[i]!;
        dissolve = d0 + (1 - d0) * e;
        lift = this.lift0[i]! * (1 - e) + (this.caught[i] === 1 ? 0.35 : -0.08) * e;
        // The edge in the killer's colour, saturated (its flash colour is pale: the white comes out), hot.
        const tc = ((this.tint[i]! >> 16) & 255) / 255;
        const tg = ((this.tint[i]! >> 8) & 255) / 255;
        const tb = (this.tint[i]! & 255) / 255;
        const m = Math.max(tc, tg, tb, 1e-3);
        const sr = Math.pow(tc / m, 3);
        const sg = Math.pow(tg / m, 3);
        const sb = Math.pow(tb / m, 3);
        edge.setXYZ(idx, sr * 2.4, sg * 2.4, sb * 2.4);
        // The slice plane in the model's frame: through the body's middle, along the blow and tilted (a diagonal cut).
        const cy = (this.heights[k] ?? 0.8) * 0.5;
        const nx = -this.kdz[i]!;
        const nz = this.kdx[i]!;
        const cyaw = Math.cos(this.yaw[i]!);
        const syaw = Math.sin(this.yaw[i]!);
        const l = Math.hypot(nx, 0.6, nz) || 1;
        cutA.setXYZW(idx, (nx * cyaw - nz * syaw) / l, 0.6 / l, (nx * syaw + nz * cyaw) / l, cy);
        if (u >= 1) {
          this.dying[i] = 0;
          this.live[i] = 0;
          this.caught[i] = 0;
          this.air[i] = this.airV[i] = this.flip[i] = this.flipV[i] = this.svx[i] = this.svz[i] = 0;
          cutA.setXYZW(idx, 0, 1, 0, 0);
          // A tide refills fast while a field-wide skill runs; otherwise the field stays cleared a while, so the
          // kills read (respawns in a vortex's crater 1.9 s on looked as if the beasts were never touched).
          this.gone[i] = this.autoRespawn ? (this.toughness > 1 ? GONE_S : GONE_CLEAR_S) : Infinity;
          dis.setX(idx, 1);
          mesh.setMatrixAt(idx, this.zero);
          continue;
        }
      } else if (this.spawn[i]! >= 0) {
        this.spawn[i] = this.spawn[i]! + dt;
        const u = Math.min(1, this.spawn[i]! / SPAWN_S);
        const e = u * u * (3 - 2 * u);
        dissolve = 1 - e;
        lift = -SPAWN_SINK * (1 - e);
        edge.setXYZ(idx, SPAWN_EDGE[0], SPAWN_EDGE[1], SPAWN_EDGE[2]);
        if (u >= 1) this.spawn[i] = -1;
      } else if (this.leave[i]! >= 0) {
        // March: dissolving out at the heart, then back to the gate (it used to teleport there).
        this.leave[i] = this.leave[i]! + dt;
        const u = Math.min(1, this.leave[i]! / 0.4);
        dissolve = u * u * (3 - 2 * u);
        edge.setXYZ(idx, SPAWN_EDGE[0], SPAWN_EDGE[1], SPAWN_EDGE[2]);
        if (u >= 1) {
          this.leave[i] = -1;
          this.px[i] = this.hx[i]!;
          this.pz[i] = this.hz[i]! - 4;
          this.spawn[i] = 0;
          dissolve = 1;
        }
      }
      if (this.mode === "march" && this.dying[i] === 0 && this.leave[i]! < 0 && !staggered && !held && this.pin[i]! <= 0 && this.hero[i] === 0 && this.heldDeath[i] === 0) {
        const dx = 0 - this.px[i]!;
        const dz = 1 - this.pz[i]!;
        const d = Math.hypot(dx, dz);
        if (d < 2.5) {
          if (this.spawn[i]! < 0) this.leave[i] = 0;
        } else {
          const spd = (k === 2 ? 1.6 : k === 1 ? 1.0 : 1.3) * dt;
          this.px[i] = this.px[i]! + (dx / d) * spd;
          this.pz[i] = this.pz[i]! + (dz / d) * spd;
          this.yaw[i] = Math.atan2(-dz, dx);
        }
      }
      // The vortex: caught beasts are drawn in and swirled round its heart; the dying ones harder.
      if (pullK > 0 && this.caught[i] === 1) {
        const dx = vx.x - this.px[i]!;
        const dz = vx.z - this.pz[i]!;
        const d = Math.hypot(dx, dz);
        if (d > 0.35) {
          const inward = (this.dying[i]! > 0 ? 2.6 : 1.1) * Math.min(1, d / 2) * pullK;
          const swirl = 1.4 * Math.min(1, d / 3) * pullK;
          const mx = (dx / d) * inward + (-dz / d) * swirl;
          const mz = (dz / d) * inward + (dx / d) * swirl;
          this.px[i] = this.px[i]! + mx * dt;
          this.pz[i] = this.pz[i]! + mz * dt;
          // Turn toward the way it is dragged, damped (half-life 0.15 s), the short way round.
          const want = Math.atan2(-mz, mx);
          let dy = want - this.yaw[i]!;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          this.yaw[i] = this.yaw[i]! + dy * (1 - Math.pow(2, -dt / 0.15));
        }
      }
      // Knockback: critically damped spring to 0, sub-stepped at ≤ 1/240 s (the same at any frame rate).
      const steps = Math.max(1, Math.ceil(bdt * 240));
      const h = bdt / steps;
      const w2 = KNOCK_W * KNOCK_W;
      const tw2 = TILT_W * TILT_W;
      for (let s = 0; s < steps; s += 1) {
        this.rvx[i] = this.rvx[i]! + (-w2 * this.rx[i]! - 2 * KNOCK_W * this.rvx[i]!) * h;
        this.rvz[i] = this.rvz[i]! + (-w2 * this.rz[i]! - 2 * KNOCK_W * this.rvz[i]!) * h;
        this.rx[i] = this.rx[i]! + this.rvx[i]! * h;
        this.rz[i] = this.rz[i]! + this.rvz[i]! * h;
        if (this.pin[i]! <= 0 && this.heldDeath[i] === 0) {
          this.tiltV[i] = this.tiltV[i]! + (-tw2 * this.tilt[i]! - 2 * TILT_Z * TILT_W * this.tiltV[i]!) * h;
          this.tilt[i] = this.tilt[i]! + this.tiltV[i]! * h;
        }
      }
      const bob = this.mode === "march" ? Math.abs(Math.sin(this.time * 9 + i)) * 0.05 : Math.sin(this.time * 1.7 + i) * 0.01;
      // A waddle while marching: a slight roll on the step.
      const roll = this.mode === "march" ? Math.sin(this.time * 9 + i) * 0.05 : 0;
      this.e.set(roll, this.yaw[i]!, 0);
      this.q.setFromEuler(this.e);
      // Stagger: tip about the ground axis ⟂ the blow (applied in world space, before the yaw); a flight adds its flip.
      const tl = this.tilt[i]! + this.flip[i]!;
      if (Math.abs(tl) > 1e-4) {
        this.axis.set(this.ax[i]!, 0, this.az[i]!);
        if (this.axis.lengthSq() > 1e-8) {
          this.axis.normalize();
          this.qt.setFromAxisAngle(this.axis, tl);
          this.q.premultiply(this.qt);
        }
      }
      // A hit squashes the body a little for a few frames (volume kept).
      const f = this.flash[i]!;
      const sq = 0.09 * f * f;
      this.shownDis[i] = dissolve;
      this.shownLift[i] = lift;
      this.p.set(this.x(i), lift + bob + this.air[i]!, this.z(i));
      if (this.flip[i] !== 0) {
        // A flipping body turns about its middle, not its feet: shift the feet by (middle − turned middle).
        const mid = (this.heights[k] ?? 0.8) * 0.5;
        this.pv.set(0, mid, 0).applyQuaternion(this.q);
        this.p.x += -this.pv.x;
        this.p.y += mid - this.pv.y;
        this.p.z += -this.pv.z;
      }
      this.s.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
      this.thunderBody.apply(i, dt, this.heights[k] ?? this.radius(i) * 2, this.p, this.q, this.s);
      this.m.compose(this.p, this.q, this.s);
      mesh.setMatrixAt(idx, this.m);
      dis.setX(idx, dissolve);
      // Hit brighten: the blow's colour over 3 frames (the rim carries the colour after), then the model's own.
      if (f > 0) {
        this.flash[i] = Math.max(0, f - dt * 20);
        const rgb = this.tint[i]!;
        const g = 1 + 0.5 * f;
        const w = 1 - f;
        this.c.setRGB(w + f * (((rgb >> 16) & 255) / 255) * g, w + f * (((rgb >> 8) & 255) / 255) * g, w + f * ((rgb & 255) / 255) * g);
        mesh.setColorAt(idx, this.c);
      } else {
        this.c.setRGB(1, 1, 1);
        mesh.setColorAt(idx, this.c);
      }
    }
    for (let k = 0; k < this.meshes.length; k += 1) {
      const mesh = this.meshes[k]!;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.dissolveAttr[k]!.needsUpdate = true;
      this.edgeAttr[k]!.needsUpdate = true;
      this.rimAttr[k]!.needsUpdate = true;
      this.cutAttr[k]!.needsUpdate = true;
      this.whiteAttr[k]!.needsUpdate = true;
    }
  }
}
