// Source: games/space-typing/src/vocabulary.ts (kit copy: baseUrl option, sensitive/mature filter; log fixes in shared/game-kit/DRIFT.md)
import { isAllowedEntry, textHasBlockedWord, type ContentFilterOptions } from "./content-filter";
import type {
  VocabularyEntry,
  VocabularyIndex,
  VocabularyLevel,
} from "./types";

export const DEFAULT_VOCABULARY_BASE_URL = "/vocabulary/";

/** Where shared/vocabulary is served, and which flagged words to drop. */
export type VocabularyLoadOptions = ContentFilterOptions & {
  /** Defaults to "/vocabulary/". */
  baseUrl?: string;
};

/** A file under the vocabulary base URL. */
export function vocabularyUrl(path: string, baseUrl = DEFAULT_VOCABULARY_BASE_URL): string {
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  return base + path.replace(/^\/+/, "");
}

const vocabularyLevelCache = new Map<
  string,
  Promise<VocabularyEntry[]>
>();
const filteredLevelCache = new WeakMap<
  VocabularyEntry[],
  Map<"all" | "child", VocabularyEntry[]>
>();

export type VocabularyTopicEntry = {
  key: string;
  level: number;
};

export type VocabularyTopicMeta = {
  id: string;
  label: string;
  group: string;
  groupLabel?: string;
  levels: string[];
  count: number;
  keys: string[];
  entries?: VocabularyTopicEntry[];
};

export type VocabularyTopicIndex = {
  version: 1;
  totalGroups: number;
  totalTopics: number;
  uniqueVocabularyKeys: number;
  topics: VocabularyTopicMeta[];
};

export type VocabularyPosCategory = {
  id: string;
  tokens: string[];
  entries: VocabularyTopicEntry[];
  missing: string[];
};

export type VocabularyPosIndex = {
  version: 1;
  categories: VocabularyPosCategory[];
};

export type VocabularyGrammarModule = {
  id: string;
  label: string;
  group: string;
  focus: string[];
  topicIds: string[];
  signalTokens: string[];
  signalEntries: VocabularyTopicEntry[];
  missingSignalKeys: string[];
};

export type VocabularyGrammarIndex = {
  version: 1;
  primaryTimeGroups: string[];
  modules: VocabularyGrammarModule[];
};

type VocabularyLookup = {
  version: 1;
  totalEntries: number;
  entries: Record<string, number>;
};

export type LoadedVocabularyTopic = {
  topic: VocabularyTopicMeta;
  entries: VocabularyEntry[];
  levels: number[];
  representativeLevel: number;
};

export type LoadedVocabularyPos = {
  category: VocabularyPosCategory;
  entries: VocabularyEntry[];
  levels: number[];
  representativeLevel: number;
};

export type LoadedVocabularyGrammar = {
  module: VocabularyGrammarModule;
  entries: VocabularyEntry[];
  levels: number[];
  representativeLevel: number;
};

export type LoadedVocabularyKeys = {
  entries: VocabularyEntry[];
  levels: number[];
  representativeLevel: number;
};

export function representativeTopicLevel(
  entries: readonly VocabularyTopicEntry[],
): number {
  const profile = entries
    .map((entry) => entry.level)
    .filter(
      (level) =>
        Number.isInteger(level) &&
        level >= 1 &&
        level <= 100,
    )
    .sort((left, right) => left - right);

  return profile[Math.floor((profile.length - 1) / 2)] ?? 1;
}

function normalizeEnglish(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function isVocabularyEntry(value: unknown): value is VocabularyEntry {
  if (value === null || typeof value !== "object") return false;
  const entry = value as Partial<VocabularyEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.en === "string" &&
    entry.en.trim() !== "" &&
    typeof entry.vi === "string" &&
    typeof entry.ipa === "string"
  );
}

function isVocabularyLevel(value: unknown): value is VocabularyLevel {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const level = value as Partial<VocabularyLevel>;
  return (
    typeof level.level === "number" &&
    Number.isInteger(level.level) &&
    level.level >= 1 &&
    typeof level.label === "string" &&
    level.label.trim() !== "" &&
    typeof level.file === "string" &&
    level.file.trim() !== "" &&
    typeof level.count === "number" &&
    Number.isInteger(level.count) &&
    level.count > 0
  );
}

