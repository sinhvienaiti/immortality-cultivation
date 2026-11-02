/**
 * Foot locking with two-bone IK (MOTION_PLAN step 2.8, appendix C §2.4;
 * Holden "Simple Two Joint IK").
 *
 * A foot whose clip ankle or ball comes within 4.5 cm of its Idle height
 * while the clip is not swinging it locks where it is shown (the probe
 * plants at 4 cm). Standing, height alone decides (MOTION_PLAN 2.8 also
 * asks < 0.12 m/s; but a foot the clip moves during a transition should hold
 * and step, not glide); moving, it goes forward over the
 * ground faster than 1.6 × the body (stance ≈ 0, swing ≈ 2 ×; Lam's
 * shuffling walk lifts the swing foot only 5 cm, so height alone cannot
 * tell). The lock pivots like a foot: on the ankle while the heel is down,
 * on the ball once the heel rises (toe-off), so neither slides. The leg (thigh,
 * calf) is solved each frame so the ankle stays there while the body moves,
 * turns, leans or crouches; the foot keeps its planted heading. The clip
 * lifting the foot past 6 cm or swinging it unlocks it, and the offset fades in the air on a
 * critically damped spring that starts at the foot's own speed, so a released
 * foot neither slides on the ground nor jumps.
 *
 * Lam's legs are 0.37 m (thigh 0.19, calf 0.18), so a lock only holds while
 * it stays near the clip foot: moving, a lock more than 18 cm off lets go and
 * fades (it does not lock again before the foot lifts). Standing (idle,
 * charge, strike, turn in place), a foot that drifts 10 cm, twists past 35°
 * (MOTION_PLAN 45–60°, earlier so a 180° turn keeps up) or cannot be reached
 * steps: it lifts, crosses on an arc and comes down where it will stand once
 * the turn is done, one foot at a time.
 *
 * Lam stands at ~96 % of its leg length, where a two-bone solve turns the
 * knee by tens of degrees per centimetre of reach. So (review, 02/11): the
 * reach eases out past 97 % (soft IK), a lock or step the clip foot did not
 * ask for lowers the pelvis up to 4 cm on a spring (the knees bend instead of
 * locking straight), and a lock that the leg cannot hold even then lets go and
 * fades to the clip foot instead of dragging a straight leg. No foot is
 * solved under the ground (ankle or ball; the push is eased), and landing from
 * a dash a foot locks only once the clip has slowed it (it skids into place).
 *
 * A planted foot keeps its world heading by turning against the body's yaw
 * since it planted (the clip's own foot motion passes through; a heading
 * read off the foot itself flips when the toes point down). The bend axis comes from the clip's knee, blended to
 * the facing as the leg straightens, so the knee never flips. Targets are the
 * clip feet recorded before the procedural layers. No allocation per frame.
 */
import * as THREE from "three";
import { clamp, criticalSpring, smoothstep, springY, wrapPi } from "./math";
import { worldQuat } from "./rig";

interface Leg {
  readonly thigh: THREE.Bone;
  readonly calf: THREE.Bone;
  readonly foot: THREE.Bone;
  readonly ball: THREE.Bone | null;
  /** Idle@0 heights (root on the ground) of ankle and ball. */
  standA: number;
  standB: number;
  /** Clip pose before the layers: ankle, ball (world), foot rotation (world), last frame's ankle. */
  readonly a0: THREE.Vector3;
  readonly b0: THREE.Vector3;
  readonly f0: THREE.Quaternion;
  readonly prevA0: THREE.Vector3;
  contact: boolean;
  locked: boolean;
  /** Let go while still on the ground: no new lock before the foot lifts. */
  slipped: boolean;
  /** Planted point (world x, z): the ankle, or the ball when `pivot` is 1 (heel up). */
  lockX: number;
  lockZ: number;
  pivot: number;
  lockYaw: number;
  /** Shown offset from the clip foot (x, z, heading) and its velocity. */
  offX: number;
  offZ: number;
  offYaw: number;
  velX: number;
  velZ: number;
  velYaw: number;
  /** Step: −1 none, else its age; where it started (world x, z, heading offset) and where it lands (world x, z, heading). */
  stepT: number;
  stepX: number;
  stepZ: number;
  stepYaw: number;
  toX: number;
  toZ: number;
  toYaw: number;
  /** Step lift (m) and its fade velocity after a cancelled step. */
  lift: number;
  liftV: number;
  rel: number;
  /** Thigh + calf length (m), measured at calibration. */
  reach: number;
  /** The clip ankle in the root frame (forward, right; m) last frame, and its speed there (m/s). */
  locF: number;
  locR: number;
  clipSpeed: number;
}

