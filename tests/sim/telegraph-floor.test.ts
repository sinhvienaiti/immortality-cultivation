import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/sim/fixed", () => import("./beasts-fixture").then((f) => f.fakeFixed));
vi.mock("../../src/sim/events", () => import("./beasts-fixture").then((f) => f.fakeEvents));
vi.mock("../../src/sim/world", () => import("./beasts-fixture").then((f) => f.fakeWorld));
vi.mock("../../src/sim/pace", () => import("./beasts-fixture").then((f) => f.fakePace));

import { TELEGRAPHS } from "../../src/content/data/telegraphs";
import { TELEGRAPH } from "../../src/content/rules";
import type { Preset } from "../../src/content/types";
import { chargeTicks, noWordFloorMs } from "../../src/sim/telegraph";

/**
 * canon §10.6, PB-27: an attack with no typed answer (dodge, Hộ thân,
 * mechanism) is telegraphed ≥ 1.2 s + half the shape's width ÷ 5 m/s, in the
 * data and after the k stretch at every preset.
 */
const PRESETS: readonly Preset[] = ["relax", "balanced", "challenge", "learn"];
const floorS = (widthMm: number): number => 1.2 + widthMm / 2 / 1000 / 5;
const noWord = Object.values(TELEGRAPHS).filter((def) => !def.typedAnswer);

describe("telegraph floor without a typed answer (PB-27)", () => {
  it("covers every M0a attack without a typed answer", () => {
    expect(noWord.map((def) => def.id).sort()).toEqual(
      ["hoa-nha-dive-heart", "hoa-nha-dive-node", "lang-dau-dan-howl", "nham-vien-throw-heart", "nham-vien-throw-node", "thiet-giap-tru-ram", "vuong-goi-dan", "vuong-vo-xe"].sort(),
    );
  });

  it("every TelegraphDef without a typed answer charges ≥ 1.2 s + half width ÷ 5 m/s in its data", () => {
    for (const def of noWord) {
      expect(typeof def.chargeMs, def.id).toBe("number");
      expect((def.chargeMs as number) / 1000, def.id).toBeGreaterThanOrEqual(floorS(def.sizeMm.width));
      expect(noWordFloorMs(def) / 1000, def.id).toBeGreaterThanOrEqual(floorS(def.sizeMm.width));
    }
  });

  it("chargeTicks keeps the floor at k 0.75, 1 and 1.30 in all 4 presets", () => {
    for (const def of noWord) {
      for (const preset of PRESETS) {
        for (const kPm of TELEGRAPH.checkKPm) {
          expect(chargeTicks(def, preset, kPm) / 60, def.id + " " + preset + " k " + kPm).toBeGreaterThanOrEqual(floorS(def.sizeMm.width));
        }
      }
      // Slow typists get more time (k 0.75), never less than the data at k 1.
      expect(chargeTicks(def, "balanced", 750)).toBeGreaterThanOrEqual(chargeTicks(def, "balanced", 1000));
      expect(chargeTicks(def, "balanced", 1000)).toBe(Math.ceil(((def.chargeMs as number) * 60) / 1000));
    }
  });

  it("Nham Viên 1.6 s = 1.2 + 2 m ÷ 5 m/s; Thiết Giáp Trư 1.2 s + the time to step out of its 2 m line", () => {
    expect(TELEGRAPHS["nham-vien-throw-heart"]!.chargeMs).toBe(1600);
    expect(noWordFloorMs(TELEGRAPHS["nham-vien-throw-heart"]!)).toBe(1600);
    expect(chargeTicks(TELEGRAPHS["nham-vien-throw-heart"]!, "balanced", 1000)).toBe(96);
    const ram = TELEGRAPHS["thiet-giap-tru-ram"]!;
    expect(ram.chargeMs).toBe(1200 + ram.sizeMm.width / 2 / 5);
    // k 1.30 would make 1.4 s / 1.3 = 1.08 s: the floor holds it at 1.4 s.
    expect(chargeTicks(ram, "challenge", 1300)).toBe(84);
  });
});
