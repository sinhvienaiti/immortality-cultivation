import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/sim/skills", () => ({ resolveCast: vi.fn(() => true) }));
vi.mock("../../src/sim/chan-nguyen", () => ({ addChanNguyen: vi.fn() }));
vi.mock("../../src/sim/posture", () => ({ postureHit: vi.fn() }));
vi.mock("../../src/content/data/telegraphs", () => ({ TELEGRAPHS: { "boss-charge": { typedAnswer: true }, "rock-throw": { typedAnswer: false } } }));

import { NEW_WORDS, SLOTS } from "../../src/content/rules";
import type { LiveWord, Phase, SimEvent, World } from "../../src/content/types";
import { withinOneEdit } from "../../src/kit/typing/distance";
import { addChanNguyen } from "../../src/sim/chan-nguyen";
import { stepCasts } from "../../src/sim/cast";
import { postureHit } from "../../src/sim/posture";
import { resolveCast } from "../../src/sim/skills";
import {
  dealCleanse, dealSeal, deckUseOf, isBanQuyetLive, liveWords, onBeastGone, onLearnAhead, onSeatDown, releaseLock, slotEntry, stepWords, ticksToMeetDeadline,
  typeBackspace, typeKey,
} from "../../src/sim/words";
import { liveWordCap } from "../../src/typing/fallback";
import { addBeast, coldDeck, key, M0A_WAVE_SECONDS, makeWorld, NEW_TEXTS, type Fixture } from "./world-fixture";

/** canon §6.1–6.4, D19, D35, D42; HC1, HC2, HC8, CB6 at unit level (M0A_PLAN §6.3). */

beforeEach(() => {
  vi.mocked(resolveCast).mockReset().mockReturnValue(true);
  vi.mocked(addChanNguyen).mockReset();
  vi.mocked(postureHit).mockReset();
});

const live = (world: World) => liveWords(world, 0);
const SLOT_TICKS = (ms: number) => Math.round((ms * 60) / 1000);

/** Types `text` on the Bàn Quyết, one key every `gap` ticks, running the parts of the step this lane owns. */
function typeWord(world: World, text: string, gap = 6): void {
  for (const letter of text) {
    typeKey(world, key(world, letter));
    world.tick += gap;
    stepWords(world);
    stepCasts(world);
  }
}

function tick(world: World, ticks = 1): void {
  for (let k = 0; k < ticks; k += 1) {
    world.tick += 1;
    stepWords(world);
    stepCasts(world);
  }
}

/** Live words keep canon §6.2: distinct first letters, no prefixes, never one edit apart. */
function assertLetters(world: World): void {
  const texts = live(world).map((entry) => entry.text);
  expect(new Set(texts.map((text) => text[0])).size).toBe(texts.length);
  const codes = (text: string) => Uint8Array.from([...text].map((c) => c.charCodeAt(0) - 97));
  for (let a = 0; a < texts.length; a += 1) {
    for (let b = a + 1; b < texts.length; b += 1) {
      const ta = texts[a]!;
      const tb = texts[b]!;
      expect(ta.startsWith(tb) || tb.startsWith(ta)).toBe(false);
      const joined = Uint8Array.from([...codes(ta), ...codes(tb)]);
      expect(withinOneEdit(joined, 0, ta.length, ta.length, tb.length, 8)).toBe(false);
    }
  }
}

