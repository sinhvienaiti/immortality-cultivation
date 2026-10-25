import { describe, expect, it } from "vitest";
import { M0A_WAVE_LOADS, M0A_WAVES } from "../../src/content/data/waves";
import { GENERAL, LOAD, STAGE_M0A } from "../../src/content/rules";
import type { EliteTraitId, SpeciesId, WaveDef } from "../../src/content/types";
import { groupW100, peakLoadX100, targetW100, waveGates, waveLoadX100, waveW100, type WaveWeights } from "../../src/sim/waves";
import { CANON_BEASTS, CANON_ELITES } from "../local/fakes";

/**
 * canon §13.3 (and §13.1 bands, §10.3–10.4) on the M0a wave plan, weighed with the canon's own W
 * (§10.2: Thạch Thử 0.33, Phong Lang 1, Hỏa Nha 0.8, Nham Viên 2, Thiết Giáp Trư 3, Lang Đầu Đàn 7;
 * an elite W × 1.6, Thiết Bì +2 W), so the plan is checked whatever the beast tables hold.
 */
const CANON: WaveWeights = {
  w100: (species: SpeciesId) => CANON_BEASTS[species].w100,
  eliteW100: (species: SpeciesId, trait: EliteTraitId) => Math.round((CANON_BEASTS[species].w100 * 1600) / 1000) + CANON_ELITES[trait].extraW100,
};

interface Mix {
  clusters: number;
  "phong-lang": number;
  "hoa-nha": number;
  "nham-vien": number;
  "thiet-giap-tru": number;
  "lang-dau-dan": number;
  elites: string[];
  beasts: number;
}

function mix(wave: WaveDef): Mix {
  const out: Mix = { clusters: 0, "phong-lang": 0, "hoa-nha": 0, "nham-vien": 0, "thiet-giap-tru": 0, "lang-dau-dan": 0, elites: [], beasts: 0 };
  for (const group of wave.groups) {
    out.beasts += group.count;
    if (group.cluster) {
      expect(group).toMatchObject({ species: "thach-thu", count: STAGE_M0A.clusterSize });
      out.clusters += 1;
      continue;
    }
    out[group.species as Exclude<keyof Mix, "clusters" | "elites" | "beasts">] += group.count;
    if (group.elite) out.elites.push(group.species + "/" + group.elite);
  }
  out.elites.sort();
  return out;
}

/** canon §13.3 table. */
const TABLE = [
  { durationMs: 40_000, gates: ["A"], w: 30, clusters: 4, pl: 14, hn: 0, nv: 3, tgt: 0, ldd: 0, elites: [], beasts: 45, summonW100: 0 },
  { durationMs: 45_000, gates: ["A", "B"], w: 42, clusters: 5, pl: 16, hn: 0, nv: 4, tgt: 2, ldd: 0, elites: [], beasts: 57, summonW100: 0 },
  { durationMs: 50_000, gates: ["A", "B", "sky"], w: 53, clusters: 6, pl: 14, hn: 8, nv: 4, tgt: 3, ldd: 0, elites: ["phong-lang/cuong"], beasts: 71, summonW100: 0 },
  { durationMs: 55_000, gates: ["A", "B", "sky"], w: 64, clusters: 7, pl: 8, hn: 6, nv: 5, tgt: 4, ldd: 1, elites: [], beasts: 73, summonW100: 600 },
  { durationMs: 55_000, gates: ["A", "B", "sky"], w: 68.6, clusters: 9, pl: 13, hn: 6, nv: 5, tgt: 5, ldd: 0, elites: ["nham-vien/hoi-nguyen", "thiet-giap-tru/thiet-bi"], beasts: 92, summonW100: 0 },
  { durationMs: 60_000, gates: ["A", "B", "sky"], w: 84.6, clusters: 11, pl: 10, hn: 8, nv: 7, tgt: 4, ldd: 1, elites: ["nham-vien/thiet-bi", "phong-lang/cuong"], beasts: 107, summonW100: 600 },
] as const;

