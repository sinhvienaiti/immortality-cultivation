// Source: games/dragon-hold/src/ui/learning-frame.ts @06cd4e6 (adapted: the frame only; it follows the sim's `hint` flag of the locked word, so the meaning and IPA show exactly when the event says hintUsed (canon §17, HC7); it sits above the Bàn Quyết; Học trước and Thẻ Ôn moved to learn-ahead.ts and review-card.ts)
/**
 * Learning frame (canon §17, §13.4): the word being typed with its IPA and
 * meaning when the sim shows them (`LiveWord.hint`: always at Thư giãn and
 * Học, by right recalls at Cân bằng, a new word's first meeting at Thử
 * thách; reported as `hintUsed`), a listen button, and after a word is typed
 * a short "từ · nghĩa ✓" card (only when its meaning was shown while typing);
 * the "Vừa học" line of the last 3 new words. Plain DOM above the canvas and
 * the Bàn Quyết: never shakes, never covered by VFX; hidden while a learning
 * panel asks (`setCovered`).
 * Also the small DOM helpers the other learning panels share.
 * Owner: Lane 3.
 */
import type { FrameInfo, Presenter } from "../app/contracts";
import type { GlossOf } from "../app/learning";
import type { SimEvent, World } from "../content/types";
import { LEARNING_FRAME_CLASSES, installKitStyles } from "../kit/ui/styles";

// ── Shared DOM helpers (learning panels) ────────────────────────────────────

/** Adds a style block once per document. */
export function installStyle(doc: Document, id: string, css: string): void {
  installKitStyles(doc as unknown as Parameters<typeof installKitStyles>[0]);
  if (doc.getElementById(id) !== null) return;
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = css;
  doc.head.append(style);
}

/** An element with a class and optional text. */
export function node<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** A meaning shortened for a line (first sense, notes in brackets out, ≤ 22 characters with "…"). */
export function shortMeaning(vi: string, max = 22): string {
  const first = (vi.split(";")[0] ?? "").replace(/\s*\([^)]*\)/g, "").trim();
  return first.length <= max ? first : first.slice(0, max - 1).trimEnd() + "…";
}

// ── The frame's model (pure) ────────────────────────────────────────────────

export interface FrameWord {
  readonly wordId: string;
  readonly text: string;
  readonly vi: string;
  readonly ipa: string;
  readonly isNew: boolean;
}

export interface FrameView {
  readonly text: string;
  readonly typed: number;
  readonly ipa: string;
  readonly meaning: string;
  readonly isNew: boolean;
  /** The "từ · nghĩa ✓" card of a word just typed. */
  readonly done: boolean;
}

/** UI hold times of the card after a word (not rules): new words 2.5 s, others 0.8 s (Rồng 01 §6.3). */
export const CARD_MS = { fresh: 2500, other: 800 } as const;
const RECENT_NEW = 3;

/** What the frame shows: the locked word (meaning and IPA only with its hint), else a card of the word just typed. */
export class FrameModel {
  private locked: { word: FrameWord; typed: number; hint: boolean } | null = null;
  private card: { word: FrameWord; until: number } | null = null;
  /** The last 3 new words typed, newest first ("Vừa học"). */
  readonly recent: FrameWord[] = [];

  lock(word: FrameWord, typed: number, hint: boolean): void {
    this.locked = { word, typed, hint };
  }

  unlock(): void {
    this.locked = null;
  }

  /** A word was typed with `hint` on or off; only a shown meaning gets a card (a hidden one stays hidden). */
  done(word: FrameWord, hint: boolean, nowMs: number): void {
    if (this.locked?.word.wordId === word.wordId) this.locked = null;
    if (hint) this.card = { word, until: nowMs + (word.isNew ? CARD_MS.fresh : CARD_MS.other) };
    if (word.isNew && !this.recent.some((item) => item.wordId === word.wordId)) {
      this.recent.unshift(word);
      this.recent.length = Math.min(this.recent.length, RECENT_NEW);
    }
  }

