/** Ticket 402: existing Firefly metal ingredients, measured with ffmpeg ebur128 on 16/11/2026. */
import type * as THREE from "three";
import type { FireflyTake, LabSound } from "./sound";
import { BUS_GAIN, MASTER_GAIN } from "./sound-tiers";
import type { MetalLayerSound } from "./metal-ult-layered";

const SOURCE: Record<MetalLayerSound, { folder: string; target: number; fade: readonly [number, number]; levels: readonly (readonly [number, number, number])[] }> = {
  gather: { folder: "tt-sfx-el-metal-charge", target: -24, fade: [0.45, 0.3], levels: [[1, -6.7, 0], [3, -4.5, -0.9]] },
  grow: { folder: "tt-sfx-metal-sword-draw", target: -27, fade: [0.6, 0.4], levels: [[1, -9.3, -0.2], [3, -8.3, 0]] },
  crack: { folder: "tt-sfx-metal-qi-slash", target: -19, fade: [0.8, 0.45], levels: [[1, -6.9, 0], [3, -6.1, 0]] },
  break: { folder: "tt-sfx-metal-big-burst", target: -19, fade: [1.5, 1.2], levels: [[1, -5.6, 0.1], [3, -6, 0]] },
  tail: { folder: "tt-sfx-metal-glint", target: -28, fade: [0.5, 0.45], levels: [[1, -8.8, 0], [3, -10.7, -0.4]] },
};
export function metalUltSound(sound: LabSound): (event: MetalLayerSound, at: THREE.Vector3, pitch: number) => void {
  const takes = new Map<MetalLayerSound, FireflyTake[]>(), turns = new Map<MetalLayerSound, number>();
  const fixed = 20 * Math.log10(BUS_GAIN.world * MASTER_GAIN);
  for (const event of Object.keys(SOURCE) as MetalLayerSound[]) {
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
