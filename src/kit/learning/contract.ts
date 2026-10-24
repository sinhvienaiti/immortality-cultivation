// Source: shared/learning/message-contract.mjs + games/space-typing/src/learning/shared.ts (message names; log fixes in shared/game-kit/DRIFT.md)

export const LEARNING_MESSAGE_NAMESPACE = "typing-game:learning:v1";
export const LEARNING_ATTEMPT_MESSAGE = "typing-game:learning:v1:attempt";
export const LEARNING_QUERY_MESSAGE = "typing-game:learning:v1:query";
/** Records for a list of up to 200 entity ids (01-core-combat-learning §6.8); the portal may not answer it yet. */
export const LEARNING_LOOKUP_MESSAGE = "typing-game:learning:v1:lookup";
export const LEARNING_ACK_MESSAGE = "typing-game:learning:v1:ack";
export const LEARNING_QUERY_RESULT_MESSAGE = "typing-game:learning:v1:query-result";
export const LEARNING_ERROR_MESSAGE = "typing-game:learning:v1:error";
export const REVIEW_DATASET_MESSAGE = "typing-game:learning:v1:review-dataset";
export const REVIEW_READY_MESSAGE = "typing-game:learning:v1:review-ready";
export const REVIEW_ERROR_MESSAGE = "typing-game:learning:v1:review-error";
export const ENGLISH_ACTIVITY_DATASET_MESSAGE = "typing-game:english-content:v1:activity-dataset";
/** Portal → game: whether the portal's shared music is playing. */
export const SHARED_MUSIC_MESSAGE = "typing-game:shared-music";
/** Game → portal: speech is playing (the portal ducks its music). */
export const SPEECH_MESSAGE = "typing-game:speech";
/** Game → portal: focus the game's iframe so the first key reaches the game. */
export const REQUEST_FOCUS_MESSAGE = "typing-game:request-focus";

export const PARENT_ORIGIN = "https://typing-game.local";
export const LOOKUP_MAX_IDS = 200;

export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;
const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The game id as the portal registers it (games.json); required everywhere. */
export function assertGameId(gameId: unknown): string {
  if (typeof gameId !== "string" || !GAME_ID_PATTERN.test(gameId)) {
    throw new TypeError("gameId is required (lower-case id from portal games.json)");
  }
  return gameId;
}

export function isLearningMessage(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)["type"] === "string" &&
    ((value as Record<string, unknown>)["type"] as string).startsWith(LEARNING_MESSAGE_NAMESPACE + ":")
  );
}
