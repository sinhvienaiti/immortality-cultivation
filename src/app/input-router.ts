// Source: games/dragon-hold/src/app/input-router.ts @06cd4e6 (adapted: canon §5.1 key table, shop mode on Backquote, seat/origin/aim, arrows to `local`, pointer)
/**
 * One key router on window, capture phase (canon §5.1, M0A_PLAN §6.9).
 * Letters (kit typedLetter: IME composing, repeats, Ctrl, Cmd, Alt ignored) go
 * to the open panel; with none, they become `key` commands with `origin` and
 * `aim`, only while the Bàn Quyết is live (wave warning to wave end, boss
 * phase; canon §6.1, D42); otherwise they are dropped.
 * Command keys map by event.code (rules.ts KEYS, remappable in settings) in
 * this order: intercept (menu, focus overlay, 3-2-1) → shop mode toggle (`)
 * → open panel (shop mode, Học trước, Thẻ Ôn: arrows, Enter, =, -, digits,
 * Esc belong to it) → Esc releases a locked word → Backspace → 1/2/3
 * consumables → Enter starts the wave → arrows drive `local` → handlers →
 * fallback (pause menu). Right click on the ground → `move-to`; left click on
 * a beast → `soft-target` (on the ground: clears it).
 * Owner: step 0 / integration (LANES.md).
 */
import { KEYS, quantizeOrigin, type KeyAction } from "../content/rules";
import { ARROW_MASK, type BeastRef, type PointU, type SimCommand } from "../content/types";
import { isComposingKey, typedLetter, vietnameseInputSign } from "../kit/input";
import type { ActionHandler, CommandSink, LocalSink } from "./contracts";

/** A panel that takes keys while open (Học trước, Thẻ Ôn, Thu Hoạch, shop mode). */
export interface KeyPanel {
  readonly isOpen: boolean;
  /** Letters typed into the panel; false drops them (shop mode: no typing to buy, canon §14.3). */
  handleLetter(letter: string): boolean;
  handleAction(action: KeyAction): boolean;
}

/**
 * Shop mode (canon §5.1, D45; Lane 6 ui/shop-mode.ts): ` opens it in prep and
 * breaks; ← → pick the item, ↑ ↓ the slot, Enter buys or places, = upgrades
 * and - sells on a second press, Esc leaves. The player does not walk while it is open.
 */
export interface ShopModePanel extends KeyPanel {
  open(): void;
  close(): void;
}

/** What the pointer is over: a ground point (u) and the beast under it, if any. */
export interface PointerPick {
  readonly ground: PointU | null;
  readonly beast: BeastRef | null;
}

export interface RouterOptions {
  /** This machine's seat. */
  readonly seat: number;
  /** Action → event.code overrides from settings (canon §5.1 "đổi phím"); letters cannot be bound. */
  readonly keymap?: Readonly<Record<string, string>>;
  /** First look at every press (pause menu, focus overlay, 3-2-1); true swallows it. */
  intercept?(event: KeyboardEvent, action: KeyAction | null, letter: string | null): boolean;
  /** The open learning panel or board, if any. */
  panel?(): KeyPanel | null;
  /** The shop mode panel (always the same object). */
  shop?(): ShopModePanel | null;
  /** Shop mode may open now (prep or a break). */
  canShop?(): boolean;
  /** The Bàn Quyết takes letters now (wave warning → wave end, boss phase; not while down). */
  banQuyetLive?(): boolean;
  /** A word is locked: Esc releases it before anything else (D19). */
  locked?(): boolean;
  /** The player's position (u) for `origin`; quantised here to 100 mm. */
  origin(): PointU;
  /** The cursor's ground point (u) for ground skills and thrown phù; null off the field. */
  aim?(): PointU | null;
  /** Enter outside panels: `start` in prep, `continue` in a waiting break, else null. */
  enterCommand?(): SimCommand | null;
  /** Actions nobody claimed (Esc → pause menu). */
  fallback?(action: KeyAction): boolean;
  /** A Vietnamese input method is on (composing keys, accented letters), canon §5.2. */
  onImeSign?(): void;
  /** Wall clock in ms for `key.ms` (learning only); performance.now by default. */
  now?(): number;
  /** Element whose clicks move the player and pick soft targets (the canvas host), and its picker. */
  readonly pointer?: { readonly element: HTMLElement; pick(event: MouseEvent): PointerPick };
}

