// Writes src/content/data/trial-set.ts, the game's one labelled fallback word
// set (canon §25), from the parent repo's shared/vocabulary (levels/*.json,
// topics/catalog.json, lookup.json): the match deck's fallback (the first 48
// deck words of level 001 as a cold start's base words and the first 16 of
// level 002 as new words, for app/learning.ts), the Tĩnh Tu trial's three
// lessons (6 words of one topic each) and every topic word that may become
// Thường or Tâm ma (one group, not polysemous, a–z 3–8, no sensitive or mature
// word). Run from the game root: pnpm exec tsx scripts/tinh-tu/make-trial-set.ts
// Owner: Lane 8 (the match-deck part serves Lane 3).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { textHasBlockedWord } from "../../src/kit/vocab/content-filter";
import { isGroupId, isPolysemous, type GroupId } from "../../src/tinh-tu/sim/topics";

const ROOT = resolve(import.meta.dirname, "..", "..");
const VOCAB = resolve(ROOT, "..", "..", "shared", "vocabulary");
const OUT = join(ROOT, "src", "content", "data", "trial-set.ts");
/** Match deck fallback: base words from level 001, new words from level 002 (canon §17.1 cold start). */
const DECK_LEVELS = [
  { level: 1, count: 48 },
  { level: 2, count: 16 },
] as const;

/** The Kiếm school's three công pháp (canon §15.6: ô 2, ô 4, ô 5) and their lesson topics (this round's choice). */
const LESSONS = [
  { id: "nhat-tuyen", slot: 2, name: "Nhất Tuyến Xuyên Vân", topic: "nature.weather" },
  { id: "lac-kiem", slot: 4, name: "Lạc Kiếm Trận", topic: "food.cooking" },
  { id: "thien-ha", slot: 5, name: "Thiên Hà Kiếm Vũ", topic: "people.emotions" },
] as const;

type CatalogEntry = { key: string; level: number; priority: "core" | "support" };
type Catalog = { version: 1; groups: { id: string; label: string; topics: { id: string; label: string; entries: CatalogEntry[] }[] }[] };
type LevelEntry = { id: string; en: string; vi: string; ipa: string };

if (!existsSync(VOCAB)) throw new Error("shared/vocabulary not found at " + VOCAB + " (run inside the parent repo)");
const catalog = JSON.parse(readFileSync(join(VOCAB, "topics", "catalog.json"), "utf8")) as Catalog;
const lookup = (JSON.parse(readFileSync(join(VOCAB, "lookup.json"), "utf8")) as { entries: Record<string, number> }).entries;
const levels = new Map<number, Map<string, LevelEntry>>();
function entry(key: string): LevelEntry | null {
  const level = lookup[key];
  if (level === undefined) return null;
  let words = levels.get(level);
  if (words === undefined) {
    const file = JSON.parse(readFileSync(join(VOCAB, "levels", String(level).padStart(3, "0") + ".json"), "utf8")) as { entries: LevelEntry[] };
    words = new Map(file.entries.map((row) => [row.en, row]));
    levels.set(level, words);
  }
  return words.get(key) ?? null;
}

const DECK_TEXT = /^[a-z]{3,8}$/;
const usable = (key: string) => DECK_TEXT.test(key) && !textHasBlockedWord(key, { excludeMature: true });

const quote = (value: string) => JSON.stringify(value);

// Match deck fallback rows, in the level files' order.
const deckLines: string[] = [];
for (const { level, count } of DECK_LEVELS) {
  const file = JSON.parse(readFileSync(join(VOCAB, "levels", String(level).padStart(3, "0") + ".json"), "utf8")) as { entries: LevelEntry[] };
  const rows = file.entries.filter((row) => usable(row.en)).slice(0, count);
  if (rows.length < count) throw new Error("level " + level + " has fewer than " + count + " deck words");
  for (const row of rows) deckLines.push("  [" + quote(row.en) + ", " + quote(row.vi) + ", " + quote(row.ipa) + ", " + level + "],");
}

// Groups and first topic of every key.
const groupsOf = new Map<string, Set<string>>();
const topicOf = new Map<string, string>();
for (const group of catalog.groups) {
  if (!isGroupId(group.id)) throw new Error("unknown group " + group.id);
  for (const topic of group.topics) {
    for (const row of topic.entries) {
      if (!groupsOf.has(row.key)) groupsOf.set(row.key, new Set());
      groupsOf.get(row.key)!.add(group.id);
      if (!topicOf.has(row.key)) topicOf.set(row.key, topic.id);
    }
  }
}

