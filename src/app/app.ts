/**
 * The game page (M0A_PLAN §6.9): speed card → prep → the match (world,
 * `local`, frame loop, key router, every presenter) → Thu Hoạch, and again.
 *
 * Match loading (canon §6.4, §17.1, §23.2): the profile (`.skill`, `?wpm=` or
 * the speed card), the new-word ledger (`.newwords`), the learning records
 * (Lane 3's loadDeckSource: the portal's lookup, or a cold start, or the
 * labelled fallback set); the deck by buildDeck; the ledger's `remaining` as
 * `newWordAllowance`; the replay header (with the Chớp floor `flashEX1000`)
 * before tick 0. `word-first-seen` → the ledger's take(wordId, Date.now(),
 * channel) → `.newwords` saved (app/learning.ts onLedgerChange).
 *
 * Each frame (Rồng LANES "Integration"): drain the events → learning.onEvents
 * → the app's flow (pace-update after wave 1, Thẻ Ôn, finish) → every
 * presenter's onEvents → every presenter's frame (the camera is fixed, so it
 * is placed before any DOM projection) → draw. Commands enter the world at
 * once (match.ts), so a hit-stop slows the world, never the keys.
 * The sim stands still while a learning panel is open (the break clock with
 * it), in the pause menu, under the focus veil, on the speed card and in the
 * 3-2-1 after a pause in a live phase.
 *
 * URL flags: ?q=low|medium|high, ?seed=, ?preset=, ?wpm=, ?motion=,
 * ?prelearn=0, ?review=0, ?speech=0, ?guard=ward|dash, ?tam=kiem-tam|tich-kiem,
 * ?speed=N (dev builds only; rules unchanged), ?debug=1 → window.__ic.
 * Owner: step 0 / integration (LANES.md).
 */
import { Vector3 } from "three";
import { createSoundHooks, type SoundHooks } from "../audio/hooks";
import { BEASTS, GENERALS } from "../content/data/beasts";
import { BOSSES } from "../content/data/boss";
import { CONSUMABLE_DEFS } from "../content/data/consumables";
import { SHOP_ITEMS } from "../content/data/economy";
import { ELITE_TRAITS } from "../content/data/elites";
import { MECHANISM_DEFS } from "../content/data/mechanisms";
import { SCHOOL_KIEM, TAM_PHAP } from "../content/data/school-kiem";
import { THANH_THACH_AI } from "../content/data/stage-m0a";
import { TELEGRAPHS } from "../content/data/telegraphs";
import { AUDIO, DEFAULT_TIER, GAME_ID, NEW_WORDS, PRESETS, RULES, SIM, TT_BUDGETS, contentHash, type KeyAction } from "../content/rules";
import type {
  BeastRef,
  DeckWord,
  GuardChoice,
  Loadout,
  LocalState,
  PointU,
  Preset,
  Quality,
  Replay,
  ReplayHeader,
  SeatProfile,
  SimCommand,
  SimEvent,
  StageDef,
  TamPhapId,
  World,
  WordRecord,
} from "../content/types";
import { createRng } from "../kit/platform/rng";
import { setSpeechNotice, speakEnglish } from "../kit/speech/speech";
import { playerPos } from "../local/index";
import { uToM } from "../sim/fixed";
import { hashLocal, hashWorld, hex32 } from "../sim/hash";
import { paceFor } from "../sim/pace";
import { isBanQuyetLive } from "../sim/words";
import { buildDeck } from "../typing/deck";
import { createNewWordLedger, type NewWordLedger } from "../typing/new-word-ledger";
import { createBanQuyet, type BanQuyetPresenter } from "../ui/ban-quyet";
import { createHud, type HudPresenter } from "../ui/hud";
import { createImeBanner } from "../ui/ime-banner";
import { createLearnAhead, type LearnAheadPanel } from "../ui/learn-ahead";
import { createLearningFrame, type LearningFramePresenter } from "../ui/learning-frame";
import { createMenu, type MenuSettings } from "../ui/menu";
import { createResults, type Outcome, type ResultsPresenter } from "../ui/results";
import { createReviewCard, type ReviewCardPanel } from "../ui/review-card";
import { quyetBand, viewInsets } from "../ui/screen-zones";
import { createShopMode, type ShopModePresenter } from "../ui/shop-mode";
import { createShopStrip } from "../ui/shop-strip";
import { applySkin, el, watchMotion } from "../ui/skin";
import { createWaveCard } from "../ui/wave-card";
import type { Renderer3D } from "../view/renderer";
import { createRenderer } from "../view/renderer";
import { createGreyBoxView, type GreyBoxView } from "../view/stage";
import type { FrameInfo, Presenter } from "./contracts";
import { foeSizes, frameReport, mean, percentile, pushCapped, type FoeSize, type FrameReport } from "./debug";
import { createInputRouter, type InputRouter, type KeyPanel, type PointerPick } from "./input-router";
import { createLearning, learnAheadWords, loadDeckSource, type DeckSource, type GlossOf, type LearningSession, type ReviewQuestion } from "./learning";
import { createLoop, type LoopTiming } from "./loop";
import { createMatchRunner, replayCheck, type MatchRunner, type ReplayCheck } from "./match";
import { showPaceCard, type PaceCardChoice } from "./pace-card";
import { loadSettings, saveNewWords, saveSettings } from "./save";
import { loadKey, loadSkill, type KeyStore, type SettingsV1 } from "./storage";
import { PaceMeter, finishMatch, flashFloorFor, paceUpdateAfterWave1, readPaceMemory, startingProfile } from "./typing-pace";

// ── Match loading (canon §6.4, §17.1, §23.2) ────────────────────────────────

/** Everything a match needs from outside the sim. */
export interface MatchRequest {
  readonly seed: number;
  readonly stage: StageDef;
  readonly preset: Preset;
  /** Settings "Nhịp tự điều" (pace director on). */
  readonly pacing: boolean;
  readonly loadout: Loadout;
  /** From `.skill`, the speed card or `?wpm=` (D18): e WPM, a and cv in permille. */
  readonly profile: SeatProfile;
  /** Learning records of the deck's candidates; empty = cold start (every M0a match, canon §25). */
  readonly records: readonly WordRecord[];
  /** Vocabulary level of the profile (cold start takes base words one level below). */
  readonly level: number;
  /** Words due for review in the learning core (> 80: at most 4 new words). */
  readonly dueCount: number;
  /** Wall clock at load (the ledger's sliding window). */
  readonly nowMs: number;
  /** The Chớp floor (canon §6.5; typing-pace.ts flashFloorFor); left out of the header when absent. */
  readonly flashEX1000?: number;
}

