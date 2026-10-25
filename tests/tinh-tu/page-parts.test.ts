// The Tĩnh Tu page's pure parts: speed (canon §16 E_eff, D18), portal records, glosses. Lane 8.
import { describe, expect, it } from "vitest";
import { effectiveE } from "../../src/kit/balance/pace";
import { TRIAL_LESSONS, TRIAL_TOPIC_WORDS as TRIAL_WORDS } from "../../src/content/data/trial-set";
import { loadRecords, parseLookup } from "../../src/tinh-tu/ui/records";
import { SPEED_CHOICES, UNKNOWN_WPM, choiceSpeed, eEffX10, flagSpeed } from "../../src/tinh-tu/ui/speed";

describe("speed", () => {
  it("?wpm= first; 'chưa biết' is 25 WPM, never an unspoken 35 (D18)", () => {
    expect(flagSpeed(new URLSearchParams("wpm=42"))).toMatchObject({ wpm: 42, source: "flag" });
    expect(flagSpeed(new URLSearchParams("wpm=abc"))).toBeNull();
    expect(flagSpeed(new URLSearchParams(""))).toBeNull();
    expect(SPEED_CHOICES[0]).toBe(0);
    expect(choiceSpeed(0).wpm).toBe(UNKNOWN_WPM);
    expect(UNKNOWN_WPM).not.toBe(35);
  });

  it("lives use E_eff of the profile (× 10, at least 1 WPM)", () => {
    const speed = choiceSpeed(35);
    expect(eEffX10(speed)).toBe(Math.round(effectiveE({ e: 35, a: 0.95, cv: 0.25 }) * 10));
    expect(eEffX10(speed)).toBeLessThan(350);
    expect(eEffX10({ wpm: 0.1, a: 0.5, cv: 1, source: "flag" })).toBe(10);
  });
});

describe("records", () => {
  it("reads the portal's lookup shapes: mastery 0–100; due when the review time passed or the word is weak", () => {
    const now = Date.UTC(2026, 9, 25);
    const past = new Date(now - 1000).toISOString();
    const future = new Date(now + 86_400_000).toISOString();
    const items = parseLookup({ items: [{ entityId: "Rain", mastery: 82, nextReviewAt: future }, { entityId: "sun", mastery: 82, nextReviewAt: past }, { entityId: "dry", mastery: 20 }] }, now);
    expect(items.get("rain")).toEqual({ mastery: 82, due: false });
    expect(items.get("sun")).toEqual({ mastery: 82, due: true });
    expect(items.get("dry")).toEqual({ mastery: 20, due: true });
    const records = parseLookup({ records: { hot: { mastery: 140 } } }, now);
    expect(records.get("hot")).toEqual({ mastery: 100, due: false });
    expect(parseLookup([{ wordKey: "cook", mastery: 75 }], now).get("cook")).toEqual({ mastery: 75, due: false });
    expect(parseLookup(null, now).size).toBe(0);
  });

  it("outside the portal (or when it fails) the labelled trial records stand in", async () => {
    const offline = await loadRecords({ embedded: false, lookup: async () => ({}) }, TRIAL_WORDS, TRIAL_LESSONS, 0);
    expect(offline.source).toBe("trial");
    expect(offline.records.size).toBe(TRIAL_WORDS.length);
    const failing = await loadRecords({ embedded: true, lookup: async () => Promise.reject(new Error("timeout")) }, TRIAL_WORDS, TRIAL_LESSONS, 0);
    expect(failing.source).toBe("trial");
    const asked: number[] = [];
    const portal = await loadRecords(
      { embedded: true, lookup: async (ids) => (asked.push(ids.length), { items: ids.map((id) => ({ entityId: id, mastery: 50 })) }) },
      TRIAL_WORDS,
      TRIAL_LESSONS,
      0,
    );
    expect(portal.source).toBe("portal");
    expect(portal.records.size).toBe(TRIAL_WORDS.length);
    expect(asked.every((count) => count <= 200)).toBe(true);
  });
});
