import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { boltLevel, chainOrder, QUY_NHAT, type ThunderFinisher, columnFlash, columnRun, FIVE_THUNDER, FiveThunder, inCourt, planFiveThunder, SHARP_COLUMN_VIDEO, trailWidth, scarLevels, strikeLevel, THUNDER_SOURCES, type ThunderHost, type ThunderLayer } from "../../src/lab/five-thunder";
import type { ImpactRole } from "../../src/view/screen-fx";

/** A lab stand-in: beasts at fixed points, every call logged. */
function lab(pts: readonly (readonly [number, number])[], reduced = false, finisher: ThunderFinisher = "eightRuns") {
  const cam = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
  cam.position.set(0, 26, 14);
  cam.lookAt(0, 0, -6);
  const hp = pts.map(() => 30);
  const log = { blows: [] as { i: number; role: ImpactRole; dx: number; dz: number; power: number }[], strikes: [] as { jolt: number; stop: number; flash: number }[],
    status: [] as number[], shoves: [] as { i: number; metres: number }[], sounds: [] as number[], glow: [] as number[], dark: [] as number[],
    pillars: [] as { x: number; z: number; scale: number; lifeS: number }[] };
  const host: ThunderHost = {
    layer: new THREE.Group(), camera: cam, reduced,
    inCircle(x, z, r, out) {
      let n = 0;
      pts.forEach(([px, pz], i) => { if (hp[i]! > 0 && Math.hypot(px - x, pz - z) <= r + 0.4) out[n++] = i; });
      return n;
    },
    x: (i) => pts[i]![0],
    z: (i) => pts[i]![1],
    blow(i, dx, dz, power, role) { log.blows.push({ i, role, dx, dz, power }); hp[i] = hp[i]! - 1; return hp[i]! <= 0; },
    status: (i) => log.status.push(i),
    size: () => 0.5,
    shove: (i, _dx, _dz, metres) => { log.shoves.push({ i, metres }); },
    strike: (_at, jolt, _s, stop, flash) => log.strikes.push({ jolt, stop, flash }),
    sound: (rate) => log.sounds.push(rate),
    glow: (k) => log.glow.push(k),
    hand: (out) => out.set(0.3, 1.3, 2.6),
    dark: (k) => log.dark.push(k),
    pillar: (at, scale, lifeS) => log.pillars.push({ x: at.x, z: at.z, scale, lifeS }),
    alive: (i) => hp[i]! > 0,
  };
  const fx = new FiveThunder(host);
  // Round 37's eight runs unless asked: the tests below this one were written for it (Quy Nhất has its own).
  fx.finisher = finisher;
  const tex = new THREE.Texture();
  for (const id of Object.keys(THUNDER_SOURCES) as ThunderLayer[]) fx.adopt(id, tex, THUNDER_SOURCES[id].flat ? 1254 : 941, THUNDER_SOURCES[id].flat ? 1254 : 1672);
  return { fx, host, log, hp };
}
const step = (fx: FiveThunder, frames: number, dt = 1 / 60) => { for (let k = 0; k < frames; k += 1) fx.update(dt); };

