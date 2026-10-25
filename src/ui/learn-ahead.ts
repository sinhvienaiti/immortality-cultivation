// Source: games/dragon-hold/src/ui/learning-frame.ts @06cd4e6 createPrelearn (adapted: a KeyPanel of the input router; one `learn-ahead{seat, wordId, correct}` command per word (Linh Sa per right word in the sim, canon §14.2); the learning event through app/learning.ts (review-card, hintUsed true, never a recall); no Tab replay (Tab is unused at MVP, canon §5.1): the listen button replays)
/**
 * Học trước (canon §17, §14.2, §6.4): in prep, this match's new words (within
 * the ledger's allowance, ≤ 8) one by one: word, IPA, meaning, listen; the
 * player copies each once, no time limit. A right copy goes on by itself; a
 * slip shows its wrong letters and waits for Backspace or Enter. Esc skips the
 * word on screen, Esc twice closes the panel. Every answered word is its first
 * meeting (the ledger takes it, channel "learn-ahead") and a `review-card`
 * learning event with `hintUsed: true` (never a recall, D17).
 * The panel's steps (`LearnAheadModel`) are pure and tested in node.
 * Owner: Lane 3.
 */
import type { CommandSink, FrameInfo, Presenter } from "../app/contracts";
import type { KeyPanel } from "../app/input-router";
import { learnAheadWords, type GlossOf } from "../app/learning";
import type { KeyAction } from "../content/rules";
import type { SimEvent, World } from "../content/types";
import { installStyle, node } from "./learning-frame";

export interface LearnAheadWord {
  readonly wordId: string;
  readonly text: string;
  readonly vi: string;
  readonly ipa: string;
}

/** UI timings (not rules): next word after a right copy, after a wrong one; two Esc within this close the panel. */
export const LEARN_AHEAD_MS = { right: 700, wrong: 1400, doubleEsc: 600 } as const;

export type LearnAheadStep =
  | { readonly kind: "none" }
  | { readonly kind: "answered"; readonly word: LearnAheadWord; readonly correct: boolean; readonly typed: string; readonly responseMs: number }
  | { readonly kind: "skipped" }
  | { readonly kind: "closed" };

/** The panel's steps, no DOM: letters, Backspace, Enter, Esc; `next` after an answer. */
export class LearnAheadModel {
  index = 0;
  typed = "";
  /** An answer is on screen until `next`. */
  waiting = false;
  open = false;
  readonly results: { readonly wordId: string; readonly correct: boolean }[] = [];
  private startedAt = 0;
  private escAt = Number.NEGATIVE_INFINITY;

  constructor(readonly words: readonly LearnAheadWord[]) {}

  get word(): LearnAheadWord | null {
    return this.open ? (this.words[this.index] ?? null) : null;
  }

  /** The typed copy is the word's length but wrong: waits for Backspace or Enter. */
  get slip(): boolean {
    const word = this.word;
    return word !== null && this.typed.length === word.text.length && this.typed !== word.text;
  }

  start(nowMs: number): boolean {
    if (this.words.length === 0) return false;
    this.open = true;
    this.index = 0;
    this.typed = "";
    this.waiting = false;
    this.startedAt = nowMs;
    return true;
  }

  private answer(nowMs: number): LearnAheadStep {
    const word = this.word!;
    const correct = this.typed === word.text;
    this.waiting = true;
    this.results.push({ wordId: word.wordId, correct });
    return { kind: "answered", word, correct, typed: this.typed, responseMs: Math.max(0, nowMs - this.startedAt) };
  }

  letter(letter: string, nowMs: number): LearnAheadStep {
    const word = this.word;
    if (word === null || this.waiting || !/^[a-z]$/.test(letter) || this.typed.length >= word.text.length) return { kind: "none" };
    this.typed += letter;
    // A right copy goes on at once; a slip waits (never sent half-way by itself).
    return this.typed === word.text ? this.answer(nowMs) : { kind: "none" };
  }

  backspace(): void {
    if (this.word !== null && !this.waiting) this.typed = this.typed.slice(0, -1);
  }

  enter(nowMs: number): LearnAheadStep {
    return this.word !== null && !this.waiting && this.typed.length > 0 ? this.answer(nowMs) : { kind: "none" };
  }

  /** One Esc skips the word on screen (no answer, no event); two within 0.6 s close the panel. */
  escape(nowMs: number): LearnAheadStep {
    if (!this.open) return { kind: "none" };
    if (nowMs - this.escAt <= LEARN_AHEAD_MS.doubleEsc) {
      this.open = false;
      return { kind: "closed" };
    }
    this.escAt = nowMs;
    if (this.waiting) return { kind: "none" };
    this.next(nowMs);
    return this.open ? { kind: "skipped" } : { kind: "closed" };
  }

  /** The next word (after an answer or a skip); closes after the last. */
  next(nowMs: number): void {
    this.waiting = false;
    this.index += 1;
    this.typed = "";
    this.startedAt = nowMs;
    if (this.index >= this.words.length) this.open = false;
  }
}

// ── The panel ──────────────────────────────────────────────────────────────

