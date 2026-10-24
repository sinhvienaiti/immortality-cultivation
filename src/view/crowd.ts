/**
 * The crowd (canon §20.3): one InstancedMesh per species per draw mode;
 * "procedural" (milestone 1a), then "vat" and "impostor" (1b; switching a beast
 * waits 1 s past the threshold and blends 0.2 s). API as Rồng's (add, remove,
 * set, update); per instance: clip, clip time, flash, squash, dissolve, tint,
 * size; blob shadow; toggleable inverted-hull ink outline. The `bones` slot
 * keeps its type, unbuilt (canon §20.3).
 * Owner: Lane 1. TODO(lane-1): Source games/dragon-hold/src/view/crowd.ts, adapted.
 */
import type { CrowdMode } from "../content/rules";
import type { SpeciesId } from "../content/types";
import type { Renderer3D } from "./renderer";

export type CrowdDrawMode = CrowdMode | "bones";

export interface CrowdInstance {
  /** Metres. */
  x: number;
  y: number;
  z: number;
  heading: number;
  clip: number;
  clipTime: number;
  flash: number;
  squash: number;
  dissolve: number;
  tint: number;
  size: number;
}

export interface Crowd {
  readonly mode: CrowdDrawMode;
  add(id: number, species: SpeciesId): void;
  remove(id: number): void;
  set(id: number, state: Readonly<CrowdInstance>): void;
  update(dt: number): void;
  dispose(): void;
}

export function createCrowd(_renderer: Renderer3D, _mode: CrowdDrawMode): Crowd {
  throw new Error("TODO(lane-1): view/crowd.ts createCrowd");
}
