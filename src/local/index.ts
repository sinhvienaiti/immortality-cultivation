/**
 * The `local` layer (canon §9.1, D28, D34): this machine's player only:
 * position, Sinh lực, shield, down. Pure, deterministic, in the replay
 * (`move-to`, `arrows`), hashed by hashLocal. It runs before each world tick
 * and reads that world's last tick once: its strikes on the player (zones,
 * `ward` blocks → `ward-use`, at the position the player had in that tick),
 * its own đan phù and Lưu Quang Bộ, the break's +30 % Sinh lực; then this
 * tick's inputs, the move, the Kết Giới buff, heal over time, down, and
 * `auto`. Commands it makes go into the same world tick as the keys, with
 * `origin` (world.ts stepMatch). The world never reads its position.
 * Owner: Lane 2.
 */
import { PLAYER } from "../content/rules";
import type { LocalInput, LocalState, SimCommand, SimEvent, World } from "../content/types";
import { pct } from "../sim/fixed";
import { stepAuto } from "./auto";
import { onConsumable, stepConsumableEffects } from "./consumables";
import { onCastResolved } from "./dash";
import { stepDown } from "./down";
import { applyLocalInput } from "./input";
import { stepMove } from "./player";
import { stepZones, strikePlayer } from "./zones";

export { createLocal, playerPos } from "./player";

/** Reads the world's last tick once: strikes, đan phù, dash, the break heal. */
function readWorld(local: LocalState, world: World): void {
  const lastTick = world.tick - 1;
  if (lastTick <= local.seenTick) return;
  local.seenTick = lastTick;
  const events = world.events.lastTick();
  if (events.length === 0) return;
  strikePlayer(local, world, events);
  const guard = world.seats[local.seat]?.loadout.guard ?? "ward";
  for (const event of events) {
    switch (event.type) {
      case "consumable":
        onConsumable(local, event);
        break;
      case "cast":
        onCastResolved(local, event, guard);
        break;
      case "phase":
        // Sinh lực +30 % at each break (canon §4.1, §9.2).
        if (event.phase === "break" && !local.down) local.hp = Math.min(local.hpMax, local.hp + pct(local.hpMax, PLAYER.breakRegenPct));
        break;
      default:
        break;
    }
  }
}

/** One local tick before the world's; reads the world (and its last tick's events) but never writes it. */
export function stepLocal(local: LocalState, world: World, inputs: readonly LocalInput[]): void {
  local.tick = world.tick;
  readWorld(local, world);
  for (const input of inputs) applyLocalInput(local, input, world.stage);
  stepMove(local, world.stage);
  stepZones(local, world);
  stepConsumableEffects(local);
  stepDown(local);
  stepAuto(local, world);
}

/** Commands for the next world tick (auto, down, ward-use), oldest first; the outbox is empty afterwards. */
export function drainLocalCommands(local: LocalState): SimCommand[] {
  const out = local.outbox.slice();
  local.outbox.length = 0;
  return out;
}

/** player-hit, player-down, player-up since the last drain (the app shows them with the world's). */
export function drainLocalEvents(local: LocalState): SimEvent[] {
  const out = local.events.slice();
  local.events.length = 0;
  return out;
}