const LOCK_ON_M = 0.045;
const LOCK_OFF_M = 0.06;
const FADE_HALFLIFE = 0.07;
const STEP_S = 0.3;
/**
 * A step lifts over the first STEP_RISE of its time and sets down over the last; it crosses between
 * STEP_ACROSS and 1 − STEP_ACROSS (the foot already 4 cm up), overlapping both, so the foot travels on an
 * arc at 60 % of the peak speed of a lift-then-cross-then-drop step (whose knee turned 1,500–2,000°/s,
 * review 02/11).
 */
const STEP_RISE = 0.3;
const STEP_ACROSS = 0.22;
const STEP_LIFT = 0.048;
const STEP_YAW = (35 * Math.PI) / 180;
const STEP_DRIFT = 0.1;
/**
 * The second foot may start once the first is this far through its step: late enough that one foot is always
 * planted (motion round 2: at 0.6 both feet were in the air for ~8 frames of each step of a 180° turn).
 */
const STEP_OVERLAP = 0.88;
/** Standing this long before a drift step (the inertialization settles first). */
const STAND_DELAY_S = 0.12;
/** Moving: a lock further than this from the clip foot lets go (a run's stance speed is not constant, so the offset swells mid-stance). */
const MAX_SLIP_M = 0.18;
/** Reach before a standing foot steps (share of thigh + calf). */
const REACH = 0.97;
/** Soft IK: past this share of the leg the solved reach eases out towards full length (Nicholas, "Soft IK"). */
const SOFT_START = 0.97;
/** Pelvis drop: up to DROP_MAX (m), so a lock or step stays within DROP_AT of the leg; half-life (s). */
const DROP_MAX = 0.04;
const DROP_AT = 0.965;
const DROP_HALFLIFE = 0.06;
/** A lock farther than this share of the leg from the fully dropped hip cannot be held: it lets go; it may lock again within RELOCK. */
const OVERREACH = 1.0;
const RELOCK = 0.95;
/** Half-life (s) of the push that keeps a clip foot out of the ground. */
const UNDER_HALFLIFE = 0.025;
/** Landing (`settle`), a foot touches down (locks) only while the clip moves it slower than this in the root frame (m/s): the dash pose's swing to Idle sets the feet down where the clip puts them instead of planting them short and dragging the legs. */
const SETTLE_LOCK_MPS = 0.5;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _k = new THREE.Vector3();
const _f = new THREE.Vector3();
const _ax0 = new THREE.Vector3();
const _ax1 = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _ga = new THREE.Quaternion();
const _gb = new THREE.Quaternion();
const _r0 = new THREE.Quaternion();
const _r1 = new THREE.Quaternion();
const _r2 = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export type FootMode = "stand" | "move" | "off";

export class FootLock {
  private readonly legs: Leg[] = [];
  /**
   * The heading of the foot that lags most behind `goal` (rad): a planted foot its locked heading, a stepping
   * foot where it lands. The Animator holds a standing turn within reach of it, so neither foot is left
   * twisted or out of reach (Lam's legs are 0.37 m).
   */
  laggingYaw(goal: number): number {
    let best = this.lastYaw;
    let worst = -1;
    for (const L of this.legs) {
      const h = L.locked ? L.lockYaw : L.stepT >= 0 ? L.toYaw : this.lastYaw;
      const d = Math.abs(wrapPi(goal - h));
      if (d > worst) {
        worst = d;
        best = h;
      }
    }
    return best;
  }
  private lastYaw = 0;

