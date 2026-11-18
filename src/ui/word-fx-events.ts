import type { SimEvent, World } from "../content/types";
import type { BanQuyetView } from "./ban-quyet";

export type WordSignal =
  | { readonly key: string; readonly kind: "correct"; readonly typed: number }
  | { readonly key: string; readonly kind: "wrong" }
  | { readonly key: string; readonly kind: "assigned" }
  | { readonly key: string; readonly kind: "finish"; readonly text: string; readonly action: number };

/** Capture event identity before a released store index is recycled or a Seal disappears. */
export class WordFxEvents {
  private readonly routes = new Map<number, string>();
  private readonly completed = new Map<string, { wordId: string; text: string }>();

  constructor(private readonly seat: number) {}

  remember(world: World, view: BanQuyetView): void {
    this.routes.clear();
    const words = world.words.seats[this.seat];
    if (!words) return;
    for (let slot = 1; slot <= 5; slot += 1) {
      const index = words.slots[slot];
      if (index !== undefined && index >= 0) this.routes.set(index, "slot-" + slot);
    }
    words.seals.forEach(index => this.routes.set(index, "seal-" + index));
    if (words.cleanse >= 0) this.routes.set(words.cleanse, "cleanse");
    for (const [key, done] of this.completed) {
      if (!world.casts.held.some(cast => cast.seat === this.seat && cast.wordId === done.wordId) &&
          world.casts.prepared[this.seat]?.wordId !== done.wordId &&
          ![...view.slots, ...view.extras].some(cell => cell.key === key && cell.state === "held")) this.completed.delete(key);
    }
  }

  read(events: readonly SimEvent[], _world: World): WordSignal[] {
    const signals: WordSignal[] = [];
    for (const event of events) {
      if (!("seat" in event) || event.seat !== this.seat) continue;
      if (event.type === "word-assigned") {
        const key = event.kind === "slot" ? "slot-" + event.slot : event.kind === "cleanse" ? "cleanse" : "seal-" + event.word;
        this.routes.set(event.word, key);
        signals.push({ key, kind: "assigned" });
      } else if (event.type === "word-progress") {
        const key = this.routes.get(event.word);
        if (!key) continue;
        if (event.result === "wrong") signals.push({ key, kind: "wrong" });
        else if (event.result === "advance" || event.result === "lock") signals.push({ key, kind: "correct", typed: event.typed });
      } else if (event.type === "word-complete") {
        const key = this.routes.get(event.word);
        if (key) this.completed.set(key, { wordId: event.wordId, text: event.text });
      } else if (event.type === "word-released") {
        this.routes.delete(event.word);
      } else if (event.type === "cast" && event.state !== "held") {
        const key = typeof event.slot === "number" ? "slot-" + event.slot : event.slot === "cleanse" ? "cleanse" :
          [...this.completed].find(([k, done]) => k.startsWith("seal-") && done.wordId === event.wordId)?.[0];
        if (!key) continue;
        const done = this.completed.get(key);
        if (!done || done.wordId !== event.wordId) continue;
        signals.push({ key, kind: "finish", text: done.text, action: event.actionId });
        this.completed.delete(key);
      }
    }
    return signals;
  }
}
