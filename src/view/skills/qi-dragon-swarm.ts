// Source: claude/dragon-swarm-lab src/lab/dragon-swarm-energy.ts (tickets 288–290; adapted: sim paths and tick clock).
/** Dragon Skill §10.6. View only: the baked helix and event ticks are authoritative. */
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadModel } from "../../kit/three/model-loader";
import { SWARM } from "../../content/data/swarm";
import type { Quality, SimEvent } from "../../content/types";
import { SWARM_PACKET as P, swarmChecksum } from "../../sim/swarm";
import { mulDiv } from "../../sim/fixed";
import { SWARM_TABLE_VERSION } from "../../sim/swarm-geometry";

export interface SwarmTrack {
  readonly launchTick: number;
  readonly diveTick: number;
  readonly lengthMm: number;
  readonly samples: Int32Array;
}
export interface SwarmPacket {
  readonly castId: number;
  readonly seat: number;
  readonly castTick: number;
  readonly origin: readonly [number, number, number];
  readonly pearl: readonly [number, number, number];
  readonly bodyMm: number;
  readonly speed: number;
  readonly retractTicks: number;
  readonly burstTick: number;
  readonly endTick: number;
  readonly dragons: readonly SwarmTrack[];
}

/** Reject corrupt/unsupported packets before allocating a slot; own the copied bytes. */
export function decodeSwarm(packet: unknown): SwarmPacket | null {
  if (!(packet instanceof Int32Array) || packet.length < P.headerWords || packet.byteLength > SWARM.packetMaxBytes) return null;
  if (packet[P.schema] !== SWARM.versions.schema || packet[P.geometry] !== SWARM.versions.geometry || packet[P.tables] !== SWARM_TABLE_VERSION
    || packet[P.slot] !== 2 || packet[P.dragons] !== 5 || packet[P.checksum] !== swarmChecksum(packet)) return null;
  if (packet[P.castTick]! < 0 || packet[P.seat]! < 0 || packet[P.bodyMm] !== SWARM.bodyMm || packet[P.retractTicks] !== SWARM.timing.retractTicks
    || packet[P.speedMmPerSecond] !== SWARM.timing.speedMmPerSecond || packet[P.endTick]! <= packet[P.burstTick]!) return null;
  const owned = packet.slice(), dragons: SwarmTrack[] = [];
  let offset: number = P.headerWords;
  for (let i = 0; i < 5; i += 1) {
    if (offset + P.dragonHeaderWords > owned.length) return null;
    const launchTick = owned[offset]!, diveTick = owned[offset + 1]!, count = owned[offset + 2]!, lengthMm = owned[offset + 3]!;
    offset += P.dragonHeaderWords;
    if (count < 2 || count > SWARM.geometry.maxSamples || lengthMm <= 0 || lengthMm > SWARM.geometry.maxLengthMm
      || count !== Math.ceil(lengthMm / SWARM.geometry.stepMm) + 1 || offset + count * 3 > owned.length
      || launchTick < 0 || diveTick !== launchTick + Math.ceil(lengthMm * 60 / owned[P.speedMmPerSecond]!)
      || diveTick + owned[P.retractTicks]! > owned[P.burstTick]!) return null;
    dragons.push({ launchTick, diveTick, lengthMm, samples: owned.subarray(offset, offset + count * 3) });
    offset += count * 3;
  }
  if (offset !== owned.length) return null;
  return { castId: owned[P.castId]!, seat: owned[P.seat]!, castTick: owned[P.castTick]!,
    origin: [owned[P.originX]! / 1000, owned[P.originY]! / 1000, owned[P.originZ]! / 1000],
    pearl: [owned[P.pearlX]! / 1000, owned[P.pearlY]! / 1000, owned[P.pearlZ]! / 1000],
    bodyMm: owned[P.bodyMm]!, speed: owned[P.speedMmPerSecond]!, retractTicks: owned[P.retractTicks]!,
    burstTick: owned[P.burstTick]!, endTick: owned[P.endTick]!, dragons };
}

export interface SwarmBody { visible: boolean; headMm: number; tailMm: number; rawHeadMm: number }
const clamp = THREE.MathUtils.clamp;
/** Integer endpoints match swarmBodyAt exactly. Fractional ticks interpolate those two states. */
export function swarmBody(packet: SwarmPacket, dragon: SwarmTrack, age: number, out: SwarmBody): SwarmBody {
  const at = (tick: number): number => tick < dragon.diveTick
    ? Math.min(dragon.lengthMm, Math.floor(Math.max(0, tick - dragon.launchTick) * packet.speed / 60))
    : dragon.lengthMm + mulDiv(packet.bodyMm, Math.min(tick - dragon.diveTick, packet.retractTicks), packet.retractTicks);
  const tick = Math.floor(age), alpha = age - tick;
  out.visible = age >= dragon.launchTick && age < dragon.diveTick + packet.retractTicks;
  out.rawHeadMm = THREE.MathUtils.lerp(at(tick), at(tick + 1), alpha);
  out.headMm = Math.min(dragon.lengthMm, out.rawHeadMm);
  out.tailMm = Math.min(out.headMm, Math.max(0, out.rawHeadMm - packet.bodyMm));
  return out;
}

