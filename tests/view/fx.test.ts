import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { FrameInfo } from "../../src/app/contracts";
import { TT_BUDGETS } from "../../src/content/rules";
import type { LocalState, Quality, SimEvent, World } from "../../src/content/types";
import { STYLE } from "../../src/kit/feedback/numbers";
import { DRAGON } from "../../src/kit/feedback/profiles";
import { feedbackFor, IC_FEEDBACK, IC_FEEDBACK_PROFILE, REDUCED_STOP_MS, reducedProfile } from "../../src/view/feedback-profile";
import { ALLY_SHARE, createFx, numberStyle, swordsFor, ultimateVolley, ULTIMATE_VOLLEYS, type FxDeps } from "../../src/view/fx";
import type { DamageNumbers, HitFx, InkSmoke } from "../../src/view/hitfx";
import { moteAt, motesFor } from "../../src/view/pickups";
import type { Renderer3D } from "../../src/view/renderer";
import type { SwordPool } from "../../src/view/swords";

/** canon §12.1, §20.2–20.3, §21.1, §24, D44, PB-36: Lane 6 wires events to Lane 1's effects and never redraws them. */

function fakeRenderer(quality: Quality = "high"): Renderer3D {
  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 1, 400);
  return { quality, camera, stage: { size: { width: 1920, height: 1080 } }, layers: { ground: new THREE.Group(), actors: new THREE.Group(), fx: new THREE.Group() } } as unknown as Renderer3D;
}

interface Log {
  sparks: number[][];
  numbers: number[][];
  puffs: number[][];
  volleys: number[][];
  pool: number;
}

/** Lane 1 stand-ins that record their calls; the pool takes what it has room for. */
function fakeDeps(log: Log): FxDeps {
  let live = 0;
  return {
    hitFx: () => ({ spark: (...args: number[]) => log.sparks.push(args), update() {}, dispose() {} }) as unknown as HitFx,
    damageNumbers: () => ({ show: (...args: number[]) => log.numbers.push(args), update() {}, dispose() {} }) as unknown as DamageNumbers,
    inkSmoke: () => ({ puff: (...args: number[]) => log.puffs.push(args), update() {}, dispose() {} }) as unknown as InkSmoke,
    swords: (_renderer, pool) => {
      log.pool = pool;
      return {
        capacity: pool,
        get live() {
          return live;
        },
        volley(count: number, ...rest: number[]) {
          const took = Math.min(count, pool - live);
          live += took;
          log.volleys.push([count, ...rest]);
          return took;
        },
        update() {},
        dispose() {},
      } as unknown as SwordPool;
    },
  };
}

const newLog = (): Log => ({ sparks: [], numbers: [], puffs: [], volleys: [], pool: 0 });
const world = (over: Record<string, unknown> = {}) => ({ tick: 100, beasts: { list: [] }, skills: { zones: [] }, formation: { pillars: [] }, ...over }) as unknown as World;
const frame = (now: number, dt = 1 / 60): FrameInfo => ({ dt, worldDt: dt, alpha: 0, now, local: {} as LocalState });

const hit = (over: Partial<Extract<SimEvent, { type: "hit" }>> = {}): SimEvent => ({
  tick: 100,
  type: "hit",
  beast: { slot: 3, serial: 42 },
  amount: 37,
  damageType: "typed",
  bucket: "typed",
  source: "slot1",
  seat: 0,
  grade: "good",
  tier: 1,
  x: 2,
  z: -6,
  hpLeft: 10,
  ...over,
});

const skill = (stage: Extract<SimEvent, { type: "skill-fx" }>["stage"], seat = 0, count = 1): SimEvent => ({ tick: 100, type: "skill-fx", seat, skill: "kiem", stage, x: 0, z: 2, toX: 4, toZ: -8, count });

describe("the feedback profile (canon §21.1, D44: local, numbers and timing only)", () => {
  it("keeps the kit frame with id 'dragon' and overrides T0–T5: only T3+ stops the world", () => {
    expect(IC_FEEDBACK_PROFILE.id).toBe("dragon");
    expect(IC_FEEDBACK_PROFILE.stopScale).toBe(DRAGON.stopScale);
    expect(IC_FEEDBACK_PROFILE.tiers).toHaveLength(6);
    expect([0, 1, 2, 3, 4, 5].map((t) => IC_FEEDBACK[t as 0].hitStopMs)).toEqual([0, 0, 0, 30, 45, 70]);
    expect(IC_FEEDBACK[0].shake).toBe(0);
    expect(IC_FEEDBACK_PROFILE.tiers[0]!.number).toBeNull();
    for (let t = 1; t < 6; t += 1) expect(IC_FEEDBACK_PROFILE.tiers[t]!.trauma).toBeGreaterThanOrEqual(IC_FEEDBACK_PROFILE.tiers[t - 1]!.trauma);
    expect(IC_FEEDBACK_PROFILE.trauma.maxPx).toBeLessThan(DRAGON.trauma.maxPx);
    // No sound settings are read from it: kit AudioCues is never imported (tests/boundary.test.ts, tests/audio).
  });

  it("with reduced motion: no shake, no recoil, stops at most 30 ms, no sweep stop (canon §24)", () => {
    const reduced = reducedProfile();
    expect(feedbackFor(true)).toEqual(reduced);
    expect(feedbackFor(false)).toBe(IC_FEEDBACK_PROFILE);
    expect(reduced.trauma.maxPx).toBe(0);
    for (const row of reduced.tiers) {
      expect(row.trauma).toBe(0);
      expect(row.recoil).toBe(0);
      expect(row.stopMs).toBeLessThanOrEqual(REDUCED_STOP_MS);
    }
    expect(reduced.sweep.stopMs).toBe(0);
  });
});

