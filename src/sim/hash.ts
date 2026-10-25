// Source: games/dragon-hold/src/sim/hash.ts @06cd4e6 (adapted: skip keys at the top level only, hashState(), hashWorld and hashLocal here)
/**
 * World and local hashes (canon §23.2, M0A_PLAN §3.1). A structural FNV-1a
 * walk over the mutable state, in property insertion order (deterministic
 * code creates its objects in the same order on Node and in every browser).
 * Integers mix as two 32-bit words; any other number mixes its float bits, so
 * a stray float still hashes the same everywhere while a test can flag it. An
 * object with a `hashState()` method is hashed by what that returns (the kit's
 * pace director and flow meter). `hashWorld` walks the whole world except
 * sim/world.ts HASH_SKIP (static config, `wall`, events); `hashLocal` walks the
 * local layer except `outbox` and `events`. STATIC_KEYS are skipped at every
 * depth by both. Replays, golden and `ic-replay` compare both every 600 ticks
 * and at the end.
 * Owner: Lane 2.
 */
import type { LocalState, World } from "../content/types";

/** Keys hashWorld skips: static config, wall clock, events (M0A_PLAN §3.1); world.ts re-exports it. */
export const HASH_SKIP: ReadonlySet<string> = new Set(["stage", "header", "field", "wall", "events"]);

/**
 * Keys skipped at every depth: compiled static config held by reference, never
 * state. `rules` is the kit's compiled TypingRules inside each words.sessions[]
 * TypingSession and its Letters (typing/config.ts IC_RULES, one module constant
 * for every match): 22 floats such as life.base 1.2 that M0A_PLAN §3.1 keeps
 * out of hashed state ("Không lưu số thực trong trạng thái có băm").
 */
export const STATIC_KEYS: ReadonlySet<string> = new Set(["rules"]);

const PRIME = 0x01000193;
const OFFSET = 0x811c9dc5;
const floatBox = new Float64Array(1);
const floatWords = new Uint32Array(floatBox.buffer);
const NONE: ReadonlySet<string> = new Set();

/** Keys hashLocal skips: what the layer hands out, not what it is. */
export const LOCAL_HASH_SKIP: ReadonlySet<string> = new Set(["outbox", "events"]);

export const mix = (hash: number, value: number): number => Math.imul(hash ^ (value | 0), PRIME);

export function mixNumber(hash: number, value: number): number {
  if (Number.isSafeInteger(value)) {
    // Low and high 32 bits, so values past 2^31 (u squared) still count; −0 hashes as 0.
    const high = Math.floor(value / 4294967296);
    return mix(mix(mix(hash, 1), value >>> 0), high | 0);
  }
  floatBox[0] = value;
  return mix(mix(mix(hash, 2), floatWords[0]!), floatWords[1]!);
}

export function mixString(hash: number, value: string): number {
  let h = mix(hash, 3 + value.length);
  for (let index = 0; index < value.length; index += 1) h = mix(h, value.charCodeAt(index));
  return h;
}

type HashStateful = { hashState(): unknown };
const hasHashState = (value: object): value is HashStateful => typeof (value as Partial<HashStateful>).hashState === "function";

/** Folds `value` into `hash`; `skip` applies to the keys of this object only (nested objects are walked whole but for STATIC_KEYS). */
export function mixValue(hash: number, value: unknown, skip: ReadonlySet<string> = NONE): number {
  if (value === null || value === undefined) return mix(hash, value === null ? 4 : 5);
  switch (typeof value) {
    case "number":
      return mixNumber(hash, value);
    case "boolean":
      return mix(hash, value ? 7 : 6);
    case "string":
      return mixString(hash, value);
    case "function":
      return hash;
    case "object":
      break;
    default:
      return mixString(hash, String(value));
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as unknown as ArrayLike<number>;
    let h = mix(hash, 8 + view.length);
    for (let index = 0; index < view.length; index += 1) h = mixNumber(h, view[index]!);
    return h;
  }
  if (Array.isArray(value)) {
    let h = mix(hash, 9 + value.length);
    for (const item of value) h = mixValue(h, item);
    return h;
  }
  if (value instanceof Map) {
    let h = mix(hash, 10 + value.size);
    for (const [key, item] of value) h = mixValue(mixValue(h, key), item);
    return h;
  }
  if (value instanceof Set) {
    let h = mix(hash, 11 + value.size);
    for (const item of value) h = mixValue(h, item);
    return h;
  }
  if (hasHashState(value)) return mixValue(mix(hash, 13), value.hashState());
  let h = mix(hash, 12);
  for (const key of Object.keys(value)) {
    if (skip.has(key) || STATIC_KEYS.has(key)) continue;
    h = mixValue(mixString(h, key), (value as Record<string, unknown>)[key]);
  }
  return h;
}

/** FNV-style hash of a value tree, skipping `skip` keys at the top level. */
export function hashValue(value: unknown, skip: ReadonlySet<string> = NONE): number {
  return mixValue(OFFSET, value, skip) >>> 0;
}

export function hex32(hash: number): string {
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** The world folded into 32 bits (golden, replays, canon §23.2). */
export function hashWorld(world: World): number {
  return hashValue(world, HASH_SKIP);
}

/** This machine's player folded into 32 bits (canon §23.2). */
export function hashLocal(local: LocalState): number {
  return hashValue(local, LOCAL_HASH_SKIP);
}

export const hashWorldHex = (world: World): string => hex32(hashWorld(world));
export const hashLocalHex = (local: LocalState): string => hex32(hashLocal(local));

/**
 * Every number in the hashed parts of `value` that is not a safe integer, as
 * "path = value" (tests: no floats in hashed state, M0A_PLAN §6.2).
 */
export function hashedFloats(value: unknown, skip: ReadonlySet<string> = NONE, path = "", out: string[] = []): string[] {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) out.push(path + " = " + value);
    return out;
  }
  if (value === null || typeof value !== "object") return out;
  if (ArrayBuffer.isView(value)) {
    const view = value as unknown as ArrayLike<number>;
    for (let index = 0; index < view.length; index += 1) if (!Number.isSafeInteger(view[index]!)) out.push(path + "[" + index + "] = " + view[index]);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => hashedFloats(item, NONE, path + "[" + index + "]", out));
    return out;
  }
  if (value instanceof Map || value instanceof Set) {
    let index = 0;
    for (const item of value instanceof Map ? value.entries() : value.values()) hashedFloats(item, NONE, path + "{" + index++ + "}", out);
    return out;
  }
  if (hasHashState(value)) return hashedFloats(value.hashState(), NONE, path + ".hashState()", out);
  for (const key of Object.keys(value)) {
    if (skip.has(key) || STATIC_KEYS.has(key)) continue;
    hashedFloats((value as Record<string, unknown>)[key], NONE, path + "." + key, out);
  }
  return out;
}