/** Arc coordinates are the sim's baked 250 mm base stations, never recomputed from the helix's chord lengths. */
export function swarmPoint(track: SwarmTrack, mm: number, out: THREE.Vector3, extend = false): THREE.Vector3 {
  const count = track.samples.length / 3, step = SWARM.geometry.stepMm;
  const s = clamp(mm, 0, track.lengthMm);
  const i = Math.min(count - 2, Math.floor(s / step));
  const start = i * step, end = Math.min((i + 1) * step, track.lengthMm);
  const f = end <= start ? 0 : (s - start) / (end - start);
  for (let axis = 0; axis < 3; axis += 1) {
    const a = track.samples[i * 3 + axis]!, b = track.samples[(i + 1) * 3 + axis]!;
    out.setComponent(axis, (a + (b - a) * f) / 1000);
  }
  if (extend && mm !== s) {
    const dx = track.samples[(i + 1) * 3]! - track.samples[i * 3]!, dy = track.samples[(i + 1) * 3 + 1]! - track.samples[i * 3 + 1]!, dz = track.samples[(i + 1) * 3 + 2]! - track.samples[i * 3 + 2]!;
    const len = Math.hypot(dx, dy, dz) || 1, extra = (mm - s) / (1000 * len);
    out.x += dx * extra; out.y += dy * extra; out.z += dz * extra;
  }
  return out;
}

export interface SwarmSlot { readonly packet: SwarmPacket; burstAt: number | null }
type SkillEvent = Extract<SimEvent, { type: "skill-fx" }>;
/** Two casts may overlap. A duplicate event never restarts either slot; an overflow never steals a live cast. */
export class SwarmTimeline {
  readonly slots: (SwarmSlot | null)[] = [null, null];
  event(event: SkillEvent): boolean {
    if (event.stage === "swarm-cast") {
      const p = decodeSwarm(event.swarm);
      if (p === null || p.castId !== event.castId || p.seat !== event.seat || p.castTick !== event.tick) return false;
      if (this.find(p.castId, p.seat) !== undefined) return false;
      this.expire(event.tick);
      const free = this.slots.indexOf(null);
      if (free < 0) return false;
      this.slots[free] = { packet: p, burstAt: null };
      return true;
    }
    const slot = this.find(event.castId, event.seat);
    if (slot === undefined) return false;
    if (event.stage === "swarm-burst") { slot.burstAt ??= event.tick; return true; }
    if (event.stage === "swarm-end") { this.slots[this.slots.indexOf(slot)] = null; return true; }
    return false;
  }
  private find(castId: number | undefined, seat: number): SwarmSlot | undefined {
    return this.slots.find((s) => s !== null && s.packet.castId === castId && s.packet.seat === seat) ?? undefined;
  }
  expire(tick: number): void {
    for (let i = 0; i < 2; i += 1) { const s = this.slots[i]; if (s && tick >= s.packet.castTick + s.packet.endTick) this.slots[i] = null; }
  }
  reset(): void { this.slots.fill(null); }
}

/** World.tick is the next sim tick. No wall-time accumulator; paused frames keep their previous interpolation. */
export class SwarmClock {
  tick = -1;
  sample(nextTick: number, alpha: number, worldDt: number): number {
    const candidate = Math.max(0, nextTick - 1 + clamp(alpha, 0, 1));
    if (this.tick < 0 || worldDt > 0) this.tick = Math.max(this.tick, candidate);
    return this.tick;
  }
  reset(): void { this.tick = -1; }
}

