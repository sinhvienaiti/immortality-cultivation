/**
 * The sim's output queue (types.ts SimEvent, EventSink). Systems push; the app
 * drains once a frame and hands the batch to view, audio, UI and learning;
 * `local` reads `lastTick()`. Readers never change the world, events never
 * feed back into rules, and the queue is not hashed. `SimEvent` is the only
 * channel out of the sim; a lane that needs a new event writes `// WANT EVENT: …`.
 * Owner: Lane 2. TODO(lane-2): copy games/dragon-hold/src/sim/events.ts and add lastTick().
 */
import type { EventSink, SimEvent } from "../content/types";

/** Distributes `Omit` over the union so each member keeps its own fields. */
export type EventBody = SimEvent extends infer E ? (E extends SimEvent ? Omit<E, "tick"> : never) : never;

const todo = (name: string): never => {
  throw new Error("TODO(lane-2): sim/events.ts " + name);
};

export class EventQueue implements EventSink {
  push(_event: SimEvent): void {
    todo("EventQueue.push");
  }

  drain(): SimEvent[] {
    return todo("EventQueue.drain");
  }

  lastTick(): readonly SimEvent[] {
    return todo("EventQueue.lastTick");
  }

  get length(): number {
    return todo("EventQueue.length");
  }
}

/** Stamps `body` with the current tick and queues it. */
export function emit(_world: { readonly tick: number; readonly events: EventSink }, _body: EventBody): void {
  todo("emit");
}
