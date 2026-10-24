// Source: new for the kit, from dragon-hold 00 §5 and docs/td/TYPING_DEFENSE_DESIGN.md 6.5 (log fixes in shared/game-kit/DRIFT.md)
/**
 * The letter budget: how many words may live at once, from A (the letters
 * that start at least 3 of the stage's words), and who may take a slot.
 *
 *   N_max   = min(totalMax; A − slack)              every word, every kind
 *   K_enemy = max(enemyMin; ⌈enemyPct % × N_max⌉)   kept for enemies, `urgent` of them for urgent ones
 *   S_other = min(otherMax; N_max − K_enemy)       every other source together
 *
 * A ledger counts live words per source (each with its own cap and pool) and
 * refuses a slot that would break the budget; a refusal is a jam, counted per
 * source for the bots. TD's older stream cap is streamCap.
 */
import type { BudgetRules, StreamRules } from "./config";

export type LetterBudget = { readonly total: number; readonly enemy: number; readonly urgent: number; readonly other: number };

export function letterBudget(available: number, rules: BudgetRules): LetterBudget {
  const total = Math.max(0, Math.min(rules.totalMax, 26, available - rules.slack));
  const enemy = Math.min(total, Math.max(rules.enemyMin, Math.ceil((rules.enemyPct * total) / 100)));
  return { total, enemy, urgent: Math.min(rules.urgent, enemy), other: Math.max(0, Math.min(rules.otherMax, total - enemy)) };
}

/** TD 6.5's stream cap: clamp(A − slack; min; max). */
export const streamCap = (available: number, rules: StreamRules): number => Math.max(rules.min, Math.min(rules.max, available - rules.slack));

/** A source's pool: enemies, urgent enemies (may use the urgent slots), or everything else. */
export const POOL = { enemy: 0, urgent: 1, other: 2 } as const;
export type Pool = (typeof POOL)[keyof typeof POOL];

export type BudgetSource = { readonly id: string; readonly pool: Pool; /** Live words of this source at most. */ readonly cap: number };

export class BudgetLedger {
  readonly live: Int16Array;
  readonly jams: Int32Array;
  private readonly index = new Map<string, number>();

  constructor(public budget: LetterBudget, readonly sources: readonly BudgetSource[]) {
    sources.forEach((source, i) => this.index.set(source.id, i));
    this.live = new Int16Array(sources.length);
    this.jams = new Int32Array(sources.length);
  }

  /** The index of source `id` (throws on an unknown one: a typo, not a rule). */
  source(id: string): number {
    const i = this.index.get(id);
    if (i === undefined) throw new Error("budget: unknown source " + id);
    return i;
  }

  private sum(pool?: Pool): number {
    let total = 0;
    this.sources.forEach((source, i) => {
      if (pool === undefined || source.pool === pool) total += this.live[i]!;
    });
    return total;
  }

  get total(): number {
    return this.sum();
  }

  /** Whether source `i` may put one more word live now. */
  canAdd(i: number): boolean {
    const source = this.sources[i]!;
    const total = this.sum();
    if (this.live[i]! >= source.cap || total >= this.budget.total) return false;
    if (source.pool === POOL.other) return this.sum(POOL.other) < this.budget.other;
    if (source.pool === POOL.urgent) return true;
    // A plain enemy leaves the urgent slots not yet in use.
    return total + Math.max(0, this.budget.urgent - this.sum(POOL.urgent)) < this.budget.total;
  }

  /** Counts a word of source `i` in; false (a jam, counted) when the budget refuses it. */
  add(i: number): boolean {
    if (!this.canAdd(i)) {
      this.jams[i] = this.jams[i]! + 1;
      return false;
    }
    this.live[i] = this.live[i]! + 1;
    return true;
  }

  remove(i: number): void {
    if (this.live[i]! > 0) this.live[i] = this.live[i]! - 1;
  }

  clear(): void {
    this.live.fill(0);
  }
}