function isVocabularyReference(value: unknown): value is VocabularyTopicEntry {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const item = value as Partial<VocabularyTopicEntry>;
  return (
    typeof item.key === "string" &&
    item.key.trim() !== "" &&
    typeof item.level === "number" &&
    Number.isInteger(item.level) &&
    item.level >= 1 &&
    item.level <= 100
  );
}

function isVocabularyTopicMeta(value: unknown): value is VocabularyTopicMeta {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const topic = value as Partial<VocabularyTopicMeta>;
  return (
    typeof topic.id === "string" &&
    topic.id.trim() !== "" &&
    typeof topic.label === "string" &&
    topic.label.trim() !== "" &&
    typeof topic.group === "string" &&
    topic.group.trim() !== "" &&
    (topic.groupLabel === undefined ||
      (typeof topic.groupLabel === "string" &&
        topic.groupLabel.trim() !== "")) &&
    Array.isArray(topic.levels) &&
    topic.levels.every((level) => typeof level === "string") &&
    typeof topic.count === "number" &&
    Number.isInteger(topic.count) &&
    topic.count > 0 &&
    Array.isArray(topic.keys) &&
    topic.keys.length === topic.count &&
    topic.keys.every((key) => typeof key === "string" && key.trim() !== "") &&
    (topic.entries === undefined ||
      (Array.isArray(topic.entries) &&
        topic.entries.length === topic.count &&
        topic.entries.every(isVocabularyReference)))
  );
}

function isVocabularyPosCategory(value: unknown): value is VocabularyPosCategory {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const category = value as Partial<VocabularyPosCategory>;
  return (
    typeof category.id === "string" &&
    category.id.trim() !== "" &&
    Array.isArray(category.tokens) &&
    category.tokens.every((token) => typeof token === "string") &&
    Array.isArray(category.entries) &&
    category.entries.every(isVocabularyReference) &&
    Array.isArray(category.missing) &&
    category.missing.every((token) => typeof token === "string")
  );
}

function isVocabularyGrammarModule(
  value: unknown,
): value is VocabularyGrammarModule {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const module = value as Partial<VocabularyGrammarModule>;
  return (
    typeof module.id === "string" &&
    module.id.trim() !== "" &&
    typeof module.label === "string" &&
    module.label.trim() !== "" &&
    typeof module.group === "string" &&
    module.group.trim() !== "" &&
    Array.isArray(module.focus) &&
    module.focus.every((item) => typeof item === "string") &&
    Array.isArray(module.topicIds) &&
    module.topicIds.every((item) => typeof item === "string") &&
    Array.isArray(module.signalTokens) &&
    module.signalTokens.every((item) => typeof item === "string") &&
    Array.isArray(module.signalEntries) &&
    module.signalEntries.every(isVocabularyReference) &&
    Array.isArray(module.missingSignalKeys) &&
    module.missingSignalKeys.every((item) => typeof item === "string")
  );
}

export function parseVocabularyIndex(value: unknown): VocabularyIndex {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Shared vocabulary index is invalid.");
  }

  const raw = value as Partial<VocabularyIndex>;
  if (
    raw.version !== 1 ||
    typeof raw.plannedLevels !== "number" ||
    !Number.isInteger(raw.plannedLevels) ||
    raw.plannedLevels < 1 ||
    typeof raw.availableLevels !== "number" ||
    !Number.isInteger(raw.availableLevels) ||
    raw.availableLevels < 1 ||
    raw.availableLevels > raw.plannedLevels ||
    typeof raw.totalEntries !== "number" ||
    !Number.isInteger(raw.totalEntries) ||
    raw.totalEntries < 1 ||
    !Array.isArray(raw.levels) ||
    raw.levels.length === 0 ||
    !raw.levels.every(isVocabularyLevel)
  ) {
    throw new Error("Shared vocabulary index is invalid.");
  }

  const levels = raw.levels.map((level) => ({ ...level }));
  if (
    new Set(levels.map((level) => level.level)).size !== levels.length ||
    levels.length > raw.availableLevels
  ) {
    throw new Error("Shared vocabulary index is invalid.");
  }

  return {
    version: 1,
    plannedLevels: raw.plannedLevels,
    availableLevels: raw.availableLevels,
    totalEntries: raw.totalEntries,
    levels,
  };
}

