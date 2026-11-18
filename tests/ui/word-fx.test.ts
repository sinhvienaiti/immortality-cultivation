import { describe, expect, it } from "vitest";
import { WordFx, WORD_FX, wordMotionReduced } from "../../src/ui/word-fx";
import { WORD_FX_CSS, WORD_GLINT_COLOR } from "../../src/ui/styles/word-fx-css";

const scale = (transform: string): number => Number(transform.match(/scale\(([^)]+)\)/)?.[1]);

describe("word lifecycle presentation clock", () => {
  it("staggers arrival by one 60 Hz frame and settles the entire word at 220 ms", () => {
    const fx = new WordFx();
    fx.show("lantern", "1", 0, false, false, 0);
    expect(fx.phase(0)).toBe("enter");
    expect(fx.letter(0, 16, false).opacity).toBeGreaterThan(0);
    expect(fx.letter(1, 16, false).opacity).toBe(0);
    expect(fx.letter(1, 34, false).opacity).toBeGreaterThan(0);
    for (let i = 0; i < 7; i += 1) expect(fx.letter(i, 220, false)).toEqual({ opacity: 1, transform: "scale(1)" });
    expect(fx.phase(220)).toBe("steady");
  });

  it("bounces only the locked correct glyph to 1.22 in 80 ms, adds gold light, and bounds errors", () => {
    const fx = new WordFx();
    fx.show("stone", "1", 1, true, false, 0);
    fx.correct(1, 300);
    fx.wrong(300);
    expect(scale(fx.letter(0, 340, false).transform)).toBeCloseTo(1.22);
    expect(fx.keyGlow(0, 340, false)).toBeCloseTo(.8);
    expect(fx.keyGlow(1, 340, false)).toBeCloseTo(0);
    expect(scale(fx.letter(1, 340, false).transform)).toBe(1);
    for (let now = 300; now < 450; now += 1) {
      expect(scale(fx.letter(0, now, false).transform)).toBeLessThanOrEqual(1.25);
      expect(Math.abs(fx.shake(now, false))).toBeLessThanOrEqual(3);
    }
    expect(fx.letter(0, 380, false).transform).toBe("scale(1)");
    expect(fx.error(450)).toBe(0);
    fx.show("stone", "1", 0, false, false, 500);
    fx.correct(1, 500);
    fx.wrong(500);
    expect(fx.error(510)).toBe(0);
    expect(fx.letter(0, 540, false).transform).toBe("scale(1)");
  });

  it("flies upward 80–110 px along a curve while still legible, then fades completely at 640 ms", () => {
    const fx = new WordFx();
    fx.show("stone", "1", 4, true, false, 0);
    fx.finish("stone", "attack", 300);
    expect(fx.phase(300)).toBe("flash");
    expect(fx.flash(300)).toBe(1);
    expect(fx.flash(340)).toBe(0);
    expect(fx.phase(340)).toBe("depart");
    fx.show("river", "2", 0, false, false, 400);
    expect(fx.text).toBe("stone");
    expect(fx.travel(0, 640, false).y).toBeLessThan(-40);
    const end = [0, 1, 2, 3, 4].map(i => fx.travel(i, 940, false));
    expect(end.map(p => -p.y)).toEqual([80, 87.5, 95, 102.5, 110]);
    for (let i = 0; i < 5; i += 1) {
      const visible = fx.travel(i, 700, false);
      expect(-visible.y).toBeGreaterThanOrEqual(80);
      expect(-visible.y).toBeLessThanOrEqual(110);
      expect(visible.opacity).toBeGreaterThan(.95);
    }
    expect(end.every(p => p.opacity === 0 && Math.abs(p.turn) <= 10)).toBe(true);
    const halfway = fx.travel(0, 640, false);
    expect(halfway.x / halfway.y).not.toBeCloseTo(end[0]!.x / end[0]!.y);
    expect(fx.letter(0, 939, false).opacity).toBeLessThan(.0001);
    fx.show("river", "2", 0, false, false, 940);
    expect(fx.text).toBe("river");
    expect(fx.phase(940)).toBe("enter");
    expect(fx.letter(0, 940, false).opacity).toBe(0);
  });

  it("drops defence 50–80 px with exactly one 12 px rebound; rapid casts never prolong the exit", () => {
    const fx = new WordFx();
    fx.finish("ward", "defence", 0);
    const at = (p: number) => WORD_FX.flashMs + (WORD_FX.exitMs - WORD_FX.flashMs) * p;
    for (const [index, drop] of [[0, 50], [3, 80]]) {
      expect(fx.travel(index!, at(.7), false).y).toBeCloseTo(drop!);
      expect(fx.travel(index!, at(.85), false).y).toBeCloseTo(drop! - 12);
      expect(fx.travel(index!, at(1), false).y).toBeCloseTo(drop!);
    }
    for (let now = 0; now <= 640; now += 10) for (let i = 0; i < WORD_FX.motes; i += 1) {
      expect(fx.mote(i, now, false).opacity).toBeGreaterThanOrEqual(0);
      expect(fx.mote(i, now, false).opacity).toBeLessThanOrEqual(.9);
    }
    fx.finish("new", "attack", 400);
    expect(fx.text).toBe("ward");
    expect(fx.leaving(640)).toBe(false);
    expect(WORD_FX.exitMs).toBeGreaterThanOrEqual(550);
    expect(WORD_FX.exitMs).toBeLessThanOrEqual(700);
  });

  it("shortens the fall to its viewport allowance and preserves one smaller rebound", () => {
    const fx = new WordFx();
    fx.finish("ward", "defence", 0);
    for (const limit of [0, 4, 20, 49, 80]) for (const index of [0, 3]) {
      const changes: number[] = [];
      let previous = 0;
      for (let now = 40; now <= 640; now += 1) {
        const { y } = fx.travel(index, now, false, limit);
        expect(y).toBeGreaterThanOrEqual(0);
        // Allow floating-point roundoff only; keep the viewport limit unchanged.
        expect(y - limit).toBeLessThanOrEqual(Number.EPSILON * Math.max(1, limit) * 8);
        const direction = Math.sign(y - previous);
        if (direction !== 0 && changes.at(-1) !== direction) changes.push(direction);
        previous = y;
      }
      expect(changes).toEqual(limit === 0 ? [] : [1, -1, 1]);
    }
  });

  it("keeps larger painted glints bright through the flight and fades them with the glyphs", () => {
    const fx = new WordFx();
    fx.finish("stone", "attack", 0);
    expect(WORD_FX.motes).toBeGreaterThanOrEqual(6);
    expect(WORD_FX.motes).toBeLessThanOrEqual(10);
    expect(WORD_FX_CSS).toContain(`width: ${WORD_FX.motePx}px; height: ${WORD_FX.motePx}px`);
    expect(WORD_GLINT_COLOR.match(/\d+/g)!.every(channel => Number(channel) / 255 <= .9)).toBe(true);
    for (let i = 0; i < WORD_FX.motes; i += 1) {
      const bright = fx.moteTravel(i, 240, false);
      expect(bright.opacity).toBeCloseTo(.9);
      expect(WORD_FX.motePx * bright.scale).toBeGreaterThanOrEqual(36);
      for (const now of [400, 520, 600, 639]) {
        const glyph = fx.travel(0, now, false);
        expect(fx.moteTravel(i, now, false).opacity).toBeCloseTo(glyph.opacity * .9);
      }
      expect(fx.moteTravel(i, 640, false).opacity).toBe(0);
      expect(fx.moteTravel(i, 700, false).opacity).toBe(0);
      expect(fx.moteTravel(i, 240, true).opacity).toBe(0);
    }
  });

  it("honours either reduced-motion choice, including a switch halfway through an effect", () => {
    expect(wordMotionReduced("reduce", false)).toBe(true);
    expect(wordMotionReduced("full", true)).toBe(true);
    expect(wordMotionReduced(undefined, false)).toBe(false);
    const fx = new WordFx();
    fx.show("ward", "1", 0, false, false, 0);
    expect(fx.letter(0, 100, true).opacity).toBe(fx.letter(3, 100, true).opacity);
    fx.show("ward", "1", 1, true, false, 300);
    fx.correct(1, 300);
    fx.wrong(300);
    expect(fx.letter(0, 340, true).transform).toBe("scale(1)");
    expect(fx.keyGlow(0, 340, true)).toBe(0);
    expect(fx.shake(310, true)).toBe(0);
    fx.finish("ward", "defence", 400);
    expect(fx.letter(0, 700, true).transform).toBe("translate(0px, 0px) rotate(0deg)");
    expect(fx.letter(0, 700, true).opacity).toBeGreaterThan(0);
    expect(fx.mote(0, 700, true)).toEqual({ opacity: 0, transform: "none" });
    fx.show("next", "2", 0, false, false, 1040);
    expect(fx.text).toBe("next");
  });
});
