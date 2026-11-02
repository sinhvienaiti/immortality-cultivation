/**
 * Ground motion of the lab caster (MOTION_PLAN step 2.5–2.6, appendix C
 * §2.3): way-point following with speed springs (start, arrive and stop
 * ease in and out), facing by a critically damped yaw spring (half-life
 * 0.06 s moving, 0.15 s turning in place) whose goal is a follower with
 * limited speed and acceleration (motion round 2: no turn faster than
 * 360°/s, eased in and out, the feet stepping), turn-before-go when the path
 * starts more than ~60° off the facing, and the dash's shown path. (A lunge
 * or a step back from a blow is the acting's view offset on the shown root,
 * added by the Animator after `update`; the logical position never moves.)
 *
 * Logical vs shown: `x, z` is where the skill code puts the caster (the
 * dash's eased path from kiem.ts arrives through `external`); the shown
 * root follows it on a warped clock during a dash (a 60 ms ease-in, then
 * the same curve 30 ms later), so the body starts from rest instead of
 * covering 1.15 m in its first frame. No allocation per frame.
 */
import { clamp, criticalSpring, DEG, smoothstep, springY, wrapPi } from "./math";

const PATH_MAX = 64;
const HIST = 16;
/** Dash ease-in time (s): the shown dash lags the logical one by half of it once moving. */
const DASH_EASE = 0.06;
/**
 * Yaw: a follower runs to the goal at ≤ TURN_VMAX with ≤ TURN_ACC (rad/s², less turning in place, where the feet
 * step), braking in time (v ≤ √(2·a·err)); the shown yaw is a short critical spring on it, its per-frame turn
 * capped at TURN_CAP (a spring tracking an eased path barely overshoots its speed; the cap guarantees 360°/s).
 */
const TURN_VMAX = (300 * Math.PI) / 180;
/** Turning in place the feet step one at a time (foot-ik.ts), so the body turns slower. */
const TURN_VMAX_IN_PLACE = (250 * Math.PI) / 180;
const TURN_ACC = 34;
const TURN_ACC_IN_PLACE = 18;
export const TURN_CAP_RAD_S = (355 * Math.PI) / 180;

export class Locomotion {
  // Logical position (skill code reads it) and velocity.
  x = 0;
  z = 3;
  vx = 0;
  vz = 0;
  /** Scalar ground speed and its spring velocity. */
  private readonly sp = new Float64Array(2);
  /** Yaw (heading atan2(fx, fz), unwrapped) spring: angle, velocity. */
  private readonly yawS = new Float64Array(2);
  /** The follower the yaw spring tracks (unwrapped, like the yaw) and its speed (rad/s). */
  private yawRamp = Math.PI;
  private yawRampV = 0;
  yawGoal = Math.PI;
  /** Shown position (root). */
  showX = 0;
  showZ = 3;
  // Path: x, z, speed per point.
  private readonly path = new Float32Array(PATH_MAX * 3);
  private pathN = 0;
  private pathI = 0;
  keepFacing = false;
  /** Settling onto the last way-point after arrival. */
  private settle = false;
  private settleX = 0;
  private settleZ = 0;
  // Dash: logical position history and the shown clock.
  private readonly histT = new Float64Array(HIST);
  private readonly histX = new Float64Array(HIST);
  private readonly histZ = new Float64Array(HIST);
  private histN = 0;
  private histHead = 0;
  private time = 0;
  private dashT = -1;
  private dashLastMove = 0;
  /**
   * The shown dash path (before any view offset), its speed (m/s) and peak: the landing reads these. Review fix: it
   * read the logical path, which stops ~3 frames before the shown root (it lags by the ease), so the legs reached for
   * the ground and the lift fell with the shown root still at 37 m/s (a 10.3 m/s planted-foot skid).
   */
  /** The logical dash path's speed at its last move (m/s), its peak, and when it last moved: it leads the shown root. */
  private dashSpeed = 0;
  private dashPeak = 0;
  private dashMoveT = 0;
  private dashShowX = 0;
  private dashShowZ = 0;
  private dashShowSpeed = 0;
  private dashShowPeak = 0;
  /** Yaw half-life in use (s). */
  turnHalflife = 0.06;
  /** Where the planted feet point (rad) and how far the body may turn past it (rad; 0 = no limit). Set by the Animator. */
  feetYaw = 0;
  yawLead = 0;
  /** A side gait whose steps go off its nominal direction turns the body this much (rad), eased in and out. */
  yawBias = 0;
  private readonly biasS = new Float64Array(2);
  /** Deceleration used to arrive (m/s²). */
  arriveDecel = 3.2;