describe("the Bàn Quyết is live only from the wave warning to the wave end and in the boss phase (D42)", () => {
  it("stays dark in prep and breaks: letters make no word and no Cast", () => {
    for (const phase of ["prep", "break", "victory", "defeat"] as Phase[]) {
      const fx = makeWorld({ phase, wave: 1 });
      stepWords(fx.world);
      expect(isBanQuyetLive(fx.world, 0)).toBe(false);
      expect(live(fx.world)).toHaveLength(0);
      typeKey(fx.world, key(fx.world, "a"));
      expect(fx.of("word-progress").at(-1)!.result).toBe("asleep");
      expect(fx.of("cast")).toHaveLength(0);
      expect(fx.world.stats.keys).toBe(0);
    }
  });

  it("wakes at the warning: ô 1–4 get words (ô 4 a new one), ô 5 waits for a full Chân Nguyên", () => {
    const fx = makeWorld({ phase: "warning", wave: 0 });
    stepWords(fx.world);
    for (const slot of [1, 2, 3, 4] as const) expect(slotEntry(fx.world, 0, slot)!.state).toBe("ready");
    expect(slotEntry(fx.world, 0, 5)!.state).toBe("cooldown");
    const four = slotEntry(fx.world, 0, 4)!;
    expect(four.group).toBe("new");
    expect(four.hint).toBe(true);
    expect(fx.of("word-first-seen")).toEqual([expect.objectContaining({ seat: 0, wordId: four.wordId, channel: "slot4" })]);
    assertLetters(fx.world);
    fx.world.seats[0]!.chanNguyenPm = 100_000;
    tick(fx.world);
    expect(slotEntry(fx.world, 0, 5)!.state).toBe("ready");
    expect(slotEntry(fx.world, 0, 5)!.text.length).toBeGreaterThanOrEqual(4);
  });

  it("lives through the lull and the boss phase, and goes dark at a break (words released 'phase')", () => {
    const fx = makeWorld({ phase: "wave", wave: 6 });
    stepWords(fx.world);
    for (const phase of ["lull", "boss"] as Phase[]) {
      fx.world.phase = phase;
      tick(fx.world);
      expect(live(fx.world).length).toBeGreaterThan(0);
    }
    fx.world.phase = "break";
    tick(fx.world);
    expect(live(fx.world)).toHaveLength(0);
    expect(fx.of("word-released").every((event) => event.reason === "phase")).toBe(true);
    for (const slot of [1, 2, 3, 4, 5] as const) expect(slotEntry(fx.world, 0, slot)!.state).toBe("dim");
  });
});

describe("letters and words (canon §6.2)", () => {
  it("keeps first letters distinct, no prefix and no word one edit from another, tick after tick", () => {
    const fx = makeWorld({ phase: "wave", wave: 3 });
    stepWords(fx.world);
    for (let round = 0; round < 40; round += 1) {
      assertLetters(fx.world);
      const target = live(fx.world)[round % Math.max(1, live(fx.world).length)];
      if (target !== undefined) typeWord(fx.world, target.text);
      tick(fx.world, 30);
    }
    assertLetters(fx.world);
    expect(fx.world.stats.words).toBeGreaterThan(20);
  });

  it("never changes a word while it is being typed", () => {
    const fx = makeWorld({ phase: "wave", wave: 1 });
    stepWords(fx.world);
    const target = slotEntry(fx.world, 0, 3)!;
    const text = target.text;
    typeWord(fx.world, text.slice(0, 2));
    // A seal and an urgent word arrive, time passes: the half-typed word stays.
    dealSeal(fx.world, 0, addBeast(fx.world));
    dealCleanse(fx.world, 0, "tam-nhan");
    tick(fx.world, 120);
    expect(slotEntry(fx.world, 0, 3)!.text).toBe(text);
    expect(slotEntry(fx.world, 0, 3)!.typed).toBe(2);
    typeWord(fx.world, text.slice(2));
    expect(fx.of("word-complete").at(-1)!.text).toBe(text);
  });

  it("Esc drops the typed letters but keeps the wrong keys on the word (D19)", () => {
    const fx = makeWorld({ phase: "wave", wave: 1 });
    stepWords(fx.world);
    const target = slotEntry(fx.world, 0, 1)!;
    const text = target.text;
    typeWord(fx.world, text[0]!);
    const wrong = "zqx".split("").find((c) => c !== text[1])!;
    typeWord(fx.world, wrong);
    expect(slotEntry(fx.world, 0, 1)!.errors).toBe(1);
    releaseLock(fx.world, 0);
    expect(slotEntry(fx.world, 0, 1)!.typed).toBe(0);
    expect(slotEntry(fx.world, 0, 1)!.errors).toBe(1);
    expect(fx.world.words.seats[0]!.locked).toBe(-1);
    typeWord(fx.world, text);
    const done = fx.of("word-complete").at(-1)!;
    expect(done.errors).toBe(1);
    expect(done.grade).toBe(text.length >= 6 ? "good" : "ok");
  });

  it("Backspace steps one letter back; its errors stay", () => {
    const fx = makeWorld({ phase: "wave", wave: 1 });
    stepWords(fx.world);
    const text = slotEntry(fx.world, 0, 1)!.text;
    typeWord(fx.world, text.slice(0, 2));
    typeBackspace(fx.world, 0);
    expect(slotEntry(fx.world, 0, 1)!.typed).toBe(1);
    expect(fx.of("word-progress").at(-1)!.result).toBe("back");
  });
});