  /** A re-plant step is under way. */
  get busy(): boolean {
    return this.legs[0]!.stepT >= 0 || (this.legs[1] !== undefined && this.legs[1].stepT >= 0);
  }

  /** Per leg: in a re-plant step / locked this frame (for checks). */
  readonly stepping = [false, false];
  readonly lockedNow = [false, false];
  private standT = 0;
  private lastMode: FootMode = "stand";
  /** Pelvis drop (m) and its spring velocity. */
  private readonly dropS = new Float64Array(2);
  /** Per leg: how far the clip foot is under the ground (m), eased (spring x, v), so the push-up has no kink. */
  private readonly underS = new Float64Array(4);

  /** The pelvis drop applied this frame (m), for checks. */
  get drop(): number {
    return Math.max(0, this.dropS[0]!);
  }

  constructor(
    sides: { thigh: THREE.Bone; calf: THREE.Bone; foot: THREE.Bone; ball: THREE.Bone | null }[],
    /** The body's facing (world, unit), read each frame. */
    private readonly forward: THREE.Vector3,
    /** Lowered when a lock or step needs more leg than the clip gives (null: no drop). */
    private readonly pelvis: THREE.Bone | null = null,
  ) {
    for (const s of sides) {
      this.legs.push({
        ...s,
        standA: 0,
        standB: 0,
        a0: new THREE.Vector3(),
        b0: new THREE.Vector3(),
        f0: new THREE.Quaternion(),
        prevA0: new THREE.Vector3(),
        contact: false,
        locked: false,
        slipped: false,
        lockX: 0,
        lockZ: 0,
        pivot: 0,
        lockYaw: 0,
        offX: 0,
        offZ: 0,
        offYaw: 0,
        velX: 0,
        velZ: 0,
        velYaw: 0,
        stepT: -1,
        stepX: 0,
        stepZ: 0,
        stepYaw: 0,
        toX: 0,
        toZ: 0,
        toYaw: 0,
        lift: 0,
        liftV: 0,
        rel: 0,
        reach: 0,
        locF: 0,
        locR: 0,
        clipSpeed: 0,
      });
    }
  }

  /** Standing heights from the current (Idle@0) pose with the root on the ground; fresh world matrices. */
  calibrate(): void {
    for (const L of this.legs) {
      L.standA = L.foot.getWorldPosition(_a).y;
      L.standB = L.ball ? L.ball.getWorldPosition(_b).y : L.standA;
      L.thigh.getWorldPosition(_b);
      L.calf.getWorldPosition(_c);
      L.reach = _b.distanceTo(_c) + _c.distanceTo(_a);
    }
  }

  reset(): void {
    for (const L of this.legs) {
      L.contact = L.locked = L.slipped = false;
      L.offX = L.offZ = L.offYaw = L.velX = L.velZ = L.velYaw = L.lift = L.liftV = 0;
      L.stepT = -1;
    }
    this.stepping[0] = this.stepping[1] = false;
    this.lockedNow[0] = this.lockedNow[1] = false;
    this.standT = 0;
    this.lastMode = "stand";
    this.dropS[0] = this.dropS[1] = 0;
    this.underS.fill(0);
  }

  /** Records the clip's feet: after the base pose and the root are placed (fresh matrices), before the layers. */
  capture(): void {
    for (const L of this.legs) {
      L.prevA0.copy(L.a0);
      L.foot.getWorldPosition(L.a0);
      if (L.ball) L.ball.getWorldPosition(L.b0);
      else L.b0.copy(L.a0);
      worldQuat(L.foot, L.f0);
    }
  }