  get yaw(): number {
    return this.yawS[0]!;
  }

  get yawVel(): number {
    return this.yawS[1]!;
  }

  get fx(): number {
    return Math.sin(this.yawS[0]!);
  }

  get fz(): number {
    return Math.cos(this.yawS[0]!);
  }

  get speed(): number {
    return this.sp[0]!;
  }

  get hasPath(): boolean {
    return this.pathI < this.pathN;
  }

  get moving(): boolean {
    return this.hasPath || this.sp[0]! > 0.02 || this.settle;
  }

  get dashing(): boolean {
    return this.dashT >= 0;
  }

  /** Speed of the current or last way-point segment (m/s). */
  segmentSpeed = 0;

  /** Places everything at once (reset). */
  place(x: number, z: number, fx: number, fz: number): void {
    this.x = this.showX = x;
    this.z = this.showZ = z;
    this.vx = this.vz = 0;
    this.sp[0] = this.sp[1] = 0;
    const yaw = Math.atan2(fx, fz);
    this.yawS[0] = yaw;
    this.yawS[1] = 0;
    this.yawGoal = yaw;
    this.yawRamp = yaw;
    this.yawRampV = 0;
    this.yawBias = 0;
    this.biasS[0] = this.biasS[1] = 0;
    // The feet limit is re-read from the feet after the first frame; a stale one would pull the new facing round.
    this.feetYaw = yaw;
    this.yawLead = 0;
    this.turnHalflife = 0.06;
    this.keepFacing = false;
    this.segmentSpeed = 0;
    this.pathN = this.pathI = 0;
    this.settle = false;
    this.dashT = -1;
    this.dashLastMove = this.time;
    this.histN = 0;
  }

  /** Turns towards (fx, fz) through the yaw spring. */
  face(fx: number, fz: number): void {
    if (fx * fx + fz * fz < 1e-10) return;
    const h = Math.atan2(fx, fz);
    this.yawGoal = this.yawS[0]! + wrapPi(h - this.yawS[0]!);
  }

  /** Way-points [x, z, speed, …]. */
  setPath(xzs: readonly number[], keepFacing: boolean): void {
    const n = Math.min(PATH_MAX, Math.floor(xzs.length / 3));
    for (let i = 0; i < n * 3; i += 1) this.path[i] = xzs[i]!;
    this.pathN = n;
    this.pathI = 0;
    this.keepFacing = keepFacing;
    this.settle = false;
  }

  stop(): void {
    this.pathN = this.pathI = 0;
    this.settle = false;
  }

  /** The skill code moved the caster (the dash path). */
  external(x: number, z: number): void {
    const dx = x - this.x;
    const dz = z - this.z;
    if (this.dashT >= 0 && dx * dx + dz * dz > 1e-6) {
      this.face(dx, dz);
      this.dashLastMove = this.time;
      const h = this.time - this.dashMoveT;
      if (h > 1e-4) {
        this.dashSpeed = Math.hypot(dx, dz) / h;
        this.dashPeak = Math.max(this.dashPeak, this.dashSpeed);
      }
      this.dashMoveT = this.time;
    }
    this.x = x;
    this.z = z;
    this.record();
    if (this.dashT < 0) {
      this.showX = x;
      this.showZ = z;
    }
  }

  /** A dash starts now: the shown root eases into the logical path. */
  beginDash(): void {
    this.stop();
    this.sp[0] = this.sp[1] = 0;
    this.dashT = 0;
    this.dashLastMove = this.time;
    this.dashMoveT = this.time;
    this.dashSpeed = 0;
    this.dashPeak = 0;
    this.dashShowX = this.x;
    this.dashShowZ = this.z;
    this.dashShowSpeed = 0;
    this.dashShowPeak = 0;
    this.histN = 0;
    this.record();
  }

  /** The logical dash path (it leads the shown root by ~3 frames) is past its peak and under `share` of it, or stopped. */
  dashPathSlowerThan(share: number): boolean {
    return this.dashT >= 0 && this.dashPeak > 4 && (this.dashSpeed < share * this.dashPeak || this.time - this.dashLastMove > 1e-3);
  }

  /** The shown dash path is past its peak and under `share` of it. */
  dashSlowerThan(share: number): boolean {
    return this.dashT >= 0 && this.dashShowPeak > 4 && this.dashShowSpeed < share * this.dashShowPeak;
  }

