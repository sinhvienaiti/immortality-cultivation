/**
 * Shop mode by keyboard (canon §5.1, §14.3, D45, PB-23): ` opens it in prep
 * and breaks (the router toggles it and stops the walk); ← → pick the item,
 * ↑ ↓ the slot (the 6 mechanism slots, then the đan phù slots); Enter buys
 * (đan phù) or places (a mechanism on an empty slot); = upgrades and - sells
 * only on a second press on the same slot within rules.ts SHOP_MODE.confirmMs;
 * Esc leaves. Letters are dropped (no typing to buy). While it is open the
 * arrows belong to it, so the player never walks (the router gives the open
 * panel every action). It closes itself when the wave warning starts.
 * The model (`ShopModeModel`) is pure and drives the mouse strip too
 * (shop-strip.ts); the sim checks money, phase and slots and says `rejected`
 * (the HUD shows it). Prices are Lane 4's data (MECHANISM_DEFS,
 * CONSUMABLE_DEFS); upgrade and refund amounts follow rules.ts MECHANISMS.
 * Owner: Lane 6.
 */
import type { CommandSink, FrameInfo, Presenter } from "../app/contracts";
import type { ShopModePanel } from "../app/input-router";
import { CONSUMABLE_DEFS } from "../content/data/consumables";
import { SHOP_ITEMS } from "../content/data/economy";
import { MECHANISM_DEFS } from "../content/data/mechanisms";
import { CONSUMABLES, MECHANISMS, SHOP_MODE, type KeyAction } from "../content/rules";
import type { ConsumableId, MechanismId, MechSlotKind, Phase, SimCommand, SimEvent, World } from "../content/types";
import { el, keyCap, setClass, setShown, setText, viNumber } from "./skin";

// ── Items and slots (pure) ──────────────────────────────────────────────────

export type ShopItemId = MechanismId | ConsumableId;

export const MECHANISM_IDS: readonly MechanismId[] = ["kiem-thung", "loi-phu-tru", "phong-an-vong"];
export const CONSUMABLE_IDS: readonly ConsumableId[] = ["hoi-xuan-dan", "kim-than-phu", "loi-hoa-phu"];

/** canon §8.3, §12.3 names, until Lane 4's data names them. */
const NAMES: Readonly<Record<ShopItemId, string>> = {
  "kiem-thung": "Kiếm Thung",
  "loi-phu-tru": "Lôi Phù Trụ",
  "phong-an-vong": "Phong Ấn Võng",
  "hoi-xuan-dan": "Hồi Xuân Đan",
  "kim-than-phu": "Kim Thân Phù",
  "loi-hoa-phu": "Lôi Hỏa Phù",
};

/** Slot kinds a mechanism fits (canon §8.3: Kiếm Thung a 4 × 2 m strip, the others a post), until Lane 4's data says. */
const FITS: Readonly<Record<MechanismId, MechSlotKind>> = { "kiem-thung": "strip", "loi-phu-tru": "post", "phong-an-vong": "post" };

const SLOT_KIND_NAMES: Readonly<Record<MechSlotKind, string>> = { strip: "dải đất", post: "trụ" };

/** The fixed stock in order (Lane 4's SHOP_ITEMS; the canon's six until it lands). */
export function shopItems(): readonly ShopItemId[] {
  return SHOP_ITEMS.length > 0 ? SHOP_ITEMS : [...MECHANISM_IDS, ...CONSUMABLE_IDS];
}

export function isMechanism(id: ShopItemId): id is MechanismId {
  return (MECHANISM_IDS as readonly string[]).includes(id);
}

export function itemName(id: ShopItemId): string {
  return (isMechanism(id) ? MECHANISM_DEFS[id]?.name : CONSUMABLE_DEFS[id]?.name) ?? NAMES[id];
}

/** Price in Linh Sa (null until Lane 4's data has it). */
export function itemPrice(id: ShopItemId): number | null {
  return (isMechanism(id) ? MECHANISM_DEFS[id]?.price : CONSUMABLE_DEFS[id]?.price) ?? null;
}

export function slotKindFor(mech: MechanismId): MechSlotKind {
  return MECHANISM_DEFS[mech]?.slotKind ?? FITS[mech];
}

/** Highest mechanism level (canon §8.3: levels 1–3). */
export const MAX_LEVEL = MECHANISMS.upgrades.length + 1;

