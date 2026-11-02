/**
 * Damage compilation (power pass, canon D58 (5), POWER_RESEARCH §5: "gộp theo
 * đòn, không theo từng va chạm"): blows on one target within an attack's
 * window (150 ms; a field-wide attack 500 ms, at most two packets a target a
 * second) become one packet, "12.8K×6"; when one attack's window lands on five
 * or more swarm or small beasts standing together (a 6 m cell of the field),
 * they show as ONE cluster total at their centroid instead; elites and kings
 * always keep their own number. View only: the sim owns damage; the game
 * feeds this from its hit events, the lab from its stand-ins. Preallocated,
 * no allocation per blow (a label string is built when a packet shows).
 */
import type { SkillNumbers } from "./hitfx";

/** One target's open packet. */
interface Packet {
  open: boolean;
  attack: number;
  target: number;
  value: number;
  hits: number;
  crit: boolean;
  x: number;
  y: number;
  z: number;
  rgb: number;
  beastTier: number;
  big: boolean;
  /** Seconds since its first blow, and its attack's window. */
  age: number;
  window: number;
}

const CAP = 256;
/** Five or more small beasts of one attack in one cell show one cluster total. */
const CLUSTER_MIN = 5;
const CELL_M = 6;
/** Cluster keys sit above every target slot. */
const CLUSTER_KEY = 1 << 20;

export class DamageCompiler {
  private readonly packets: Packet[] = [];
  /** Per flush: which packets of one attack are due, grouped by cell (scratch). */
  private readonly due = new Int32Array(CAP);
  private readonly cell = new Int32Array(CAP);
  private readonly used = new Uint8Array(CAP);
  /** Packets shown and clusters shown since reset (captures read them). */
  shown = 0;
  clusters = 0;

  constructor(private readonly numbers: SkillNumbers) {
    for (let i = 0; i < CAP; i += 1) {
      this.packets.push({ open: false, attack: 0, target: -1, value: 0, hits: 0, crit: false, x: 0, y: 0, z: 0, rgb: 0xffffff, beastTier: 0, big: false, age: 0, window: 0.15 });
    }
  }

  /**
   * A blow of `attack` (an id per release) on `target` worth `value`; `window`
   * the attack's compile time (s); `big` a finisher or major strike (a bigger number).
   */
  add(attack: number, target: number, value: number, crit: boolean, x: number, y: number, z: number, rgb: number, beastTier: number, window: number, big: boolean): void {
    let free = -1;
    for (let i = 0; i < CAP; i += 1) {
      const p = this.packets[i]!;
      if (p.open && p.target === target && p.attack === attack) {
        p.value += value;
        p.hits += 1;
        p.crit = p.crit || crit;
        p.big = p.big || big;
        p.x = x;
        p.y = y;
        p.z = z;
        return;
      }
      if (!p.open && free < 0) free = i;
    }
    if (free < 0) return;
    const p = this.packets[free]!;
    p.open = true;
    p.attack = attack;
    p.target = target;
    p.value = value;
    p.hits = 1;
    p.crit = crit;
    p.big = big;
    p.x = x;
    p.y = y;
    p.z = z;
    p.rgb = rgb;
    p.beastTier = beastTier;
    p.age = 0;
    p.window = window;
  }

  update(dt: number): void {
    for (let i = 0; i < CAP; i += 1) {
      const p = this.packets[i]!;
      if (p.open) p.age += dt;
    }
    for (let i = 0; i < CAP; i += 1) {
      const p = this.packets[i]!;
      if (p.open && p.age >= p.window) this.flush(p.attack);
    }
  }

  /** Shows every due packet of `attack`: clusters first, then the rest one by one. */
  private flush(attack: number): void {
    let n = 0;
    for (let i = 0; i < CAP; i += 1) {
      const p = this.packets[i]!;
      if (!p.open || p.attack !== attack || p.age < p.window) continue;
      this.due[n] = i;
      this.cell[n] = p.beastTier >= 2 ? -1 : Math.floor(p.x / CELL_M + 64) * 256 + Math.floor(p.z / CELL_M + 64);
      this.used[n] = 0;
      n += 1;
    }
    for (let a = 0; a < n; a += 1) {
      const c = this.cell[a]!;
      if (c < 0 || this.used[a] === 1) continue;
      let members = 0;
      for (let b = a; b < n; b += 1) if (this.cell[b] === c && this.used[b] === 0) members += 1;
      if (members < CLUSTER_MIN) continue;
      let sum = 0;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let crit = false;
      let rgb = 0xffffff;
      for (let b = a; b < n; b += 1) {
        if (this.cell[b] !== c || this.used[b] === 1) continue;
        const p = this.packets[this.due[b]!]!;
        sum += p.value;
        cx += p.x;
        cy += p.y;
        cz += p.z;
        crit = crit || p.crit;
        rgb = p.rgb;
        this.used[b] = 1;
        p.open = false;
      }
      // One total at the centroid, "×N" the beasts it struck; a cluster reads as a big blow (tier 3).
      this.numbers.show(CLUSTER_KEY + ((attack * 977 + c) & 0xfffff), sum, members, cx / members, cy / members + 0.3, cz / members, crit, rgb, 4);
      this.clusters += 1;
      this.shown += 1;
    }
    for (let a = 0; a < n; a += 1) {
      if (this.used[a] === 1) continue;
      const p = this.packets[this.due[a]!]!;
      p.open = false;
      this.numbers.show(p.target, p.value, p.hits, p.x, p.y, p.z, p.crit, p.rgb, p.big || p.beastTier >= 4 ? 3 : 2);
      this.shown += 1;
    }
  }

  reset(): void {
    for (const p of this.packets) p.open = false;
    this.shown = this.clusters = 0;
  }
}
