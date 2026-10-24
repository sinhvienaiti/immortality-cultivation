// Source: games/space-typing/src/types.ts (vocabulary and learning shapes only; log fixes in shared/game-kit/DRIFT.md)

export type LearningEntityType = "vocabulary" | "grammar" | "sentence";

export type LearningMetadata = {
  entityType: LearningEntityType;
  entityId: string;
  activityType: string;
};

/** Content flags a vocabulary entry may carry (00-canon D15). */
export type VocabularyFlag = "sensitive" | "mature";

export type VocabularyEntry = {
  id: string;
  en: string;
  vi: string;
  ipa: string;
  learning?: LearningMetadata;
  /** Profanity, slurs, sexual words: never shown in a game. */
  sensitive?: boolean;
  /** Violence and drugs: hidden from child profiles. */
  mature?: boolean;
  /** Same flags as a list, for a data shape that groups them. */
  flags?: readonly string[];
};

export type VocabularyLevel = {
  level: number;
  label: string;
  file: string;
  count: number;
};

export type VocabularyIndex = {
  version: number;
  plannedLevels: number;
  availableLevels: number;
  totalEntries: number;
  levels: VocabularyLevel[];
};
