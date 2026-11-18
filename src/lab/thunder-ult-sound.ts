/** 434j: keep the existing host hook, bus, mute, take, voice caps and capture log.
 * Its legacy two-argument hook has no options slot. Decorate only the synchronous
 * pillar take call, restoring the method even if the hook throws; no other cue changes.
 */
import { LabSound, type FireflyTake, type TakeOptions } from "./sound";
export function thunderColumnSound(play: () => void, rate: number, delay: number, gain: number): void {
  const original=LabSound.prototype.playTake;
  LabSound.prototype.playTake=function(t:FireflyTake,o:TakeOptions={}):boolean {
    return original.call(this,t,t.file==="tt-sfx-pillar-thunder/take1.wav"
      ? {...o,rate:(o.rate??1)*rate,delay:(o.delay??0)+delay,gain:(o.gain??1)*gain}:o);
  };
  try { play(); } finally { LabSound.prototype.playTake=original; }
}
