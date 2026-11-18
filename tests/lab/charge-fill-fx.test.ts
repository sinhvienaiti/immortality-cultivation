import * as THREE from "three";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChargeFillFx, CHARGE_FILL_ORDER, CHARGE_FILL_RISE_M, CHARGE_FILL_SPAN, chargeFillEnabled, chargeFillFrame, type ChargeFillPose } from "../../src/lab/charge-fill-fx";
import { FlipbookPlayer, parseFlipbookManifest, setFlipbookKtx2 } from "../../src/view/skills/flipbook";

const elements = ["blood", "dark", "earth", "fire", "ice", "light", "metal", "poison", "star", "thunder", "void", "water", "wind", "wood"];
const manifest = { flipbooks: Object.fromEntries(elements.map((element) => [element + "-charge-fill", {
  file: element + ".png", element, role: "charge", cols: 8, rows: 8, frames: 41, fps: 8,
  cell: [512, 288], mode: "fire", loop: false, pivot: [0.54, 0.63],
  ktx2: { yFlip: true, uastc: { file: element + ".ktx2", bytes: 100 } },
}])) };
const metas = parseFlipbookManifest(manifest, "/v/charge-fill/");
const meta = (element: string) => metas.get(element + "-charge-fill")!;
function fixture(search = "", adopt = true) {
  const parent = new THREE.Group(), fx = new ChargeFillFx(parent, "/v/", search);
  if (adopt) for (const element of elements) fx.adopt(element, meta(element), new THREE.Texture());
  const pose: ChargeFillPose = { x: 2, y: 0.1, z: 3, height: 2, bodyWidth: 0.7 };
  const word = { slot: "k2", typed: 1, letters: 6 };
  const pool = (element = "fire") => fx.player.pool("charge-fill", element + "-charge-fill");
  const data = (element = "fire") => pool(element).mesh.geometry.getAttribute("iData");
  const step = (dt = 0) => fx.update(dt, pose);
  return { fx, pose, word, pool, data, step };
}
function network() {
  vi.stubGlobal("location", { protocol: "http:" });
  const fetch = vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => manifest });
  vi.stubGlobal("fetch", fetch);
  const png = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(new THREE.Texture());
  const ktx2 = vi.fn().mockImplementation(async () => new THREE.Texture());
  setFlipbookKtx2({ loader: { loadAsync: ktx2 }, variant: "uastc" });
  return { fetch, png, ktx2 };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); setFlipbookKtx2(null); });

