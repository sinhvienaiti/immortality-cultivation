import { describe, expect, it } from "vitest";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { createLocal } from "../../src/local/index";
import { PLAYER } from "../../src/content/rules";
import type { BeastState, LocalState, SimEvent, World } from "../../src/content/types";
import { hudView, noticeFor, postureName, postureTarget, speciesName } from "../../src/ui/hud";
import { HEART_LOW_PCT } from "../../src/ui/styles/palette";

/** canon §6.6, §9.1 (D34): the HUD reads the world and the local layer, nothing else. */

const M = 60_000;

function beast(slot: number, over: Partial<BeastState>): BeastState {
  return {
    slot, serial: slot + 1, alive: true, freed: false, species: "phong-lang", tier: "small", elite: null, general: false, boss: false, x: 0, z: 0, posture: null,
    ...over,
  } as BeastState;
}

const posture = (value: number, max: number, brokenUntil = -1, immuneUntil = -1) => ({ value, max, brokenUntil, immuneUntil });

function hudWorld(beasts: BeastState[] = [], over: Record<string, unknown> = {}): World {
  return {
    stage: THANH_THACH_AI,
    tick: 600,
    phase: "wave",
    seats: [{ seat: 0, chanNguyenPm: 42_600, softTarget: null }],
    formation: { heart: 640, heartMax: 1000 },
    economy: { wallets: [{ linhSa: 1325, thuHach: 2 }] },
    beasts: { list: beasts },
    ...over,
  } as unknown as World;
}

function local(over: Partial<LocalState> = {}): LocalState {
  return Object.assign(createLocal(0, THANH_THACH_AI, 1000), over);
}

describe("HUD values (canon §6.6)", () => {
  it("reads Sinh lực, khiên and down from the local layer; Chân Nguyên, Trận Lực and Linh Sa from the world", () => {
    const view = hudView(hudWorld(), local({ hp: 420, shield: 120, tick: 600 }), 0);
    expect(view).toMatchObject({ hp: 420, hpMax: PLAYER.hp, shield: 120, down: false, downLeftS: 0, chanNguyen: 42, heart: 640, heartMax: 1000, heartLow: false, linhSa: 1325, posture: null });
    const down = hudView(hudWorld(), local({ hp: 0, down: true, downUntil: 600 + 3 * 60 + 10, tick: 600 }), 0);
    expect(down.down).toBe(true);
    expect(down.downLeftS).toBe(4);
  });

  it("turns Trận Lực urgent under 30 %", () => {
    const at = (heart: number) => hudView(hudWorld([], { formation: { heart, heartMax: 1000 } }), local(), 0).heartLow;
    expect(HEART_LOW_PCT).toBe(30);
    expect(at(300)).toBe(false);
    expect(at(299)).toBe(true);
  });

  it("shows the Thế bar of the Vương first, then the soft target, then the elite or general nearest the Trận Tâm", () => {
    const near = beast(0, { elite: "cuong", x: 6 * M, z: -6 * M, posture: posture(40, 40) });
    const far = beast(1, { general: true, species: "lang-dau-dan", tier: "general", x: 12 * M, z: -12 * M, posture: posture(60, 60) });
    const plain = beast(2, { x: 1 * M, z: 0 });
    const world = hudWorld([near, far, plain]);
    expect(postureTarget(world, 0)).toBe(near);
    world.seats[0]!.softTarget = { slot: 1, serial: 2 };
    expect(postureTarget(world, 0)).toBe(far);
    const boss = beast(3, { boss: true, species: "thiet-boi-lang-vuong", tier: "boss", x: -15 * M, z: -18 * M, posture: posture(100, 100) });
    world.beasts.list.push(boss);
    expect(postureTarget(world, 0)).toBe(boss);
    boss.alive = false;
    world.seats[0]!.softTarget = { slot: 2, serial: 3 };
    // A soft target without Thế does not take the bar.
    expect(postureTarget(world, 0)).toBe(near);
  });

  it("names the bar and marks phá thế and the 15 s immunity", () => {
    const elite = beast(0, { elite: "thiet-bi", species: "thiet-giap-tru", posture: posture(0, 40, 900, 1800) });
    expect(postureName(elite)).toBe("Thiết Giáp Trư · Thiết Bì");
    expect(speciesName("thiet-boi-lang-vuong")).toBe("Thiết Bối Lang Vương");
    const view = hudView(hudWorld([elite]), local(), 0);
    expect(view.posture).toMatchObject({ value: 0, max: 40, broken: true, immune: true, boss: false });
  });
});

describe("HUD notices", () => {
  const tick = 1;
  it("tells the wave, the boss, phá thế, the node, Linh Dịch, a cracked pillar and the seat's own fall", () => {
    const events: SimEvent[] = [
      { tick, type: "wave-start", wave: 3, waves: 6, gates: ["A", "B", "sky"] },
      { tick, type: "phase", phase: "boss", wave: 6, endsAtTick: -1 },
      { tick, type: "posture", stage: "break", beast: { slot: 0, serial: 1 }, value: 0, max: 40 },
      { tick, type: "formation", what: "node-off", heart: 900, heartMax: 1000, node: "tam-nhan" },
      { tick, type: "formation", what: "linh-dich", heart: 950, heartMax: 1000, node: null },
      { tick, type: "pillar", stage: "crack", pillar: "west", rams: 2 },
      { tick, type: "player-down", seat: 0, x: 0, z: 0 },
    ];
    expect(events.map((event) => noticeFor(event, 0)?.text)).toEqual([
      "Đợt 3 / 6",
      "Thú Vương xuất hiện",
      "Phá thế! Sát thương × 1,5",
      "Tâm nhãn bị chiếm: gõ Tẩy",
      "Linh Dịch: Trận Lực hồi",
      "Trận Trụ Tây đã nứt",
      "Gục: dậy ở Trận Tâm sau 8 s",
    ]);
    expect(noticeFor({ tick, type: "player-down", seat: 1, x: 0, z: 0 }, 0)).toBeNull();
  });

  it("says a rejected shop or đan phù command softly, never a routine one", () => {
    expect(noticeFor({ tick, type: "rejected", command: "buy", reason: "money" }, 0)).toEqual({ text: "Không đủ Linh Sa", kind: "soft" });
    expect(noticeFor({ tick, type: "rejected", command: "consumable", reason: "cooldown" }, 0)?.text).toBe("Đan phù đang hồi");
    expect(noticeFor({ tick, type: "rejected", command: "place", reason: "who-knows" }, 0)?.text).toBe("Không làm được: who-knows");
    expect(noticeFor({ tick, type: "rejected", command: "auto", reason: "range" }, 0)).toBeNull();
    expect(noticeFor({ tick, type: "rejected", command: "key", reason: "phase" }, 0)).toBeNull();
  });
});
