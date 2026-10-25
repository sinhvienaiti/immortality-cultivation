// Source: games/dragon-hold/src/ui/skin.ts @06cd4e6 (adapted: only the DOM helpers el, uiButton, setText, setClass, setVar, setShown, viNumber (+ thousands dot); fonts, kit tokens, text scale, reduced motion, icons and key caps are new)
/**
 * UI skin (canon §21.1, §24): Be Vietnam Pro (400, 700, 800), Noto Sans for
 * IPA, the kit/ui tokens (semantic colours, --ui scale) and the game
 * stylesheet (src/ui/styles/); text scale 100 / 125 / 150 % as
 * --ic-text-scale (the Bàn Quyết and the learning panels read it too).
 * Reduced motion (canon §24, M0A_PLAN §6.6 item 7): the setting wins over
 * prefers-reduced-motion, `?motion=full|reduce` wins over both (checks);
 * html[data-motion] tells the stylesheet. Also the small DOM helpers and the
 * stand-in vector icons the UI parts share (no image files at M0a): family
 * shapes by gait (shape before colour, canon §24) and the wave-card marks.
 * Buttons never take focus from the window key router.
 * Owner: Lane 6.
 */
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/800.css";
import "@fontsource/noto-sans/400.css";
import { ACCESS } from "../content/rules";
import type { Gait } from "../content/types";
import { applyUiScale, installKitStyles } from "../kit/ui/styles";
import { IC_CSS, IC_STYLE_ID } from "./styles/game-css";

export type TextScale = 100 | 125 | 150;

const SKIN_FLAG = "icSkin";

/** The --ic-text-scale value of a setting (unknown values fall back to 100 %). */
export function textScaleFactor(scale: number): number {
  return ACCESS.textScales.includes(scale) ? scale / 100 : 1;
}

/** Installs fonts, kit tokens and the game stylesheet once; sets the text scale (call again when it changes). */
export function applySkin(doc: Document, textScale: TextScale): void {
  const root = doc.documentElement;
  root.style.setProperty("--ic-text-scale", textScaleFactor(textScale).toFixed(2));
  if (root.dataset[SKIN_FLAG] === "1") return;
  root.dataset[SKIN_FLAG] = "1";
  root.classList.add("ic-skin");
  installKitStyles(doc as unknown as Parameters<typeof installKitStyles>[0]);
  if (doc.getElementById(IC_STYLE_ID) === null) {
    const style = doc.createElement("style");
    style.id = IC_STYLE_ID;
    style.textContent = IC_CSS;
    doc.head.append(style);
  }
  const view = doc.defaultView;
  if (!view) return;
  const rescale = (): void => void applyUiScale(view.innerWidth, view.innerHeight, doc as unknown as Parameters<typeof applyUiScale>[2]);
  rescale();
  view.addEventListener("resize", rescale);
}

// ── Reduced motion ──────────────────────────────────────────────────────────

/** `.settings` motion (canon §23.1). */
export type MotionSetting = "system" | "full" | "reduce";

/** True when motion is reduced: `?motion=` first (checks), then the setting, then the system query. */
export function resolveReducedMotion(setting: MotionSetting, systemReduced: boolean, urlFlag: string | null = null): boolean {
  if (urlFlag === "full") return false;
  if (urlFlag === "reduce") return true;
  if (setting === "full") return false;
  if (setting === "reduce") return true;
  return systemReduced;
}

export interface MotionWatch {
  /** Reduced motion now (presenters ask each frame; cheap). */
  readonly reduced: boolean;
  set(setting: MotionSetting): void;
  dispose(): void;
}

/** Follows the setting, the media query and `?motion=`; writes html[data-motion] for the stylesheet. */
export function watchMotion(win: Window, setting: MotionSetting = "system"): MotionWatch {
  const query = typeof win.matchMedia === "function" ? win.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const flag = new URLSearchParams(win.location?.search ?? "").get("motion");
  let current = setting;
  let reduced = false;
  const update = (): void => {
    reduced = resolveReducedMotion(current, query?.matches ?? false, flag);
    win.document.documentElement.dataset.motion = reduced ? "reduce" : "full";
  };
  update();
  query?.addEventListener("change", update);
  return {
    get reduced() {
      return reduced;
    },
    set(next) {
      current = next;
      update();
    },
    dispose() {
      query?.removeEventListener("change", update);
    },
  };
}