  /** The lowest captured clip foot's height over its standing height (m, ankle or ball): after `capture`. */
  clearance(): number {
    let c = Infinity;
    for (const L of this.legs) c = Math.min(c, L.a0.y - L.standA, L.b0.y - L.standB);
    return c;
  }

  /**
   * Locks, steps and solves the legs on fresh world matrices (after the
   * layers). `rootX, rootZ, yaw`: the shown root and its heading (rad); `ahead`: the turn still to come
   * (rad, about +y) so a step lands where the foot will stand; `mode`:
   * standing (steps allowed), moving (lock on contact, free on lift) or off
   * (every foot fades to the clip); `settle`: landing, a foot the clip still
   * sweeps does not lock yet (SETTLE_LOCK_MPS).
   */
  update(dt: number, first: boolean, rootX: number, rootZ: number, yaw: number, ahead: number, mode: FootMode, bodySpeed: number, settle = false): void {
    const legs = this.legs;
    const inv = dt > 0 && !first ? 1 / dt : 0;
    const ca = Math.cos(ahead);
    const sa = Math.sin(ahead);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    this.lastYaw = yaw;
    this.standT = mode === "stand" ? (this.lastMode === "stand" ? this.standT + dt : 0) : 0;
    if (mode === "move" && this.lastMode !== "move") {
      // Moving off: a standing lock far from the clip foot lets go (Lam's legs cannot hold it).
      for (const L of legs) if (L.locked && L.offX * L.offX + L.offZ * L.offZ > MAX_SLIP_M * MAX_SLIP_M) this.slip(L);
    }
    this.lastMode = mode;
    for (let i = 0; i < legs.length; i += 1) {
      const L = legs[i]!;
      L.rel = Math.min(L.a0.y - L.standA, L.b0.y - L.standB);
      // Moving: is the clip swinging this foot (forward over the ground faster than the stance allows)? Standing, a
      // foot on the ground locks whatever the clip does with it (a transition, a stance shift): it holds, and steps
      // if the clip takes it far.
      let swing = false;
      if (inv > 0 && mode === "move") {
        const vf = ((L.a0.x - L.prevA0.x) * fx + (L.a0.z - L.prevA0.z) * fz) * inv;
        swing = L.contact ? vf > 1.8 * bodySpeed + 0.3 : vf > 1.6 * bodySpeed + 0.1;
      }
      L.contact = !swing && L.rel < (L.contact ? LOCK_OFF_M : LOCK_ON_M);
      // The clip's own foot speed (root frame: the root's travel and turn taken out).
      const lf = (L.a0.x - rootX) * fx + (L.a0.z - rootZ) * fz;
      const lr = (L.a0.z - rootZ) * fx - (L.a0.x - rootX) * fz;
      L.clipSpeed = inv > 0 ? Math.hypot(lf - L.locF, lr - L.locR) * inv : 0;
      L.locF = lf;
      L.locR = lr;
      // A slip ends when the foot lifts, once its offset has faded, or standing once the shown foot is within reach
      // again (it may lock and step again; locking an unreachable spot would only let go next frame).
      if (!L.contact || L.offX * L.offX + L.offZ * L.offZ < 0.01 * 0.01 || (mode === "stand" && !this.overreach(L, L.a0.x + L.offX, L.a0.y, L.a0.z + L.offZ, RELOCK))) L.slipped = false;
      const clipYaw = yaw;
      // Where this foot stands once the turn is done: the clip foot turned about the root by `ahead`.
      const px = L.a0.x - rootX;
      const pz = L.a0.z - rootZ;
      const goalX = rootX + px * ca + pz * sa;
      const goalZ = rootZ - px * sa + pz * ca;
      if (L.stepT >= 0 && mode !== "stand") {
        // Moving off or gliding: the step stops where it is and fades in the air with the lift.
        L.stepT = -1;
        L.liftV = 0;
        L.locked = false;
      }
      if (L.stepT >= 0) {
        L.stepT += dt;
        const u = Math.min(1, L.stepT / STEP_S);
        // A turn asked for during the step (a new facing): the landing spot follows it while the foot is still up,
        // so it does not land where the old turn wanted and slip at once out of reach (motion round 2).
        if (u < 0.75) {
          const k = 1 - Math.exp(-dt / 0.05);
          L.toX += (goalX - L.toX) * k;
          L.toZ += (goalZ - L.toZ) * k;
          L.toYaw += wrapPi(clipYaw + ahead - L.toYaw) * k;
        }
        // Up first, across while up, down last; the heading turns over the whole step (a pivot at either end).
        // The landing spot is fixed when the step starts, so the body turning on does not drag it.
        const s = smoothstep(STEP_ACROSS, 1 - STEP_ACROSS, u);
        const sy = smoothstep(0, 1, u);
        const ox = L.stepX + (L.toX - L.stepX) * s - L.a0.x;
        const oz = L.stepZ + (L.toZ - L.stepZ) * s - L.a0.z;
        const oyaw = L.stepYaw * (1 - sy) + wrapPi(L.toYaw - clipYaw) * sy;
        this.track(L, ox, oz, oyaw, inv);
        L.lift = STEP_LIFT * smoothstep(0, STEP_RISE, u) * (1 - smoothstep(1 - STEP_RISE, 1, u));
        L.liftV = 0;
        if (u >= 1) {
          L.stepT = -1;
          L.lift = 0;
          L.locked = true;
          L.lockYaw = clipYaw + L.offYaw;
          this.plant(L, 0);
        }
      } else if (mode !== "off" && L.contact && !L.slipped && (L.locked || !settle || L.clipSpeed <= SETTLE_LOCK_MPS)) {
        // Heel up (the ball lower than the ankle): the foot pivots on the ball.
        const relA = L.a0.y - L.standA;
        const relB = L.b0.y - L.standB;
        const pivot = L.locked && L.pivot === 1 ? (relB < relA - 0.005 ? 1 : 0) : relB < relA - 0.012 ? 1 : 0;
        if (!L.locked) {
          // Touch-down: lock where the foot is shown now.
          L.locked = true;
          L.lockYaw = clipYaw + L.offYaw;
          this.plant(L, pivot);
        } else if (pivot !== L.pivot) this.plant(L, pivot);
        const oyaw = wrapPi(L.lockYaw - clipYaw);
        let tx = L.lockX;
        let tz = L.lockZ;
        if (L.pivot === 1) {
          // Ankle = planted ball + the clip's ball → ankle, turned by the foot's yaw offset.
          const dx = L.a0.x - L.b0.x;
          const dz = L.a0.z - L.b0.z;
          const c = Math.cos(oyaw);
          const sn = Math.sin(oyaw);
          tx += dx * c + dz * sn;
          tz += -dx * sn + dz * c;
        }
        this.track(L, tx - L.a0.x, tz - L.a0.z, oyaw, inv);
        const d2 = L.offX * L.offX + L.offZ * L.offZ;
        if (mode === "stand") {
          const other = legs[1 - i];
          // One foot always bears the weight: no step while the other foot is up (stepping early, or still in the air
          // after a dash's braking step), unless this foot cannot be held at all.
          const otherUp = other !== undefined && !other.locked && other.stepT < 0 && !this.overreach(L, L.a0.x + L.offX, L.a0.y, L.a0.z + L.offZ, OVERREACH);
          const busy = (other !== undefined && other.stepT >= 0 && other.stepT < STEP_S * STEP_OVERLAP) || otherUp;
          const gx = goalX - (L.a0.x + L.offX);
          const gz = goalZ - (L.a0.z + L.offZ);
          const turning = Math.abs(ahead) > STEP_YAW && gx * gx + gz * gz > 0.05 * 0.05;
          const drift = this.standT > STAND_DELAY_S && (d2 > STEP_DRIFT * STEP_DRIFT || !this.reachable(L, L.a0.x + L.offX, L.a0.y, L.a0.z + L.offZ));
          const want = turning || drift || Math.abs(L.offYaw) > STEP_YAW;
          // The foot that is further off goes first.
          const mine = Math.abs(L.offYaw) + Math.sqrt(d2) * 3;
          const theirs = other !== undefined && other.locked ? Math.abs(other.offYaw) + Math.hypot(other.offX, other.offZ) * 3 : 0;
          if (want && !busy && (i === 1 || mine + 0.05 >= theirs)) {
            L.locked = false;
            L.stepT = 0;
            L.stepX = L.a0.x + L.offX;
            L.stepZ = L.a0.z + L.offZ;
            L.stepYaw = L.offYaw;
            L.toX = goalX;
            L.toZ = goalZ;
            L.toYaw = clipYaw + ahead;
          }
          // Out of reach and no step now (the other foot is in the air): let go rather than hold a straight leg.
          if (L.stepT < 0 && this.overreach(L, tx, L.a0.y, tz, OVERREACH)) this.slip(L);
        } else if (d2 > MAX_SLIP_M * MAX_SLIP_M || this.overreach(L, tx, L.a0.y, tz, OVERREACH)) {
          this.slip(L);
        }
      } else {
        // In the air, let go, or off: the offset fades on a critical spring from the foot's speed at release.
        if (L.locked) this.slip(L);
        this.fade(L, dt);
      }
      if (L.stepT < 0 && L.lift !== 0) this.fadeLift(L, dt);
      this.stepping[i] = L.stepT >= 0;
      this.lockedNow[i] = L.locked;
    }
    for (let i = 0; i < legs.length; i += 1) {
      const L = legs[i]!;
      const under = Math.max(0, L.standA - L.a0.y, L.standB - L.b0.y);
      if (first) {
        this.underS[i * 2] = under;
        this.underS[i * 2 + 1] = 0;
      } else criticalSpring(this.underS, i * 2, under, UNDER_HALFLIFE, dt);
    }
    this.lowerPelvis(dt, first, mode);
    for (let i = 0; i < legs.length; i += 1) {
      const L = legs[i]!;
      this.solve(L, L.a0.x + L.offX, this.footY(L, i), L.a0.z + L.offZ, L.offYaw);
    }
  }

