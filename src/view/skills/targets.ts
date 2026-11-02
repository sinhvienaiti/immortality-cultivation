/**
 * What a skill VFX needs from the beasts on the field: where they are, which
 * are inside a shape, and a way to show a hit (flash, recoil) or a death. The
 * skills lab implements it with stand-in models; the game will implement it
 * over its actors view (hits and deaths still come from sim events there).
 */
export interface TargetField {
  /** Slots, live or not. */
  readonly size: number;
  alive(i: number): boolean;
  x(i: number): number;
  z(i: number): number;
  /** Height of the body's centre above the ground (m). */
  midY(i: number): number;
  /** Rough body radius on the ground (m). */
  radius(i: number): number;
  /** Size class 0 swarm, 1 small, 2 medium, 3 elite or general, 4 king. */
  tier(i: number): number;
  /** The nearest live beast to (x, z) within `maxR` m, skipping `skip`; −1 if none. */
  nearest(x: number, z: number, maxR: number, skip?: number): number;
  /** Live beasts within `r` of (x, z): indices into `out`; returns the count. */
  inCircle(x: number, z: number, r: number, out: Int32Array): number;
  /** Live beasts within `halfW` of the segment a → b: indices into `out`; returns the count. */
  inCapsule(ax: number, az: number, bx: number, bz: number, halfW: number, out: Int32Array): number;
  /**
   * A blow from direction (dx, dz) (unit, attacker → beast), `power` 0..1 for
   * the recoil, `rgb` the attacker's flash colour (0xRRGGBB). Returns true if
   * the blow killed the beast (the field plays the dissolve; the skill adds
   * its own ink smoke and motes).
   */
  hit(i: number, dx: number, dz: number, power: number, rgb: number): boolean;
}
