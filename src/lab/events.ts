/**
 * The skills lab's event bus (dev-only; canon D58; skill game-character-
 * animation "events and sync"): one sim-style event and every listener on
 * the same frame, called in turn with no setTimeout: the body (the caster
 * already acted), the VFX, the screen effects (camera, hit-stop), the damage
 * numbers and the sound. In the game the sim emits these on its ticks; here
 * the lab's stand-ins do (skills-main.ts, kiem.ts through KiemHost.struck,
 * van-kiem.ts). Each kind has one event object, reused: a listener reads it
 * during the call and keeps nothing (key 7 lands hundreds of blows).
 */
import type { ScreenTier, ImpactRole } from "../view/screen-fx";

/** What a blow hits, for the impact sound (POWER_RESEARCH §6: flesh, stone or armour, spirit). */
export type Material = "flesh" | "stone" | "spirit";

export interface ReleaseEvent {
  kind: "release";
  /** The lab key's skill id (auto, k1, …, k7). */
  slot: string;
  tier: ScreenTier;
  x: number;
  z: number;
  /** Unit ground direction of the cast. */
  dx: number;
  dz: number;
  /** Probe frame and lab time (s) of the key. */
  frame: number;
  time: number;
}

export interface CastEvent {
  kind: "cast";
  slot: string;
  x: number;
  z: number;
}

export interface ImpactEvent {
  kind: "impact";
  slot: string;
  tier: ScreenTier;
  role: ImpactRole;
  target: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dz: number;
  power: number;
  killed: boolean;
  material: Material;
  /** The beast's size class (TargetField.tier): 0 swarm … 2 medium (elite in the lab), 4 king. */
  beastTier: number;
  /** The skill's flash colour (0xRRGGBB). */
  rgb: number;
}

export interface DeathEvent {
  kind: "death";
  target: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dz: number;
  rgb: number;
  beastTier: number;
}

export interface FlybyEvent {
  kind: "flyby";
  x: number;
  y: number;
  z: number;
  /** m/s. */
  speed: number;
}

export interface WorldEvent {
  kind: "world";
  slot: string;
  phase: "open" | "climax" | "close";
}

export interface CalloutEvent {
  kind: "callout";
  slot: string;
  tier: ScreenTier;
}

export type LabEvent = ReleaseEvent | CastEvent | ImpactEvent | DeathEvent | FlybyEvent | WorldEvent | CalloutEvent;
type Listener = (e: LabEvent) => void;

export class LabBus {
  private readonly listeners: Listener[] = [];
  /** Counts per kind since the last reset (captures read them). */
  readonly counts: Record<LabEvent["kind"], number> = { release: 0, cast: 0, impact: 0, death: 0, flyby: 0, world: 0, callout: 0 };

  readonly release: ReleaseEvent = { kind: "release", slot: "", tier: "basic", x: 0, z: 0, dx: 0, dz: -1, frame: 0, time: 0 };
  readonly cast: CastEvent = { kind: "cast", slot: "", x: 0, z: 0 };
  readonly impact: ImpactEvent = { kind: "impact", slot: "", tier: "basic", role: "primary", target: -1, x: 0, y: 0, z: 0, dx: 0, dz: -1, power: 0, killed: false, material: "flesh", beastTier: 0, rgb: 0xffffff };
  readonly death: DeathEvent = { kind: "death", target: -1, x: 0, y: 0, z: 0, dx: 0, dz: -1, rgb: 0xffffff, beastTier: 0 };
  readonly flyby: FlybyEvent = { kind: "flyby", x: 0, y: 0, z: 0, speed: 0 };
  readonly world: WorldEvent = { kind: "world", slot: "", phase: "open" };
  readonly callout: CalloutEvent = { kind: "callout", slot: "", tier: "skill" };

  on(listener: Listener): void {
    this.listeners.push(listener);
  }

  /** Sends one of this bus's event objects (fill its fields first) to every listener, in order, now. */
  emit(e: LabEvent): void {
    this.counts[e.kind] += 1;
    for (let i = 0; i < this.listeners.length; i += 1) this.listeners[i]!(e);
  }

  resetCounts(): void {
    for (const k of Object.keys(this.counts) as LabEvent["kind"][]) this.counts[k] = 0;
  }
}
