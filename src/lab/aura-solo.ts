/**
 * The sword aura's solo flight (lab only; SWORD_AURA §5.1 "Bay mẫu một thanh", __lab.auraSolo): one full Clear Wind on a
 * fixed 6 s script, so every capture of the aura's states is the same: waiting at the shoulder while a word is typed
 * (its tiers 0.4 / 0.7 / 1.0), the release, an S of flight at 12–18 m/s 1.2–2 m up, a sharp 120° turn into a dive
 * on a beast, the hit, the rise, the return to the hand and the melt into light. It wears the aura as key 1's swords
 * do (a lead blade, a hero), and its silk tail (the aura's SilkTail; Fire: its flame trail). View only.
 */
import * as THREE from "three";
import { BladeSet, type SwordModel } from "../view/skills/blades";
import { RibbonPool, smooth01 } from "../view/skills/fxkit";
import { FaceRoll } from "../view/skills/sword-material";
import { AURA_FADE, AURA_FLY, AURA_LEAD, AURA_STRIKE, AURA_WAIT, type SwordAura } from "../view/skills/sword-aura";

/** Guard → tip of the solo sword (m): key 1's flight scale (1.55 × the 1.1 m unit). */
const BLADE_M = 1.55 * 1.1;
/** Its history id in the shared aura (past key 1's and key 7's ranges). */
const SOLO_ID = 1000;
const T_RELEASE = 1.0;
const T_STRIKE = 3.5;
const T_HOLD = 3.65;
const T_HAND = 5.2;
const T_END = 6.0;

/** Times (s) and guard points (x, y, z; m) of the path, the caster at (0, 3) facing −z. */
const KEYS: readonly (readonly [number, number, number, number])[] = [
  [0.0, 0.75, 1.6, 2.7],
  [T_RELEASE, 0.75, 1.65, 2.5],
  [1.25, -1.5, 1.6, 0.2],
  [1.5, -3.5, 1.5, -2.5],
  [1.75, -1.0, 1.9, -5.0],
  [2.0, 2.0, 2.0, -3.5],
  [2.25, 3.5, 1.7, -1.0],
  [2.5, 1.0, 1.4, 0.0],
  [2.75, -2.0, 1.3, -1.5],
  [3.0, -3.0, 1.6, -4.0],
  [3.15, -2.2, 2.0, -5.5],
  [3.35, 0.5, 1.2, -6.0],
  [T_STRIKE, 2.0, 0.55, -6.5],
  [T_HOLD, 2.0, 0.6, -6.5],
  [4.0, 1.2, 2.2, -5.0],
  [4.4, 0.5, 2.0, -1.0],
  [4.9, 0.45, 1.4, 2.2],
  [T_HAND, 0.4, 1.25, 2.6],
  [T_END, 0.4, 1.25, 2.6],
];

/** Hermite through KEYS (tangents from the neighbours over their times), into `out`. */
function pathAt(t: number, out: THREE.Vector3): THREE.Vector3 {
  const n = KEYS.length;
  if (t <= KEYS[0]![0]) return out.set(KEYS[0]![1], KEYS[0]![2], KEYS[0]![3]);
  if (t >= KEYS[n - 1]![0]) return out.set(KEYS[n - 1]![1], KEYS[n - 1]![2], KEYS[n - 1]![3]);
  let i = 0;
  while (i < n - 2 && t > KEYS[i + 1]![0]) i += 1;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const p = KEYS[Math.max(0, i - 1)]!;
  const q = KEYS[Math.min(n - 1, i + 2)]!;
  const h = b[0] - a[0];
  const u = (t - a[0]) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  // The wait and the hold are still (no overshoot into them).
  const still = (k: number): boolean => k === 0 || (KEYS[k]![0] >= T_STRIKE && KEYS[k]![0] <= T_HOLD) || KEYS[k]![0] >= T_HAND;
  const tan = (k: number, c: number): number => {
    if (still(k)) return 0;
    const lo = KEYS[Math.max(0, k - 1)]!;
    const hi = KEYS[Math.min(n - 1, k + 1)]!;
    return ((hi[c]! - lo[c]!) / Math.max(1e-3, hi[0] - lo[0])) * h;
  };
  void p;
  void q;
  return out.set(
    h00 * a[1] + h10 * tan(i, 1) + h01 * b[1] + h11 * tan(i + 1, 1),
    h00 * a[2] + h10 * tan(i, 2) + h01 * b[2] + h11 * tan(i + 1, 2),
    h00 * a[3] + h10 * tan(i, 3) + h01 * b[3] + h11 * tan(i + 1, 3),
  );
}

export class AuraSolo {
  readonly blade = new BladeSet(1, 1.1, 1, { hero: true, mid: false });
  readonly silk: RibbonPool;
  private t = -1;
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Vector3();
  private readonly d = new THREE.Vector3(0, 1, 0);
  private readonly cam = new THREE.Vector3();
  private readonly faces = new FaceRoll();
  private pommelY = -0.45;
  private silkOn = false;
  private silkDeep: readonly number[] = [0.015, 0.022, 0.1];

  constructor(layer: THREE.Object3D, ribbonTexture: THREE.Texture) {
    this.silk = new RibbonPool(1, 24, ribbonTexture, 12);
    this.blade.mesh.name = "auraSoloBlade";
    layer.add(this.blade.mesh, this.silk.mesh);
  }