const VERT_QI = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
attribute float aAlong;
attribute float aAround;
attribute float aRad;
varying float vAlong;
varying vec2 vCS;
varying float vRad;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vAlong = aAlong;
  // Round-the-body angle as cos/sin, so it interpolates across the seam; the fragment takes the angle back.
  vCS = vec2(cos(aAround * 6.2831853), sin(aAround * 6.2831853));
  vRad = aRad;
  vUv = uv;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(transformedNormal);
  vV = -mvPosition.xyz;
}`;
const FRAG_QI = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uScale;
uniform sampler2D uFlame;
uniform vec2 uScaleRep;
uniform float uFill;
uniform float uDorsal;
uniform float uManeCut;
uniform float uTime;
uniform float uFade;
uniform float uGlow;
uniform float uBack;
uniform float uLineLo;
uniform float uLineHi;
uniform float uBlur;
uniform float uBody;
uniform float uReveal;
uniform float uSink;
uniform vec3 uRim;
varying float vAlong;
varying vec2 vCS;
varying float vRad;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 base = texture2D(uMap, vUv).rgb;
  float lum = max(base.r, max(base.g, base.b));
  // Tripo strokes (belly bands, claws, fin ribs, the face) are the texels brighter than a blurred mip of the map.
  vec3 blur = texture2D(uMap, vUv, uBlur).rgb;
  float strokes = smoothstep(uLineLo, uLineHi, lum - max(blur.r, max(blur.g, blur.b)));
  float head = 1.0 - smoothstep(0.0, 0.14, vAlong);
  // The mane is a thicket of fine strokes; damped on the head so the face reads instead of a white fizz.
  strokes *= mix(1.0, 0.35, head);
  // Ordered crescent scales on the body tube, laid along the spine; derivatives taken from whichever of two
  // angle unwrappings is continuous here, so the seam round the body never shows.
  float around = atan(vCS.y, vCS.x) / 6.2831853 + 0.5;
  vec2 suv = vec2(around * uScaleRep.x, vAlong * uScaleRep.y);
  vec2 suv2 = vec2(fract(around + 0.5) * uScaleRep.x, suv.y);
  vec2 dx = dFdx(suv), dy = dFdy(suv), dx2 = dFdx(suv2), dy2 = dFdy(suv2);
  if (dot(dx2, dx2) + dot(dy2, dy2) < dot(dx, dx) + dot(dy, dy)) { dx = dx2; dy = dy2; }
  // Filter the scale lines a little wider than a pixel, so thin lines do not crawl and flicker as a body moves.
  dx *= 1.25; dy *= 1.25;
  float scales = textureGrad(uScale, suv, dx, dy).r;
  float tube = 1.0 - smoothstep(1.15, 1.45, vRad);
  float bodyMask = tube * smoothstep(0.1, 0.17, vAlong) * (1.0 - smoothstep(0.86, 0.92, vAlong));
  float fin = smoothstep(1.2, 1.5, vRad);
  // Anatomy on the tube: a bright dorsal ridge line, a belly band of wide plates (the Tripo bands), crescent
  // scales on the flanks with their own warm inner glow, so the body reads as glass, not a wire net.
  float side = abs(fract(around - uDorsal + 0.5) - 0.5);
  float ridge = (1.0 - smoothstep(0.012, 0.03, side)) * bodyMask;
  float belly = smoothstep(0.36, 0.43, side) * bodyMask;
  float flank = bodyMask * (1.0 - belly);
  float lines = max(max(strokes * (1.0 - flank), smoothstep(0.35, 0.85, scales) * flank), ridge);
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(1.0 - facing, 2.4);
  vec4 f = texture2D(uFlame, vec2(vAlong * 2.0 - uTime * 0.7, 0.5 + 0.12 * vCS.y), 3.0);
  float current = smoothstep(0.45, 0.95, max(f.r, max(f.g, f.b)) * f.a);
  // Colour runs white-gold at the head, amber along the body, deep orange at the tail; the head is the brightest.
  vec3 ramp = mix(vec3(1.0, 0.88, 0.66), vec3(1.0, 0.6, 0.18), smoothstep(0.08, 0.4, vAlong));
  ramp = mix(ramp, vec3(1.0, 0.42, 0.1), smoothstep(0.55, 1.0, vAlong));
  float tail = 1.0 - smoothstep(0.985, 1.0, vAlong);
  // Value hierarchy: white-gold spine ridge and head edges, amber flanks, orange at fin and tail tips; the mane
  // (fins on the head) is held back so the head's own silhouette reads instead of a fizz of strokes.
  float mane = fin * head;
  vec3 lineCol = mix(ramp, vec3(1.0, 0.95, 0.82), max(ridge, head * (1.0 - fin) * 0.35));
  lineCol = mix(lineCol, vec3(1.0, 0.6, 0.22), mane * 0.7);
  lineCol = mix(lineCol, vec3(1.0, 0.45, 0.1), fin * (1.0 - head) * 0.55);
  vec3 glow = (base * ramp * uBody * (1.0 + 0.8 * current)
    + ramp * scales * flank * uFill
    + lineCol * lines * uGlow
    + uRim * ramp * rim * (1.0 + 0.4 * head * (1.0 - fin))) * (1.0 - uManeCut * mane);
  // Coverage darkens what is behind the glass a little; dark fin fills stay clear instead of muddy, and parts
  // right next to the camera thin out so a close pass never becomes a milky sheet.
  float near = smoothstep(3.0, 14.0, length(vV));
  float cover = uBack * (0.2 + 0.8 * max(rim, lines)) * mix(1.0, 0.4, fin) * mix(0.35, 1.0, smoothstep(0.12, 0.45, lum)) * near * (1.0 - uManeCut * mane);
  glow *= mix(0.55, 1.0, near);
  float shown = smoothstep(uSink, uSink + 0.04, vAlong) * (1.0 - smoothstep(uReveal - 0.04, uReveal, vAlong));
  float k = uFade * tail * shown;
  gl_FragColor = vec4(glow * k, cover * k);
}`;
const PEARL_FRAG = /* glsl */ `
uniform float uFlash;
uniform float uFade;
varying vec3 vN;
varying vec3 vV;
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  vec3 core = mix(vec3(1.0, 0.6, 0.2), vec3(1.0, 0.95, 0.85), pow(facing, 3.0)) * (0.9 + 1.6 * uFlash) * (0.35 + 0.65 * pow(facing, 1.5));
  vec3 rim = vec3(1.0, 0.62, 0.22) * pow(1.0 - facing, 1.6) * (1.3 + uFlash);
  gl_FragColor = vec4((core + rim) * uFade, 1.0);
}`;
const PEARL_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

