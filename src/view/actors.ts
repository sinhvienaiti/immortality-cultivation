/**
 * Beasts on screen (canon §10.9, §21.1): through Lane 1's crowd (draw mode by
 * tier from rules.ts CROWD_MODE; procedural until VAT); elites × 1.25 with an
 * aura ring, generals × 1.4, the boss a large placeholder. Positions are read
 * straight from `world.beasts` each frame (up to 300, no events).
 * Owner: Lane 6. TODO(lane-6).
 */
import type { Presenter } from "../app/contracts";
import type { Renderer3D } from "./renderer";

export function createActors(_renderer: Renderer3D): Presenter {
  throw new Error("TODO(lane-6): view/actors.ts createActors");
}
