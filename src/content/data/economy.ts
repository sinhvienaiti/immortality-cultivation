/**
 * The fixed shop (canon §14.3): what the shop strip and shop mode list, in
 * order (← → in shop mode): the three mechanisms, then the three đan phù.
 * Never random; prices never change inside a stage. Linh Sa numbers are
 * rules.ts LINH_SA; prices are in data/mechanisms.ts and data/consumables.ts.
 * Owner: Lane 4.
 */
import type { ConsumableId, MechanismId } from "../types";

export const SHOP_ITEMS: readonly (MechanismId | ConsumableId)[] = ["kiem-thung", "loi-phu-tru", "phong-an-vong", "hoi-xuan-dan", "kim-than-phu", "loi-hoa-phu"];
