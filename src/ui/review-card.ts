// Source: games/dragon-hold/src/ui/learning-frame.ts @06cd4e6 createReviewCard (adapted: canon §17's three kinds — hear then type, read the meaning then type, pick the meaning 1 of 3 with keys 1/2/3; a KeyPanel of the input router; one `review-card{seat, wordId, correct}` command per answer; no screen-zone placement yet (Lane 6's screen-zones.ts); no Tab replay)
/**
 * Thẻ Ôn (canon §17, §14.2): at a break, up to 3 questions from the wave just
 * played (Ẩu → typed with the meaning shown → new; app/learning.ts), kinds
 * rotating: hear then type (`listening`), read the meaning then type
 * (`review-card`), pick the meaning 1 of 3 with keys 1/2/3 (`meaning-recall`).
 * While it is open the break clock stops (the app does not step the sim) and
 * the combat letter layer hides (the learning frame is covered). A right
 * answer sends `review-card` (Linh Sa in the sim); a wrong one costs nothing
 * and shows the word, meaning and IPA again. The word and its IPA stay hidden
 * while the player answers, so an answer carries no hint.
 * The panel's steps (`ReviewModel`) are pure and tested in node.
 * Owner: Lane 3.
 */
import type { CommandSink, FrameInfo, Presenter } from "../app/contracts";
import type { KeyPanel } from "../app/input-router";
import type { ReviewQuestion } from "../app/learning";
import type { KeyAction } from "../content/rules";
import type { SimEvent, World } from "../content/types";
import { drawAnswer, panelBox } from "./learn-ahead";
import { node } from "./learning-frame";

/** UI timings (not rules): next question after a right answer, after a wrong one. */
export const REVIEW_MS = { right: 800, wrong: 1800 } as const;

export type ReviewStep =
  | { readonly kind: "none" }
  | { readonly kind: "answered"; readonly question: ReviewQuestion; readonly correct: boolean; readonly answer: string; readonly responseMs: number }
  | { readonly kind: "closed" };

const PICKS: Readonly<Partial<Record<KeyAction, number>>> = { "item-1": 0, "item-2": 1, "item-3": 2 };

/** Thẻ Ôn's steps, no DOM. */
export class ReviewModel {
  index = 0;
  typed = "";
  waiting = false;
  open = false;
  private startedAt = 0;

  constructor(readonly questions: readonly ReviewQuestion[]) {}

  get question(): ReviewQuestion | null {
    return this.open ? (this.questions[this.index] ?? null) : null;
  }

  start(nowMs: number): boolean {
    if (this.questions.length === 0) return false;
    this.open = true;
    this.index = 0;
    this.typed = "";
    this.waiting = false;
    this.startedAt = nowMs;
    return true;
  }

  private answer(correct: boolean, answer: string, nowMs: number): ReviewStep {
    this.waiting = true;
    return { kind: "answered", question: this.question!, correct, answer, responseMs: Math.max(0, nowMs - this.startedAt) };
  }

  /** A letter (typing kinds): the answer goes in when it has the word's length. */
  letter(letter: string, nowMs: number): ReviewStep {
    const question = this.question;
    if (question === null || this.waiting || question.kind === "meaning-pick" || !/^[a-z]$/.test(letter) || this.typed.length >= question.text.length) return { kind: "none" };
    this.typed += letter;
    return this.typed.length === question.text.length ? this.answer(this.typed === question.text, this.typed, nowMs) : { kind: "none" };
  }

  /** Keys 1/2/3 (or a click) on a meaning-pick question. */
  pick(choice: number, nowMs: number): ReviewStep {
    const question = this.question;
    if (question === null || this.waiting || question.kind !== "meaning-pick" || choice < 0 || choice >= question.choices.length) return { kind: "none" };
    return this.answer(choice === question.answer, question.choices[choice]!, nowMs);
  }

  backspace(): void {
    if (this.question !== null && !this.waiting) this.typed = this.typed.slice(0, -1);
  }

  enter(nowMs: number): ReviewStep {
    const question = this.question;
    if (question === null || this.waiting || question.kind === "meaning-pick" || this.typed.length === 0) return { kind: "none" };
    return this.answer(this.typed === question.text, this.typed, nowMs);
  }

  close(): ReviewStep {
    if (!this.open) return { kind: "none" };
    this.open = false;
    return { kind: "closed" };
  }

  next(nowMs: number): void {
    this.waiting = false;
    this.index += 1;
    this.typed = "";
    this.startedAt = nowMs;
    if (this.index >= this.questions.length) this.open = false;
  }
}

const KIND_TITLES: Readonly<Record<ReviewQuestion["kind"], string>> = {
  listening: "Nghe rồi gõ từ",
  "meaning-type": "Xem nghĩa rồi gõ từ",
  "meaning-pick": "Chọn nghĩa đúng (phím 1 / 2 / 3)",
};