describe("caster charge fill", () => {
  it("scrubs the inclusive frame range by correct letters, with fractional blending and clamped bounds", () => {
    expect(chargeFillFrame(meta("fire"), 0, 6)).toBe(0);
    expect(chargeFillFrame(meta("fire"), 1, 6)).toBeCloseTo(40 / 6);
    expect(chargeFillFrame(meta("fire"), 3, 6)).toBe(20);
    expect(chargeFillFrame(meta("fire"), 6, 6)).toBe(40);
    expect(chargeFillFrame(meta("fire"), 60, 6)).toBe(40);
    expect(chargeFillFrame(meta("fire"), -2, 6)).toBe(0);
    expect(chargeFillFrame(meta("fire"), NaN, 6)).toBe(0);
    expect(chargeFillFrame(meta("fire"), 1, 0)).toBe(0);
    expect(chargeFillFrame({ ...meta("fire"), frameRange: [4, 28] }, 3, 6)).toBe(16);
  });

  it("holds the frame when typing pauses, follows corrections and reaches the final frame on completion", () => {
    const { fx, word, data, step, pool } = fixture();
    fx.sync(word, "fire"); step();
    const buffer = data().array;
    for (let i = 0; i < 300; i++) { fx.sync(word, "fire"); step(1 / 60); }
    expect(data().getZ(0)).toBeCloseTo(40 / 6);
    expect(data().getW(0)).toBe(1);
    word.typed = 3; fx.sync(word, "fire"); step(0.1);
    expect(data().getZ(0)).toBe(20);
    word.typed = 2; fx.sync(word, "fire"); step();
    expect(data().getZ(0)).toBeCloseTo(40 / 3);
    word.typed = 6; fx.sync(word, "fire"); fx.sync(null, "fire"); step();
    expect(data().getZ(0)).toBe(40);
    step(0.06); expect(data().getW(0)).toBeCloseTo(0.5);
    step(0.06); expect(pool().live).toBe(0);
    expect(data().array).toBe(buffer);
  });

  it("fades an abandoned word over 0.2 s, freezing its last frame", () => {
    const { fx, word, data, step, pool } = fixture();
    fx.sync(word, "fire"); step(); fx.sync(null, "fire");
    step(0.1); expect(data().getW(0)).toBeCloseTo(0.5);
    expect(data().getZ(0)).toBeCloseTo(40 / 6);
    step(0.1); expect(pool().live).toBe(0);
  });

  it("crossfades a different word even in the same element and does not restart a completed word", () => {
    const { fx, word, data, step, pool } = fixture();
    fx.sync(word, "fire"); step();
    const next = { ...word, typed: 3 };
    fx.sync(next, "fire"); step(0.1);
    expect(pool().live).toBe(2);
    expect([data().getZ(0), data().getZ(1)]).toEqual([expect.closeTo(40 / 6), 20]);
    expect([data().getW(0), data().getW(1)]).toEqual([0.5, 1]);
    step(0.1); expect(pool().live).toBe(1);
    next.typed = next.letters; fx.sync(next, "fire"); step(0.12);
    fx.sync(next, "fire"); step(1); expect(pool().live).toBe(0);
  });

  it("changes element at the same progress while the old element fades for 0.2 s", () => {
    const { fx, word, data, pool, step } = fixture();
    word.typed = 3; fx.sync(word, "fire"); step();
    fx.sync(word, "water"); step(0.1);
    expect(data("fire").getZ(0)).toBe(20); expect(data("water").getZ(0)).toBe(20);
    expect(data("fire").getW(0)).toBeCloseTo(0.5); expect(data("water").getW(0)).toBe(1);
    step(0.1); expect(pool("fire").live).toBe(0); expect(pool("water").live).toBe(1);
  });

  it("covers keys 2–7 and leaves keys 0/1 and M to their existing layers", () => {
    const { fx, step } = fixture();
    for (const slot of ["k2", "guard", "dash", "k4", "k5", "k7"]) {
      fx.clear(); fx.sync({ slot, typed: 1, letters: 6 }, "fire"); step();
      expect(fx.player.live).toBe(1);
    }
    for (const slot of ["auto", "k1", "km"]) {
      fx.clear(); fx.sync({ slot, typed: 1, letters: 6 }, "fire"); step();
      expect(fx.player.live).toBe(0);
    }
  });

  it("lies flat on the ground at the feet, spans CHARGE_FILL_SPAN body widths and depth-tests behind the caster", () => {
    const { fx, word, pose, pool, data, step } = fixture(); fx.sync(word, "fire"); step();
    const p = pool(), pos = p.mesh.geometry.getAttribute("iPos");
    expect([pos.getX(0), pos.getY(0), pos.getZ(0)]).toEqual([2, expect.closeTo(0.1 + CHARGE_FILL_RISE_M), 3]);
    expect(data().getX(0) * p.meta!.aspect).toBeCloseTo(pose.bodyWidth * CHARGE_FILL_SPAN);
    // Laid flat (element-clips' ground card), a hair above the ground, a little toward the eye.
    expect(p.mesh.material.customProgramCacheKey()).toBe("element-ground-card");
    expect(CHARGE_FILL_RISE_M).toBeGreaterThan(0);
    expect(p.mesh.geometry.getAttribute("iLift").getX(0)).toBeGreaterThan(0);
    expect(fx.player.group.renderOrder).toBe(CHARGE_FILL_ORDER);
    expect(CHARGE_FILL_ORDER).toBeLessThan(0);
    expect(p.mesh.renderOrder).toBe(CHARGE_FILL_ORDER);
    expect(p.mesh.material.depthTest).toBe(true); expect(p.mesh.material.depthWrite).toBe(false);
    expect(p.mesh.material.fragmentShader).toContain("vxTagKeep");
    pose.x = -3; pose.y = 1; pose.z = 7; step();
    expect([pos.getX(0), pos.getY(0), pos.getZ(0)]).toEqual([-3, expect.closeTo(1 + CHARGE_FILL_RISE_M), 7]);
  });

  it("caps the combined channels at 0.9 during rapid word and element changes", () => {
    const { fx, word, pool, step } = fixture();
    for (const element of elements.slice(0, 8)) { fx.sync({ ...word }, element); step(0.005); }
    let light = 0;
    for (const element of elements) {
      const p = pool(element), rgb = p.mesh.geometry.getAttribute("iColor"), alpha = p.mesh.geometry.getAttribute("iData");
      for (let i = 0; i < p.live; i++) light += Math.max(rgb.getX(i), rgb.getY(i), rgb.getZ(i)) * alpha.getW(i);
    }
    expect(light).toBeLessThanOrEqual(0.900001);
    fx.clear(); step(); expect(fx.player.live).toBe(0);
  });

  it("?chargefill=0 prevents manifest, texture and pool loads", () => {
    expect(chargeFillEnabled("")).toBe(true); expect(chargeFillEnabled("?chargefill=1")).toBe(true);
    expect(chargeFillEnabled("?ambient=0&chargefill=0")).toBe(false);
    const { fetch, png, ktx2 } = network(), makePool = vi.spyOn(FlipbookPlayer.prototype, "pool");
    const { fx, word, step } = fixture("?chargefill=0", false);
    fx.prepareElement("fire"); fx.sync(word, "fire"); step(1);
    expect(fx.player.live).toBe(0); expect(fx.player.group.visible).toBe(false);
    expect(fetch).not.toHaveBeenCalled(); expect(png).not.toHaveBeenCalled(); expect(ktx2).not.toHaveBeenCalled();
    expect(makePool).not.toHaveBeenCalled();
  });

  it("fetches only the selected KTX2 atlas and keeps the current typing progress when it arrives", async () => {
    const { fetch, ktx2, png } = network();
    const { fx, word, data, step } = fixture("", false);
    fx.prepareElement("fire"); word.typed = 3; fx.sync(word, "fire"); step();
    await vi.waitFor(() => expect(fx.player.group.children).toHaveLength(1));
    step(); expect(data().getZ(0)).toBe(20);
    expect(fetch).toHaveBeenCalledTimes(1); expect(ktx2).toHaveBeenCalledExactlyOnceWith("/v/charge-fill/fire.ktx2");
    expect(png).not.toHaveBeenCalled(); fx.dispose();
  });

  it("keeps PNG fallback and never resurrects a cancelled word after a late load", async () => {
    const { ktx2, png } = network();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    ktx2.mockImplementation(async () => { await pending; throw new Error("unsupported KTX2"); });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fx, word, step } = fixture("", false);
    fx.sync(word, "fire"); step();
    await vi.waitFor(() => expect(ktx2).toHaveBeenCalledTimes(1));
    fx.sync(null, "fire"); step(0.2); finish();
    await vi.waitFor(() => expect(png).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(fx.player.group.children).toHaveLength(1));
    step(); expect(fx.player.live).toBe(0); fx.dispose();
  });

  it("handles an unavailable element without substituting another element's art", async () => {
    const { ktx2 } = network();
    const { fx, word, step } = fixture("", false);
    fx.sync(word, "unknown"); step();
    await vi.waitFor(() => expect(fx["layers"].get("unknown")!.loading).toBe(false));
    for (let i = 0; i < 60; i++) step(1 / 60);
    expect(ktx2).not.toHaveBeenCalled(); expect(fx.player.live).toBe(0); fx.dispose();
  });
});

