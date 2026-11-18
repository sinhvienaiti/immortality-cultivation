/**
 * Bàn Quyết (canon §6, §21.1, §24): the DOM bar in #ic-quyet, outside the
 * canvas: 5 slots + the Ấn and Tẩy places + 3 đan phù cells (counts and
 * cooldown only, no word); words 28–32 px (Be Vietnam Pro 700, × text
 * scale), the next locked letter underlined, correct letters in gold, a
 * cooldown ring, the next word dim at 50 % while a slot cools down, the skill
 * name apart from the word, the `held` state ("chờ đích"), an element rim
 * (lit when the target is countered; M0a beasts have no element); the whole
 * bar dims when it is not live. Ticket 400 adds presentation-only letter
 * lifecycles; ticket 406 gives departing glyphs a protected canvas overlay.
 * The view model (`banQuyetView`) is pure and tested in node.
 * Owner: Lane 3.
 */
import type { FrameInfo, Presenter } from "../app/contracts";
import { CONSUMABLES, SIM, SLOT3_DASH_COOLDOWN_MS, SLOTS } from "../content/rules";
import type { GlossOf } from "../app/learning";
import type { ConsumableId, LiveWord, SimEvent, SlotId, World } from "../content/types";
import { isBanQuyetLive, shownWord, slotEntry } from "../sim/words";
import { WordFx, WORD_FX, wordMotionReduced } from "./word-fx";
import { WORD_FX_CSS } from "./styles/word-fx-css";
import { WordFxEvents, type WordSignal } from "./word-fx-events";
import { createWordFlight } from "./word-flight";
import type { Rect } from "./screen-zones";

// ── View model (pure) ───────────────────────────────────────────────────────

export type CellState = "ready" | "typing" | "held" | "cooldown" | "waiting" | "dim" | "empty" | "ultimate-ready";

export interface WordCellView {
  /** "slot-1" … "slot-5", "seal-0", "seal-1", "cleanse". */
  readonly key: string;
  /** Skill name, "Ấn" or "Tẩy" (kept apart from the word). */
  readonly label: string;
  /** The live word, or the dim preview while the slot cools down ("" none). */
  readonly text: string;
  readonly typed: number;
  readonly errors: number;
  readonly state: CellState;
  /** The dim 50 % next word (not a live word: no first letter, canon §6.2). */
  readonly preview: boolean;
  /** Ring: share of the cooldown still to run, 0–1 (ô 5: Chân Nguyên still missing). */
  readonly cool: number;
  /** A new word's first meeting (badge "MỚI"). */
  readonly fresh: boolean;
  /** Small line under the word: "Chờ đích" (held), "Đang chờ chỗ" (over the cap), ô 5's Chân Nguyên. */
  readonly note: string;
}

export interface ItemCellView {
  /** "item-1" … "item-3" (keys 1/2/3). */
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly cool: number;
  readonly empty: boolean;
}

export interface BanQuyetView {
  /** Letters reach the bar now (wave warning → wave end, boss phase, not while down; D42). */
  readonly live: boolean;
  readonly slots: readonly WordCellView[];
  readonly extras: readonly WordCellView[];
  readonly items: readonly ItemCellView[];
  /** Chân Nguyên 0–100. */
  readonly chanNguyen: number;
}

/** canon §12.1 names, used until Lane 4's school data names them. */
const SLOT_NAMES: Readonly<Record<SlotId, string>> = { 1: "Strike", 2: "Pierce", 3: "Ward", 4: "Sword field", 5: "Ultimate" };
const ITEM_NAMES: Readonly<Record<ConsumableId, string>> = { "hoi-xuan-dan": "Healing pill", "kim-than-phu": "Iron ward", "loi-hoa-phu": "Thunder talisman" };

const ticksOf = (ms: number): number => Math.round((ms * SIM.tickHz) / 1000);
const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

