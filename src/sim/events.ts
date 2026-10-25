// Source: games/dragon-hold/src/sim/events.ts @06cd4e6 (adapted: lastTick() and endTick() for the local layer, EventSink)
/**
 * The sim's output queue (types.ts SimEvent, EventSink). Systems push; the app
 * drains once a frame and hands the batch to view, audio, UI and learning;
 * `local` reads `lastTick()` (the events of the world tick that just ended)
 * without draining. Readers never change the world, events never feed back
 * into rules, and the queue is not hashed. `SimEvent` is the only channel out
 * of the sim; a lane that needs a new event writes `// WANT EVENT: …`.
 * Owner: Lane 2.
 */
import type { EventSink, SimEvent } from "../content/types";

/** Undrained events past this many are dropped oldest first (a headless run that never drains). */
export const EVENT_QUEUE_CAP = 20_000;

/** Distributes `Omit` over the union so each member keeps its own fields. */
export type EventBody = SimEvent extends infer E ? (E extends SimEvent ? Omit<E, "tick"> : never) : never;

export class EventQueue implements EventSink {
  private items: SimEvent[] = [];
  /** Dropped events still at the front of `items` (compacted in one go, so a full queue costs O(1) a push). */
  private head = 0;
  private current: SimEvent[] = [];
  private last: SimEvent[] = [];
  /** Total ever pushed and dropped (headless runs that never drain). */
  pushed = 0;
  dropped = 0;

  push(event: SimEvent): void {
    if (this.items.length - this.head >= EVENT_QUEUE_CAP) {
      this.head += 1;
      this.dropped += 1;
      if (this.head >= EVENT_QUEUE_CAP) {
        this.items = this.items.slice(this.head);
        this.head = 0;
      }
    }
    this.items.push(event);
    this.current.push(event);
    this.pushed += 1;
  }

  /** Everything since the last drain, oldest first; the queue is empty afterwards (lastTick() is kept). */
  drain(): SimEvent[] {
    const out = this.head > 0 ? this.items.slice(this.head) : this.items;
    this.items = [];
    this.head = 0;
    return out;
  }

  lastTick(): readonly SimEvent[] {
    return this.last;
  }

  endTick(): void {
    this.last = this.current;
    this.current = [];
  }

  get length(): number {
    return this.items.length - this.head;
  }
}

/** Stamps `body` with the current tick and queues it. */
export function emit(world: { readonly tick: number; readonly events: EventSink }, body: EventBody): void {
  world.events.push({ ...body, tick: world.tick } as SimEvent);
}