/** The lane functions match loading uses; tests and bots pass their own. */
export interface MatchDeps {
  readonly ledger: () => NewWordLedger;
  readonly buildDeck: typeof buildDeck;
  readonly kPm: (profile: SeatProfile) => number;
  readonly rulesHash: (stage: StageDef) => string;
}

export interface LoadedMatch {
  readonly header: ReplayHeader;
  /** The ledger to `take` new words into during the match, then save. */
  readonly ledger: NewWordLedger;
}

/** canon §6.4: the match may bring `remaining` new words, at most 4 when more than 80 words are due. */
export function newWordAllowance(remaining: number, dueCount: number): number {
  const left = Math.max(0, Math.floor(remaining));
  return dueCount > NEW_WORDS.manyDue ? Math.min(left, NEW_WORDS.manyDueCap) : left;
}

/**
 * Hash of every rule and data table a replay depends on: rules.ts, the stage
 * (with its waves) and each data file. A replay whose hash differs was made
 * under other rules.
 */
export function matchRulesHash(stage: StageDef): string {
  return contentHash([RULES, stage, BEASTS, GENERALS, ELITE_TRAITS, BOSSES, TELEGRAPHS, SCHOOL_KIEM, TAM_PHAP, MECHANISM_DEFS, CONSUMABLE_DEFS, SHOP_ITEMS]);
}

/** canon §23.2 header, field order fixed (it is hashed by the replay tools). */
export function createReplayHeader(request: MatchRequest, deck: readonly DeckWord[], allowance: number, kPm: number, rulesHash: string): ReplayHeader {
  const profile = { e: request.profile.e, a: request.profile.a, cv: request.profile.cv };
  return {
    v: 1,
    gameId: GAME_ID,
    rulesHash,
    seed: request.seed >>> 0,
    stageId: request.stage.id,
    preset: request.preset,
    pacing: request.pacing,
    seats: [request.flashEX1000 === undefined ? { seat: 0, profile, kPm } : { seat: 0, profile, kPm, flashEX1000: request.flashEX1000 }],
    deck: deck.map((word) => ({ wordId: word.wordId, text: word.text, group: word.group, mastery: word.mastery, recalls: word.recalls, assumed: word.assumed })),
    newWordAllowance: allowance,
    loadout: { guard: request.loadout.guard, tamPhap: request.loadout.tamPhap },
  };
}

export function defaultMatchDeps(store?: KeyStore): MatchDeps {
  return {
    ledger: () => createNewWordLedger(loadKey("newwords", store).value),
    buildDeck,
    kPm: (profile) => paceFor(profile).kPm,
    rulesHash: matchRulesHash,
  };
}

/** The deck draws from its own stream of the match seed, so it never shifts the world's streams. */
const DECK_SEED_SALT = 0x5eed_dec0;

/** Reads the ledger once, builds the deck, and writes the header before tick 0 (M0A_PLAN §6.9). */
export function loadMatch(request: MatchRequest, deps: MatchDeps = defaultMatchDeps()): LoadedMatch {
  const ledger = deps.ledger();
  const allowance = newWordAllowance(ledger.remaining(request.nowMs), request.dueCount);
  const rng = createRng((request.seed ^ DECK_SEED_SALT) >>> 0);
  const deck = deps.buildDeck(request.records, request.level, allowance, rng.words);
  const header = createReplayHeader(request, deck, allowance, deps.kPm(request.profile), deps.rulesHash(request.stage));
  return { header, ledger };
}

// ── Options (URL flags) and the default tier ────────────────────────────────

export interface AppOptions {
  /** ?q=: the tier; else the settings' one; else by GPU (canon §20.1). */
  readonly quality?: Exclude<Quality, "ultra">;
  readonly seed?: number;
  readonly preset?: Preset;
  /** ?prelearn=0: no Học trước before the first prep. */
  readonly prelearn?: boolean;
  /** ?review=0: no Thẻ Ôn in the breaks (canon §17: optional). */
  readonly review?: boolean;
  /** ?speech=0: no pronunciation (browser TTS of the word in learning panels). */
  readonly speech?: boolean;
  readonly guard?: GuardChoice;
  readonly tamPhap?: TamPhapId;
  /** Dev builds only: world time × speed (rules unchanged; scenarios play a stage faster). */
  readonly speed?: number;
  /** ?debug=1: window.__ic. */
  readonly debug?: boolean;
}

const TIERS: readonly Exclude<Quality, "ultra">[] = ["low", "medium", "high"];
const PRESET_IDS: readonly Preset[] = ["relax", "balanced", "challenge", "learn"];
const GUARDS: readonly GuardChoice[] = ["ward", "dash"];
const TAM_PHAPS: readonly TamPhapId[] = ["kiem-tam", "tich-kiem"];

/** The URL's flags (`?wpm=` and `?motion=` are read where they are used: typing-pace.ts, ui/skin.ts). */
export function optionsFromUrl(search: string, dev: boolean): AppOptions {
  const params = new URLSearchParams(search);
  const pick = <T extends string>(name: string, list: readonly T[]): T | undefined => {
    const value = params.get(name);
    return list.find((item) => item === value);
  };
  const number = (name: string): number | undefined => {
    const raw = params.get(name);
    if (raw === null || raw.trim() === "") return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const seed = number("seed");
  const speed = number("speed");
  return {
    quality: pick("q", TIERS),
    seed: seed === undefined || seed < 0 ? undefined : Math.floor(seed) >>> 0,
    preset: pick("preset", PRESET_IDS),
    prelearn: params.get("prelearn") !== "0",
    review: params.get("review") !== "0",
    speech: params.get("speech") !== "0",
    guard: pick("guard", GUARDS),
    tamPhap: pick("tam", TAM_PHAPS),
    speed: dev && speed !== undefined && speed > 0 ? Math.min(16, Math.max(0.25, speed)) : undefined,
    debug: params.get("debug") === "1",
  };
}

/** canon §20.1 first-run tier: High on a discrete GPU, Medium on Apple, Low otherwise (software renderers included). */
export function tierForGpu(gpu: string): Exclude<Quality, "ultra"> {
  const name = gpu.toLowerCase();
  if (name.includes("apple")) return DEFAULT_TIER.apple;
  if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(name)) return DEFAULT_TIER.other;
  if (/nvidia|geforce|quadro|rtx|gtx|radeon\s*(\(tm\)\s*)?(rx|pro)|arc\(tm\)\s*a|intel\(r\) arc|arc a\d/.test(name)) return DEFAULT_TIER.discrete;
  return DEFAULT_TIER.other;
}