describe("swords from the shared pool (canon §12.1, §20.2)", () => {
  it("Thiên Hà Kiếm Vũ shows exactly the tier's swords over its 3 volleys: 150 / 300 / 500", () => {
    for (const [quality, total] of [["low", 150], ["medium", 300], ["high", 500]] as const) {
      expect(TT_BUDGETS[quality].swords).toBe(total);
      let sum = 0;
      for (let beat = 0; beat < ULTIMATE_VOLLEYS; beat += 1) sum += swordsFor("ultimate", 7, quality, beat);
      expect(sum, quality).toBe(total);
    }
    expect([0, 1, 2].map((b) => ultimateVolley(500, b))).toEqual([166, 167, 167]);
    expect(swordsFor("auto", 1, "low")).toBe(1);
    expect(swordsFor("volley", 1, "low")).toBe(1);
    expect(swordsFor("line", 1, "low")).toBe(3);
    expect(swordsFor("zone-open", 0, "low")).toBe(6);
    expect(swordsFor("zone-close", 0, "low")).toBe(0);
  });

  it("asks the pool per skill-fx beat; an ally's cast takes ALLY_SHARE; the ultimate's 3 beats fill the pool", () => {
    const log = newLog();
    const fx = createFx(fakeRenderer("medium"), { deps: fakeDeps(log), seat: 0 });
    expect(log.pool).toBe(300);
    let now = 1000;
    for (let beat = 0; beat < 3; beat += 1) {
      fx.onEvents([skill("ultimate", 0, 12)], world());
      fx.frame(world(), frame((now += 750)));
    }
    expect(log.volleys.map((v) => v[0])).toEqual([100, 100, 100]);
    expect(fx.swordStats).toEqual({ asked: 300, taken: 300 });
    // The pool is full now: a Phi Kiếm gets nothing more (never more swords than the pool).
    fx.onEvents([skill("auto")], world());
    expect(fx.swordStats.taken).toBe(300);
    fx.onEvents([skill("line", 1)], world());
    expect(log.volleys.at(-1)![0]).toBe(Math.max(1, Math.round(3 * ALLY_SHARE)));
    // A new cast long after starts its beats again.
    fx.onEvents([skill("ultimate", 0, 3)], world());
    fx.frame(world(), frame((now += 5000)));
    fx.onEvents([skill("ultimate", 0, 3)], world());
    expect(log.volleys.at(-1)![0]).toBe(100);
  });
});