const STYLE_ID = "ic-panel-style";
/** Shared by learn-ahead.ts and review-card.ts. */
export const PANEL_CSS = `
.ic-lpanel {
  position: fixed; left: 50%; top: 50%; translate: -50% -50%; z-index: 60; box-sizing: border-box;
  width: min(92vw, calc(560px * var(--ui, 1))); padding: calc(18px * var(--ui, 1)) calc(24px * var(--ui, 1));
  display: grid; justify-items: center; gap: calc(8px * var(--ui, 1)); pointer-events: auto;
  background: rgba(14, 18, 24, 0.96); color: #F2EBDD; border: 2px solid rgba(242, 235, 221, 0.25); border-radius: calc(12px * var(--ui, 1));
  font-family: var(--kit-font-battle); transform: none; animation: none;
}
.ic-lpanel[hidden] { display: none; }
.ic-lpanel__title { font-size: max(12px, calc(15px * var(--ui, 1))); font-weight: 700; letter-spacing: 0.04em; color: #CFC6B3; }
.ic-lpanel__step { font-size: max(12px, calc(13px * var(--ui, 1))); color: #B9AE95; }
.ic-lpanel__word { font-size: calc(40px * var(--ui, 1) * var(--ic-text-scale, 1)); font-weight: 700; }
.ic-lpanel__ipa { font-family: var(--kit-font-ipa); font-size: calc(20px * var(--ui, 1)); color: #CFC6B3; }
.ic-lpanel__word:empty, .ic-lpanel__ipa:empty, .ic-lpanel__mean:empty, .ic-lpanel__choices:empty { display: none; }
.ic-lpanel__mean { font-size: calc(20px * var(--ui, 1)); text-align: center; }
.ic-lpanel__answer { min-height: calc(44px * var(--ui, 1)); font-size: calc(32px * var(--ui, 1)); font-weight: 700; letter-spacing: 0.12em; color: var(--kit-typing); }
.ic-lpanel__answer:empty { display: none; }
.ic-lpanel__answer .b { color: rgba(242, 235, 221, 0.35); }
.ic-lpanel__answer .x { color: #FFB4B4; text-decoration: underline wavy rgba(255, 140, 170, 0.8); }
.ic-lpanel__choices { display: grid; gap: 6px; width: 100%; }
.ic-lpanel__choice { display: flex; gap: 10px; align-items: center; padding: 6px 10px; border: 1px solid rgba(242, 235, 221, 0.3); border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: calc(18px * var(--ui, 1)); text-align: left; cursor: pointer; }
.ic-lpanel__key { font-weight: 800; border: 1px solid rgba(242, 235, 221, 0.5); border-radius: 3px; padding: 0 5px; }
.ic-lpanel__result { min-height: calc(22px * var(--ui, 1)); font-size: calc(17px * var(--ui, 1)); font-weight: 700; }
.ic-lpanel__result.is-right { color: var(--kit-typing); }
.ic-lpanel__result.is-wrong { color: #FFB4B4; }
.ic-lpanel__keys { font-size: max(12px, calc(13px * var(--ui, 1))); color: #B9AE95; }
.ic-lpanel__listen { cursor: pointer; border: 1px solid rgba(242, 235, 221, 0.4); border-radius: 16px; background: transparent; color: #F2EBDD; padding: 2px 12px; font: inherit; }
`;

export interface PanelBox {
  readonly root: HTMLElement;
  readonly title: HTMLElement;
  readonly step: HTMLElement;
  readonly word: HTMLElement;
  readonly ipa: HTMLElement;
  readonly mean: HTMLElement;
  readonly choices: HTMLElement;
  readonly answer: HTMLElement;
  readonly result: HTMLElement;
  readonly listen: HTMLButtonElement;
  readonly keys: HTMLElement;
}

/** The DOM of a learning panel (Học trước, Thẻ Ôn), hidden until opened. */
export function panelBox(host: HTMLElement, label: string): PanelBox {
  const doc = host.ownerDocument;
  installStyle(doc, STYLE_ID, PANEL_CSS);
  const root = node(doc, "div", "ic-lpanel");
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", label);
  const listen = node(doc, "button", "ic-lpanel__listen", "♪ Nghe");
  listen.type = "button";
  const box: PanelBox = {
    root,
    title: node(doc, "div", "ic-lpanel__title"),
    step: node(doc, "div", "ic-lpanel__step"),
    word: node(doc, "div", "ic-lpanel__word"),
    ipa: node(doc, "div", "ic-lpanel__ipa"),
    mean: node(doc, "div", "ic-lpanel__mean"),
    choices: node(doc, "div", "ic-lpanel__choices"),
    answer: node(doc, "div", "ic-lpanel__answer"),
    result: node(doc, "div", "ic-lpanel__result"),
    listen,
    keys: node(doc, "div", "ic-lpanel__keys"),
  };
  root.append(box.title, box.step, box.word, box.ipa, box.mean, box.listen, box.choices, box.answer, box.result, box.keys);
  host.append(root);
  return box;
}