  /**
   * The ankle height to solve for: the clip's, raised by a step's lift, and not under the ground (ankle or ball;
   * a transition from the dash pose swung the clip feet 5 cm into it), the push-up eased over a frame or two.
   */
  private footY(L: Leg, i: number): number {
    return L.a0.y + Math.max(L.lift, this.underS[i * 2]!);
  }

  /** Whether (x, y, z) is beyond `share` of the leg's reach even with the pelvis fully dropped (fresh world matrices). */
  private overreach(L: Leg, x: number, y: number, z: number, share: number): boolean {
    L.thigh.getWorldPosition(_a);
    const dx = x - _a.x;
    const dy = y - (_a.y - DROP_MAX);
    const dz = z - _a.z;
    const r = share * L.reach;
    return dx * dx + dy * dy + dz * dz > r * r;
  }

  /** How far (m) the hip at `hip` must come down for (x, y, z) to lie within DROP_AT of the leg. */
  private dropFor(L: Leg, hip: THREE.Vector3, x: number, y: number, z: number): number {
    const dx = x - hip.x;
    const dz = z - hip.z;
    const v = hip.y - y;
    if (v <= 0) return 0;
    const d = DROP_AT * L.reach;
    const h = d * d - dx * dx - dz * dz;
    return h <= 0 ? v : Math.max(0, v - Math.sqrt(h));
  }

