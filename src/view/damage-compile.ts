/**
 * Damage compilation (power pass, canon D58 (5), POWER_RESEARCH §5). Round 3a (P7; the diagnosis of 03/11/2026:
 * "never more than eight combat-number objects visible", and both round-2 judges counted 12 to 30+ labels over the
 * beasts, some cut off at the frame's edge) makes it a budget, not a hierarchy of sizes:
 * - blows add up per attack and target, and every 125 ms (BATCH_S) an attack's batch is decided at once;
 * - a HEADLINE attack (a field-wide skill, an ultimate, a multi-target skill: the host says which) shows one
 *   running total that counts every blow, and pops on its finisher;
 * - of a batch, at most 2 crits or elites (crit, elite, king) and at most 4 notable victims (the largest packets)
 *   get their own number; a packet under 15 % of the attack's largest so far (MICRO) is total-only, and so is
 *   everything past the budgets;
 * - a new batch fades the attack's older victim numbers at once (SkillNumbers.fadeVictims);
 * - the number field itself never holds more than 8 (hitfx.ts SKILL_NUMBER_CAP: 2 headlines, 4 victims, 2 crits),
 *   keeps every label 5 % inside the view and moves it off any word tag.
 * View only: the sim owns damage; the game feeds this from its hit events, the lab from its stand-ins.
 * Preallocated, no allocation per blow (a label string is built when a number shows or its value changes).
 */
import type { SkillNumbers } from "./hitfx";

/** One target's open packet in an attack's batch. */
interface Packet {
  open: boolean;
  attack: number;
  target: number;
  value: number;
  hits: number;
  crits: number;
  x: number;
  y: number;
  z: number;
  rgb: number;
  beastTier: number;
  big: boolean;
}

/** An attack with blows in flight: its batch clock, its largest packet so far, its headline. */
interface Attack {
  id: number;
  batchAge: number;
  open: boolean;
  largest: number;
  headline: boolean;
  lane: number;
  total: number;
  hits: number;
  rgb: number;
  idle: number;
  pop: boolean;
  shown: number;
}

const CAP = 256;
const ATTACKS = 8;
/** An attack's batch: its blows are decided together this long after the batch's first blow (s). */
export const BATCH_S = 0.125;
/** A packet under this share of the attack's largest packet so far shows only in its total. */
export const MICRO = 0.15;
/** Own numbers per batch: crits and elites, then notable victims. */
export const BATCH_CRITS = 2;
export const BATCH_VICTIMS = 4;
/** A headline stops counting this long (s) after its attack's last blow, then fades over HEADLINE_FADE_S. */
const HEADLINE_IDLE_S = 0.6;
const HEADLINE_FADE_S = 1.4;

export class DamageCompiler {
  private readonly packets: Packet[] = [];
  private readonly attacks: Attack[] = [];
  /** A batch's packets (scratch indices) and which already have a number. */
  private readonly due = new Int32Array(CAP);
  private readonly used = new Uint8Array(CAP);
  /** Numbers shown since reset (captures read them) and packets that went into a total only. */
  shown = 0;
  totalOnly = 0;
  /** Kept for the lab's report: round 2's cluster totals (none since round 3a). */
  readonly clusters = 0;

  constructor(private readonly numbers: SkillNumbers) {
    for (let i = 0; i < CAP; i += 1) this.packets.push({ open: false, attack: 0, target: -1, value: 0, hits: 0, crits: 0, x: 0, y: 0, z: 0, rgb: 0xffffff, beastTier: 0, big: false });
    for (let i = 0; i < ATTACKS; i += 1) this.attacks.push({ id: -1, batchAge: 0, open: false, largest: 0, headline: false, lane: 0, total: 0, hits: 0, rgb: 0xffffff, idle: 0, pop: false, shown: -1 });
  }

  /** The attack's record (a new one takes the slot of the oldest idle attack). */
  private attack(id: number): Attack {
    let free: Attack | null = null;
    for (const a of this.attacks) {
      if (a.id === id) return a;
      if (free === null && (a.id < 0 || (!a.open && !a.headline))) free = a;
    }
    if (free === null) {
      free = this.attacks[0]!;
      for (const a of this.attacks) if (a.id < free.id) free = a;
    }
    free.id = id;
    free.batchAge = 0;
    free.open = false;
    free.largest = 0;
    free.headline = false;
    free.total = free.hits = 0;
    free.idle = 0;
    free.pop = false;
    free.shown = -1;
    return free;
  }

