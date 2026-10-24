// Kit module typing/: TD's typing core (feat/td-1a6 src/td/typing) with its constants as a TypingConfig and the RNG passed in.
export { TD_TYPING, compileTyping, typingConfig, type BudgetRules, type GradeRules, type LetterRules, type LifeRules, type RouterRules, type ScoreRules, type StreamRules, type TypingConfig, type TypingRules } from "./config";
export { availableLetters, bandWords, compileDeck, firstLetterOf, gloss, wordIndex, wordText, type Deck, type DeckEntry } from "./decks";
export { withinOneEdit } from "./distance";
export { Letters, type LiveWords } from "./letters";
export { createBag, pickWord, type Bag, type PickRng } from "./picker";
export { KEY, createRouter, routeBackspace, routeKey, routeUnlock, type KeyResult, type Router, type TypedWords } from "./router";
export { allowedErrors, expectedTicks, gradeWord, lifeSeconds, lifeTicks, rawWpm, scoreWord, typeSeconds, type Grade, type GradeInput, type Score } from "./scorer";
export { BASELINE, expectedSpeed, lengthBand, median, paceFactor, typingCapacity, updateBaseline, type BaselineRules, type SpeedBand } from "./tempo";
export { BudgetLedger, POOL, letterBudget, streamCap, type BudgetSource, type LetterBudget, type Pool } from "./budget";
export {
  WordSlots, addWord, createSession, dealWord, dropWord, lockNext, shieldLeft, shieldLock, typeBackspace, typeLetter, unlock, wordTiming,
  type KeyOutcome, type TypingSession, type TypingStats, type WordTiming,
} from "./session";