function addFlowAttributes(mesh: THREE.SkinnedMesh, n: number): void {
  const g = mesh.geometry;
  const idx = g.getAttribute("skinIndex");
  const wts = g.getAttribute("skinWeight");
  const pos = g.getAttribute("position");
  const along = new Float32Array(pos.count);
  const around = new Float32Array(pos.count);
  const radius = new Float32Array(pos.count);
  const bestOf = new Int32Array(pos.count);
  const v = new THREE.Vector3();
  const inv = mesh.skeleton.boneInverses;
  for (let i = 0; i < pos.count; i += 1) {
    let a = 0;
    let best = 0;
    let bestW = -1;
    for (let k = 0; k < 4; k += 1) {
      const b = idx.getComponent(i, k);
      const w = wts.getComponent(i, k);
      a += w * b;
      if (w > bestW) { bestW = w; best = b; }
    }
    along[i] = a / Math.max(1, n - 1);
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix).applyMatrix4(inv[best]!);
    around[i] = Math.atan2(v.x, v.z) / (Math.PI * 2) + 0.5;
    radius[i] = Math.hypot(v.x, v.z);
    bestOf[i] = best;
  }
  // Distance from the spine over the body's own radius at that bone: about 1 on the body tube, more on fins and legs.
  const perBone: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < pos.count; i += 1) perBone[bestOf[i]!]!.push(radius[i]!);
  const median = perBone.map((r) => (r.length ? r.sort((x, y) => x - y)[Math.floor(r.length / 2)]! : 1));
  const rad = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) rad[i] = radius[i]! / Math.max(1e-6, median[bestOf[i]!]!);
  g.setAttribute("aAlong", new THREE.BufferAttribute(along, 1));
  g.setAttribute("aAround", new THREE.BufferAttribute(around, 1));
  g.setAttribute("aRad", new THREE.BufferAttribute(rad, 1));
}


export interface SwarmAssets {
  readonly model: THREE.Object3D | null;
  readonly scales: THREE.Texture;
  readonly flame: THREE.Texture;
  readonly glint: THREE.Texture;
  readonly flare: THREE.Texture;
  readonly halo: THREE.Texture;
  readonly ring: THREE.Texture;
  readonly swirl: THREE.Texture;
}
const ASSET_ROOT = "/assets/immortality-cultivation/";
/** Auxiliary paintings keep the approved lab URLs; no procedural replacement for missing art. */
export interface SwarmTier {
  readonly modelTier: "high" | "medium" | null;
  readonly dragons: 5;
  readonly prepasses: 0 | 3;
  readonly skinnedDraws: 0 | 5 | 8;
  readonly bloom: boolean;
}
export function swarmTier(quality: Quality): SwarmTier {
  if (quality === "low") return { modelTier: null, dragons: 5, prepasses: 0, skinnedDraws: 0, bloom: false };
  if (quality === "medium") return { modelTier: "medium", dragons: 5, prepasses: 0, skinnedDraws: 5, bloom: false };
  return { modelTier: "high", dragons: 5, prepasses: 3, skinnedDraws: 8, bloom: true };
}
interface ModelsManifest { readonly version: number; readonly models: Record<string, { readonly tiers: Partial<Record<"high" | "medium", { readonly url: string }>> }> }
interface TextureManifest { readonly version: number; readonly textures: Record<string, { readonly url: string }> }
/** Keep the version query from the manifest; Low never requests a model or its manifest. */
export function swarmModelUrl(manifest: ModelsManifest, quality: Quality): string | null {
  const tier = swarmTier(quality).modelTier;
  if (tier === null) return null;
  const url = manifest.version === 1 ? manifest.models?.["skills/qi-dragon"]?.tiers?.[tier]?.url : undefined;
  if (typeof url !== "string" || url.length === 0) throw new Error("qi-dragon-swarm: missing model tier in manifest");
  return url.startsWith("/") ? url : ASSET_ROOT + "models/" + url;
}
async function loadAssets(quality: Quality): Promise<SwarmAssets> {
  const json = async <T>(url: string): Promise<T> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`qi-dragon-swarm: ${url} (${response.status})`);
    return response.json() as Promise<T>;
  };
  const low = quality === "low";
  const [models, textures] = await Promise.all([
    low ? null : json<ModelsManifest>(ASSET_ROOT + "models/manifest.json"),
    low ? null : json<TextureManifest>(ASSET_ROOT + "vfx/qi-dragon/manifest.json"),
  ]);
  const url = models === null ? null : swarmModelUrl(models, quality);
  const scalesUrl = textures?.version === 1 ? textures.textures?.["qi-scales"]?.url : null;
  if (!low && typeof scalesUrl !== "string") throw new Error("qi-dragon-swarm: missing scales manifest entry");
  const load = (url: string): Promise<THREE.Texture> => new THREE.TextureLoader().loadAsync(url);
  const flamePromise = load("/art-src/lab/vfx/aura/strips/strip-fire-sheath-v2.rgba.png");
  const [gltf, scales, flame, glint, flare, halo, ring, swirl] = await Promise.all([
    url === null ? null : loadModel(url), low ? flamePromise : load(scalesUrl!), flamePromise,
    load("/art-src/lab/tex/star_04.png"), load("/art-src/lab/tex/flare_01.png"), load("/art-src/lab/tex/circle_05.png"),
    load("/art-src/lab/tex/circle_04.png"), load("/art-src/lab/tex/light_01.png"),
  ]);
  for (const tex of [flame, glint, flare, halo, ring, swirl]) tex.colorSpace = THREE.SRGBColorSpace;
  for (const tex of [scales, flame]) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
  scales.anisotropy = 8;
  return { model: gltf?.scene ?? null, scales, flame, glint, flare, halo, ring, swirl };
}