  /** The equipped weapon's full model and its silk's deep edge. */
  setModel(model: SwordModel, silkDeep: readonly number[] | null): void {
    this.blade.setModel(model, model);
    this.pommelY = model.pommelY;
    if (silkDeep !== null) this.silkDeep = silkDeep;
  }

  get running(): boolean {
    return this.t >= 0;
  }

  /** Starts the 6 s flight. */
  start(): void {
    this.t = 0;
    this.silkOn = false;
    this.silk.kill(0);
  }

  stop(): void {
    this.t = -1;
    this.blade.hideAll();
    this.blade.sync();
    this.silk.kill(0);
    this.silk.update(0, new THREE.PerspectiveCamera());
  }

  /** One frame (world dt): poses the sword, pushes it into the aura (between its begin and end), trails its silk. */
  update(dt: number, camera: THREE.Camera, aura: SwordAura, flame: boolean): void {
    if (this.t < 0) return;
    this.t += dt;
    const t = this.t;
    if (t >= T_END) {
      this.stop();
      return;
    }
    camera.getWorldPosition(this.cam);
    pathAt(t, this.p);
    // Direction: tip up while it waits, along its motion in flight, held through the hit and at the hand.
    if (t < T_RELEASE) this.d.set(0.18, 1, 0.12).normalize();
    else if (t < T_STRIKE || (t > T_HOLD && t < T_HAND)) {
      pathAt(t + 0.01, this.q).sub(this.p);
      if (this.q.lengthSq() > 1e-8) {
        const k = 1 - Math.pow(0.5, dt / 0.035);
        this.d.lerp(this.q.normalize(), Math.min(1, k)).normalize();
      }
    }
    const presence = smooth01(t / 0.12) * (t > T_END - 0.05 ? 0 : 1);
    const dissolve = t > T_HAND ? smooth01((t - T_HAND) / (T_END - T_HAND - 0.1)) : 0;
    const roll = this.faces.of(this.cam, this.p.x, this.p.y, this.p.z, this.d.x, this.d.y, this.d.z);
    this.blade.set(0, this.p.x, this.p.y, this.p.z, this.d.x, this.d.y, this.d.z, (BLADE_M / 1.1) * presence, roll);
    this.blade.look(0, t < T_RELEASE ? 0.5 : 0.8, t >= T_STRIKE && t < T_STRIKE + 0.06 ? 1.6 : 0, 0.05, 0.5, 0.82, dissolve, 0.3);
    this.blade.sync();
    const a = aura.input;
    a.id = SOLO_ID;
    a.gx = this.p.x;
    a.gy = this.p.y;
    a.gz = this.p.z;
    a.dx = this.d.x;
    a.dy = this.d.y;
    a.dz = this.d.z;
    a.blade = BLADE_M * presence;
    a.pommelY = this.pommelY;
    a.widthK = 1;
    a.cls = AURA_LEAD;
    a.state = t < T_RELEASE ? AURA_WAIT : t >= T_STRIKE && t < T_HOLD ? AURA_STRIKE : dissolve > 0 ? AURA_FADE : AURA_FLY;
    a.level = t < 0.33 ? 0.4 : t < 0.66 ? 0.7 : 1;
    a.releaseAge = t >= T_RELEASE && t < T_RELEASE + 0.4 ? t - T_RELEASE : -1;
    a.presence = presence;
    a.dissolve = dissolve;
    a.bright = 1;
    a.diving = t > 3.15 && t < T_STRIKE;
    a.hero = true;
    aura.push();
    // The silk tail from the release to the hand (the moded program while the aura is on; Fire: the flame look).
    const back = -this.pommelY * BLADE_M;
    const hx = this.p.x - this.d.x * back;
    const hy = this.p.y - this.d.y * back;
    const hz = this.p.z - this.d.z * back;
    if (t >= T_RELEASE && !this.silkOn && t < T_HAND) {
      this.silkOn = true;
      if (aura.on && !flame) {
        this.silk.start(0, hx, hy, hz, 0.16, 0, 0, 0, 1, 0.05);
        this.silk.setSilk(0, this.silkDeep, aura.silkBody, 0.9 * BLADE_M * (1 - this.pommelY));
      } else this.silk.start(0, hx, hy, hz, 0.14, 0.62 * 2.2, 0.88 * 2.2, 2.2, 1, 0.05);
    }
    if (this.silkOn) {
      // It flutters across the flight (sword-skills pushSilk's waves on world time).
      let sx = -this.d.z;
      let sz = this.d.x;
      const sl = Math.hypot(sx, sz) || 1;
      sx /= sl;
      sz /= sl;
      const f = Math.sin(t * 15) * 0.2 + Math.sin(t * 23) * 0.06;
      const v = Math.cos(t * 11) * 0.06;
      this.silk.push(0, hx + sx * f, hy + v, hz + sz * f);
      if (t >= T_HAND) {
        this.silk.stop(0, 0.32);
        this.silkOn = false;
      }
    }
    this.silk.setModed(aura.on && !flame);
    this.silk.update(dt, camera);
  }

  /** The element's trail look for the tail (flame or null). */
  setFlame(flame: Parameters<RibbonPool["setFlame"]>[0]): void {
    this.silk.setFlame(flame);
  }
}