describe("the Cast transaction (canon §6.1, CB6)", () => {
  it("makes exactly one Cast per finished word; repeats, Esc and Backspace add none", () => {
    const fx = makeWorld({ phase: "wave", wave: 2 });
    stepWords(fx.world);
    for (let round = 0; round < 12; round += 1) {
      const target = live(fx.world)[0]!;
      typeWord(fx.world, target.text.slice(0, 1));
      releaseLock(fx.world, 0);
      typeBackspace(fx.world, 0);
      typeWord(fx.world, target.text);
      // A held key repeats the last letter: a stray, never a second Cast.
      typeKey(fx.world, key(fx.world, target.text.at(-1)!));
      tick(fx.world, 20);
    }
    const completes = fx.of("word-complete");
    const casts = fx.of("cast");
    expect(casts).toHaveLength(completes.length);
    expect(new Set(casts.map((cast) => cast.actionId)).size).toBe(casts.length);
    expect(casts.map((cast) => cast.wordId)).toEqual(completes.map((done) => done.wordId));
    expect(fx.world.casts.duplicates).toBe(0);
  });

  it("holds a Cast with no target 3 s at no cooldown, then fizzles it: no Chân Nguyên, the slot takes its next word at once", () => {
    vi.mocked(resolveCast).mockReturnValue(false);
    const fx = makeWorld({ phase: "wave", wave: 1 });
    stepWords(fx.world);
    const text = slotEntry(fx.world, 0, 2)!.text;
    typeWord(fx.world, text);
    expect(fx.of("cast").map((cast) => cast.state)).toEqual(["held"]);
    expect(slotEntry(fx.world, 0, 2)!.state).toBe("held");
    tick(fx.world, 170);
    expect(fx.of("cast")).toHaveLength(1);
    tick(fx.world, 20);
    expect(fx.of("cast").map((cast) => cast.state)).toEqual(["held", "fizzled"]);
    expect(addChanNguyen).not.toHaveBeenCalled();
    expect(fx.world.stats.castsFizzled).toBe(1);
    // No cooldown: ô 2 is live again right after the fizzle.
    expect(slotEntry(fx.world, 0, 2)!.state).toBe("ready");
    // The learning event of the word still counts (canon §6.1).
    expect(fx.of("word-complete")).toHaveLength(1);
  });

  it("resolves a held Cast that finds a target within 3 s and gives Chân Nguyên once", () => {
    vi.mocked(resolveCast).mockReturnValue(false);
    const fx = makeWorld({ phase: "wave", wave: 1 });
    stepWords(fx.world);
    typeWord(fx.world, slotEntry(fx.world, 0, 2)!.text);
    tick(fx.world, 60);
    vi.mocked(resolveCast).mockReturnValue(true);
    tick(fx.world, 1);
    expect(fx.of("cast").map((cast) => cast.state)).toEqual(["held", "resolved"]);
    expect(addChanNguyen).toHaveBeenCalledTimes(1);
    expect(fx.world.seats[0]!.lastResolvedTick).toBe(fx.world.tick);
    // ô 2 now cools down 8 s (rules.ts SLOTS) and shows its next word dim.
    const two = slotEntry(fx.world, 0, 2)!;
    expect(two.state).toBe("cooldown");
    expect(two.until).toBe(fx.world.tick + SLOT_TICKS(SLOTS[2].cooldownMs));
    expect(two.next).toBeGreaterThanOrEqual(0);
    tick(fx.world, 3 * 60);
    expect(fx.of("cast")).toHaveLength(2);
  });

  it("follows Lane 4's cooldown when it set one, and ô 1 comes back at once", () => {
    vi.mocked(resolveCast).mockImplementation((world, cast) => {
      if (cast.slot === 3) world.skills.seats[0]!.cooldownUntil[3] = world.tick + 30;
      if (cast.slot === 1) world.skills.seats[0]!.cooldownUntil[1] = world.tick;
      return true;
    });
    const fx = makeWorld({ phase: "wave", wave: 1 });
    stepWords(fx.world);
    typeWord(fx.world, slotEntry(fx.world, 0, 3)!.text);
    expect(slotEntry(fx.world, 0, 3)!.until).toBe(fx.world.tick - 6 + 30);
    const first = slotEntry(fx.world, 0, 1)!.text;
    typeWord(fx.world, first);
    expect(slotEntry(fx.world, 0, 1)!.state).toBe("ready");
    expect(slotEntry(fx.world, 0, 1)!.text).not.toBe(first);
    tick(fx.world, 30);
    expect(slotEntry(fx.world, 0, 3)!.state).toBe("ready");
  });

  it("drops a Cast whose actionId was already used", async () => {
    const { emitCast } = await import("../../src/sim/cast");
    const fx = makeWorld({ phase: "wave", wave: 1 });
    const cast = { seat: 0, slot: 1 as const, actionId: 0, wordId: "sun", tick: 0, channel: "typing" as const, quality: "perfect" as const, origin: { x: 0, z: 0 }, aim: null, state: "held" as const, heldUntil: -1, target: null, node: null };
    emitCast(fx.world, { ...cast });
    emitCast(fx.world, { ...cast });
    expect(fx.of("cast")).toHaveLength(1);
    expect(fx.world.casts.duplicates).toBe(1);
  });
});

