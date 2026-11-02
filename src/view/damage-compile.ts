/**
 * Damage compilation (power pass, canon D58 (5), POWER_RESEARCH §5: "gộp theo
 * đòn, không theo từng va chạm"): blows on one target within an attack's
 * window (150 ms) become one packet, "12.8K×6"; when one attack's window lands
 * on five or more swarm or small beasts standing together (a 6 m cell of the
 * field), they show as ONE cluster total at their centroid instead; elites and
 * kings always keep their own number.
 * Round 2 (both blind judges: "about 35 numbers at mixed sizes compete, white
 * ones fade over the swords, some float off the field, no headline"):
 * - an AREA attack (a field-wide skill) adds up its blows on small beasts per
 *   8 m cell of the field over 1 s (one number per cell and wave), and on an
 *   elite or the king per target over 1 s: about 70 % fewer numbers;
 * - the size says the weight: a lone small hit is small and short-lived (T1),
 *   a packet T2, a cluster or a finisher's cell T3, a big hit or a crit T4
 *   (2–3× a small one, strong pop), a big skill's headline T5;
 * - a HEADLINE attack (a field-wide skill or an ultimate) shows one running
 *   total at the top of the view that counts up while it lands and pops on its
 *   finisher.
 * View only: the sim owns damage; the game feeds this from its hit events, the
 * lab from its stand-ins. Preallocated, no allocation per blow (a label string
 * is built when a packet shows or the headline's value changes).
 */
import type { SkillNumbers } from "./hitfx";

/** One target's (or one cell's) open packet. */
interface Packet {
  open: boolean;
  attack: number;
  /** A target slot, or CELL_KEY + a cell for an area attack's small beasts. */
  key: number;
  value: number;
  hits: number;
  /** Crit blows in it: the packet reads as a crit (gold, big) only when a third or more of its blows were. */
  crits: number;
  crit: boolean;
  /** Position: the last blow's (a target) or the blows' mean (a cell). */
  x: number;
  y: number;
  z: number;
  rgb: number;
  beastTier: number;
  big: boolean;
  cell: boolean;
  /** Seconds since its first blow, and its attack's window. */
  age: number;
  window: number;
}

const CAP = 256;
/** Five or more small beasts of one attack in one cell show one cluster total. */
const CLUSTER_MIN = 5;
const CELL_M = 6;
/** Cluster keys sit above every target slot; an area attack's cells above those. */
const CLUSTER_KEY = 1 << 20;
const CELL_KEY = (1 << 20) + (1 << 19);
/** An area attack's cells and its window (s). */
const AREA_CELL_M = 8;
const AREA_WINDOW_S = 1;
/** The headline stops counting this long (s) after its attack's last blow, then fades over HEADLINE_FADE_S. */
const HEADLINE_IDLE_S = 0.6;
const HEADLINE_FADE_S = 1.4;

export class DamageCompiler {
  private readonly packets: Packet[] = [];
  /** Per flush: which packets of one attack are due, grouped by cell (scratch). */
  private readonly due = new Int32Array(CAP);
  private readonly cell = new Int32Array(CAP);
  private readonly used = new Uint8Array(CAP);
  /** The headline attack (−1 none), its running total, hits, colour, time since its last blow, and a pop owed. */
  private headAttack = -1;
  private headTotal = 0;
  private headHits = 0;
  private headRgb = 0xffffff;
  private headIdle = 0;
  private headPop = false;
  private headShown = -1;
  /** Packets shown and clusters shown since reset (captures read them), and headline updates. */
  shown = 0;
  clusters = 0;

  constructor(private readonly numbers: SkillNumbers) {
    for (let i = 0; i < CAP; i += 1) {
      this.packets.push({ open: false, attack: 0, key: -1, value: 0, hits: 0, crits: 0, crit: false, x: 0, y: 0, z: 0, rgb: 0xffffff, beastTier: 0, big: false, cell: false, age: 0, window: 0.15 });
    }
  }