const UP = new THREE.Vector3(0, 1, 0);
class RigDragon {
  readonly root: THREE.Object3D;
  readonly bones: THREE.Bone[] = [];
  readonly points: THREE.Vector3[];
  readonly material: THREE.ShaderMaterial;
  private readonly offsets: THREE.Quaternion[];
  private readonly v = new THREE.Vector3();
  private readonly y = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly x = new THREE.Vector3();
  private readonly z = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly pq = new THREE.Quaternion();
  private frame(dir: THREE.Vector3, up: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
    this.x.crossVectors(dir, up).normalize(); this.z.crossVectors(this.x, dir);
    return out.setFromRotationMatrix(this.matrix.makeBasis(this.x, dir, this.z));
  }
  constructor(assets: SwarmAssets, prepass: boolean, geometry: Map<THREE.BufferGeometry, THREE.BufferGeometry>) {
    if (assets.model === null) throw new Error("qi-dragon-swarm: skinned tier needs a model");
    this.root = cloneSkinned(assets.model);
    this.root.traverse((o) => { if (o instanceof THREE.Bone && /^bone_\d+$/.test(o.name)) this.bones.push(o); });
    this.bones.sort((a, b) => Number(a.name.slice(5)) - Number(b.name.slice(5)));
    if (this.bones.length < 2) throw new Error("qi-dragon-swarm: missing spine rig");
    this.root.updateMatrixWorld(true);
    const wp = this.bones.map((b) => b.getWorldPosition(new THREE.Vector3()));
    const rest = wp[0]!.distanceTo(wp[wp.length - 1]!) * this.bones.length / (this.bones.length - 1);
    this.root.scale.multiplyScalar((SWARM.bodyMm / 1000) / rest);
    this.root.updateMatrixWorld(true);
    this.points = Array.from({ length: this.bones.length + 1 }, () => new THREE.Vector3());
    const positions = this.bones.map((b) => b.getWorldPosition(new THREE.Vector3()));
    this.offsets = this.bones.map((b, i) => {
      this.y.subVectors(positions[Math.min(i + 1, positions.length - 1)]!, positions[i === positions.length - 1 ? i - 1 : i]!).normalize();
      this.up.copy(UP).addScaledVector(this.y, -this.y.y);
      if (this.up.lengthSq() < 1e-8) this.up.set(1, 0, 0).addScaledVector(this.y, -this.y.x);
      return this.frame(this.y, this.up.normalize(), new THREE.Quaternion()).invert().multiply(b.getWorldQuaternion(new THREE.Quaternion()));
    });
    const meshes: THREE.SkinnedMesh[] = [];
    this.root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
    // One colour pass per dragon is a hard budget, including all geometry groups.
    if (meshes.length !== 1 || meshes[0]!.geometry.groups.length > 1) throw new Error("qi-dragon-swarm: model exceeds one skinned colour pass");
    const source = meshes[0]!.material as THREE.MeshStandardMaterial;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT_QI, fragmentShader: FRAG_QI,
      uniforms: {
        uMap: { value: source.map }, uScale: { value: assets.scales }, uFlame: { value: assets.flame },
        uScaleRep: { value: new THREE.Vector2(2, 12) }, uFill: { value: 0.25 }, uDorsal: { value: 0.5 }, uManeCut: { value: 0.6 },
        uTime: { value: 0 }, uFade: { value: 0 }, uReveal: { value: 0 }, uSink: { value: -1 },
        uGlow: { value: 2.3 }, uBack: { value: 0.6 }, uLineLo: { value: 0.04 }, uLineHi: { value: 0.16 }, uBlur: { value: 3 },
        uBody: { value: 0.05 }, uRim: { value: new THREE.Color(1.1, 0.88, 0.55) },
      },
      transparent: true, premultipliedAlpha: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, side: THREE.FrontSide, toneMapped: false,
    });
    for (const mesh of meshes) {
      let g = geometry.get(mesh.geometry);
      if (g === undefined) { g = mesh.geometry.clone(); geometry.set(mesh.geometry, g); const original = mesh.geometry; mesh.geometry = g; addFlowAttributes(mesh, this.bones.length); mesh.geometry = original; }
      mesh.geometry = g; mesh.material = this.material; mesh.frustumCulled = false; mesh.renderOrder = 2;
      if (prepass) {
        const depth = new THREE.ShaderMaterial({ vertexShader: VERT_QI, fragmentShader: `
          uniform float uReveal; uniform float uSink; uniform float uFade; varying float vAlong;
          void main() { if (uFade <= 0.0 || vAlong < uSink || vAlong > uReveal) discard; gl_FragColor = vec4(0.0); }
        `, uniforms: this.material.uniforms, colorWrite: false, depthWrite: true, side: THREE.FrontSide });
        const pre = new THREE.SkinnedMesh(mesh.geometry, depth);
        pre.position.copy(mesh.position); pre.quaternion.copy(mesh.quaternion); pre.scale.copy(mesh.scale);
        pre.bindMode = mesh.bindMode; pre.bind(mesh.skeleton, mesh.bindMatrix);
        pre.frustumCulled = false; pre.renderOrder = 1; mesh.parent!.add(pre);
      }
    }
    this.root.visible = false;
  }
  draw(packet: SwarmPacket, track: SwarmTrack, age: number, body: SwarmBody, reduced: boolean): void {
    this.root.visible = body.visible;
    if (!body.visible) return;
    const u = this.material.uniforms;
    u.uTime!.value = reduced ? 0 : age / 60;
    u.uFade!.value = Math.min(1, Math.max(0, (age - track.launchTick) / (reduced ? 3 : 9)));
    u.uReveal!.value = body.rawHeadMm / packet.bodyMm;
    u.uSink!.value = (body.rawHeadMm - track.lengthMm) / packet.bodyMm;
    for (let i = 0; i < this.points.length; i += 1) swarmPoint(track, body.rawHeadMm - packet.bodyMm * i / this.bones.length, this.points[i]!, true);
    // The lab's transported spine frame preserves upright roll. No bend clamp may move a sim station.
    this.up.copy(UP);
    for (let i = 0; i < this.bones.length; i += 1) {
      const bone = this.bones[i]!, a = this.points[i]!, b = this.points[i + 1]!;
      this.y.subVectors(b, a).normalize();
      this.up.addScaledVector(this.y, -this.up.dot(this.y));
      if (this.up.lengthSq() < 1e-8) this.up.set(1, 0, 0).addScaledVector(this.y, -this.y.x);
      this.up.normalize(); this.frame(this.y, this.up, this.q).multiply(this.offsets[i]!);
      const parent = bone.parent!;
      parent.updateWorldMatrix(true, false); parent.getWorldQuaternion(this.pq);
      bone.quaternion.copy(this.pq.invert().multiply(this.q));
      bone.position.copy(parent.worldToLocal(this.v.copy(a)));
      bone.updateMatrixWorld(true);
    }
  }
}

