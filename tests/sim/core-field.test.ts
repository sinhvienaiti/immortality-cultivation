import { describe, expect, it } from "vitest";
import { BEASTS } from "../../src/content/data/beasts";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { FIELD, FORMATION, PLAYER } from "../../src/content/rules";
import type { BeastState, GateId, World } from "../../src/content/types";
import { HEART, cellAt, cellCenterX, cellCenterZ, createField, fieldDistance, fieldStep, gatePoint, heartDistance, routeU, laneDistanceSqMm, blockedCells } from "../../src/sim/field";
import { dist, mToU, mmToU, msToTicks, within } from "../../src/sim/fixed";

/** canon §8.1, PB-08: flow fields from two gates and the sky route to the heart; time to the Kết Giới edge by species. */
const stage = THANH_THACH_AI;
const field = createField(stage);
const world = { stage, field, tick: 0 } as unknown as World;
const BARRIER_U = mmToU(FORMATION.barrierRadiusMm);

function probe(gate: GateId, speedMmPerS: number, dx = 0, dz = 0, entry = 0): BeastState {
  const at = gatePoint(stage, gate, entry);
  return { gate, x: at.x + dx, z: at.z + dz, y: 0, cell: -1, speedPm: speedMmPerS * 1000, alive: true } as unknown as BeastState;
}

/** Seconds × 10 for a probe to reach the Kết Giới edge (r 9 m), walking its field at a constant speed. */
function tenthsToBarrier(beast: BeastState): number {
  for (let tick = 1; tick < 60 * 60; tick += 1) {
    fieldStep(world, beast);
    if (within(beast.x, beast.z, 0, 0, BARRIER_U)) return Math.round((tick * 10) / 60);
  }
  return -1;
}