// ── DOM helpers ─────────────────────────────────────────────────────────────

/** A new element with a class and optional text. */
export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A button that never takes focus from the key router: tabindex −1, mousedown default blocked. */
export function uiButton(doc: Document, className: string, onPress: (event: MouseEvent) => void): HTMLButtonElement {
  const button = el(doc, "button", "ic-btn " + className);
  button.type = "button";
  button.tabIndex = -1;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!button.disabled) onPress(event);
  });
  return button;
}

/** Sets text only when it changed (HUD parts update every frame). */
export function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Toggles a class only when it changed. */
export function setClass(node: Element, name: string, on: boolean): void {
  if (node.classList.contains(name) !== on) node.classList.toggle(name, on);
}

/** Sets a CSS custom property only when it changed. */
export function setVar(node: HTMLElement, name: string, value: string): void {
  if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
}

/** Shows or hides a node by the `hidden` attribute. */
export function setShown(node: HTMLElement, shown: boolean): void {
  if (node.hidden === shown) node.hidden = !shown;
}

/** Vietnamese number: decimal comma, at most one decimal ("1,5"); thousands with a dot ("1.325"). */
export function viNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const [whole, part] = String(Math.abs(rounded)).split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (rounded < 0 ? "−" : "") + grouped + (part ? "," + part : "");
}

// ── Stand-in icons (vector, no image files at M0a) ──────────────────────────

/** Marks of the wave card (canon §13.3, M0A_PLAN §6.6): wing = flyer, hammer = node capture, crown = general, horn = boss. */
export type CardMark = "wing" | "hammer" | "crown" | "horn";

/** 24 × 24 path data: one silhouette per gait (biped tall, quadruped long and low, flyer, swarm cluster) and per mark. */
export const ICON_PATHS: Readonly<Record<Gait | CardMark, string>> = {
  biped: "M12 2a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM8 9h8l1 7h-2l-1 6h-4l-1-6H7z",
  quadruped: "M3 10h3l2-3h3l1 3h6l2-2h2l-1 4l1 5h-2l-1-3H8l-1 3H5l1-4H3z",
  flyer: "M12 8l3 3l8-4l-5 8h-3l-3 3l-3-3H6L1 7l8 4z",
  swarm: "M5 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM12 4a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM19 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM12 14a3 3 0 1 1 0 6a3 3 0 1 1 0-6z",
  wing: "M2 14c4-1 7-4 9-9c1 4 0 8-3 11c4-1 8-1 14 1c-6 3-13 4-20-3z",
  hammer: "M4 4h10v6H4zM12 10h3l6 10l-3 2l-6-10z",
  crown: "M3 18l-1-11l6 5l4-8l4 8l6-5l-1 11z",
  horn: "M5 21c2-8 2-13 1-18c4 3 7 8 7 14c2-4 3-8 3-12c4 5 4 12 1 16z",
};

const SVG_NS = "http://www.w3.org/2000/svg";

/** An inline SVG icon (currentColor) for a gait or a mark, with an accessible title. */
export function icon(doc: Document, name: Gait | CardMark, title = ""): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "ic-icon");
  svg.setAttribute("aria-hidden", title === "" ? "true" : "false");
  if (title !== "") {
    const label = doc.createElementNS(SVG_NS, "title");
    label.textContent = title;
    svg.append(label);
  }
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICON_PATHS[name]);
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}

/** Keycap text for a key-table event.code ("Backquote" → "`"). */
export function keyCap(code: string): string {
  const named: Readonly<Record<string, string>> = {
    Backquote: "`",
    Equal: "=",
    Minus: "-",
    Enter: "Enter",
    NumpadEnter: "Enter",
    Escape: "Esc",
    Backspace: "⌫",
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
  };
  if (named[code] !== undefined) return named[code]!;
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Key")) return code.slice(3);
  return code;
}
