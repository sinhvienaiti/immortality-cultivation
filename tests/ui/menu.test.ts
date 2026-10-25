import { describe, expect, it } from "vitest";
import { bindingsFor } from "../../src/app/input-router";
import { ACCESS, KEYS, SHOP_MODE } from "../../src/content/rules";
import { ACTION_LABELS, bindable, keyFor, MENU_ITEMS, MenuModel, REMAPPABLE, type MenuSettings } from "../../src/ui/menu";
import { keyCap, resolveReducedMotion, textScaleFactor, viNumber } from "../../src/ui/skin";

/** canon §4.1, §5.1, §24, M0A_PLAN §6.6 items 6–7: the pause menu, key remapping and reduced motion. */

function setup(start: Partial<MenuSettings> = {}) {
  let settings: MenuSettings = { motion: "system", textScale: 100, keymap: {}, ...start };
  const calls: string[] = [];
  const model = new MenuModel({
    settings: () => settings,
    onSettings: (patch) => {
      settings = { ...settings, ...patch };
      calls.push("settings");
    },
    onContinue: () => calls.push("continue"),
    onPace: () => calls.push("pace"),
    onRetreat: () => calls.push("retreat"),
  });
  return { model, calls, settings: () => settings };
}

const cursorOn = (model: MenuModel, id: string): void => {
  model.cursor = MENU_ITEMS.findIndex((item) => item.id === id);
};

describe("the pause menu", () => {
  it("lists Tiếp tục, Tốc độ gõ, Giảm chuyển động, Cỡ chữ, Đổi phím, Rút lui (M0A_PLAN §6.6)", () => {
    expect(MENU_ITEMS.map((item) => item.label)).toEqual(["Tiếp tục", "Tốc độ gõ", "Giảm chuyển động", "Cỡ chữ", "Đổi phím", "Rút lui"]);
  });

  it("moves with ↑ ↓ (wrapping), continues on Enter or Esc, opens the speed card", () => {
    const t = setup();
    t.model.open();
    t.model.handleAction("arrow-up", 0);
    expect(t.model.cursor).toBe(MENU_ITEMS.length - 1);
    t.model.handleAction("arrow-down", 0);
    expect(t.model.cursor).toBe(0);
    t.model.handleAction("enter", 0);
    expect(t.calls).toEqual(["continue"]);
    expect(t.model.isOpen).toBe(false);
    t.model.open();
    t.model.handleAction("escape", 0);
    expect(t.calls).toEqual(["continue", "continue"]);
    t.model.open();
    cursorOn(t.model, "pace");
    t.model.handleAction("enter", 0);
    expect(t.calls.at(-1)).toBe("pace");
    // Closed, it takes nothing.
    expect(t.model.handleAction("enter", 0)).toBe(false);
  });

  it("cycles reduced motion (theo máy, bật, tắt) and the text size 100 / 125 / 150 % with ← →", () => {
    const t = setup();
    t.model.open();
    cursorOn(t.model, "motion");
    t.model.handleAction("arrow-right", 0);
    expect(t.settings().motion).toBe("reduce");
    t.model.handleAction("arrow-right", 0);
    expect(t.settings().motion).toBe("full");
    t.model.handleAction("arrow-left", 0);
    expect(t.settings().motion).toBe("reduce");
    expect(t.model.valueOf("motion")).toBe("Bật");
    cursorOn(t.model, "text");
    const seen: number[] = [];
    for (let k = 0; k < 3; k += 1) {
      t.model.handleAction("arrow-right", 0);
      seen.push(t.settings().textScale);
    }
    expect(seen).toEqual([125, 150, 100]);
    expect(ACCESS.textScales).toEqual([100, 125, 150]);
  });

  it("retreats only on a second Enter within the window (keeps 50 % Thú Hạch, learning never lost)", () => {
    const t = setup();
    t.model.open();
    cursorOn(t.model, "retreat");
    t.model.handleAction("enter", 1000);
    expect(t.calls).toEqual([]);
    expect(t.model.hint).toContain("Enter lần nữa");
    t.model.handleAction("enter", 1000 + SHOP_MODE.confirmMs + 1);
    expect(t.calls).toEqual([]);
    t.model.handleAction("enter", 1000 + SHOP_MODE.confirmMs + 2);
    expect(t.calls).toEqual(["retreat"]);
    expect(t.model.isOpen).toBe(false);
  });
});

