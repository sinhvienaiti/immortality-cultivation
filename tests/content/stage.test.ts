import { describe, expect, it } from "vitest";
import { STAGES, THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { M0A_WAVES } from "../../src/content/data/waves";
import { FIELD, FORMATION, PLAYER, STAGE_M0A } from "../../src/content/rules";
import type { PointMm } from "../../src/content/types";

/** canon §8.1, §8.2, §13.3, §25: the M0a stage's field and flow. */
const field = THANH_THACH_AI.field;
const distMm = (a: PointMm, b: PointMm): number => Math.sqrt((a.xMm - b.xMm) ** 2 + (a.zMm - b.zMm) ** 2);
const HEART: PointMm = { xMm: 0, zMm: 0 };
const mirror = (p: PointMm): PointMm => ({ xMm: -p.xMm, zMm: p.zMm });
const onField = (p: PointMm): boolean => p.xMm >= field.minXMm && p.xMm <= field.maxXMm && p.zMm >= field.minZMm && p.zMm <= field.maxZMm;

describe("Thanh Thạch Ải (canon §8.1)", () => {
  it("is 40 × 26 m with the heart at the origin, the Kết Giới r 9 m, gates A, B at (∓15; −18) and the sky from (±20; −18)", () => {
    expect([field.minXMm, field.maxXMm, field.minZMm, field.maxZMm]).toEqual([-20_000, 20_000, -18_000, 8000]);
    expect(field.maxXMm - field.minXMm).toBe(40_000);
    expect(field.maxZMm - field.minZMm).toBe(26_000);
    expect(field.barrierRadiusMm).toBe(FORMATION.barrierRadiusMm);
    expect(field.gates.filter((g) => g.ground).map((g) => [g.id, g.at.xMm, g.at.zMm])).toEqual([
      ["A", -15_000, -18_000],
      ["B", 15_000, -18_000],
    ]);
    expect(field.gates.find((g) => g.id === "sky")?.ground).toBe(false);
    expect(field.skyEntries).toEqual([
      { xMm: -20_000, zMm: -18_000 },
      { xMm: 20_000, zMm: -18_000 },
    ]);
    // Ground route ~24 m, sky route 26.9 m straight (canon §8.1).
    expect(Math.round(distMm(field.gates[0]!.at, HEART) / 100) / 10).toBe(23.4);
    expect(Math.round(distMm(field.skyEntries[0]!, HEART) / 100) / 10).toBe(26.9);
    // The flow-field grid is 80 × 52 cells of 0.5 m.
    expect([(field.maxXMm - field.minXMm) / FIELD.cellMm, (field.maxZMm - field.minZMm) / FIELD.cellMm]).toEqual([FIELD.cols, FIELD.rows]);
  });

  it("has two Trận Trụ outside the Kết Giới, six mechanism slots and the Tâm nhãn, all on the field, mirrored east–west", () => {
    expect(field.pillars.map((p) => p.id)).toEqual(["west", "east"]);
    expect(field.pillars[1]!.at).toEqual(mirror(field.pillars[0]!.at));
    for (const pillar of field.pillars) {
      expect(onField(pillar.at)).toBe(true);
      expect(distMm(pillar.at, HEART) - pillar.radiusMm).toBeGreaterThan(field.barrierRadiusMm);
      // On the gate → heart line, in front of the Nham Viên's 11 m stop (canon §10.2, PB-17).
      expect(distMm(pillar.at, HEART)).toBeLessThan(11_000);
    }
    expect(field.mechSlots.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const slot of field.mechSlots) {
      expect(onField(slot.at)).toBe(true);
      const twin = field.mechSlots.find((other) => other.at.xMm === -slot.at.xMm && other.at.zMm === slot.at.zMm);
      expect(twin?.kind).toBe(slot.kind);
      // Clear of the pillars and of the heart's bite ring.
      for (const pillar of field.pillars) expect(distMm(slot.at, pillar.at)).toBeGreaterThan(pillar.radiusMm + 2000);
      expect(distMm(slot.at, HEART)).toBeGreaterThan(FIELD.heartEdgeMm + 2000);
    }
    expect(field.mechSlots.filter((s) => s.kind === "strip")).toHaveLength(2);
    expect(field.nodes).toEqual([{ id: "tam-nhan", at: { xMm: 0, zMm: 3000 } }]);
    expect(distMm(field.nodes[0]!.at, HEART)).toBeLessThan(field.barrierRadiusMm - PLAYER.radiusMm);
    expect(field.blocked).toEqual([]);
  });

  it("runs the six M0a waves then the Thiết Bối Lang Vương, live cap 60, K0, on the M0a Linh Sa fund", () => {
    expect(THANH_THACH_AI).toMatchObject({ id: "m0a-thanh-thach-ai", realm: 0, kind: "m0a", boss: "thiet-boi-lang-vuong", liveCap: STAGE_M0A.liveCap });
    expect(THANH_THACH_AI.waves).toBe(M0A_WAVES);
    expect(STAGES[THANH_THACH_AI.id]).toBe(THANH_THACH_AI);
  });
});