/** A typist bot: one key every `gap` ticks, on the locked word or, with none, on ô 4, ô 2, then the others. */
function playUntil(fx: Fixture, until: number, schedule: (world: World) => void, gap = 10): void {
  const world = fx.world;
  while (world.tick < until) {
    schedule(world);
    stepWords(world);
    stepCasts(world);
    if (world.tick % gap === 0 && isBanQuyetLive(world, 0)) {
      const locked = world.words.seats[0]!.locked;
      const order = [4, 2, 1, 3, 5].map((slot) => slotEntry(world, 0, slot as 1)!).filter((entry) => entry.kitSlot >= 0);
      const target: LiveWord | undefined = locked >= 0 ? world.words.live[locked] : (order[0] ?? live(world)[0]);
      if (target !== undefined) typeKey(world, key(world, target.text[target.typed]!));
    }
    world.tick += 1;
  }
}

/** Prep 20 s, then per wave: warning 5 s, the wave (40, 45, 50, 55, 55, 60 s), a 20 s break (canon §13.3, §4.1 timings at Cân bằng, k 1). */
function m0aSchedule(): { schedule: (world: World) => void; waveStart: (wave: number) => number } {
  const rows: { from: number; to: number; phase: Phase; index: number }[] = [];
  let at = 20 * 60;
  rows.push({ from: 0, to: at, phase: "prep", index: 0 });
  const starts: number[] = [];
  M0A_WAVE_SECONDS.forEach((seconds, k) => {
    rows.push({ from: at, to: at + 5 * 60, phase: "warning", index: k });
    at += 5 * 60;
    starts.push(at);
    rows.push({ from: at, to: at + seconds * 60, phase: "wave", index: k + 1 });
    at += seconds * 60;
    rows.push({ from: at, to: at + 20 * 60, phase: "break", index: k + 1 });
    at += 20 * 60;
  });
  return {
    schedule(world) {
      const row = [...rows].reverse().find((item) => world.tick >= item.from)!;
      world.phase = row.phase;
      world.waves.index = row.index;
      world.phaseEndsAt = row.phase === "wave" ? -1 : row.to;
      if (row.phase === "wave") world.waves.startedAt = row.from;
    },
    waveStart: (wave) => starts[wave - 1]!,
  };
}