  /**
   * Lowers the pelvis (a critically damped spring, ≤ DROP_MAX) by what the locks and steps need beyond what the
   * clip's own feet need, so the knees bend rather than lock straight (turning in place, moving off, landing).
   */
  private lowerPelvis(dt: number, first: boolean, mode: FootMode): void {
    const pelvis = this.pelvis;
    if (!pelvis || !pelvis.parent) return;
    let need = 0;
    if (mode !== "off") {
      for (let i = 0; i < this.legs.length; i += 1) {
        const L = this.legs[i]!;
        L.thigh.getWorldPosition(_t);
        const want = this.dropFor(L, _t, L.a0.x + L.offX, this.footY(L, i), L.a0.z + L.offZ) - this.dropFor(L, _t, L.a0.x, L.a0.y, L.a0.z);
        if (want > need) need = want;
      }
    }
    need = Math.min(DROP_MAX, need);
    if (first) {
      this.dropS[0] = need;
      this.dropS[1] = 0;
    } else criticalSpring(this.dropS, 0, need, DROP_HALFLIFE, dt);
    const drop = this.drop;
    if (drop < 1e-5) return;
    // World down into the pelvis parent's frame (scale included).
    worldQuat(pelvis.parent, _q);
    const sc = pelvis.parent.matrixWorld.getMaxScaleOnAxis() || 1;
    _tmp.set(0, -drop / sc, 0).applyQuaternion(_q.invert());
    pelvis.position.add(_tmp);
    pelvis.updateMatrixWorld(true);
  }

