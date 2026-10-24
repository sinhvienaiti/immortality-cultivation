/**
 * Screen zones: where HUD, wave card, shop and learning panels may sit so the
 * Bàn Quyết is never covered.
 * Owner: Lane 6. TODO(lane-6): Source games/dragon-hold/src/ui/screen-zones.ts.
 */

export interface ScreenZone {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function screenZones(_width: number, _height: number): readonly ScreenZone[] {
  throw new Error("TODO(lane-6): ui/screen-zones.ts screenZones");
}