/**
 * canon §20.1: after the first 10 s of play, frames over budget only suggest a lower tier. Over budget here
 * (đề xuất của vòng này, chờ chủ dự án xác nhận; the page cannot turn vsync off): the CPU part of a frame
 * over the tier's cpuP95Us, or the frame interval's p95 over 1.5 × its median (frames dropped regularly).
 */
export function overBudget(quality: Quality, intervalsMs: readonly number[], cpuMs: readonly number[]): boolean {
  if (intervalsMs.length < 60) return false;
  const p95 = percentile(intervalsMs, 0.95);
  const median = percentile(intervalsMs, 0.5);
  return percentile(cpuMs, 0.95) > TT_BUDGETS[quality].cpuP95Us / 1000 || p95 > 1.5 * median;
}

// ── The page ────────────────────────────────────────────────────────────────

/** Countdown after a pause in a live phase (canon §4.1 "3-2-1"). */
export const COUNTDOWN_MS = 3000;
/** Thẻ Ôn opens this long after a wave ends (UI timing, not a rule): a word typed through the wave's end never answers it. */
export const REVIEW_DELAY_MS = 800;
/** Left-click pick radius around a beast's drawn centre, CSS px. */
const PICK_PX = 44;
/** Vocabulary level of a profile with no level yet: A1 (base words from it, canon §17.1). */
const VOCAB_LEVEL = 1;
const AUDIENCE = "adult" as const;
const SEAT = 0;
/** Phases the Bàn Quyết is live in (canon §6.1, D42): a pause there ends with a 3-2-1. */
const LIVE_PHASES: ReadonlySet<string> = new Set(["warning", "wave", "lull", "boss"]);
const STYLE_ID = "ic-app-style";
const CSS = `
.ic-boot { position: absolute; left: 50%; top: 42%; translate: -50% -50%; padding: calc(14px * var(--ui, 1)) calc(20px * var(--ui, 1)); font-size: calc(17px * var(--ui, 1)); font-weight: 700; z-index: 40; }
.ic-veil { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(8, 10, 14, 0.55); pointer-events: auto; z-index: 65; }
.ic-veil.is-soft { background: rgba(8, 10, 14, 0.2); pointer-events: none; }
.ic-veil__text { padding: calc(12px * var(--ui, 1)) calc(20px * var(--ui, 1)); font-size: calc(20px * var(--ui, 1) * var(--ic-text-scale, 1)); font-weight: 800; }
.ic-countdown { position: absolute; left: 50%; top: 40%; translate: -50% -50%; z-index: 66; pointer-events: none; font-size: calc(110px * var(--ui, 1)); font-weight: 800; color: #F2EBDD; text-shadow: 0 2px 0 #1b1d24, 0 0 18px rgba(14, 18, 24, 0.8); }
.ic-quyet.is-hushed .ic-bq__word { visibility: hidden; }
`;

function installStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.append(style);
}

export interface App {
  dispose(): void;
}

/** What the debug handle reports about a match's events (scenarios). */
interface Tally {
  readonly types: Record<string, number>;
  /** Telegraph charge (strike tick − start tick) by def: count and shortest, ms. */
  readonly telegraphs: Record<string, { n: number; minMs: number; shape: string }>;
  readonly casts: Record<string, number>;
  /** Frames the hit stop slowed the world. */
  slowFrames: number;
}

/** One match and everything that reads it; rebuilt on "chơi lại". */
interface Match {
  readonly runner: MatchRunner;
  readonly profile: SeatProfile;
  /** "Chưa biết" on the card: pace-update after wave 1 (canon §6.5, D41). */
  readonly unknown: boolean;
  readonly ledger: NewWordLedger;
  readonly learning: LearningSession;
  /** The whole match's word timings (`.skill` after it) and wave 1's (pace-update). */
  readonly meter: PaceMeter;
  readonly wave1: PaceMeter;
  readonly scene: GreyBoxView;
  readonly banQuyet: BanQuyetPresenter;
  readonly frame: LearningFramePresenter;
  readonly hud: HudPresenter;
  readonly shopMode: ShopModePresenter;
  readonly learnAhead: LearnAheadPanel;
  readonly review: ReviewCardPanel;
  readonly results: ResultsPresenter;
  readonly sound: SoundHooks;
  /** Scene first (stage, beasts, player, telegraphs, effects, motes), then sound and the DOM. */
  readonly presenters: readonly Presenter[];
  readonly ui: readonly Presenter[];
  readonly tally: Tally;
  outcome: Outcome | null;
  paceSent: boolean;
  /** `.skill` took this match (enough words, kit updateSkill). */
  measured: boolean | null;
  /** The last Thẻ Ôn's questions (scenarios answer by keyboard). */
  questions: readonly ReviewQuestion[];
  /** Thẻ Ôn of this wave opens at this page time (−1: none waiting). */
  reviewAt: number;
  reviewWave: number;
}

declare global {
  interface Window {
    /** Scenario handle (dev builds, or ?debug=1). */
    __ic?: IcHandle;
  }
}

