import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Projector, ScreenPoint } from "../../src/app/contracts";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { chooseSpot, overlapArea, publishZones, quyetBand, screenZones, segmentInside, spotCost, viewInsets, zonesFor, type Rect, type ScreenZones } from "../../src/ui/screen-zones";
import { fitCamera, projectPoint } from "../../src/view/renderer";

/** canon §21.1, §24, M0A_PLAN §6.6: the DOM never covers the Bàn Quyết; floating cards keep off the routes and slots. */

const VIEWS = [
  [1280, 720],
  [1600, 900],
  [1920, 1080],
  [1024, 768],
] as const;

const rectOf = (zone: { x: number; y: number; width: number; height: number }): Rect => ({ x: zone.x, y: zone.y, w: zone.width, h: zone.height });

describe("fixed DOM zones", () => {
  it("never reach into the Bàn Quyết band, stay on screen and do not overlap each other", () => {
    for (const [width, height] of VIEWS) {
      for (const scale of [100, 125, 150]) {
        const zones = screenZones(width, height, scale);
        const quyet = zones.find((zone) => zone.id === "quyet")!;
        expect(quyet.y + quyet.height).toBe(height);
        expect(quyet.width).toBe(width);
        expect(quyet.height).toBe(quyetBand(width, height, scale));
        const others = zones.filter((zone) => zone.id !== "quyet");
        for (const zone of others) {
          expect(overlapArea(rectOf(zone), rectOf(quyet)), zone.id + " at " + width + "×" + height + " " + scale + " %").toBe(0);
          expect(zone.x).toBeGreaterThanOrEqual(0);
          expect(zone.x + zone.width).toBeLessThanOrEqual(width);
          expect(zone.y).toBeGreaterThanOrEqual(0);
        }
        // No two panels share room: the HUD bottom left, the shop centred beside it, the Trận Lực bar and the wave card on top.
        const [hud, top, card, shop, notices] = ["hud", "top", "card", "shop", "notices"].map((id) => rectOf(zones.find((zone) => zone.id === id)!));
        for (const [a, b] of [[hud, top], [hud, card], [hud, shop], [top, card], [shop, card], [notices, card], [notices, hud]] as const) expect(overlapArea(a!, b!), width + "×" + height + " " + scale + " %").toBe(0);
        // The HUD sits on the Bàn Quyết band's top edge, bottom left.
        expect(hud!.x).toBeLessThan(width / 4);
        expect(hud!.y + hud!.h).toBeLessThanOrEqual(quyet.y);
        expect(hud!.y + hud!.h).toBeGreaterThan(quyet.y - 40);
      }
    }
  });

  it("asks the renderer to keep the Bàn Quyết band clear, more at larger text (canon §24)", () => {
    const small = viewInsets(1920, 1080, 100);
    const large = viewInsets(1920, 1080, 150);
    expect(small.top).toBe(0);
    expect(small.bottom).toBe(quyetBand(1920, 1080, 100));
    expect(large.bottom).toBeGreaterThan(small.bottom);
  });
});

describe("field zones a floating card keeps off", () => {
  function projector(width: number, height: number): Projector {
    const camera = new THREE.PerspectiveCamera();
    fitCamera(camera, width / height, { insetBottom: quyetBand(width, height) / height });
    const scratch = new THREE.Vector3();
    return (x: number, y: number, z: number, out: ScreenPoint) => projectPoint(camera, width, height, x, y, z, out, scratch);
  }

  it("publishes both ground corridors, both sky routes, the 6 slots, the heart and the Tâm nhãn, all on screen", () => {
    const root = {} as HTMLElement;
    expect(zonesFor(root)).toBeNull();
    const zones = publishZones(root, THANH_THACH_AI, projector(1920, 1080));
    expect(zonesFor(root)).toBe(zones);
    expect(zones.lanes).toHaveLength(4);
    expect(zones.slots).toHaveLength(THANH_THACH_AI.field.mechSlots.length + 1 + THANH_THACH_AI.field.nodes.length);
    for (const lane of zones.lanes) {
      for (const [x, y] of [[lane.ax, lane.ay], [lane.bx, lane.by]]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1920);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1080 - quyetBand(1920, 1080));
      }
      expect(lane.half).toBeGreaterThanOrEqual(6);
    }
    const stamp = zones.stamp;
    expect(publishZones(root, THANH_THACH_AI, projector(1920, 1080)).stamp).toBe(stamp + 1);
  });

  it("measures a route inside a card and picks the first clear spot, keeping the current one while clear", () => {
    const lane = { ax: 0, ay: 50, bx: 200, by: 50, half: 10 };
    expect(segmentInside({ x: 50, y: 40, w: 50, h: 20 }, lane)).toBeCloseTo(70, 6);
    expect(segmentInside({ x: 50, y: 100, w: 50, h: 20 }, lane)).toBe(0);
    const zones: ScreenZones = { lanes: [lane], slots: [{ x: 300, y: 300, w: 40, h: 40 }], stamp: 1 };
    const view = { w: 800, h: 600 };
    const spots: Rect[] = [
      { x: 20, y: 20, w: 100, h: 60 },
      { x: 290, y: 290, w: 60, h: 60 },
      { x: 500, y: 100, w: 100, h: 60 },
    ];
    expect(spotCost(spots[0]!, zones, [], view).lanes).toBeGreaterThan(0);
    expect(spotCost(spots[1]!, zones, [], view).slots).toBeGreaterThan(0);
    expect(chooseSpot(spots, zones, [], view)).toBe(2);
    // A panel over spot 2 sends the card to the cheapest one.
    expect(chooseSpot(spots, zones, [{ x: 480, y: 80, w: 200, h: 120 }], view)).not.toBe(2);
    expect(chooseSpot(spots, zones, [], view, 2)).toBe(2);
    expect(chooseSpot([spots[2]!, { x: 700, y: 10, w: 50, h: 50 }], zones, [], view, 1)).toBe(1);
  });
});