export function slotLabel(world: World, seat: number, slot: SlotId): string {
  return slot === 3 && world.seats[seat]?.loadout.guard === "dash" ? "Dash" : SLOT_NAMES[slot];
}

function cooldownTicks(world: World, seat: number, slot: SlotId): number {
  const ms = slot === 3 && world.seats[seat]?.loadout.guard === "dash" ? SLOT3_DASH_COOLDOWN_MS : SLOTS[slot].cooldownMs;
  return Math.max(1, ticksOf(ms));
}

function cellOf(world: World, seat: number, entry: LiveWord | null, key: string, label: string, live: boolean, gloss?: GlossOf): WordCellView {
  if (entry === null) return { key, label, text: "", typed: 0, errors: 0, state: "empty", preview: false, cool: 0, fresh: false, note: "" };
  const isLive = entry.kitSlot >= 0;
  const word = shownWord(world, entry);
  const preview = !isLive && entry.state === "cooldown" && word !== null;
  const ultimate = entry.kind === "slot" && entry.slot === 5;
  const chanPm = world.seats[seat]?.chanNguyenPm ?? 0;
  let cool = 0;
  if (ultimate) cool = 1 - clamp01(chanPm / 100_000);
  else if (entry.kind === "slot" && entry.state === "cooldown" && entry.until > world.tick) cool = clamp01((entry.until - world.tick) / cooldownTicks(world, seat, entry.slot!));
  const prepared = ultimate && !!world.casts.prepared?.[seat];
  const state: CellState = prepared ? "ultimate-ready" : !live ? (entry.state === "held" ? "held" : "dim") : entry.state;
  const meaning = entry.state === "typing" && entry.hint ? gloss?.(entry.wordId)?.vi ?? "" : "";
  const note = prepared ? "Ultimate ready · Space" : state === "held" ? "Waiting for target" : state === "waiting" ? "Waiting for slot" : meaning || (ultimate && !isLive ? "Energy " + Math.floor(chanPm / 1000) + "/100" : "");
  return {
    key,
    label,
    text: word?.text ?? "",
    typed: isLive ? entry.typed : 0,
    errors: isLive ? entry.errors : 0,
    state,
    preview,
    cool,
    fresh: isLive && entry.group === "new",
    note,
  };
}

/** What the bar shows for `seat` now (pure: reads the world, writes nothing). */
export function banQuyetView(world: World, seat: number, gloss?: GlossOf): BanQuyetView {
  const live = isBanQuyetLive(world, seat) && world.words.awake?.[seat] !== false;
  const slots = ([1, 2, 3, 4, 5] as const).map((slot) => cellOf(world, seat, slotEntry(world, seat, slot), "slot-" + slot, slotLabel(world, seat, slot), live, gloss));
  const words = world.words.seats[seat];
  const extras: WordCellView[] = [];
  (words?.seals ?? []).forEach((index, k) => extras.push(cellOf(world, seat, world.words.live[index] ?? null, "seal-" + k, "Seal", live, gloss)));
  if (words !== undefined && words.cleanse >= 0) extras.push(cellOf(world, seat, world.words.live[words.cleanse] ?? null, "cleanse", "Cleanse", live, gloss));
  const store = world.consumables?.seats?.[seat];
  const coolTicks = ticksOf(CONSUMABLES.cooldownMs);
  const coolLeft = store !== undefined && store.cooldownUntil > world.tick ? clamp01((store.cooldownUntil - world.tick) / coolTicks) : 0;
  const items: ItemCellView[] = [0, 1, 2].map((k) => {
    const held = store?.slots[k];
    const item = held?.item ?? null;
    return {
      key: "item-" + (k + 1),
      label: item === null ? "" : ITEM_NAMES[item],
      count: held?.count ?? 0,
      cool: item === null ? 0 : coolLeft,
      empty: item === null || (held?.count ?? 0) <= 0,
    };
  });
  return { live, slots, extras, items, chanNguyen: Math.floor((world.seats[seat]?.chanNguyenPm ?? 0) / 1000) };
}

