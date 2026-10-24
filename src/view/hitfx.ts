/**
 * Hit effects (canon §20.3, PB-36): hit sparks (instanced quads), damage
 * numbers through kit NumberField with Rồng's fixed draw box (small numbers
 * merged per target every 0.25 s), ink smoke on death. Damage numbers and ink
 * smoke live only in this lane; Lane 6 wires events to them.
 * Owner: Lane 1 (milestone 1b). TODO(lane-1): numbers from games/dragon-hold/src/view/number-field.ts.
 */
import type { Renderer3D } from "./renderer";

export interface HitFx {
  spark(x: number, y: number, z: number, tier: number): void;
  update(dt: number): void;
  dispose(): void;
}

export interface DamageNumbers {
  /** Metres; `target` merges small numbers per target every 0.25 s. */
  show(target: number, amount: number, x: number, y: number, z: number, tier: number): void;
  update(dt: number): void;
  dispose(): void;
}

export interface InkSmoke {
  puff(x: number, y: number, z: number, size: number): void;
  update(dt: number): void;
  dispose(): void;
}

export function createHitFx(_renderer: Renderer3D): HitFx {
  throw new Error("TODO(lane-1): view/hitfx.ts createHitFx");
}

export function createDamageNumbers(_renderer: Renderer3D, _capacity: number): DamageNumbers {
  throw new Error("TODO(lane-1): view/hitfx.ts createDamageNumbers");
}

export function createInkSmoke(_renderer: Renderer3D): InkSmoke {
  throw new Error("TODO(lane-1): view/hitfx.ts createInkSmoke");
}
