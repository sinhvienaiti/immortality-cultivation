// Source: games/dragon-hold/src/app/contracts.ts @06cd4e6 (adapted: local layer in FrameInfo, LocalSink, tier from content/types)
/**
 * Contracts between the app and the presentation lanes (view, ui, audio,
 * learning). Every presenter reads the world and this machine's `local`
 * layer, gets each frame's drained events, and sends player intent back only
 * as SimCommands (CommandSink) or local inputs (LocalSink). Three units are
 * metres; sim u convert with uToM (src/sim/fixed.ts).
 * Owner: step 0 / integration (LANES.md).
 */
import type { LocalInput, LocalState, Quality, SimCommand, SimEvent, World } from "../content/types";

export type { Quality } from "../content/types";

export interface FrameInfo {
  /** Real seconds since the last frame (clamped by the loop). */
  readonly dt: number;
  /** World seconds since the last frame: dt × time scale (hit-stop slows the world, never the keys). */
  readonly worldDt: number;
  /** 0–1 between the last sim tick and the next, for interpolation. */
  readonly alpha: number;
  /** performance.now() of this frame, ms. */
  readonly now: number;
  /** This machine's player (position, Sinh lực, shield, down), canon §9.1. */
  readonly local: LocalState;
}

/** A view, UI or audio part. Order each frame: onEvents (this frame's batch, world and local), then frame. */
export interface Presenter {
  onEvents(events: readonly SimEvent[], world: World): void;
  frame(world: World, info: FrameInfo): void;
  dispose(): void;
}

/** Where player intent goes; the app stamps the tick and feeds the sim. */
export type CommandSink = (command: SimCommand) => void;

/** Where local-only inputs go (right-click move, arrows); replayed, never sent to the world. */
export type LocalSink = (input: LocalInput) => void;

/** Screen position of a world point in CSS pixels (HUD bars, numbers, marks). */
export interface ScreenPoint {
  x: number;
  y: number;
  /** In front of the camera and inside the viewport. */
  visible: boolean;
}

/** Projects a world point in metres to the screen; writes into `out` (no allocation per call). */
export type Projector = (xM: number, yM: number, zM: number, out: ScreenPoint) => ScreenPoint;

/** Command actions (rules.ts KEYS) that presenters may claim before the app's fallback. */
export interface ActionHandler {
  /** Returns true when it used the action. */
  handleAction(action: string): boolean;
}
