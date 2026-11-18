/** Ticket 395: existing Firefly wood ingredients, one context, grouped events; listening still pending. */
import type * as THREE from "three";
import type { FireflyTake, LabSound } from "./sound";
import { BUS_GAIN, MASTER_GAIN } from "./sound-tiers";
import type { WoodLayerSound } from "./wood-ult-layered";

// Momentary maximum and true peak measured by ffmpeg ebur128=peak=true, 16/11/2026.
const SOURCE: Record<WoodLayerSound, { folder: string; target: number; fade: readonly [number, number]; levels: readonly (readonly [number, number, number])[] }> = {
  gather: { folder: "tt-sfx-el-wood-charge", target: -23, fade: [0.4, 0.25], levels: [[1, -13.5, -3.3], [3, -13.6, -4.1]] },
  grow: { folder: "tt-sfx-wood-cast", target: -25, fade: [0.3, 0.25], levels: [[1, -13.9, -3.1], [3, -13.0, -2.7]] },
  crack: { folder: "tt-sfx-wood-ring-burst", target: -18, fade: [0.5, 0.5], levels: [[3, -30.4, -18.0]] },
  break: { folder: "tt-sfx-wood-hit-heavy", target: -19, fade: [0.32, 0.3], levels: [[1, -7.6, -0.3]] },
  tail: { folder: "tt-sfx-wood-tail", target: -28, fade: [1.5, 0.8], levels: [[1, -31.6, -5.2], [2, -33.4, -11.8]] },
};
export function woodUltSound(sound: LabSound): (event: WoodLayerSound, at: THREE.Vector3, pitch: number) => void {
  const takes = new Map<WoodLayerSound, FireflyTake[]>(), turns = new Map<WoodLayerSound, number>();
  const fixed = 20 * Math.log10(BUS_GAIN.world * MASTER_GAIN);
  for (const event of Object.keys(SOURCE) as WoodLayerSound[]) {
    const row = SOURCE[event];
    const list = row.levels.map(([take, momentary, peak]) => ({ file: `${row.folder}/take${take}.wav`,
      gain: 10 ** ((Math.min(row.target - momentary, -1 - peak) - fixed) / 20), onset: 0, fade: row.fade }));
    takes.set(event, list); sound.registerTakes(list);
  }
  return (event, at, pitch) => {
    const list = takes.get(event)!;
    const turn = turns.get(event) ?? 0; turns.set(event, turn + 1);
    sound.playTake(list[turn % list.length]!, { bus: "world", send: event === "tail" ? 0.15 : 0.3,
      group: event === "crack" ? "big" : "impact", rate: pitch, pan: Math.max(-1, Math.min(1, at.x / 22)) });
  };
}