const lessonLines: string[] = [];
const lessonTexts = new Set<string>();
for (const lesson of LESSONS) {
  const group = catalog.groups.find((item) => item.topics.some((topic) => topic.id === lesson.topic));
  const topic = group?.topics.find((item) => item.id === lesson.topic);
  if (group === undefined || topic === undefined) throw new Error("no topic " + lesson.topic);
  // Core words first; one word per first letter while possible, so the lesson's words can be live together.
  const ranked = [...topic.entries.filter((row) => row.priority === "core"), ...topic.entries.filter((row) => row.priority !== "core")].filter((row) => usable(row.key) && entry(row.key) !== null);
  const picked: CatalogEntry[] = [];
  const letters = new Set<string>();
  for (const row of ranked) if (picked.length < 6 && !letters.has(row.key[0]!)) (picked.push(row), letters.add(row.key[0]!));
  for (const row of ranked) if (picked.length < 6 && !picked.includes(row)) picked.push(row);
  if (picked.length < 6) throw new Error(lesson.topic + " has fewer than 6 usable words");
  const words = picked.map((row) => {
    const found = entry(row.key)!;
    lessonTexts.add(row.key);
    return "      { text: " + quote(row.key) + ", level: " + lookup[row.key] + ", vi: " + quote(found.vi) + ", ipa: " + quote(found.ipa) + " },";
  });
  lessonLines.push(
    "  {",
    "    id: " + quote(lesson.id) + ",",
    "    slot: " + lesson.slot + ",",
    "    name: " + quote(lesson.name) + ",",
    "    topic: " + quote(lesson.topic) + ",",
    "    topicLabel: " + quote(topic.label) + ",",
    "    group: " + quote(group.id) + ",",
    "    words: [",
    ...words,
    "    ],",
    "  },",
  );
}

const wordLines: string[] = [];
const perGroup = new Map<string, number>();
for (const [key, groups] of [...groupsOf.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
  if (lessonTexts.has(key) || groups.size !== 1 || !usable(key)) continue;
  const found = entry(key);
  const group = [...groups][0]! as GroupId;
  if (found === null || isPolysemous(found.vi)) continue;
  perGroup.set(group, (perGroup.get(group) ?? 0) + 1);
  wordLines.push(
    "  { text: " + quote(key) + ", group: " + quote(group) + ", topic: " + quote(topicOf.get(key)!) + ", level: " + lookup[key] + ", vi: " + quote(found.vi) + ", ipa: " + quote(found.ipa) + " },",
  );
}

const text = [
  "// Generated by scripts/tinh-tu/make-trial-set.ts from the parent repo's shared/vocabulary",
  "// (levels/*.json, topics/catalog.json, lookup.json). Do not edit by hand: change the script and run it again.",
  "/**",
  " * Bộ thử dự phòng (canon §25): the game's one labelled fallback word set, used",
  " * only when the shared vocabulary or the portal is missing. Every screen that",
  " * uses it says so (TRIAL_SET_LABEL, or the Tĩnh Tu page's own line); it is",
  " * never sent as learning data. Pure data.",
  " * - Match deck (app/learning.ts, canon §17.1): the first 48 deck words of",
  " *   level 001 (a cold start's base words) and the first 16 of level 002 (new",
  " *   words), a–z of 3–8 letters, no flagged word; meanings and IPA as in the source.",
  " * - Tĩnh Tu trial (canon §16, M0A_PLAN §6.8.3): three lessons of 6 words of one",
  " *   topic, and every topic word that may be Thường or Tâm ma (one group, not",
  " *   polysemous, a–z 3–8, no sensitive or mature word); without the portal the",
  " *   page pairs it with pretend records (tinh-tu/sim/lesson.ts pretendRecords).",
  " * Owner: Lane 8's generator; the match-deck part serves Lane 3.",
  " */",
  'import type { CatalogWord, LessonDef } from "../../tinh-tu/sim/lesson";',
  "",
  "/** Shown wherever the fallback set is in use (results, debug), so nobody takes it for the real deck. */",
  'export const TRIAL_SET_LABEL = "Bộ thử dự phòng: không tải được kho từ chung";',
  "",
  "// ── Match deck fallback (canon §17.1) ─────────────────────────────────────────",
  "",
  "export interface TrialWord {",
  "  readonly en: string;",
  "  readonly vi: string;",
  "  readonly ipa: string;",
  "  /** Vocabulary level of the source list. */",
  "  readonly level: number;",
  "}",
  "",
  "const DECK_ROWS: readonly (readonly [en: string, vi: string, ipa: string, level: number])[] = [",
  ...deckLines,
  "];",
  "",
  "export const TRIAL_DECK_WORDS: readonly TrialWord[] = DECK_ROWS.map(([en, vi, ipa, level]) => ({ en, vi, ipa, level }));",
  "",
  "// ── Tĩnh Tu trial (canon §16) ─────────────────────────────────────────────────",
  "",
  "export const TRIAL_LESSONS: readonly LessonDef[] = [",
  ...lessonLines,
  "];",
  "",
  "/** " + wordLines.length + " words; per group: " + [...perGroup.entries()].map(([group, count]) => group + " " + count).join(", ") + ". */",
  "export const TRIAL_TOPIC_WORDS: readonly CatalogWord[] = [",
  ...wordLines,
  "];",
  "",
].join("\n");
writeFileSync(OUT, text);
console.log("wrote " + OUT + ": " + deckLines.length + " deck words, " + LESSONS.length + " lessons, " + wordLines.length + " topic words");
