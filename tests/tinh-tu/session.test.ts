// Tĩnh Tu session sim (canon §16, D40; M0A_PLAN §6.8): scoring, completion, lives, the Minh schedule,
// HC5, first letters, Tham Ngộ labels, the lock grace, determinism. Lane 8.
import { describe, expect, it } from "vitest";
import { SIM, TINH_TU } from "../../src/content/rules";
import { KEY } from "../../src/kit/typing/router";
import { TRIAL_LESSONS } from "../../src/content/data/trial-set";
import {
  currentResult,
  drainEvents,
  isCompleted,
  lockedPaper,
  minhExpiryClashes,
  paperLifeMs,
  paperLook,
  sessionScore,
  stepTinhTu,
  summarize,
} from "../../src/tinh-tu/sim/session";
import { SPEEDS_X10, TIERS, idle, lessonSession, play, reviewSession, steadyHands } from "./helpers";

const ticks = (ms: number) => Math.round((ms * SIM.tickHz) / 1000);

describe("score (canon §16, D40)", () => {
  it("a completed session is clamp(40 + 5 Minh + 2 Thường − 3 wrong; 40; 100)", () => {
    expect(sessionScore(true, 6, 0, 0)).toBe(70);
    expect(sessionScore(true, 6, 3, 1)).toBe(73);
    expect(sessionScore(true, 6, 0, 20)).toBe(40);
    expect(sessionScore(true, 12, 10, 0)).toBe(100);
  });

  it("an uncompleted session has no floor: max(0; 5 Minh + 2 Thường − 3 wrong)", () => {
    expect(sessionScore(false, 0, 0, 0)).toBe(0);
    expect(sessionScore(false, 5, 0, 0)).toBe(25);
    expect(sessionScore(false, 5, 4, 2)).toBe(27);
    expect(sessionScore(false, 1, 0, 3)).toBe(0);
    // The canon caps only a completed session; lĩnh ngộ caps the lesson's total at 100 (lesson.ts addSessionScore).
    expect(sessionScore(false, 30, 0, 0)).toBe(150);
  });

  it("nothing typed: no points, not completed, the clock still runs the full 60 s", () => {
    const s = lessonSession(1, "nhap-mon", 294);
    play(s, idle);
    expect(s.tick).toBe(ticks(TINH_TU.sessionMs));
    expect(s.result).toEqual({ completed: false, minh: 0, thuong: 0, wrong: 0, score: 0 });
  });

  it("completed means every one of the 6 Minh typed at least once", () => {
    const s = lessonSession(2, "nhap-mon", 505);
    const seen: boolean[] = [];
    play(s, steadyHands(4), (state) => seen.push(isCompleted(state)));
    expect(s.result!.completed).toBe(true);
    expect(summarize(s).minhMissing).toEqual([]);
    // It turned true once, when the last missing Minh was typed, and stayed true.
    const first = seen.indexOf(true);
    expect(first).toBeGreaterThan(0);
    expect(seen.slice(first).every(Boolean)).toBe(true);
    expect(s.result!.score).toBe(sessionScore(true, s.minhDone, s.thuongDone, s.wrong));
  });

  it("a review session has only Thường, never completes, and scores without the floor", () => {
    const s = reviewSession(3, "nhap-mon", 294);
    const events = play(s, steadyHands(5));
    const kinds = new Set(events.flatMap((event) => (event.type === "spawn" ? [event.kind] : [])));
    expect([...kinds]).toEqual(["thuong"]);
    expect(s.result!.completed).toBe(false);
    expect(s.result!.score).toBe(TINH_TU.thuongPoints * s.thuongDone);
  });
});

describe("lives (canon §16: L, 1.5 L, 2 L at the profile's E_eff)", () => {
  it("L = 1.0 + 1.6 × typing time + 1.0 s; Thường 1.5 L; Tâm ma 2 L; slower profiles live longer", () => {
    for (const len of [3, 5, 8]) {
      const minh = paperLifeMs("minh", len, 294);
      // typing time at E 29.4: 12 s × (len + 1) / (E × 0.86).
      expect(minh).toBe(Math.round(1000 + 1.6 * ((12 * (len + 1)) / (29.4 * 0.86)) * 1000 + 1000));
      expect(Math.abs(paperLifeMs("thuong", len, 294) - minh * 1.5)).toBeLessThanOrEqual(1);
      expect(Math.abs(paperLifeMs("tam-ma", len, 294) - minh * 2)).toBeLessThanOrEqual(1);
      expect(paperLifeMs("minh", len, 150)).toBeGreaterThan(minh);
    }
  });

  it("a slip nobody types leaves when its life ends", () => {
    const s = lessonSession(4, "tham-ngo", 210);
    const events = play(s, idle);
    for (const event of events) {
      if (event.type !== "expire") continue;
      const spawn = events.find((other) => other.type === "spawn" && other.serial === event.serial)!;
      expect(event.tick - spawn.tick).toBe(s.life[event.word]);
    }
  });
});

