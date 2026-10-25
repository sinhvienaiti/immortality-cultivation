/**
 * Thu Hoạch (canon §4.1, §14.1, §17; Codex §17.1): the match's end on one
 * card, learning and RPG results on separate lines. RPG: stars by Trận Lực
 * left (★★★ ≥ 70 %, ★★ ≥ 40 %, ★ > 0), waves held, beasts felled, Thú Hạch of
 * the match (kept 50 % on a loss or a retreat), Linh Sa left. Learning: words
 * typed, grades (Chớp, Hoàn hảo, Tốt, Vừa, Ẩu), new words met, words typed
 * wrong; then the Sổ Từ (Lane 3's ui/word-book.ts, embedded). Opens on
 * `victory` or `defeat`, or when the app calls `show("retreat")` (pause menu
 * → Rút lui). A KeyPanel while open: Enter plays again (`onAgain`), letters
 * are dropped. Văn Khí and every learning result are never lost (canon
 * §4.1); M0a keeps no progression (canon §25), so nothing here is saved.
 * The view model `harvestView` is pure and tested in node.
 * Owner: Lane 6.
 */
import type { FrameInfo, Presenter } from "../app/contracts";
import type { KeyPanel } from "../app/input-router";
import type { MatchWord, WordBookEntry } from "../app/learning";
import { FLOW, THU_HACH, type KeyAction } from "../content/rules";
import type { SimEvent, World } from "../content/types";
import { renderWordBook } from "./word-book";
import { el, setShown, setText, viNumber } from "./skin";

export type Outcome = "victory" | "defeat" | "retreat";

export interface LearningHarvest {
  readonly words: readonly MatchWord[];
  readonly book: readonly WordBookEntry[];
}

export interface HarvestLine {
  readonly label: string;
  readonly value: string;
}

export interface HarvestView {
  readonly outcome: Outcome;
  readonly title: string;
  /** 0 on a loss or a retreat. */
  readonly stars: 0 | 1 | 2 | 3;
  readonly rpg: readonly HarvestLine[];
  readonly learning: readonly HarvestLine[];
}

const GRADE_NAMES = ["Chớp", "Hoàn hảo", "Tốt", "Vừa", "Ẩu"] as const;

/** Stars by Trận Lực left (canon §4.1; the sim's `victory` carries the same). */
export function starsFor(heart: number, heartMax: number): 1 | 2 | 3 {
  const pct = heartMax > 0 ? Math.floor((heart * 100) / heartMax) : 0;
  return pct >= FLOW.threeStarPct ? 3 : pct >= FLOW.twoStarPct ? 2 : 1;
}

/** Waves held: the last wave whose end was booked (the boss phase counts as the stage's last). */
export function wavesHeld(world: World): number {
  return Math.max(0, Math.min(world.waves?.endedThrough ?? 0, world.stage.waves.length));
}

/** Thu Hoạch for `seat` (pure). `stars` from the `victory` event when there was one. */
export function harvestView(world: World, seat: number, outcome: Outcome, stars: 0 | 1 | 2 | 3, learning: LearningHarvest | null): HarvestView {
  const formation = world.formation;
  const heart = formation?.heart ?? 0;
  const heartMax = formation?.heartMax ?? 0;
  const wallet = world.economy?.wallets?.[seat];
  const thuHach = wallet?.thuHach ?? 0;
  const kept = outcome === "victory" ? thuHach : Math.floor((thuHach * THU_HACH.defeatKeepPct) / 100);
  const pct = heartMax > 0 ? Math.round((heart * 100) / heartMax) : 0;
  const rpg: HarvestLine[] = [
    { label: "Trận Lực còn", value: pct + " %" },
    { label: "Đợt giữ được", value: wavesHeld(world) + " / " + world.stage.waves.length },
    { label: "Thú đã hạ", value: viNumber(world.stats?.kills ?? 0) },
    { label: outcome === "victory" ? "Thú Hạch" : "Thú Hạch (giữ " + THU_HACH.defeatKeepPct + " %)", value: viNumber(kept) },
    { label: "Linh Sa còn", value: viNumber(wallet?.linhSa ?? 0) },
  ];
  const grades = world.stats?.grades ?? [0, 0, 0, 0, 0];
  const lines: HarvestLine[] = [{ label: "Từ đã gõ", value: viNumber(world.stats?.words ?? 0) }];
  GRADE_NAMES.forEach((name, k) => lines.push({ label: name, value: viNumber(grades[k] ?? 0) }));
  if (learning !== null) {
    lines.push({ label: "Từ mới đã gặp", value: viNumber(learning.words.filter((word) => word.isNew).length) });
    lines.push({ label: "Từ gõ sai", value: viNumber(learning.words.filter((word) => word.errors > 0 || word.sloppy).length) });
  }
  const title = outcome === "victory" ? "Thu Hoạch · Giữ được ải" : outcome === "defeat" ? "Thu Hoạch · Ải đã vỡ" : "Thu Hoạch · Rút lui";
  return { outcome, title, stars: outcome === "victory" ? stars : 0, rpg, learning: lines };
}

