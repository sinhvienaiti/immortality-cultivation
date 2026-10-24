// Source: games/space-typing/src/speech.ts (kit copy: narrow SpeechSettings, neutral event name; log fixes in shared/game-kit/DRIFT.md)
import { safeLocalStorage } from "../platform/safe-storage";

/** The only settings pronunciation reads. */
export type SpeechSettings = {
  enabled: boolean;
  /** SpeechSynthesisUtterance rate. */
  rate: number;
  /** 0–1; clamped. */
  volume: number;
};

/** Window event with `detail.active` while a word is being spoken (local SFX may yield to it). */
export const PRONUNCIATION_EVENT = "game-kit:pronunciation";

let speechGeneration = 0;
let speechActive = false;
let speechGate: (play: () => Promise<void>) => Promise<void> = play => play();
let cancelPlayback: (() => void) | null = null;
let pronunciationRequest = 0;
let speechNotice: (text: string) => void = () => {};
const PRONUNCIATION_WATCHDOG_MS = 20_000;
const VOICE_DISCOVERY_TIMEOUT_MS = 1_800;
// Voice lists arrive asynchronously (and may gain cloud voices later). Once
// chosen, keep one explicit voice for this browser/page session, even on stop.
const sessionVoices = new WeakMap<SpeechSynthesis, SpeechSynthesisVoice>();
export const SPEECH_VOICE_KEY = "spaceTypingEnglishVoiceURI";
const discovery = new WeakMap<SpeechSynthesis, { promise: Promise<SpeechSynthesisVoice | null>; cancel(): void; warn(): void }>();
const unavailableNoticed = new WeakSet<SpeechSynthesis>();

export function setSpeechNotice(notice: (text: string) => void): void { speechNotice = notice; }

export function setSpeechGate(gate: (play: () => Promise<void>) => Promise<void>): void {
  speechGate = gate;
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function setSpeechActive(active: boolean): void {
  if (speechActive === active) return;
  speechActive = active;
  // Keep speech state inside the game. Local SFX can yield to vocabulary
  // audio, but neither the game's music nor the portal's shared music should.
  window.dispatchEvent(
    new CustomEvent(PRONUNCIATION_EVENT, {
      detail: { active },
    }),
  );
}

const PREFERRED_ENGLISH_VOICE_NAMES = [
  "google us english",
  "microsoft aria",
  "microsoft jenny",
  "samantha",
  "alex",
] as const;

export function selectEnglishVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  voices.forEach((voice, index) => {
    const lang = voice.lang.toLowerCase();
    if (!lang.startsWith("en")) return;
    const name = voice.name.toLowerCase();
    const preferred = PREFERRED_ENGLISH_VOICE_NAMES.findIndex(
      (candidate) => name.includes(candidate),
    );
    let score = lang == "en-us" ? 100 : 50;
    if (voice.localService) score += 40;
    if (voice.default) score += 5;
    if (preferred >= 0) score += 200 - preferred * 10;
    score -= index / 1000;
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  });
  return best;
}

/**
 * Older Safari/iOS (before 16) has no event target on speechSynthesis; the
 * 50 ms discovery poll covers those browsers, so the listener is optional.
 */
function voicesChangedListener(listener: () => void, add: boolean): void {
  try {
    const target = speechSynthesis as Partial<Pick<SpeechSynthesis, "addEventListener" | "removeEventListener">>;
    if (add && typeof target.addEventListener === "function") speechSynthesis.addEventListener("voiceschanged", listener);
    if (!add && typeof target.removeEventListener === "function") speechSynthesis.removeEventListener("voiceschanged", listener);
  } catch {
    // Discovery still polls.
  }
}

