/**
 * Pause menu (canon §4.1, §5.1, §24): Tiếp tục, Tốc độ gõ (the speed card,
 * Lane 3's pace-card.ts, opened by the app), Giảm chuyển động (theo máy /
 * bật / tắt), Cỡ chữ (100 / 125 / 150 %), Đổi phím (every command key but the
 * letters), Rút lui (a second press within SHOP_MODE.confirmMs; keeps 50 % of
 * the match's Thú Hạch, learning results are never lost). A KeyPanel: ↑ ↓
 * choose, ← → change a value, Enter acts, Esc goes back (closes from the top
 * level); letters are dropped (no typing in the menu). While remapping, the
 * next key press's event.code becomes the action's key (Esc cancels; letter
 * keys never bind, canon §5.1). Settings reach `.settings` through the app's
 * callbacks (storage.ts is the only file that touches storage). The model
 * (`MenuModel`) is pure and tested in node.
 * Owner: Lane 6.
 */
import type { KeyPanel } from "../app/input-router";
import { ACCESS, KEYS, KEYS_UNUSED, SHOP_MODE, type KeyAction } from "../content/rules";
import { el, keyCap, setClass, setShown, setText, uiButton, type MotionSetting, type TextScale } from "./skin";

export type PauseMenu = KeyPanel & { open(): void; close(): void; dispose(): void };

export interface MenuSettings {
  readonly motion: MotionSetting;
  readonly textScale: TextScale;
  /** Action → event.code overrides (canon §5.1 "đổi phím"). */
  readonly keymap: Readonly<Record<string, string>>;
}

export interface MenuCallbacks {
  /** The current settings (read each time the menu draws). */
  settings?(): MenuSettings;
  /** A changed setting (the app saves `.settings` and applies it). */
  onSettings?(patch: Partial<MenuSettings>): void;
  onContinue?(): void;
  onPace?(): void;
  onRetreat?(): void;
}

export type MenuItemId = "continue" | "pace" | "motion" | "text" | "keys" | "retreat";

export const MENU_ITEMS: readonly { readonly id: MenuItemId; readonly label: string }[] = [
  { id: "continue", label: "Tiếp tục" },
  { id: "pace", label: "Tốc độ gõ" },
  { id: "motion", label: "Giảm chuyển động" },
  { id: "text", label: "Cỡ chữ" },
  { id: "keys", label: "Đổi phím" },
  { id: "retreat", label: "Rút lui" },
];

const MOTIONS: readonly MotionSetting[] = ["system", "reduce", "full"];
export const MOTION_LABELS: Readonly<Record<MotionSetting, string>> = { system: "Theo máy", reduce: "Bật", full: "Tắt" };

/** Command actions the player may remap (letters never, canon §5.1), in table order, once each. */
export const REMAPPABLE: readonly KeyAction[] = KEYS.map((binding) => binding.action).filter((action, k, all) => all.indexOf(action) === k);

export const ACTION_LABELS: Readonly<Record<KeyAction, string>> = {
  backspace: "Xóa một chữ",
  escape: "Nhả khóa, đóng bảng, menu",
  enter: "Bắt đầu đợt, trả lời",
  "item-1": "Đan phù 1",
  "item-2": "Đan phù 2",
  "item-3": "Đan phù 3",
  shop: "Chế độ cửa hàng",
  "arrow-up": "Đi lên",
  "arrow-down": "Đi xuống",
  "arrow-left": "Sang trái",
  "arrow-right": "Sang phải",
  upgrade: "Nâng cơ quan",
  sell: "Bán cơ quan",
};

/** The key an action uses now (override or the table's first). */
export function keyFor(action: KeyAction, keymap: Readonly<Record<string, string>>): string {
  return keymap[action] ?? KEYS.find((binding) => binding.action === action)?.code ?? "";
}

/** Whether `code` may become a command key: never a letter (KeyA–KeyZ), a modifier, Esc, or a key the game leaves alone at MVP (Tab, F1–F12, …; canon §5.1). */
export function bindable(code: string): boolean {
  if (code === "" || code === "Escape" || code.startsWith("Key")) return false;
  if (/^(Shift|Control|Alt|Meta|OS)/.test(code)) return false;
  return !(KEYS_UNUSED as readonly string[]).includes(code);
}

