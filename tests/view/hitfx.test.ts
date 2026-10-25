import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TT_BUDGETS } from "../../src/content/rules";
import { TIERS } from "../../src/kit/feedback/tiers";
import type { ScreenPoint } from "../../src/app/contracts";
import type { Overlay, Renderer3D } from "../../src/view/renderer";
import { DrawnNumberField, IC_NUMBERS, RANDOM_SIZE, STYLE, createDamageNumbers, createHitFx, createInkSmoke, randomTable } from "../../src/view/hitfx";

interface FakeRenderer extends Renderer3D {
  overlays: Overlay[];
}

/** The renderer parts hitfx touches (no WebGL in node): layers, a projector, overlays. */
function fakeRenderer(): FakeRenderer {
  const overlays: Overlay[] = [];
  const project = (x: number, y: number, z: number, out: ScreenPoint): ScreenPoint => {
    out.x = 800 + x * 20;
    out.y = 450 - y * 20 + z * 5;
    out.visible = Math.abs(x) < 30;
    return out;
  };
  return {
    layers: { ground: new THREE.Group(), actors: new THREE.Group(), fx: new THREE.Group() },
    project,
    overlays,
    addOverlay: (overlay: Overlay) => {
      overlays.push(overlay);
      return () => overlays.splice(overlays.indexOf(overlay), 1);
    },
  } as unknown as FakeRenderer;
}

describe("hit sparks (canon §20.3: instanced additive quads, one draw call)", () => {
  it("spawns the tier's sparks and one flash; they die within half a second", () => {
    const renderer = fakeRenderer();
    const fx = createHitFx(renderer, { capacity: 200 });
    fx.spark(0, 1, -5, 2);
    fx.update(1 / 60);
    expect(fx.live).toBe(TIERS[2]!.sparks + 1);
    expect(fx.drawCalls()).toBe(1);
    for (let k = 0; k < 40; k += 1) fx.update(1 / 60);
    expect(fx.live).toBe(0);
    expect(fx.drawCalls()).toBe(0);
    fx.dispose();
    expect(renderer.layers.fx.children.length).toBe(0);
  });

  it("L1 spawns half the sparks; a full pool reuses its oldest slots", () => {
    const fx = createHitFx(fakeRenderer(), { capacity: 200, share: 0.5 });
    fx.spark(0, 1, -5, 3);
    fx.update(1 / 60);
    expect(fx.live).toBe(Math.round(TIERS[3]!.sparks * 0.5) + 1);
    const small = createHitFx(fakeRenderer(), { capacity: 16 });
    for (let k = 0; k < 10; k += 1) small.spark(k, 1, -5, 5);
    small.update(1 / 60);
    expect(small.live).toBeLessThanOrEqual(16);
    fx.dispose();
    small.dispose();
  });
});

describe("damage numbers (kit NumberField with Rồng's drawn box; canon §20.3)", () => {
  it("small numbers on one target merge for 0.25 s, then a new number starts", () => {
    expect(IC_NUMBERS.numbers.mergeS).toBe(0.25);
    const renderer = fakeRenderer();
    const numbers = createDamageNumbers(renderer, TT_BUDGETS.low.numbers);
    expect(renderer.overlays.length).toBe(1);
    numbers.show(7, 40, 0, 1, -5, 2);
    numbers.update(0.1);
    numbers.show(7, 60, 0, 1, -5, 2);
    expect(numbers.live).toBe(1);
    const field = numbers.field;
    const i = field.alive.indexOf(1);
    expect(field.value[i]).toBe(100);
    expect(field.text(i)).toBe("100");
    numbers.update(0.35);
    numbers.show(7, 5, 0, 1, -5, 2);
    expect(numbers.live).toBe(2);
    // Another target far on screen never merges (one close by may: the kit merges young numbers that crowd each other).
    numbers.show(8, 5, -15, 1, -5, 2);
    expect(numbers.live).toBe(3);
    numbers.dispose();
    expect(renderer.overlays.length).toBe(0);
  });

  it("keeps at most the tier's live numbers; T0 shows none; off-screen blows show none", () => {
    const numbers = createDamageNumbers(fakeRenderer(), 5);
    expect(numbers.field.limit).toBe(5);
    numbers.show(1, 10, 0, 1, 0, 0);
    expect(numbers.live).toBe(0);
    numbers.show(1, 10, 99, 1, 0, 2);
    expect(numbers.live).toBe(0);
    for (let k = 0; k < 12; k += 1) numbers.show(100 + k, 10 + k, (k % 6) * 4 - 10, 1 + Math.floor(k / 6) * 3, 0, 2, k % 3 === 0 ? STYLE.perfect : STYLE.normal);
    expect(numbers.live).toBeLessThanOrEqual(5);
    expect(numbers.drawCalls()).toBe(1);
    // The digit atlas is built on the first draw only.
    expect(numbers.textureBytes()).toBe(0);
    for (let k = 0; k < 120; k += 1) numbers.update(1 / 60);
    expect(numbers.live).toBe(0);
    expect(numbers.drawCalls()).toBe(0);
    numbers.dispose();
  });
});

