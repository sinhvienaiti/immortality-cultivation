import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { ScreenPoint } from "../../src/app/contracts";
import type { Overlay, Renderer3D } from "../../src/view/renderer";
import { DamageCompiler } from "../../src/view/damage-compile";
import { CRIT_NUMBERS, EDGE_INSET, SKILL_NUMBER_CAP, VICTIM_NUMBERS, createSkillNumbers } from "../../src/view/hitfx";

/** The renderer parts the skill numbers touch: a projector over a 1600 × 900 view (the field's default) and overlays. */
function fakeRenderer(): Renderer3D {
  const overlays: Overlay[] = [];
  const project = (x: number, y: number, z: number, out: ScreenPoint): ScreenPoint => {
    out.x = 800 + x * 38;
    out.y = 560 - y * 30 + z * 26;
    out.visible = true;
    return out;
  };
  return {
    layers: { ground: new THREE.Group(), actors: new THREE.Group(), fx: new THREE.Group() },
    project,
    addOverlay: (overlay: Overlay) => {
      overlays.push(overlay);
      return () => overlays.splice(overlays.indexOf(overlay), 1);
    },
  } as unknown as Renderer3D;
}

/** A seeded generator (the test is the same every run). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("skill numbers under stress (round 3a, P7: never more than 8 visible)", () => {
  it("holds at most 8 numbers (2 headlines, 4 victims, 2 crits or elites), 5 % inside the view, never over a word tag", () => {
    const numbers = createSkillNumbers(fakeRenderer(), 140);
    const compiler = new DamageCompiler(numbers);
    const f = numbers.field;
    const r = rng(9);
    const W = 1600;
    const H = 900;
    // Word tags over 12 beasts (the game's DOM tags above their heads), CSS px boxes.
    const tags = Array.from({ length: 12 }, (_, k) => ({ x: 120 + k * 115, y: 300 + (k % 4) * 90, w: 96, h: 26 }));
    numbers.setWordTags(tags);
    let attack = 0;
    let most = 0;
    let headlineTotal = 0;
    let headlineAttack = -1;
    const box = { x: 0, y: 0, w: 0, h: 0 };
    for (let frame = 0; frame < 60 * 8; frame += 1) {
      // A field-wide skill every 2.5 s (hundreds of blows over 100 beasts, crits, elites, a finisher), an ultimate
      // over it at 4 s, a basic blow every 6 frames and slot 1 every 40.
      if (frame % 150 === 0) {
        attack += 1;
        headlineAttack = attack;
        headlineTotal = 0;
        compiler.headline(attack);
      }
      const area = headlineAttack;
      for (let b = 0; b < 1 + Math.floor(r() * 9); b += 1) {
        const t = Math.floor(r() * 100);
        const v = 20 + r() * 80 + (r() < 0.02 ? 2000 : 0);
        headlineTotal += v;
        compiler.add(area, t, v, r() < 0.15, (t % 20) - 10, 0.8, -((t / 20) | 0) * 3, 0x88ccff, t % 13 === 0 ? 2 : t === 99 ? 4 : 0, 0.15, frame % 150 === 140);
      }
      if (frame % 150 === 140) compiler.finisher(area);
      if (frame === 240) compiler.headline(1000);
      if (frame >= 240 && frame < 360 && frame % 3 === 0) compiler.add(1000, Math.floor(r() * 100), 300 + r() * 200, r() < 0.2, r() * 20 - 10, 1, -r() * 15, 0xaaddff, 0, 0.15, frame === 350);
      if (frame % 6 === 0) compiler.add(2000 + frame, Math.floor(r() * 100), 40 + r() * 20, r() < 0.1, r() * 20 - 10, 1, -r() * 15, 0xffffff, 0, 0.15, false);
      if (frame % 40 === 0) for (let k = 0; k < 3; k += 1) compiler.add(5000 + frame, Math.floor(r() * 100), 90, false, r() * 20 - 10, 1, -r() * 15, 0xffffff, 1, 0.15, false);
      compiler.update(1 / 60);
      numbers.update(1 / 60);
      let heads = 0;
      let crits = 0;
      let victims = 0;
      for (let i = 0; i < f.alive.length; i += 1) {
        if (f.alive[i] !== 1) continue;
        if (f.tier[i]! >= 5) heads += 1;
        else if (f.tier[i]! >= 4) crits += 1;
        else victims += 1;
        f.box(i, box);
        expect(box.x, `frame ${frame}`).toBeGreaterThanOrEqual(W * EDGE_INSET - 0.5);
        expect(box.x + box.w, `frame ${frame}`).toBeLessThanOrEqual(W * (1 - EDGE_INSET) + 0.5);
        expect(box.y, `frame ${frame}`).toBeGreaterThanOrEqual(H * EDGE_INSET - 0.5);
        expect(box.y + box.h, `frame ${frame}`).toBeLessThanOrEqual(H * (1 - EDGE_INSET) + 0.5);
        for (const t of tags) expect(box.x < t.x + t.w && box.x + box.w > t.x && box.y < t.y + t.h && box.y + box.h > t.y, `frame ${frame} over a tag`).toBe(false);
      }
      expect(numbers.live, `frame ${frame}`).toBeLessThanOrEqual(SKILL_NUMBER_CAP);
      expect(heads).toBeLessThanOrEqual(2);
      expect(victims).toBeLessThanOrEqual(VICTIM_NUMBERS);
      expect(crits).toBeLessThanOrEqual(CRIT_NUMBERS);
      most = Math.max(most, numbers.live);
    }
    // Busy enough to fill the budget, and the headline counted every blow of its attack.
    expect(most).toBeGreaterThanOrEqual(6);
    const head = Array.from(f.alive).findIndex((a, i) => a === 1 && f.tier[i] === 5 && Math.abs(f.value[i]! - headlineTotal) < 1e-6);
    expect(head).toBeGreaterThanOrEqual(0);
  });
});