export interface RouterStats {
  /** Letter presses sent to the sim or a panel. */
  letters: number;
  /** Letter presses dropped (Bàn Quyết not live, no panel). */
  droppedLetters: number;
  /** Command key presses mapped to an action. */
  actions: number;
  /** Presses swallowed by the intercept. */
  swallowed: number;
  /** event.timeStamp of the last letter (ms, performance clock; ic-hitstop-keys). */
  lastLetterAt: number;
}

export interface InputRouter {
  /** Asked in order before the fallback gets an action. */
  readonly handlers: ActionHandler[];
  readonly stats: RouterStats;
  /** Current arrows mask sent to `local` (up 1, down 2, left 4, right 8). */
  readonly arrows: number;
  /** Runs an action as if its key was pressed (pointer buttons, scenarios). */
  dispatch(action: KeyAction): boolean;
  dispose(): void;
}

const ARROWS: Readonly<Partial<Record<KeyAction, number>>> = {
  "arrow-up": ARROW_MASK.up,
  "arrow-down": ARROW_MASK.down,
  "arrow-left": ARROW_MASK.left,
  "arrow-right": ARROW_MASK.right,
};
const ITEMS: Readonly<Partial<Record<KeyAction, number>>> = { "item-1": 0, "item-2": 1, "item-3": 2 };
/** Actions that may repeat while held (panel navigation, Backspace). */
const REPEATING: ReadonlySet<KeyAction> = new Set(["backspace", "arrow-up", "arrow-down", "arrow-left", "arrow-right"]);
const ACTIONS: ReadonlySet<string> = new Set(KEYS.map((binding) => binding.action));

/** event.code → action, with settings overrides: a remapped action leaves its default key free. Letter keys never bind. */
export function bindingsFor(keymap: Readonly<Record<string, string>> = {}): ReadonlyMap<string, KeyAction> {
  const map = new Map<string, KeyAction>();
  const moved = new Set<string>();
  for (const [action, code] of Object.entries(keymap)) {
    if (!ACTIONS.has(action) || code.startsWith("Key")) continue;
    map.set(code, action as KeyAction);
    moved.add(action);
  }
  for (const binding of KEYS) if (!moved.has(binding.action) && !map.has(binding.code)) map.set(binding.code, binding.action);
  return map;
}

