/**
 * Base styles every game shares: the :root tokens and the learning frame
 * (05-presentation §4.4). The learning frame is DOM over the canvas: it never
 * shakes, takes no post effects and nothing is drawn over it.
 */
import { KIT_CSS_VARIABLES, uiScale } from "./tokens";

export const KIT_STYLE_ID = "game-kit-ui";

export const LEARNING_FRAME_CLASSES = {
  root: "kit-learning-frame",
  word: "kit-learning-frame__word",
  typed: "kit-learning-frame__typed",
  ipa: "kit-learning-frame__ipa",
  meaning: "kit-learning-frame__meaning",
  recent: "kit-learning-frame__recent",
} as const;

const c = LEARNING_FRAME_CLASSES;

export const KIT_CSS = `:root {
${Object.entries(KIT_CSS_VARIABLES)
  .map(([name, value]) => `  ${name}: ${value};`)
  .join("\n")}
}
.kit-battle-text { font-family: var(--kit-font-battle); }
.${c.root} {
  position: fixed;
  left: 50%;
  bottom: calc(16px * var(--ui));
  width: calc(480px * var(--ui));
  min-height: calc(88px * var(--ui));
  translate: -50% 0;
  box-sizing: border-box;
  padding: calc(8px * var(--ui)) calc(16px * var(--ui));
  display: grid;
  justify-items: center;
  align-content: center;
  gap: calc(2px * var(--ui));
  background: var(--kit-learning-bg);
  color: var(--kit-learning-text);
  border-radius: calc(10px * var(--ui));
  font-family: var(--kit-font-battle);
  z-index: var(--kit-z-learning);
  isolation: isolate;
  pointer-events: none;
  /* Never shaken or filtered: screen effects stay on the canvas. */
  transform: none;
  filter: none;
  animation: none;
}
.${c.word} { font-size: calc(32px * var(--ui)); font-weight: 700; line-height: 1.1; letter-spacing: 0.01em; }
.${c.typed} { color: var(--kit-typing); }
.${c.ipa} { font-family: var(--kit-font-ipa); font-size: calc(18px * var(--ui)); color: var(--kit-learning-muted); }
.${c.meaning} { font-size: calc(18px * var(--ui)); font-weight: 400; }
.${c.recent} { font-size: calc(13px * var(--ui)); color: var(--kit-learning-muted); }
`;

type StyleDocument = {
  getElementById(id: string): unknown;
  createElement(tag: "style"): { id: string; textContent: string | null };
  head: { append(node: unknown): void };
  documentElement: { style: { setProperty(name: string, value: string): void } };
};

/** Adds the kit's styles once; returns false when they were already there. */
export function installKitStyles(doc: StyleDocument = document as unknown as StyleDocument): boolean {
  if (doc.getElementById(KIT_STYLE_ID) !== null) return false;
  const style = doc.createElement("style");
  style.id = KIT_STYLE_ID;
  style.textContent = KIT_CSS;
  doc.head.append(style);
  return true;
}

/** Writes `--ui` for this viewport on the root element; call on resize. */
export function applyUiScale(
  width: number,
  height: number,
  doc: Pick<StyleDocument, "documentElement"> = document as unknown as StyleDocument,
): number {
  const scale = uiScale(width, height);
  doc.documentElement.style.setProperty("--ui", scale.toFixed(4));
  return scale;
}
