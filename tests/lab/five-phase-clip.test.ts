import * as THREE from "three";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FivePhaseClip, FIVE_CLIP_ID, FIVE_CLIP_CHARGE_S, FIVE_CLIP_TAIL_S, fivePhaseClipEnabled } from "../../src/lab/five-phase-clip";
import { ClipSkillRunner, KEY8_SKILLS, KEY9_NAV, KEY9_SKILLS, type ClipSkillHost } from "../../src/lab/clip-skills";
import { Showcase, ULT_SHOWCASE } from "../../src/lab/showcase";
import { FoeFlipbookFx, FOE_CLIPS } from "../../src/lab/foe-flipbook-fx";
import { LabBus } from "../../src/lab/events";
import { FlipbookPlayer, parseFlipbookManifest, type FlipbookPool, type FlipOptions } from "../../src/view/skills/flipbook";
import type { TargetField } from "../../src/view/skills/targets";
import { thunderCasterR2Enabled } from "../../src/lab/thunder-caster-r2";
import { FlashLights } from "../../src/lab/feel";

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
    for (const id of ["thunder-caster-seal", "thunder-ring-burst"]) five.casterR2?.adopt(meta(id, id, 21), new THREE.Texture());
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

describe("Thunder Pillar round 2 caster layers", () => {
  it("keeps key 8 out of the shared charge fill and releases on its final typed letter", () => {
    const source = readFileSync(new URL("../../src/lab/skills-main.ts", import.meta.url), "utf8");
    const clip = source.slice(source.indexOf("function castClip8("), source.indexOf("/** A lab key's skill:"));
    const typing = source.slice(source.indexOf("const pending = {"), source.indexOf("function reset():"));
    const events: string[] = [];
    const sync = vi.fn();
    const charge = vi.fn();
    const cast = vi.fn(() => { events.push("cast"); return FIVE_CLIP_ID; });
    const deps = {
      chargeFill: { sync }, thunderFive: { prepare() {}, charge },
      clipSkills: { selectedId: () => FIVE_CLIP_ID, select() {}, cast },
      heroPresence: { typed() {} }, sound: { key() {} }, fx: { element: { id: "fire" } },
    };
    const body = ts.transpileModule(`
      const { ${Object.keys(deps).join(",")} } = deps;
      let typing = null, typedMode = true, wpm = 120;
      ${clip}
      ${typing}
      castClip8();
      const word = typing;
      updateTyping(0);
      for (let i = 0; i < 5; i++) updateTyping(0.1);
      const before = typing.typed;
      updateTyping(0.1);
      return { word, before, finished: typing === null };
    `, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    cast.mockImplementation(() => {
      expect(charge).toHaveBeenLastCalledWith(1);
      expect(sync).toHaveBeenLastCalledWith(expect.objectContaining({ slot: "k8", typed: 7 }), "fire");
      events.push("cast"); return FIVE_CLIP_ID;
    });
    const result = new Function("deps", body)(deps);
    expect(result).toEqual({ word: expect.objectContaining({ slot: "k8", clip: FIVE_CLIP_ID }), before: 6, finished: true });
    expect(events).toEqual(["cast"]);
    expect(charge.mock.calls.map(([p]) => p)).toEqual([0, 1 / 7, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7, 1]);
    expect(sync).toHaveBeenCalledTimes(7);
    const f = fixture("?tp2=1");
    const prepare = vi.spyOn(f.five.fill, "prepareElement");
    f.five.fill.sync(result.word, "fire");
    expect(prepare).not.toHaveBeenCalled();
    expect(f.five.fill.player.live).toBe(0);
  });

  function layer(f: ReturnType<typeof fixture>, id: string) {
    return f.five.casterR2!.group.children.find((m) => m.name === "flipbook-" + id) as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  }
  function snapshot(f: ReturnType<typeof fixture>, ignoreRibbon = false) {
    return [f.five.player, f.five.fill.player].map((p) => p.group.children.filter((m) => !ignoreRibbon || m.name !== "flipbook-thunder-ribbon-loop").map((m) => {
      const mesh = m as THREE.Mesh<THREE.InstancedBufferGeometry>;
      return { visible: mesh.visible, count: mesh.geometry.instanceCount,
        attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([k, a]) => [k, Array.from(a.array)])) };
    }));
  }

  it("peaks the seal on an instant release while the other layers retain their clocks", () => {
    const f = fixture("?tp2=1"), lights = new FlashLights(f.parent, 3), camera = new THREE.Vector3(0, 15, 12);
    const ring = layer(f, "thunder-ring-burst"), seal = layer(f, "thunder-caster-seal"), sparks = layer(f, "thunder-sparkle");
    f.release.mockImplementation((at: THREE.Vector3) => {
      expect(ring.visible).toBe(true); // already drawn before B8's synchronous release sound/light hook
      lights.flash(at, camera, "#d9ccff", 3, true);
    });
    f.five.cast(f.at);
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(lights.levels().filter((v) => v > 0)).toEqual([3]);
    expect(f.parent.children.filter((c) => c instanceof THREE.PointLight)).toHaveLength(3);
    expect(ring.geometry.getAttribute("iData").getW(0)).toBe(1);
    expect(ring.geometry.getAttribute("iData").getX(0)).toBeCloseTo(0.8);
    expect(seal.geometry.getAttribute("iData").getW(0)).toBe(1);
    expect(seal.geometry.getAttribute("iData").getZ(0)).toBe(21);
    expect(seal.geometry.getAttribute("iAge").getX(0)).toBe(0);
    expect(sparks.visible).toBe(false);
    expect(seal.material.customProgramCacheKey()).toBe("element-ground-card");
    expect(ring.material.customProgramCacheKey()).toBe("element-ground-card");
    f.five.update(0.1);
    expect(seal.geometry.getAttribute("iData").getW(0)).toBe(1);
    expect(seal.geometry.getAttribute("iAge").getX(0)).toBeCloseTo(1 / 3);
    expect(sparks.geometry.instanceCount).toBe(12);
    const pos = sparks.geometry.getAttribute("iPos"), frames = sparks.geometry.getAttribute("iData");
    const particleZero = (age: number) => Array.from({ length: sparks.geometry.instanceCount }, (_, i) => i).find((i) => Math.abs(frames.getZ(i) - age * 24) < 1e-5)!;
    const distanceFromHand = (i: number) => Math.hypot(pos.getX(i) - f.hand.x, pos.getY(i) - f.hand.y, pos.getZ(i) - f.hand.z);
    const distance = distanceFromHand(particleZero(0.1));
    f.five.update(0.05);
    expect(sparks.geometry.instanceCount).toBeGreaterThanOrEqual(18);
    expect(sparks.geometry.instanceCount).toBeLessThanOrEqual(19);
    expect(distanceFromHand(particleZero(0.15))).toBeLessThan(distance);
    expect(ring.geometry.getAttribute("iData").getX(0)).toBeCloseTo(4);
    f.five.update(0.05);
    expect(sparks.visible).toBe(false); expect(seal.geometry.getAttribute("iData").getW(0)).toBe(1);
    f.five.update(0.15);
    expect(seal.visible).toBe(false);
    expect(ring.geometry.getAttribute("iData").getW(0)).toBeGreaterThan(0);
    f.five.update(0.05); expect(ring.visible).toBe(false);
    f.five.update(0.1); expect(seal.visible).toBe(false);
    for (let i = 0; i < 120; i++) lights.update(1 / 60);
    expect(lights.levels()).toEqual([0, 0, 0]);
  });

  it.each([0.1, 0.6])("scrubs the seal with letters for a %s s word and peaks before the release hook", (duration) => {
    const f = fixture("?tp2=1"), seal = layer(f, "thunder-caster-seal");
    const data = seal.geometry.getAttribute("iData"), age = seal.geometry.getAttribute("iAge");
    for (let letter = 0; letter < 4; letter++) {
      const p = letter / 4;
      f.five.charge(p); f.five.update(duration / 4);
      expect(data.getW(0)).toBeCloseTo(p * p * (3 - 2 * p));
      expect(data.getZ(0)).toBeCloseTo(21 * p);
      expect(age.getX(0)).toBe(0);
      expect(layer(f, "thunder-ring-burst").visible).toBe(false);
      expect(layer(f, "thunder-sparkle").visible).toBe(false);
      expect(f.release).not.toHaveBeenCalled();
    }
    f.five.update(0.5); // Pausing typing never advances the charge.
    expect(data.getZ(0)).toBeCloseTo(21 * 0.75);
    f.five.charge(1);
    expect(data.getW(0)).toBe(1); expect(data.getZ(0)).toBe(21);
    f.release.mockImplementation(() => {
      expect(data.getW(0)).toBe(1); expect(data.getZ(0)).toBe(21); expect(age.getX(0)).toBe(0);
    });
    f.five.cast(f.at);
    expect(f.release).toHaveBeenCalledTimes(1);
    f.five.charge(null); f.five.update(1 / 60);
    expect(age.getX(0)).toBeGreaterThan(0);
    f.five.update(0.3); expect(seal.visible).toBe(false);
  });

  it("cancels a typed seal and leaves B8 unchanged when tp2 is off", () => {
    const on = fixture("?tp2=1"), off = fixture("?tp2=0"), base = fixture();
    on.five.charge(0.5); on.five.charge(null); on.five.update(0.1);
    expect(layer(on, "thunder-caster-seal").visible).toBe(false);
    off.five.charge(0.5); off.five.update(0.1); base.five.update(0.1);
    expect(snapshot(off)).toEqual(snapshot(base));
    off.five.charge(1); off.five.cast(off.at); base.five.cast(base.at);
    expect(snapshot(off)).toEqual(snapshot(base));
    on.five.charge(0.75); on.five.clear(); on.five.update(0.1);
    expect(on.five.casterR2!.group.children.every((m) => !m.visible)).toBe(true);
  });

  it("preserves B8 off, replaces only its ribbon on, and leaves the hit clock unchanged", () => {
    const base = runner(), off = runner("?tp2=0"), on = runner("?tp2=1");
    for (const f of [base, off, on]) f.casts.cast(FIVE_CLIP_ID);
    for (let i = 0; i < 180; i++) {
      for (const f of [base, off, on]) f.step(1 / 60);
      expect(snapshot(off)).toEqual(snapshot(base)); expect(snapshot(on, true)).toEqual(snapshot(base, true));
      expect(on.pool("thunder-ribbon-loop").live).toBe(0);
      expect(on.blows).toEqual(base.blows); expect(on.statuses).toEqual(base.statuses);
    }
    expect(off.five.casterR2).toBeNull();
    expect(fixture("?tp2=1&fivephase=0").five.casterR2).toBeNull();
    expect(thunderCasterR2Enabled("?tp2=unexpected")).toBe(false);
    expect(on.release.mock.calls).toEqual(base.release.mock.calls);
  });

  it("shares sparkle's texture, stays within three extra pool draws and 64 MB even with PNG mipmaps", () => {
    const f = fixture("?tp2=1"), group = f.five.casterR2!.group;
    expect(layer(f, "thunder-sparkle").material.uniforms.uMap!.value).toBe(f.pool("thunder-sparkle").mesh.material.uniforms.uMap!.value);
    f.five.cast(f.at);
    for (let i = 0; i < 40; i++) {
      f.five.update(1 / 120);
      expect(group.children.filter((m) => m.visible && (m as THREE.Mesh<THREE.InstancedBufferGeometry>).geometry.instanceCount > 0).length).toBeLessThanOrEqual(3);
      expect(layer(f, "thunder-sparkle").geometry.instanceCount).toBeLessThanOrEqual(24);
      for (const mesh of group.children as THREE.Mesh<THREE.InstancedBufferGeometry>[]) {
        const c = mesh.geometry.getAttribute("iColor");
        for (let j = 0; j < mesh.geometry.instanceCount; j++) expect(Math.max(c.getX(j), c.getY(j), c.getZ(j))).toBeLessThanOrEqual(0.9);
      }
    }
    const manifest = JSON.parse(readFileSync(new URL("../../art-src/lab/vfx/thunder/manifest.json", import.meta.url), "utf8"));
    const bytes = ["thunder-caster-seal", "thunder-ring-burst"].reduce((n, id) => {
      const m = manifest.flipbooks[id]; return n + m.width * m.height * 4 * 4 / 3;
    }, 0);
    expect(bytes).toBeLessThan(64_000_000);
    f.five.clear(); expect(group.children.every((m) => !m.visible)).toBe(true);
  });

  it("reuses pools, buffers, vectors and options during warm frames without hot-path allocations", () => {
    const f = fixture("?tp2=1"), r2 = f.five.casterR2!, options = new Set<FlipOptions>(), vectors = new Set<THREE.Vector3>();
    const buffers = r2.group.children.map((m) => (m as THREE.Mesh).geometry.attributes);
    const spawn = vi.spyOn(Object.getPrototypeOf(f.pool("thunder-charge")), "spawn");
    const makePool = vi.spyOn(FlipbookPlayer.prototype, "pool"), clone = vi.spyOn(THREE.Vector3.prototype, "clone");
    f.five.cast(f.at);
    for (let i = 0; i < 60; i++) f.five.update(1 / 120);
    for (let i = 0; i < spawn.mock.calls.length; i++) if ((spawn.mock.contexts[i] as FlipbookPool).mesh.parent === r2.group) {
      const call = spawn.mock.calls[i]!;
      options.add(call[2] as FlipOptions); vectors.add(call[0] as THREE.Vector3);
    }
    expect(options.size).toBe(1); expect(vectors.size).toBe(1);
    expect(makePool).not.toHaveBeenCalled(); expect(clone).not.toHaveBeenCalled();
    r2.group.children.forEach((m, i) => expect((m as THREE.Mesh).geometry.attributes).toBe(buffers[i]));
    const source = readFileSync(new URL("../../src/lab/thunder-caster-r2.ts", import.meta.url), "utf8");
    const tree = ts.createSourceFile("thunder-caster-r2.ts", source, ts.ScriptTarget.Latest, true), allocations: string[] = [];
    function check(node: ts.Node): void {
      if (ts.isNewExpression(node) || ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node) || ts.isArrowFunction(node)) allocations.push(node.getText(tree));
      ts.forEachChild(node, check);
    }
    function find(node: ts.Node): void {
      if (ts.isMethodDeclaration(node) && ["update", "render", "clear", "cast", "charge"].includes(node.name.getText(tree))) { if (node.body) check(node.body); }
      else ts.forEachChild(node, find);
    }
    find(tree); expect(allocations).toEqual([]);
  });
});
