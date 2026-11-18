/** Ticket 408: existing Firefly void ingredients, measured with ffmpeg ebur128 on 16/11/2026. */
import type * as THREE from "three";
import type { FireflyTake, LabSound } from "./sound";
import { BUS_GAIN, MASTER_GAIN } from "./sound-tiers";
import type { VoidLayerSound } from "./void-ult-layered";

const SOURCE: Record<VoidLayerSound, { folder: string; target: number; fade: readonly [number, number]; levels: readonly (readonly [number, number, number])[] }> = {
  gather: { folder: "tt-sfx-void-vortex-loop", target: -28, fade: [0.4, 0.2], levels: [[1, -11.7, -1.1], [3, -10.6, -1.1]] },
  grow: { folder: "tt-sfx-void-vortex-loop", target: -27, fade: [3, 0.8], levels: [[1, -11.7, -1.1], [3, -10.6, -1.1]] },
  crack: { folder: "tt-sfx-void-ring-burst", target: -21, fade: [0.8, 0.6], levels: [[1, -6.6, 0]] },
  break: { folder: "tt-sfx-void-hit-heavy", target: -19, fade: [0.8, 0.7], levels: [[1, -7.3, 0], [3, -7.3, 0]] },
  tail: { folder: "tt-sfx-void-tail", target: -28, fade: [1, 0.7], levels: [[1, -16.4, -3.3], [3, -11.1, -0.8]] },
};
export function voidUltSound(sound: LabSound): (event: VoidLayerSound, at: THREE.Vector3, pitch: number) => void {
  const takes = new Map<VoidLayerSound, FireflyTake[]>(), turns = new Map<VoidLayerSound, number>();
  const fixed = 20 * Math.log10(BUS_GAIN.world * MASTER_GAIN);
  for (const event of Object.keys(SOURCE) as VoidLayerSound[]) {
    const row = SOURCE[event];
    const list = row.levels.map(([take, momentary, peak]) => ({ file: `${row.folder}/take${take}.wav`,
      gain: 10 ** ((Math.min(row.target - momentary, -1 - peak) - fixed) / 20), onset: 0, fade: row.fade }));
    takes.set(event, list); sound.registerTakes(list);
  }
  return (event, at, pitch) => {
    const list = takes.get(event)!, turn = turns.get(event) ?? 0; turns.set(event, turn + 1);
    sound.playTake(list[turn % list.length]!, { bus: "world", send: event === "tail" ? 0.15 : 0.3,
      group: event === "break" || event === "crack" ? "big" : "impact", rate: pitch, pan: Math.max(-1, Math.min(1, at.x / 22)) });
  };
}