describe("Ngũ Lôi Oanh Đỉnh's plan (five-thunder-lab.md)", () => {
  it("is the same shower from the same seed, 12–24 bolts from the charge's end to the barrage's end, quickening", () => {
    for (const seed of [1, 7, 1111, 20261111]) {
      const a = planFiveThunder(seed);
      expect(a).toEqual(planFiveThunder(seed));
      const n = a.at.length;
      expect(n).toBeGreaterThanOrEqual(FIVE_THUNDER.min);
      expect(n).toBeLessThanOrEqual(FIVE_THUNDER.max);
      expect(a.at[0]).toBe(FIVE_THUNDER.chargeS);
      expect(a.at[n - 1]!).toBeLessThan(FIVE_THUNDER.finalS);
      // Round 20: the barrage ends a pause and a gathering before the final strike.
      expect(a.at[n - 1]!).toBeGreaterThan(FIVE_THUNDER.finalS - FIVE_THUNDER.pauseS - FIVE_THUNDER.gatherS - 0.05);
      // Round 14: about 220 ms down to 70 ms, the last three bolts 30 ms apart, then a 180 ms pause before the final strike.
      const first = a.at[1]! - a.at[0]!;
      const late = a.at[n - 3]! - a.at[n - 4]!;
      expect(first).toBeGreaterThan(0.19);
      expect(first).toBeLessThan(0.25);
      expect(late).toBeGreaterThan(0.06);
      expect(late).toBeLessThan(0.085);
      expect(a.at[n - 1]! - a.at[n - 2]!).toBeCloseTo(FIVE_THUNDER.lastGap, 6);
      expect(a.at[n - 2]! - a.at[n - 3]!).toBeCloseTo(FIVE_THUNDER.lastGap, 6);
      expect(FIVE_THUNDER.finalS - a.at[n - 1]!).toBeCloseTo(FIVE_THUNDER.pauseS + FIVE_THUNDER.gatherS, 6);
      for (let k = 1; k < n; k += 1) expect(a.at[k]!).toBeGreaterThan(a.at[k - 1]!);
    }
    expect(planFiveThunder(3)).not.toEqual(planFiveThunder(4));
  });

  it("spreads the bolts over the area, never on the landing just before, in four shapes and sizes 0.8–1.25", () => {
    const p = planFiveThunder(1111, 20);
    const shapes = new Set<number>();
    for (let k = 0; k < 20; k += 1) {
      expect(Math.hypot(p.ox[k]!, p.oz[k]!)).toBeLessThanOrEqual(FIVE_THUNDER.areaR + 1e-9);
      if (k > 0) expect(Math.hypot(p.ox[k]! - p.ox[k - 1]!, p.oz[k]! - p.oz[k - 1]!)).toBeGreaterThanOrEqual(FIVE_THUNDER.apartM);
      if (k > 0) expect(p.shape[k]).not.toBe(p.shape[k - 1]);
      expect(p.scale[k]!).toBeGreaterThanOrEqual(FIVE_THUNDER.scaleMin);
      expect(p.scale[k]!).toBeLessThanOrEqual(FIVE_THUNDER.scaleMax);
      expect(p.restrikes[k]!).toBeGreaterThanOrEqual(1);
      expect(p.restrikes[k]!).toBeLessThanOrEqual(2);
      expect(p.flashS[k]!.length).toBe(p.restrikes[k]! + 1);
      for (const f of p.flashS[k]!) { expect(f).toBeGreaterThanOrEqual(3 / 60 - 1e-9); expect(f).toBeLessThanOrEqual(6 / 60 + 1e-9); }
      shapes.add(p.shape[k]!);
    }
    expect(shapes.size).toBe(4);
    expect(p.arcAt.length).toBe(FIVE_THUNDER.arcs);
    for (const t of p.arcAt) { expect(t).toBeGreaterThanOrEqual(FIVE_THUNDER.finalEndS); expect(t).toBeLessThan(FIVE_THUNDER.endS + FIVE_THUNDER.arcTailS); }
  });

  it("names a still, a pivot inside the image and a plane for every layer", () => {
    for (const [id, s] of Object.entries(THUNDER_SOURCES)) {
      // The ground tint has no still (a white texel).
      if (id === "dim" || id === "glowPool") continue;
      // Approved stills (vN-tryN), or a script-derived sheet of one (.lab.png, round 24).
      expect(s.still).toMatch(/^(thunder|a9|i2v-thunder)-[a-z0-9-]+(\.v\d-try\d+|\.lab|\.v\d-try\d+(-core)?\.lab)\.png$/);
      // A strip tile is placed by its leading edge (pivot x 0); every other pivot sits inside its image.
      for (const c of s.pivot) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThan(1); }
      // Quy Nhất's ribbon is a strip too (laid from its tail point along its run).
      if (!id.startsWith("trail") && id !== "ribbon") expect(s.pivot[0]).toBeGreaterThan(0);
      expect([true, false]).toContain(s.flat);
    }
  });
});