export interface ReviewHooks {
  /** The learning session (app/learning.ts): questions and events. */
  readonly learning?: {
    review(question: ReviewQuestion, correct: boolean, responseMs: number, answer: string): unknown;
    reviewQuestions(wave: number): ReviewQuestion[];
  };
  readonly speak?: (text: string) => void;
  readonly onClose?: () => void;
  readonly now?: () => number;
  readonly later?: (ms: number, run: () => void) => void;
}

export type ReviewCardPanel = KeyPanel & Presenter & { open(questions?: readonly ReviewQuestion[]): void; close(): void };

export function createReviewCard(host: HTMLElement, sink: CommandSink, seat: number, hooks: ReviewHooks = {}): ReviewCardPanel {
  const doc = host.ownerDocument;
  const box = panelBox(host, "Thẻ Ôn");
  const now = hooks.now ?? (() => performance.now());
  const later = hooks.later ?? ((ms: number, run: () => void) => void setTimeout(run, ms));
  let model = new ReviewModel([]);
  let lastWave = 0;
  box.listen.addEventListener("click", () => {
    const question = model.question;
    if (question && question.kind === "listening") hooks.speak?.(question.text);
  });

  const draw = (): void => {
    const question = model.question;
    if (question === null) return;
    box.title.textContent = "THẺ ÔN";
    box.step.textContent = KIND_TITLES[question.kind] + " · " + (model.index + 1) + " / " + model.questions.length;
    box.word.textContent = question.kind === "meaning-pick" ? question.text : "";
    box.ipa.textContent = "";
    box.mean.textContent = question.kind === "meaning-type" ? question.vi : "";
    box.listen.hidden = question.kind !== "listening" || hooks.speak === undefined;
    if (question.kind === "meaning-pick") {
      box.choices.replaceChildren(
        ...question.choices.map((choice, k) => {
          const button = node(doc, "button", "ic-lpanel__choice");
          button.type = "button";
          button.append(node(doc, "span", "ic-lpanel__key", String(k + 1)), doc.createTextNode(choice));
          button.addEventListener("click", () => handle(model.pick(k, now())));
          return button;
        }),
      );
      box.answer.replaceChildren();
    } else {
      box.choices.replaceChildren();
      drawAnswer(doc, box.answer, model.typed, question.text.length);
    }
    box.result.textContent = "";
    box.result.className = "ic-lpanel__result";
    box.keys.textContent = question.kind === "meaning-pick" ? "Phím 1 / 2 / 3 chọn · Esc đóng thẻ" : "Enter nộp · Backspace xóa · Esc đóng thẻ";
  };
  const show = (): void => {
    draw();
    const question = model.question;
    if (question?.kind === "listening") hooks.speak?.(question.text);
  };
  const close = (): void => {
    if (box.root.hidden) return;
    model.close();
    box.root.hidden = true;
    hooks.onClose?.();
  };
  function handle(step: ReviewStep): void {
    if (step.kind === "answered") {
      const { question, correct } = step;
      if (question.kind !== "meaning-pick") drawAnswer(doc, box.answer, step.answer, question.text.length);
      sink({ type: "review-card", seat, wordId: question.wordId, correct });
      hooks.learning?.review(question, correct, step.responseMs, step.answer);
      if (correct) {
        box.result.textContent = "Đúng!";
        box.result.className = "ic-lpanel__result is-right";
      } else {
        // A wrong answer costs nothing: the word, its meaning and IPA come back (canon §17).
        box.word.textContent = question.text;
        box.ipa.textContent = question.ipa;
        box.mean.textContent = question.vi;
        box.result.textContent = "Chưa đúng, nhớ lại nhé";
        box.result.className = "ic-lpanel__result is-wrong";
        hooks.speak?.(question.text);
      }
      later(correct ? REVIEW_MS.right : REVIEW_MS.wrong, () => {
        if (!model.open) return;
        model.next(now());
        if (model.open) show();
        else close();
      });
    } else if (step.kind === "closed") close();
    else {
      const question = model.question;
      if (question !== null && question.kind !== "meaning-pick") drawAnswer(doc, box.answer, model.typed, question.text.length);
    }
  }

  return {
    get isOpen() {
      return model.open;
    },
    open(questions?: readonly ReviewQuestion[]): void {
      model = new ReviewModel(questions ?? hooks.learning?.reviewQuestions(lastWave) ?? []);
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
      const pick = PICKS[action];
      if (pick !== undefined) handle(model.pick(pick, now()));
      else if (action === "escape") close();
      else if (action === "backspace") {
        model.backspace();
        handle({ kind: "none" });
      } else if (action === "enter") handle(model.enter(now()));
      return true;
    },
    onEvents(events: readonly SimEvent[], _world: World): void {
      for (const event of events) if (event.type === "wave-end") lastWave = event.wave;
    },
    frame(_world: World, _info: FrameInfo): void {},
    dispose(): void {
      box.root.remove();
    },
  };
}