describe("existing lab release timing", () => {
  // Execute the actual last-letter/flush functions in Node, with no renderer or browser.
  const source = readFileSync(new URL("../../src/lab/skills-main.ts", import.meta.url), "utf8");
  const functions = source.slice(source.indexOf("const pending = {"), source.indexOf("function reset():"));
  function lastLetter(search: string, slot: string, five = false) {
    const { fx: chargeFill, pose, word } = fixture(search, false);
    const events: string[] = [];
    const release = () => events.push("release"), cast = () => events.push("cast");
    const deps = {
      chargeFill, fx: { element: { id: "fire" }, cast, setCharge() {} },
      caster: { release, charge() {} }, heroPresence: { typed() {} }, sound: { key() {} },
      swordAura: { graded() {} }, probe: { lastKey() {} }, screen: { cut() {} },
      emitRelease() { events.push("event"); }, gradeOf: () => "perfect", expectedTicks: () => 10,
      startUltimate() { events.push("existing-cutin"); }, castCrescentSample: release, castMeteor: release,
    };
    const body = ts.transpileModule(`
      const { ${Object.keys(deps).join(",")} } = deps;
      let typing = {slot: ${JSON.stringify(slot)}, typed: 5, letters: 6, next: 0, tx: 0, tz: 0${five ? ', five: "k2"' : ""}};
      let pendingMyriad = false, wpm = 45, wordGrade = "perfect";
      ${functions}
      chargeFill.sync(typing, "fire");
      updateTyping(0);
      chargeFill.sync(typing, "fire");
      flushTyping();
    `, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    new Function("deps", body)(deps);
    chargeFill.update(0, pose);
    return { events, chargeFill, word };
  }

  it.each(["k2", "guard", "dash", "k4"])("%s releases and casts in the last-letter call even with an unresolved atlas request", async (slot) => {
    const { ktx2 } = network(); ktx2.mockImplementation(() => new Promise(() => {}));
    const on = lastLetter("", slot), off = lastLetter("?chargefill=0", slot);
    expect(on.events).toEqual(["release", "event", "cast"]);
    expect(on.events).toEqual(off.events);
    await vi.waitFor(() => expect(ktx2).toHaveBeenCalled());
    expect(on.chargeFill.player.live).toBe(0); // Loading art never gates release.
    on.chargeFill.dispose(); off.chargeFill.dispose();
  });

  it("preserves the five-phase sample release and key 6's existing cut-in entry on the final letter", () => {
    expect(lastLetter("", "k2", true).events).toEqual(["release"]);
    expect(lastLetter("", "k5").events).toEqual(["existing-cutin"]);
  });

  it("keeps key 7 instant in typed mode, with its existing cast flushed on the same frame", () => {
    const events: string[] = [];
    const typeFunction = source.slice(source.indexOf("function type(slot:"), source.indexOf("// Keys and casts reach"));
    const flush = functions.slice(0, functions.indexOf("function updateTyping"));
    const body = ts.transpileModule(`
      const heroPresence = { typed() {} }, cutin = { active: false };
      let typing = null, typedMode = true, pendingMyriad = false, myriadFirstHit = false;
      const probe = { lastKey() {}, flash() {} }, screen = { cut() {} };
      const caster = { release() { events.push("release"); } };
      const fx = { burst() { events.push("burst"); } };
      const myriad = { cast() { events.push("cast"); } }, herd = { toughness: 0 };
      function emitRelease() { events.push("event"); }
      function bigSkillBeat() {}
      ${typeFunction}
      ${flush}
      type("k7"); flushTyping();
    `, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    new Function("events", body)(events);
    expect(events).toEqual(["release", "event", "cast", "burst"]);
  });

  it("observes word changes before typing, updates the last letter before release, and draws before render", () => {
    expect(source).toMatch(/chargeFill\.sync\(typing, fx\.element\.id\);\s*updateTyping\(world\);\s*chargeFill\.sync\(typing, fx\.element\.id\);/);
    expect(source).toMatch(/const p = typing\.typed \/ typing\.letters;\s*chargeFill\.sync\(typing, fx\.element\.id\);/);
    expect(source).toMatch(/chargeFill\.update\(dt, chargeFillPose\);\s*ambient\.update\(dt\);\s*placeTags\(\);\s*view\.render\(dt\)/);
    expect(source).toContain("chargeFill.prepareElement(kit.id)");
    expect(source).toMatch(/function reset\(\): void \{\s*typing = null;\s*chargeFill\.clear\(\);/);
  });
});