describe("drawn number boxes (Rồng's DrawnNumberField, settled over cached boxes)", () => {
  it("leaves no two live numbers touching: the younger merges (same style, below T3) or moves above", () => {
    const field = new DrawnNumberField(IC_NUMBERS);
    // A pile on one spot: plain blows (merge), Perfect ones and T3+ (stack above).
    for (let k = 0; k < 24; k += 1) field.spawn(100 + k, 640 + (k % 3) * 6, 360 + (k % 4) * 5, 10 + k * 13, k % 5 === 0 ? STYLE.perfect : STYLE.normal, 1 + (k % 4), 1.3, 1.5, 0, -1, 0.5 + k * 0.01);
    for (let frame = 0; frame < 20; frame += 1) {
      field.update(1 / 60);
      const boxes: { x: number; y: number; w: number; h: number }[] = [];
      for (let i = 0; i < field.alive.length; i += 1) if (field.alive[i] === 1) boxes.push({ ...field.box(i, { x: 0, y: 0, w: 0, h: 0 }) });
      for (let a = 0; a < boxes.length; a += 1)
        for (let b = a + 1; b < boxes.length; b += 1) {
          const p = boxes[a]!;
          const q = boxes[b]!;
          expect(p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y, "frame " + frame).toBe(false);
        }
    }
    expect(field.live).toBeGreaterThan(1);
    // A box at another point is the same box moved there.
    const i = field.alive.indexOf(1);
    const here = field.box(i, { x: 0, y: 0, w: 0, h: 0 });
    const there = field.box(i, { x: 0, y: 0, w: 0, h: 0 }, field.x[i]! + 50, field.y[i]! - 20);
    expect([there.x - here.x, there.y - here.y, there.w - here.w, there.h - here.h].map((v) => Math.round(v * 1000) / 1000)).toEqual([50, -20, 0, 0]);
  });
});

describe("ink smoke (canon §10.9: ink, never blood)", () => {
  it("a death puffs 5 soft blots that swell, rise and fade within 1.5 s", () => {
    const renderer = fakeRenderer();
    const smoke = createInkSmoke(renderer, 40, 3);
    smoke.puff(2, 0, -6, 1.2);
    smoke.update(1 / 60);
    expect(smoke.live).toBe(5);
    expect(smoke.drawCalls()).toBe(1);
    for (let k = 0; k < 90; k += 1) smoke.update(1 / 60);
    expect(smoke.live).toBe(0);
    expect(smoke.drawCalls()).toBe(0);
    // A full pool reuses its oldest blots.
    for (let k = 0; k < 20; k += 1) smoke.puff(k, 0, -6, 1);
    smoke.update(1 / 60);
    expect(smoke.live).toBeLessThanOrEqual(40);
    smoke.dispose();
  });
});

describe("view randomness", () => {
  it("a table of xorshift draws in [0, 1), the same for the same seed", () => {
    const a = randomTable(42);
    expect(a.length).toBe(RANDOM_SIZE);
    expect(Array.from(a)).toEqual(Array.from(randomTable(42)));
    expect(Array.from(a)).not.toEqual(Array.from(randomTable(43)));
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a)).toBeLessThan(1);
    const mean = a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean).toBeCloseTo(0.5, 1);
  });
});
