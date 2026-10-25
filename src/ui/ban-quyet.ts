/**
 * Bàn Quyết (canon §6, §21.1, §24): the DOM bar in #ic-quyet, outside the
 * canvas: 5 slots + the Ấn and Tẩy places + 3 đan phù cells (counts and
 * cooldown only, no word); words 28–32 px (Be Vietnam Pro 700, × text
 * scale), first letter underlined, typed letters in the typing colour, a
 * cooldown ring, the next word dim at 50 % while a slot cools down, the skill
 * name apart from the word, the `held` state ("chờ đích"), an element rim
 * (lit when the target is countered; M0a beasts have no element); the whole
 * bar dims when it is not live; nothing moves or shakes. Each frame reads the
 * world and touches the DOM only where a cell changed (≤ 0.3 ms a frame).
 * The view model (`banQuyetView`) is pure and tested in node.
 * Owner: Lane 3.
 */
import type { FrameInfo, Presenter } from "../app/contracts";
import { CONSUMABLES, SIM, SLOT3_DASH_COOLDOWN_MS, SLOTS } from "../content/rules";
import { CONSUMABLE_DEFS } from "../content/data/consumables";
import { SCHOOL_KIEM } from "../content/data/school-kiem";
import type { ConsumableId, LiveWord, SimEvent, SlotId, World } from "../content/types";
import { isBanQuyetLive, shownWord, slotEntry } from "../sim/words";

// ── View model (pure) ───────────────────────────────────────────────────────

export type CellState = "ready" | "typing" | "held" | "cooldown" | "waiting" | "dim" | "empty";

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
const SLOT_NAMES: Readonly<Record<SlotId, string>> = { 1: "Ngự Kiếm Quyết", 2: "Nhất Tuyến Xuyên Vân", 3: "Hồi Kiếm Hộ Thân", 4: "Lạc Kiếm Trận", 5: "Thiên Hà Kiếm Vũ" };
const DASH_NAME = "Lưu Quang Bộ";
/** canon §12.3 names, until Lane 4's data names them. */
const ITEM_NAMES: Readonly<Record<ConsumableId, string>> = { "hoi-xuan-dan": "Hồi Xuân Đan", "kim-than-phu": "Kim Thân Phù", "loi-hoa-phu": "Lôi Hỏa Phù" };

const ticksOf = (ms: number): number => Math.round((ms * SIM.tickHz) / 1000);
const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

export function slotLabel(world: World, seat: number, slot: SlotId): string {
  const guard = world.seats[seat]?.loadout.guard ?? "ward";
  const def = SCHOOL_KIEM.find((skill) => skill.slot === slot && (slot !== 3 || skill.effect.kind === guard));
  if (def) return def.name;
  return slot === 3 && guard === "dash" ? DASH_NAME : SLOT_NAMES[slot];
}

function cooldownTicks(world: World, seat: number, slot: SlotId): number {
  const ms = slot === 3 && world.seats[seat]?.loadout.guard === "dash" ? SLOT3_DASH_COOLDOWN_MS : SLOTS[slot].cooldownMs;
  return Math.max(1, ticksOf(ms));
}

