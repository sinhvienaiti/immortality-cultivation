/**
 * The app: speed card → prep → world, `local`, frame loop, key router, every
 * presenter (M0A_PLAN §6.9). Step 0 sets up match loading and the replay
 * header (canon §23.2); `startApp` is wired at integration once the lanes'
 * stubs run.
 *
 * Match loading (canon §6.4, §17.1, §23.2): read the profile (`.skill`), the
 * new-word ledger (`.newwords`) and the learning records (none at M0a: a cold
 * start), build the deck, snapshot `remaining` as `newWordAllowance`, and
 * write the header before tick 0. When the sim reports `word-first-seen`, the
 * app calls the ledger's `take(wordId, Date.now(), channel)` and saves
 * `.newwords`.
 * Owner: step 0 / integration (LANES.md).
 */
import { createRng } from "../kit/platform/rng";
import { GAME_ID, NEW_WORDS, RULES, contentHash } from "../content/rules";
import { BEASTS, GENERALS } from "../content/data/beasts";
import { BOSSES } from "../content/data/boss";
import { CONSUMABLE_DEFS } from "../content/data/consumables";
import { SHOP_ITEMS } from "../content/data/economy";
import { ELITE_TRAITS } from "../content/data/elites";
import { MECHANISM_DEFS } from "../content/data/mechanisms";
import { SCHOOL_KIEM, TAM_PHAP } from "../content/data/school-kiem";
import { TELEGRAPHS } from "../content/data/telegraphs";
import type { DeckWord, Loadout, Preset, ReplayHeader, SeatProfile, StageDef, WordRecord } from "../content/types";
import { paceFor } from "../sim/pace";
import { buildDeck } from "../typing/deck";
import { createNewWordLedger, type NewWordLedger } from "../typing/new-word-ledger";
import { loadKey, type KeyStore } from "./storage";

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
  return {
    v: 1,
    gameId: GAME_ID,
    rulesHash,
    seed: request.seed >>> 0,
    stageId: request.stage.id,
    preset: request.preset,
    pacing: request.pacing,
    seats: [{ seat: 0, profile: { e: request.profile.e, a: request.profile.a, cv: request.profile.cv }, kPm }],
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

/** The game page (index.html). TODO(integration): speed card, prep, world, local, loop, router, presenters. */
export function startApp(_document: Document): void {
  throw new Error("TODO(integration): startApp is wired after the lanes deliver (M0A_PLAN §6.9)");
}