/** Letters typed against a target: each letter that differs is marked, blanks for the rest. */
export function drawAnswer(doc: Document, target: HTMLElement, typed: string, length: number, against?: string): void {
  const parts: Node[] = [];
  for (let k = 0; k < typed.length; k += 1) {
    const ch = typed[k]!;
    if (against !== undefined && ch !== against[k]) parts.push(node(doc, "span", "x", ch));
    else parts.push(doc.createTextNode(ch));
  }
  parts.push(node(doc, "span", "b", "_".repeat(Math.max(0, length - typed.length))));
  target.replaceChildren(...parts);
}

export interface LearnAheadHooks {
  /** The learning session (app/learning.ts): event and ledger. */
  readonly learning?: { learnAhead(word: { readonly wordId: string; readonly text: string }, correct: boolean, responseMs: number, answer: string): unknown };
  readonly gloss?: GlossOf;
  /** Plays a word (kit speech); the listen button shows only with it. */
  readonly speak?: (text: string) => void;
  /** The panel closed (the app gives the keys back). */
  readonly onClose?: () => void;
  /** Wall clock, ms; default performance.now. */
  readonly now?: () => number;
  /** Delay before the next word; default setTimeout. */
  readonly later?: (ms: number, run: () => void) => void;
}

export type LearnAheadPanel = KeyPanel & Presenter & { open(words?: readonly LearnAheadWord[]): void; close(): void };

export function createLearnAhead(host: HTMLElement, sink: CommandSink, seat: number, hooks: LearnAheadHooks = {}): LearnAheadPanel {
  const doc = host.ownerDocument;
  const box = panelBox(host, "Học trước");
  const now = hooks.now ?? (() => performance.now());
  const later = hooks.later ?? ((ms: number, run: () => void) => void setTimeout(run, ms));
  let model = new LearnAheadModel([]);
  let deckWords: readonly LearnAheadWord[] = [];
  let deckRef: unknown = null;
  box.listen.hidden = hooks.speak === undefined;
  box.listen.addEventListener("click", () => {
    const word = model.word;
    if (word) hooks.speak?.(word.text);
  });

  const draw = (): void => {
    const word = model.word;
    if (word === null) return;
    box.title.textContent = "HỌC TRƯỚC · TỪ MỚI CỦA TRẬN";
    box.step.textContent = model.index + 1 + " / " + model.words.length;
    box.word.textContent = word.text;
    box.ipa.textContent = word.ipa;
    box.mean.textContent = word.vi;
    box.choices.replaceChildren();
    drawAnswer(doc, box.answer, model.typed, word.text.length, word.text);
    const slip = model.slip;
    box.result.textContent = slip ? "Có chữ sai: Backspace để sửa, Enter để nộp" : "";
    box.result.className = "ic-lpanel__result" + (slip ? " is-wrong" : "");
    box.keys.textContent = "Gõ lại từ · Enter nộp · Esc bỏ từ này · Esc hai lần đóng";
  };
  const show = (): void => {
    draw();
    const word = model.word;
    if (word) hooks.speak?.(word.text);
  };
  const close = (): void => {
    if (box.root.hidden) return;
    model.open = false;
    box.root.hidden = true;
    hooks.onClose?.();
  };
  const handle = (step: LearnAheadStep): void => {
    if (step.kind === "answered") {
      drawAnswer(doc, box.answer, step.typed, step.word.text.length, step.word.text);
      sink({ type: "learn-ahead", seat, wordId: step.word.wordId, correct: step.correct });
      hooks.learning?.learnAhead(step.word, step.correct, step.responseMs, step.typed);
      box.result.textContent = step.correct ? "Đúng!" : "Chưa đúng: " + step.word.text;
      box.result.className = "ic-lpanel__result " + (step.correct ? "is-right" : "is-wrong");
      later(step.correct ? LEARN_AHEAD_MS.right : LEARN_AHEAD_MS.wrong, () => {
        if (!model.open) return;
        model.next(now());
        if (model.open) show();
        else close();
      });
    } else if (step.kind === "skipped") show();
    else if (step.kind === "closed") close();
    else draw();
  };

  return {
    get isOpen() {
      return model.open;
    },
    open(words?: readonly LearnAheadWord[]): void {
      model = new LearnAheadModel(words ?? deckWords);
      if (!model.start(now())) return;
      box.root.hidden = false;
      show();
    },
    close,
    handleLetter(letter: string): boolean {
      if (!model.open) return false;
      handle(model.letter(letter, now()));
      return true;
    },
    handleAction(action: KeyAction): boolean {
      if (!model.open) return false;
      if (action === "escape") handle(model.escape(now()));
      else if (action === "backspace") {
        model.backspace();
        draw();
      } else if (action === "enter") handle(model.enter(now()));
      return true;
    },
    onEvents(_events: readonly SimEvent[], world: World): void {
      if (world.header.deck === deckRef) return;
      deckRef = world.header.deck;
      deckWords = learnAheadWords(world.header.deck, hooks.gloss ?? (() => null));
    },
    frame(_world: World, _info: FrameInfo): void {},
    dispose(): void {
      box.root.remove();
    },
  };
}