describe("Đổi phím (canon §5.1: every command key but the letters)", () => {
  it("offers each command action once, in the table's order", () => {
    expect(REMAPPABLE).toEqual([...new Set(KEYS.map((binding) => binding.action))]);
    for (const action of REMAPPABLE) expect(ACTION_LABELS[action]).toBeTruthy();
  });

  it("binds the next key; never a letter, a modifier, Esc or a key the game leaves alone (Tab, F1–F12, …)", () => {
    expect(bindable("KeyA")).toBe(false);
    expect(bindable("ShiftLeft")).toBe(false);
    expect(bindable("Escape")).toBe(false);
    expect(bindable("Tab")).toBe(false);
    expect(bindable("F5")).toBe(false);
    expect(bindable("Semicolon")).toBe(true);
    expect(bindable("Digit4")).toBe(true);
    const t = setup();
    t.model.open();
    cursorOn(t.model, "keys");
    t.model.handleAction("enter", 0);
    expect(t.model.page).toBe("keys");
    t.model.keyCursor = REMAPPABLE.indexOf("shop");
    t.model.handleAction("enter", 0);
    expect(t.model.remapping).toBe(true);
    expect(t.model.bindKey("KeyQ")).toBe(true);
    expect(t.model.remapping).toBe(true);
    expect(t.model.hint).toContain("Phím chữ");
    t.model.bindKey("Semicolon");
    expect(t.model.remapping).toBe(false);
    expect(t.settings().keymap).toEqual({ shop: "Semicolon" });
    expect(keyFor("shop", t.settings().keymap)).toBe("Semicolon");
    expect(keyFor("upgrade", t.settings().keymap)).toBe("Equal");
    // The router then sends Semicolon to shop mode and frees Backquote.
    const bindings = bindingsFor(t.settings().keymap);
    expect(bindings.get("Semicolon")).toBe("shop");
    expect(bindings.has("Backquote")).toBe(false);
    // Esc while remapping cancels; Esc on the key page goes back.
    t.model.handleAction("enter", 0);
    t.model.bindKey("Escape");
    expect(t.model.remapping).toBe(false);
    t.model.handleAction("escape", 0);
    expect(t.model.page).toBe("main");
    expect(t.model.isOpen).toBe(true);
  });

  it("names key caps the way the canon writes them", () => {
    expect(keyCap("Backquote")).toBe("`");
    expect(keyCap("Equal")).toBe("=");
    expect(keyCap("Minus")).toBe("-");
    expect(keyCap("Digit2")).toBe("2");
    expect(keyCap("ArrowUp")).toBe("↑");
  });
});

describe("reduced motion and text scale (canon §24)", () => {
  it("?motion= wins over the setting, the setting over the system query", () => {
    expect(resolveReducedMotion("system", true)).toBe(true);
    expect(resolveReducedMotion("system", false)).toBe(false);
    expect(resolveReducedMotion("full", true)).toBe(false);
    expect(resolveReducedMotion("reduce", false)).toBe(true);
    expect(resolveReducedMotion("reduce", true, "full")).toBe(false);
    expect(resolveReducedMotion("full", false, "reduce")).toBe(true);
    expect(resolveReducedMotion("full", false, "nonsense")).toBe(false);
  });

  it("scales text 100 / 125 / 150 % only; numbers in Vietnamese", () => {
    expect([100, 125, 150, 175].map(textScaleFactor)).toEqual([1, 1.25, 1.5, 1]);
    expect(viNumber(1325)).toBe("1.325");
    expect(viNumber(1.5)).toBe("1,5");
    expect(viNumber(-2)).toBe("−2");
    expect(viNumber(0)).toBe("0");
  });
});
