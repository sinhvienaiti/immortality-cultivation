// Keyboard reading (IME-safe) and typed-text helpers.
export { isComposingKey, typedLetter, vietnameseInputSign, type KeyInput } from "./keys";
export {
  accuracyPercent,
  chooseTarget,
  clamp,
  multiplierForStreak,
  normalizeWord,
  splitDisplayByTypedLetters,
  stageWordsPerMinute,
  typingText,
  type TypingTarget,
} from "./text";