describe("Ngũ Lôi Oanh Đỉnh in the lab", () => {
  it("charges (glow, dark, formation, seal), then lands every bolt on its frame, whole on that frame, with its blows, jolt, flash and crack", () => {
    const { fx, log } = lab([[0, -8], [1, -8.5], [-1.2, -7.6], [4, -4], [-5, -11]]);
    fx.cast(0, -8, 1111);
    expect(fx.active).toBe(true);
    expect(log.sounds.length).toBe(1);
    step(fx, 30);
    expect(fx.audit.formation).toBeGreaterThan(0);
    expect(fx.audit.seal).toBeGreaterThan(0);
    expect(fx.audit.bolts).toBe(0);
    expect(Math.max(...log.glow)).toBeGreaterThan(0.5);
    expect(Math.max(...log.dark)).toBeGreaterThan(0.1);
    expect(Math.max(...log.dark)).toBeLessThanOrEqual(0.25);
    // Through the barrage: every single bolt landed, the final strike too, the glow and the darkening off.
    step(fx, 60 * 3.5 - 30);
    const r = fx.last!;
    expect(r.bolts.length).toBe(r.count);
    expect(fx.audit.bolts).toBe(r.count);
    expect(r.finalAt).toBeGreaterThanOrEqual(FIVE_THUNDER.finalS);
    expect(r.finalAt).toBeLessThan(FIVE_THUNDER.finalS + 1 / 60 + 1e-9);
    expect(r.firstK.every((k) => k >= 0.95)).toBe(true);
    expect(log.glow[log.glow.length - 1]).toBe(0);
    expect(log.dark[log.dark.length - 1]).toBe(0);
    // Each landing: a strike (jolt, flash), a crack; the final: a stop and the biggest jolt.
    expect(log.strikes.length).toBe(r.count + 1);
    const final = log.strikes[log.strikes.length - 1]!;
    expect(final.stop).toBe(FIVE_THUNDER.finalStopMs);
    expect(final.jolt).toBe(FIVE_THUNDER.finalJoltPx);
    expect(final.flash).toBe(FIVE_THUNDER.finalFlash);
    for (const s of log.strikes.slice(0, -1)) { expect(s.stop).toBe(0); expect(s.flash).toBeLessThan(FIVE_THUNDER.finalFlash); expect(s.jolt).toBeGreaterThan(0); }
    expect(fx.audit.cracks).toBe(r.count + 1);
    // The final strike covers the area: every beast in it struck (the finisher), away from the centre.
    const finishers = log.blows.filter((b) => b.role === "finisher");
    expect(finishers.length).toBeGreaterThanOrEqual(4);
    const away = finishers.find((b) => b.i === 3)!;
    expect(away.dx * 4 + away.dz * 4).toBeGreaterThan(0);
    expect(r.struck).toBe(log.blows.length);
    // A thunder crack per landing (the cast's own first), pitched within 0.8–1.25.
    expect(log.sounds.length).toBeGreaterThanOrEqual(r.count + 2);
    for (const rate of log.sounds) { expect(rate).toBeGreaterThan(0.75); expect(rate).toBeLessThan(1.3); }
  });

  it("lands a bolt's blows within its reach only, shocked when they live", () => {
    const { fx, log } = lab([[0, -8], [0, -8 + FIVE_THUNDER.hitR * 0.8 - 0.5], [0, -8 + FIVE_THUNDER.areaR + 3]]);
    fx.cast(0, -8, 2);
    step(fx, Math.round(60 * FIVE_THUNDER.finalS) - 2);
    // Before the final strike no bolt reached the beast beyond the area.
    expect(log.blows.some((b) => b.i === 2)).toBe(false);
    expect(log.status.length).toBeGreaterThan(0);
  });

  it("cools the scars and skips arcs over them in the aftermath, then ends", () => {
    const { fx } = lab([[0, -8]]);
    fx.cast(0, -8, 5);
    step(fx, Math.round(60 * 4.2));
    const cracksAt42 = fx.live;
    expect(cracksAt42).toBeGreaterThan(0);
    // Smoke and ash rise once as the aftermath opens.
    expect(fx.audit.puffs).toBeGreaterThanOrEqual(FIVE_THUNDER.puffs[0]);
    expect(fx.audit.puffs).toBeLessThanOrEqual(FIVE_THUNDER.puffs[1]);
    // The arcs skip on past the aftermath's end (round 16).
    step(fx, Math.round(60 * (1.3 + FIVE_THUNDER.arcTailS)));
    expect(fx.audit.arcs).toBe(FIVE_THUNDER.arcs);
    expect(fx.last!.arcs).toBe(FIVE_THUNDER.arcs);
    // The cooled scars fade over scarOutS after the aftermath.
    step(fx, 30);
    expect(fx.active).toBe(false);
    step(fx, 2);
    expect(fx.live).toBe(0);
  });

  it("is the same from the same seed on fixed steps, and a reset clears it", () => {
    const a = lab([[0, -8], [2, -6]]);
    const b = lab([[0, -8], [2, -6]]);
    a.fx.cast(0, -8, 9);
    b.fx.cast(0, -8, 9);
    step(a.fx, 240);
    step(b.fx, 240);
    expect(a.fx.last).toEqual(b.fx.last);
    expect(a.fx.audit).toEqual(b.fx.audit);
    a.fx.reset();
    expect(a.fx.active).toBe(false);
    expect(a.fx.live).toBe(0);
    expect(a.log.glow[a.log.glow.length - 1]).toBe(0);
  });

  it("reduced motion: no stop, no jolt, no full-screen flash; the bolts, blows and sound stay", () => {
    const { fx, log } = lab([[0, -8], [1, -9]], true);
    fx.cast(0, -8, 1111);
    step(fx, 300);
    expect(log.strikes.length).toBeGreaterThan(5);
    for (const s of log.strikes) { expect(s.stop).toBe(0); expect(s.jolt).toBe(0); expect(s.flash).toBe(0); }
    expect(log.blows.length).toBeGreaterThan(0);
  });
  it("prints a scar hot on the landing frame, cross-fades it to the cooled patch, and has no scorch-crack star left", () => {
    expect(Object.keys(THUNDER_SOURCES)).not.toContain("crack");
    expect(THUNDER_SOURCES.scarHot.still).toBe("thunder-scar-crack-hot.v1-try9.png");
    expect(scarLevels(0, 0.6, 1.2)).toEqual({ hot: 1, cold: 0 });
    expect(scarLevels(0.6, 0.6, 1.2)).toEqual({ hot: 1, cold: 0 });
    const mid = scarLevels(1.2, 0.6, 1.2);
    expect(mid.hot + mid.cold).toBeCloseTo(1, 6);
    expect(mid.cold).toBeCloseTo(0.5, 6);
    expect(scarLevels(1.8, 0.6, 1.2)).toEqual({ hot: 0, cold: 1 });
  });
  it("throws 10–16 sparks from every landing and gives each kill its own death (round 6: no layer taken out without one in its place)", () => {
    const pts: [number, number][] = [];
    for (let k = 0; k < 24; k += 1) pts.push([Math.cos(k) * (1 + (k % 5)), -8 + Math.sin(k) * (1 + (k % 5))]);
    const { fx, hp } = lab(pts);
    hp.fill(2);
    fx.cast(0, -8, 1111);
    step(fx, 6 * 60);
    const landings = fx.last!.count + 2;
    expect(fx.audit.sparks).toBeGreaterThanOrEqual(10 * landings);
    expect(fx.audit.sparks).toBeLessThanOrEqual(16 * landings);
    expect(fx.audit.deaths).toBe(fx.last!.killed);
    expect(fx.audit.risers).toBe(FIVE_THUNDER.risers);
    for (const id of ["sparks", "embers", "motes"] as const) expect(THUNDER_SOURCES[id].grid).toEqual([4, 4]);
    expect(THUNDER_SOURCES.sparkle.flipbook).toEqual({ folder: "thunder", id: "thunder-sparkle" });
  });
  it("cuts hard: a bolt whole for 3 frames, an afterimage for one, a restrike for two, nothing fading over 3 frames (round 14)", () => {
    const levels = Array.from({ length: 10 }, (_, n) => boltLevel(n / 60));
    expect(levels).toEqual([1, 1, 1, 0.4, 0, 0, 0.6, 0.6, 0, 0]);
    // Without a restrike (the last three bolts): dark after the afterimage.
    expect(Array.from({ length: 10 }, (_, n) => boltLevel(n / 60, false))).toEqual([1, 1, 1, 0.4, 0, 0, 0, 0, 0, 0]);
    expect(strikeLevel(0)).toBe(1);
    expect(strikeLevel(11 / 60)).toBe(1);
    expect(strikeLevel(12 / 60)).toBe(0.4);
    expect(strikeLevel(13 / 60)).toBe(0);
    expect(strikeLevel(16 / 60)).toBe(0.6);
    expect(strikeLevel(18 / 60)).toBe(0);
    // Round 17: the bolts alternate right and left of the centre, further out as they go.
    const plan = planFiveThunder(1111);
    for (let k = 0; k < plan.ox.length; k += 1) expect(Math.sign(plan.ox[k]!)).toBe(k % 2 === 0 ? 1 : -1);
    expect(Math.hypot(plan.ox[plan.ox.length - 1]!, plan.oz[plan.oz.length - 1]!)).toBeGreaterThan(Math.hypot(plan.ox[0]!, plan.oz[0]!));
    // Every struck beast is thrown 1.2–1.8 m.
    const { fx, log } = lab([[0, -8], [1, -8.5], [-1.2, -7.6]]);
    fx.cast(0, -8, 1111);
    step(fx, 5 * 60);
    expect(log.shoves.length).toBe(log.blows.length);
    // The release thread shows for two frames before the first bolt.
    expect(fx.audit.thread).toBe(2);
    for (const s of log.shoves) { expect(s.metres).toBeGreaterThanOrEqual(1.2); expect(s.metres).toBeLessThanOrEqual(1.8); }
  });
  it("ends on a centre bolt and eight columns running out from it, built from the single bolts (round 21)", () => {
    const keys = Object.keys(THUNDER_SOURCES);
    for (const gone of ["fan", "gather", "strike", "pop"]) expect(keys).not.toContain(gone);
    expect(THUNDER_SOURCES.burst.flat).toBe(true);
    const pts: [number, number][] = [];
    for (let k = 0; k < 16; k += 1) pts.push([Math.cos((k * Math.PI) / 8) * 9, -8 + Math.sin((k * Math.PI) / 8) * 9]);
    const { fx, log } = lab(pts);
    fx.cast(0, -8, 1111);
    step(fx, Math.round(60 * (FIVE_THUNDER.finalS - 0.02)));
    // Through the gathering: no final strike yet.
    expect(fx.audit.strike).toBe(0);
    expect(fx.audit.columns).toBe(0);
    const before = log.blows.length;
    step(fx, Math.round(60 * (FIVE_THUNDER.colS + FIVE_THUNDER.colEdgeS + 0.3)));
    // Round 22: a column's run is steady, then slows to a stop over its last 30 %.
    expect(columnRun(0, 0.3)).toBe(0);
    expect(columnRun(1, 0.3)).toBeCloseTo(1, 9);
    expect(columnRun(0.5, 0.3) / 0.5).toBeCloseTo(columnRun(0.25, 0.3) / 0.25, 9);
    expect(columnRun(1, 0.3) - columnRun(0.9, 0.3)).toBeLessThan(columnRun(0.5, 0.3) - columnRun(0.4, 0.3));
    expect(fx.audit.strike).toBeGreaterThan(0);
    // Eight columns, each drawn for colS (30 frames), the diagonals 3 frames after the main four.
    // Round 25: eight sheaves of three columns, each drawn for colS (48 frames at 0.8 s).
    // Round 31: each sheaf of three rides its strip's head from the centre for colS, then swells and fades at the edge
    // for colEdgeS (75 frames in all).
    const riding = Math.round((FIVE_THUNDER.colS + FIVE_THUNDER.colEdgeS) * 60);
    // Round 34: three columns a sheaf (one main, two mirrored), all eight sheaves starting on one frame.
    // Round 35: each sheaf's swell waits its peak lag (0, 0.06 or 0.12 s round the ring), standing at the edge meanwhile.
    const lagF = [0, 1, 2, 3, 4, 5, 6, 7].reduce((n, c) => n + Math.round(FIVE_THUNDER.peakLagS[c % FIVE_THUNDER.peakLagS.length]! * 60), 0) * 3;
    expect(fx.audit.columns).toBeGreaterThanOrEqual(24 * riding + lagF - 24);
    expect(fx.audit.columns).toBeLessThanOrEqual(24 * riding + lagF + 24);
    // Round 24: the runs are the three braided columns; each core flashes on about a third of its 3-frame beats.
    expect(THUNDER_SOURCES.columnA.grid).toEqual([12, 6]);
    expect(SHARP_COLUMN_VIDEO).not.toBe("");
    for (let c = 0; c < 8; c += 1) {
      let on = 0;
      for (let f = 0; f < 600; f += 1) if (columnFlash(c, f / 60)) on += 1;
      expect(on / 600).toBeGreaterThan(0.2);
      expect(on / 600).toBeLessThan(0.48);
    }
    // Round 23: each column lays its cracked strip in square tiles behind its foot, never stretched.
    expect(fx.audit.trail).toBeGreaterThanOrEqual(8 * 3);
    expect(THUNDER_SOURCES.trailRock.grid).toEqual([8, 1]);
    expect(THUNDER_SOURCES.trailRock.mode).toBe("rgba");
    // Round 26: bolts crawl flat behind every sheaf's foot; the strips taper to 35 % (±20 %) and stay on the court.
    expect(fx.audit.crawl).toBeGreaterThanOrEqual(8 * 40);
    for (let seed = 0; seed < 24; seed += 1) {
      for (let f = 0; f <= 1; f += 0.05) {
        const w = trailWidth(f, seed);
        const base = 1 - (1 - FIVE_THUNDER.trailTaper) * f;
        expect(w).toBeGreaterThanOrEqual(base * (1 - FIVE_THUNDER.trailWobble) - 1e-9);
        expect(w).toBeLessThanOrEqual(base * (1 + FIVE_THUNDER.trailWobble) + 1e-9);
      }
    }
    expect(inCourt(0, -5)).toBe(true);
    expect(inCourt(19.8, -5, FIVE_THUNDER.courtMarginM)).toBe(false);
    expect(inCourt(0, 7.8, FIVE_THUNDER.courtMarginM)).toBe(false);
    expect(FIVE_THUNDER.trailRockA).toBeLessThanOrEqual(0.65);
    expect(FIVE_THUNDER.sheafOffM[0]).toBeGreaterThanOrEqual(0.8);
    // Beasts 9 m out, beyond the area's finisher, are thrown by the columns that pass them, once each.
    const swept = log.blows.slice(before).filter((b) => b.role === "secondary");
    expect(swept.length).toBeGreaterThanOrEqual(4);
    expect(new Set(swept.map((b) => b.i)).size).toBe(swept.length);
  });

  it("keeps two bolts that land within 6 frames of one another 2.5 m apart (round 21)", () => {
    for (const seed of [1, 7, 1111, 20261111]) {
      const p = planFiveThunder(seed);
      for (let k = 1; k < p.at.length; k += 1) {
        for (let j = Math.max(0, k - 3); j < k; j += 1) {
          if (p.at[k]! - p.at[j]! <= FIVE_THUNDER.closeS + 1e-6) expect(Math.hypot(p.ox[k]! - p.ox[j]!, p.oz[k]! - p.oz[j]!)).toBeGreaterThanOrEqual(FIVE_THUNDER.closeM);
        }
      }
    }
  });
});