  private record(): void {
    this.histHead = (this.histHead + 1) % HIST;
    this.histT[this.histHead] = this.time;
    this.histX[this.histHead] = this.x;
    this.histZ[this.histHead] = this.z;
    this.histN = Math.min(HIST, this.histN + 1);
  }

  /** Logical position at time t from the history (clamped to its ends). */
  private sampleHist(t: number): void {
    let newer = this.histHead;
    for (let k = 1; k < this.histN; k += 1) {
      const older = (this.histHead - k + HIST) % HIST;
      if (this.histT[older]! <= t) {
        const t0 = this.histT[older]!;
        const t1 = this.histT[newer]!;
        const u = t1 > t0 ? clamp((t - t0) / (t1 - t0), 0, 1) : 1;
        this.showX = this.histX[older]! + (this.histX[newer]! - this.histX[older]!) * u;
        this.showZ = this.histZ[older]! + (this.histZ[newer]! - this.histZ[older]!) * u;
        return;
      }
      newer = older;
    }
    this.showX = this.histX[newer]!;
    this.showZ = this.histZ[newer]!;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.dashT >= 0) this.updateDash(dt);
    else this.updatePath(dt);
    criticalSpring(this.biasS, 0, this.yawBias, 0.12, dt);
    // Standing, the body may not turn further than `yawLead` past where its planted feet point (they step to catch up).
    let goal = this.yawGoal + this.biasS[0]!;
    if (this.yawLead > 0) {
      const d = wrapPi(goal - this.feetYaw);
      if (d > this.yawLead) goal = this.yawS[0]! + wrapPi(this.feetYaw + this.yawLead - this.yawS[0]!);
      else if (d < -this.yawLead) goal = this.yawS[0]! + wrapPi(this.feetYaw - this.yawLead - this.yawS[0]!);
    }
    // The follower: towards the goal along the short way, speed and acceleration limited, braking in time.
    const err = wrapPi(goal - this.yawRamp);
    const inPlace = this.turnHalflife > 0.1;
    const acc = inPlace ? TURN_ACC_IN_PLACE : TURN_ACC;
    const vWant = Math.sign(err) * Math.min(inPlace ? TURN_VMAX_IN_PLACE : TURN_VMAX, Math.sqrt(2 * acc * 0.85 * Math.abs(err)), Math.abs(err) / Math.max(dt, 1e-4));
    const dv = vWant - this.yawRampV;
    const dvMax = acc * dt;
    this.yawRampV += dv > dvMax ? dvMax : dv < -dvMax ? -dvMax : dv;
    this.yawRamp += this.yawRampV * dt;
    // Keep the follower on the spring's unwrapped branch.
    this.yawRamp = this.yawS[0]! + wrapPi(this.yawRamp - this.yawS[0]!);
    const before = this.yawS[0]!;
    criticalSpring(this.yawS, 0, this.yawRamp, Math.min(this.turnHalflife, 0.05), dt);
    const turned = this.yawS[0]! - before;
    const cap = TURN_CAP_RAD_S * dt;
    if (Math.abs(turned) > cap) {
      this.yawS[0] = before + Math.sign(turned) * cap;
      this.yawS[1] = Math.sign(turned) * TURN_CAP_RAD_S;
    }
  }

  private updateDash(dt: number): void {
    this.dashT += dt;
    const t = this.dashT;
    // Warped clock: τ = t²/(2E) for t < E, then t − E/2; the lag closes once the logical path is still.
    let lag = t < DASH_EASE ? t - (t * t) / (2 * DASH_EASE) : DASH_EASE / 2;
    const still = this.time - this.dashLastMove;
    if (still > 0) lag = Math.max(0, lag - still);
    this.sampleHist(this.time - lag);
    if (dt > 1e-6) {
      this.dashShowSpeed = Math.hypot(this.showX - this.dashShowX, this.showZ - this.dashShowZ) / dt;
      this.dashShowPeak = Math.max(this.dashShowPeak, this.dashShowSpeed);
    }
    this.dashShowX = this.showX;
    this.dashShowZ = this.showZ;
    if (still > DASH_EASE && lag <= 0) {
      this.dashT = -1;
      this.showX = this.x;
      this.showZ = this.z;
    }
  }

  private updatePath(dt: number): void {
    let goalSpeed = 0;
    let dirX = 0;
    let dirZ = 0;
    if (this.pathI < this.pathN) {
      // Advance past way-points within reach (the last one is arrived at, not passed).
      let o = this.pathI * 3;
      let tx = this.path[o]!;
      let tz = this.path[o + 1]!;
      let d = Math.hypot(tx - this.x, tz - this.z);
      while (this.pathI < this.pathN - 1 && d < Math.max(0.3, this.sp[0]! * 0.18)) {
        this.pathI += 1;
        o = this.pathI * 3;
        tx = this.path[o]!;
        tz = this.path[o + 1]!;
        d = Math.hypot(tx - this.x, tz - this.z);
      }
      const segSpeed = this.path[o + 2]!;
      this.segmentSpeed = segSpeed;
      const last = this.pathI === this.pathN - 1;
      if (d > 1e-4) {
        dirX = (tx - this.x) / d;
        dirZ = (tz - this.z) / d;
      }
      goalSpeed = segSpeed;
      // Arrive: brake so the speed spring's lag (~0.1 s) still stops on the point.
      if (last) goalSpeed = Math.min(goalSpeed, Math.sqrt(2 * this.arriveDecel * Math.max(0, d - 0.02 - this.sp[0]! * 0.1)));
      // Passed the last point (or on it): settle, never turn round.
      const passed = last && (tx - this.x) * this.vx + (tz - this.z) * this.vz < 0 && this.sp[0]! > 0.05;
      if (passed) {
        this.pathN = this.pathI = 0;
        this.settle = true;
        this.settleX = tx;
        this.settleZ = tz;
      } else if (!this.keepFacing && (d > 0.3 || !last)) {
        this.face(dirX, dirZ);
        // Turn before going: no speed while the facing is far off.
        const err = Math.abs(wrapPi(Math.atan2(dirX, dirZ) - this.yawS[0]!));
        goalSpeed *= 1 - smoothstep(35 * DEG, 75 * DEG, err);
        this.turnHalflife = this.sp[0]! < 0.2 && err > 60 * DEG ? 0.15 : 0.06;
      }
      if (last && d < 0.03 && this.sp[0]! < 0.08) {
        this.pathN = this.pathI = 0;
        this.settle = true;
        this.settleX = tx;
        this.settleZ = tz;
      }
    } else if (this.sp[0]! > 1e-3) {
      // Coasting to a stop along the last direction.
      const s = Math.hypot(this.vx, this.vz);
      if (s > 1e-6) {
        dirX = this.vx / s;
        dirZ = this.vz / s;
      }
    }
    // Speed spring: firmer to stop than to start.
    criticalSpring(this.sp, 0, goalSpeed, goalSpeed < this.sp[0]! ? 0.1 : 0.14, dt);
    if (this.sp[0]! < 1e-4 && goalSpeed === 0) this.sp[0] = this.sp[1] = 0;
    const s = Math.max(0, this.sp[0]!);
    // Forward motion goes where the body faces (no moonwalk); strafes go where the path goes.
    let mx = dirX;
    let mz = dirZ;
    if (!this.keepFacing && this.pathI < this.pathN) {
      const y = this.yawS[0]!;
      const fx = Math.sin(y);
      const fz = Math.cos(y);
      // Blend towards the path direction as the facing catches up.
      mx = fx * 0.65 + dirX * 0.35;
      mz = fz * 0.65 + dirZ * 0.35;
      const l = Math.hypot(mx, mz) || 1;
      mx /= l;
      mz /= l;
    }
    this.vx = mx * s;
    this.vz = mz * s;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    if (this.settle) {
      const k = 1 - Math.exp((-Math.LN2 * dt) / 0.05);
      this.x += (this.settleX - this.x) * k;
      this.z += (this.settleZ - this.z) * k;
      if (Math.hypot(this.settleX - this.x, this.settleZ - this.z) < 1e-3 && s < 0.01) {
        this.settle = false;
        this.sp[0] = this.sp[1] = 0;
      }
    }
    this.showX = this.x;
    this.showZ = this.z;
  }

  /** Lateral acceleration (m/s², + to the right) for the lean, from speed × yaw rate. */
  get lateralAccel(): number {
    return -this.sp[0]! * this.yawS[1]!;
  }

  /** Forward acceleration (m/s²) of the speed spring. */
  get forwardAccel(): number {
    return this.sp[1]!;
  }

  /** y of the yaw spring for a half-life (exposed for tests). */
  static springY = springY;
}
