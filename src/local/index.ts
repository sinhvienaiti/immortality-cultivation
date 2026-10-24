/**
 * The `local` layer (canon §9.1, D28, D34): this machine's player only:
 * position, Sinh lực, shield, down. Pure, deterministic, in the replay
 * (`move-to`, `arrows`), hashed by hashLocal. It runs before each world tick:
 * inputs → movement → strikes of the last tick on itself (zones, `ward`
 * blocks → `ward-use`) → its own đan phù effects → down → `auto`. Commands it
 * makes go into the next world tick with `origin`. The world never reads its position.
 * Owner: Lane 2. TODO(lane-2).
 */
import type { LocalInput, LocalState, SimCommand, World } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-2): local/index.ts " + name);
};

export { createLocal, playerPos } from "./player";

/** One local tick before the world's; reads the world (and its last tick's events) but never writes it. */
export function stepLocal(_local: LocalState, _world: World, _inputs: readonly LocalInput[]): void {
  todo("stepLocal");
}

/** Commands for the next world tick (auto, down, ward-use), oldest first; the outbox is empty afterwards. */
export function drainLocalCommands(_local: LocalState): SimCommand[] {
  return todo("drainLocalCommands");
}