export function parseVocabularyTopicIndex(value: unknown): VocabularyTopicIndex {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Shared vocabulary topic index is invalid.");
  }
  const raw = value as Partial<VocabularyTopicIndex>;
  if (
    raw.version !== 1 ||
    typeof raw.totalGroups !== "number" ||
    !Number.isInteger(raw.totalGroups) ||
    raw.totalGroups < 1 ||
    typeof raw.totalTopics !== "number" ||
    !Number.isInteger(raw.totalTopics) ||
    raw.totalTopics < 1 ||
    typeof raw.uniqueVocabularyKeys !== "number" ||
    !Number.isInteger(raw.uniqueVocabularyKeys) ||
    raw.uniqueVocabularyKeys < 1 ||
    !Array.isArray(raw.topics) ||
    raw.topics.length !== raw.totalTopics ||
    !raw.topics.every(isVocabularyTopicMeta)
  ) {
    throw new Error("Shared vocabulary topic index is invalid.");
  }
  if (new Set(raw.topics.map((topic) => topic.id)).size !== raw.topics.length) {
    throw new Error("Shared vocabulary topic index is invalid.");
  }
  return {
    version: 1,
    totalGroups: raw.totalGroups,
    totalTopics: raw.totalTopics,
    uniqueVocabularyKeys: raw.uniqueVocabularyKeys,
    topics: raw.topics.map((topic) => ({
      ...topic,
      levels: [...topic.levels],
      keys: [...topic.keys],
      entries: topic.entries?.map((entry) => ({ ...entry })),
    })),
  };
}

export function parseVocabularyPosIndex(value: unknown): VocabularyPosIndex {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Shared vocabulary word-type index is invalid.");
  }
  const raw = value as Partial<VocabularyPosIndex>;
  if (
    raw.version !== 1 ||
    !Array.isArray(raw.categories) ||
    raw.categories.length === 0 ||
    !raw.categories.every(isVocabularyPosCategory)
  ) {
    throw new Error("Shared vocabulary word-type index is invalid.");
  }
  return {
    version: 1,
    categories: raw.categories.map((category) => ({
      ...category,
      tokens: [...category.tokens],
      entries: category.entries.map((entry) => ({ ...entry })),
      missing: [...category.missing],
    })),
  };
}

export function parseVocabularyGrammarIndex(
  value: unknown,
): VocabularyGrammarIndex {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Shared vocabulary grammar index is invalid.");
  }
  const raw = value as Partial<VocabularyGrammarIndex>;
  if (
    raw.version !== 1 ||
    !Array.isArray(raw.primaryTimeGroups) ||
    !raw.primaryTimeGroups.every((id) => typeof id === "string") ||
    !Array.isArray(raw.modules) ||
    raw.modules.length === 0 ||
    !raw.modules.every(isVocabularyGrammarModule)
  ) {
    throw new Error("Shared vocabulary grammar index is invalid.");
  }
  return {
    version: 1,
    primaryTimeGroups: [...raw.primaryTimeGroups],
    modules: raw.modules.map((module) => ({
      ...module,
      focus: [...module.focus],
      topicIds: [...module.topicIds],
      signalTokens: [...module.signalTokens],
      signalEntries: module.signalEntries.map((entry) => ({ ...entry })),
      missingSignalKeys: [...module.missingSignalKeys],
    })),
  };
}

export async function loadVocabularyIndex(
  options: VocabularyLoadOptions = {},
): Promise<VocabularyIndex> {
  const response = await fetch(vocabularyUrl("index.json", options.baseUrl), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load the shared vocabulary index.");
  }

  return parseVocabularyIndex(await response.json());
}

