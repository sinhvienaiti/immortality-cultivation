// Writes src/tinh-tu/sim/trial-set.ts from the parent repo's shared/vocabulary
// (topics/catalog.json, lookup.json, levels/*.json): the Tĩnh Tu trial's three
// lessons (6 words of one topic each) and every topic word that may become
// Thường or Tâm ma (one group, not polysemous, a–z 3–8, no sensitive or mature
// word). Run from the game root: pnpm exec tsx scripts/tinh-tu/make-trial-set.ts
// Owner: Lane 8.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { textHasBlockedWord } from "../../src/kit/vocab/content-filter";
import { isGroupId, isPolysemous, type GroupId } from "../../src/tinh-tu/sim/topics";

const ROOT = resolve(import.meta.dirname, "..", "..");
const VOCAB = resolve(ROOT, "..", "..", "shared", "vocabulary");
const OUT = join(ROOT, "src", "tinh-tu", "sim", "trial-set.ts");

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

const quote = (value: string) => JSON.stringify(value);

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
  "// (topics/catalog.json, lookup.json, levels/*.json). Do not edit by hand: change the script and run it again.",
  "/**",
  " * The Tĩnh Tu trial's word set (canon §16, M0A_PLAN §6.8.3): three lessons of 6",
  " * words of one topic, and every topic word that may be Thường or Tâm ma (one",
  " * group, not polysemous, a–z 3–8, no sensitive or mature word). Without the",
  " * portal the page pairs it with pretend records (lesson.ts pretendRecords).",
  " * Owner: Lane 8.",
  " */",
  'import type { CatalogWord, LessonDef } from "./lesson";',
  "",
  "export const TRIAL_LESSONS: readonly LessonDef[] = [",
  ...lessonLines,
  "];",
  "",
  "/** " + wordLines.length + " words; per group: " + [...perGroup.entries()].map(([group, count]) => group + " " + count).join(", ") + ". */",
  "export const TRIAL_WORDS: readonly CatalogWord[] = [",
  ...wordLines,
  "];",
  "",
].join("\n");
writeFileSync(OUT, text);
console.log("wrote " + OUT + ": " + LESSONS.length + " lessons, " + wordLines.length + " words");