describe("hits, deaths and other events", () => {
  it("puts a spark and a damage number on the beast, smoke on a death; numbers only for tiers that have one", () => {
    const log = newLog();
    const fx = createFx(fakeRenderer(), {
      deps: fakeDeps(log),
      locate: (_slot, _serial, _anchor, out) => {
        out.x = 5;
        out.y = 3;
        out.z = -7;
        return true;
      },
    });
    fx.onEvents([hit(), hit({ tier: 0, source: "auto", grade: null }), { tick: 100, type: "death", beast: { slot: 3, serial: 42 }, species: "phong-lang", by: "slot1", x: 2, z: -6, cluster: -1, clusterDone: false, tier: 2 }], world());
    expect(log.sparks).toEqual([[5, 3, -7, 1], [5, 3, -7, 0]]);
    // T0 (đánh nền) shows no number (feedback-profile.ts); the number sits on the drawn body.
    expect(log.numbers).toEqual([[42, 37, 5, 3.6, -7, 1, STYLE.normal]]);
    expect(log.puffs).toHaveLength(1);
    expect(log.puffs[0]!.slice(0, 3)).toEqual([2, 0.5, -6]);
  });

  it("styles numbers: Chớp and Hoàn hảo, zone and mechanism ticks, T4+ blows", () => {
    expect(numberStyle({ grade: "flash", source: "slot1", tier: 1 })).toBe(STYLE.perfect);
    expect(numberStyle({ grade: "perfect", source: "slot2", tier: 2 })).toBe(STYLE.perfect);
    expect(numberStyle({ grade: "good", source: "slot4", tier: 1 })).toBe(STYLE.tick);
    expect(numberStyle({ grade: null, source: "mechanism", tier: 0 })).toBe(STYLE.tick);
    expect(numberStyle({ grade: "good", source: "slot5", tier: 4 })).toBe(STYLE.crit);
    expect(numberStyle({ grade: "ok", source: "slot1", tier: 1 })).toBe(STYLE.normal);
  });

  it("stops the world for the frame's strongest blow only, and slows it, never the keys", () => {
    const fx = createFx(fakeRenderer(), { deps: fakeDeps(newLog()) });
    // A storm of T3 hits in one frame asks for one stop and adds one shake.
    fx.onEvents(Array.from({ length: 30 }, () => hit({ tier: 3 })), world());
    fx.frame(world(), frame(1000));
    expect(fx.hitStop.until - fx.hitStop.from).toBe(IC_FEEDBACK[3].hitStopMs);
    expect(fx.trauma.trauma).toBeLessThanOrEqual(IC_FEEDBACK[3].shake + 1e-9);
    expect(fx.worldDt(0.016, 1016)).toBeLessThan(0.016);
    expect(fx.worldDt(0.016, 1200)).toBeCloseTo(0.016, 9);
  });

  it("with reduced motion: no shake at all and a short stop (canon §24)", () => {
    let reduced = true;
    const renderer = fakeRenderer();
    const fx = createFx(renderer, { deps: fakeDeps(newLog()), reduced: () => reduced });
    const before = renderer.camera.projectionMatrix.clone();
    fx.onEvents([hit({ tier: 5 }), { tick: 100, type: "player-hit", seat: 0, amount: 50, blocked: false, x: 0, z: 0 }], world());
    fx.frame(world(), frame(1000));
    expect(fx.hitStop.until - fx.hitStop.from).toBeLessThanOrEqual(REDUCED_STOP_MS);
    expect(fx.trauma.offsetX).toBe(0);
    expect(fx.trauma.offsetY).toBe(0);
    expect(renderer.camera.projectionMatrix.equals(before)).toBe(true);
    reduced = false;
    fx.onEvents([hit({ tier: 5 })], world());
    for (let k = 0; k < 3; k += 1) fx.frame(world(), frame(2000 + k * 16));
    expect(fx.trauma.trauma).toBeGreaterThan(0);
  });

  it("uses silent stand-ins while a Lane 1b factory is still its TODO stub, and says which", () => {
    const deps = fakeDeps(newLog());
    const fx = createFx(fakeRenderer(), {
      deps: {
        ...deps,
        swords: () => {
          throw new Error("TODO(lane-1): view/swords.ts createSwords");
        },
      },
    });
    expect(fx.missing).toEqual(["createSwords"]);
    fx.onEvents([skill("ultimate")], world());
    expect(fx.swordStats.taken).toBe(0);
    expect(() =>
      createFx(fakeRenderer(), {
        deps: {
          ...deps,
          hitFx: () => {
            throw new Error("WebGL lost");
          },
        },
      }),
    ).toThrow("WebGL lost");
  });

  it("draws Lạc Kiếm Trận zones from the world's list while they last", () => {
    const renderer = fakeRenderer();
    const fx = createFx(renderer, { deps: fakeDeps(newLog()) });
    const zone = { id: 9, seat: 0, skill: "lac-kiem-tran", at: { x: 60_000, z: -120_000 }, radiusU: 180_000, untilTick: 300, nextBeat: 0, dealt: 0, cap: 0 };
    fx.frame(world({ tick: 200, skills: { zones: [zone] } }), frame(0));
    const marks = renderer.layers.fx.getObjectByName("fx-ours")!.children.filter((child) => child.visible);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.position.x).toBeCloseTo(1, 6);
    expect(marks[0]!.scale.x).toBeCloseTo(3, 6);
    fx.frame(world({ tick: 300, skills: { zones: [zone] } }), frame(16));
    expect(renderer.layers.fx.getObjectByName("fx-ours")!.children.filter((child) => child.visible)).toHaveLength(0);
  });
});

describe("Linh Sa motes (canon §9.3, D34: visual only)", () => {
  it("sends 1–6 motes along an arc that ends on the HUD chip", () => {
    expect(motesFor(3)).toBe(1);
    expect(motesFor(40)).toBe(4);
    expect(motesFor(900)).toBe(6);
    const out = { x: 0, y: 0 };
    expect(moteAt(0, 100, 500, 20, 20, 60, out)).toEqual({ x: 100, y: 500 });
    expect(moteAt(1, 100, 500, 20, 20, 60, out)).toEqual({ x: 20, y: 20 });
    moteAt(0.5, 100, 500, 20, 20, 60, out);
    expect(out.x).toBeLessThan(100);
    expect(out.x).toBeGreaterThan(20);
  });
});
