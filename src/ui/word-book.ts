/**
 * Sổ Từ for Thu Hoạch (canon §17): new, mistyped, due; click to listen.
 * Owner: Lane 3. TODO(lane-3).
 */

export interface WordBookEntry {
  readonly wordId: string;
  readonly text: string;
  readonly kind: "new" | "mistyped" | "due";
}

export function renderWordBook(_host: HTMLElement, _entries: readonly WordBookEntry[]): void {
  throw new Error("TODO(lane-3): ui/word-book.ts renderWordBook");
}
