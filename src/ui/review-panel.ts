import { installStyle, node } from "./learning-frame";

const STYLE_ID = "ic-panel-style";
/** Review panel presentation, shown only between waves. */
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

/** The DOM of a learning panel (review card), hidden until opened. */
export function panelBox(host: HTMLElement, label: string): PanelBox {
  const doc = host.ownerDocument;
  installStyle(doc, STYLE_ID, PANEL_CSS);
  const root = node(doc, "div", "ic-lpanel");
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", label);
  const listen = node(doc, "button", "ic-lpanel__listen", "Listen");
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

