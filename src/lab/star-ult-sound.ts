/** 454: existing Firefly takes, momentary maxima / true peaks measured by ebur128 on 18/11. */
import type * as THREE from "three";
import type { FireflyTake, LabSound } from "./sound";
import { BUS_GAIN, MASTER_GAIN } from "./sound-tiers";
import type { StarSound } from "./star-ult-layered";
const SOURCE: Record<StarSound, {folder: string; target: number; fade: readonly [number,number]; levels: readonly (readonly [number,number,number])[]}> = {
  gather: {folder: "tt-sfx-star-charge-long", target: -28, fade: [1.0, 0.2], levels: [[1, -8.3, 0.1], [2, -5.8, 0.1], [3, -6.9, 0.0], [4, -9.2, 0.0]]},
  release: {folder: "tt-sfx-star-cast", target: -24, fade: [0.22, 0.18], levels: [[1, -5.0, 0.0], [2, -7.9, 0.0], [3, -10.2, 0.0], [4, -6.3, 0.0]]},
  draw: {folder: "tt-sfx-el-star-seal", target: -30, fade: [1.1, 0.4], levels: [[1, -10.8, -0.1], [2, -9.9, -0.2], [3, -16.9, -5.7], [4, -8.6, -1.4]]},
  node: {folder: "tt-sfx-twin-glint-shimmer", target: -30, fade: [0.12, 0.12], levels: [[1, -11.3, -1.6], [2, -16.1, -4.3], [3, -14.3, -1.8], [4, -12.1, -1.8]]},
  launch: {folder: "tt-sfx-el-star-comet", target: -25, fade: [0.3, 0.16], levels: [[1, -6.3, 0.0], [2, -5.4, 0.0], [3, -6.6, 0.0], [4, -6.8, 0.0]]},
  hit: {folder: "tt-sfx-star-hit-light", target: -24, fade: [0.3, 0.3], levels: [[1, -11.8, 0.0], [2, -10.7, -0.0], [3, -9.0, 0.1], [4, -8.4, 0.0]]},
  climax: {folder: "tt-sfx-star-big-burst", target: -19, fade: [0.5, 0.6], levels: [[1, -7.8, -0.0], [2, -8.7, -0.0], [3, -6.8, 0.0], [4, -6.7, -0.0]]},
  tail: {folder: "tt-sfx-star-tail", target: -29, fade: [1.2, 0.9], levels: [[1, -15.0, -2.0], [2, -20.1, -8.9], [3, -14.9, -3.5], [4, -24.7, -14.1]]},
};
const HEAVY = [[1, -5.8, -0.2], [2, -7.5, 0.0], [3, -8.3, 0.0], [4, -9.8, -0.1]] as const;
export function starUltSound(sound: LabSound): (event: StarSound, at: THREE.Vector3, pitch: number) => void {
  const takes = new Map<StarSound, FireflyTake[]>(), turns = new Map<StarSound, number>();
  const fixed = 20 * Math.log10(BUS_GAIN.world * MASTER_GAIN);
  const make = (folder: string, target: number, fade: readonly [number,number], levels: readonly (readonly [number,number,number])[]) => levels.map(([take,m,peak]) => ({file: `${folder}/take${take}.wav`,
    gain: 10 ** ((Math.min(target-m,-1-peak)-fixed)/20), onset: 0, fade}));
  for (const event of Object.keys(SOURCE) as StarSound[]) {
    const row=SOURCE[event], list=make(row.folder,row.target,row.fade,row.levels);
    takes.set(event,list); sound.registerTakes(list);
  }
  const heavy=make("tt-sfx-star-hit-heavy",-24,[.3,.5],HEAVY); sound.registerTakes(heavy);
  return (event,at,pitch) => {
    const list=takes.get(event)!, turn=turns.get(event)??0;turns.set(event,turn+1);
    const options={bus:"world" as const,send:event==="tail"?.15:.25,group:event==="climax"?"big" as const:event==="draw"||event==="tail"?undefined:"impact" as const,
      rate:pitch,pan:Math.max(-1,Math.min(1,at.x/22))};
    sound.playTake(list[turn%list.length]!,options);
    if(event==="climax") sound.playTake(heavy[turn%heavy.length]!,options);
  };
}