export async function loadVocabularyTopicIndex(
  options: VocabularyLoadOptions = {},
): Promise<VocabularyTopicIndex> {
  const response = await fetch(vocabularyUrl("topics/index.json", options.baseUrl), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load the shared vocabulary topic index.");
  }
  return parseVocabularyTopicIndex(await response.json());
}

export async function loadVocabularyPosIndex(
  options: VocabularyLoadOptions = {},
): Promise<VocabularyPosIndex> {
  const response = await fetch(vocabularyUrl("parts-of-speech/index.json", options.baseUrl), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load the shared vocabulary word-type index.");
  }
  return parseVocabularyPosIndex(await response.json());
}

export async function loadVocabularyGrammarIndex(
  options: VocabularyLoadOptions = {},
): Promise<VocabularyGrammarIndex> {
  const response = await fetch(vocabularyUrl("grammar/index.json", options.baseUrl), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load the shared vocabulary grammar index.");
  }
  return parseVocabularyGrammarIndex(await response.json());
}

async function loadVocabularyLookup(
  options: VocabularyLoadOptions,
): Promise<VocabularyLookup> {
  const response = await fetch(vocabularyUrl("lookup.json", options.baseUrl), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load the shared vocabulary lookup.");
  }
  const raw = (await response.json()) as Partial<VocabularyLookup>;
  if (
    raw.version !== 1 ||
    typeof raw.totalEntries !== "number" ||
    !Number.isInteger(raw.totalEntries) ||
    raw.totalEntries < 1 ||
    raw.entries === null ||
    typeof raw.entries !== "object" ||
    Array.isArray(raw.entries)
  ) {
    throw new Error("Shared vocabulary lookup is invalid.");
  }
  return raw as VocabularyLookup;
}

export function vocabularyLevelUrl(
  level: VocabularyLevel,
  baseUrl = DEFAULT_VOCABULARY_BASE_URL,
): string {
  return vocabularyUrl(level.file, baseUrl);
}

export function clearVocabularyRuntimeCache(): void {
  vocabularyLevelCache.clear();
}

/** A level's entries with flagged words removed (sensitive always, mature on request). */
export async function loadVocabularyLevel(
  levelNumber: number,
  index: VocabularyIndex,
  options: VocabularyLoadOptions = {},
): Promise<VocabularyEntry[]> {
  const raw = await loadRawVocabularyLevel(levelNumber, index, options);
  // The same filtered list comes back for a cached level, as Space returns its cached array.
  const mode = options.excludeMature === true ? "child" : "all";
  let filtered = filteredLevelCache.get(raw);
  if (filtered === undefined) {
    filtered = new Map();
    filteredLevelCache.set(raw, filtered);
  }
  let entries = filtered.get(mode);
  if (entries === undefined) {
    entries = raw.filter((entry) => isAllowedEntry(entry, options));
    filtered.set(mode, entries);
  }
  return entries;
}

// Every valid entry of a level, cached per URL; filtering happens after.
async function loadRawVocabularyLevel(
  levelNumber: number,
  index: VocabularyIndex,
  options: VocabularyLoadOptions,
): Promise<VocabularyEntry[]> {
  const level = index.levels.find((item) => item.level === levelNumber);
  if (level === undefined) {
    throw new Error("Vocabulary level " + String(levelNumber) + " is unavailable.");
  }

  const url = vocabularyLevelUrl(level, options.baseUrl);
  let pending = vocabularyLevelCache.get(url);
  if (pending === undefined) {
    pending = (async (): Promise<VocabularyEntry[]> => {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(
          "Unable to load vocabulary level " + String(levelNumber) + ".",
        );
      }

      const raw = (await response.json()) as unknown;
      const entries =
        raw !== null &&
        typeof raw === "object" &&
        Array.isArray((raw as { entries?: unknown }).entries)
          ? (raw as { entries: unknown[] }).entries.filter(isVocabularyEntry)
          : [];

      if (entries.length === 0) {
        throw new Error(
          "Vocabulary level " + String(levelNumber) + " has no valid entries.",
        );
      }
      return entries;
    })();
    vocabularyLevelCache.set(url, pending);
  }

  try {
    return await pending;
  } catch (error) {
    if (vocabularyLevelCache.get(url) === pending) {
      vocabularyLevelCache.delete(url);
    }
    throw error;
  }
}