const DEFAULTS: MenuSettings = { motion: "system", textScale: 100, keymap: {} };

/** The pause menu's state machine (pure: wall time comes in). */
export class MenuModel {
  isOpen = false;
  cursor = 0;
  /** "main" or the key list; in "keys", `keyCursor` and `remapping`. */
  page: "main" | "keys" = "main";
  keyCursor = 0;
  remapping = false;
  hint = "";
  private retreatUntil = -1;

  constructor(private readonly callbacks: MenuCallbacks = {}) {}

  settings(): MenuSettings {
    return this.callbacks.settings?.() ?? DEFAULTS;
  }

  open(): void {
    this.isOpen = true;
    this.cursor = 0;
    this.page = "main";
    this.remapping = false;
    this.hint = "";
    this.retreatUntil = -1;
  }

  close(): void {
    this.isOpen = false;
    this.remapping = false;
  }

  /** The value shown at the right of an item. */
  valueOf(id: MenuItemId): string {
    const s = this.settings();
    if (id === "motion") return MOTION_LABELS[s.motion];
    if (id === "text") return s.textScale + " %";
    return "";
  }

  /** A key press while remapping: its event.code (true when it was used). */
  bindKey(code: string): boolean {
    if (!this.remapping) return false;
    if (code === "Escape") {
      this.remapping = false;
      this.hint = "";
      return true;
    }
    if (!bindable(code)) {
      this.hint = code.startsWith("Key") ? "Phím chữ chỉ để gõ: chọn phím khác" : "Phím này không dùng được: chọn phím khác";
      return true;
    }
    const action = REMAPPABLE[this.keyCursor]!;
    const keymap = { ...this.settings().keymap, [action]: code };
    this.callbacks.onSettings?.({ keymap });
    this.remapping = false;
    this.hint = ACTION_LABELS[action] + ": " + keyCap(code);
    return true;
  }

  handleAction(action: KeyAction, now: number): boolean {
    if (!this.isOpen) return false;
    if (this.page === "keys") return this.keysAction(action);
    switch (action) {
      case "arrow-up":
        this.cursor = (this.cursor + MENU_ITEMS.length - 1) % MENU_ITEMS.length;
        this.hint = "";
        return true;
      case "arrow-down":
        this.cursor = (this.cursor + 1) % MENU_ITEMS.length;
        this.hint = "";
        return true;
      case "arrow-left":
      case "arrow-right":
        this.change(action === "arrow-right" ? 1 : -1);
        return true;
      case "enter":
        this.activate(now);
        return true;
      case "escape":
        this.close();
        this.callbacks.onContinue?.();
        return true;
      default:
        return true;
    }
  }

  private keysAction(action: KeyAction): boolean {
    switch (action) {
      case "arrow-up":
        this.keyCursor = (this.keyCursor + REMAPPABLE.length - 1) % REMAPPABLE.length;
        return true;
      case "arrow-down":
        this.keyCursor = (this.keyCursor + 1) % REMAPPABLE.length;
        return true;
      case "enter":
        this.remapping = true;
        this.hint = "Bấm phím mới cho " + ACTION_LABELS[REMAPPABLE[this.keyCursor]!] + " (Esc: hủy)";
        return true;
      case "escape":
        this.page = "main";
        this.hint = "";
        return true;
      default:
        return true;
    }
  }

  private change(step: 1 | -1): void {
    const id = MENU_ITEMS[this.cursor]!.id;
    const s = this.settings();
    if (id === "motion") {
      const next = MOTIONS[(MOTIONS.indexOf(s.motion) + step + MOTIONS.length) % MOTIONS.length]!;
      this.callbacks.onSettings?.({ motion: next });
    } else if (id === "text") {
      const scales = ACCESS.textScales;
      const next = scales[(scales.indexOf(s.textScale) + step + scales.length) % scales.length]! as TextScale;
      this.callbacks.onSettings?.({ textScale: next });
    }
  }