describe("flow field (canon §8.1)", () => {
  it("covers the 48 × 52 m field with 0.5 m cells (96 × 104) and blocks outside the lane and round the Trận Trụ", () => {
    expect([field.cols, field.rows, field.cellMm]).toEqual([FIELD.cols, FIELD.rows, FIELD.cellMm]);
    const blocked = field.blocked.reduce((sum, cell) => sum + cell, 0);
    expect(blocked).toBeGreaterThan(0);
    for (const pillar of stage.field.pillars) {
      const cell = cellAt(field, mmToU(pillar.at.xMm), mmToU(pillar.at.zMm));
      expect(field.blocked[cell]).toBe(1);
    }
    // Every open cell has a way to the heart; blocked ones have none.
    const flow = field.flows.A;
    for (let cell = 0; cell < field.cols * field.rows; cell += 1) {
      if (field.blocked[cell]) expect(flow.waypoint[cell]).toBe(-1);
      else expect(flow.pathU[cell]).toBeGreaterThanOrEqual(0);
    }
    expect(field.flows.A).toBe(field.flows.B);
  });

  it("points straight at the heart on open ground and round a pillar behind one", () => {
    const flow = field.flows.A;
    const open = cellAt(field, mToU(-10), mToU(5));
    expect(flow.waypoint[open]).toBe(HEART);
    expect(flow.pathU[open]).toBe(dist(cellCenterX(field, open), cellCenterZ(field, open), 0, 0));
    // The broad S corridor permits a straight, string-pulled route from both gate cells.
    for (const id of ["A", "B"] as const) {
      const at = gatePoint(stage, id);
      const cell = cellAt(field, at.x, at.z);
      expect(flow.waypoint[cell]).toBe(HEART);
      expect(routeU(world, id) / 60).toBeCloseTo(FIELD.routeMm, -2);
    }
    expect(fieldDistance(world, "sky", open)).toBe(dist(cellCenterX(field, open), cellCenterZ(field, open), 0, 0));
  });

  it("never walks a beast into a pillar, always closes in, and stops it at the heart edge", () => {
    for (const gate of ["A", "B"] as const) {
      for (const dx of [-mToU(1.2), 0, mToU(1.2)]) {
        const beast = probe(gate, 2600, dx, mToU(0.6));
        let last = heartDistance(world, beast);
        let secondAgo = last;
        for (let tick = 1; tick <= 60 * 35; tick += 1) {
          fieldStep(world, beast);
          for (const pillar of stage.field.pillars) {
            expect(within(beast.x, beast.z, mmToU(pillar.at.xMm), mmToU(pillar.at.zMm), mmToU(pillar.radiusMm))).toBe(false);
          }
          // The distance along the field is read off the 0.5 m grid's waypoints: it may wobble by up to half a
          // cell when a beast changes cell, and a second always brings it closer until the edge.
          const now = heartDistance(world, beast);
          expect(now).toBeLessThanOrEqual(last + mmToU(FIELD.cellMm) / 2);
          if (tick % 60 === 0 && secondAgo > mmToU(FIELD.heartEdgeMm) + mToU(0.5)) {
            expect(now).toBeLessThan(secondAgo);
            secondAgo = now;
          }
          last = now;
        }
        expect(dist(beast.x, beast.z, 0, 0)).toBeLessThanOrEqual(mmToU(FIELD.heartEdgeMm) + 1);
        expect(dist(beast.x, beast.z, 0, 0)).toBeGreaterThanOrEqual(mmToU(FIELD.heartEdgeMm) - 1);
      }
    }
  });

  it("flies the sky route straight from both top corners (50.1 m)", () => {
    for (const entry of [0, 1]) {
      const at = gatePoint(stage, "sky", entry);
      expect(Math.round(dist(at.x, at.z, 0, 0) / 6000) / 10).toBe(50.1);
      const beast = probe("sky", 3000, 0, 0, entry);
      fieldStep(world, beast);
      expect(beast.cell).toBe(-1);
    }
  });

  it("brings all small species, including both sky entries, to the barrier in 10–16 s at k 1 balanced", () => {
    for (const def of Object.values(BEASTS).filter((b) => b.tier === "small" || b.tier === "swarm")) {
      const gates: GateId[] = def.flying ? ["sky"] : ["A", "B"];
      for (const gate of gates) for (const entry of [0, 1]) {
        const t = tenthsToBarrier(probe(gate, def.speedMm, 0, 0, entry)) * 100;
        expect(t, def.id + gate).toBeGreaterThanOrEqual(FIELD.approachMs[0]);
        expect(t, def.id + gate).toBeLessThanOrEqual(FIELD.approachMs[1]);
        expect(t).toBeGreaterThanOrEqual(FIELD.approachFloorMs);
      }
    }
    for (const gate of ["A", "B"] as const) for (const dx of [-mToU(1.2), 0, mToU(1.2)]) {
      for (const speed of [2600, 3000]) {
        const t = tenthsToBarrier(probe(gate, speed, dx, mToU(1.2))) * 100;
        expect(t).toBeGreaterThanOrEqual(FIELD.approachMs[0]);
        expect(t).toBeLessThanOrEqual(FIELD.approachMs[1]);
      }
      // Deliberate Cuồng and aura combinations remain above the 8 s floor.
      expect(tenthsToBarrier(probe(gate, 3887, dx, mToU(1.2))) * 100).toBeGreaterThanOrEqual(FIELD.approachFloorMs);
    }
  });

  it("connects both gates with comparable paths and keeps every ground waypoint and walk inside the lane", () => {
    const lane = stage.field.lane!;
    expect(Math.abs(routeU(world, "A") - routeU(world, "B")) / routeU(world, "A")).toBeLessThanOrEqual(0.05);
    for (const gate of ["A", "B"] as const) {
      expect(Math.abs(routeU(world, gate) / 60 - FIELD.routeMm) / FIELD.routeMm).toBeLessThanOrEqual(0.03);
      const beast = probe(gate, 3000);
      for (let tick = 0; tick < 60 * 20; tick += 1) {
        fieldStep(world, beast);
        if (beast.z / 60 < lane.endZMm) expect(laneDistanceSqMm(Math.round(beast.x / 60), Math.round(beast.z / 60), lane.pointsMm)).toBeLessThanOrEqual(6000 * 6000);
      }
      expect(dist(beast.x, beast.z, 0, 0)).toBeLessThanOrEqual(mmToU(FIELD.heartEdgeMm) + 1);
    }
    for (let cell = 0; cell < field.blocked.length; cell += 1) {
      if (field.blocked[cell]) continue;
      const wp = field.flows.A.waypoint[cell]!;
      if (wp < 0) { expect(wp).toBe(HEART); continue; }
      const x = cellCenterX(field, wp) / 60;
      const z = cellCenterZ(field, wp) / 60;
      if (z < lane.endZMm) expect(laneDistanceSqMm(x, z, lane.pointsMm)).toBeLessThanOrEqual(6000 * 6000);
    }
    for (const p of lane.pointsMm) expect(field.flows.A.pathU[cellAt(field, mmToU(p.xMm), mmToU(p.zMm))]).toBeGreaterThan(0);
    expect(Math.abs(dist(mmToU(24000), mmToU(-44000), 0, 0) / 60 - FIELD.skyRouteMm) / FIELD.skyRouteMm).toBeLessThanOrEqual(0.01);
  });

  it("uses integer signed projection, skips duplicate segments and leaves exact lane thresholds open", () => {
    const points = [{ xMm: 0, zMm: 0 }, { xMm: 0, zMm: 0 }, { xMm: -1000, zMm: 1000 }];
    expect(laneDistanceSqMm(-500, 500, points)).toBe(0);
    expect(laneDistanceSqMm(0, 1000, points)).toBe(500000);
    const lane = stage.field.lane!;
    for (let i = 1; i < lane.pointsMm.length; i += 1) expect(lane.pointsMm[i]).not.toEqual(lane.pointsMm[i - 1]);
    for (const p of lane.pointsMm) { expect(p.xMm % 10 + 0).toBe(0); expect(p.zMm % 10 + 0).toBe(0); }
    const testStage = { ...stage, field: { ...stage.field, pillars: [], lane: { pointsMm: [{ xMm: 0, zMm: -44000 }, { xMm: 0, zMm: -9000 }], halfWidthMm: 6150, endZMm: -9000 } } };
    const mask = blockedCells(testStage, 400, { lane: true });
    expect(mask[cellAt(field, mmToU(5750), mmToU(-20000))]).toBe(0);
    expect(mask[cellAt(field, mmToU(6250), mmToU(-20000))]).toBe(1);
  });

  it("keeps the player's clearance and the beasts' the same (canon §9.1 radius)", () => {
    expect(FIELD.clearanceMm).toBe(PLAYER.radiusMm);
    expect(msToTicks(1000)).toBe(60);
  });
});
