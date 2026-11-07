import * as THREE from "three";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FivePhaseClip, FIVE_CLIP_ID, FIVE_CLIP_CHARGE_S, FIVE_CLIP_TAIL_S, fivePhaseClipEnabled } from "../../src/lab/five-phase-clip";
import { ClipSkillRunner, KEY8_SKILLS, KEY9_NAV, KEY9_SKILLS, type ClipSkillHost } from "../../src/lab/clip-skills";
import { Showcase, ULT_SHOWCASE } from "../../src/lab/showcase";
import { FoeFlipbookFx, FOE_CLIPS } from "../../src/lab/foe-flipbook-fx";
import { LabBus } from "../../src/lab/events";
import { FlipbookPlayer, parseFlipbookManifest, type FlipOptions } from "../../src/view/skills/flipbook";
import type { TargetField } from "../../src/view/skills/targets";

const clips = [
  ["thunder-charge", "charge", 12], ["thunder-release", "release", 19],
  ["thunder-ribbon-loop", "ribbon", 0], ["thunder-impact", "impact", 13],
  ["thunder-ground-impact", "groundImpact", 13], ["thunder-sparkle", "sparkle", 0],
  ["thunder-hit-affliction", "hitAffliction", 0],
] as const;
const meta = (id: string, role: string, peak = 0, loop = false) => parseFlipbookManifest({ flipbooks: {
  [id]: { file: id + ".png", role, cols: 8, rows: 8, frames: 48, fps: 24, cell: [256, 256], mode: "fire", loop, timing: { peak } },
} }, "/v/").get(id)!;

function fixture(search = "", warm = true) {
  const parent = new THREE.Group(), point = { x: 2, z: -6, y: 1 }, alive = new Set([0]);
  const targets: TargetField = {
    size: 1, alive: (i) => alive.has(i), x: () => point.x, z: () => point.z, midY: () => point.y,
    radius: () => 0.5, tier: () => 0, nearest: () => 0,
    hit: () => false,
    inCircle: (_x, _z, _r, out) => { out[0] = 0; return 1; },
    inCapsule: (_ax, _az, _bx, _bz, _r, out) => { out[0] = 0; return 1; },
  };
  const hand = new THREE.Vector3(0.3, 1.3, 3), at = new THREE.Vector3(2, 0, -6);
  const release = vi.fn(), glow = vi.fn();
  const five = new FivePhaseClip(parent, "/v/", {
    targets, hand: (out) => { out.copy(hand); },
    pose: (out) => { out.x = hand.x; out.y = 0; out.z = hand.z; out.height = 2; out.bodyWidth = 0.7; },
    release, glow,
  }, search);
  if (warm) {
    for (const [id, role, peak] of clips) five.adopt(meta(id, role, peak, role === "sparkle" || role === "hitAffliction" || role === "ribbon"), new THREE.Texture());
    five.fill.adopt("thunder", meta("thunder-charge-fill", "charge"), new THREE.Texture());
  }
  const pool = (id: string) => five.player.pool("thunder", id);
  return { five, targets, point, alive, release, glow, hand, at, pool, parent };
}

