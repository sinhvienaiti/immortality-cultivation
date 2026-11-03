/**
 * The element registry (canon D59): every material kit the skills can be drawn in, by id. Metal is the default and
 * the base layers; Fire is registered (its look is being built). A new element: write its kit (element-kit.ts,
 * like element-fire.ts) and add it to KITS, or call registerElement at load time.
 */
import type { ElementId, ElementKit } from "./element-kit";
import { FIRE } from "./element-fire";
import { METAL } from "./element-metal";

export const DEFAULT_ELEMENT: ElementId = "metal";

const KITS = new Map<ElementId, ElementKit>([
  [METAL.id, METAL],
  [FIRE.id, FIRE],
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
