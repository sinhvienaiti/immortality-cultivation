/**
 * Down (canon §4.1): Sinh lực 0 → `down{seat, origin}` for the world (Trận Lực
 * −5 % solo, the seat's Bàn Quyết dims), lie 8 s where it fell, then stand up
 * at the heart with full Sinh lực (the canon does not say how much: đề xuất
 * của vòng này, chờ chủ dự án xác nhận). While down: no move, no auto
 * attack, no đan phù, no hits taken.
 * Owner: Lane 2.
 */
import { PLAYER, quantizeOrigin } from "../content/rules";
import type { LocalState } from "../content/types";
import { msToTicks } from "../sim/fixed";
import { localEmit } from "./events";

export function stepDown(local: LocalState): void {
  if (local.down) {
    if (local.tick < local.downUntil) return;
    local.down = false;
    local.downUntil = -1;
    local.x = 0;
    local.z = 0;
    local.hp = local.hpMax;
    local.shield = 0;
    local.shieldUntil = -1;
    local.healTotal = 0;
    local.healLeft = 0;
    local.healFrom = -1;
    local.healUntil = -1;
    localEmit(local, { type: "player-up", seat: local.seat, x: 0, z: 0 });
    return;
  }
  if (local.hp > 0) return;
  local.hp = 0;
  local.down = true;
  local.downUntil = local.tick + msToTicks(PLAYER.downMs);
  local.path.length = 0;
  local.moveTarget = null;
  local.dashLeft = 0;
  local.outbox.push({ type: "down", seat: local.seat, origin: quantizeOrigin(local) });
  localEmit(local, { type: "player-down", seat: local.seat, x: local.x / 60_000, z: local.z / 60_000 });
}
