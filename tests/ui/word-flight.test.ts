import { describe, expect, it, vi } from "vitest";
import { createWordFlight, wordFlightRegions } from "../../src/ui/word-flight";
import { overlapArea } from "../../src/ui/screen-zones";
import { WordFx } from "../../src/ui/word-fx";
import { WORD_GLINT_COLOR } from "../../src/ui/styles/word-fx-css";
import { TestDocument, type TestNode } from "./word-fx-dom";

function canvasFixture(width: number, height: number) {
  const doc = new TestDocument();
  doc.defaultView.innerWidth = width;
  doc.defaultView.innerHeight = height;
  const ctx = { globalAlpha: 1, fillStyle: "", setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), translate: vi.fn(), rotate: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(), fillRect: vi.fn() };
  const create = doc.createElement.bind(doc);
  let image: TestNode | undefined;
  doc.createElement = tag => {
    const node = create(tag);
    if (tag === "canvas") node.getContext = () => ctx as unknown as null;
    if (tag === "img") image = node;
    return node;
  };
  const host = doc.createElement("main");
  const flight = createWordFlight(host as unknown as HTMLElement);
  const word = doc.createElement("span");
  const letters = Array.from("ward", (text, i) => {
    const glyph = doc.createElement("span");
    glyph.textContent = text;
    glyph.getBoundingClientRect = () => ({ left: 80 + i * 18, top: height - 52, width: 16, height: 32 });
    return glyph;
  });
  const capture = (fx: WordFx) => flight.capture(fx, word as unknown as HTMLElement, letters as unknown as HTMLElement[]);
  return { doc, ctx, flight, letters, capture, loadGlint: () => (image as unknown as { onload(): void }).onload() };
}

