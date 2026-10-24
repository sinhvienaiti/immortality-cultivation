/**
 * Impostors (canon §20.3, PB-34): atlas of 16 directions × 8 walk phases
 * (192 px cells at High, 128 px at Low), soft blend of two neighbouring
 * phases; in-page render-to-texture baker for placeholders; loads
 * `bake_impostor.py` output; instanced quads pick the cell by view angle and phase.
 * Owner: Lane 1 (milestone 1b). TODO(lane-1).
 */

/** Atlas cell for a view angle (0 = facing the camera) and walk phase 0–1. */
export function impostorCell(_viewAngle: number, _phase: number): { readonly direction: number; readonly phase: number; readonly blend: number } {
  throw new Error("TODO(lane-1): view/impostor.ts impostorCell");
}