export function createInputRouter(target: Window, sinks: { readonly command: CommandSink; readonly local: LocalSink }, options: RouterOptions): InputRouter {
  const handlers: ActionHandler[] = [];
  const stats: RouterStats = { letters: 0, droppedLetters: 0, actions: 0, swallowed: 0, lastLetterAt: 0 };
  const bindings = bindingsFor(options.keymap);
  const now = options.now ?? (() => target.performance.now());
  const seat = options.seat;
  let arrows = 0;

  const setArrows = (mask: number): void => {
    if (mask === arrows) return;
    arrows = mask;
    sinks.local({ type: "arrows", mask });
  };

  const openPanel = (): KeyPanel | null => {
    const shop = options.shop?.() ?? null;
    if (shop?.isOpen) return shop;
    const panel = options.panel?.() ?? null;
    return panel?.isOpen ? panel : null;
  };

  const dispatch = (action: KeyAction): boolean => {
    // The shop key toggles shop mode; the player stops walking while it is open.
    if (action === "shop") {
      const shop = options.shop?.() ?? null;
      if (shop?.isOpen) {
        shop.close();
        return true;
      }
      if (shop && (options.canShop?.() ?? false) && !(options.panel?.()?.isOpen ?? false)) {
        setArrows(0);
        shop.open();
        return true;
      }
      return false;
    }
    const panel = openPanel();
    if (panel) {
      panel.handleAction(action);
      return true;
    }
    if (action === "escape" && (options.locked?.() ?? false)) {
      sinks.command({ type: "release", seat });
      return true;
    }
    if (action === "backspace") {
      sinks.command({ type: "backspace", seat });
      return true;
    }
    const item = ITEMS[action];
    if (item !== undefined) {
      sinks.command({ type: "consumable", seat, slot: item, origin: quantizeOrigin(options.origin()), aim: options.aim?.() ?? null });
      return true;
    }
    if (action === "enter") {
      const command = options.enterCommand?.() ?? null;
      if (command) {
        sinks.command(command);
        return true;
      }
    }
    const bit = ARROWS[action];
    if (bit !== undefined) {
      setArrows(arrows | bit);
      return true;
    }
    for (const handler of handlers) if (handler.handleAction(action)) return true;
    return options.fallback?.(action) ?? false;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey) return; // browser and OS shortcuts
    if (isComposingKey(event)) {
      options.onImeSign?.();
      return;
    }
    const letter = typedLetter(event);
    const bound = letter === null && !event.altKey ? (bindings.get(event.code) ?? null) : null;
    // Đan, phù keys take no modifier (canon §5.1).
    const action = bound !== null && ITEMS[bound] !== undefined && event.shiftKey ? null : bound;
    if (letter === null && action === null && vietnameseInputSign(event)) options.onImeSign?.();
    if (options.intercept?.(event, action, letter)) {
      stats.swallowed += 1;
      event.preventDefault();
      return;
    }
    if (letter !== null) {
      event.preventDefault();
      stats.lastLetterAt = event.timeStamp;
      const panel = openPanel();
      if (panel) {
        stats.letters += 1;
        panel.handleLetter(letter);
      } else if (options.banQuyetLive?.() ?? false) {
        stats.letters += 1;
        sinks.command({
          type: "key",
          seat,
          letter: letter.charCodeAt(0) - 97,
          ms: now(),
          origin: quantizeOrigin(options.origin()),
          aim: options.aim?.() ?? null,
        });
      } else stats.droppedLetters += 1;
      return;
    }
    if (action === null) return;
    // Arrows, Enter, Backspace, `, digits: the page never sees them (scrolling, focus).
    event.preventDefault();
    if (event.repeat && !REPEATING.has(action)) return;
    if (event.repeat && ARROWS[action] !== undefined && openPanel() === null) return; // the mask is already set
    stats.actions += 1;
    dispatch(action);
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    const action = bindings.get(event.code);
    const bit = action === undefined ? undefined : ARROWS[action];
    if (bit !== undefined && (arrows & bit) !== 0) setArrows(arrows & ~bit);
  };

  // A lost focus never leaves the player walking.
  const onBlur = (): void => setArrows(0);

  const pointer = options.pointer;
  const onContextMenu = (event: MouseEvent): void => event.preventDefault();
  const onMouseDown = (event: MouseEvent): void => {
    if (!pointer || (event.button !== 0 && event.button !== 2)) return;
    if (openPanel() !== null) return;
    const pick = pointer.pick(event);
    if (event.button === 2) {
      if (pick.ground) sinks.local({ type: "move-to", point: pick.ground });
      return;
    }
    if (pick.beast) sinks.command({ type: "soft-target", seat, beast: pick.beast });
    else if (pick.ground) sinks.command({ type: "soft-target", seat, beast: null });
  };

  target.addEventListener("keydown", onKeyDown, { capture: true });
  target.addEventListener("keyup", onKeyUp, { capture: true });
  target.addEventListener("blur", onBlur);
  pointer?.element.addEventListener("contextmenu", onContextMenu);
  pointer?.element.addEventListener("mousedown", onMouseDown);
  return {
    handlers,
    stats,
    get arrows() {
      return arrows;
    },
    dispatch,
    dispose(): void {
      target.removeEventListener("keydown", onKeyDown, { capture: true });
      target.removeEventListener("keyup", onKeyUp, { capture: true });
      target.removeEventListener("blur", onBlur);
      pointer?.element.removeEventListener("contextmenu", onContextMenu);
      pointer?.element.removeEventListener("mousedown", onMouseDown);
    },
  };
}