describe("protected pooled word canvas", () => {
  it("clips every part of overlapping core/gate/slot/warning keepouts with a 4 px margin", () => {
    const keeps = [{ x: 50, y: 20, w: 40, h: 70 }, { x: 70, y: 40, w: 80, h: 20 }, { x: -10, y: 80, w: 40, h: 50 }];
    const regions = wordFlightRegions(200, 100, keeps);
    for (const region of regions) for (const keep of keeps) expect(overlapArea(region, { x: keep.x - 4, y: keep.y - 4, w: keep.w + 8, h: keep.h + 8 })).toBe(0);
    regions.forEach((a, i) => regions.slice(i + 1).forEach(b => expect(overlapArea(a, b)).toBe(0)));
    expect(wordFlightRegions(200, 100, [{ x: -10, y: -10, w: 220, h: 120 }])).toEqual([]);
  });

  it("uses one canvas across releases, clears the previous frame and suppresses travel in reduced motion", () => {
    const doc = new TestDocument();
    const canvas = doc.createElement("canvas");
    const ctx = { setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), translate: vi.fn(), rotate: vi.fn(), fillText: vi.fn() };
    canvas.getContext = () => ctx as unknown as null;
    const create = doc.createElement.bind(doc);
    doc.createElement = tag => tag === "canvas" ? canvas : create(tag);
    const host = doc.createElement("main");
    const flight = createWordFlight(host as unknown as HTMLElement);
    const word = doc.createElement("span"), glyph = doc.createElement("span");
    glyph.textContent = "a";
    glyph.getBoundingClientRect = () => ({ left: 80, top: 500, width: 16, height: 32 });
    const fx = new WordFx();
    fx.finish("a", "attack", 0);
    flight.capture(fx, word as unknown as HTMLElement, [glyph as unknown as HTMLElement]);
    const created = doc.created;
    flight.paint(240, false, () => [{ x: 0, y: 0, w: 40, h: 40 }]);
    expect(ctx.clip).toHaveBeenCalledOnce();
    expect(ctx.fillText).toHaveBeenCalledWith("a", 0, 0);
    ctx.fillText.mockClear();
    flight.paint(300, true, () => []);
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
    // A new release may arrive before paint retires the old record on the exact expiry frame.
    fx.finish("a", "defence", 640);
    glyph.getBoundingClientRect = () => ({ left: 180, top: 500, width: 16, height: 32 });
    flight.capture(fx, word as unknown as HTMLElement, [glyph as unknown as HTMLElement]);
    flight.paint(900, false, () => []);
    expect(ctx.fillText).toHaveBeenCalledOnce();
    expect(ctx.translate.mock.calls.at(-1)?.[0]).toBe(188);
    expect(doc.created).toBe(created);
    expect(host.children).toEqual([canvas]);
    flight.dispose();
    expect(host.children).toHaveLength(0);
  });

  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    it(`keeps the entire rotated defence glyph inside ${width}×${height}, including its rebound`, () => {
      for (const bottomGap of [52, 180]) {
        const { ctx, flight, letters, capture, doc } = canvasFixture(width!, height!);
        letters.forEach((glyph, i) => {
          glyph.getBoundingClientRect = () => ({ left: 6 + i * 18, top: height! - bottomGap, width: 16, height: 32 });
        });
        const fx = new WordFx();
        fx.finish("ward", "defence", 0);
        capture(fx);
        const originY = height! - bottomGap + 16;
        const ys = new Map<number, number[]>();
        for (let now = 40; now < 640; now += 2) {
          ctx.translate.mockClear();
          ctx.rotate.mockClear();
          flight.paint(now, false, () => []);
          expect(ctx.translate).toHaveBeenCalledTimes(4);
          const positions = ctx.translate.mock.calls;
          ys.set(now, positions.map(([, y]) => y as number));
          positions.forEach(([x, y], i) => {
            const angle = ctx.rotate.mock.calls[i]![0] as number;
            const halfW = Math.abs(Math.cos(angle)) * 8 + Math.abs(Math.sin(angle)) * 16;
            const halfH = Math.abs(Math.sin(angle)) * 8 + Math.abs(Math.cos(angle)) * 16;
            expect(x - halfW).toBeGreaterThanOrEqual(4);
            expect(x + halfW).toBeLessThanOrEqual(width! - 4);
            expect(y - halfH).toBeGreaterThanOrEqual(4);
            expect(y + halfH).toBeLessThanOrEqual(height! - 4);
          });
        }
        for (const i of [0, 3]) {
          const drop = ys.get(460)![i]! - originY;
          expect(drop).toBeGreaterThan(0);
          expect(drop).toBeLessThanOrEqual(80);
          if (bottomGap === 180) expect(drop).toBeGreaterThanOrEqual(50);
          else expect(drop).toBeLessThan(50);
          expect(ys.get(550)![i]).toBeLessThan(ys.get(460)![i]!);
          expect(ys.get(638)![i]).toBeGreaterThan(ys.get(550)![i]!);
        }
        // Bounds follow the viewport on the next paint, even during the exit.
        doc.defaultView.innerHeight -= 40;
        ctx.translate.mockClear();
        flight.paint(500, false, () => []);
        for (const [, y] of ctx.translate.mock.calls) expect(y + Math.hypot(8, 16)).toBeLessThanOrEqual(doc.defaultView.innerHeight - 4);
        flight.dispose();
      }
    });
  }

  it("renders the full attack rise at readable opacity and keeps painted motes inside the viewport until expiry", () => {
    const { ctx, flight, capture, loadGlint } = canvasFixture(1280, 720);
    const fx = new WordFx();
    fx.finish("ward", "attack", 0);
    capture(fx);
    loadGlint();
    expect(ctx.fillStyle).toBe(WORD_GLINT_COLOR);
    const glyphAlpha: number[] = [], moteAlpha: number[] = [];
    ctx.fillText.mockImplementation(() => { glyphAlpha.push(ctx.globalAlpha); });
    ctx.drawImage.mockClear().mockImplementation(() => { moteAlpha.push(ctx.globalAlpha); });
    flight.paint(400, false, () => []);
    const rise = ctx.translate.mock.calls.map(([, y]) => 684 - y);
    expect(rise[0]).toBe(80);
    expect(rise.at(-1)).toBe(110);
    expect(glyphAlpha.every(alpha => alpha > .95)).toBe(true);
    expect(ctx.drawImage).toHaveBeenCalledTimes(8);
    expect(moteAlpha.every(alpha => alpha > .85 && alpha <= .9)).toBe(true);
    for (const [, x, y, w, h] of ctx.drawImage.mock.calls) {
      expect(w).toBeGreaterThanOrEqual(36);
      expect(x).toBeGreaterThanOrEqual(4);
      expect(y).toBeGreaterThanOrEqual(4);
      expect(x + w).toBeLessThanOrEqual(1276);
      expect(y + h).toBeLessThanOrEqual(716);
    }
    ctx.drawImage.mockClear();
    ctx.fillText.mockClear();
    flight.paint(640, false, () => []);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
    flight.dispose();
  });
});