/** Price of the next level from `level` (canon §8.3: 70 % then 100 % of the base price); null at the top or without data. */
export function upgradePrice(mech: MechanismId, level: number): number | null {
  const step = MECHANISMS.upgrades[level - 1];
  const base = itemPrice(mech);
  if (step === undefined || base === null) return null;
  return Math.floor((base * step.pricePct) / 100);
}

/** Linh Sa back on a sale (canon §8.3: 70 %, 100 % in the same break); the sim's number wins. */
export function refundOf(paid: number, sameBreak: boolean): number {
  return Math.floor((paid * (sameBreak ? MECHANISMS.refundSameBreakPct : MECHANISMS.refundPct)) / 100);
}

/** Shop mode and the strip are open in prep and breaks only (canon §14.3). */
export function canShop(phase: Phase): boolean {
  return phase === "prep" || phase === "break";
}

export interface ShopRow {
  readonly kind: "mech" | "item";
  /** Mechanism slot 0–5 or đan phù slot 0–2. */
  readonly index: number;
  readonly slotKind: MechSlotKind | null;
  readonly mech: MechanismId | null;
  readonly level: number;
  readonly paid: number;
  readonly sameBreak: boolean;
  readonly item: ConsumableId | null;
  readonly count: number;
}

/** The rows ↑ ↓ walk: the stage's mechanism slots, then the seat's đan phù slots (canon §5.1). */
export function shopRows(world: World, seat: number): ShopRow[] {
  const rows: ShopRow[] = [];
  const states = world.mechanisms?.slots ?? [];
  const breakId = world.shop?.breakId ?? 0;
  world.stage.field.mechSlots.forEach((slot, index) => {
    const state = states[index];
    rows.push({
      kind: "mech",
      index,
      slotKind: slot.kind,
      mech: state?.mech ?? null,
      level: state?.level ?? 0,
      paid: state?.paid ?? 0,
      sameBreak: state !== undefined && state.breakId === breakId && world.phase === "break",
      item: null,
      count: 0,
    });
  });
  const store = world.consumables?.seats?.[seat];
  for (let index = 0; index < CONSUMABLES.slots; index += 1) {
    const held = store?.slots[index];
    rows.push({ kind: "item", index, slotKind: null, mech: null, level: 0, paid: 0, sameBreak: false, item: held?.item ?? null, count: held?.count ?? 0 });
  }
  return rows;
}

export function linhSaOf(world: World, seat: number): number {
  return world.economy?.wallets?.[seat]?.linhSa ?? 0;
}

/** A row's short label: "Ô 3 · Lôi Phù Trụ cấp 2", "Ô 5 · trụ trống", "Đan 1 · Hồi Xuân Đan × 2". */
export function rowLabel(row: ShopRow): string {
  if (row.kind === "item") return "Đan " + (row.index + 1) + " · " + (row.item === null || row.count <= 0 ? "trống" : itemName(row.item) + " × " + row.count);
  if (row.mech === null) return "Ô " + (row.index + 1) + " · " + SLOT_KIND_NAMES[row.slotKind ?? "post"] + " trống";
  return "Ô " + (row.index + 1) + " · " + itemName(row.mech) + " cấp " + row.level;
}

// ── The model ───────────────────────────────────────────────────────────────

interface Confirm {
  readonly action: "upgrade" | "sell";
  readonly row: number;
  readonly until: number;
}

export interface ShopModeModelOptions {
  /** Wall clock (ms) for the second-press window; performance.now by default. */
  readonly now?: () => number;
  /** The cursor moved to mechanism slot `index` (−1: no mechanism slot, or closed): the stage highlights it. */
  readonly onCursor?: (index: number) => void;
}

export class ShopModeModel implements ShopModePanel {
  isOpen = false;
  /** Item cursor (index into shopItems()) and row cursor (index into shopRows()). */
  item = 0;
  row = 0;
  message = "";
  confirm: Confirm | null = null;
  private world: World | null = null;
  private readonly now: () => number;

  constructor(
    private readonly sink: CommandSink,
    private readonly seat: number,
    private readonly options: ShopModeModelOptions = {},
  ) {
    this.now = options.now ?? (() => globalThis.performance?.now() ?? 0);
  }

