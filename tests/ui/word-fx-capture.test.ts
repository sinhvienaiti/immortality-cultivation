import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./word-fx-capture.mjs", import.meta.url), "utf8");
const file = ts.createSourceFile("capture.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const probeSource = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "installWordFlightProbe")!.getText(file);

function fixture() {
  let phase = "flash";
  const cell = {
    get dataset() { return { wordPhase: phase }; },
    querySelectorAll: () => [{ textContent: "a", getBoundingClientRect: () => ({ top: 484, height: 32 }) }],
  };
  class Context {
    canvas = { width: 2560, classList: { contains: (name: string) => name === "ic-word-flight" } };
    globalAlpha = 1;
    y = 1000;
    clearRect() {}
    fillText(_text: string, _x: number, _y: number) {}
    getTransform() { return { b: 0, d: 2, f: this.y }; }
  }
  const window = {} as { __wordFlightProbe: {
    arm(slot: number, direction: string): void;
    result(): { minPx: number | null; maxPx: number | null; samples: number; perGlyphPeakPx: number[]; targetPx: number[] };
  } };
  runInNewContext(`(${probeSource})()`, {
    CanvasRenderingContext2D: Context, window, innerWidth: 1280,
    document: { querySelectorAll: () => [cell] }, performance: { now: () => 123 },
  });
  const ctx = new Context(), probe = window.__wordFlightProbe;
  const draw = (y: number, alpha = 1) => {
    phase = "depart";
    ctx.clearRect();
    ctx.y = y * 2;
    ctx.globalAlpha = alpha;
    ctx.fillText("a", 0, 0);
  };
  return { ctx, probe, draw };
}

describe("capture travel measurements", () => {
  it("measures drawn CSS-pixel displacement at DPR 2 and ignores almost transparent glyphs", () => {
    const { ctx, probe, draw } = fixture();
    probe.arm(0, "attack");
    ctx.clearRect();
    draw(460);
    draw(405, .96);
    draw(390, .1);
    expect(probe.result()).toMatchObject({ minPx: 95, maxPx: 95, samples: 2, perGlyphPeakPx: [95], targetPx: [80, 110] });
  });

  it("reports an actual shortened fall rather than substituting the nominal target", () => {
    const { ctx, probe, draw } = fixture();
    probe.arm(0, "defence");
    ctx.clearRect();
    draw(512);
    draw(508);
    expect(probe.result()).toMatchObject({ minPx: 12, maxPx: 12, perGlyphPeakPx: [12], targetPx: [50, 80] });
  });

  it("leaves missing captures empty instead of inventing a flight measurement", () => {
    const { probe, draw } = fixture();
    probe.arm(0, "attack");
    draw(405);
    expect(probe.result()).toMatchObject({ minPx: null, maxPx: null, samples: 0, perGlyphPeakPx: [] });
  });
});