  /** Plants the ankle (pivot 0) or the ball (1) where it is shown now (clip + offset, the ball turned by the yaw offset). */
  private plant(L: Leg, pivot: number): void {
    L.pivot = pivot;
    L.lockX = L.a0.x + L.offX;
    L.lockZ = L.a0.z + L.offZ;
    if (pivot === 1) {
      const dx = L.b0.x - L.a0.x;
      const dz = L.b0.z - L.a0.z;
      const c = Math.cos(L.offYaw);
      const sn = Math.sin(L.offYaw);
      L.lockX += dx * c + dz * sn;
      L.lockZ += -dx * sn + dz * c;
    }
  }

  /** Lets a lock go with the foot's velocity kept (the shown foot was still, so the offset moves against the clip). */
  private slip(L: Leg): void {
    L.locked = false;
    if (L.contact) L.slipped = true;
  }

  /** A locked or stepping foot: the new offset, its velocity measured. */
  private track(L: Leg, ox: number, oz: number, oyaw: number, inv: number): void {
    L.velX = (ox - L.offX) * inv;
    L.velZ = (oz - L.offZ) * inv;
    L.velYaw = wrapPi(oyaw - L.offYaw) * inv;
    L.offX = ox;
    L.offZ = oz;
    L.offYaw = oyaw;
  }

  private fade(L: Leg, dt: number): void {
    if (dt <= 0) return;
    const y = springY(FADE_HALFLIFE);
    const e = Math.exp(-y * dt);
    let j1 = L.velX + L.offX * y;
    L.offX = e * (L.offX + j1 * dt);
    L.velX = e * (L.velX - j1 * y * dt);
    j1 = L.velZ + L.offZ * y;
    L.offZ = e * (L.offZ + j1 * dt);
    L.velZ = e * (L.velZ - j1 * y * dt);
    j1 = L.velYaw + L.offYaw * y;
    L.offYaw = e * (L.offYaw + j1 * dt);
    L.velYaw = e * (L.velYaw - j1 * y * dt);
  }

  private fadeLift(L: Leg, dt: number): void {
    if (dt <= 0) return;
    const y = springY(0.04);
    const e = Math.exp(-y * dt);
    const j1 = L.liftV + L.lift * y;
    L.lift = e * (L.lift + j1 * dt);
    L.liftV = e * (L.liftV - j1 * y * dt);
    if (Math.abs(L.lift) < 1e-5 && Math.abs(L.liftV) < 1e-4) L.lift = L.liftV = 0;
  }

  private reachable(L: Leg, x: number, y: number, z: number): boolean {
    L.thigh.getWorldPosition(_a);
    L.calf.getWorldPosition(_b);
    L.foot.getWorldPosition(_c);
    const reach = (_b.distanceTo(_a) + _c.distanceTo(_b)) * REACH;
    return _t.set(x, y, z).distanceTo(_a) <= reach;
  }

