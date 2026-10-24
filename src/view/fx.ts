/**
 * Wires events to Lane 1's hit sparks, damage numbers, ink smoke and swords
 * (PB-36: never re-implements them): Kiếm skills (the tier's sword count from
 * the shared pool), Lạc Kiếm Trận zones, Xuyên Vân lines.
 * Owner: Lane 6. TODO(lane-6).
 */
import type { Presenter } from "../app/contracts";
import type { Renderer3D } from "./renderer";

export function createFx(_renderer: Renderer3D): Presenter {
  throw new Error("TODO(lane-6): view/fx.ts createFx");
}
