// Tĩnh Tu learning events (canon §16, §17, D17, D43, PB-31; HC6, HC7) and the page's sender. Lane 8.
import { describe, expect, it } from "vitest";
import { GAME_ID } from "../../src/content/rules";
import { checkDrafts, khauQuyetDraft, sessionDrafts, type DraftRecord } from "../../src/tinh-tu/sim/learning";
import { summarize } from "../../src/tinh-tu/sim/session";
import { createLearningSender, toLearningEvent } from "../../src/tinh-tu/ui/sender";
import { idle, lessonSession, play, steadyHands } from "./helpers";

const human = { bot: false, session: "page-1" } as const;
const bot = { bot: true, session: "bot-1" } as const;

describe("session drafts (canon §16)", () => {
  it("Minh: review-card with hintUsed every time; Thường: one typing-skill per word per session; Tâm ma: none", () => {
    const s = lessonSession(21, "nhap-mon", 505);
    const events = play(s, steadyHands(5, true));
    const drafts = sessionDrafts(s, events, human);
    const done = events.filter((event) => event.type === "done");
    const minhDone = done.filter((event) => event.type === "done" && event.kind === "minh");
    const thuongFirst = done.filter((event) => event.type === "done" && event.kind === "thuong" && event.first);
    expect(minhDone.length).toBeGreaterThan(6);
    expect(drafts.filter((record) => record.context.source === "minh").length).toBe(minhDone.length);
    expect(drafts.filter((record) => record.context.source === "thuong").length).toBe(thuongFirst.length);
    for (const { draft, context } of drafts) {
      expect(draft.gameId).toBe(GAME_ID);
      expect(draft.channel).toBe("typing");
      expect(draft.entityType).toBe("vocabulary");
      if (context.source === "minh") {
        expect(draft.activityType).toBe("review-card");
        expect(draft.hintUsed).toBe(true);
      } else {
        expect(draft.activityType).toBe("typing-skill");
        expect(draft.hintUsed).toBe(false);
      }
      expect(context.dryRun).toBe(false);
    }
    // Some Minh were typed on an appearance without the meaning: still hintUsed (PB-31).
    expect(drafts.some((record) => record.context.source === "minh" && !record.context.meaningShown && record.draft.hintUsed)).toBe(true);
    // HC6: no event for a Tâm ma, typed or not.
    const tamMa = new Set(s.kinds.flatMap((kind, word) => (kind === "tam-ma" ? [s.deck.ids[word]!] : [])));
    for (const { draft } of drafts) expect(tamMa.has(draft.entityId)).toBe(false);
    const check = checkDrafts(drafts, tamMa);
    expect(check.problems).toEqual([]);
    expect(check.ok).toBe(check.total);
  });

  it("an untyped session makes no drafts", () => {
    const s = lessonSession(22, "tham-ngo", 294);
    expect(sessionDrafts(s, play(s, idle), human)).toEqual([]);
    expect(summarize(s).minh).toBe(0);
  });

  it("a word typed with errors is a wrong spelling event, still hintUsed for Minh", () => {
    const record = khauQuyetDraft({ id: "rain", text: "rain" }, 2, 3456.7, human);
    expect(record.draft).toMatchObject({ activityType: "review-card", hintUsed: true, result: "wrong", errorType: "spelling", responseMs: 3457, expectedAnswer: "rain" });
    expect(khauQuyetDraft({ id: "rain", text: "rain" }, 0, 900, human).draft).not.toHaveProperty("errorType");
  });

  it("bot drafts are dry runs", () => {
    const s = lessonSession(23, "nhap-mon", 505);
    const drafts = sessionDrafts(s, play(s, steadyHands(5)), bot);
    expect(drafts.length).toBeGreaterThan(0);
    for (const { context } of drafts) expect(context).toMatchObject({ bot: true, dryRun: true });
  });
});

describe("checkDrafts (HC7)", () => {
  const ok = khauQuyetDraft({ id: "sun", text: "sun" }, 0, 1000, human);

  it("counts every broken rule and the hard ones", () => {
    const records: DraftRecord[] = [
      ok,
      { draft: { ...ok.draft, hintUsed: false }, context: ok.context },
      { draft: { ...ok.draft, entityId: "dark", expectedAnswer: "dark" }, context: ok.context },
      { draft: ok.draft, context: { ...ok.context, bot: true, dryRun: false } },
      { draft: { ...ok.draft, activityType: "typing-skill", hintUsed: false }, context: { ...ok.context, source: "thuong", meaningShown: false, scored: true } },
      { draft: { ...ok.draft, activityType: "typing-skill", hintUsed: false }, context: { ...ok.context, source: "thuong", meaningShown: false, scored: true } },
    ];
    const check = checkDrafts(records, new Set(["dark"]));
    expect(check.total).toBe(6);
    expect(check.ok).toBe(2);
    expect(check.hard).toEqual({ hintFalseWhileShown: 1, minhOrCardWithoutHint: 1, tamMaEvents: 1, botNotDryRun: 1 });
    expect(check.problems.some((line) => line.includes("more than one scored event"))).toBe(true);
  });
});

describe("page sender (canon §17.2, D43)", () => {
  it("sends a person's draft with occurredAt; refuses and logs a bot or dry-run draft", () => {
    const sent: unknown[] = [];
    const logs: string[] = [];
    const sender = createLearningSender({ sendAttempt: (event) => void sent.push(event) }, (line) => void logs.push(line));
    const record = khauQuyetDraft({ id: "sun", text: "sun" }, 0, 1000, human);
    expect(sender.send(record, Date.UTC(2026, 9, 25, 8))).toBe(true);
    expect(sent[0]).toEqual(toLearningEvent(record.draft, Date.UTC(2026, 9, 25, 8)));
    expect((sent[0] as { occurredAt: string }).occurredAt).toBe("2026-10-25T08:00:00.000Z");
    expect(sender.send(khauQuyetDraft({ id: "sun", text: "sun" }, 0, 1000, bot), 0)).toBe(false);
    expect(sender.send({ draft: record.draft, context: { ...record.context, dryRun: true } }, 0)).toBe(false);
    expect(sent.length).toBe(1);
    expect(sender.sent).toBe(1);
    expect(sender.refused).toBe(2);
    expect(logs.length).toBe(2);
  });
});