describe("Ngũ Lôi Quy Nhất finisher (owner 15/11)", () => {
  it("gathers five element bolts on the ring, slams key 8's pillar on the centre after gatherS, then chains to every beast", () => {
    const pts: [number, number][] = [];
    for (let k = 0; k < 30; k += 1) pts.push([Math.cos(k * 2.4) * (2 + k * 0.6), -8 + Math.sin(k * 2.4) * (2 + k * 0.6)]);
    const { fx, log } = lab(pts, false, "quyNhat");
    fx.cast(0, -8, 1111);
    const slamF = Math.ceil((FIVE_THUNDER.finalS + QUY_NHAT.gatherS) * 60);
    step(fx, slamF - 2);
    expect(log.pillars.length).toBe(0);
    expect(fx.last!.gatherBolts).toBe(5);
    step(fx, 3);
    // The one accent: one pillar, on the centre, scaled up; the finisher's blow, jolt, stop and flash.
    expect(log.pillars).toEqual([{ x: 0, z: -8, scale: QUY_NHAT.pillarScale, lifeS: QUY_NHAT.pillarLifeS }]);
    expect(Math.abs(fx.last!.slamAt! - (FIVE_THUNDER.finalS + QUY_NHAT.gatherS))).toBeLessThanOrEqual(1 / 60 + 1e-9);
    expect(log.blows.some((b) => b.role === "finisher")).toBe(true);
    expect(log.strikes.at(-1)!.flash).toBe(QUY_NHAT.slamFlash);
    expect(fx.audit.strike).toBe(0);
    step(fx, 4 * 60);
    // Every live beast within chainR reached: its blow, then its ticks.
    expect(fx.last!.chainHops).toBeGreaterThan(0);
    expect(fx.last!.chainBlows!).toBeGreaterThanOrEqual(fx.last!.chainHops!);
    expect(fx.active).toBe(false);
  });

  it("orders the chain nearest first, each hop from the nearest beast already reached", () => {
    const { order, from } = chainOrder(0, 0, [1, 5, 2, 9], [0, 0, 0, 0]);
    expect(order).toEqual([0, 2, 1, 3]);
    expect(from).toEqual([-1, 0, 2, 1]);
  });

  it("keeps round 37's eight runs switchable", () => {
    const pts: [number, number][] = [];
    for (let k = 0; k < 16; k += 1) pts.push([Math.cos((k * Math.PI) / 8) * 9, -8 + Math.sin((k * Math.PI) / 8) * 9]);
    const { fx, log } = lab(pts, false, "eightRuns");
    fx.cast(0, -8, 1111);
    step(fx, Math.ceil(FIVE_THUNDER.finalS * 60) + 30);
    expect(log.pillars.length).toBe(0);
    expect(fx.audit.strike).toBeGreaterThan(0);
  });
});