/** Textured strips are also used by Low. Every centre lies on the same projected sim path. */
class PathStrip {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  constructor(texture: THREE.Texture, private readonly count = 65) {
    const g = new THREE.BufferGeometry(), uv: number[] = [], index: number[] = [];
    for (let i = 0; i < count; i += 1) { uv.push(i / (count - 1), 0, i / (count - 1), 1); if (i + 1 < count) index.push(2*i, 2*i+1, 2*i+2, 2*i+1, 2*i+3, 2*i+2); }
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 6), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(index);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(0.9, 0.7, 0.4), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.mesh.name = "qi-dragon-path-strip";
    this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
  }
  draw(track: SwarmTrack, body: SwarmBody, camera: THREE.Camera, width: number, offset = 0, lengthMm = 3000): void {
    this.mesh.visible = body.visible && body.headMm > body.tailMm;
    if (!this.mesh.visible) return;
    const pos = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < this.count; i += 1) {
      const f = i / (this.count - 1), s = THREE.MathUtils.lerp(body.headMm, Math.max(body.tailMm, body.headMm - lengthMm), f);
      swarmPoint(track, s, this.p); swarmPoint(track, Math.max(0, s - 20), this.q);
      this.q.sub(this.p); this.toCamera.copy(camera.position).sub(this.p); this.side.crossVectors(this.q, this.toCamera);
      if (this.side.lengthSq() < 1e-10) this.side.set(1, 0, 0); this.side.normalize();
      this.p.addScaledVector(this.side, offset);
      const w = width * (1 - f) * 0.5;
      pos.setXYZ(2*i, this.p.x - this.side.x*w, this.p.y - this.side.y*w, this.p.z - this.side.z*w);
      pos.setXYZ(2*i+1, this.p.x + this.side.x*w, this.p.y + this.side.y*w, this.p.z + this.side.z*w);
    }
    pos.needsUpdate = true; this.mesh.material.opacity = 0.65;
  }
}

