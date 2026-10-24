/**
 * Bàn Quyết (canon §6, §21.1, §24): the DOM bar in #ic-quyet, outside the
 * canvas: 5 slots + 3 đan phù cells (counts and cooldown only); words 28–32 px
 * (Be Vietnam Pro 700), first letter underlined, cooldown ring, next word dim
 * at 50 %, skill name apart from the word, `held` state, element rim; the whole
 * bar dims when it is not live; never shakes. Updates ≤ 0.3 ms a frame.
 * Owner: Lane 3. TODO(lane-3).
 */
import type { Presenter } from "../app/contracts";

export function createBanQuyet(_host: HTMLElement, _seat: number): Presenter {
  throw new Error("TODO(lane-3): ui/ban-quyet.ts createBanQuyet");
}
