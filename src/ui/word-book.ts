/**
 * Sổ Từ for Thu Hoạch (canon §17): the match's new words, words typed wrong,
 * words due; word, IPA, meaning; click a word to hear it. Learning results
 * are listed apart from the RPG lines (Lane 6's results.ts embeds this).
 * Owner: Lane 3.
 */
import type { WordBookEntry } from "../app/learning";
import { installStyle, node } from "./learning-frame";

export type { WordBookEntry } from "../app/learning";

export interface WordBookSection {
  readonly kind: WordBookEntry["kind"];
  readonly title: string;
  readonly entries: readonly WordBookEntry[];
}

const TITLES: Readonly<Record<WordBookEntry["kind"], string>> = { new: "Mới học", mistyped: "Gõ sai", due: "Cần ôn" };

/** Non-empty sections in the order new, mistyped, due (pure). */
export function wordBookSections(entries: readonly WordBookEntry[]): WordBookSection[] {
  return (["new", "mistyped", "due"] as const)
    .map((kind) => ({ kind, title: TITLES[kind], entries: entries.filter((entry) => entry.kind === kind) }))
    .filter((section) => section.entries.length > 0);
}

const STYLE_ID = "ic-word-book-style";
const CSS = `
.ic-book { display: grid; gap: 10px; font-family: var(--kit-font-battle); color: #F2EBDD; }
.ic-book__title { font-size: 14px; font-weight: 800; letter-spacing: 0.04em; color: #CFC6B3; margin: 0; }
.ic-book__list { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.ic-book__word { display: grid; gap: 1px; padding: 4px 10px; border: 1px solid rgba(242, 235, 221, 0.3); border-radius: 8px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.ic-book__en { font-size: 18px; font-weight: 700; }
.ic-book__ipa { font-family: var(--kit-font-ipa); font-size: 13px; color: #CFC6B3; }
.ic-book__vi { font-size: 13px; }
.ic-book__ipa:empty, .ic-book__vi:empty { display: none; }
.ic-book__empty { color: #CFC6B3; }
`;

/** Draws the Sổ Từ into `host` (its old content goes); `speak` makes each word a button that plays it. */
export function renderWordBook(host: HTMLElement, entries: readonly WordBookEntry[], speak?: (text: string) => void): void {
  const doc = host.ownerDocument;
  installStyle(doc, STYLE_ID, CSS);
  const root = node(doc, "section", "ic-book");
  root.setAttribute("aria-label", "Sổ Từ");
  const sections = wordBookSections(entries);
  if (sections.length === 0) root.append(node(doc, "p", "ic-book__empty", "Trận này chưa có từ để ghi vào Sổ Từ."));
  for (const section of sections) {
    const list = node(doc, "ul", "ic-book__list");
    for (const entry of section.entries) {
      const item = doc.createElement("li");
      const button = node(doc, "button", "ic-book__word");
      button.type = "button";
      button.dataset.wordId = entry.wordId;
      button.append(node(doc, "span", "ic-book__en", entry.text), node(doc, "span", "ic-book__ipa", entry.ipa ?? ""), node(doc, "span", "ic-book__vi", entry.vi ?? ""));
      if (speak) button.addEventListener("click", () => speak(entry.text));
      else button.disabled = true;
      item.append(button);
      list.append(item);
    }
    root.append(node(doc, "h3", "ic-book__title", section.title + " (" + section.entries.length + ")"), list);
  }
  host.replaceChildren(root);
}
