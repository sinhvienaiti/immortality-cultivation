import { readFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { cpuExpected, crc32, encodePngRgba, probeCases } from "../../src/lab/flipbook-probe";

describe("258b PNG bytes without canvas", () => {
  it("uses the standard CRC-32 polynomial and final xor", () => {
    expect(crc32(new TextEncoder().encode("IEND"))).toBe(0xae426082);
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it.each([1, 3, 8])("preserves every RGBA byte with alpha %s in one valid zlib IDAT", async (alpha) => {
    const rgba = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba.set([200, 100, 50, alpha], i);
    const png = await encodePngRgba(4, 4, rgba, async (raw) => new Uint8Array(deflateSync(raw)));
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const chunks: { name: string; data: Uint8Array }[] = [];
    let offset = 8;
    while (offset < png.length) {
      const length = view.getUint32(offset);
      expect(offset + length + 12).toBeLessThanOrEqual(png.length);
      const name = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
      const data = png.subarray(offset + 8, offset + 8 + length);
      expect(view.getUint32(offset + 8 + length), name).toBe(crc32(png.subarray(offset + 4, offset + 8 + length)));
      chunks.push({ name, data });
      offset += length + 12;
    }
    expect(offset).toBe(png.length);
    expect(chunks.map((c) => c.name)).toEqual(["IHDR", "IDAT", "IEND"]);
    const header = chunks[0]!.data;
    expect(Array.from(header)).toEqual([0, 0, 0, 4, 0, 0, 0, 4, 8, 6, 0, 0, 0]);
    expect(chunks[2]!.data.length).toBe(0);
    const raw = inflateSync(chunks[1]!.data);
    expect(raw.length).toBe((4 * 4 + 1) * 4);
    for (let y = 0; y < 4; y += 1) {
      expect(raw[y * 17]).toBe(0);
      expect(Array.from(raw.subarray(y * 17 + 1, (y + 1) * 17))).toEqual(Array.from(rgba.subarray(y * 16, (y + 1) * 16)));
    }
  });
});

describe("258b byte-valued probe cases", () => {
  it("keeps the eight impact ticks and their fixed texture inputs in order", () => {
    const impact = probeCases().filter((c) => c.group === "impact-key1");
    expect(impact.map((c) => c.tick)).toEqual([0, 1, 3, 9, 12, 18, 20, 42]);
    for (const c of impact) {
      expect(c.atlas).toEqual([[255, 150, 60, 230], [240, 90, 30, 200]]);
      expect(c.maskA).toEqual([[230, 120, 200, 140], [200, 90, 160, 110]]);
      expect(c.maskB.map((m) => m[0])).toEqual([40, 90]);
      expect(c.w).toBe(0.25);
      expect(c.loopMode).toBe("none");
      expect(c.tint).toEqual([1, 1, 1]);
    }
  });

  it("uses only integer texture bytes and quarter-frame interpolation weights", () => {
    for (const c of probeCases()) {
      for (const byte of [...c.atlas.flat(), ...c.maskA.flat(), ...c.maskB.flat()]) {
        expect(Number.isInteger(byte), c.name).toBe(true);
        expect(byte, c.name).toBeGreaterThanOrEqual(0);
        expect(byte, c.name).toBeLessThanOrEqual(255);
      }
      expect([0, 0.25, 0.5, 0.75], c.name).toContain(c.w);
    }
  });

  it("accounts for each named Test 4 sample, including exclusions from the fixed soft/look contract", () => {
    const source = readFileSync(new URL("./flipbook-v2.test.ts", import.meta.url), "utf8");
    const test4 = source.slice(source.indexOf('describe("4.'), source.indexOf('describe("5–8.'));
    const table = test4.slice(test4.indexOf("  const cases:"), test4.indexOf("  it.each(cases)"));
    const names = Array.from(table.matchAll(/name: "([^"]+)"/g), (m) => m[1]!);
    expect(names.length).toBe(19);
    const actual = probeCases().filter((c) => c.group === "test4").map((c) => c.name);
    const skipped = names.filter((name) => !actual.includes(name));
    expect(skipped).toEqual(["soft once", "sharpen coverage", "grade"]);
    expect(actual.every((name) => names.includes(name))).toBe(true);
    expect(new Set(actual).size).toBe(actual.length);
    expect(actual.length).toBe(names.length - skipped.length);
    console.info(`258b Test 4: ${actual.length}/${names.length}; skipped: ${skipped.join(", ")}`);
  });
});

describe("258b CPU impact checkpoints", () => {
  it.each([0, 12, 42])("returns finite samples and valid alpha at tick %s", (tick) => {
    const c = probeCases().find((c) => c.group === "impact-key1" && c.tick === tick)!;
    const expected = cpuExpected(c);
    for (const value of [...expected.premul, ...expected.light, ...expected.dark]) expect(Number.isFinite(value)).toBe(true);
    expect(expected.premul[3]).toBeGreaterThanOrEqual(0);
    expect(expected.premul[3]).toBeLessThanOrEqual(1);
    // The ticket's RGB <= 1 assertion conflicts with these HDR samples; stopped there, see 258b-report.md.
    if (tick === 42) {
      expect(c.ctl[1]).toBe(1);
      for (const value of expected.premul) expect(Math.abs(value)).toBeLessThanOrEqual(1e-6);
    }
  });
});
