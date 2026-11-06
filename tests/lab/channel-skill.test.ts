import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ChannelSkill, GRADE_K, IDLE_S, TICKS, WORD_S } from "../../src/lab/channel-skill";
import { ElementStage } from "../../src/view/skills/element-stage";
import { elementById } from "../../src/view/skills/elements";
import type { TargetField } from "../../src/view/skills/targets";

/** Beasts at fixed points; each dies after `hp` blows. */
function field(pts: readonly (readonly [number, number])[], hp: number): TargetField {
  const left = pts.map(() => hp);
  return {
    size: pts.length,
    alive: (i) => left[i]! > 0,
    x: (i) => pts[i]![0],
    z: (i) => pts[i]![1],
    midY: () => 0.5,
    radius: () => 0.4,
    tier: () => 0,
    nearest(x, z, maxR, skip = -1) {
      let best = -1;
      let bd = maxR;
      pts.forEach(([px, pz], i) => {
        const d = Math.hypot(px - x, pz - z);
        if (i !== skip && left[i]! > 0 && d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    },
    inCircle: () => 0,
    inCapsule: () => 0,
    hit(i) {
      left[i] = left[i]! - 1;
      return left[i]! <= 0;
    },
  };
}

function setup(hp: number): { ch: ChannelSkill; blows: { t: number; i: number; power: number; pulse: boolean }[]; step: (s: number) => void } {
  const cam = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
  cam.position.set(0, 26, 14);
  cam.lookAt(0, 0, -6);
  cam.updateMatrixWorld(true);
  const stage = new ElementStage({ layer: new THREE.Group(), camera: cam, quality: "high", textures: {} as never, texture: () => new THREE.Texture(), vfxBase: "/v/" });
  const herd = field([[0, -6], [3, -7], [20, -6]], hp);
  const blows: { t: number; i: number; power: number; pulse: boolean }[] = [];
  let t = 0;
  const ch = new ChannelSkill({
    targets: herd, stage, camera: cam, layer: new THREE.Group(),
    kit: () => elementById("water")!, pal: () => ({}) as never,
    hand: (out) => out.set(0.3, 1.2, 2.8), caster: (out) => out.set(0, 0, 3),
    keyInterval: () => 0.3, release: () => {},
    blow: (i, _dx, _dz, power, pulse) => (blows.push({ t, i, power, pulse }), herd.hit(i, 0, 1, power, 0)),
    status: () => {},
  });
  const step = (s: number): void => {
    for (let k = 0; k < Math.round(s * 60); k += 1) {
      t += 1 / 60;
      ch.update(1 / 60);
    }
  };
  return { ch, blows, step };
}

describe("the lab's typing-sustained channel (key C, canon D61)", () => {
  it("pulses on each word at once and ticks four times over its flow, times the word's grade", () => {
    const { ch, blows, step } = setup(99);
    expect(ch.start("perfect")).toBe(true);
    // The first word's pulse lands on the key's frame, on the nearest beast.
    expect(blows).toEqual([{ t: 0, i: 0, power: expect.closeTo(0.55 * GRADE_K.perfect, 6), pulse: true }]);
    step(0.5);
    ch.feed("flash");
    expect(blows.at(-1)!.pulse).toBe(true);
    expect(blows.at(-1)!.power).toBeCloseTo(0.55 * GRADE_K.flash, 6);
    step(2.2);
    // Two words: two pulses and 2 × TICKS ticks.
    expect(blows.filter((b) => b.pulse).length).toBe(2);
    expect(blows.filter((b) => !b.pulse).length).toBe(2 * TICKS);
    // The ticks of the second word come after the first word's (its flow queued behind).
    const ticks = blows.filter((b) => !b.pulse).map((b) => b.t);
    expect(ticks.at(-1)! - ticks[0]!).toBeGreaterThan(WORD_S);
  });

  it("breaks only on a SLOPPY word or a pause past max(2.5 s, 2 × the key interval)", () => {
    const sloppy = setup(99);
    sloppy.ch.start();
    sloppy.step(0.3);
    expect(sloppy.ch.feed("sloppy")).toBe(false);
    expect(sloppy.ch.active).toBe(false);
    expect(sloppy.ch.report.ended).toBe("sloppy");
    // A good or fair word keeps it.
    const slow = setup(99);
    slow.ch.start();
    slow.step(2);
    slow.ch.feed("ok");
    slow.step(2);
    expect(slow.ch.active).toBe(true);
    slow.step(IDLE_S);
    expect(slow.ch.active).toBe(false);
    expect(slow.ch.report.ended).toBe("idle");
  });

  it("swings to the nearest beast within 6 m when its beast dies", () => {
    const { ch, blows, step } = setup(2);
    ch.start();
    step(0.25);
    // Beast 0 dies on its second blow; the stream goes on beast 1 (3.2 m away), never beast 2 (20 m).
    step(1);
    expect(blows.some((b) => b.i === 1)).toBe(true);
    expect(blows.some((b) => b.i === 2)).toBe(false);
    expect(ch.report.swings).toBe(1);
  });
});