  /** The world the next action reads (the presenter calls it each frame). */
  setWorld(world: World): void {
    this.world = world;
  }

  rows(): ShopRow[] {
    return this.world === null ? [] : shopRows(this.world, this.seat);
  }

  open(): void {
    this.isOpen = true;
    this.message = "";
    this.confirm = null;
    this.cursorMoved();
  }

  close(): void {
    this.isOpen = false;
    this.confirm = null;
    this.options.onCursor?.(-1);
  }

  handleLetter(_letter: string): boolean {
    return false;
  }

  /** Points the item cursor at `index` (mouse). */
  pick(index: number): void {
    const items = shopItems();
    if (items.length === 0) return;
    this.item = ((index % items.length) + items.length) % items.length;
    this.confirm = null;
  }

  /** Points the row cursor at `index` (mouse); moving it to another row cancels a pending = or - press. */
  point(index: number): void {
    const count = this.rows().length;
    if (count === 0) return;
    const row = ((index % count) + count) % count;
    if (row !== this.row) this.confirm = null;
    this.row = row;
    this.cursorMoved();
  }

  handleAction(action: KeyAction): boolean {
    switch (action) {
      case "arrow-left":
        this.pick(this.item - 1);
        this.message = "";
        return true;
      case "arrow-right":
        this.pick(this.item + 1);
        this.message = "";
        return true;
      case "arrow-up":
        this.point(this.row - 1);
        this.message = "";
        return true;
      case "arrow-down":
        this.point(this.row + 1);
        this.message = "";
        return true;
      case "enter":
        this.enter();
        return true;
      case "upgrade":
        this.twice("upgrade");
        return true;
      case "sell":
        this.twice("sell");
        return true;
      case "escape":
        this.close();
        return true;
      default:
        // Digits, Backspace: nothing in shop mode (the panel keeps them).
        return true;
    }
  }

  private cursorMoved(): void {
    const row = this.rows()[this.row];
    this.options.onCursor?.(this.isOpen && row !== undefined && row.kind === "mech" ? row.index : -1);
  }

  private send(command: SimCommand, message: string): void {
    this.sink(command);
    this.message = message;
    this.confirm = null;
  }

  private enter(): void {
    const items = shopItems();
    const id = items[this.item];
    const row = this.rows()[this.row];
    if (id === undefined || row === undefined) return;
    if (!isMechanism(id)) {
      this.send({ type: "buy", seat: this.seat, item: id }, "Mua " + itemName(id));
      return;
    }
    if (row.kind !== "mech") {
      this.message = "Chọn ô cơ quan (↑ ↓) để đặt " + itemName(id);
      return;
    }
    if (row.mech !== null) {
      this.message = "Ô " + (row.index + 1) + " đã có " + itemName(row.mech) + ": = nâng, - bán";
      return;
    }
    if (row.slotKind !== null && slotKindFor(id) !== row.slotKind) {
      this.message = itemName(id) + " đặt trên " + SLOT_KIND_NAMES[slotKindFor(id)] + ", ô " + (row.index + 1) + " là " + SLOT_KIND_NAMES[row.slotKind];
      return;
    }
    this.send({ type: "place", seat: this.seat, slot: row.index, mech: id }, "Đặt " + itemName(id) + " · ô " + (row.index + 1));
  }

  /** = and -: the first press asks, the second on the same slot within SHOP_MODE.confirmMs does it (canon §5.1, D45). */
  private twice(action: "upgrade" | "sell"): void {
    const row = this.rows()[this.row];
    if (row === undefined || row.kind !== "mech" || row.mech === null) {
      this.message = "Chọn một ô có cơ quan (↑ ↓)";
      this.confirm = null;
      return;
    }
    if (action === "upgrade" && row.level >= MAX_LEVEL) {
      this.message = itemName(row.mech) + " đã ở cấp tối đa";
      this.confirm = null;
      return;
    }
    const now = this.now();
    const pending = this.confirm;
    if (pending !== null && pending.action === action && pending.row === this.row && now <= pending.until) {
      const name = itemName(row.mech);
      if (action === "upgrade") this.send({ type: "upgrade", seat: this.seat, slot: row.index }, "Nâng " + name + " lên cấp " + (row.level + 1));
      else this.send({ type: "sell", seat: this.seat, slot: row.index }, "Bán " + name);
      return;
    }
    this.confirm = { action, row: this.row, until: now + SHOP_MODE.confirmMs };
    if (action === "upgrade") {
      const price = upgradePrice(row.mech, row.level);
      this.message = "Bấm = lần nữa để nâng " + itemName(row.mech) + " lên cấp " + (row.level + 1) + (price === null ? "" : " (" + viNumber(price) + " Linh Sa)");
    } else {
      this.message = "Bấm - lần nữa để bán " + itemName(row.mech) + " (hoàn " + viNumber(refundOf(row.paid, row.sameBreak)) + " Linh Sa)";
    }
  }
}