async function topicReferences(
  topic: VocabularyTopicMeta,
  options: VocabularyLoadOptions,
): Promise<VocabularyTopicEntry[]> {
  if (topic.entries !== undefined) return topic.entries;
  const lookup = await loadVocabularyLookup(options);
  return topic.keys.flatMap((key) => {
    const level = lookup.entries[normalizeEnglish(key)];
    return typeof level === "number" && Number.isInteger(level)
      ? [{ key, level }]
      : [];
  });
}

async function loadVocabularyReferences(
  references: readonly VocabularyTopicEntry[],
  keys: readonly string[],
  vocabularyIndex: VocabularyIndex,
  options: VocabularyLoadOptions,
): Promise<{
  entries: VocabularyEntry[];
  levels: number[];
  representativeLevel: number;
  /** Keys found but dropped by the content filter. */
  blocked: number;
}> {
  const uniqueReferences = [
    ...new Map(
      references.map((entry) => [
        normalizeEnglish(entry.key),
        entry,
      ]),
    ).values(),
  ];
  const levels = [
    ...new Set(
      uniqueReferences
        .map((entry) => entry.level)
        .filter(
          (level) =>
            Number.isInteger(level) &&
            level >= 1 &&
            level <= 100,
        ),
    ),
  ].sort((left, right) => left - right);

  if (levels.length === 0) {
    throw new Error("Selected curriculum item has no mapped levels.");
  }

  const documents = await Promise.all(
    levels.map((level) => loadRawVocabularyLevel(level, vocabularyIndex, options)),
  );
  const byKey = new Map<string, VocabularyEntry>();
  for (const entry of documents.flat()) {
    byKey.set(normalizeEnglish(entry.en), entry);
  }

  const entries: VocabularyEntry[] = [];
  const seen = new Set<string>();
  let blocked = 0;
  for (const key of keys) {
    const normalized = normalizeEnglish(key);
    if (seen.has(normalized)) continue;
    const entry = byKey.get(normalized);
    if (entry === undefined) continue;
    seen.add(normalized);
    if (!isAllowedEntry(entry, options)) {
      blocked += 1;
      continue;
    }
    entries.push(entry);
  }

  if (entries.length === 0) {
    throw new Error("Selected curriculum item has no valid entries.");
  }

  return {
    entries,
    levels,
    representativeLevel: representativeTopicLevel(uniqueReferences),
    blocked,
  };
}

function withoutBlocked<T extends { blocked: number }>(loaded: T): Omit<T, "blocked"> {
  const { blocked: _blocked, ...rest } = loaded;
  return rest;
}

export async function loadVocabularyKeys(
  keys: readonly string[],
  vocabularyIndex: VocabularyIndex,
  options: VocabularyLoadOptions = {},
): Promise<LoadedVocabularyKeys> {
  // Blocked words are dropped before the lookup, never reported missing.
  const normalizedKeys = [
    ...new Set(
      keys
        .map(normalizeEnglish)
        .filter((key) => key !== "" && !textHasBlockedWord(key, options)),
    ),
  ];
  if (normalizedKeys.length === 0) {
    throw new Error("Smart Review vocabulary is empty.");
  }

  const lookup = await loadVocabularyLookup(options);
  const references = normalizedKeys.flatMap((key) => {
    const level = lookup.entries[key];
    return typeof level === "number" && Number.isInteger(level)
      ? [{ key, level }]
      : [];
  });

  if (references.length !== normalizedKeys.length) {
    const mapped = new Set(
      references.map((entry) => normalizeEnglish(entry.key)),
    );
    const missing = normalizedKeys.filter((key) => !mapped.has(key));
    throw new Error(
      "Shared vocabulary is missing Smart Review item" +
        (missing.length === 1 ? ": " : "s: ") +
        missing.join(", "),
    );
  }

  const loaded = await loadVocabularyReferences(
    references,
    normalizedKeys,
    vocabularyIndex,
    options,
  );
  if (loaded.entries.length + loaded.blocked !== normalizedKeys.length) {
    throw new Error(
      "Shared vocabulary could not resolve every Smart Review item.",
    );
  }
  return withoutBlocked(loaded);
}

