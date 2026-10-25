/**
 * Shop strip (canon §14.3): the mouse way to the fixed shop in prep and
 * breaks, above the Bàn Quyết band: the six items with prices (Linh Sa,
 * money gold), then the mechanism slots and đan phù slots. A đan phù click
 * buys it; a mechanism click arms it and a click on an empty slot places it;
 * a click on a built slot selects it, then "Nâng" and "Bán" act on a second
 * click within SHOP_MODE.confirmMs (the same rule as = and - of shop mode,
 * through the same ShopModeModel). Hidden while shop mode is open (the
 * keyboard panel shows the same shop). No typing to buy (canon §14.3).
 * The click logic (`ShopStripModel`) is pure and tested in node.
 * Owner: Lane 6.
 */
import type { CommandSink, FrameInfo, Presenter } from "../app/contracts";
import type { ShopModePanel } from "../app/input-router";
import type { SimEvent, World } from "../content/types";
import { canShop, isMechanism, itemName, itemPrice, linhSaOf, rowLabel, shopItems, ShopModeModel, type ShopModeModelOptions } from "./shop-mode";
import { el, setClass, setShown, setText, uiButton, viNumber } from "./skin";

/** The strip's clicks over a ShopModeModel (pure). */
export class ShopStripModel {
  /** The item a mechanism click armed (−1 none) and the built slot row selected (−1 none). */
  armed = -1;
  selected = -1;

  constructor(readonly shop: ShopModeModel) {}

  clickItem(index: number): void {
    const id = shopItems()[index];
    if (id === undefined) return;
    this.shop.pick(index);
    if (isMechanism(id)) {
      this.armed = this.armed === index ? -1 : index;
      this.shop.message = this.armed >= 0 ? "Chọn một ô trống để đặt " + itemName(id) : "";
      return;
    }
    // A đan phù: bought at once (the row does not matter).
    this.shop.handleAction("enter");
    this.armed = -1;
  }

  clickRow(index: number): void {
    this.shop.point(index);
    const row = this.shop.rows()[index];
    if (row === undefined) return;
    if (this.armed >= 0 && row.kind === "mech" && row.mech === null) {
      this.shop.pick(this.armed);
      this.shop.handleAction("enter");
      this.armed = -1;
      this.selected = -1;
      return;
    }
    this.selected = row.kind === "mech" && row.mech !== null ? index : -1;
    this.shop.message = this.selected >= 0 ? "Nâng hoặc bán (bấm hai lần)" : "";
  }

  /** Nâng or Bán on the selected slot (the second click within SHOP_MODE.confirmMs acts). */
  act(action: "upgrade" | "sell"): void {
    if (this.selected < 0) return;
    this.shop.point(this.selected);
    this.shop.handleAction(action);
  }

  reset(): void {
    this.armed = -1;
    this.selected = -1;
  }
}

export interface ShopStripOptions extends ShopModeModelOptions {
  /** Shop mode: the strip hides while it is open. */
  readonly mode?: ShopModePanel;
}

export interface ShopStripPresenter extends Presenter {
  readonly model: ShopStripModel;
}

export function createShopStrip(host: HTMLElement, sink: CommandSink, seat: number, options: ShopStripOptions = {}): ShopStripPresenter {
  const shop = new ShopModeModel(sink, seat, options);
  const model = new ShopStripModel(shop);
  const doc = host.ownerDocument;
  const root = el(doc, "section", "ic-panel ic-shop");
  root.dataset.ui = "shop-strip";
  root.dataset.keepout = "";
  root.hidden = true;
  root.setAttribute("aria-label", "Cửa hàng");
  const head = el(doc, "div", "ic-shop__head");
  const title = el(doc, "span", "ic-shop__title", "Cửa hàng");
  const money = el(doc, "span", "ic-shop__money");
  const hint = el(doc, "span", "ic-shop__keys", "` mở cửa hàng bằng phím");
  head.append(title, money, hint);
  const itemsRow = el(doc, "div", "ic-shop__row");
  const slotsRow = el(doc, "div", "ic-shop__row");
  const actions = el(doc, "div", "ic-shop__row");
  const message = el(doc, "div", "ic-shop__msg");
  root.append(head, itemsRow, slotsRow, actions, message);
  host.append(root);
  let drawnKey = "";
  let lastWorld: World | null = null;

  const redraw = (): void => {
    drawnKey = "";
    if (lastWorld !== null) draw(lastWorld, true);
  };
  const upgradeButton = uiButton(doc, "ic-shop__act", () => {
    model.act("upgrade");
    redraw();
  });
  upgradeButton.textContent = "Nâng";
  const sellButton = uiButton(doc, "ic-shop__act", () => {
    model.act("sell");
    redraw();
  });
  sellButton.textContent = "Bán";
  actions.append(upgradeButton, sellButton);

  function draw(world: World, shown: boolean): void {
    const items = shopItems();
    const rows = shop.rows();
    const wallet = linhSaOf(world, seat);
    const key = [shown, model.armed, model.selected, shop.message, shop.confirm?.action ?? "", wallet, items.join(","), rows.map(rowLabel).join("|")].join("/");
    if (key === drawnKey) return;
    drawnKey = key;
    setShown(root, shown);
    if (!shown) return;
    setText(money, "Linh Sa " + viNumber(wallet));
    itemsRow.replaceChildren(
      ...items.map((id, k) => {
        const price = itemPrice(id);
        const button = uiButton(doc, "ic-shop__item" + (k === model.armed ? " is-cursor" : "") + (price !== null && price > wallet ? " is-poor" : ""), () => {
          model.clickItem(k);
          redraw();
        });
        button.dataset.item = id;
        button.append(el(doc, "b", "", itemName(id)), el(doc, "span", "ic-shop__price", price === null ? "—" : viNumber(price)));
        return button;
      }),
    );
    slotsRow.replaceChildren(
      ...rows.map((row, k) => {
        const armed = model.armed >= 0 && row.kind === "mech" && row.mech === null;
        const button = uiButton(doc, "ic-shop__slot" + (k === model.selected ? " is-cursor" : "") + (armed ? " is-armed" : ""), () => {
          model.clickRow(k);
          redraw();
        });
        button.dataset.row = String(k);
        button.append(el(doc, "b", "", rowLabel(row)));
        return button;
      }),
    );
    setShown(actions, model.selected >= 0);
    setText(message, shop.message);
    setClass(message, "is-confirm", shop.confirm !== null);
  }

  return {
    model,
    onEvents(_events: readonly SimEvent[], world: World): void {
      shop.setWorld(world);
    },
    frame(world: World, _info: FrameInfo): void {
      shop.setWorld(world);
      lastWorld = world;
      const shown = canShop(world.phase) && !(options.mode?.isOpen ?? false);
      if (!shown) model.reset();
      if (shop.confirm !== null && shop.confirm.until < (options.now?.() ?? globalThis.performance?.now() ?? 0)) {
        shop.confirm = null;
        shop.message = "";
      }
      draw(world, shown);
    },
    dispose(): void {
      root.remove();
    },
  };
}