/** A cell's text split for drawing: typed letters, the first letter still to type (underlined while nothing is typed), the rest. */
export function wordParts(text: string, typed: number): { readonly done: string; readonly first: string; readonly rest: string } {
  const n = Math.max(0, Math.min(typed, text.length));
  if (n > 0) return { done: text.slice(0, n), first: "", rest: text.slice(n) };
  return { done: "", first: text.slice(0, 1), rest: text.slice(1) };
}

// ── Styles ─────────────────────────────────────────────────────────────────

const STYLE_ID = "ic-ban-quyet-style";
const CSS = `
.ic-bq {
  position: fixed; left: 8px; right: 8px; bottom: 6px; z-index: 45;
  display: grid; grid-template-columns: repeat(var(--ic-word-count, 5), minmax(0, 1fr)) 90px; align-items: stretch; gap: 4px; box-sizing: border-box;
  min-height: 78px; padding: 4px;
  background: rgba(14, 18, 24, 0.86); border: 1.5px solid rgba(242, 235, 221, 0.18); border-radius: calc(12px * var(--ui, 1));
  color: #F2EBDD; font-family: "Be Vietnam Pro", "Segoe UI", system-ui, sans-serif;
  transform: none; animation: none; filter: none; pointer-events: auto;
}
.ic-bq.is-dim .ic-bq__cell:not(.ic-bq__item) { opacity: 0.42; }
.ic-bq__words, .ic-bq__extras { display: contents; }
.ic-bq__items { display: flex; gap: 2px; min-width: 0; }
.ic-bq__extras:empty { display: none; }
.ic-bq__items { padding-left: 2px; border-left: 1px solid rgba(242, 235, 221, 0.16); }
.ic-bq__cell {
  position: relative; min-width: 0; padding: 3px 2px;
  display: grid; justify-items: center; align-content: center; gap: 2px; box-sizing: border-box;
  border: 1.5px solid rgba(242, 235, 221, 0.22); border-radius: calc(9px * var(--ui, 1)); background: rgba(242, 235, 221, 0.04);
}
.ic-bq__cell.is-seal { border-color: rgba(255, 176, 32, 0.7); }
.ic-bq__cell.is-cleanse { border-color: rgba(255, 176, 32, 0.95); }
.ic-bq__cell.is-counter { box-shadow: 0 0 0 2px rgba(127, 245, 224, 0.75) inset; }
.ic-bq__cell.is-typing { border-color: #7FF5E0; }
.ic-bq__name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; font-size: max(11px, calc(12px * var(--ui, 1))); font-weight: 700; letter-spacing: 0.03em; color: #CFC6B3; white-space: nowrap; }
.ic-bq__word {
  /* canon §24: 28–32 px at any screen size, × the text-scale setting (100 / 125 / 150 %). */
  font-size: calc(clamp(28px, 30px * var(--ui, 1), 32px) * var(--ic-text-scale, 1)); font-weight: 700; line-height: 1.1; letter-spacing: 0.02em;
  min-height: 1.1em; white-space: nowrap;
}
.ic-bq__word .done { color: #7FF5E0; }
.ic-bq__word .first { text-decoration: underline; text-decoration-thickness: 3px; text-underline-offset: 4px; }
.ic-bq__cell.is-preview .ic-bq__word { opacity: 0.5; }
.ic-bq__cell.is-preview .ic-bq__word .first { text-decoration: none; }
.ic-bq__cell.is-held .ic-bq__word { opacity: 0.6; }
.ic-bq__note { max-width: 100%; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; font-size: max(11px, calc(12px * var(--ui, 1))); color: #CFC6B3; min-height: 1.2em; white-space: nowrap; }
.ic-bq__note:empty { visibility: hidden; }
.ic-bq__badge { position: absolute; right: 3px; top: 3px; font-size: 10px; font-weight: 800; padding: 0 4px; border-radius: 3px; background: #E9F7D4; color: #1F3A12; }
.ic-bq__badge[hidden] { display: none; }
.ic-bq__ring {
  position: absolute; right: 6px; bottom: 6px; width: calc(14px * var(--ui, 1)); height: calc(14px * var(--ui, 1)); border-radius: 50%;
  background: conic-gradient(rgba(242, 235, 221, 0.75) calc(var(--cool, 0) * 360deg), rgba(242, 235, 221, 0.12) 0);
}
.ic-bq__ring[hidden] { display: none; }
.ic-bq__item { flex: 1; min-width: 0; }
.ic-bq__item .ic-bq__name { font-size: 0; }
.ic-bq__item .ic-bq__note { display: none; }
.ic-bq__cell.is-ultimate-ready { border-color: #7FF5E0; }
.ic-bq__item .ic-bq__word { font-size: calc(20px * var(--ui, 1)); }
.ic-bq__item.is-empty { opacity: 0.4; }
.ic-bq__key { font-size: max(11px, calc(12px * var(--ui, 1))); font-weight: 800; color: #F2EBDD; border: 1px solid rgba(242, 235, 221, 0.5); border-radius: 3px; padding: 0 4px; }
`;

function installStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS + WORD_FX_CSS;
  doc.head.append(style);
}

// ── The bar ────────────────────────────────────────────────────────────────

interface CellNodes {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly word: HTMLElement;
  readonly note: HTMLElement;
  readonly ring: HTMLElement;
  readonly badge: HTMLElement;
  readonly fx: WordFx;
  readonly letters: HTMLElement[];
  readonly motes: HTMLElement[];
  generation: number;
  lastAction: number;
  key: string;
}

function makeCell(doc: Document, extraClass = ""): CellNodes {
  const root = doc.createElement("div");
  root.className = "ic-bq__cell" + extraClass;
  const ring = doc.createElement("i");
  ring.className = "ic-bq__ring";
  ring.hidden = true;
  const badge = doc.createElement("span");
  badge.className = "ic-bq__badge";
  badge.textContent = "NEW";
  badge.hidden = true;
  const name = doc.createElement("span");
  name.className = "ic-bq__name";
  const word = doc.createElement("span");
  word.className = "ic-bq__word";
  const note = doc.createElement("span");
  note.className = "ic-bq__note";
  root.append(ring, badge, name, word, note);
  return { root, name, word, note, ring, badge, key: "", fx: new WordFx(), letters: [], motes: [], generation: 0, lastAction: -1 };
}

function drawWord(doc: Document, nodes: CellNodes, now: number, reduced: boolean, flight: ReturnType<typeof createWordFlight>): void {
  const fx = nodes.fx;
  if (nodes.word.getAttribute("aria-label") !== fx.text) {
    nodes.word.setAttribute("aria-label", fx.text);
    nodes.letters.length = 0;
    for (const letter of fx.text) {
      const glyph = doc.createElement("span");
      glyph.className = "ic-bq__letter";
      glyph.textContent = letter;
      glyph.dataset.letter = letter;
      glyph.setAttribute("aria-hidden", "true");
      nodes.letters.push(glyph);
    }
    nodes.word.replaceChildren(...nodes.letters);
  }
  if (nodes.motes.length === 0) {
    for (let i = 0; i < WORD_FX.motes; i += 1) {
      const mote = doc.createElement("i");
      mote.className = "ic-bq__mote";
      mote.setAttribute("aria-hidden", "true");
      nodes.motes.push(mote);
      nodes.root.append(mote);
    }
  }
  const leaving = fx.leaving(now);
  nodes.root.dataset.wordPhase = fx.phase(now);
  setStyle(nodes.word, "--word-flash", String(reduced ? 0 : fx.flash(now)));
  setStyle(nodes.root, "--word-error", String(fx.error(now)));
  const shake = fx.shake(now, reduced);
  setStyle(nodes.root, "transform", shake === 0 ? "none" : `translateX(${shake}px)`);
  nodes.letters.forEach((glyph, i) => {
    glyph.classList.toggle("is-done", i < fx.typed);
    glyph.classList.toggle("is-lead", i === 0 && fx.typed === 0 && !fx.preview);
    glyph.classList.toggle("is-next", fx.locked && i === fx.typed && !fx.preview && !leaving);
    const style = fx.letter(i, now, reduced);
    setStyle(glyph, "--word-key-glow", String(fx.keyGlow(i, now, reduced)));
    setStyle(glyph, "opacity", String(style.opacity));
    setStyle(glyph, "transform", style.transform);
  });
  if (fx.phase(now) === "flash") flight.capture(fx, nodes.word, nodes.letters);
  const onCanvas = fx.phase(now) === "depart" && !reduced && flight.has(fx);
  setStyle(nodes.word, "opacity", onCanvas ? "0" : "");
  nodes.motes.forEach((mote, i) => {
    const style = fx.mote(i, now, reduced);
    setStyle(mote, "opacity", String(flight.has(fx) ? 0 : style.opacity));
    setStyle(mote, "transform", style.transform);
  });
}

