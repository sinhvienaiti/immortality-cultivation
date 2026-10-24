// Source: games/space-typing/src/learning/shared.ts (kit copy: gameId is a required parameter; log fixes in shared/game-kit/DRIFT.md)
import type { LearningEntityType, VocabularyEntry } from "../vocab/types";
import {
  ENGLISH_ACTIVITY_DATASET_MESSAGE,
  REQUEST_ID_PATTERN,
  REVIEW_DATASET_MESSAGE,
  assertGameId,
} from "./contract";

export type ReviewGoal = "remember-words" | "spelling" | "mixed";

export type ReviewDataset = {
  version: 1;
  type: typeof REVIEW_DATASET_MESSAGE;
  requestId: string;
  goal: ReviewGoal;
  entityIds: string[];
};

export type EnglishActivity =
  | "vocabulary"
  | "collocation"
  | "phrasal-verb"
  | "chunk"
  | "grammar-challenge"
  | "contextual-usage";

export type EnglishActivityDataset = {
  version: 1;
  type: typeof ENGLISH_ACTIVITY_DATASET_MESSAGE;
  requestId: string;
  gameId: string;
  activity: EnglishActivity;
  items: Array<{
    contentId: string;
    entityType: LearningEntityType;
    entityId: string;
    promptText: string;
    answerText: string;
    meaningVi?: string;
    ipa?: string;
  }>;
};

/** One learning event as shared/learning/core.mjs parses it. */
export type LearningEvent = {
  version: 1;
  entityType: LearningEntityType;
  entityId: string;
  gameId: string;
  activityType: string;
  result: "correct" | "wrong";
  occurredAt: string;
  responseMs?: number;
  hintUsed: boolean;
  replayUsed: boolean;
  userAnswer?: string;
  expectedAnswer?: string;
  errorType?: "spelling" | "missed-word";
};

/** What a recall-style attempt needs to report (Space's RecallAttemptResult fields). */
export type RecallAttempt = {
  entry: VocabularyEntry;
  completed: boolean;
  perfect: boolean;
  hintCount: number;
  replayCount: number;
  responseMs: number;
};

const GOALS = new Set<ReviewGoal>([
  "remember-words",
  "spelling",
  "mixed",
]);
const ENGLISH_ACTIVITIES = new Set<EnglishActivity>([
  "vocabulary",
  "collocation",
  "phrasal-verb",
  "chunk",
  "grammar-challenge",
  "contextual-usage",
]);

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeLearningEntityId(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseReviewDataset(
  value: unknown,
): ReviewDataset | null {
  if (!plainObject(value) || value["type"] !== REVIEW_DATASET_MESSAGE) {
    return null;
  }
  if (value["version"] !== 1) {
    throw new TypeError("review dataset version is invalid");
  }

  const requestId = value["requestId"];
  if (
    typeof requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(requestId)
  ) {
    throw new TypeError("review requestId is invalid");
  }

  const goal = value["goal"];
  if (typeof goal !== "string" || !GOALS.has(goal as ReviewGoal)) {
    throw new TypeError("review goal is invalid");
  }

  const items = value["items"];
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new TypeError("review items must contain 1 to 100 items");
  }

  const entityIds: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!plainObject(item) || item["entityType"] !== "vocabulary") {
      throw new TypeError("review accepts vocabulary only");
    }
    const entityId = item["entityId"];
    if (typeof entityId !== "string") {
      throw new TypeError("review entityId is invalid");
    }
    const normalized = normalizeLearningEntityId(entityId);
    if (normalized === "" || normalized.length > 200) {
      throw new TypeError("review entityId is invalid");
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    entityIds.push(normalized);
  }

  if (entityIds.length === 0) {
    throw new TypeError("review dataset is empty");
  }

  return {
    version: 1,
    type: REVIEW_DATASET_MESSAGE,
    requestId,
    goal: goal as ReviewGoal,
    entityIds,
  };
}