// ── The panel ───────────────────────────────────────────────────────────────

export type ShopModeOptions = ShopModeModelOptions;

export type ShopModePresenter = ShopModePanel & Presenter & { readonly model: ShopModeModel };

/** Keys line (canon §5.1 table). */
export const SHOP_KEYS_TEXT = "← → món · ↑ ↓ ô · Enter mua, đặt · = nâng (2 lần) · - bán (2 lần) · Esc thoát";

export function createShopMode(host: HTMLElement, sink: CommandSink, seat: number, options: ShopModeOptions = {}): ShopModePresenter {
  const model = new ShopModeModel(sink, seat, options);
  const doc = host.ownerDocument;
  const root = el(doc, "section", "ic-panel ic-shop ic-shopmode");
  root.dataset.ui = "shop-mode";
  root.dataset.keepout = "";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Cửa hàng (bàn phím)");
  const head = el(doc, "div", "ic-shop__head");
  const title = el(doc, "span", "ic-shop__title", "Cửa hàng " + keyCap("Backquote"));
  const money = el(doc, "span", "ic-shop__money");
  head.append(title, money);
  const items = el(doc, "div", "ic-shop__row");
  const rows = el(doc, "div", "ic-shop__row");
  const message = el(doc, "div", "ic-shop__msg");
  const keys = el(doc, "div", "ic-shop__keys", SHOP_KEYS_TEXT);
  root.append(head, items, rows, message, keys);
  host.append(root);
  let drawnKey = "";

  const draw = (world: World): void => {
    const list = shopItems();
    const rowList = model.rows();
    const wallet = linhSaOf(world, seat);
    const key = [model.isOpen, model.item, model.row, model.message, model.confirm?.action ?? "", wallet, list.join(","), rowList.map(rowLabel).join("|")].join("/");
    if (key === drawnKey) return;
    drawnKey = key;
    setShown(root, model.isOpen);
    if (!model.isOpen) return;
    setText(money, "Linh Sa " + viNumber(wallet));
    items.replaceChildren(
      ...list.map((id, k) => {
        const price = itemPrice(id);
        const node = el(doc, "div", "ic-btn ic-shop__item" + (k === model.item ? " is-cursor" : "") + (price !== null && price > wallet ? " is-poor" : ""));
        node.append(el(doc, "b", "", itemName(id)), el(doc, "span", "ic-shop__price", price === null ? "—" : viNumber(price)));
        return node;
      }),
    );
    rows.replaceChildren(
      ...rowList.map((row, k) => {
        const node = el(doc, "div", "ic-btn ic-shop__slot" + (k === model.row ? " is-cursor" : ""));
        node.append(el(doc, "b", "", rowLabel(row)));
        return node;
      }),
    );
    setText(message, model.message);
    setClass(message, "is-confirm", model.confirm !== null);
  };

  return {
    model,
    get isOpen() {
      return model.isOpen;
    },
    open: () => model.open(),
    close: () => model.close(),
    handleLetter: (letter) => model.handleLetter(letter),
    handleAction: (action) => model.handleAction(action),
    onEvents(_events: readonly SimEvent[], world: World): void {
      model.setWorld(world);
    },
    frame(world: World, _info: FrameInfo): void {
      model.setWorld(world);
      // Shop mode lives in prep and breaks only (the warning closes it).
      if (model.isOpen && !canShop(world.phase)) model.close();
      if (model.confirm !== null && model.confirm.until < (options.now?.() ?? globalThis.performance?.now() ?? 0)) {
        model.confirm = null;
        model.message = "";
      }
      draw(world);
    },
    dispose(): void {
      model.close();
      root.remove();
    },
  };
}