  clearCard(): void {
    this.card = null;
  }

  view(nowMs: number): FrameView | null {
    if (this.locked) {
      const { word, typed, hint } = this.locked;
      return { text: word.text, typed, ipa: hint ? word.ipa : "", meaning: hint ? word.vi : "", isNew: word.isNew, done: false };
    }
    if (this.card && nowMs < this.card.until) {
      const word = this.card.word;
      return { text: word.text, typed: word.text.length, ipa: word.ipa, meaning: word.vi, isNew: word.isNew, done: true };
    }
    return null;
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────

const STYLE_ID = "ic-learning-style";
const CSS = `
.ic-learn { bottom: calc(150px * var(--ui, 1)); width: calc(440px * var(--ui, 1)); min-height: calc(72px * var(--ui, 1)); }
.ic-learn.is-idle { visibility: hidden; }
.ic-learn.is-covered { visibility: hidden; }
.ic-learn__top { display: flex; align-items: center; gap: calc(8px * var(--ui, 1)); }
.ic-learn__check { color: var(--kit-typing); font-weight: 800; }
.ic-learn__badge { font-size: max(11px, calc(11px * var(--ui, 1))); font-weight: 800; padding: 0 5px; border-radius: 3px; background: #E9F7D4; color: #1F3A12; }
.ic-learn__speak { pointer-events: auto; cursor: pointer; border: 1px solid rgba(242, 235, 221, 0.4); border-radius: 50%; background: transparent; color: var(--kit-learning-muted); width: 26px; height: 26px; font-size: 14px; line-height: 1; }
.ic-learn .${LEARNING_FRAME_CLASSES.ipa}:empty, .ic-learn .${LEARNING_FRAME_CLASSES.meaning}:empty, .ic-learn .${LEARNING_FRAME_CLASSES.recent}:empty { display: none; }
.ic-learn .${LEARNING_FRAME_CLASSES.meaning} { max-width: 100%; text-align: center; }
.ic-learn .${LEARNING_FRAME_CLASSES.recent} { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ic-learn:not(.is-card) .${LEARNING_FRAME_CLASSES.recent} { display: none; }
`;

// ── The frame ──────────────────────────────────────────────────────────────

export interface LearningFrameOptions {
  /** Meaning and IPA of a word id (app/learning.ts loadDeckSource). */
  readonly gloss?: GlossOf;
  /** Plays a word (kit speech); the listen button shows only with it. */
  readonly speak?: (text: string) => void;
  /** This machine's seat. */
  readonly seat?: number;
}

export interface LearningFramePresenter extends Presenter {
  /** Hides the frame while a learning panel asks (its words would give answers away). */
  setCovered(covered: boolean): void;
  readonly covered: boolean;
  readonly model: FrameModel;
}

export function createLearningFrame(host: HTMLElement, options: LearningFrameOptions = {}): LearningFramePresenter {
  const doc = host.ownerDocument;
  installStyle(doc, STYLE_ID, CSS);
  const c = LEARNING_FRAME_CLASSES;
  const seat = options.seat ?? 0;
  const gloss: GlossOf = options.gloss ?? (() => null);
  const root = node(doc, "div", c.root + " ic-learn is-idle");
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  const top = node(doc, "div", "ic-learn__top");
  const word = node(doc, "span", c.word);
  top.append(word);
  let speakButton: HTMLButtonElement | null = null;
  if (options.speak) {
    speakButton = node(doc, "button", "ic-learn__speak", "♪");
    speakButton.type = "button";
    speakButton.setAttribute("aria-label", "Nghe từ");
    top.append(speakButton);
  }
  const ipa = node(doc, "div", c.ipa);
  const meaning = node(doc, "div", c.meaning);
  const recent = node(doc, "div", c.recent);
  root.append(top, ipa, meaning, recent);
  host.append(root);
  const model = new FrameModel();
  let shownText = "";
  speakButton?.addEventListener("click", () => {
    if (shownText !== "") options.speak?.(shownText);
  });
  let key = "\u0000";
  let recentKey = "";
  let covered = false;
  let lockedWord = -1;
  let nowMs = 0;
  /** Word store index → the word dealt on it (events of one frame may run past a word's end). */
  const assigned = new Map<number, { readonly wordId: string; readonly text: string }>();

  const frameWord = (world: World, wordId: string, text: string): FrameWord => {
    const g = gloss(wordId);
    const deckWord = world.header.deck.find((item) => item.wordId === wordId);
    return { wordId, text, vi: g?.vi ?? "", ipa: g?.ipa ?? "", isNew: deckWord?.group === "new" };
  };

  return {
    model,
    get covered() {
      return covered;
    },
    setCovered(next: boolean): void {
      if (next === covered) return;
      covered = next;
      root.classList.toggle("is-covered", next);
      root.setAttribute("aria-hidden", next ? "true" : "false");
    },
    onEvents(events: readonly SimEvent[], world: World): void {
      for (const event of events) {
        if ("seat" in event && event.seat !== seat) continue;
        switch (event.type) {
          case "word-assigned":
            assigned.set(event.word, { wordId: event.wordId, text: event.text });
            break;
          case "word-progress": {
            const dealt = event.word >= 0 ? assigned.get(event.word) : undefined;
            if (dealt === undefined) break;
            if (event.typed === 0 && event.result === "back") {
              if (lockedWord === event.word) {
                lockedWord = -1;
                model.unlock();
              }
              break;
            }
            // The meaning and IPA show only with the sim's hint for this very word (HC7: never shown with hintUsed false).
            const entry = world.words.live[event.word];
            const hint = entry !== undefined && entry.wordId === dealt.wordId && entry.hint;
            lockedWord = event.word;
            model.lock(frameWord(world, dealt.wordId, dealt.text), event.typed, hint);
            break;
          }
          case "word-complete":
            model.done(frameWord(world, event.wordId, event.text), event.hintUsed, nowMs);
            if (lockedWord === event.word) lockedWord = -1;
            break;
          case "word-released":
            if (lockedWord === event.word && event.reason !== "done") {
              lockedWord = -1;
              model.unlock();
            }
            break;
          case "wave-end":
            model.clearCard();
            break;
          default:
            break;
        }
      }
    },
    frame(_world: World, info: FrameInfo): void {
      nowMs = info.now;
      const view = model.view(info.now);
      const next = view ? [view.text, view.typed, view.ipa, view.meaning, view.isNew, view.done].join("|") : "";
      if (next !== key) {
        key = next;
        root.classList.toggle("is-idle", view === null);
        // "Vừa học" (with meanings) rides only on a typed word's card, never beside a word being typed.
        root.classList.toggle("is-card", view?.done === true);
        shownText = view?.text ?? "";
        if (view === null) {
          word.replaceChildren();
          ipa.textContent = meaning.textContent = "";
        } else {
          const typed = node(doc, "span", c.typed, view.text.slice(0, view.typed));
          word.replaceChildren(typed, doc.createTextNode(view.text.slice(view.typed)));
          if (view.done) word.append(doc.createTextNode(" "), node(doc, "span", "ic-learn__check", "✓"));
          if (view.isNew) word.append(doc.createTextNode(" "), node(doc, "span", "ic-learn__badge", "MỚI"));
          ipa.textContent = view.ipa;
          meaning.textContent = view.meaning;
        }
      }
      const recentNext = model.recent.map((item) => item.text + " (" + shortMeaning(item.vi) + ")").join(" · ");
      if (recentNext !== recentKey) {
        recentKey = recentNext;
        recent.textContent = recentNext === "" ? "" : "Vừa học: " + recentNext;
      }
    },
    dispose(): void {
      root.remove();
    },
  };
}
