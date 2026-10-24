/**
 * Shop mode by keyboard (canon §5.1, D45, PB-23): ` opens it in prep and
 * breaks (the router toggles it); ← → pick the item, ↑ ↓ the slot (6
 * mechanism slots, then đan phù slots), Enter buys or places, = upgrades and
 * - sells on a second press within rules.ts SHOP_MODE.confirmMs, Esc leaves.
 * The router sends arrows 0 to `local` when it opens (no walking inside).
 * Owner: Lane 6. TODO(lane-6).
 */
import type { CommandSink, Presenter } from "../app/contracts";
import type { ShopModePanel } from "../app/input-router";

export function createShopMode(_host: HTMLElement, _sink: CommandSink, _seat: number): ShopModePanel & Presenter {
  throw new Error("TODO(lane-6): ui/shop-mode.ts createShopMode");
}