  private activate(now: number): void {
    const id = MENU_ITEMS[this.cursor]!.id;
    switch (id) {
      case "continue":
        this.close();
        this.callbacks.onContinue?.();
        return;
      case "pace":
        this.close();
        this.callbacks.onPace?.();
        return;
      case "motion":
      case "text":
        this.change(1);
        return;
      case "keys":
        this.page = "keys";
        this.keyCursor = 0;
        this.hint = "↑ ↓ chọn, Enter đổi, Esc quay lại";
        return;
      case "retreat":
        if (this.retreatUntil >= 0 && now <= this.retreatUntil) {
          this.close();
          this.callbacks.onRetreat?.();
          return;
        }
        this.retreatUntil = now + SHOP_MODE.confirmMs;
        this.hint = "Enter lần nữa để rút lui (giữ 50 % Thú Hạch, kết quả học không mất)";
        return;
    }
  }
}

export interface MenuOptions extends MenuCallbacks {
  /** Wall clock (ms); performance.now by default. */
  readonly now?: () => number;
}

export type PauseMenuPresenter = PauseMenu & { readonly model: MenuModel; /** Key presses while remapping (the app's intercept passes event.code). */ bindKey(code: string): boolean };

/** The pause menu in `host` (#ic-overlay). The app opens it (Esc fallback) and stops the sim while it is open. */
export function createMenu(host: HTMLElement, options: MenuOptions = {}): PauseMenuPresenter {
  const model = new MenuModel(options);
  const now = options.now ?? (() => globalThis.performance?.now() ?? 0);
  const doc = host.ownerDocument;
  const veil = el(doc, "div", "ic-menu-veil");
  veil.hidden = true;
  const panel = el(doc, "section", "ic-panel ic-menu");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Tạm dừng");
  const title = el(doc, "h2", "ic-menu__title", "Tạm dừng");
  const list = el(doc, "div", "ic-menu__list");
  const keys = el(doc, "div", "ic-menu__keys");
  const hint = el(doc, "div", "ic-menu__hint");
  panel.append(title, list, keys, hint);
  veil.append(panel);
  host.append(veil);

  const draw = (): void => {
    setShown(veil, model.isOpen);
    if (!model.isOpen) return;
    const s = model.settings();
    setText(title, model.page === "keys" ? "Đổi phím" : "Tạm dừng");
    setShown(list, model.page === "main");
    setShown(keys, model.page === "keys");
    if (model.page === "main") {
      list.replaceChildren(
        ...MENU_ITEMS.map((item, k) => {
          const button = uiButton(doc, "ic-menu__item" + (k === model.cursor ? " is-cursor" : ""), () => {
            model.cursor = k;
            model.handleAction("enter", now());
            draw();
          });
          button.append(el(doc, "span", "", item.label), el(doc, "span", "ic-menu__value", model.valueOf(item.id)));
          return button;
        }),
      );
    } else {
      keys.replaceChildren(
        ...REMAPPABLE.map((action, k) => {
          const button = uiButton(doc, "ic-menu__item" + (k === model.keyCursor ? " is-cursor" : ""), () => {
            model.keyCursor = k;
            model.handleAction("enter", now());
            draw();
          });
          const code = keyFor(action, s.keymap);
          button.append(el(doc, "span", "", ACTION_LABELS[action]), el(doc, "span", "ic-menu__value", model.remapping && k === model.keyCursor ? "…" : keyCap(code)));
          return button;
        }),
      );
    }
    setText(hint, model.hint);
    setClass(hint, "is-confirm", model.hint.startsWith("Enter lần nữa"));
  };

  return {
    model,
    get isOpen() {
      return model.isOpen;
    },
    open(): void {
      model.open();
      draw();
    },
    close(): void {
      model.close();
      draw();
    },
    handleLetter(): boolean {
      return false;
    },
    handleAction(action: KeyAction): boolean {
      const used = model.handleAction(action, now());
      draw();
      return used;
    },
    bindKey(code: string): boolean {
      const used = model.bindKey(code);
      if (used) draw();
      return used;
    },
    dispose(): void {
      veil.remove();
    },
  };
}