describe("schedule (canon §16, HC5)", () => {
  it("every Minh shows ≥ 2 times whether or not anything is typed (7 speeds × 2 tiers × 12 seeds)", () => {
    for (const tier of TIERS) {
      for (const speed of SPEEDS_X10) {
        for (let seed = 1; seed <= 12; seed += 1) {
          for (const hands of [idle, steadyHands(7)]) {
            const s = lessonSession(seed, tier, speed);
            play(s, hands);
            const appearances = summarize(s).minhAppearances;
            expect(appearances.length).toBe(6);
            expect(Math.min(...appearances), tier + " " + speed + " seed " + seed).toBeGreaterThanOrEqual(TINH_TU.minhPerSession);
          }
        }
      }
    }
  });

  it("a Minh shows its meaning on its first appearance only", () => {
    const s = lessonSession(5, "nhap-mon", 294);
    const shown = new Map<number, boolean[]>();
    play(s, idle, (state) => {
      for (const paper of state.papers) {
        if (paper.kind !== "minh") continue;
        const list = shown.get(paper.word) ?? [];
        shown.set(paper.word, list);
        if (list.length < paper.appearance) list.push(paper.showMeaning);
      }
    });
    for (const list of shown.values()) expect(list).toEqual([true, ...list.slice(1).map(() => false)]);
  });

  it("HC5: no two Minh expire within 1.5 s (20 seeds × speeds × tiers, typed and untyped)", () => {
    let expiries = 0;
    for (const tier of TIERS) {
      for (const speed of SPEEDS_X10) {
        for (let seed = 1; seed <= 20; seed += 1) {
          for (const hands of [idle, steadyHands(9)]) {
            const s = lessonSession(seed, tier, speed);
            play(s, hands);
            expiries += s.expiries.filter((expiry) => expiry.kind === "minh").length;
            expect(minhExpiryClashes(s.expiries)).toBe(0);
          }
        }
      }
    }
    expect(expiries).toBeGreaterThan(1000);
  });

  it("the audit counts Minh expiries closer than 1.5 s", () => {
    const at = (tick: number) => ({ tick, serial: tick, kind: "minh" as const, word: 0, grace: false });
    expect(minhExpiryClashes([at(100), at(100 + ticks(1500))])).toBe(0);
    expect(minhExpiryClashes([at(100), at(100 + ticks(1500) - 1)])).toBe(1);
    expect(minhExpiryClashes([at(100), { ...at(101), kind: "thuong" }])).toBe(0);
  });

  it("reading points and live counts: Nhập Môn 3 points, ≤ 3 live; Tham Ngộ 4 points, ≤ 4 live; every live word has its own first letter", () => {
    for (const tier of TIERS) {
      const s = lessonSession(6, tier, 505);
      expect(s.points).toBe(tier === "nhap-mon" ? 3 : 4);
      let most = 0;
      play(s, steadyHands(8), (state) => {
        most = Math.max(most, state.papers.length);
        const firsts = state.papers.map((paper) => paper.text[0]);
        expect(new Set(firsts).size).toBe(firsts.length);
        const points = state.papers.map((paper) => paper.point);
        expect(new Set(points).size).toBe(points.length);
        for (const point of points) expect(point).toBeLessThan(state.points);
      });
      const [low, high] = tier === "nhap-mon" ? TINH_TU.liveNhapMon : TINH_TU.liveThamNgo;
      expect(most).toBeGreaterThanOrEqual(low);
      expect(most).toBeLessThanOrEqual(high);
    }
  });
});

