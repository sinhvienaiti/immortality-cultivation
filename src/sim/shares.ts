/**
 * Damage shares (canon §7.3, CB2, CB3): effective damage (≤ HP left, never the
 * overkill, canon §7.2) by source: typed per slot, Ấn, Tẩy, đánh nền,
 * mechanisms, đan phù, formation. A multiplier (Tâm nhãn Công, pháp bảo)
 * never moves damage to another bucket: the bucket is the hit's source.
 * combat.ts damageBeast is the only writer; reports and bots read `shares`.
 * Owner: Lane 4.
 */
import type { HitSource, ShareLedger, World } from "../content/types";

export interface ShareSummary {
  /** Permille of all damage: typed, auto, support (mechanism + consumable + formation). */
  readonly typedPm: number;
  readonly autoPm: number;
  readonly supportPm: number;
  /** Ô 1 as permille of typed damage (CB3). */
  readonly slot1OfTypedPm: number;
}

export function createShareLedger(): ShareLedger {
  return { typedBySlot: [0, 0, 0, 0, 0, 0], seal: 0, cleanse: 0, auto: 0, mechanism: 0, consumable: 0, formation: 0 };
}

/** Books `amount` effective HP under the hit's source. */
export function bucketAdd(world: World, source: HitSource, amount: number): void {
  if (amount <= 0) return;
  const ledger = world.shares;
  switch (source) {
    case "slot1":
      ledger.typedBySlot[1] = ledger.typedBySlot[1]! + amount;
      return;
    case "slot2":
      ledger.typedBySlot[2] = ledger.typedBySlot[2]! + amount;
      return;
    case "slot4":
      ledger.typedBySlot[4] = ledger.typedBySlot[4]! + amount;
      return;
    case "slot5":
      ledger.typedBySlot[5] = ledger.typedBySlot[5]! + amount;
      return;
    case "seal":
      ledger.seal += amount;
      return;
    case "cleanse":
      ledger.cleanse += amount;
      return;
    case "auto":
      ledger.auto += amount;
      return;
    case "mechanism":
      ledger.mechanism += amount;
      return;
    case "consumable":
      ledger.consumable += amount;
      return;
    case "formation":
      ledger.formation += amount;
      return;
  }
}

/** Typed damage: every Cast from a word (ô 1–5, Ấn, Tẩy; canon §7.2). */
export function typedTotal(ledger: ShareLedger): number {
  let typed = ledger.seal + ledger.cleanse;
  for (const amount of ledger.typedBySlot) typed += amount;
  return typed;
}

export function supportTotal(ledger: ShareLedger): number {
  return ledger.mechanism + ledger.consumable + ledger.formation;
}

const permille = (part: number, whole: number): number => (whole > 0 ? Math.round((part * 1000) / whole) : 0);

export function shares(world: World): ShareSummary {
  const ledger = world.shares;
  const typed = typedTotal(ledger);
  const support = supportTotal(ledger);
  const all = typed + ledger.auto + support;
  return {
    typedPm: permille(typed, all),
    autoPm: permille(ledger.auto, all),
    supportPm: permille(support, all),
    slot1OfTypedPm: permille(ledger.typedBySlot[1]!, typed),
  };
}
