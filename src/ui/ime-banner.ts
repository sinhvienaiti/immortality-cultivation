/**
 * IME banner (canon §5.2): a Vietnamese input method is on (Unikey or EVKey
 * in Telex or VNI, the system's Vietnamese input on a Mac): a clear strip that
 * says how to switch to English typing. The input router calls `show` on its
 * IME sign (composing keys, Process/229, accented letters); a click or `hide`
 * closes it. It never changes difficulty and never takes keys.
 * Owner: Lane 3.
 */
import { installStyle, node } from "./learning-frame";

export interface ImeBanner {
  show(): void;
  hide(): void;
  readonly shown: boolean;
  dispose(): void;
}

export type ImePlatform = "mac" | "other";

/** The banner's lines for a platform (pure). */
export function imeHint(platform: ImePlatform): { readonly title: string; readonly how: string } {
  return {
    title: "Bộ gõ tiếng Việt đang bật: chữ gõ vào không thành phím chữ cái.",
    how:
      platform === "mac"
        ? "Chuyển nguồn nhập sang ABC (Control + Space, hoặc biểu tượng trên thanh menu) rồi gõ tiếp."
        : "Chuyển Unikey hoặc EVKey sang E (Ctrl + Shift, hoặc bấm biểu tượng V ở khay hệ thống) rồi gõ tiếp.",
  };
}

const STYLE_ID = "ic-ime-style";
const CSS = `
.ic-ime {
  position: fixed; left: 50%; top: calc(12px * var(--ui, 1)); translate: -50% 0; z-index: 70; box-sizing: border-box;
  max-width: min(92vw, calc(760px * var(--ui, 1))); padding: calc(8px * var(--ui, 1)) calc(14px * var(--ui, 1));
  display: grid; gap: 2px; background: rgba(255, 176, 32, 0.96); color: #1E1405; border-radius: calc(8px * var(--ui, 1));
  font-family: var(--kit-font-battle); font-size: max(13px, calc(15px * var(--ui, 1))); pointer-events: auto; cursor: pointer;
}
.ic-ime[hidden] { display: none; }
.ic-ime__title { font-weight: 800; }
`;

export function createImeBanner(host: HTMLElement): ImeBanner {
  const doc = host.ownerDocument;
  installStyle(doc, STYLE_ID, CSS);
  const platform: ImePlatform = /Mac|iPhone|iPad/.test(doc.defaultView?.navigator.platform ?? "") ? "mac" : "other";
  const text = imeHint(platform);
  const root = node(doc, "div", "ic-ime");
  root.hidden = true;
  root.setAttribute("role", "alert");
  root.title = "Bấm để ẩn";
  root.append(node(doc, "div", "ic-ime__title", text.title), node(doc, "div", "ic-ime__how", text.how));
  host.append(root);
  root.addEventListener("click", () => {
    root.hidden = true;
  });
  return {
    show(): void {
      root.hidden = false;
    },
    hide(): void {
      root.hidden = true;
    },
    get shown() {
      return !root.hidden;
    },
    dispose(): void {
      root.remove();
    },
  };
}