/** Discover outside the microphone output gate. The first list may contain only OS voices. */
export function prepareEnglishVoice(notifyMissing = false): Promise<SpeechSynthesisVoice | null> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve(null);
  const synth = speechSynthesis;
  const pinned = sessionVoices.get(synth);
  if (pinned) return Promise.resolve(pinned);
  const pending = discovery.get(synth);
  if (pending) { if (notifyMissing) pending.warn(); return pending.promise; }
  let shouldNotify = notifyMissing;
  const saved = safeLocalStorage.getItem(SPEECH_VOICE_KEY);
  let cancel = (): void => {};
  const promise = new Promise<SpeechSynthesisVoice | null>(resolve => {
    const started = Date.now();
    let events = 0;
    let done = false;
    let candidateAt: number | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    const finish = (voice: SpeechSynthesisVoice | null, notify = true): void => {
      if (done) return;
      done = true;
      if (poll !== null) clearInterval(poll);
      voicesChangedListener(changed, false);
      if (voice) {
        sessionVoices.set(synth, voice);
        safeLocalStorage.setItem(SPEECH_VOICE_KEY, voice.voiceURI);
      } else if (notify && shouldNotify && !unavailableNoticed.has(synth)) {
        unavailableNoticed.add(synth);
        speechNotice("Thiết bị không có giọng đọc tiếng Anh");
      }
      resolve(voice);
    };
    const check = (): void => {
      let voices: SpeechSynthesisVoice[];
      try { voices = synth.getVoices(); } catch { finish(null); return; }
      const remembered = saved ? voices.find(voice => voice.voiceURI === saved && voice.lang.toLowerCase().startsWith("en")) : undefined;
      if (remembered) { finish(remembered); return; }
      const candidate = selectEnglishVoice(voices);
      if (candidate && candidateAt === null) candidateAt = Date.now();
      if (candidate && !saved && (events >= 2 || Date.now() - candidateAt! >= 300)) { finish(candidate); return; }
      if (Date.now() - started >= VOICE_DISCOVERY_TIMEOUT_MS) finish(candidate);
    };
    function changed(): void { events++; check(); }
    cancel = () => finish(null, false);
    voicesChangedListener(changed, true);
    poll = setInterval(check, 50);
    check(); // Warm the native backend immediately, including startup without a user gesture.
  });
  const state = { promise, cancel, warn: () => { shouldNotify = true; } };
  discovery.set(synth, state);
  void promise.then(() => { if (discovery.get(synth) === state) discovery.delete(synth); });
  return promise;
}

export function speakEnglish(text: string, settings: SpeechSettings): void {
  if (
    !settings.enabled ||
    !("speechSynthesis" in window) ||
    text.trim() === ""
  ) {
    return;
  }

  // A rejected gate means this invocation never owned pronunciation playback.
  // Do not deactivate a newer pronunciation that may already be running.
  const request = ++pronunciationRequest;
  void prepareEnglishVoice(true).then(voice => {
    if (voice === null || request !== pronunciationRequest) return;
    return speechGate(() => request === pronunciationRequest ? playEnglish(text, settings, voice) : Promise.resolve());
  }).catch(() => undefined);
}

function playEnglish(text: string, settings: SpeechSettings, voice: SpeechSynthesisVoice): Promise<void> {
  return new Promise((resolve) => {
    speechGeneration += 1;
    const generation = speechGeneration;

    // Latest pronunciation wins. Fast typing must not build a stale TTS queue.
    // Resolve the previous owner first; because generation has already advanced,
    // its completion callback cannot release the new pronunciation lifecycle.
    cancelPlayback?.();
    try {
      speechSynthesis.cancel();
    } catch {
      // Native speech cancellation is best-effort. Lifecycle cleanup below must
      // remain usable even on browsers with a broken speechSynthesis backend.
    }

    let finished = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      if (watchdog !== null) clearTimeout(watchdog);

      resolve();
      if (generation === speechGeneration) {
        setSpeechActive(false);
        cancelPlayback = null;
      }
    };
    cancelPlayback = finish;

    const unpin = (): void => {
      if (generation !== speechGeneration) return;
      sessionVoices.delete(speechSynthesis);
      safeLocalStorage.removeItem(SPEECH_VOICE_KEY);
    };
    try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = voice.lang;
        utterance.rate = settings.rate;
        utterance.volume = clampVolume(settings.volume);
        utterance.voice = voice;
        utterance.onend = finish;
        utterance.onerror = event => {
          if (event?.error !== "interrupted" && event?.error !== "canceled") unpin();
          finish();
        };
        setSpeechActive(true);
        watchdog = setTimeout(() => {
          if (generation === speechGeneration) {
            try {
              speechSynthesis.cancel();
            } catch {
              // Still release local lifecycle state if native cancel fails.
            }
          }
          finish();
        }, PRONUNCIATION_WATCHDOG_MS);
        speechSynthesis.speak(utterance);
    } catch {
      unpin();
      finish();
    }
  });
}

export function stopSpeech(): void {
  pronunciationRequest++;
  if (typeof speechSynthesis !== "undefined") {
    const pending = discovery.get(speechSynthesis);
    discovery.delete(speechSynthesis);
    pending?.cancel();
  }
  cancelPlayback?.();
  cancelPlayback = null;
  speechGeneration += 1;
  setSpeechActive(false);
  if ("speechSynthesis" in window) {
    try {
      speechSynthesis.cancel();
    } catch {
      // Stop is fail-soft; local lifecycle state has already been released.
    }
  }
}
