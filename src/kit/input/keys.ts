// Source: games/space-typing/src/scene3d/keys.ts (kit copy; log fixes in shared/game-kit/DRIFT.md)
/**
 * Reading the keyboard for Campaign 3D's typing, safely with Vietnamese input
 * methods on.
 *
 * Two kinds of Vietnamese input reach the page differently:
 *  - an input method of the OS or the browser (the Windows / macOS Vietnamese
 *    keyboards, Chrome IMEs) composes in the page: its presses arrive as
 *    `isComposing`, `key === "Process"` or keyCode 229. They are skipped, as
 *    the 2D game does (src/main.ts keydown), so a press still composing "â"
 *    from "a a", or the Enter that commits it, does nothing;
 *  - UniKey / EVKey work outside the browser: they swallow the modifier key
 *    (the second "o" of "good", the "s" of "is", the "w" of "how") and send a
 *    Backspace and the accented letter instead ("ô", "í", "ơ"). That key never
 *    reaches the page, so it cannot be read back here; the game can only see
 *    the accented letter and tell the player to switch the input method off.
 */
export type KeyInput = {
  key: string;
  code?: string;
  keyCode?: number;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  repeat?: boolean;
};

/** A press that belongs to an input method's composition (never a typed letter, Enter or Escape). */
export function isComposingKey(event: KeyInput): boolean {
  return event.isComposing === true || event.key === "Process" || event.keyCode === 229;
}

/** The English letter a press types, or null (shortcuts, held keys, input-method presses, anything else). */
export function typedLetter(event: KeyInput): string | null {
  if (event.ctrlKey === true || event.altKey === true || event.metaKey === true) return null;
  if (event.repeat === true || isComposingKey(event)) return null;
  const key = event.key.toLocaleLowerCase("en-US");
  return /^[a-z]$/.test(key) ? key : null;
}

// Latin letters with Vietnamese marks, and đ, in both cases.
const VIETNAMESE_LETTERS = new Set(
  [
    "àáạảãâầấậẩẫăằắặẳẵ",
    "èéẹẻẽêềếệểễ",
    "ìíịỉĩ",
    "òóọỏõôồốộổỗơờớợởỡ",
    "ùúụủũưừứựửữ",
    "ỳýỵỷỹ",
    "đ",
  ]
    .join("")
    .normalize("NFC")
    .split("")
    .flatMap((letter) => [letter, letter.toLocaleUpperCase("vi")]),
);

/**
 * The press shows a Vietnamese input method at work: an accented Vietnamese
 * letter (UniKey / EVKey rewriting what was typed) or an input-method
 * composition. Used to tell the player, never to score.
 */
export function vietnameseInputSign(event: KeyInput): boolean {
  if (isComposingKey(event)) return true;
  const key = event.key.normalize("NFC");
  return key.length === 1 && VIETNAMESE_LETTERS.has(key);
}