function setStyle(node: HTMLElement, name: string, value: string): void {
  if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
}

function drawCell(doc: Document, nodes: CellNodes, view: WordCellView, now: number, reduced: boolean, signals: readonly WordSignal[], flight: ReturnType<typeof createWordFlight>): void {
  nodes.root.dataset.wordKey = view.key;
  // Resolved casts are consumed before show(): a zero-cooldown replacement cannot erase the old word.
  for (const signal of signals) if (signal.key === view.key && signal.kind === "finish" && signal.action !== nodes.lastAction) {
    nodes.lastAction = signal.action;
    nodes.fx.finish(signal.text, view.key === "slot-3" || view.key === "cleanse" ? "defence" : "attack", now);
  }
  nodes.fx.show(view.text, String(nodes.generation), view.state === "held" || view.state === "ultimate-ready" ? view.text.length : view.typed, view.state === "typing", view.preview || view.state === "cooldown", now);
  for (const signal of signals) if (signal.key === view.key) {
    if (signal.kind === "wrong") nodes.fx.wrong(now);
    else if (signal.kind === "correct") nodes.fx.correct(signal.typed, now);
  }
  drawWord(doc, nodes, now, reduced, flight);
  const leaving = nodes.fx.leaving(now);
  const key = [view.label, view.state, view.preview && !leaving, view.fresh && !leaving, view.note, Math.round(view.cool * 40)].join("|");
  if (key === nodes.key) return;
  nodes.key = key;
  nodes.name.textContent = view.label;
  nodes.note.textContent = view.note;
  nodes.note.title = view.note;
  nodes.root.classList.toggle("is-typing", view.state === "typing");
  nodes.root.classList.toggle("is-held", view.state === "held");
  nodes.root.classList.toggle("is-ultimate-ready", view.state === "ultimate-ready");
  nodes.root.classList.toggle("is-preview", view.preview && !leaving);
  nodes.root.dataset.state = view.state;
  nodes.badge.hidden = !view.fresh || leaving;
  // A note (ô 5's Chân Nguyên, "chờ đích") says it in words; the ring would sit on it.
  nodes.ring.hidden = view.cool <= 0 || view.note !== "";
  nodes.ring.style.setProperty("--cool", view.cool.toFixed(3));
}

function drawItem(nodes: CellNodes, view: ItemCellView, hotkey: string): void {
  const key = [view.label, view.count, view.empty, Math.round(view.cool * 40)].join("|");
  if (key === nodes.key) return;
  nodes.key = key;
  nodes.name.replaceChildren();
  const keyCap = nodes.root.ownerDocument.createElement("span");
  keyCap.className = "ic-bq__key";
  keyCap.textContent = hotkey;
  nodes.name.append(keyCap, nodes.root.ownerDocument.createTextNode(" " + (view.label === "" ? "Empty" : view.label)));
  nodes.root.title = view.label || "Empty item slot";
  nodes.word.textContent = view.empty ? "–" : "×" + view.count;
  nodes.root.classList.toggle("is-empty", view.empty);
  nodes.ring.hidden = view.cool <= 0;
  nodes.ring.style.setProperty("--cool", view.cool.toFixed(3));
}

