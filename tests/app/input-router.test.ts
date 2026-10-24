import { describe, expect, it } from "vitest";
import { bindingsFor, createInputRouter, type KeyPanel, type RouterOptions, type ShopModePanel } from "../../src/app/input-router";
import type { LocalInput, SimCommand } from "../../src/content/types";

/** canon §5.1, D45, M0A_PLAN §6.9: the key router's order, shop mode on `, arrows to `local`. */

type Listener = (event: unknown) => void;

function fakeWindow() {
  const listeners = new Map<string, Listener[]>();
  return {
    performance: { now: () => 1234 },
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== listener));
    },
    fire(type: string, event: unknown) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
  };
}

function key(code: string, keyText: string, extra: Record<string, unknown> = {}) {
  return { code, key: keyText, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, keyCode: 0, timeStamp: 50, preventDefault() {}, ...extra };
}

function setup(options: Partial<RouterOptions> = {}) {
  const win = fakeWindow();
  const commands: SimCommand[] = [];
  const locals: LocalInput[] = [];
  const shopActions: string[] = [];
  let shopOpen = false;
  const shop: ShopModePanel = {
    get isOpen() {
      return shopOpen;
    },
    open: () => (shopOpen = true),
    close: () => (shopOpen = false),
    handleLetter: () => false,
    handleAction: (action) => {
      shopActions.push(action);
      if (action === "escape") shopOpen = false;
      return true;
    },
  };
  let live = true;
  let canShop = false;
  const router = createInputRouter(win as unknown as Window, { command: (c) => commands.push(c), local: (l) => locals.push(l) }, {
    seat: 0,
    origin: () => ({ x: 6100, z: -2900 }),
    aim: () => ({ x: 60_000, z: 0 }),
    banQuyetLive: () => live,
    shop: () => shop,
    canShop: () => canShop,
    ...options,
  });
  return {
    win,
    router,
    commands,
    locals,
    shopActions,
    get shopOpen() {
      return shopOpen;
    },
    setLive: (value: boolean) => (live = value),
    setCanShop: (value: boolean) => (canShop = value),
    down: (code: string, text: string, extra?: Record<string, unknown>) => win.fire("keydown", key(code, text, extra)),
    up: (code: string, text: string) => win.fire("keyup", key(code, text)),
  };
}

describe("input router", () => {
  it("turns letters into key commands with seat, quantised origin and aim while the Bàn Quyết is live", () => {
    const t = setup();
    t.down("KeyC", "c");
    // (6 100; −2 900) u rounds to the 6 000 u grid as (6 000; 0), never −0.
    expect(t.commands).toEqual([{ type: "key", seat: 0, letter: 2, ms: 1234, origin: { x: 6000, z: 0 }, aim: { x: 60_000, z: 0 } }]);
  });

  it("drops letters when the Bàn Quyết is not live and no panel is open (canon §6.1, D42)", () => {
    const t = setup();
    t.setLive(false);
    t.down("KeyA", "a");
    expect(t.commands).toEqual([]);
    expect(t.router.stats.droppedLetters).toBe(1);
  });

  it("gives letters and keys to an open panel first", () => {
    const letters: string[] = [];
    const actions: string[] = [];
    const panel: KeyPanel = { isOpen: true, handleLetter: (l) => (letters.push(l), true), handleAction: (a) => (actions.push(a), true) };
    const t = setup({ panel: () => panel });
    t.down("KeyB", "b");
    t.down("Digit2", "2");
    t.down("Enter", "Enter");
    expect(letters).toEqual(["b"]);
    expect(actions).toEqual(["item-2", "enter"]);
    expect(t.commands).toEqual([]);
  });

  it("opens shop mode with ` only in prep and breaks; arrows, Enter, =, - and Esc belong to it", () => {
    const t = setup();
    t.down("Backquote", "`");
    expect(t.shopOpen).toBe(false);
    t.setCanShop(true);
    t.down("ArrowLeft", "ArrowLeft");
    expect(t.locals).toEqual([{ type: "arrows", mask: 4 }]);
    t.down("Backquote", "`");
    expect(t.shopOpen).toBe(true);
    // Opening shop mode stops the walk.
    expect(t.locals.at(-1)).toEqual({ type: "arrows", mask: 0 });
    t.down("ArrowRight", "ArrowRight");
    t.down("ArrowUp", "ArrowUp");
    t.down("Enter", "Enter");
    t.down("Equal", "=");
    t.down("Minus", "-");
    t.down("Escape", "Escape");
    expect(t.shopActions).toEqual(["arrow-right", "arrow-up", "enter", "upgrade", "sell", "escape"]);
    expect(t.shopOpen).toBe(false);
    expect(t.locals).toHaveLength(2);
    expect(t.commands).toEqual([]);
    t.down("Backquote", "`");
    t.down("Backquote", "`");
    expect(t.shopOpen).toBe(false);
  });

  it("drives local arrows by mask; release and blur stop", () => {
    const t = setup();
    t.down("ArrowUp", "ArrowUp");
    t.down("ArrowRight", "ArrowRight");
    t.down("ArrowRight", "ArrowRight", { repeat: true });
    t.up("ArrowUp", "ArrowUp");
    t.win.fire("blur", {});
    expect(t.locals.map((input) => (input.type === "arrows" ? input.mask : -1))).toEqual([1, 9, 8, 0]);
  });

  it("Esc releases a locked word, else goes to the fallback; Backspace always to the sim", () => {
    let locked = true;
    const fallback: string[] = [];
    const t = setup({ locked: () => locked, fallback: (a) => (fallback.push(a), true) });
    t.down("Escape", "Escape");
    locked = false;
    t.down("Escape", "Escape");
    t.down("Backspace", "Backspace");
    expect(t.commands).toEqual([{ type: "release", seat: 0 }, { type: "backspace", seat: 0 }]);
    expect(fallback).toEqual(["escape"]);
  });

  it("1/2/3 use đan phù (no modifier); Enter sends the app's command", () => {
    const t = setup({ enterCommand: () => ({ type: "start" }) });
    t.down("Digit1", "1");
    t.down("Digit3", "#", { shiftKey: true });
    t.down("Enter", "Enter");
    expect(t.commands).toEqual([{ type: "consumable", seat: 0, slot: 0, origin: { x: 6000, z: 0 }, aim: { x: 60_000, z: 0 } }, { type: "start" }]);
  });

  it("ignores Ctrl/Cmd presses and reports input-method composing", () => {
    let ime = 0;
    const t = setup({ onImeSign: () => (ime += 1) });
    t.down("KeyA", "a", { ctrlKey: true });
    t.down("KeyA", "Process", { isComposing: true });
    t.down("KeyO", "ô");
    expect(t.commands).toEqual([]);
    expect(ime).toBe(2);
  });

  it("remaps command keys from settings; letters never bind", () => {
    const map = bindingsFor({ shop: "Backslash", item1: "KeyQ", "item-1": "KeyQ" });
    expect(map.get("Backslash")).toBe("shop");
    expect(map.get("Backquote")).toBeUndefined();
    expect(map.get("KeyQ")).toBeUndefined();
    expect(map.get("Digit1")).toBe("item-1");
  });
});