  /**
   * A blow of `attack` (an id per release) on `target` worth `value`; `big` a finisher or major strike. The window
   * and area flags of round 2 are accepted and ignored (every attack batches over BATCH_S).
   */
  add(attack: number, target: number, value: number, crit: boolean, x: number, y: number, z: number, rgb: number, beastTier: number, _window = BATCH_S, big = false, _area = false): void {
    const a = this.attack(attack);
    if (a.headline) {
      a.total += value;
      a.hits += 1;
      a.rgb = rgb;
      a.idle = 0;
    }
    if (!a.open) {
      a.open = true;
      a.batchAge = 0;
    }
    let free = -1;
    for (let i = 0; i < CAP; i += 1) {
      const p = this.packets[i]!;
      if (p.open && p.target === target && p.attack === attack) {
        p.value += value;
        p.hits += 1;
        if (crit) p.crits += 1;
        p.big = p.big || big;
        p.x = x;
        p.y = y;
        p.z = z;
        if (beastTier > p.beastTier) p.beastTier = beastTier;
        return;
      }
      if (!p.open && free < 0) free = i;
    }
    if (free < 0) {
      // Every packet slot is open: this blow counts in the total only.
      this.totalOnly += 1;
      return;
    }
    const p = this.packets[free]!;
    p.open = true;
    p.attack = attack;
    p.target = target;
    p.value = value;
    p.hits = 1;
    p.crits = crit ? 1 : 0;
    p.big = big;
    p.x = x;
    p.y = y;
    p.z = z;
    p.rgb = rgb;
    p.beastTier = beastTier;
  }

  /** `attack`'s blows add up into one running headline total (a field-wide skill, an ultimate, a multi-target skill). */
  headline(attack: number): void {
    const a = this.attack(attack);
    a.headline = true;
    a.total = a.hits = 0;
    a.idle = 0;
    a.pop = false;
    a.shown = -1;
    // Two lanes: a second headline running at once sits under the first.
    let lane = 0;
    for (const o of this.attacks) if (o !== a && o.headline && o.idle <= HEADLINE_IDLE_S && o.lane === lane) lane = 1;
    a.lane = lane;
  }

  /** The headline attack's finisher landed: its total pops. */
  finisher(attack: number): void {
    for (const a of this.attacks) if (a.id === attack && a.headline) a.pop = true;
  }

  update(dt: number): void {
    for (const a of this.attacks) {
      if (a.id < 0) continue;
      if (a.open) {
        a.batchAge += dt;
        if (a.batchAge >= BATCH_S) this.flush(a);
      }
      if (a.headline && a.total > 0) {
        a.idle += dt;
        if (a.idle <= HEADLINE_IDLE_S && (a.total !== a.shown || a.pop)) {
          this.numbers.headline(a.total, a.hits, a.rgb, a.pop, HEADLINE_FADE_S, a.lane);
          a.shown = a.total;
          a.pop = false;
        }
      }
    }
  }

  /** Decides one batch of `a`: crits and elites, then notable victims, the rest in the total only. */
  private flush(a: Attack): void {
    a.open = false;
    let n = 0;
    for (let i = 0; i < CAP; i += 1) {
      const p = this.packets[i]!;
      if (!p.open || p.attack !== a.id) continue;
      this.due[n] = i;
      this.used[n] = 0;
      n += 1;
      if (p.value > a.largest) a.largest = p.value;
    }
    if (n === 0) return;
    // The attack's older victim numbers give way to this batch.
    this.numbers.fadeVictims(a.id);
    const micro = a.largest * MICRO;
    for (let pass = 0; pass < 2; pass += 1) {
      const budget = pass === 0 ? BATCH_CRITS : BATCH_VICTIMS;
      for (let k = 0; k < budget; k += 1) {
        // The largest packet left in this pass's class.
        let best = -1;
        for (let j = 0; j < n; j += 1) {
          if (this.used[j] === 1) continue;
          const p = this.packets[this.due[j]!]!;
          const critClass = p.crits * 3 >= p.hits || p.beastTier >= 2;
          // Crits and elites past their budget stay in the total, like micro packets.
          if (pass === 0 ? !critClass : critClass || p.value < micro) continue;
          if (best < 0 || p.value > this.packets[this.due[best]!]!.value) best = j;
        }
        if (best < 0) break;
        this.used[best] = 1;
        const p = this.packets[this.due[best]!]!;
        const crit = p.crits * 3 >= p.hits;
        // Size by weight: a crit, an elite or a finisher T4, a compiled packet T2, a lone hit T1.
        const tier = pass === 0 || p.big ? 4 : p.hits > 1 ? 2 : 1;
        this.numbers.show(p.target, p.value, p.hits, p.x, p.y, p.z, crit, p.rgb, tier, 0, a.id);
        this.shown += 1;
      }
    }
    for (let j = 0; j < n; j += 1) {
      this.packets[this.due[j]!]!.open = false;
      if (this.used[j] === 0) this.totalOnly += 1;
    }
  }

  reset(): void {
    for (const p of this.packets) p.open = false;
    for (const a of this.attacks) {
      a.id = -1;
      a.open = a.headline = false;
    }
    this.shown = this.totalOnly = 0;
  }
}