describe("Nhập Môn and Tham Ngộ (canon §16, D40, PB-13)", () => {
  it("Nhập Môn labels every slip; Tham Ngộ leaves about one Tâm ma in three unlabelled", () => {
    let tamMa = 0;
    let unlabelled = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const nhap = lessonSession(seed, "nhap-mon", 505);
      play(nhap, steadyHands(8), (state) => expect(state.papers.every((paper) => paper.labelled)).toBe(true));
      const tham = lessonSession(seed, "tham-ngo", 505);
      play(tham, steadyHands(8), (state) => {
        for (const paper of state.papers) if (!paper.labelled) expect(paper.kind).toBe("tam-ma");
      });
      tamMa += tham.shown.tamMa;
      unlabelled += tham.shown.tamMaUnlabelled;
    }
    expect(tamMa).toBeGreaterThan(60);
    expect(Math.abs(unlabelled * 3 - tamMa)).toBeLessThanOrEqual(3 * 20);
  });

  it("an unlabelled Tâm ma looks exactly like plain Thường; a Thường of another group keeps its mark", () => {
    expect(paperLook({ kind: "tam-ma", labelled: false, otherGroup: false })).toBe("plain");
    expect(paperLook({ kind: "thuong", labelled: true, otherGroup: false })).toBe("plain");
    expect(paperLook({ kind: "thuong", labelled: true, otherGroup: true })).toBe("other");
    expect(paperLook({ kind: "tam-ma", labelled: true, otherGroup: false })).toBe("tamma");
    expect(paperLook({ kind: "minh", labelled: true, otherGroup: false })).toBe("minh");
    const s = lessonSession(7, "tham-ngo", 505);
    play(s, idle, (state) => {
      for (const paper of state.papers) {
        if (paper.kind === "thuong") expect(paper.otherGroup).toBe(paper.group !== s.init.lessonGroup);
        if (paper.kind !== "thuong") expect(paper.otherGroup).toBe(false);
      }
    });
  });

  it("typing a Tâm ma is a wrong choice: −3 and listed, never a Minh or Thường", () => {
    let wrong = 0;
    for (let seed = 8; seed <= 12; seed += 1) {
      const s = lessonSession(seed, "nhap-mon", 505);
      play(s, steadyHands(5, true));
      wrong += s.wrong;
      expect(summarize(s).wrongWords.length).toBe(s.wrong);
      for (const text of summarize(s).wrongWords) expect(s.kinds[s.texts.indexOf(text)]).toBe("tam-ma");
      expect(currentResult(s).score).toBe(sessionScore(s.result!.completed, s.minhDone, s.thuongDone, s.wrong));
    }
    expect(wrong).toBeGreaterThan(0);
  });
});

describe("lock grace (canon §16; kit typing/session)", () => {
  it("a slip whose life ends while it is being typed stays 1.2 s more, then the next stray key is forgiven", () => {
    const s = lessonSession(9, "nhap-mon", 294);
    while (s.papers.length === 0) stepTinhTu(s);
    const paper = s.papers[0]!;
    stepTinhTu(s, [{ type: "letter", letter: paper.text.charCodeAt(0) - 97 }]);
    expect(lockedPaper(s)).toBe(paper);
    while (s.tick < paper.expires) stepTinhTu(s);
    const grace = ticks(TINH_TU.lockGraceMs);
    drainEvents(s);
    while (s.papers.includes(paper)) stepTinhTu(s);
    const expire = drainEvents(s).find((event) => event.type === "expire" && event.serial === paper.serial);
    expect(expire).toMatchObject({ grace: true, tick: paper.expires + grace });
    // A letter that starts no live slip.
    const firsts = new Set(s.papers.map((item) => item.text.charCodeAt(0) - 97));
    const stray = [...Array(26).keys()].find((letter) => !firsts.has(letter))!;
    stepTinhTu(s, [{ type: "letter", letter: stray }]);
    const key = drainEvents(s).find((event) => event.type === "key");
    expect(key).toMatchObject({ result: KEY.forgiven });
  });
});

describe("determinism", () => {
  it("the same start and the same keys give the same events; another seed differs", () => {
    const run = (seed: number) => JSON.stringify(play(lessonSession(seed, "tham-ngo", 294), steadyHands(6)));
    expect(run(11)).toBe(run(11));
    expect(run(11)).not.toBe(run(12));
  });

  it("every trial lesson runs", () => {
    for (const lesson of TRIAL_LESSONS) {
      const s = lessonSession(13, "nhap-mon", 294, lesson);
      expect(s.minhWords.map((word) => s.texts[word])).toEqual(lesson.words.map((word) => word.text));
      play(s, steadyHands(6));
      expect(s.result!.completed).toBe(true);
    }
  });
});