export function parseEnglishActivityDataset(
  value: unknown,
  gameId: string,
): EnglishActivityDataset | null {
  const game = assertGameId(gameId);
  if (!plainObject(value) || value["type"] !== ENGLISH_ACTIVITY_DATASET_MESSAGE) {
    return null;
  }
  if (value["version"] !== 1 || value["gameId"] !== game) {
    throw new TypeError("English activity dataset identity is invalid");
  }
  const requestId = value["requestId"];
  if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) {
    throw new TypeError("English activity requestId is invalid");
  }
  const activity = value["activity"];
  if (
    typeof activity !== "string" ||
    !ENGLISH_ACTIVITIES.has(activity as EnglishActivity)
  ) {
    throw new TypeError("English activity is invalid");
  }
  const items = value["items"];
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new TypeError("English activity items must contain 1 to 100 items");
  }
  const parsed: EnglishActivityDataset["items"] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!plainObject(item)) {
      throw new TypeError("English activity item is invalid");
    }
    const contentId = item["contentId"];
    const entityType = item["entityType"];
    const entityId = item["entityId"];
    const promptText = item["promptText"];
    const answerText = item["answerText"];
    if (
      typeof contentId !== "string" ||
      (entityType !== "vocabulary" &&
        entityType !== "grammar" &&
        entityType !== "sentence") ||
      typeof entityId !== "string" ||
      typeof promptText !== "string" ||
      typeof answerText !== "string"
    ) {
      throw new TypeError("English activity item fields are invalid");
    }
    const cleanContentId = contentId.normalize("NFC").trim();
    const cleanEntityId = entityId.normalize("NFC").trim();
    const cleanPrompt = promptText.normalize("NFC").trim().replace(/\s+/g, " ");
    const cleanAnswer = answerText.normalize("NFC").trim().replace(/\s+/g, " ");
    if (
      cleanContentId === "" ||
      cleanEntityId === "" ||
      cleanPrompt === "" ||
      cleanAnswer === "" ||
      cleanAnswer.length > 240
    ) {
      throw new TypeError("English activity item text is invalid");
    }
    if (activity === "grammar-challenge") {
      if (entityType !== "grammar" || !cleanEntityId.startsWith("gr.")) {
        throw new TypeError("grammar challenge requires a stable gr.* entity");
      }
    } else if (entityType === "grammar") {
      throw new TypeError("grammar entity is reserved for grammar-challenge");
    }
    if (seen.has(cleanContentId)) {
      throw new TypeError("English activity contentId is duplicated");
    }
    seen.add(cleanContentId);
    parsed.push({
      contentId: cleanContentId,
      entityType,
      entityId: cleanEntityId,
      promptText: cleanPrompt,
      answerText: cleanAnswer,
      ...(typeof item["meaningVi"] === "string" && item["meaningVi"].trim() !== ""
        ? { meaningVi: item["meaningVi"].normalize("NFC").trim() }
        : {}),
      ...(typeof item["ipa"] === "string" && item["ipa"].trim() !== ""
        ? { ipa: item["ipa"].normalize("NFC").trim() }
        : {}),
    });
  }
  return {
    version: 1,
    type: ENGLISH_ACTIVITY_DATASET_MESSAGE,
    requestId,
    gameId: game,
    activity: activity as EnglishActivity,
    items: parsed,
  };
}

export function englishActivityEntries(
  dataset: EnglishActivityDataset,
): VocabularyEntry[] {
  return dataset.items.map((item) => ({
    id: "english-content:" + item.contentId,
    en: item.answerText,
    vi: item.meaningVi ?? item.promptText,
    ipa: item.ipa ?? "",
    learning: {
      entityType: item.entityType,
      entityId: item.entityId,
      activityType: dataset.activity,
    },
  }));
}

export function buildCombatLearningEvent(options: {
  gameId: string;
  entry: VocabularyEntry;
  perfect: boolean;
  inputSource?: "typing" | "voice";
  occurredAt?: string;
}): LearningEvent {
  const gameId = assertGameId(options.gameId);
  const voice = options.inputSource === "voice";
  const correct = voice || options.perfect;
  const learning = options.entry.learning;
  return {
    version: 1,
    entityType: learning?.entityType ?? "vocabulary",
    entityId: learning?.entityId ?? normalizeLearningEntityId(options.entry.en),
    gameId,
    activityType: voice ? "speaking" : learning?.activityType ?? "typing",
    result: correct ? "correct" : "wrong",
    occurredAt: options.occurredAt ?? new Date().toISOString(),
    hintUsed: false,
    replayUsed: false,
    expectedAnswer: options.entry.en,
    ...(correct ? {} : { errorType: "spelling" as const }),
  };
}

export function buildRecallLearningEvent(options: {
  gameId: string;
  result: RecallAttempt;
  occurredAt?: string;
  inputSource?: "typing" | "voice";
}): LearningEvent {
  const gameId = assertGameId(options.gameId);
  const { result } = options;
  const voice = options.inputSource === "voice";
  const correct = result.completed && (voice || result.perfect);
  const learning = result.entry.learning;
  return {
    version: 1,
    entityType: learning?.entityType ?? "vocabulary",
    entityId: learning?.entityId ?? normalizeLearningEntityId(result.entry.en),
    gameId,
    activityType: voice ? "speaking-recall" : learning?.activityType ?? "recall",
    result: correct ? "correct" : "wrong",
    occurredAt: options.occurredAt ?? new Date().toISOString(),
    responseMs: Math.max(0, Math.round(result.responseMs)),
    hintUsed: result.hintCount > 0,
    replayUsed: result.replayCount > 0,
    expectedAnswer: result.entry.en,
    ...(correct
      ? {}
      : {
          errorType: result.completed
            ? ("spelling" as const)
            : ("missed-word" as const),
        }),
  };
}
