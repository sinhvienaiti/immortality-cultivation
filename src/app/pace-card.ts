// Source: games/dragon-hold/src/app/pace-card.ts @06cd4e6 (adapted: canon §4.3, D18 — a "chưa biết" row (25 WPM, re-measured after wave 1, D41); rows from typing-pace.ts paceChoices; its own keys while open (it comes before the match's key router): ↑ ↓, Enter, digits)
/**
 * The speed card (canon §4.3, D18): asks how fast the player types before the
 * first match (and again from the pause menu). Rows: the measured speed when
 * there is one, "Chưa biết" (25 WPM; the first match re-measures k after wave
 * 1), then presets. A row's digit picks it, ↑ ↓ move, Enter picks, a click
 * picks; the pick is remembered for the next visit (typing-pace.ts).
 * Owner: Lane 3.
 */
import type { SeatProfile } from "../content/types";
import type { SkillProfile } from "../kit/balance/profile";
import { installStyle, node } from "../ui/learning-frame";
import { paceChoices, rememberPick, type PaceChoice } from "./typing-pace";

export interface PaceCardChoice {
  readonly profile: SeatProfile;
  /** "Chưa biết": k is recomputed after wave 1 (D41). */
  readonly unknown: boolean;
}

export interface PaceCardOptions {
  /** The stored `.skill` profile (storage.ts loadSkill): its measured speed is the first row. */
  readonly skill?: SkillProfile | null;
  /** The last pick (typing-pace.ts readPaceMemory), preselected when nothing was measured. */
  readonly lastPick?: number | null;
  /** Remember the pick (default true; tests pass false). */
  readonly remember?: boolean;
}

const STYLE_ID = "ic-pace-card-style";
const CSS = `
.ic-pace {
  position: fixed; left: 50%; top: 50%; translate: -50% -50%; z-index: 80; box-sizing: border-box;
  width: min(92vw, 520px); padding: 20px 24px; display: grid; gap: 10px;
  background: rgba(14, 18, 24, 0.97); color: #F2EBDD; border: 2px solid rgba(242, 235, 221, 0.25); border-radius: 12px;
  font-family: var(--kit-font-battle);
}
.ic-pace__title { font-size: 22px; font-weight: 800; }
.ic-pace__lead { font-size: 14px; color: #CFC6B3; }
.ic-pace__list { display: grid; gap: 6px; }
.ic-pace__row { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; align-items: center; padding: 8px 12px; border: 1px solid rgba(242, 235, 221, 0.25); border-radius: 8px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.ic-pace__row.is-on { border-color: #7FF5E0; background: rgba(127, 245, 224, 0.08); }
.ic-pace__key { grid-row: span 2; font-weight: 800; border: 1px solid rgba(242, 235, 221, 0.5); border-radius: 3px; padding: 0 6px; }
.ic-pace__label { font-size: 18px; font-weight: 700; }
.ic-pace__hint { font-size: 13px; color: #CFC6B3; }
.ic-pace__keys { font-size: 13px; color: #B9AE95; }
`;

/** The digit that picks row `index` (1–9), or "" past 9. */
export const rowDigit = (index: number): string => (index < 9 ? String(index + 1) : "");

/** Shows the card in `host` and resolves with the pick; the card removes itself. */
export function showPaceCard(host: HTMLElement, options: PaceCardOptions = {}): Promise<PaceCardChoice> {
  const doc = host.ownerDocument;
  const view = doc.defaultView;
  installStyle(doc, STYLE_ID, CSS);
  const { choices, selected } = paceChoices(options.skill, options.lastPick);
  const card = node(doc, "section", "ic-pace");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Tốc độ gõ");
  const list = node(doc, "div", "ic-pace__list");
  card.append(
    node(doc, "div", "ic-pace__title", "Bạn gõ nhanh cỡ nào?"),
    node(
      doc,
      "div",
      "ic-pace__lead",
      "Thú tràn vào nhanh hay chậm, từ dài hay ngắn theo tốc độ này; không ai phải gõ nhanh hơn sức mình. Chưa biết thì chọn \"Chưa biết\": game đo lại sau đợt 1. Hết trận, game ghi tốc độ thật của bạn.",
    ),
    list,
    node(doc, "div", "ic-pace__keys", "Phím số chọn · ↑ ↓ rồi Enter · hoặc bấm chuột"),
  );
  host.append(card);
  let index = selected;
  return new Promise((resolve) => {
    const rows = choices.map((choice: PaceChoice, k) => {
      const row = node(doc, "button", "ic-pace__row");
      row.type = "button";
      row.dataset.wpm = String(choice.profile.e);
      row.dataset.unknown = String(choice.unknown);
      row.append(node(doc, "span", "ic-pace__key", rowDigit(k)), node(doc, "span", "ic-pace__label", choice.label), node(doc, "span", "ic-pace__hint", choice.hint));
      row.addEventListener("click", () => pick(k));
      row.addEventListener("pointerenter", () => select(k));
      return row;
    });
    list.replaceChildren(...rows);
    function select(next: number): void {
      index = (next + rows.length) % rows.length;
      rows.forEach((row, k) => row.classList.toggle("is-on", k === index));
    }
    function pick(k: number): void {
      const choice = choices[k];
      if (choice === undefined) return;
      view?.removeEventListener("keydown", onKey, { capture: true });
      card.remove();
      if (options.remember !== false && !choice.unknown) rememberPick(choice.profile.e);
      resolve({ profile: choice.profile, unknown: choice.unknown });
    }
    function onKey(event: KeyboardEvent): void {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === "ArrowUp") select(index - 1);
      else if (event.code === "ArrowDown") select(index + 1);
      else if (event.code === "Enter" || event.code === "NumpadEnter") pick(index);
      else if (/^Digit[1-9]$/.test(event.code)) pick(Number(event.code.slice(5)) - 1);
      else return;
      event.preventDefault();
      event.stopPropagation();
    }
    view?.addEventListener("keydown", onKey, { capture: true });
    select(index);
  });
}
