/**
 * World and local hashes (canon §23.2, M0A_PLAN §3.1). `hashWorld` walks the
 * whole world except sim/world.ts HASH_SKIP (static config, `wall`, events);
 * `hashLocal` walks the local layer except `outbox` and `events`. Replays,
 * golden and `ic-replay` compare both every 600 ticks and at the end.
 * Owner: Lane 2. TODO(lane-2): copy games/dragon-hold/src/sim/hash.ts and add hashLocal.
 */
import type { LocalState, World } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-2): sim/hash.ts " + name);
};

/** FNV-style hash of a value tree, skipping `skip` keys at the top level. */
export function hashValue(_value: unknown, _skip?: ReadonlySet<string>): number {
  return todo("hashValue");
}

export function hex32(_hash: number): string {
  return todo("hex32");
}

export function hashWorld(_world: World): number {
  return todo("hashWorld");
}

export function hashLocal(_local: LocalState): number {
  return todo("hashLocal");
}
