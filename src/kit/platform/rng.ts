// Source: games/space-typing/src/platform/rng.ts (kit copy; log fixes in shared/game-kit/DRIFT.md)
/**
 * Seeded random numbers for deterministic simulations (docs/td/TYPING_DEFENSE_DESIGN.md
 * 25.5): mulberry32, one stream per name. A stream's seed comes from the run
 * seed and its name, so draws on one stream never shift another. Integer
 * operations only, so Node and every browser draw the same numbers; a
 * stream's whole state is one uint32 that the world hash includes.
 */
export const RNG_STREAMS = ["spawn", "combat", "crit", "words", "rare", "loot", "ai", "props"] as const;

export type RngStreamName = (typeof RNG_STREAMS)[number];

export class RngStream {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** The next uint32. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  /** In [0, 1). */
  float(): number {
    return this.next() / 4294967296;
  }

  /** An integer in [min, max], both included. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.float() < probability;
  }
}

export type Rng = { readonly [name in RngStreamName]: RngStream };

/** murmur3's finaliser (seeds 1, 2, 3… start far apart) over FNV-1a of the name. */
function streamSeed(seed: number, name: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) value = Math.imul(value ^ name.charCodeAt(index), 0x01000193);
  value ^= Math.imul(seed >>> 0, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

export function createRng(seed: number): Rng {
  const streams = {} as Record<RngStreamName, RngStream>;
  for (const name of RNG_STREAMS) streams[name] = new RngStream(streamSeed(seed, name));
  return streams;
}

/** Every stream's state, in RNG_STREAMS order. */
export function rngState(rng: Rng): number[] {
  return RNG_STREAMS.map((name) => rng[name].state);
}

export function restoreRng(rng: Rng, state: readonly number[]): void {
  if (state.length !== RNG_STREAMS.length) throw new Error("rng: " + state.length + " stream states, expected " + RNG_STREAMS.length);
  RNG_STREAMS.forEach((name, index) => (rng[name].state = state[index]! >>> 0));
}
