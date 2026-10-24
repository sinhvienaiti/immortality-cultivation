// Source: games/space-typing@survival-s0 src/feedback/quads.ts (kit copy; log fixes in shared/game-kit/DRIFT.md)
import * as THREE from "three";

/**
 * An instanced unit quad (one draw call for many sprites) with per-instance
 * float attributes `name: [array, itemSize]`, updated every frame. `corner`:
 * the quad spans 0 … 1 (screen sprites, streaks) instead of −0.5 … 0.5.
 */
export function instancedQuads(attributes: Record<string, readonly [Float32Array, number]>, corner = false): THREE.InstancedBufferGeometry {
  const base = new THREE.PlaneGeometry(1, 1);
  if (corner) base.translate(0.5, 0.5, 0);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute("position", base.getAttribute("position"));
  geometry.setAttribute("uv", base.getAttribute("uv"));
  for (const [name, [array, size]] of Object.entries(attributes)) geometry.setAttribute(name, new THREE.InstancedBufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage));
  geometry.instanceCount = 0;
  return geometry;
}

/** Marks every per-instance attribute for upload and sets the count. */
export function uploadQuads(geometry: THREE.InstancedBufferGeometry, count: number): void {
  geometry.instanceCount = count;
  for (const attribute of Object.values(geometry.attributes)) if (attribute instanceof THREE.InstancedBufferAttribute) attribute.needsUpdate = true;
}