  /**
   * A blow of `attack` (an id per release) on `target` worth `value`; `window` the attack's compile time (s; an
   * `area` attack uses AREA_WINDOW_S and cells for its small beasts); `big` a finisher or major strike (a bigger
   * number).
   */
  add(attack: number, target: number, value: number, crit: boolean, x: number, y: number, z: number, rgb: number, beastTier: number, window: number, big: boolean, area = false): void {
    if (attack === this.headAttack) {
      this.headTotal += value;
      this.headHits += 1;
      this.headRgb = rgb;
      this.headIdle = 0;
    }
    const cellPacket = area && beastTier < 2;
    const key = cellPacket ? CELL_KEY + (Math.floor(x / AREA_CELL_M + 32) * 64 + Math.floor(z / AREA_CELL_M + 32)) : target;
    const win = area ? AREA_WINDOW_S : window;
    let free = -1;
    for (let i = 0; i < CAP; i += 1) {
      const p = this.packets[i]!;
      if (p.open && p.key === key && p.attack === attack) {
        p.value += value;
        p.hits += 1;
        if (crit) p.crits += 1;
        p.crit = p.crits * 3 >= p.hits;
        p.big = p.big || big;
        if (p.cell) {
          // The cell's number sits at its blows' middle.
          const k = 1 / p.hits;
          p.x += (x - p.x) * k;
          p.y += (y - p.y) * k;
          p.z += (z - p.z) * k;
        } else {
          p.x = x;
          p.y = y;
          p.z = z;
        }
        if (beastTier > p.beastTier) p.beastTier = beastTier;
        return;
      }
      if (!p.open && free < 0) free = i;
    }
    if (free < 0) return;
    const p = this.packets[free]!;
    p.open = true;
    p.attack = attack;
    p.key = key;
    p.value = value;
    p.hits = 1;
    p.crits = crit ? 1 : 0;
    p.crit = crit;
    p.big = big;
    p.x = x;
    p.y = y;
    p.z = z;
    p.rgb = rgb;
    p.beastTier = beastTier;
    p.cell = cellPacket;
    p.age = 0;
    p.window = win;
  }

  /** `attack`'s blows add up into one headline total at the top of the view (a field-wide skill or an ultimate). */
  headline(attack: number): void {
    this.headAttack = attack;
    this.headTotal = 0;
    this.headHits = 0;
    this.headIdle = 0;
    this.headPop = false;
    this.headShown = -1;
  }

  /** The headline attack's finisher landed: its total pops. */
  finisher(attack: number): void {
    if (attack === this.headAttack) this.headPop = true;
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
    if (this.headAttack >= 0 && this.headTotal > 0) {
      this.headIdle += dt;
      if (this.headIdle <= HEADLINE_IDLE_S && (this.headTotal !== this.headShown || this.headPop)) {
        this.numbers.headline(this.headTotal, this.headHits, this.headRgb, this.headPop, HEADLINE_FADE_S);
        this.headShown = this.headTotal;
        this.headPop = false;
      }
    }
  }

  /** Shows every due packet of `attack`: clusters first, then the rest one by one. */
  private flush(attack: number): void {
    let n = 0;
    for (let i = 0; i < CAP; i += 1) {
      const p = this.packets[i]!;
      if (!p.open || p.attack !== attack || p.age < p.window) continue;
      this.due[n] = i;
      this.cell[n] = p.cell || p.beastTier >= 2 ? -1 : Math.floor(p.x / CELL_M + 64) * 256 + Math.floor(p.z / CELL_M + 64);
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
      // One total at the centroid, "×N" the beasts it struck; a cluster reads as a big blow (T3).
      this.numbers.show(CLUSTER_KEY + ((attack * 977 + c) & 0x7ffff), sum, members, cx / members, cy / members + 0.3, cz / members, crit, rgb, 3);
      this.clusters += 1;
      this.shown += 1;
    }
    for (let a = 0; a < n; a += 1) {
      if (this.used[a] === 1) continue;
      const p = this.packets[this.due[a]!]!;
      p.open = false;
      // The size says the weight: a cell T2 (a finisher's T3), a big hit or a crit T4, a lone small hit T1 (an
      // elite's or a compiled packet T2).
      const tier = p.cell ? (p.big ? 3 : 2) : p.big || p.crit || p.beastTier >= 4 ? 4 : p.hits > 1 || p.beastTier >= 2 ? 2 : 1;
      this.numbers.show(p.key, p.value, p.hits, p.x, p.y + (p.cell ? 0.3 : 0), p.z, p.crit, p.rgb, tier);
      if (p.cell) this.clusters += 1;
      this.shown += 1;
    }
  }

  reset(): void {
    for (const p of this.packets) p.open = false;
    this.shown = this.clusters = 0;
    this.headAttack = -1;
    this.headTotal = this.headHits = 0;
    this.headShown = -1;
    this.headPop = false;
  }
}