function runner(search = "", video = false) {
  const f = fixture(search), player = new FlipbookPlayer("/v/");
  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
  camera.position.set(0, 26, 14); camera.lookAt(0, 0, -6); camera.updateMatrixWorld(true);
  const show = new Showcase(player, { camera, nearest: () => 0, at: (_i, out) => out.copy(f.at), caster: (out) => out.set(0, 0, 3),
    light() {}, accent() {}, shake() {}, captionHost: null }, ULT_SHOWCASE);
  const pillar = meta(FIVE_CLIP_ID, "pillar", 0);
  player.library("ult").add(pillar, new THREE.Texture());
  player.library("ult").add({ ...pillar, id: "pillar-thunder-field" }, new THREE.Texture());
  const mark = meta("thunder-ground-mark", "groundMark");
  let time = 0, videoTime = -1;
  if (video) {
    show.canVideo = () => true;
    show.play = (id) => { show.played = { time: () => videoTime }; return id ?? FIVE_CLIP_ID; };
  }
  const bus = new LabBus();
  const foe = new FoeFlipbookFx(f.parent, "/v/", { alive: (i) => f.alive.has(i), pose(i, out) {
    out.target = i; out.x = f.point.x; out.y = f.point.y; out.z = f.point.z; out.radius = 0.5; out.beastTier = 0;
  } }, "?foeaura=0");
  for (const c of FOE_CLIPS) foe.adopt(c, meta(c.id, "impact", 0, c.id === "stagger-stars-loop"), new THREE.Texture());
  const blows: number[] = [], statuses: number[] = [];
  const host: ClipSkillHost = { targets: f.targets, layer: f.parent, player, fivePhase: f.five,
    caster: (out) => { out.set(0, 0, 3); }, release() {}, strike() {},
    blow(skill, i) {
      blows.push(time);
      bus.impact.damage = skill.damage;
      foe.impact(bus.impact, { target: i, x: f.point.x, y: f.point.y, z: f.point.z, radius: 0.5, beastTier: 0 });
      return false;
    },
    status(i, kind, seconds) { statuses.push(seconds); if (kind === "stun") foe.status(i, kind, seconds); },
  };
  const casts = new ClipSkillRunner(show, host);
  casts.adoptMark("thunder", mark, new THREE.Texture());
  const step = (dt: number) => { time += dt; casts.update(dt); player.update(dt); foe.update(dt); };
  return { ...f, casts, show, player, host, foe, blows, statuses, step, clock: (t: number) => { videoTime = t; } };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Thunder Pillar five-phase sample", () => {
  it("starts charge, release and travel on the key; impact and aftermath on the unchanged strike", () => {
    const f = runner(), trace: { phase: string; time: number }[] = [];
    let time = 0;
    const on = (id: string, phase: string) => {
      const p = f.pool(id), spawn = p.spawn.bind(p);
      vi.spyOn(p, "spawn").mockImplementation((at, size, opts) => { trace.push({ phase, time }); spawn(at, size, opts); });
    };
    on("thunder-charge", "charge"); on("thunder-release", "release"); on("thunder-ribbon-loop", "travel");
    on("thunder-ground-impact", "impact");
    const sparkle = f.pool("thunder-sparkle"), spawn = sparkle.spawn.bind(sparkle);
    vi.spyOn(sparkle, "spawn").mockImplementation((at, size, opts) => {
      if ((opts?.life ?? 0) > 1) trace.push({ phase: "aftermath", time });
      spawn(at, size, opts);
    });
    f.casts.cast(FIVE_CLIP_ID);
    expect(f.release).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 30; i++) { time += 1 / 60; f.step(1 / 60); }
    const first = trace.filter((e, i) => trace.findIndex((p) => p.phase === e.phase) === i);
    expect(first.map((e) => e.phase)).toEqual(["charge", "release", "travel", "impact", "aftermath"]);
    expect(first.slice(0, 3).map((e) => e.time)).toEqual([0, 0, 0]);
    expect(first[3]!.time).toBeCloseTo(f.blows[0]!);
    expect(first[4]!.time).toBe(first[3]!.time);
    expect(f.statuses).toEqual([KEY8_SKILLS.find((s) => s.id === FIVE_CLIP_ID)!.status!.seconds]);
    const marks = f.parent.children.find((g) => g.name === "fx-clip-skill-marks")!;
    const colour = (marks.children[0] as THREE.Mesh).geometry.getAttribute("iColor");
    expect(colour.getX(0)).toBeCloseTo(0.9);
  });

  it("renders the release at its measured peak and full alpha on the first frame", () => {
    const f = fixture(); f.five.cast(f.at); f.five.update(0);
    const p = f.pool("thunder-release"), data = p.mesh.geometry.getAttribute("iData");
    expect(p.live).toBe(1); expect(data.getZ(0)).toBe(p.meta!.peak); expect(data.getW(0)).toBe(1);
    const colour = p.mesh.geometry.getAttribute("iColor");
    expect(colour.getX(0)).toBeCloseTo(0.9);
    const pos = p.mesh.geometry.getAttribute("iPos");
    expect([pos.getX(0), pos.getY(0), pos.getZ(0)]).toEqual(f.hand.toArray().map((v) => expect.closeTo(v)));
    for (let i = 0; i < 24; i++) {
      f.five.update(1 / 60);
      if (p.live > 0) expect(data.getW(0)).toBeLessThanOrEqual(1);
    }
  });

  it("scrubs the charge and charge-fill for 200 ms while release is already out, following the hand", () => {
    const f = fixture(); f.five.cast(f.at); f.hand.x = 4; f.five.update(FIVE_CLIP_CHARGE_S / 2);
    const charge = f.pool("thunder-charge"), fill = f.five.fill.player.pool("charge-fill", "thunder-charge-fill");
    expect(charge.mesh.geometry.getAttribute("iData").getZ(0)).toBeCloseTo(23.5);
    expect(fill.mesh.geometry.getAttribute("iData").getZ(0)).toBeCloseTo(23.5);
    expect(charge.mesh.geometry.getAttribute("iPos").getX(0)).toBe(4);
    expect(f.release).toHaveBeenCalledTimes(1);
    f.five.update(FIVE_CLIP_CHARGE_S / 2);
    expect(charge.live).toBe(0); expect(fill.live).toBe(0); expect(f.glow.mock.lastCall![1]).toBe(0);
  });

  it.each([false, true])("leaves release/strike/hit timing, damage and status identical with video=%s", (video) => {
    const on = runner("", video), off = runner("?fivephase=0", video);
    on.casts.cast(FIVE_CLIP_ID); off.casts.cast(FIVE_CLIP_ID);
    for (let i = 0; i < 40; i++) {
      // A stalled video does not land early just because the overlay's charge finished.
      on.clock(i < 25 ? -1 : 0); off.clock(i < 25 ? -1 : 0);
      on.step(1 / 60); off.step(1 / 60);
      expect(on.blows).toEqual(off.blows);
      expect(on.statuses).toEqual(off.statuses);
      if (video && i < 25) expect(on.blows).toHaveLength(0);
    }
    expect(on.blows).toHaveLength(1);
    expect(on.casts.last).toEqual(off.casts.last);
    expect(off.release).not.toHaveBeenCalled(); expect(off.five.player.live).toBe(0);
  });

  it("uses the heavy painted hit and stagger loop for exactly the row's status; affliction follows survivors", () => {
    const f = runner(); f.casts.cast(FIVE_CLIP_ID);
    while (f.blows.length === 0) f.step(1 / 60);
    const hit = f.foe.player.pool("beast", "beast-hit-heavy-ink-burst");
    const stars = f.foe.player.pool("beast", "stagger-stars-loop");
    const affliction = f.pool("thunder-hit-affliction");
    expect(hit.live).toBe(1); expect(stars.live).toBe(1); expect(affliction.live).toBe(1);
    f.point.x = 5; f.point.y = 2; f.step(0.5);
    expect(affliction.mesh.geometry.getAttribute("iPos").getX(0)).toBe(5);
    expect(affliction.mesh.geometry.getAttribute("iPos").getY(0)).toBe(2);
    f.step(0.3);
    const age = affliction.mesh.geometry.getAttribute("iAge");
    expect(age.getX(0)).toBeGreaterThan(age.getY(0)); // legacy fire-mode erosion uses the real age
    expect(affliction.mesh.geometry.getAttribute("iData").getW(0)).toBe(1);
    f.step(0.2);
    expect(stars.live).toBe(0); expect(affliction.live).toBe(0);
  });

  it("cancels the affliction on death and does not attach it to a killing blow", () => {
    const f = fixture(); f.five.hit(0, false, 1); f.five.update(0);
    expect(f.pool("thunder-hit-affliction").live).toBe(1);
    f.alive.delete(0); f.five.update(1 / 60);
    expect(f.pool("thunder-hit-affliction").live).toBe(0);
    f.alive.add(0); f.five.hit(0, true, 1); f.five.update(0);
    expect(f.pool("thunder-hit-affliction").live).toBe(0);
  });

  it("keeps an eroding aftermath past 1.5 s and clears every added layer and the mark by 2.5 s after impact", () => {
    const f = runner(); f.casts.cast(FIVE_CLIP_ID);
    while (f.blows.length === 0) f.step(1 / 60);
    const sparkle = f.pool("thunder-sparkle");
    for (let i = 0; i < 96; i++) f.step(1 / 60);
    expect(sparkle.live).toBeGreaterThan(0);
    const age = sparkle.mesh.geometry.getAttribute("iAge");
    expect(age.getX(0)).toBeGreaterThan(age.getY(0)); // erosion has started
    expect(sparkle.mesh.geometry.getAttribute("iData").getW(0)).toBe(1); // no fast alpha fade
    for (let i = 0; i < 54; i++) f.step(1 / 60);
    expect(FIVE_CLIP_TAIL_S).toBeLessThanOrEqual(2.5);
    expect(f.five.player.live + f.five.fill.player.live).toBe(0);
    const marks = f.parent.children.find((g) => g.name === "fx-clip-skill-marks")!;
    expect(marks.children.every((m) => !m.visible)).toBe(true);
  });

  it("fivephase=0 prevents new loads and sprites; other key-8 and key-9 skills never opt in", () => {
    vi.stubGlobal("location", { protocol: "http:" });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const f = fixture("?fivephase=0", false);
    f.five.prepare(); f.five.cast(f.at); f.five.strike(f.at); f.five.hit(0, false, 1); f.five.update(1);
    expect(fetch).not.toHaveBeenCalled(); expect(f.five.player.live).toBe(0);
    vi.unstubAllGlobals();
    expect(fivePhaseClipEnabled("")).toBe(true); expect(fivePhaseClipEnabled("?fivephase=0")).toBe(false);
    const other = runner(), cast = vi.spyOn(other.five, "cast");
    other.casts.cast("pillar-thunder-field"); other.step(1);
    expect(cast).not.toHaveBeenCalled(); expect(other.five.player.live).toBe(0);
    const key9 = new ClipSkillRunner(other.show, other.host, KEY9_SKILLS, KEY9_NAV);
    key9.cast(FIVE_CLIP_ID); expect(cast).not.toHaveBeenCalled();
  });

  it("reuses every pool, buffer, vector, option object and voice during warm frames", () => {
    const f = fixture(); f.five.cast(f.at); f.five.strike(f.at); f.five.hit(0, false, 1); f.five.update(0);
    const buffers = f.five.player.group.children.map((m) => (m as THREE.Mesh).geometry.attributes);
    const options = new Set<FlipOptions>(), vectors = new Set<THREE.Vector3>();
    for (const [id] of clips) {
      const p = f.pool(id), spawn = p.spawn.bind(p);
      vi.spyOn(p, "spawn").mockImplementation((at, size, opts) => { vectors.add(at); options.add(opts!); spawn(at, size, opts); });
    }
    const makePool = vi.spyOn(FlipbookPlayer.prototype, "pool"), clone = vi.spyOn(THREE.Vector3.prototype, "clone");
    for (let i = 0; i < 180; i++) f.five.update(1 / 60);
    expect(makePool).not.toHaveBeenCalled(); expect(clone).not.toHaveBeenCalled();
    expect(options.size).toBe(1); expect(vectors.size).toBe(1);
    f.five.player.group.children.forEach((m, i) => expect((m as THREE.Mesh).geometry.attributes).toBe(buffers[i]));
    const source = readFileSync(new URL("../../src/lab/five-phase-clip.ts", import.meta.url), "utf8");
    const tree = ts.createSourceFile("five-phase-clip.ts", source, ts.ScriptTarget.Latest, true);
    const allocations: string[] = [];
    function check(node: ts.Node): void {
      if (ts.isNewExpression(node) || ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node) || ts.isArrowFunction(node)) allocations.push(node.getText(tree));
      ts.forEachChild(node, check);
    }
    function find(node: ts.Node): void {
      if (ts.isMethodDeclaration(node) && ["update", "chargeFrame", "opts", "pool"].includes(node.name.getText(tree))) { if (node.body) check(node.body); }
      else ts.forEachChild(node, find);
    }
    find(tree); expect(allocations).toEqual([]);
  });

  it("reset clears the caster rim, charge and all lingering effects", () => {
    const f = fixture(); f.five.cast(f.at); f.five.strike(f.at); f.five.hit(0, false, 1); f.five.update(0);
    f.five.clear(); f.five.update(0);
    expect(f.glow.mock.lastCall![1]).toBe(0); expect(f.five.player.live + f.five.fill.player.live).toBe(0);
  });
});
