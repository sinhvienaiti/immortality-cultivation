/**
 * Silent sound hooks (canon §22, D26, Q6): the id catalogue by canon §22 cards
 * (purpose, 4-part shape, size, length, bus, priority), every id `silent: true`.
 * No synthesized sound, no OscillatorNode or createOscillator, no import of
 * kit/feedback/audio-cues or kit/audio/dragon-voice (tests/boundary.test.ts).
 * Owner: Lane 6. TODO(lane-6).
 */
import type { AUDIO } from "../content/rules";

export type AudioBus = (typeof AUDIO.buses)[number];

export interface SoundCard {
  readonly id: string;
  readonly purpose: string;
  readonly bus: AudioBus;
  readonly priority: number;
  readonly silent: true;
}

/** TODO(lane-6): the M0a ids. */
export const SOUNDS: readonly SoundCard[] = [];