/** "★★☆" for 2 stars. */
export function starText(stars: number): string {
  return "★".repeat(stars) + "☆".repeat(Math.max(0, 3 - stars));
}

export interface ResultsPresenter extends Presenter, KeyPanel {
  readonly view: HarvestView | null;
  /** Opens Thu Hoạch now (Rút lui from the pause menu). */
  show(outcome: Outcome): void;
  hide(): void;
}

export interface ResultsOptions {
  readonly seat?: number;
  /** The learning session's words and Sổ Từ (app/learning.ts matchWords, wordBook). */
  readonly learning?: () => LearningHarvest | null;
  /** Plays a word (Sổ Từ buttons). */
  readonly speak?: (text: string) => void;
  /** Enter or the button: play the stage again. */
  readonly onAgain?: () => void;
}

/** Thu Hoạch in `host` (#ic-overlay). */
export function createResults(host: HTMLElement, options: ResultsOptions = {}): ResultsPresenter {
  const seat = options.seat ?? 0;
  const doc = host.ownerDocument;
  const root = el(doc, "section", "ic-panel ic-results");
  root.dataset.ui = "results";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Thu Hoạch");
  const title = el(doc, "h2", "ic-results__title");
  const stars = el(doc, "div", "ic-results__stars");
  const cols = el(doc, "div", "ic-results__cols");
  const rpgCol = el(doc, "div", "ic-results__col");
  const learnCol = el(doc, "div", "ic-results__col");
  cols.append(rpgCol, learnCol);
  const book = el(doc, "div", "ic-results__book");
  const foot = el(doc, "div", "ic-results__foot", "Enter: chơi lại ải này");
  root.append(title, stars, cols, book, foot);
  host.append(root);

  let view: HarvestView | null = null;
  let pending: Outcome | null = null;
  let pendingStars: 0 | 1 | 2 | 3 = 0;
  let open = false;

  const lines = (col: HTMLElement, heading: string, items: readonly HarvestLine[]): void => {
    col.replaceChildren(el(doc, "h3", "", heading), ...items.map((item) => {
      const row = el(doc, "div", "ic-results__line");
      row.append(el(doc, "span", "", item.label), el(doc, "b", "", item.value));
      return row;
    }));
  };

  const render = (world: World, outcome: Outcome): void => {
    const learning = options.learning?.() ?? null;
    view = harvestView(world, seat, outcome, pendingStars, learning);
    setText(title, view.title);
    setText(stars, view.outcome === "victory" ? starText(view.stars) : "");
    setShown(stars, view.outcome === "victory");
    lines(rpgCol, "Trận", view.rpg);
    lines(learnCol, "Học", view.learning);
    if (learning !== null) renderWordBook(book, learning.book, options.speak);
    else book.replaceChildren();
    setShown(root, true);
    open = true;
  };

  return {
    get view() {
      return view;
    },
    get isOpen() {
      return open;
    },
    handleLetter(): boolean {
      return false;
    },
    handleAction(action: KeyAction): boolean {
      if (action === "enter") options.onAgain?.();
      return true;
    },
    show(outcome: Outcome): void {
      pending = outcome;
    },
    hide(): void {
      open = false;
      pending = null;
      setShown(root, false);
    },
    onEvents(events: readonly SimEvent[], _world: World): void {
      for (const event of events) {
        if (event.type === "victory") {
          pendingStars = event.stars;
          pending = "victory";
        } else if (event.type === "defeat") pending = "defeat";
      }
    },
    frame(world: World, _info: FrameInfo): void {
      if (pending === null) return;
      const outcome = pending;
      pending = null;
      render(world, outcome);
    },
    dispose(): void {
      root.remove();
    },
  };
}