/** `window.__ic` (M0A_PLAN §6.9; Lane 7's scenarios). Reads, except send, action, setSpeed and restart. */
export interface IcHandle {
  /** A match runs (after the deck and the speed are known). */
  readonly ready: boolean;
  state(): Record<string, unknown>;
  /** A command into the world as if a panel or key made it (logged in the replay). */
  send(command: SimCommand): boolean;
  /** A command key's action as if pressed (router order). */
  action(name: KeyAction): boolean;
  /** Rebuilds the match from its replay and compares hashWorld and hashLocal (ic-replay). */
  replayCheck(): ReplayCheck | null;
  /** The replay (canon §23.2): header, body, tail (B9 export). */
  replay(): Replay | null;
  hash(): { world: string; local: string } | null;
  /** Drawn sizes of every live beast and the player (ic-scale). */
  foeSizes(): FoeSize[];
  /** Field landmarks and every live beast projected as drawn (ic-camera-frame). */
  frame(): FrameReport | null;
  /** The Bàn Quyết as drawn (ic-words): live, cells, and each cell's box. */
  words(): Record<string, unknown> | null;
  /** The last Thẻ Ôn's questions in order (text, kind, the right choice): scenarios answer by keyboard. */
  review(): readonly { readonly text: string; readonly kind: string; readonly answer: number }[];
  events(): Record<string, unknown>;
  perf(): Record<string, unknown>;
  world(): World | null;
  local(): LocalState | null;
  setSpeed(speed: number): void;
  restart(): void;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

export function startApp(doc: Document = document, given?: AppOptions): App {
  const view = doc.defaultView;
  if (!view) throw new Error("app: the document has no window");
  const dev = import.meta.env.DEV;
  const search = view.location.search;
  const options = given ?? optionsFromUrl(search, dev);
  const stage = THANH_THACH_AI;
  const preset: Preset = options.preset ?? "balanced";
  let settings: SettingsV1 = loadSettings();
  let speed = options.speed ?? 1;

  // ── Skin, renderer, persistent DOM ──
  applySkin(doc, settings.textScale);
  installStyle(doc);
  const motion = watchMotion(view, settings.motion);
  const reduced = (): boolean => motion.reduced;
  const canvasHost = doc.getElementById("ic-canvas");
  const overlay = doc.getElementById("ic-overlay");
  const quyetHost = doc.getElementById("ic-quyet");
  if (!canvasHost || !overlay || !quyetHost) throw new Error("app: #ic-canvas, #ic-overlay or #ic-quyet missing from index.html");
  overlay.replaceChildren();
  quyetHost.replaceChildren();

  const asked = options.quality ?? settings.quality ?? null;
  const renderer: Renderer3D = createRenderer(canvasHost, asked ?? "low");
  const quality: Quality = asked ?? tierForGpu(renderer.info().gpu);
  if (quality !== renderer.quality) renderer.setQuality(quality);
  const applyInsets = (): void => renderer.setViewInsets(viewInsets(view.innerWidth, view.innerHeight, settings.textScale));
  applyInsets();
  view.addEventListener("resize", applyInsets);

  const boot = el(doc, "div", "ic-panel ic-boot", "Tu Tiên Thủ Ải · " + stage.name + " · đang nạp từ…");
  const veil = el(doc, "div", "ic-veil");
  const veilText = el(doc, "div", "ic-panel ic-veil__text");
  veil.append(veilText);
  veil.hidden = true;
  const countdownNode = el(doc, "div", "ic-countdown");
  countdownNode.hidden = true;
  overlay.append(boot, veil, countdownNode);
  const ime = createImeBanner(overlay);

  // Pronunciation (Học trước, Thẻ Ôn "nghe rồi gõ", listen buttons): the browser's English voice, never a game sound.
  const speak = (text: string): void => speakEnglish(text, { enabled: options.speech !== false, rate: 0.9, volume: 1 });
  setSpeechNotice((text) => match?.hud.notify(text, "soft"));

  // ── State ──
  let source: DeckSource | null = null;
  let gloss: GlossOf = () => null;
  let match: Match | null = null;
  let disposed = false;
  let paceOpen = false;
  /** Focus veil: "focus" stops the sim; "soft" is the first-load hint. */
  let veilMode: "none" | "focus" | "soft" = "none";
  let countdownUntil = 0;
  let qualityHint = "";
  let playMs = 0;
  let lastFrameAt = 0;
  let frames = 0;
  let keysToSim = 0;
  const intervals: number[] = [];
  const cpu: number[] = [];
  const keyLatency: number[] = [];
  const castLatency: number[] = [];
  const pendingKeys: number[] = [];
  const pendingCasts: number[] = [];
  let lastFinish: Record<string, unknown> | null = null;

  const world = (): World | null => match?.runner.world ?? null;
  const finished = (): boolean => match === null || match.runner.finished;
  const liveNow = (): boolean => {
    const w = world();
    return w !== null && !finished() && LIVE_PHASES.has(w.phase);
  };

  // ── Commands: into the world at once, logged with their tick (match.ts) ──
  const send = (command: SimCommand): void => {
    const m = match;
    if (!m) return;
    const castBefore = command.type === "key" ? (m.runner.world.casts.lastAction[SEAT] ?? -1) : 0;
    if (!m.runner.send(command)) return;
    if (command.type !== "key") return;
    keysToSim += 1;
    const at = router.stats.lastLetterAt > 0 ? router.stats.lastLetterAt : view.performance.now();
    pendingKeys.push(at);
    // This key's last letter made a Cast: the stroke leaving the Bàn Quyết is drawn next frame (canon §20.2).
    if ((m.runner.world.casts.lastAction[SEAT] ?? -1) !== castBefore) pendingCasts.push(at);
  };

  // ── Pointer: ground point and beast under the cursor ──
  const ray = { near: new Vector3(), dir: new Vector3() };
  const mouse = { x: 0, y: 0, in: false };
  const groundAt = (clientX: number, clientY: number): PointU | null => {
    const rect = renderer.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const camera = renderer.camera;
    ray.near.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, 0.5).unproject(camera);
    ray.dir.copy(ray.near).sub(camera.position).normalize();
    if (ray.dir.y >= -1e-6) return null;
    const t = -camera.position.y / ray.dir.y;
    const xM = camera.position.x + ray.dir.x * t;
    const zM = camera.position.z + ray.dir.z * t;
    const field = stage.field;
    if (xM * 1000 < field.minXMm || xM * 1000 > field.maxXMm || zM * 1000 < field.minZMm || zM * 1000 > field.maxZMm) return null;
    return { x: Math.round(xM * SIM.uPerM) + 0, z: Math.round(zM * SIM.uPerM) + 0 };
  };
  const pickPoint = { x: 0, y: 0, z: 0 };
  const pickScreen = { x: 0, y: 0, visible: false };
  const beastAtScreen = (clientX: number, clientY: number): BeastRef | null => {
    const m = match;
    if (!m) return null;
    const rect = renderer.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    let best: BeastRef | null = null;
    let bestD = PICK_PX * PICK_PX;
    for (const beast of m.runner.world.beasts.list) {
      if (!beast.alive || !m.scene.actors.locate(beast.slot, beast.serial, "center", pickPoint)) continue;
      renderer.project(pickPoint.x, pickPoint.y, pickPoint.z, pickScreen);
      if (!pickScreen.visible) continue;
      const d = (pickScreen.x - px) * (pickScreen.x - px) + (pickScreen.y - py) * (pickScreen.y - py);
      if (d < bestD) {
        bestD = d;
        best = { slot: beast.slot, serial: beast.serial };
      }
    }
    return best;
  };
  const pick = (event: MouseEvent): PointerPick => ({ ground: groundAt(event.clientX, event.clientY), beast: event.button === 0 ? beastAtScreen(event.clientX, event.clientY) : null });
  const onMouseMove = (event: MouseEvent): void => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.in = true;
  };
  const onMouseLeave = (): void => {
    mouse.in = false;
  };
  canvasHost.addEventListener("mousemove", onMouseMove);
  canvasHost.addEventListener("mouseleave", onMouseLeave);

  // ── Panels and the key router (canon §5.1) ──
  const menu = createMenu(overlay, {
    settings: (): MenuSettings => ({ motion: settings.motion, textScale: settings.textScale, keymap: settings.keymap }),
    onSettings: (patch) => changeSettings(patch),
    onContinue: () => startCountdownIfLive(),
    onPace: () => paceFromMenu(),
    onRetreat: () => retreat(),
  });

  const activePanel = (): KeyPanel | null => {
    if (menu.isOpen) return menu;
    const m = match;
    if (!m) return null;
    if (m.learnAhead.isOpen) return m.learnAhead;
    if (m.review.isOpen) return m.review;
    if (m.results.isOpen) return m.results;
    return null;
  };

  /** A press while the veil is up lifts it; the focus veil uses the press up (and a live phase gets its 3-2-1). */
  const liftVeil = (): boolean => {
    if (veilMode === "none") return false;
    const was = veilMode;
    veilMode = "none";
    veil.hidden = true;
    if (was === "soft") return false;
    startCountdownIfLive();
    return true;
  };

  const intercept = (event: KeyboardEvent): boolean => {
    // The speed card listens on its own (pace-card.ts); nothing types or acts under it.
    if (paceOpen) return true;
    if (menu.isOpen && menu.model.remapping) {
      menu.bindKey(event.code);
      return true;
    }
    if (veilMode !== "none" && liftVeil()) return true;
    return countdownUntil > view.performance.now();
  };

  const makeRouter = (): InputRouter =>
    createInputRouter(
      view,
      { command: send, local: (input) => match?.runner.input(input) },
      {
        seat: SEAT,
        keymap: settings.keymap,
        intercept,
        panel: activePanel,
        shop: () => match?.shopMode ?? null,
        canShop: () => {
          const w = world();
          return w !== null && !finished() && (w.phase === "prep" || w.phase === "break");
        },
        banQuyetLive: () => {
          const w = world();
          return w !== null && !finished() && isBanQuyetLive(w, SEAT);
        },
        locked: () => (world()?.words.seats[SEAT]?.locked ?? -1) >= 0,
        origin: () => (match ? playerPos(match.runner.local) : { x: 0, z: 0 }),
        aim: () => (mouse.in ? groundAt(mouse.x, mouse.y) : null),
        enterCommand: () => {
          const w = world();
          if (w === null || finished()) return null;
          if (w.phase === "prep") return { type: "start" };
          if (w.phase === "break" && PRESETS[w.preset].breakMs === "enter") return { type: "continue" };
          return null;
        },
        fallback: (action) => {
          if (action !== "escape" || finished() || match?.results.isOpen) return false;
          match?.shopMode.close();
          menu.open();
          return true;
        },
        onImeSign: () => ime.show(),
        pointer: { element: canvasHost, pick },
      },
    );
  // Created before any speed card: its listener runs first, so a card's keys never reach the match.
  let router = makeRouter();

  // ── Settings (menu → `.settings`) ──
  function changeSettings(patch: Partial<MenuSettings>): void {
    settings = { ...settings, ...patch };
    saveSettings(settings);
    if (patch.textScale !== undefined) {
      applySkin(doc, settings.textScale);
      applyInsets();
    }
    if (patch.motion !== undefined) motion.set(settings.motion);
    if (patch.keymap !== undefined) {
      router.dispose();
      router = makeRouter();
    }
  }

  // ── Pause, focus, 3-2-1 ──
  function startCountdownIfLive(): void {
    if (liveNow()) countdownUntil = view!.performance.now() + COUNTDOWN_MS;
  }
  const pausedNow = (now: number): boolean => {
    const m = match;
    if (!m) return true;
    return menu.isOpen || paceOpen || veilMode === "focus" || countdownUntil > now || m.learnAhead.isOpen || m.review.isOpen || m.results.isOpen;
  };
  const onBlur = (): void => {
    if (!match || finished()) return;
    veilMode = "focus";
    veilText.textContent = "Bấm hoặc gõ phím bất kỳ để chơi tiếp";
    veil.classList.remove("is-soft");
    veil.hidden = false;
    countdownUntil = 0;
    // Now, not at the next frame: no tick slips in.
    loop.setPaused(true);
    match.learning.flush();
  };
  const onVisibility = (): void => {
    if (doc.visibilityState === "hidden") onBlur();
  };
  const onPageHide = (): void => match?.learning.flush();
  const onPointerDown = (): void => {
    view.focus();
    liftVeil();
  };
  view.addEventListener("blur", onBlur);
  doc.addEventListener("visibilitychange", onVisibility);
  view.addEventListener("pagehide", onPageHide);
  view.addEventListener("pointerdown", onPointerDown, { capture: true });

  // ── A match ──
  function newMatch(choice: PaceCardChoice): void {
    if (disposed || source === null) return;
    disposeMatch();
    const loadout: Loadout = { guard: options.guard ?? "ward", tamPhap: options.tamPhap ?? "kiem-tam" };
    const loaded = loadMatch({
      seed: options.seed ?? randomSeed(),
      stage,
      preset,
      pacing: settings.pacing,
      loadout,
      profile: choice.profile,
      records: source.records,
      level: VOCAB_LEVEL,
      dueCount: source.dueCount,
      nowMs: Date.now(),
      flashEX1000: flashFloorFor(choice.profile, readPaceMemory()),
    });
    const runner = createMatchRunner(loaded.header, stage);
    const ledger = loaded.ledger;
    const learning = createLearning({ dryRun: false, ledger, now: () => Date.now(), gloss, onLedgerChange: (taken) => saveNewWords(taken.snapshot()) });
    let hudRef: HudPresenter | null = null;
    const scene = createGreyBoxView(renderer, { stage, seat: SEAT, reduced, overlay: overlay!, moteTarget: () => hudRef?.linhSaAnchor() ?? null });
    const highlight = (index: number): void => scene.stage.highlightSlot(index);
    const banQuyet = createBanQuyet(quyetHost!, SEAT);
    const frame = createLearningFrame(overlay!, { gloss, speak, seat: SEAT });
    const hud = createHud(overlay!, SEAT);
    hudRef = hud;
    const waveCard = createWaveCard(overlay!, { stage, project: renderer.project });
    const shopMode = createShopMode(overlay!, send, SEAT, { onCursor: highlight });
    const shopStrip = createShopStrip(overlay!, send, SEAT, { mode: shopMode, onCursor: highlight });
    const learnAhead = createLearnAhead(overlay!, send, SEAT, { learning, gloss, speak });
    const review = createReviewCard(overlay!, send, SEAT, { learning, speak });
    const results = createResults(overlay!, { seat: SEAT, learning: () => ({ words: learning.matchWords(), book: learning.wordBook() }), speak, onAgain: () => again() });
    const sound = createSoundHooks({ seat: SEAT, voices: quality === "low" ? AUDIO.voicesLow : AUDIO.voices });
    const ui: Presenter[] = [sound, banQuyet, frame, hud, waveCard, shopStrip, shopMode, learnAhead, review, results];
    match = {
      runner,
      profile: choice.profile,
      unknown: choice.unknown,
      ledger,
      learning,
      meter: new PaceMeter(),
      wave1: new PaceMeter(),
      scene,
      banQuyet,
      frame,
      hud,
      shopMode,
      learnAhead,
      review,
      results,
      sound,
      presenters: [...scene.presenters, ...ui],
      ui,
      tally: { types: {}, telegraphs: {}, casts: {}, slowFrames: 0 },
      outcome: null,
      paceSent: false,
      measured: null,
      questions: [],
      reviewAt: -1,
      reviewWave: 0,
    };
    countdownUntil = 0;
    playMs = 0;
    // Học trước (canon §17): this match's new words, before the prep's clock runs.
    const words = learnAheadWords(loaded.header.deck, gloss);
    if (options.prelearn !== false && words.length > 0) learnAhead.open(words);
  }

  function disposeMatch(): void {
    const old = match;
    if (!old) return;
    match = null;
    old.learning.dispose();
    for (const presenter of old.ui) presenter.dispose();
    // The renderer stays; each view takes its own objects off it.
    old.scene.dispose();
  }

  /** The match ended (won, lost, retreat): learning sent, `.skill` measured, `.newwords` saved (canon §23.1). */
  function finish(m: Match, outcome: Outcome): void {
    if (m.outcome !== null) return;
    m.outcome = outcome;
    m.learning.flush();
    if (m.learnAhead.isOpen) m.learnAhead.close();
    if (m.review.isOpen) m.review.close();
    m.shopMode.close();
    const w = m.runner.world;
    const formation = w.formation;
    const safety = outcome === "victory" && formation.heartMax > 0 ? formation.heart / formation.heartMax : 0;
    // A dev run at another world speed (`?speed=`) measures wall time against a faster world: it never updates `.skill`.
    const sample = speed === 1 ? m.meter.sample(outcome === "victory" ? "won" : outcome === "defeat" ? "lost" : "quit", w.stats, safety) : null;
    const done = finishMatch(sample, { audience: AUDIENCE, mode: w.preset, nowMs: Date.now() });
    m.measured = done.accepted;
    saveNewWords(m.ledger.snapshot());
    lastFinish = { outcome, measured: done.accepted, words: m.meter.words, wpm: Math.round(m.meter.wpm * 10) / 10, tick: w.tick };
  }

  function retreat(): void {
    const m = match;
    if (!m || m.runner.finished) return;
    m.runner.stop();
    finish(m, "retreat");
    m.results.show("retreat");
  }

  /** Thu Hoạch → Enter: the stage again, at the measured speed when there is one now. */
  function again(): void {
    const m = match;
    if (!m) return;
    const measured = startingProfile(search, loadSkill(AUDIENCE, preset));
    newMatch(measured !== null ? { profile: measured, unknown: false } : { profile: m.profile, unknown: m.unknown });
  }

  /** Pause menu → Tốc độ gõ: another speed plays the stage again with it; the same one goes back to the game. */
  function paceFromMenu(): void {
    const m = match;
    if (!m) return;
    paceOpen = true;
    void showPaceCard(overlay!, { skill: loadSkill(AUDIENCE, preset), lastPick: readPaceMemory().lastPick }).then((choice) => {
      paceOpen = false;
      if (disposed || match !== m) return;
      const same = choice.unknown === m.unknown && choice.profile.e === m.profile.e && choice.profile.a === m.profile.a && choice.profile.cv === m.profile.cv;
      if (same) {
        startCountdownIfLive();
        return;
      }
      newMatch(choice);
      match?.hud.notify("Chơi lại ải ở " + choice.profile.e + " WPM", "info");
    });
  }

  // ── The app's own flow over a frame's events ──
  function follow(m: Match, events: readonly SimEvent[], now: number): void {
    const w = m.runner.world;
    for (const event of events) {
      switch (event.type) {
        case "wave-end":
          // Thẻ Ôn a moment later: letters still in flight from the wave's last word never answer it.
          if (options.review !== false) {
            m.reviewWave = event.wave;
            m.reviewAt = now + REVIEW_DELAY_MS;
          }
          // canon §6.5, D41: the first match of an unknown profile re-measures k from wave 1, applied from wave 2.
          if (event.wave === 1 && m.unknown && !m.paceSent) {
            m.paceSent = true;
            const update = paceUpdateAfterWave1(m.wave1, SEAT, m.profile, w.stats, (profile) => paceFor(profile).kPm);
            if (update !== null) {
              send(update);
              m.hud.notify("Đã đo tốc độ gõ sau đợt 1: " + Math.round(m.wave1.wpm) + " WPM", "info");
            }
          }
          break;
        case "victory":
          finish(m, "victory");
          break;
        case "defeat":
          finish(m, "defeat");
          break;
        default:
          break;
      }
    }
  }

  /** Thẻ Ôn (canon §17): up to 3 questions from the wave just held, in its break; the break clock stops while it is open. */
  function openReview(m: Match, now: number): void {
    // Shop mode keeps the keys until it closes (the card then opens if the break still runs).
    if (m.reviewAt < 0 || now < m.reviewAt || menu.isOpen || paceOpen || veilMode === "focus" || m.shopMode.isOpen) return;
    m.reviewAt = -1;
    const w = m.runner.world;
    if (w.phase !== "break" || m.review.isOpen || m.outcome !== null) return;
    const questions = m.learning.reviewQuestions(m.reviewWave);
    m.questions = questions;
    if (questions.length > 0) m.review.open(questions);
  }

  /** Counts for the debug handle (scenarios): event types, telegraph charges, Cast states. */
  function observe(m: Match, events: readonly SimEvent[]): void {
    const tally = m.tally;
    for (const event of events) {
      tally.types[event.type] = (tally.types[event.type] ?? 0) + 1;
      if (event.type === "telegraph" && event.stage === "start") {
        const ms = ((event.strikeTick - event.tick) * 1000) / SIM.tickHz;
        const row = (tally.telegraphs[event.def] ??= { n: 0, minMs: Infinity, shape: event.shape });
        row.n += 1;
        row.minMs = Math.min(row.minMs, ms);
      } else if (event.type === "cast" && event.seat === SEAT) tally.casts[event.state] = (tally.casts[event.state] ?? 0) + 1;
    }
  }

  // ── The frame ──
  const info = { dt: 0, worldDt: 0, alpha: 0, now: 0, local: null as unknown as LocalState };
  const frameInfo = info as FrameInfo;

  function frame(timing: LoopTiming): void {
    const started = view!.performance.now();
    const m = match;
    if (lastFrameAt > 0) pushCapped(intervals, timing.now - lastFrameAt, 600);
    lastFrameAt = timing.now;
    frames += 1;
    if (!m) {
      renderer.render(timing.dt);
      return;
    }
    const w = m.runner.world;
    const events = m.runner.drain();
    observe(m, events);
    m.learning.onEvents(events, w);
    m.meter.onEvents(events);
    if (!m.paceSent) m.wave1.onEvents(events);
    follow(m, events, timing.now);
    openReview(m, timing.now);
    const live = match === m;
    for (const presenter of m.presenters) presenter.onEvents(events, w);
    info.dt = timing.dt;
    info.worldDt = timing.worldDt;
    info.alpha = timing.alpha;
    info.now = timing.now;
    info.local = m.runner.local;
    for (const presenter of m.presenters) presenter.frame(w, frameInfo);
    renderer.render(timing.dt);
    if (!live) return;
    afterFrame(m, timing);
    pushCapped(cpu, view!.performance.now() - started, 600);
  }

  function afterFrame(m: Match, timing: LoopTiming): void {
    const now = view!.performance.now();
    for (const at of pendingKeys) pushCapped(keyLatency, now - at, 2000);
    for (const at of pendingCasts) pushCapped(castLatency, now - at, 500);
    pendingKeys.length = 0;
    pendingCasts.length = 0;
    const paused = pausedNow(timing.now);
    if (!paused && timing.worldDt < timing.dt * speed * 0.99) m.tally.slowFrames += 1;
    loop.setPaused(paused);
    const left = countdownUntil - timing.now;
    countdownNode.hidden = left <= 0;
    if (left > 0) countdownNode.textContent = String(Math.ceil(left / 1000));
    // Words stay hidden while the game stands still in a live phase (no reading ahead in the pause), and once the match is over.
    quyetHost!.classList.toggle("is-hushed", m.runner.finished || (liveNow() && (menu.isOpen || paceOpen || veilMode === "focus" || left > 0)));
    // A learning panel covers the frame (its lines would give answers away, canon §17).
    m.frame.setCovered(m.learnAhead.isOpen || m.review.isOpen);
    if (veilMode === "soft") veil.hidden = activePanel() !== null;
    // canon §20.1: after 10 s of play, only a suggestion.
    if (!paused && liveNow()) playMs += timing.dt * 1000;
    if (qualityHint === "" && quality !== "low" && playMs >= DEFAULT_TIER.suggestAfterMs && overBudget(quality, intervals, cpu)) {
      const lower = quality === "medium" ? "low" : "medium";
      qualityHint = lower;
      m.hud.notify("Máy đang chậm ở bậc hình này: thử ?q=" + lower + " cho mượt hơn", "soft");
    }
  }

  const loop = createLoop({
    step: () => match?.runner.tick(),
    frame,
    worldDt: (dt, now) => (match ? match.scene.worldDt(dt, now) : dt),
    speed: () => speed,
  });

  // ── Boot: deck source, speed, the first match ──
  view.focus();
  loop.setPaused(true);
  loop.start();
  void loadDeckSource(VOCAB_LEVEL).then((loadedSource) => {
    if (disposed) return;
    source = loadedSource;
    gloss = (wordId) => loadedSource.gloss.get(wordId) ?? null;
    boot.remove();
    if (loadedSource.fallback) overlay.dataset.deck = "fallback";
    const first = startingProfile(search, loadSkill(AUDIENCE, preset));
    const begin = (choice: PaceCardChoice): void => {
      newMatch(choice);
      if (!doc.hasFocus()) {
        veilMode = "soft";
        veilText.textContent = "Bấm hoặc gõ phím bất kỳ để bắt đầu";
        veil.classList.add("is-soft");
        veil.hidden = false;
      }
    };
    if (first !== null) {
      begin({ profile: first, unknown: false });
      return;
    }
    paceOpen = true;
    void showPaceCard(overlay, { skill: loadSkill(AUDIENCE, preset), lastPick: readPaceMemory().lastPick }).then((choice) => {
      paceOpen = false;
      if (!disposed) begin(choice);
    });
  });

  // ── window.__ic (dev builds, or ?debug=1) ──
  const handle: IcHandle = {
    get ready() {
      return match !== null;
    },
    state: () => {
      const m = match;
      const now = view.performance.now();
      const base = { ready: m !== null, paceCard: paceOpen, quality, gpu: renderer.info().gpu, qualityHint, deck: source === null ? "loading" : source.fallback ? "fallback" : "vocabulary" };
      if (!m) return base;
      const w = m.runner.world;
      const local = m.runner.local;
      return {
        ...base,
        seed: m.runner.header.seed,
        preset: w.preset,
        profile: m.profile,
        unknown: m.unknown,
        kPm: w.seats[SEAT]?.kPm ?? 0,
        phase: w.phase,
        wave: w.waves.index,
        waves: w.waves.total,
        endedThrough: w.waves.endedThrough,
        tick: w.tick,
        phaseEndsAt: w.phaseEndsAt,
        heart: w.formation.heart,
        heartMax: w.formation.heartMax,
        linhSa: w.economy.wallets[SEAT]?.linhSa ?? 0,
        live: w.beasts.live,
        kills: w.stats.kills,
        words: w.stats.words,
        keys: w.stats.keys,
        grades: [...w.stats.grades],
        casts: { held: w.stats.castsHeld, resolved: w.stats.castsResolved, fizzled: w.stats.castsFizzled, duplicates: w.casts.duplicates },
        banQuyetLive: isBanQuyetLive(w, SEAT),
        locked: w.words.seats[SEAT]?.locked ?? -1,
        player: { x: uToM(local.x), z: uToM(local.z), hp: local.hp, hpMax: local.hpMax, down: local.down },
        deckSize: m.runner.header.deck.length,
        newWordAllowance: m.runner.header.newWordAllowance,
        paused: pausedNow(now),
        loopPaused: loop.paused,
        steps: loop.steps,
        menu: menu.isOpen,
        veil: veilMode,
        countdown: countdownUntil > now,
        panel: menu.isOpen ? "menu" : m.learnAhead.isOpen ? "learn-ahead" : m.review.isOpen ? "review" : m.results.isOpen ? "results" : m.shopMode.isOpen ? "shop" : null,
        shop: m.shopMode.isOpen,
        imeBanner: ime.shown,
        outcome: m.outcome,
        finished: m.runner.finished,
        lastFinish,
        keysToSim,
        router: { ...router.stats },
        commands: m.runner.log.length,
        learning: { sent: m.learning.queue.sent, blocked: m.learning.queue.blocked, words: m.learning.matchWords().length },
        speed,
      };
    },
    send: (command) => {
      const m = match;
      if (!m) return false;
      const before = m.runner.log.length;
      send(command);
      return m.runner.log.length > before;
    },
    action: (name) => router.dispatch(name),
    replayCheck: () => (match ? replayCheck(match.runner) : null),
    replay: () => match?.runner.replay() ?? null,
    hash: () => (match ? { world: hex32(hashWorld(match.runner.world)), local: hex32(hashLocal(match.runner.local)) } : null),
    foeSizes: () => (match ? foeSizes(renderer, match.scene.actors, match.runner.world, match.runner.local) : []),
    frame: () => {
      const m = match;
      if (!m) return null;
      const width = view.innerWidth;
      const height = view.innerHeight;
      return frameReport(renderer, m.scene.actors, m.runner.world, width, height, height - quyetBand(width, height, settings.textScale));
    },
    words: () => {
      const m = match;
      const bar = m?.banQuyet.view ?? null;
      if (!m || bar === null) return null;
      const boxes = [...quyetHost.querySelectorAll<HTMLElement>(".ic-bq__cell")].map((cell) => {
        const r = cell.getBoundingClientRect();
        return { text: cell.querySelector(".ic-bq__word")?.textContent ?? "", state: cell.dataset.state ?? "", x: r.left, y: r.top, w: r.width, h: r.height };
      });
      return { live: bar.live, slots: bar.slots, extras: bar.extras, items: bar.items, chanNguyen: bar.chanNguyen, boxes };
    },
    review: () => (match?.questions ?? []).map((question) => ({ text: question.text, kind: question.kind, answer: question.answer })),
    events: () => {
      const m = match;
      if (!m) return {};
      const telegraphs: Record<string, { n: number; minMs: number; shape: string }> = {};
      for (const [def, row] of Object.entries(m.tally.telegraphs)) telegraphs[def] = { ...row };
      const values = Object.values(telegraphs).map((row) => row.minMs);
      return { tally: { ...m.tally.types }, casts: { ...m.tally.casts }, telegraphs, telegraphMinMs: values.length > 0 ? Math.min(...values) : null, slowFrames: m.tally.slowFrames, sounds: { ...m.sound.mixer.stats, byBus: { ...m.sound.mixer.stats.byBus } } };
    },
    perf: () => {
      const r = renderer.info();
      return {
        frames,
        quality,
        gpu: r.gpu,
        drawCalls: r.drawCalls,
        triangles: r.triangles,
        meanMs: mean(intervals),
        p95Ms: percentile(intervals, 0.95),
        maxMs: intervals.length > 0 ? Math.max(...intervals) : 0,
        cpuMeanMs: mean(cpu),
        cpuP95Ms: percentile(cpu, 0.95),
        keys: keyLatency.length,
        keyLatencyMeanMs: mean(keyLatency),
        keyLatencyMaxMs: keyLatency.length > 0 ? Math.max(...keyLatency) : 0,
        casts: castLatency.length,
        castLatencyMeanMs: mean(castLatency),
        castLatencyMaxMs: castLatency.length > 0 ? Math.max(...castLatency) : 0,
        castLatencyP95Ms: percentile(castLatency, 0.95),
      };
    },
    world: () => world(),
    local: () => match?.runner.local ?? null,
    setSpeed: (value) => {
      if (dev && Number.isFinite(value) && value > 0) speed = Math.min(16, Math.max(0.25, value));
    },
    restart: () => {
      const m = match;
      if (m) newMatch({ profile: m.profile, unknown: m.unknown });
    },
  };
  if (dev || options.debug === true) view.__ic = handle;

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      loop.stop();
      router.dispose();
      disposeMatch();
      menu.dispose();
      ime.dispose();
      motion.dispose();
      setSpeechNotice(() => undefined);
      view.removeEventListener("resize", applyInsets);
      view.removeEventListener("blur", onBlur);
      doc.removeEventListener("visibilitychange", onVisibility);
      view.removeEventListener("pagehide", onPageHide);
      view.removeEventListener("pointerdown", onPointerDown, { capture: true });
      canvasHost.removeEventListener("mousemove", onMouseMove);
      canvasHost.removeEventListener("mouseleave", onMouseLeave);
      renderer.dispose();
      overlay.replaceChildren();
      quyetHost.replaceChildren();
      if (view.__ic === handle) delete view.__ic;
    },
  };
}