  /** Two-bone IK: thigh and calf so the ankle reaches (tx, ty, tz); the foot keeps the clip's world rotation turned by `yaw`. */
  private solve(L: Leg, tx: number, ty: number, tz: number, yaw: number): void {
    L.thigh.getWorldPosition(_a);
    L.calf.getWorldPosition(_b);
    L.foot.getWorldPosition(_c);
    _t.set(tx, ty, tz);
    if (_t.distanceToSquared(_c) > 1e-10) {
      const lab = _b.distanceTo(_a);
      const lcb = _b.distanceTo(_c);
      const eps = 0.004;
      // Soft IK: the reach eases out past SOFT_START of the leg, so the knee's turn per cm stays bounded near straight.
      const lmax = lab + lcb;
      const ds = SOFT_START * lmax;
      const raw = _t.distanceTo(_a);
      const lat = clamp(raw > ds ? ds + (lmax - ds) * (1 - Math.exp(-(raw - ds) / (lmax - ds))) : raw, eps, lmax - eps);
      _n.copy(_c).sub(_a).normalize();
      // Knee direction: the clip's own (⟂ hip–ankle), blended to the facing as the leg straightens.
      _k.copy(_b).sub(_a);
      _k.addScaledVector(_n, -_k.dot(_n));
      const bend = _k.length() / Math.max(1e-6, lab);
      _f.copy(this.forward).addScaledVector(_n, -this.forward.dot(_n));
      if (_f.lengthSq() < 1e-8) _f.set(0, 0, 1).addScaledVector(_n, -_n.z);
      _f.normalize();
      const s = smoothstep(0.06, 0.22, bend);
      if (_k.lengthSq() > 1e-12) _k.normalize();
      _k.multiplyScalar(s).addScaledVector(_f, 1 - s);
      if (_k.lengthSq() < 1e-10) _k.copy(_f);
      _k.normalize();
      _ax0.crossVectors(_n, _k).normalize();
      const acab0 = Math.acos(clamp(_n.dot(_tmp.copy(_b).sub(_a).normalize()), -1, 1));
      _tmp.copy(_a).sub(_b).normalize();
      _ax1.copy(_c).sub(_b).normalize();
      const babc0 = Math.acos(clamp(_tmp.dot(_ax1), -1, 1));
      _tmp.copy(_t).sub(_a).normalize();
      const acat0 = Math.acos(clamp(_n.dot(_tmp), -1, 1));
      const acab1 = Math.acos(clamp((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat), -1, 1));
      const babc1 = Math.acos(clamp((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb), -1, 1));
      _ax1.crossVectors(_n, _tmp);
      const hasAx1 = _ax1.lengthSq() > 1e-12;
      if (hasAx1) _ax1.normalize();
      worldQuat(L.thigh, _ga);
      worldQuat(L.calf, _gb);
      _q.copy(_ga).invert();
      _r0.setFromAxisAngle(_tmp.copy(_ax0).applyQuaternion(_q), acab1 - acab0);
      if (hasAx1) _r2.setFromAxisAngle(_tmp.copy(_ax1).applyQuaternion(_q), acat0);
      else _r2.identity();
      _q.copy(_gb).invert();
      _r1.setFromAxisAngle(_tmp.copy(_ax0).applyQuaternion(_q), babc1 - babc0);
      L.thigh.quaternion.multiply(_r0.multiply(_r2));
      L.calf.quaternion.multiply(_r1);
      L.thigh.updateMatrixWorld(true);
    }
    // Foot: the clip's world rotation turned about world up by `yaw`.
    _r0.setFromAxisAngle(_up, yaw);
    _q.copy(_r0).multiply(L.f0);
    worldQuat(L.calf, _gb);
    L.foot.quaternion.copy(_gb.invert().multiply(_q));
    L.foot.updateMatrixWorld(true);
  }
}