function sprite(map: THREE.Texture, color: THREE.Color, size: number): THREE.Sprite {
  const o = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  o.scale.setScalar(size); o.renderOrder = 5; o.frustumCulled = false; return o;
}
/** Event-driven pearl: its flash/decay reads absolute world ticks, including on late-loaded assets. */
class SwarmPearl {
  readonly group = new THREE.Group();
  private readonly orb: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly halo: THREE.Sprite;
  private readonly ring: THREE.Sprite;
  private readonly swirl: THREE.Sprite;
  constructor(assets: SwarmAssets, low: boolean) {
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.8, 48, 32), new THREE.ShaderMaterial({ vertexShader: PEARL_VERT, fragmentShader: PEARL_FRAG,
      uniforms: { uFlash: { value: 0 }, uFade: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.halo = sprite(assets.halo, new THREE.Color(0.9, 0.62, 0.25), 6);
    this.ring = sprite(assets.ring, new THREE.Color(0.9, 0.78, 0.5), 3.6);
    this.swirl = sprite(assets.swirl, new THREE.Color(0.9, 0.7, 0.4), 1.7);
    this.ring.material.depthTest = false;
    this.orb.visible = !low;
    this.group.add(this.orb, this.halo, this.ring, this.swirl); this.group.visible = false;
  }
  draw(slot: SwarmSlot, tick: number, reduced: boolean): void {
    const p = slot.packet, age = Math.max(0, tick - p.castTick), b = slot.burstAt === null ? -1 : Math.max(0, tick - slot.burstAt);
    const life = reduced ? 12 : p.endTick - p.burstTick;
    this.group.visible = age < p.endTick && (b < 0 || b < life);
    if (!this.group.visible) return;
    this.group.position.fromArray(p.pearl);
    const grow = THREE.MathUtils.smoothstep(age, 0, reduced ? 6 : 27);
    let flash = 0;
    if (!reduced) for (const d of p.dragons) if (age >= d.diveTick) flash = Math.max(flash, 1 - (age - d.diveTick) / 21);
    if (b >= 0 && !reduced) flash = Math.max(flash, 1.6 * Math.max(0, 1 - b / 21));
    const fade = b < 0 ? 1 : 1 - THREE.MathUtils.smoothstep(b / life, 0.3, 1), s = grow * (1 + 0.25 * flash);
    this.orb.scale.setScalar(s); this.orb.material.uniforms.uFlash!.value = flash; this.orb.material.uniforms.uFade!.value = fade;
    this.halo.scale.setScalar(6 * s); this.halo.material.opacity = 0.75 * grow * fade;
    this.ring.scale.setScalar((b < 0 || reduced ? 3.6 : 3.6 + 36 * Math.sqrt(Math.min(1, b / life))) * grow);
    this.ring.material.opacity = 0.85 * grow * fade; this.ring.material.rotation = reduced ? 0 : age / 75;
    this.swirl.scale.setScalar(1.7 * s); this.swirl.material.opacity = 0.8 * grow * fade; this.swirl.material.rotation = reduced ? 0 : -age / 27;
  }
}

class SwarmVisual {
  readonly group = new THREE.Group();
  readonly rigs: RigDragon[] = [];
  private readonly pearl: SwarmPearl;
  private readonly flares: THREE.Sprite[] = [];
  private readonly trails: PathStrip[][] = [];
  private readonly strips: PathStrip[] = [];
  private readonly sparks: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null;
  private readonly v = new THREE.Vector3();
  private readonly body: SwarmBody = { visible: false, headMm: 0, tailMm: 0, rawHeadMm: 0 };
  constructor(assets: SwarmAssets, private readonly tier: SwarmTier, geometry: Map<THREE.BufferGeometry, THREE.BufferGeometry>) {
    this.pearl = new SwarmPearl(assets, tier.modelTier === null); this.group.add(this.pearl.group);
    for (let i = 0; i < 5; i += 1) {
      if (tier.modelTier !== null) { const rig = new RigDragon(assets, i < tier.prepasses, geometry); this.rigs.push(rig); this.group.add(rig.root); }
      else { const strip = new PathStrip(assets.flame); this.strips.push(strip); this.group.add(strip.mesh); }
      const flare = sprite(assets.flare, tier.modelTier === null ? new THREE.Color(0.9, 0.8, 0.55) : new THREE.Color(1.4, 0.95, 0.55), 3.2); this.flares.push(flare); this.group.add(flare);
      const trails = tier.modelTier === null ? [] : [new PathStrip(assets.flame), new PathStrip(assets.flame)]; this.trails.push(trails);
      for (const t of trails) this.group.add(t.mesh);
    }
    if (tier.modelTier === null) { this.sparks = null; this.group.visible = false; return; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(240 * 3).fill(1e5), 3).setUsage(THREE.DynamicDrawUsage));
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ map: assets.glint, size: 0.7, color: new THREE.Color(1.5, 0.9, 0.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.sparks.frustumCulled = false; this.group.add(this.sparks); this.group.visible = false;
  }
  draw(slot: SwarmSlot, tick: number, camera: THREE.Camera, reduced: boolean): void {
    this.group.visible = true;
    const p = slot.packet, age = tick - p.castTick;
    this.pearl.draw(slot, tick, reduced);
    const pos = this.sparks?.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    for (let i = 0; i < 5; i += 1) {
      const track = p.dragons[i]!, body = swarmBody(p, track, age, this.body);
      this.rigs[i]?.draw(p, track, age, body, reduced);
      this.strips[i]?.draw(track, body, camera, 1.6, 0, p.bodyMm);
      const flare = this.flares[i]!;
      flare.visible = body.visible && age < track.diveTick;
      swarmPoint(track, body.headMm, flare.position); flare.material.opacity = Math.min(1, Math.max(0, (age - track.launchTick) / 9)) * 0.85;
      for (let t = 0; t < this.trails[i]!.length; t += 1) {
        const trail = this.trails[i]![t]!;
        trail.draw(track, body, camera, 0.22, t === 0 ? 0.55 : -0.55);
        trail.mesh.visible &&= !reduced && age < track.diveTick;
      }
      // A deterministic glint cloud: no frame-rate-dependent emission or motion while paused.
      if (pos) for (let j = 0; j < 48; j += 1) {
        const birth = Math.floor((age - j * 0.75) / 30) * 30 + j * 0.75, life = age - birth;
        const live = !reduced && birth >= track.launchTick && birth < track.diveTick + p.retractTicks && life >= 0 && life < 30;
        if (live) {
          swarmBody(p, track, birth, this.body);
          const r = ((Math.imul(p.castId + 1, 1664525) ^ Math.imul(i * 48 + j + Math.floor(birth), 1013904223)) >>> 0) / 4294967296;
          swarmPoint(track, THREE.MathUtils.lerp(this.body.tailMm, this.body.headMm, r), this.v);
          this.v.x += (r - 0.5) * life / 40; this.v.y += life / 45;
          pos.setXYZ(i * 48 + j, this.v.x, this.v.y, this.v.z);
        } else pos.setXYZ(i * 48 + j, 1e5, 1e5, 1e5);
      }
    }
    if (pos) pos.needsUpdate = true; if (this.sparks) this.sparks.visible = !reduced;
  }
}

/** A presenter is created and prewarmed by createFx during newMatch. */
export class QiDragonSwarm {
  readonly group = new THREE.Group();
  readonly timeline = new SwarmTimeline();
  readonly clock = new SwarmClock();
  readonly ready: Promise<void>;
  private readonly visuals: SwarmVisual[] = [];
  private readonly geometry = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  private disposed = false;
  private assets: SwarmAssets | null = null;
  constructor(private readonly camera: THREE.Camera, readonly quality: Quality, private readonly reduced: () => boolean = () => false, assets?: Promise<SwarmAssets>) {
    this.group.name = "qi-dragon-swarm";
    this.ready = (assets ?? loadAssets(quality)).then((loaded) => {
      this.assets = loaded;
      if (this.disposed) { for (const t of new Set([loaded.scales, loaded.flame, loaded.glint, loaded.flare, loaded.halo, loaded.ring, loaded.swirl])) t.dispose(); return; }
      for (let i = 0; i < 2; i += 1) { const visual = new SwarmVisual(loaded, swarmTier(quality), this.geometry); this.visuals.push(visual); this.group.add(visual.group); }
    });
  }
  event(event: SkillEvent): boolean { return !this.disposed && this.timeline.event(event); }
  frame(nextTick: number, alpha: number, worldDt: number): void {
    const tick = this.clock.sample(nextTick, alpha, worldDt);
    this.timeline.expire(tick);
    for (let i = 0; i < this.visuals.length; i += 1) {
      const v = this.visuals[i]!, slot = this.timeline.slots[i];
      if (slot === null || slot === undefined) v.group.visible = false;
      else v.draw(slot, Math.max(tick, slot.packet.castTick), this.camera, this.reduced());
    }
  }
  reset(): void { this.timeline.reset(); this.clock.reset(); for (const v of this.visuals) v.group.visible = false; }
  async prewarm(renderer: THREE.WebGLRenderer): Promise<void> {
    await this.ready;
    if (this.disposed) return;
    const shown: [THREE.Object3D, boolean][] = [], textures = new Set<THREE.Texture>();
    const target = new THREE.WebGLRenderTarget(32, 32);
    const scene = new THREE.Scene(); scene.children.push(this.group); scene.matrixWorldAutoUpdate = false;
    const withVisible = <T>(to: THREE.WebGLRenderTarget | null, run: () => T): T => {
      const previous = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
      try {
        this.group.traverse((o) => { shown.push([o, o.visible]); o.visible = true; });
        renderer.setRenderTarget(to); this.group.updateWorldMatrix(true, true); return run();
      } finally { for (const [o, visible] of shown) o.visible = visible; shown.length = 0; renderer.setRenderTarget(previous, face, mip); }
    };
    this.group.traverse((o) => {
      const skinned = o as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh) { if (skinned.skeleton.boneTexture === null) skinned.skeleton.computeBoneTexture(); if (skinned.skeleton.boneTexture) textures.add(skinned.skeleton.boneTexture); }
      const m = (o as THREE.Mesh).material;
      for (const mat of m ? Array.isArray(m) ? m : [m] : []) {
        for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
        if (mat instanceof THREE.ShaderMaterial) for (const u of Object.values(mat.uniforms)) if (u.value instanceof THREE.Texture) textures.add(u.value);
      }
    });
    for (const t of textures) renderer.initTexture(t);
    try {
      for (const to of [null, target]) await withVisible(to, () => renderer.compileAsync(this.group, this.camera, scene));
      if (!this.disposed) withVisible(target, () => { renderer.clear(); renderer.render(scene, this.camera); });
    } finally { target.dispose(); }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.reset(); this.group.removeFromParent();
    const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>(), skeletons = new Set<THREE.Skeleton>();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh; if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((o as THREE.SkinnedMesh).skeleton);
    });
    for (const m of materials) m.dispose(); for (const g of geometries) g.dispose(); for (const s of skeletons) s.dispose();
    // loadModel caches the model's embedded texture; only the separately loaded textures belong to this presenter.
    if (this.assets) for (const t of new Set([this.assets.scales, this.assets.flame, this.assets.glint, this.assets.flare, this.assets.halo, this.assets.ring, this.assets.swirl])) t.dispose();
    this.group.clear(); this.visuals.length = 0; this.geometry.clear();
  }
}
