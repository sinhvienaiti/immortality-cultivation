/**
 * The element registry (canon D59): every material kit the skills can be drawn in, by id. Metal is the default and
 * the base layers; Fire is built (Sword × Fire, key 1 and key 7); the elements after them are drawn from their folder's
 * Firefly clips by role (element-clips.ts). A new element: write its kit (element-kit.ts, like element-water.ts) and
 * add it to KITS, or call registerElement at load time.
 */
import type { ElementId, ElementKit } from "./element-kit";
import { FIRE } from "./element-fire";
import { METAL } from "./element-metal";
import { THUNDER } from "./element-thunder";
import { WIND } from "./element-wind";
import { ICE } from "./element-ice";
import { DARK } from "./element-dark";
import { LIGHT } from "./element-light";
import { WOOD } from "./element-wood";
import { EARTH } from "./element-earth";
import { POISON } from "./element-poison";
import { BLOOD } from "./element-blood";
import { WATER } from "./element-water";

export const DEFAULT_ELEMENT: ElementId = "metal";

const KITS = new Map<ElementId, ElementKit>([
  [METAL.id, METAL],
  [FIRE.id, FIRE],
  [WATER.id, WATER],
  [THUNDER.id, THUNDER],
  [WIND.id, WIND],
  [ICE.id, ICE],
  [DARK.id, DARK],
  [LIGHT.id, LIGHT],
  [WOOD.id, WOOD],
  [EARTH.id, EARTH],
  [POISON.id, POISON],
  [BLOOD.id, BLOOD],
]);

/** Adds or replaces a kit (load time). */
export function registerElement(kit: ElementKit): void {
  KITS.set(kit.id, kit);
}

export function elementById(id: string): ElementKit | undefined {
  return KITS.get(id as ElementId);
}

/** Registered kits, Metal first. */
export function elementKits(): readonly ElementKit[] {
  return [...KITS.values()];
}

/** The kit for `id`, else Metal. */
export function elementOrMetal(id: string | null | undefined): ElementKit {
  return (id ? KITS.get(id as ElementId) : undefined) ?? METAL;
}
