/** Presentation clock only: it never schedules, holds or dispatches a Cast. */
export const WORD_FX = { enterMs: 220, staggerMs: 1000 / 60, keyMs: 80, keyScale: 1.22, errorMs: 150, flashMs: 40, exitMs: 640, motes: 8, motePx: 36, moteOpacity: .9 } as const;
export type WordPhase = "empty" | "enter" | "steady" | "flash" | "depart";
export type WordDirection = "attack" | "defence";
export interface WordParticle { x: number; y: number; turn: number; opacity: number }

const clamp = (n: number): number => Math.max(0, Math.min(1, n));

/** Browser and game accessibility choices both suppress travel, bounce and shake. */
export function wordMotionReduced(game: string | undefined, system: boolean): boolean {
  return game === "reduce" || system;
}

export class WordFx {
  release = 0;
  text = "";
  typed = 0;
  locked = false;
  preview = false;
  private identity = "";
  private enteredAt = -Infinity;
  private finishedAt = -Infinity;
  private errorAt = -Infinity;
  private direction: WordDirection = "attack";
  private readonly keys: number[] = [];

  phase(now: number): WordPhase {
    const age = now - this.finishedAt;
    if (age < WORD_FX.flashMs) return "flash";
    if (age < WORD_FX.exitMs) return "depart";
    if (!this.text) return "empty";
    return now - this.enteredAt < WORD_FX.enterMs ? "enter" : "steady";
  }

  leaving(now: number): boolean {
    return now - this.finishedAt < WORD_FX.exitMs;
  }

  /** A replacement waits for the outgoing letters, including in reduced motion. */
  show(text: string, identity: string, typed: number, locked: boolean, preview: boolean, now: number): void {
    if (this.leaving(now)) return;
    if (this.identity !== identity || this.text !== text) {
      this.identity = identity;
      this.text = text;
      this.enteredAt = now;
      this.keys.length = 0;
      this.errorAt = -Infinity;
    }
    this.typed = typed;
    this.locked = locked;
    this.preview = preview;
    for (let i = typed; i < this.keys.length; i += 1) this.keys[i] = -Infinity;
  }

  correct(typed: number, now: number): void {
    if (!this.locked || this.leaving(now)) return;
    this.keys[typed - 1] = now;
  }

  wrong(now: number): void {
    if (this.locked && !this.leaving(now)) this.errorAt = now;
  }

  finish(text: string, direction: WordDirection, now: number): void {
    // Rapid zero-cooldown casts never extend the current exit or delay the sim.
    if (this.leaving(now)) return;
    this.release += 1;
    this.text = text;
    this.typed = text.length;
    this.locked = false;
    this.preview = false;
    this.direction = direction;
    this.finishedAt = now;
    this.errorAt = -Infinity;
  }

  flash(now: number): number {
    return 1 - clamp((now - this.finishedAt) / WORD_FX.flashMs);
  }

  error(now: number): number {
    return this.locked ? 1 - clamp((now - this.errorAt) / WORD_FX.errorMs) : 0;
  }

  shake(now: number, reduced: boolean): number {
    return reduced ? 0 : 3 * this.error(now) * Math.sin((now - this.errorAt) * Math.PI / 25) || 0;
  }

  keyGlow(index: number, now: number, reduced: boolean): number {
    const p = clamp((now - (this.keys[index] ?? -Infinity)) / WORD_FX.keyMs);
    return this.locked && !reduced ? Math.sin(p * Math.PI) * .8 : 0;
  }

  /** Absolute CSS-pixel travel; the canvas layer clips protected field landmarks. */
  travel(index: number, now: number, reduced: boolean, maxDrop = Infinity): WordParticle {
    const p = clamp((now - this.finishedAt - WORD_FX.flashMs) / (WORD_FX.exitMs - WORD_FX.flashMs));
    const offset = this.text.length > 1 ? index / (this.text.length - 1) : .5;
    // Reach the attack's full height before the fade, while the glyph is still legible.
    const t = this.direction === "attack" ? Math.min(1, p / .6) : p;
    const q = 1 - (1 - t) * (1 - t);
    const fade = clamp((p - .55) / .45);
    const opacity = 1 - fade * fade * (3 - 2 * fade);
    let x = (offset - .5) * (36 * q + 24 * Math.sin(t * Math.PI));
    let y = -(80 + 30 * offset) * q;
    if (this.direction === "defence") {
      const fall = Math.min(1, p / .7);
      const drop = Math.min(50 + 30 * offset, Math.max(0, maxDrop));
      const rebound = Math.min(12, drop * .24);
      y = drop * fall * fall - (p > .7 ? rebound * Math.sin((p - .7) / .3 * Math.PI) : 0);
      x = (offset - .5) * 22 * q;
    }
    return { x: reduced ? 0 : x, y: reduced ? 0 : y, turn: reduced ? 0 : (offset - .5) * 20 * q, opacity };
  }

  letter(index: number, now: number, reduced: boolean): { opacity: number; transform: string } {
    if (this.leaving(now)) {
      const { x, y, turn, opacity } = this.travel(index, now, reduced);
      return { opacity, transform: `translate(${x}px, ${y}px) rotate(${turn}deg)` };
    }
    const stagger = reduced ? 0 : Math.min(WORD_FX.staggerMs, 120 / Math.max(1, this.text.length - 1));
    const duration = WORD_FX.enterMs - stagger * Math.max(0, this.text.length - 1);
    const appear = clamp((now - this.enteredAt - index * stagger) / duration);
    const key = clamp((now - (this.keys[index] ?? -Infinity)) / WORD_FX.keyMs);
    const bounce = this.locked && !reduced ? (WORD_FX.keyScale - 1) * Math.sin(key * Math.PI) : 0;
    const emphasis = index === 0 && !this.preview && !reduced ? 0.035 * (1 - appear) : 0;
    return { opacity: this.locked ? 1 : appear, transform: `scale(${Math.min(1.25, 1 + bounce + emphasis)})` };
  }

  moteTravel(index: number, now: number, reduced: boolean, maxDrop = Infinity): WordParticle & { scale: number } {
    const p = clamp((now - this.finishedAt - WORD_FX.flashMs) / (WORD_FX.exitMs - WORD_FX.flashMs));
    const appear = clamp((now - this.finishedAt - WORD_FX.flashMs - index * 10) / 70);
    const glyph = Math.round(index / (WORD_FX.motes - 1) * (this.text.length - 1));
    const opacity = !reduced && this.leaving(now) ? Math.sin(appear * Math.PI / 2) * WORD_FX.moteOpacity * this.travel(glyph, now, false, maxDrop).opacity : 0;
    const trail = this.travel(glyph, now - 24 - (index % 3) * 22, false, maxDrop);
    const x = trail.x + (index % 2 ? 1 : -1) * (4 + p * 8);
    const y = trail.y + (this.direction === "attack" ? 1 : -1) * (6 + index * 2);
    return { x, y, turn: 0, opacity, scale: 1 + (1 - p) * .3 };
  }

  mote(index: number, now: number, reduced: boolean): { opacity: number; transform: string } {
    const { x, y, opacity, scale } = this.moteTravel(index, now, reduced);
    return { opacity, transform: reduced ? "none" : `translate(${x}px, ${y}px) scale(${scale})` };
  }
}
