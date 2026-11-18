/** Ticket 412: shared by the old and reference-411 phalange probes. */
import * as THREE from "three";

/** Closest centreline distance between closed segments, including collinear/degenerate cases. */
export function segmentDistance(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): number {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = d.x - c.x, vy = d.y - c.y, vz = d.z - c.z;
  const wx = a.x - c.x, wy = a.y - c.y, wz = a.z - c.z;
  const uu = ux * ux + uy * uy + uz * uz, vv = vx * vx + vy * vy + vz * vz;
  const uv = ux * vx + uy * vy + uz * vz, uw = ux * wx + uy * wy + uz * wz, vw = vx * wx + vy * wy + vz * wz;
  const den = uu * vv - uv * uv;
  let s = den > 1e-16 ? THREE.MathUtils.clamp((uv * vw - vv * uw) / den, 0, 1) : 0;
  let t = vv > 1e-16 ? (uv * s + vw) / vv : 0;
  if (t < 0) { t = 0; s = uu > 1e-16 ? THREE.MathUtils.clamp(-uw / uu, 0, 1) : 0; }
  else if (t > 1) { t = 1; s = uu > 1e-16 ? THREE.MathUtils.clamp((uv - uw) / uu, 0, 1) : 0; }
  return Math.hypot(wx + ux * s - vx * t, wy + uy * s - vy * t, wz + uz * s - vz * t);
}

