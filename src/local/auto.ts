/**
 * Đánh nền (canon §9.3, §12.1): `auto{seat, beast, origin}` at the school's
 * rate (Phi Kiếm every 1.2 s, 10 m, data/school-kiem.ts): the soft target when
 * it lives and is in range, else the beast nearest the heart in range
 * (sim/targeting.ts, canon §23.3). `origin` is the position rounded to 100 mm;
 * the sim checks range from it. Reads the world only; nothing while down.
 * Owner: Lane 2.
 */
import { SCHOOL_KIEM } from "../content/data/school-kiem";
import { quantizeOrigin } from "../content/rules";
import type { BeastState, LocalState, World } from "../content/types";
import { mmToU, msToTicks, within } from "../sim/fixed";
import { nearestToHeart } from "../sim/targeting";

/** The school's auto attack: every, range (the seat's school; Kiếm at M0a). */
export function autoSkill(): { readonly everyMs: number; readonly rangeMm: number } | null {
  for (const skill of SCHOOL_KIEM) if (skill.slot === "auto" && skill.effect.kind === "auto") return skill.effect;
  return null;
}

export function stepAuto(local: LocalState, world: World): void {
  if (local.down || local.tick < local.autoNext) return;
  const skill = autoSkill();
  if (!skill) return;
  const origin = quantizeOrigin(local);
  const range = mmToU(skill.rangeMm);
  let target: BeastState | null = null;
  const soft = world.seats[local.seat]?.softTarget ?? null;
  if (soft) {
    const beast = world.beasts.list[soft.slot];
    if (beast && beast.alive && beast.serial === soft.serial && within(beast.x, beast.z, origin.x, origin.z, range)) target = beast;
  }
  target ??= nearestToHeart(world, origin, range);
  if (!target) return;
  local.outbox.push({ type: "auto", seat: local.seat, beast: { slot: target.slot, serial: target.serial }, origin });
  local.autoNext = local.tick + msToTicks(skill.everyMs);
}