export interface BanQuyetPresenter extends Presenter {
  /** The last view drawn (scenarios, tests). */
  readonly view: BanQuyetView | null;
}

/** The bar for this machine's `seat` in `host` (#ic-quyet). */
export function createBanQuyet(host: HTMLElement, seat: number, options: { readonly gloss?: GlossOf; readonly keepouts?: (world: World) => readonly Rect[] } = {}): BanQuyetPresenter {
  const doc = host.ownerDocument;
  installStyle(doc);
  const root = doc.createElement("div");
  root.className = "ic-bq is-dim";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Skill words");
  const wordsRow = doc.createElement("div");
  wordsRow.className = "ic-bq__words";
  const extrasRow = doc.createElement("div");
  extrasRow.className = "ic-bq__extras";
  const itemsRow = doc.createElement("div");
  itemsRow.className = "ic-bq__items";
  root.append(wordsRow, extrasRow, itemsRow);
  host.append(root);
  const flight = createWordFlight(host);
  const slotCells = [1, 2, 3, 4, 5].map(() => makeCell(doc));
  wordsRow.append(...slotCells.map((cell) => cell.root));
  const extraCells = new Map<string, CellNodes>();
  const itemCells = [1, 2, 3].map(() => makeCell(doc, " ic-bq__item"));
  itemsRow.append(...itemCells.map((cell) => cell.root));
  let live: boolean | null = null;
  let last: BanQuyetView | null = null;
  let extrasKey = "";
  let layoutKey = "";
  const eventFx = new WordFxEvents(seat);
  const motionQuery = doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)");
  const measure = doc.createElement("canvas").getContext("2d");
  let pending: WordSignal[] = [];
  const cellsByKey = new Map(slotCells.map((cell, i) => ["slot-" + (i + 1), cell]));
  void doc.fonts?.ready.then(() => { layoutKey = ""; });

  return {
    get view() {
      return last;
    },
    onEvents(events: readonly SimEvent[], world: World): void {
      pending.push(...eventFx.read(events, world));
    },
    frame(world: World, info: FrameInfo): void {
      const view = banQuyetView(world, seat, options.gloss);
      const now = info.now;
      const reduced = wordMotionReduced(doc.documentElement.dataset.motion, motionQuery?.matches ?? false);
      last = view;
      if (view.live !== live) {
        live = view.live;
        root.classList.toggle("is-dim", !view.live);
        root.dataset.live = String(view.live);
      }
      // Keep disappearing Seal/Cleanse cells until their final glyph has faded.
      const extras = view.extras.map((cell, i) => cell.key === "cleanse" ? cell : { ...cell, key: "seal-" + world.words.seats[seat]!.seals[i] });
      const outgoingKeys = new Set([...extraCells].filter(([, cell]) => cell.fx.leaving(now)).map(([key]) => key));
      for (const signal of pending) if (signal.kind === "finish" && !signal.key.startsWith("slot-")) outgoingKeys.add(signal.key);
      for (const key of outgoingKeys) if (!extras.some(view => view.key === key)) {
        extras.push({ key, label: key === "cleanse" ? "Cleanse" : "Seal", text: "", typed: 0, errors: 0, state: "empty", preview: false, cool: 0, fresh: false, note: "" });
      }
      // Preserve the physical order when a completed Seal leaves the world's list.
      const previousKeys = [...extraCells.keys()];
      extras.sort((a, b) => {
        const rank = (key: string): number => previousKeys.includes(key) ? previousKeys.indexOf(key) : previousKeys.length;
        return rank(a.key) - rank(b.key);
      });
      const nextKeys = extras.map((cell) => cell.key).join(",");
      if (nextKeys !== extrasKey) {
        extrasKey = nextKeys;
        for (const key of [...extraCells.keys()]) if (!extras.some((cell) => cell.key === key)) {
          extraCells.get(key)!.root.remove();
          extraCells.delete(key);
          cellsByKey.delete(key);
        }
        for (const cell of extras) {
          if (extraCells.has(cell.key)) continue;
          const nodes = makeCell(doc, cell.key === "cleanse" ? " is-cleanse" : " is-seal");
          extraCells.set(cell.key, nodes);
          cellsByKey.set(cell.key, nodes);
        }
        extrasRow.replaceChildren(...extras.map((cell) => extraCells.get(cell.key)!.root));
      }
      for (const signal of pending) if (signal.kind === "assigned") {
        const cell = cellsByKey.get(signal.key);
        if (cell) cell.generation += 1;
      }
      view.slots.forEach((cell, k) => drawCell(doc, slotCells[k]!, cell, now, reduced, pending, flight));
      for (const cell of extras) drawCell(doc, extraCells.get(cell.key)!, cell, now, reduced, pending, flight);
      flight.paint(now, reduced, () => options.keepouts?.(world) ?? []);
      eventFx.remember(world, view);
      pending = [];
      root.style.setProperty("--ic-word-count", String(view.slots.length + extras.length));
      view.items.forEach((cell, k) => drawItem(itemCells[k]!, cell, String(k + 1)));
      const nextLayout = [doc.defaultView?.innerWidth, doc.defaultView?.innerHeight, doc.documentElement.style.getPropertyValue("--ic-text-scale"), nextKeys].join("|");
      if (nextLayout !== layoutKey) {
        layoutKey = nextLayout;
        const cells = [...slotCells, ...extras.map(cell => extraCells.get(cell.key)!)];
        // Reserve this deck's widest eligible word, so replacements never move neighbouring cells.
        for (const cell of cells) cell.word.style.fontSize = "";
        const sizes = cells.map(cell => parseFloat(doc.defaultView?.getComputedStyle(cell.word).fontSize ?? "28"));
        const widths = cells.map((cell, i) => {
          if (!measure) return cell.word.getBoundingClientRect().width;
          const style = doc.defaultView?.getComputedStyle(cell.word);
          measure.font = `700 ${sizes[i]}px ${style?.fontFamily ?? "sans-serif"}`;
          const maxLen = i < 5 ? SLOTS[(i + 1) as SlotId].maxLen : extras[i - 5]?.key === "cleanse" ? 4 : 7;
          const candidates = world.header.deck.filter(word => word.text.length <= maxLen).map(word => word.text);
          candidates.push(cell.fx.text);
          return Math.max(0, ...candidates.map(text => measure.measureText(text).width + text.length * sizes[i]! * 0.02));
        });
        const minimums = cells.map((_, i) => i === 4 ? 156 : 80);
        const available = root.clientWidth - 8 - 90 - cells.length * 4;
        let fit = 1;
        const needed = () => widths.map((width, i) => Math.max(minimums[i]!, width * Math.max(28, sizes[i]! * fit) / sizes[i]! + 12));
        for (let pass = 0; pass < 4; pass += 1) {
          const total = needed().reduce((sum, width) => sum + width, 0);
          if (total <= available) break;
          fit *= available / total;
        }
        const tracks = needed();
        const spare = Math.max(0, available - tracks.reduce((sum, width) => sum + width, 0)) / cells.length;
        cells.forEach((cell, i) => { cell.word.style.fontSize = Math.max(28, sizes[i]! * fit) + "px"; });
        root.style.gridTemplateColumns = tracks.map(width => (width + spare) + "px").join(" ") + " 90px";
      }
    },
    dispose(): void {
      flight.dispose();
      root.remove();
    },
  };
}
