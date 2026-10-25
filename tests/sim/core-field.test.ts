import { describe, expect, it } from "vitest";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { FIELD, FORMATION, PLAYER } from "../../src/content/rules";
import type { BeastState, GateId, World } from "../../src/content/types";
import { HEART, cellAt, cellCenterX, cellCenterZ, createField, fieldDistance, fieldStep, gatePoint, heartDistance, routeU } from "../../src/sim/field";
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
  it("covers the 40 × 26 m field with 0.5 m cells (80 × 52) and blocks only round the Trận Trụ", () => {
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
    // Gate A's cell: the west pillar sits on its line to the heart, so the way bends and is longer than the straight line.
    const gate = gatePoint(stage, "A");
    const cell = cellAt(field, gate.x, gate.z);
    expect(flow.waypoint[cell]).toBeGreaterThanOrEqual(0);
    expect(flow.pathU[cell]).toBeGreaterThan(dist(cellCenterX(field, cell), cellCenterZ(field, cell), 0, 0));
    // Route ~24 m (canon §8.1).
    const routeM = (routeU(world, "A") + mmToU(FIELD.heartEdgeMm)) / 60_000;
    expect(routeM).toBeGreaterThan(22.5);
    expect(routeM).toBeLessThan(25);
    expect(routeU(world, "A")).toBe(routeU(world, "B"));
    expect(fieldDistance(world, "sky", cell)).toBe(dist(cellCenterX(field, cell), cellCenterZ(field, cell), 0, 0));
  });

  it("never walks a beast into a pillar, always closes in, and stops it at the heart edge", () => {
    for (const gate of ["A", "B"] as const) {
      for (const dx of [-mToU(1.2), 0, mToU(1.2)]) {
        const beast = probe(gate, 1400, dx, mToU(0.6));
        let last = heartDistance(world, beast);
        let secondAgo = last;
        for (let tick = 1; tick <= 60 * 30; tick += 1) {
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

  it("flies the sky route straight from both top corners (26.9 m)", () => {
    for (const entry of [0, 1]) {
      const at = gatePoint(stage, "sky", entry);
      expect(Math.round(dist(at.x, at.z, 0, 0) / 6000) / 10).toBe(26.9);
      const beast = probe("sky", 2000, 0, 0, entry);
      fieldStep(world, beast);
      expect(beast.cell).toBe(-1);
    }
  });

  it("brings every small beast to the Kết Giới edge in 8–12 s at k = 1, Cân bằng; the deliberate fast cases never under 6 s (PB-08)", () => {
    const window = (tenths: number) => tenths >= FIELD.approachMs[0] / 100 && tenths <= FIELD.approachMs[1] / 100;
    const floor = (tenths: number) => tenths >= FIELD.approachFloorMs / 100;
    const results: Record<string, number> = {};
    for (const gate of ["A", "B"] as const) {
      // A pack spawns up to ± 1.2 m across its gate and 1.2 m in (spawn.ts); B's offsets mirror A's.
      for (const [dx, dz] of [[0, 0], [-mToU(1.2), mToU(1.2)], [mToU(1.2), mToU(0.6)], [-mToU(1.2), 0], [mToU(1.2), 0]] as const) {
        // canon §10.2 speeds: Phong Lang 1.4, Thạch Thử 1.6 m/s; Cuồng +30 %, a general's aura +15 % (canon §10.3, §10.4).
        const tenths = tenthsToBarrier(probe(gate, 1400, dx, dz));
        results["phong-lang " + gate + " " + dx + " " + dz] = tenths;
        expect(window(tenths)).toBe(true);
        expect(window(tenthsToBarrier(probe(gate, 1600, dx, dz)))).toBe(true);
        expect(floor(tenthsToBarrier(probe(gate, 1820, dx, dz)))).toBe(true);
        expect(floor(tenthsToBarrier(probe(gate, 1610, dx, dz)))).toBe(true);
        expect(floor(tenthsToBarrier(probe(gate, 2093, dx, dz)))).toBe(true);
      }
    }
    for (const entry of [0, 1]) {
      const tenths = tenthsToBarrier(probe("sky", 2000, 0, 0, entry));
      expect(window(tenths)).toBe(true);
      // canon §8.1: Hỏa Nha 9.0 s.
      expect(Math.abs(tenths - 90)).toBeLessThanOrEqual(3);
    }
    // canon §8.1: Phong Lang 10.7 s from the gate itself (the gate point sits 0.25 m inside the field,
    // the pillar on the line adds a little); A and B mirror each other.
    expect(Math.abs(results["phong-lang A 0 0"]! - 107)).toBeLessThanOrEqual(8);
    expect(results["phong-lang A 0 0"]).toBe(results["phong-lang B 0 0"]);
  });

  it("mirrors gate A's field onto gate B's: every waypoint and path length east–west", () => {
    const flow = field.flows.A;
    const mirror = (cell: number) => Math.floor(cell / field.cols) * field.cols + (field.cols - 1 - (cell % field.cols));
    for (let cell = 0; cell < field.cols * field.rows; cell += 1) {
      const wp = flow.waypoint[cell]!;
      expect(flow.waypoint[mirror(cell)]).toBe(wp < 0 ? wp : mirror(wp));
      expect(flow.pathU[mirror(cell)]).toBe(flow.pathU[cell]);
    }
    const a = gatePoint(stage, "A");
    const b = gatePoint(stage, "B");
    expect(cellAt(field, b.x, b.z)).toBe(mirror(cellAt(field, a.x, a.z)));
  });

  it("keeps the player's clearance and the beasts' the same (canon §9.1 radius)", () => {
    expect(FIELD.clearanceMm).toBe(PLAYER.radiusMm);
    expect(msToTicks(1000)).toBe(60);
  });
});