function cellOf(world: World, seat: number, entry: LiveWord | null, key: string, label: string, live: boolean): WordCellView {
  if (entry === null) return { key, label, text: "", typed: 0, errors: 0, state: "empty", preview: false, cool: 0, fresh: false, note: "" };
  const isLive = entry.kitSlot >= 0;
  const word = shownWord(world, entry);
  const preview = !isLive && entry.state === "cooldown" && word !== null;
  const ultimate = entry.kind === "slot" && entry.slot === 5;
  const chanPm = world.seats[seat]?.chanNguyenPm ?? 0;
  let cool = 0;
  if (ultimate) cool = 1 - clamp01(chanPm / 100_000);
  else if (entry.kind === "slot" && entry.state === "cooldown" && entry.until > world.tick) cool = clamp01((entry.until - world.tick) / cooldownTicks(world, seat, entry.slot!));
  const state: CellState = !live ? (entry.state === "held" ? "held" : "dim") : entry.state;
  const note = state === "held" ? "Chờ đích" : state === "waiting" ? "Đang chờ chỗ" : ultimate && !isLive ? "Chân Nguyên " + Math.floor(chanPm / 1000) + "/100" : "";
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
export function banQuyetView(world: World, seat: number): BanQuyetView {
  const live = isBanQuyetLive(world, seat) && world.words.awake?.[seat] !== false;
  const slots = ([1, 2, 3, 4, 5] as const).map((slot) => cellOf(world, seat, slotEntry(world, seat, slot), "slot-" + slot, slotLabel(world, seat, slot), live));
  const words = world.words.seats[seat];
  const extras: WordCellView[] = [];
  (words?.seals ?? []).forEach((index, k) => extras.push(cellOf(world, seat, world.words.live[index] ?? null, "seal-" + k, "Ấn", live)));
  if (words !== undefined && words.cleanse >= 0) extras.push(cellOf(world, seat, world.words.live[words.cleanse] ?? null, "cleanse", "Tẩy", live));
  const store = world.consumables?.seats?.[seat];
  const coolTicks = ticksOf(CONSUMABLES.cooldownMs);
  const coolLeft = store !== undefined && store.cooldownUntil > world.tick ? clamp01((store.cooldownUntil - world.tick) / coolTicks) : 0;
  const items: ItemCellView[] = [0, 1, 2].map((k) => {
    const held = store?.slots[k];
    const item = held?.item ?? null;
    return {
      key: "item-" + (k + 1),
      label: item === null ? "" : (CONSUMABLE_DEFS[item]?.name ?? ITEM_NAMES[item]),
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
  position: fixed; left: 50%; bottom: calc(12px * var(--ui, 1)); translate: -50% 0; z-index: 45;
  display: flex; align-items: stretch; gap: calc(8px * var(--ui, 1)); box-sizing: border-box;
  max-width: calc(100vw - 24px); padding: calc(8px * var(--ui, 1)) calc(10px * var(--ui, 1));
  background: rgba(14, 18, 24, 0.86); border: 1.5px solid rgba(242, 235, 221, 0.18); border-radius: calc(12px * var(--ui, 1));
  color: #F2EBDD; font-family: "Be Vietnam Pro", "Segoe UI", system-ui, sans-serif;
  transform: none; animation: none; filter: none; pointer-events: auto;
}
.ic-bq.is-dim .ic-bq__words, .ic-bq.is-dim .ic-bq__extras { opacity: 0.42; }
.ic-bq__words, .ic-bq__extras, .ic-bq__items { display: flex; gap: calc(8px * var(--ui, 1)); }
.ic-bq__extras:empty { display: none; }
.ic-bq__items { padding-left: calc(8px * var(--ui, 1)); border-left: 1px solid rgba(242, 235, 221, 0.16); }
.ic-bq__cell {
  position: relative; min-width: calc(128px * var(--ui, 1)); padding: calc(6px * var(--ui, 1)) calc(10px * var(--ui, 1)) calc(5px * var(--ui, 1));
  display: grid; justify-items: center; align-content: center; gap: 2px; box-sizing: border-box;
  border: 1.5px solid rgba(242, 235, 221, 0.22); border-radius: calc(9px * var(--ui, 1)); background: rgba(242, 235, 221, 0.04);
}
.ic-bq__cell.is-seal { border-color: rgba(255, 176, 32, 0.7); }
.ic-bq__cell.is-cleanse { border-color: rgba(255, 176, 32, 0.95); }
.ic-bq__cell.is-counter { box-shadow: 0 0 0 2px rgba(127, 245, 224, 0.75) inset; }
.ic-bq__cell.is-typing { border-color: #7FF5E0; }
.ic-bq__name { font-size: max(11px, calc(12px * var(--ui, 1))); font-weight: 700; letter-spacing: 0.03em; color: #CFC6B3; white-space: nowrap; }
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
.ic-bq__note { font-size: max(11px, calc(12px * var(--ui, 1))); color: #CFC6B3; min-height: 1.2em; white-space: nowrap; }
.ic-bq__note:empty { visibility: hidden; }
.ic-bq__badge { position: absolute; left: 6px; bottom: 5px; font-size: 10px; font-weight: 800; padding: 0 4px; border-radius: 3px; background: #E9F7D4; color: #1F3A12; }
.ic-bq__badge[hidden] { display: none; }
.ic-bq__ring {
  position: absolute; right: 6px; bottom: 6px; width: calc(14px * var(--ui, 1)); height: calc(14px * var(--ui, 1)); border-radius: 50%;
  background: conic-gradient(rgba(242, 235, 221, 0.75) calc(var(--cool, 0) * 360deg), rgba(242, 235, 221, 0.12) 0);
}
.ic-bq__ring[hidden] { display: none; }
.ic-bq__item { min-width: calc(92px * var(--ui, 1)); }
.ic-bq__item .ic-bq__word { font-size: calc(20px * var(--ui, 1)); }
.ic-bq__item.is-empty { opacity: 0.4; }
.ic-bq__key { font-size: max(11px, calc(12px * var(--ui, 1))); font-weight: 800; color: #F2EBDD; border: 1px solid rgba(242, 235, 221, 0.5); border-radius: 3px; padding: 0 4px; }
`;

function installStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
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
  badge.textContent = "MỚI";
  badge.hidden = true;
  const name = doc.createElement("span");
  name.className = "ic-bq__name";
  const word = doc.createElement("span");
  word.className = "ic-bq__word";
  const note = doc.createElement("span");
  note.className = "ic-bq__note";
  root.append(ring, badge, name, word, note);
  return { root, name, word, note, ring, badge, key: "" };
}

function drawWord(doc: Document, target: HTMLElement, text: string, typed: number): void {
  const parts = wordParts(text, typed);
  const done = doc.createElement("span");
  done.className = "done";
  done.textContent = parts.done;
  const first = doc.createElement("span");
  first.className = "first";
  first.textContent = parts.first;
  target.replaceChildren(done, first, doc.createTextNode(parts.rest));
}

function drawCell(doc: Document, nodes: CellNodes, view: WordCellView): void {
  const key = [view.label, view.text, view.typed, view.state, view.preview, view.fresh, view.note, Math.round(view.cool * 40)].join("|");
  if (key === nodes.key) return;
  nodes.key = key;
  nodes.name.textContent = view.label;
  drawWord(doc, nodes.word, view.text, view.typed);
  nodes.note.textContent = view.note;
  nodes.root.classList.toggle("is-typing", view.state === "typing");
  nodes.root.classList.toggle("is-held", view.state === "held");
  nodes.root.classList.toggle("is-preview", view.preview);
  nodes.root.dataset.state = view.state;
  nodes.badge.hidden = !view.fresh;
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
  nodes.name.append(keyCap, nodes.root.ownerDocument.createTextNode(" " + (view.label === "" ? "Trống" : view.label)));
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
export function createBanQuyet(host: HTMLElement, seat: number): BanQuyetPresenter {
  const doc = host.ownerDocument;
  installStyle(doc);
  const root = doc.createElement("div");
  root.className = "ic-bq is-dim";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Bàn Quyết");
  const wordsRow = doc.createElement("div");
  wordsRow.className = "ic-bq__words";
  const extrasRow = doc.createElement("div");
  extrasRow.className = "ic-bq__extras";
  const itemsRow = doc.createElement("div");
  itemsRow.className = "ic-bq__items";
  root.append(wordsRow, extrasRow, itemsRow);
  host.append(root);
  const slotCells = [1, 2, 3, 4, 5].map(() => makeCell(doc));
  wordsRow.append(...slotCells.map((cell) => cell.root));
  const extraCells = new Map<string, CellNodes>();
  const itemCells = [1, 2, 3].map(() => makeCell(doc, " ic-bq__item"));
  itemsRow.append(...itemCells.map((cell) => cell.root));
  let live: boolean | null = null;
  let last: BanQuyetView | null = null;
  let extrasKey = "";

  return {
    get view() {
      return last;
    },
    onEvents(_events: readonly SimEvent[], _world: World): void {
      // The bar redraws from the world each frame; events need nothing more here.
    },
    frame(world: World, _info: FrameInfo): void {
      const view = banQuyetView(world, seat);
      last = view;
      if (view.live !== live) {
        live = view.live;
        root.classList.toggle("is-dim", !view.live);
        root.dataset.live = String(view.live);
      }
      view.slots.forEach((cell, k) => drawCell(doc, slotCells[k]!, cell));
      const nextKeys = view.extras.map((cell) => cell.key).join(",");
      if (nextKeys !== extrasKey) {
        extrasKey = nextKeys;
        for (const key of [...extraCells.keys()]) if (!view.extras.some((cell) => cell.key === key)) {
          extraCells.get(key)!.root.remove();
          extraCells.delete(key);
        }
        for (const cell of view.extras) {
          if (extraCells.has(cell.key)) continue;
          const nodes = makeCell(doc, cell.key === "cleanse" ? " is-cleanse" : " is-seal");
          extraCells.set(cell.key, nodes);
        }
        extrasRow.replaceChildren(...view.extras.map((cell) => extraCells.get(cell.key)!.root));
      }
      for (const cell of view.extras) drawCell(doc, extraCells.get(cell.key)!, cell);
      view.items.forEach((cell, k) => drawItem(itemCells[k]!, cell, String(k + 1)));
    },
    dispose(): void {
      root.remove();
    },
  };
}