describe("new words (canon §6.3, §6.4; HC1, HC8)", () => {
  it("HC1: a word with no record that is not a base word never lands on a folded slot; ô 4 meets new words first, in waves 1–2 only", () => {
    const fx = makeWorld({ phase: "prep", wave: 0 });
    const { schedule, waveStart } = m0aSchedule();
    const firstMeeting = new Map<string, number>();
    playUntil(fx, waveStart(6) + 60 * 60, schedule, 8);
    const deck = fx.world.header.deck;
    const assigned = fx.of("word-assigned");
    expect(assigned.length).toBeGreaterThan(80);
    for (const event of assigned) {
      const word = deck.find((item) => item.wordId === event.wordId)!;
      if (word.group !== "new") continue;
      expect(event.kind).toBe("slot");
      expect([2, 4]).toContain(event.slot);
      if (!firstMeeting.has(event.wordId)) {
        firstMeeting.set(event.wordId, event.tick);
        expect(event.slot).toBe(4);
        expect(event.tick).toBeLessThan(waveStart(3) - 5 * 60);
      }
    }
    expect(firstMeeting.size).toBeGreaterThan(0);
    expect(firstMeeting.size).toBeLessThanOrEqual(fx.world.newWordAllowance);
    expect(fx.of("word-first-seen")).toHaveLength(firstMeeting.size);
    expect(fx.world.stats.baseWordUses.slice(1).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it("HC8: Học trước words come back in ô 2 and ô 4 as 'learning', ≥ 45 s apart, 3 meetings before wave 4", () => {
    const fx = makeWorld({ phase: "prep", wave: 0 });
    const { schedule, waveStart } = m0aSchedule();
    NEW_TEXTS.forEach((text, k) => {
      fx.world.tick = k * 60;
      onLearnAhead(fx.world, { type: "learn-ahead", seat: 0, wordId: text, correct: true });
    });
    expect(fx.of("word-first-seen").map((event) => event.channel)).toEqual(NEW_TEXTS.map(() => "learn-ahead"));
    // A second Học trước of the same word is no new meeting.
    onLearnAhead(fx.world, { type: "learn-ahead", seat: 0, wordId: NEW_TEXTS[0]!, correct: false });
    expect(fx.of("word-first-seen")).toHaveLength(NEW_TEXTS.length);
    playUntil(fx, waveStart(4), schedule, 8);
    for (const text of NEW_TEXTS) {
      const meetings = fx.of("word-assigned").filter((event) => event.wordId === text);
      expect(meetings.every((event) => event.group === "learning" && (event.slot === 2 || event.slot === 4))).toBe(true);
      const ticks = [NEW_TEXTS.indexOf(text) * 60, ...meetings.map((event) => event.tick)];
      expect(ticks.length).toBeGreaterThanOrEqual(NEW_WORDS.meetings);
      for (let k = 1; k < ticks.length; k += 1) expect(ticks[k]! - ticks[k - 1]!).toBeGreaterThanOrEqual(SLOT_TICKS(NEW_WORDS.meetGapMs));
      expect(ticks[NEW_WORDS.meetings - 1]!).toBeLessThan(waveStart(4));
    }
  });

  it("HC8 without Học trước: every word ô 4 brings meets ≥ 3 times, ≥ 45 s apart, before wave 4", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const fx = makeWorld({ phase: "prep", wave: 0, seed });
      const { schedule, waveStart } = m0aSchedule();
      playUntil(fx, waveStart(4), schedule, 8);
      const firsts = fx.of("word-first-seen");
      expect(firsts.length).toBeGreaterThan(0);
      for (const first of firsts) {
        const ticks = fx.of("word-assigned").filter((event) => event.wordId === first.wordId).map((event) => event.tick);
        expect(ticks.length).toBeGreaterThanOrEqual(NEW_WORDS.meetings);
        for (let k = 1; k < ticks.length; k += 1) expect(ticks[k]! - ticks[k - 1]!).toBeGreaterThanOrEqual(SLOT_TICKS(NEW_WORDS.meetGapMs));
      }
    }
  });

  it("brings no fresh word once two more meetings cannot fit before wave 4", () => {
    const fx = makeWorld({ phase: "wave", wave: 2 });
    const { schedule, waveStart } = m0aSchedule();
    fx.world.tick = waveStart(2);
    schedule(fx.world);
    // Wave 2 (45 s) + break 20 + warning 5 + wave 3 (50 s) + break 20 + warning 5 = 145 s at k 1.
    expect(ticksToMeetDeadline(fx.world, 0)).toBe(145 * 60);
    fx.world.tick = waveStart(2) + 40 * 60;
    schedule(fx.world);
    expect(ticksToMeetDeadline(fx.world, 0)).toBe(105 * 60);
    stepWords(fx.world);
    expect(slotEntry(fx.world, 0, 4)!.group).not.toBe("new");
    expect(fx.of("word-first-seen")).toHaveLength(0);
    // Early in wave 2 a fresh word still fits.
    const early = makeWorld({ phase: "wave", wave: 2 });
    early.world.tick = waveStart(2) + 20 * 60;
    schedule(early.world);
    stepWords(early.world);
    expect(slotEntry(early.world, 0, 4)!.group).toBe("new");
  });

  it("keeps new words within the allowance and away while a typed-answer telegraph charges", () => {
    const none = makeWorld({ phase: "warning", wave: 0, allowance: 0 });
    stepWords(none.world);
    expect(slotEntry(none.world, 0, 4)!.group).not.toBe("new");
    expect(none.of("word-first-seen")).toHaveLength(0);

    const charged = makeWorld({ phase: "warning", wave: 0 });
    charged.world.telegraphs.active.push({ id: 1, def: "boss-charge", source: null, from: { x: 0, z: 0 }, to: { x: 0, z: 0 }, reachU: 1, widthU: 1, startTick: 0, strikeTick: 600, cancelled: false });
    stepWords(charged.world);
    expect(slotEntry(charged.world, 0, 4)!.group).not.toBe("new");
    const plain = makeWorld({ phase: "warning", wave: 0 });
    plain.world.telegraphs.active.push({ id: 1, def: "rock-throw", source: null, from: { x: 0, z: 0 }, to: { x: 0, z: 0 }, reachU: 1, widthU: 1, startTick: 0, strikeTick: 600, cancelled: false });
    stepWords(plain.world);
    expect(slotEntry(plain.world, 0, 4)!.group).toBe("new");
  });

  it("stops fresh new words below 90 % accuracy", () => {
    const fx = makeWorld({ phase: "wave", wave: 1, allowance: 8 });
    stepWords(fx.world);
    // Ten stray keys: accuracy 0.
    for (let k = 0; k < 10; k += 1) {
      const used = new Set(live(fx.world).map((entry) => entry.text[0]));
      const stray = "abcdefghijklmnopqrstuvwxyz".split("").find((c) => !used.has(c))!;
      typeKey(fx.world, key(fx.world, stray));
    }
    const four = slotEntry(fx.world, 0, 4)!;
    typeWord(fx.world, four.text);
    tick(fx.world, SLOT_TICKS(SLOTS[4].cooldownMs) + 5);
    expect(slotEntry(fx.world, 0, 4)!.group).not.toBe("new");
    expect(fx.world.words.newUsed).toBe(1);
  });
});

describe("the live-word cap and priority (canon §6.2, HC2)", () => {
  it("never has more live words than min(preset cap; A − 3); an urgent word and the first Ấn take the lowest untouched place", () => {
    for (const preset of ["relax", "learn", "balanced", "challenge"] as const) {
      const fx = makeWorld({ phase: "wave", wave: 1, preset });
      const cap = liveWordCap(preset, coldDeck());
      fx.world.seats[0]!.chanNguyenPm = 100_000;
      stepWords(fx.world);
      expect(live(fx.world).length).toBe(Math.min(cap, 5));
      const typedOn = slotEntry(fx.world, 0, 2)!;
      typeWord(fx.world, typedOn.text[0]!);
      const sealed = addBeast(fx.world);
      expect(dealSeal(fx.world, 0, sealed)).toBeGreaterThanOrEqual(0);
      expect(dealCleanse(fx.world, 0, "tam-nhan")).toBeGreaterThanOrEqual(0);
      dealSeal(fx.world, 0, addBeast(fx.world));
      tick(fx.world, 3);
      expect(live(fx.world).length).toBeLessThanOrEqual(cap);
      const seat = fx.world.words.seats[0]!;
      expect(fx.world.words.live[seat.cleanse]!.kitSlot).toBeGreaterThanOrEqual(0);
      expect(fx.world.words.live[seat.seals[0]!]!.kitSlot).toBeGreaterThanOrEqual(0);
      expect(slotEntry(fx.world, 0, 2)!.typed).toBe(1);
      if (cap === 5) {
        // ô 4 (Thư giãn) or ô 5 (Học) loses its place first, then ô 5 / ô 4.
        expect(slotEntry(fx.world, 0, 3)!.kitSlot).toBeGreaterThanOrEqual(0);
        expect(slotEntry(fx.world, 0, 1)!.kitSlot).toBeGreaterThanOrEqual(0);
        const lost = [slotEntry(fx.world, 0, 4)!, slotEntry(fx.world, 0, 5)!].filter((entry) => entry.kitSlot < 0);
        expect(lost).toHaveLength(2);
        expect(fx.of("word-released").some((event) => event.reason === "replaced")).toBe(true);
      }
      for (let k = 0; k < 200; k += 1) {
        tick(fx.world);
        expect(live(fx.world).length).toBeLessThanOrEqual(cap);
      }
      expect(fx.world.stats.maxLiveWords).toBeLessThanOrEqual(cap);
    }
  });
});

describe("Ấn and Tẩy (canon §6.3, §10.7, §8.2)", () => {
  it("an Ấn is never a new word, takes base words only through the fallback, and its Cast lowers Thế by 35", () => {
    const fx = makeWorld({ phase: "wave", wave: 1 });
    stepWords(fx.world);
    const beast = addBeast(fx.world);
    const index = dealSeal(fx.world, 0, beast);
    expect(beast.seal).toBe(index);
    const seal = fx.world.words.live[index]!;
    expect(seal.kind).toBe("seal");
    expect(seal.group).not.toBe("new");
    // A cold deck has no known or due word on record: the base word came through the fallback.
    expect(seal.assumed).toBe(true);
    expect(seal.step).toBe("familiar");
    expect(seal.text.length).toBeLessThanOrEqual(6);
    typeWord(fx.world, seal.text);
    const done = fx.of("word-complete").at(-1)!;
    expect(done.activity).toBe("typing-elite");
    expect(fx.of("cast").at(-1)).toMatchObject({ slot: "seal", state: "resolved" });
    expect(postureHit).toHaveBeenCalledWith(fx.world, beast, 35, "seal");
    expect(addChanNguyen).toHaveBeenLastCalledWith(fx.world, 0, done.grade, true);
    expect(beast.seal).toBe(-1);
    expect(fx.world.words.seats[0]!.seals).toEqual([]);
  });

  it("an Ấn on the Thú Vương is typing-boss; it goes when its beast dies; at most 2 a seat", () => {
    const fx = makeWorld({ phase: "boss", wave: 6 });
    stepWords(fx.world);
    const boss = addBeast(fx.world, { boss: true });
    const first = dealSeal(fx.world, 0, boss);
    expect(dealSeal(fx.world, 0, boss)).toBe(first);
    const second = dealSeal(fx.world, 0, addBeast(fx.world));
    expect(second).toBeGreaterThanOrEqual(0);
    expect(dealSeal(fx.world, 0, addBeast(fx.world))).toBe(-1);
    boss.alive = false;
    onBeastGone(fx.world, boss);
    expect(fx.world.words.seats[0]!.seals).toEqual([second]);
    expect(fx.of("word-released").at(-1)).toMatchObject({ word: first, reason: "target-gone" });
    const other = addBeast(fx.world, { boss: true });
    const again = dealSeal(fx.world, 0, other);
    typeWord(fx.world, fx.world.words.live[again]!.text);
    expect(fx.of("word-complete").at(-1)!.activity).toBe("typing-boss");
  });

  it("Tẩy is 3–4 letters of known or base words, and the node knows its word", () => {
    const fx = makeWorld({ phase: "wave", wave: 4 });
    stepWords(fx.world);
    const index = dealCleanse(fx.world, 0, "tam-nhan");
    const word = fx.world.words.live[index]!;
    expect(word.text.length).toBeGreaterThanOrEqual(3);
    expect(word.text.length).toBeLessThanOrEqual(4);
    expect(word.group).toBe("known");
    expect(fx.world.formation.nodes[0]!.cleanse).toBe(index);
    typeWord(fx.world, word.text);
    expect(fx.of("cast").at(-1)).toMatchObject({ slot: "cleanse", state: "resolved" });
    expect(fx.world.formation.nodes[0]!.cleanse).toBe(-1);
  });
});

describe("going down (canon §4.1)", () => {
  it("releases the typing as Esc, dims the bar, drops letters; standing up deals again", () => {
    const fx = makeWorld({ phase: "wave", wave: 2 });
    stepWords(fx.world);
    typeWord(fx.world, slotEntry(fx.world, 0, 1)!.text.slice(0, 2));
    fx.world.seats[0]!.downUntil = fx.world.tick + 8 * 60;
    onSeatDown(fx.world, 0);
    expect(live(fx.world)).toHaveLength(0);
    expect(fx.world.words.seats[0]!.locked).toBe(-1);
    expect(fx.of("word-released").every((event) => event.reason === "down")).toBe(true);
    typeKey(fx.world, key(fx.world, "a"));
    expect(fx.of("word-progress").at(-1)!.result).toBe("asleep");
    tick(fx.world, 8 * 60);
    expect(live(fx.world).length).toBeGreaterThan(0);
  });
});

describe("determinism", () => {
  it("rebuilds the same words, letters and events from the same header and keys", () => {
    const run = () => {
      const fx = makeWorld({ phase: "prep", wave: 0, seed: 99 });
      const { schedule, waveStart } = m0aSchedule();
      playUntil(fx, waveStart(3), schedule, 9);
      const strip = (events: SimEvent[]) => JSON.stringify(events);
      return { words: JSON.stringify(fx.world.words), casts: JSON.stringify(fx.world.casts), stats: JSON.stringify(fx.world.stats), events: strip(fx.events) };
    };
    const a = run();
    const b = run();
    expect(b).toEqual(a);
    expect(deckUseOf).toBeTypeOf("function");
  });
});