export async function loadVocabularyTopic(
  topicId: string,
  topicIndex: VocabularyTopicIndex,
  vocabularyIndex: VocabularyIndex,
  options: VocabularyLoadOptions = {},
): Promise<LoadedVocabularyTopic> {
  const topic = topicIndex.topics.find((item) => item.id === topicId);
  if (topic === undefined) {
    throw new Error("Vocabulary topic " + topicId + " is unavailable.");
  }

  const references = await topicReferences(topic, options);
  const loaded = withoutBlocked(await loadVocabularyReferences(
    references,
    topic.keys,
    vocabularyIndex,
    options,
  ));

  return {
    topic: {
      ...topic,
      levels: [...topic.levels],
      keys: [...topic.keys],
      entries: topic.entries?.map((entry) => ({ ...entry })),
    },
    ...loaded,
  };
}

export async function loadVocabularyPosCategory(
  posId: string,
  posIndex: VocabularyPosIndex,
  vocabularyIndex: VocabularyIndex,
  options: VocabularyLoadOptions = {},
): Promise<LoadedVocabularyPos> {
  const category = posIndex.categories.find((item) => item.id === posId);
  if (category === undefined) {
    throw new Error("Vocabulary word type " + posId + " is unavailable.");
  }

  const loaded = withoutBlocked(await loadVocabularyReferences(
    category.entries,
    category.entries.map((entry) => entry.key),
    vocabularyIndex,
    options,
  ));
  return {
    category: {
      ...category,
      tokens: [...category.tokens],
      entries: category.entries.map((entry) => ({ ...entry })),
      missing: [...category.missing],
    },
    ...loaded,
  };
}

export async function loadVocabularyGrammarModule(
  grammarId: string,
  grammarIndex: VocabularyGrammarIndex,
  topicIndex: VocabularyTopicIndex,
  vocabularyIndex: VocabularyIndex,
  options: VocabularyLoadOptions = {},
): Promise<LoadedVocabularyGrammar> {
  const module = grammarIndex.modules.find((item) => item.id === grammarId);
  if (module === undefined) {
    throw new Error("Vocabulary grammar module " + grammarId + " is unavailable.");
  }

  const references: VocabularyTopicEntry[] = [...module.signalEntries];
  const keys = module.signalEntries.map((entry) => entry.key);

  for (const topicId of module.topicIds) {
    const topic = topicIndex.topics.find((item) => item.id === topicId);
    if (topic === undefined) continue;
    references.push(...(await topicReferences(topic, options)));
    keys.push(...topic.keys);
  }

  const loaded = withoutBlocked(await loadVocabularyReferences(
    references,
    keys,
    vocabularyIndex,
    options,
  ));
  return {
    module: {
      ...module,
      focus: [...module.focus],
      topicIds: [...module.topicIds],
      signalTokens: [...module.signalTokens],
      signalEntries: module.signalEntries.map((entry) => ({ ...entry })),
      missingSignalKeys: [...module.missingSignalKeys],
    },
    ...loaded,
  };
}

/** The player's own rows; flagged words are dropped like shared ones. */
export function parseCustomVocabulary(
  text: string,
  options: ContentFilterOptions = {},
): VocabularyEntry[] {
  const entries: VocabularyEntry[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;

    const parts = line.split(/\s*(?:\||=>|→|\t|=)\s*/);
    const en = (parts[0] ?? "").trim();
    const vi = (parts[1] ?? "").trim();
    const ipa = (parts[2] ?? "").trim();
    if (en === "") continue;

    const key = en.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    if (textHasBlockedWord(en, options)) continue;
    seen.add(key);

    entries.push({
      id: "custom-" + String(entries.length + 1),
      en,
      vi,
      ipa,
    });
  }

  return entries;
}
