/**
 * Word records for Tĩnh Tu pools (canon §16): from the portal (kit/learning
 * lookup) when the page runs inside it, else the fallback trial records
 * (lesson.ts pretendRecords), which the page labels as guesses.
 * Owner: Lane 8.
 */
import { normalizeLearningEntityId } from "../../kit/learning/events";
import { LOOKUP_MAX_IDS } from "../../kit/learning/contract";
import type { CatalogWord, LessonDef, RecordSource, WordRecord } from "../sim/lesson";
import { pretendRecords } from "../sim/lesson";

/** A word with a record under 40 counts as weak, and due (as in the match's deck). */
const WEAK_MASTERY = 40;

/**
 * Lookup results in the shapes the portal may answer with ({ items }, { records }
 * or a list): mastery 0–100, due when its next review time has passed or it is weak.
 */
export function parseLookup(value: unknown, nowMs: number): Map<string, WordRecord> {
  const out = new Map<string, WordRecord>();
  const object = value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
  let rows: unknown[] = [];
  if (Array.isArray(value)) rows = value;
  else if (object !== null && Array.isArray(object["items"])) rows = object["items"] as unknown[];
  else if (object !== null && object["records"] !== null && typeof object["records"] === "object") {
    rows = Object.entries(object["records"] as Record<string, unknown>).map(([entityId, record]) => ({ entityId, ...(record as object) }));
  }
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = record["entityId"] ?? record["wordKey"];
    if (typeof id !== "string" || id.trim() === "") continue;
    const mastery = typeof record["mastery"] === "number" && Number.isFinite(record["mastery"]) ? Math.max(0, Math.min(100, record["mastery"])) : 0;
    const next = typeof record["nextReviewAt"] === "string" ? Date.parse(record["nextReviewAt"]) : Number.NaN;
    out.set(normalizeLearningEntityId(id), { mastery, due: (Number.isFinite(next) && next <= nowMs) || mastery < WEAK_MASTERY });
  }
  return out;
}

export interface RecordsResult {
  readonly records: Map<string, WordRecord>;
  readonly source: RecordSource;
}

/** What the page needs of kit LearningBridge for records. */
export interface LookupHost {
  readonly embedded: boolean;
  lookup(entityIds: readonly string[]): Promise<unknown>;
}

/** Portal records for the trial words (in batches of 200), or the fallback trial records. */
export async function loadRecords(host: LookupHost, words: readonly CatalogWord[], lessons: readonly LessonDef[], nowMs: number): Promise<RecordsResult> {
  if (!host.embedded) return { records: pretendRecords(words, lessons), source: "trial" };
  try {
    const records = new Map<string, WordRecord>();
    const texts = words.map((word) => word.text);
    for (let from = 0; from < texts.length; from += LOOKUP_MAX_IDS) {
      for (const [id, record] of parseLookup(await host.lookup(texts.slice(from, from + LOOKUP_MAX_IDS)), nowMs)) records.set(id, record);
    }
    return { records, source: "portal" };
  } catch {
    // The portal did not answer in time: the labelled trial records stand in.
    return { records: pretendRecords(words, lessons), source: "trial" };
  }
}
