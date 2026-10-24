// Source: games/space-typing/src/audio/mix.ts (kit copy: bus table is a parameter; log fixes in shared/game-kit/DRIFT.md)
import { clamp } from "./util";

/** One bus: its level in the mix and how far it dips while a word is spoken. */
export type BusSpec = { gain: number; duck: number };
export type BusTable<B extends string> = Readonly<Record<B, BusSpec>>;

export const AUDIO_GROUPS = [
  "typing",
  "combat",
  "warnings",
  "ui",
  "rewards",
] as const;

export type AudioGroup = (typeof AUDIO_GROUPS)[number];

export const AUDIO_GROUP_GAIN: Record<AudioGroup, number> = {
  typing: 0.82,
  combat: 0.72,
  warnings: 0.9,
  ui: 0.62,
  // Credit crystal drops and pickups: above combat so the gem stream reads
  // through explosions, below warnings.
  rewards: 0.86,
};

export const PRONUNCIATION_DUCK: Record<AudioGroup, number> = {
  typing: 0.32,
  combat: 0.38,
  warnings: 0.68,
  ui: 0.45,
  // Crystals fly home while the word is being spoken; a light dip keeps the
  // voice on top without losing the pickup stream.
  rewards: 0.7,
};

/** Space Typing's five groups as a bus table (the default). */
export const DEFAULT_BUSES: BusTable<AudioGroup> = Object.fromEntries(
  AUDIO_GROUPS.map((group) => [group, { gain: AUDIO_GROUP_GAIN[group], duck: PRONUNCIATION_DUCK[group] }]),
) as Record<AudioGroup, BusSpec>;

/** Bus levels for one game: its own table, one voice boost setting. */
export class BusMix<B extends string> {
  private boost = 1;

  constructor(readonly buses: BusTable<B>) {}

  get busNames(): B[] {
    return Object.keys(this.buses) as B[];
  }

  /** Voice boost from settings (1–3): effects drop to at most 1 / boost while a word is spoken. */
  setPronunciationBoost(boost: number): void {
    this.boost = Number.isFinite(boost) ? clamp(boost, 1, 3) : 1;
  }

  /** How far the bus dips: 1 when silent. */
  duck(bus: B, pronunciationActive = false): number {
    return pronunciationActive ? Math.min(this.buses[bus].duck, 1 / this.boost) : 1;
  }

  /** The bus's own level, ducked while a word is spoken. */
  busGain(bus: B, pronunciationActive = false): number {
    return this.buses[bus].gain * this.duck(bus, pronunciationActive);
  }

  mixedGain(master: number, bus: B, eventGain: number, pronunciationActive = false): number {
    const safeMaster = clamp(master, 0, 1);
    const safeEvent = clamp(eventGain, 0, 1);
    return safeMaster * this.buses[bus].gain * safeEvent * this.duck(bus, pronunciationActive);
  }
}

const defaultMix = new BusMix(DEFAULT_BUSES);

/** Voice boost from settings (1–3): effects drop to at most 1 / boost while a word is spoken. */
export function setPronunciationBoost(boost: number): void {
  defaultMix.setPronunciationBoost(boost);
}

export function mixedSfxGain(
  master: number,
  group: AudioGroup,
  eventGain: number,
  pronunciationActive = false,
): number {
  return defaultMix.mixedGain(master, group, eventGain, pronunciationActive);
}
