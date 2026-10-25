import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/content/data/consumables", async () => (await import("./fakes")).consumableData());

import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { DASH, PLAYER, quantizeOrigin } from "../../src/content/rules";
import type { EventOf, LocalState } from "../../src/content/types";
import { onConsumable, stepConsumableEffects } from "../../src/local/consumables";
import { onCastResolved } from "../../src/local/dash";
import { stepDown } from "../../src/local/down";
import { createLocal, stepMove } from "../../src/local/player";
import { mToU, mmToU, msToTicks } from "../../src/sim/fixed";

/** canon §12.3, §12.1, §4.1 (D34): đan phù on the player, Lưu Quang Bộ, down. */
const stage = THANH_THACH_AI;

const pill = (kind: EventOf<"consumable">["kind"], seat = 0): EventOf<"consumable"> => ({ type: "consumable", seat, kind, x: 0, z: 0, tick: 0 });
const cast = (slot: EventOf<"cast">["slot"], seat = 0, state: EventOf<"cast">["state"] = "resolved"): EventOf<"cast"> => ({
  type: "cast", state, seat, slot, actionId: 1, wordId: "sun", origin: { x: 0, z: 0 }, tick: 0,
});

function tickBy(local: LocalState, ticks: number, each: (local: LocalState) => void): void {
  for (let k = 0; k < ticks; k += 1) {
    each(local);
    local.tick += 1;
  }
}

describe("local đan phù (canon §12.3)", () => {
  it("Hồi Xuân Đan heals 25 % of max Sinh lực over 2 s, all of it", () => {
    const local = createLocal(0, stage, 1000);
    local.hp = 100;
    onConsumable(local, pill("hoi-xuan-dan"));
    expect(local.healLeft).toBe(150);
    tickBy(local, 60, stepConsumableEffects);
    expect(local.hp).toBe(175);
    tickBy(local, 60, stepConsumableEffects);
    expect(local.hp).toBe(250);
    expect(local.healLeft).toBe(0);
    tickBy(local, 30, stepConsumableEffects);
    expect(local.hp).toBe(250);
  });

  it("Kim Thân Phù shields 20 % of max Sinh lực for 8 s", () => {
    const local = createLocal(0, stage, 1120);
    onConsumable(local, pill("kim-than-phu"));
    expect(local.shield).toBe(134);
    // stepLocal pays strikes before the effects step: the shield stands for the 480 ticks after the one it came in,
    // and goes at the end of the 480th.
    tickBy(local, msToTicks(8000), stepConsumableEffects);
    expect(local.shield).toBe(134);
    tickBy(local, 1, stepConsumableEffects);
    expect(local.shield).toBe(0);
  });

  it("a second Hồi Xuân Đan keeps the stronger dose and starts its 2 s over", () => {
    const local = createLocal(0, stage, 1000);
    local.hp = 100;
    onConsumable(local, pill("hoi-xuan-dan"));
    tickBy(local, 60, stepConsumableEffects);
    expect([local.hp, local.healLeft]).toEqual([175, 75]);
    onConsumable(local, pill("hoi-xuan-dan"));
    expect([local.healTotal, local.healLeft]).toEqual([150, 150]);
    tickBy(local, 120, stepConsumableEffects);
    expect([local.hp, local.healLeft]).toEqual([325, 0]);
  });

  it("takes only its own seat's self effects, never while down", () => {
    const local = createLocal(0, stage, 1000);
    onConsumable(local, pill("kim-than-phu", 1));
    onConsumable(local, pill("loi-hoa-phu"));
    expect([local.shield, local.healLeft]).toEqual([0, 0]);
    local.down = true;
    onConsumable(local, pill("hoi-xuan-dan"));
    expect(local.healLeft).toBe(0);
  });
});

describe("local Lưu Quang Bộ (canon §12.1)", () => {
  it("glides 5 m along the facing over 0.3 s, unpushable meanwhile, on its own ô 3 resolved with the dash loadout", () => {
    const local = createLocal(0, stage, 1000);
    local.facingX = 1000;
    local.facingZ = 0;
    onCastResolved(local, cast(3), "ward");
    onCastResolved(local, cast(3, 1), "dash");
    onCastResolved(local, cast(2), "dash");
    onCastResolved(local, cast(3, 0, "held"), "dash");
    expect(local.dashLeft).toBe(0);
    onCastResolved(local, cast(3), "dash");
    expect(local.dashUntil).toBe(msToTicks(DASH.unpushableMs));
    tickBy(local, msToTicks(DASH.unpushableMs), (l) => stepMove(l, stage));
    expect([local.x, local.z]).toEqual([mmToU(DASH.distanceMm), mToU(3)]);
    expect(local.dashLeft).toBe(0);
    expect(local.tick).toBe(local.dashUntil);
  });
});

describe("local down (canon §4.1)", () => {
  it("sends down with its origin at Sinh lực 0, lies 8 s, stands at the heart with full Sinh lực", () => {
    const local = createLocal(0, stage, 1000);
    local.x = mToU(-4.04);
    local.z = mToU(1.96);
    local.hp = 0;
    stepDown(local);
    expect(local.down).toBe(true);
    expect(local.outbox).toEqual([{ type: "down", seat: 0, origin: quantizeOrigin({ x: mToU(-4.04), z: mToU(1.96) }) }]);
    expect(local.outbox[0]).toMatchObject({ origin: { x: mToU(-4), z: mToU(2) } });
    expect(local.events).toMatchObject([{ type: "player-down", seat: 0 }]);
    // Lying still for 8 s from the tick it fell (ticks 0–479; the world's seat is down as long): no move.
    local.arrows = 8;
    tickBy(local, msToTicks(PLAYER.downMs), (l) => {
      stepMove(l, stage);
      stepDown(l);
    });
    expect(local.down).toBe(true);
    expect(local.x).toBe(mToU(-4.04));
    expect(local.tick).toBe(local.downUntil);
    tickBy(local, 1, stepDown);
    expect(local.down).toBe(false);
    expect([local.x, local.z, local.hp]).toEqual([0, 0, 600]);
    expect(local.events.map((e) => e.type)).toEqual(["player-down", "player-up"]);
    expect(local.outbox).toHaveLength(1);
  });
});
