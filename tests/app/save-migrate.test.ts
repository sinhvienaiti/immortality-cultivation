import { describe, expect, it } from "vitest";
import { newSkillProfile, serializeSkill } from "../../src/kit/balance/profile";
import { SAVE } from "../../src/content/rules";
import { defaultValue, encode, loadKey, loadSkill, migrate, saveKey, storageKey, type KeyStore, type SaveV1 } from "../../src/app/storage";
import { loadSettings, saveAfterMatch, saveSettings } from "../../src/app/save";

/** canon §23.1: every save key has a migration and sample files (M0A_PLAN §6.9). */

function memoryStore(initial: Record<string, string> = {}): KeyStore & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
      return true;
    },
  };
}

// ── Sample files, one per key, as v1 writes them ─────────────────────────────

const SAVE_SAMPLE = JSON.stringify({
  v: 1,
  realm: 1,
  tuVi: 140,
  congPhap: [{ id: "kiem-2", tier: 1, points: 30, ngoChieu: null }, { id: "bad" }],
  daoQua: ["tu-nguyen"],
  phapBao: { id: "thanh-phong-kiem", level: 2 },
  mechLevels: { "kiem-thung": 2, "loi-phu-tru": -1 },
  thuLau: 2,
  vanKhi: 55,
  thuHach: 31,
  stars: { "teach-1": 3, "teach-2": 2 },
  wavesPaid: { "teach-1": [1, 2, 3, 4, 5] },
});

const NEWWORDS_SAMPLE = JSON.stringify({
  v: 1,
  entries: [
    { wordId: "river", firstSeenMs: 1_000_000, channel: "learn-ahead" },
    { wordId: "river", firstSeenMs: 1_100_000, channel: "slot4" },
    { wordId: "stone", firstSeenMs: 1_200_000, channel: "tinh-tu" },
    { wordId: "cloud", firstSeenMs: 1_300_000, channel: "chat" },
  ],
});

const SETTINGS_SAMPLE = JSON.stringify({ v: 1, motion: "reduce", textScale: 125, keymap: { shop: "Backslash", sell: "" }, pacing: false, quality: "medium" });

describe("save keys: migrate the v1 samples", () => {
  it("names the four keys of canon §23.1", () => {
    expect(["save", "skill", "newwords", "settings"].map((name) => storageKey(name as "save"))).toEqual([
      "immortality-cultivation.save",
      "immortality-cultivation.skill",
      "immortality-cultivation.newwords",
      "immortality-cultivation.settings",
    ]);
  });

  it(".save: keeps valid fields, drops broken rows", () => {
    const save = migrate("save", SAVE_SAMPLE) as SaveV1;
    expect(save.realm).toBe(1);
    expect(save.congPhap).toEqual([{ id: "kiem-2", tier: 1, points: 30, ngoChieu: null }]);
    expect(save.phapBao).toEqual({ id: "thanh-phong-kiem", level: 2 });
    expect(save.mechLevels).toEqual({ "kiem-thung": 2 });
    expect(save.stars).toEqual({ "teach-1": 3, "teach-2": 2 });
    expect(save.wavesPaid).toEqual({ "teach-1": [1, 2, 3, 4, 5] });
  });

  it(".skill: the kit profile round-trips; broken text and other versions are refused", () => {
    const profile = newSkillProfile("adult", "balanced");
    expect(migrate("skill", serializeSkill(profile))).toEqual(profile);
    expect(migrate("skill", "{not json")).toBeNull();
    expect(migrate("skill", JSON.stringify({ ...profile, version: 99 }))).toBeNull();
  });

  it(".newwords: one entry per word (first meeting), unknown channels dropped", () => {
    expect(migrate("newwords", NEWWORDS_SAMPLE)).toEqual({
      v: 1,
      entries: [
        { wordId: "river", firstSeenMs: 1_000_000, channel: "learn-ahead" },
        { wordId: "stone", firstSeenMs: 1_200_000, channel: "tinh-tu" },
      ],
    });
  });

  it(".newwords: writing drops entries older than 20 minutes", () => {
    const now = 1_200_000 + SAVE.newWordsKeepMs;
    const text = encode("newwords", migrate("newwords", NEWWORDS_SAMPLE)!, now);
    expect(JSON.parse(text)).toEqual({ v: 1, entries: [] });
    expect(JSON.parse(encode("newwords", migrate("newwords", NEWWORDS_SAMPLE)!, now - 1)).entries.map((e: { wordId: string }) => e.wordId)).toEqual(["stone"]);
  });

  it(".settings: valid values kept, empty keymap codes dropped, bad values back to defaults", () => {
    expect(migrate("settings", SETTINGS_SAMPLE)).toEqual({ v: 1, motion: "reduce", textScale: 125, keymap: { shop: "Backslash" }, pacing: false, quality: "medium" });
    expect(migrate("settings", JSON.stringify({ v: 1, motion: "fast", textScale: 110, quality: "ultra" }))).toEqual({ ...defaultValue("settings") });
  });

  it("refuses broken JSON, other versions and wrong shapes", () => {
    for (const name of ["save", "newwords", "settings"] as const) {
      expect(migrate(name, "{")).toBeNull();
      expect(migrate(name, JSON.stringify({ v: 2 }))).toBeNull();
      expect(migrate(name, "[]")).toBeNull();
    }
  });
});

describe("save keys: read, write, backup slot", () => {
  it("reads defaults from an empty store", () => {
    const store = memoryStore();
    expect(loadKey("settings", store)).toEqual({ value: defaultValue("settings"), from: "default" });
    expect(loadKey("newwords", store).value).toEqual({ v: 1, entries: [] });
  });

  it("moves the last good value to the backup slot and falls back to it when the key breaks", () => {
    const store = memoryStore({ [storageKey("settings")]: SETTINGS_SAMPLE });
    expect(saveKey("settings", { ...defaultValue("settings"), textScale: 150 }, 0, store)).toBe(true);
    expect(store.data.get(storageKey("settings") + ".bak")).toBe(SETTINGS_SAMPLE);
    store.data.set(storageKey("settings"), "{broken");
    const loaded = loadKey("settings", store);
    expect(loaded.from).toBe("backup");
    expect(loaded.value.motion).toBe("reduce");
  });

  it("never backs up a broken value", () => {
    const store = memoryStore({ [storageKey("save")]: "{broken" });
    saveKey("save", defaultValue("save"), 0, store);
    expect(store.data.has(storageKey("save") + ".bak")).toBe(false);
  });

  it("saveAfterMatch writes .skill and .newwords; settings round-trip", () => {
    const store = memoryStore();
    const profile = newSkillProfile("adult", "relax");
    const result = saveAfterMatch({ skill: profile, newWords: { v: 1, entries: [{ wordId: "moon", firstSeenMs: 5000, channel: "slot4" }] } }, 6000, store);
    expect(result).toEqual({ skill: true, newwords: true });
    // The settings' audience and preset win over the stored ones (kit parseSkill).
    expect(loadSkill("adult", "relax", store)).toEqual(profile);
    expect(loadSkill("adult", "challenge", store).mode).toBe("challenge");
    expect(loadKey("newwords", store).value.entries).toEqual([{ wordId: "moon", firstSeenMs: 5000, channel: "slot4" }]);
    saveSettings({ ...defaultValue("settings"), pacing: false }, store);
    expect(loadSettings(store).pacing).toBe(false);
  });
});