describe("M0a wave plan (canon §13.3)", () => {
  it("has the table's six waves: length, gates, composition, elites, beasts and the summon allowance", () => {
    expect(M0A_WAVES).toHaveLength(STAGE_M0A.waves);
    M0A_WAVES.forEach((wave, index) => {
      const row = TABLE[index]!;
      const got = mix(wave);
      expect(wave.durationMs).toBe(row.durationMs);
      expect([...wave.gates].sort()).toEqual([...row.gates].sort());
      expect(waveGates(wave)).toEqual([...wave.gates]);
      expect([got.clusters, got["phong-lang"], got["hoa-nha"], got["nham-vien"], got["thiet-giap-tru"], got["lang-dau-dan"]]).toEqual([row.clusters, row.pl, row.hn, row.nv, row.tgt, row.ldd]);
      expect(got.elites).toEqual(row.elites);
      expect(got.beasts).toBe(row.beasts);
      expect(wave.summonMaxW100).toBe(row.summonW100);
      for (const group of wave.groups) if (group.species === "lang-dau-dan") expect(group).toMatchObject({ general: true, count: 1 });
    });
    // 445 beasts, about two thirds of them swarm (canon §13.3).
    const all = M0A_WAVES.map(mix);
    const beasts = all.reduce((sum, m) => sum + m.beasts, 0);
    const swarm = all.reduce((sum, m) => sum + m.clusters * STAGE_M0A.clusterSize, 0);
    expect(beasts).toBe(445);
    expect(Math.round((swarm * 100) / beasts)).toBe(66);
  });

  it("weighs each wave within 1.5 W of the table, and within ± 25 % of L × D_ref × minutes with summons (analytic filter, PB-09)", () => {
    let total = 0;
    M0A_WAVES.forEach((wave, index) => {
      const w100 = waveW100(wave, CANON);
      total += w100;
      // The table writes the target L × D_ref × minutes (wave 3: 53 W); its own composition sums to 51.9 W.
      expect(Math.abs(w100 - TABLE[index]!.w * 100)).toBeLessThanOrEqual(150);
      const target = targetW100(M0A_WAVE_LOADS[index]!.loadX100, wave.durationMs);
      expect(Math.abs(w100 - target) * 100).toBeLessThanOrEqual(LOAD.analyticTolerancePct * target);
    });
    // ≈ 342 W before the Vương (canon §13.3; the compositions sum to 339.8 W).
    expect(Math.abs(total - 34_200)).toBeLessThanOrEqual(300);
  });

  it("sits in the canon §13.1 load bands: wave 1 0.55–0.65, middle 0.75–1.00, last 1.05–1.25", () => {
    const band = (index: number): readonly [number, number] => (index === 0 ? LOAD.firstWave : index === M0A_WAVES.length - 1 ? LOAD.last : LOAD.middle);
    M0A_WAVES.forEach((wave, index) => {
      const stated = M0A_WAVE_LOADS[index]!.loadX100;
      const [min, max] = band(index);
      expect(stated).toBeGreaterThanOrEqual(min);
      expect(stated).toBeLessThanOrEqual(max);
      // The canon's composition rounds a little under its stated L (wave 2: 41.6 W of 42.2, wave 3: 51.9 of 53.1).
      expect(Math.abs(waveLoadX100(wave, CANON) - stated)).toBeLessThanOrEqual(2);
    });
  });

  it("keeps short peaks under the caps: the busiest 8 s and 10 s ≤ 1.15 in waves 1–5, ≤ 1.30 in the last, and the stated peaks", () => {
    M0A_WAVES.forEach((wave, index) => {
      const last = index === M0A_WAVES.length - 1;
      const cap = M0A_WAVE_LOADS[index]!.peakX100 ?? (last ? LOAD.lastPeakMax : LOAD.middlePeakMax);
      for (const windowMs of [8000, 10_000]) {
        const peak = peakLoadX100(wave, windowMs, CANON);
        expect(peak).toBeLessThanOrEqual(cap);
        expect(peak).toBeLessThanOrEqual(LOAD.hardMax);
        // A peak stands above the wave's mean.
        expect(peak).toBeGreaterThan(waveLoadX100(wave, CANON));
      }
    });
  });

  it("has 2–3 peaks of 6–10 s inside the wave, with lulls of ≥ 8 s between them", () => {
    for (const wave of M0A_WAVES) {
      expect(wave.peaks.length).toBeGreaterThanOrEqual(LOAD.peaksPerWave[0]);
      expect(wave.peaks.length).toBeLessThanOrEqual(LOAD.peaksPerWave[1]);
      let end = -Infinity;
      for (const peak of wave.peaks) {
        expect(peak.lenMs).toBeGreaterThanOrEqual(LOAD.peakMs[0]);
        expect(peak.lenMs).toBeLessThanOrEqual(LOAD.peakMs[1]);
        expect(peak.atMs + peak.lenMs).toBeLessThanOrEqual(wave.durationMs);
        if (end > -Infinity) expect(peak.atMs - end).toBeGreaterThanOrEqual(LOAD.lullMinMs);
        end = peak.atMs + peak.lenMs;
      }
    }
  });

  it("keeps the gate rule at k = 1 (one group a gate every 1.5 s, any two 0.6 s apart) with every group inside the wave clock", () => {
    for (const wave of M0A_WAVES) {
      const groups = [...wave.groups].sort((a, b) => a.atMs - b.atMs);
      expect(groups.map((g) => g.atMs)).toEqual(wave.groups.map((g) => g.atMs));
      const lastByGate = new Map<string, number>();
      groups.forEach((group, index) => {
        expect(group.atMs).toBeGreaterThanOrEqual(0);
        expect(group.atMs).toBeLessThan(wave.durationMs);
        if (index > 0) expect(group.atMs - groups[index - 1]!.atMs).toBeGreaterThanOrEqual(LOAD.gatePairGapMs);
        const before = lastByGate.get(group.gate);
        if (before !== undefined) expect(group.atMs - before).toBeGreaterThanOrEqual(LOAD.gateGapMs);
        lastByGate.set(group.gate, group.atMs);
        // Flyers only on the sky route, nothing else on it.
        expect(group.gate === "sky").toBe(group.species === "hoa-nha");
      });
    }
  });

  it("keeps a thú tướng ≤ 35 % of its wave's W and tinh anh at 3–5 % of the stage's non-swarm beasts (canon §10.3, §10.4)", () => {
    let elites = 0;
    let nonSwarm = 0;
    for (const wave of M0A_WAVES) {
      const w100 = waveW100(wave, CANON);
      for (const group of wave.groups) {
        if (group.general) expect(groupW100(group, CANON) * 100).toBeLessThanOrEqual(GENERAL.maxWaveHpPct * w100);
        if (group.elite) elites += 1;
        if (!group.cluster) nonSwarm += group.count;
      }
    }
    expect(elites * 100).toBeGreaterThanOrEqual(3 * nonSwarm);
    expect(elites * 100).toBeLessThanOrEqual(5 * nonSwarm);
  });
});
