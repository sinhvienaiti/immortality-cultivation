// Source: src/app/app.ts loadMatch, createReplayHeader, matchRulesHash, newWordAllowance (same repo; app.ts imports the DOM and CSS, which Node cannot load; tests/sim/bot-header.test.ts keeps both equal)
/**
 * A bot's match header (canon §23.2), built exactly as the page builds it
 * (M0A_PLAN §6.9): a fresh new-word ledger (8 words left in the window), the
 * cold-start deck from buildDeck on the deck's own stream of the match seed,
 * k from the bot's profile, the Chớp floor of a profile with no session
 * memory, and the rules hash over rules.ts, the stage and every data table.
 * Owner: Lane 7.
 */
import { BEASTS, GENERALS } from "../../src/content/data/beasts";
import { BOSSES } from "../../src/content/data/boss";
import { CONSUMABLE_DEFS } from "../../src/content/data/consumables";
import { SHOP_ITEMS } from "../../src/content/data/economy";
import { ELITE_TRAITS } from "../../src/content/data/elites";
import { MECHANISM_DEFS } from "../../src/content/data/mechanisms";
import { SCHOOL_KIEM, TAM_PHAP } from "../../src/content/data/school-kiem";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { TELEGRAPHS } from "../../src/content/data/telegraphs";
import { GAME_ID, NEW_WORDS, RULES, contentHash } from "../../src/content/rules";
import type { DeckWord, Loadout, Preset, ReplayHeader, SeatProfile, StageDef, WordRecord } from "../../src/content/types";
import { createRng } from "../../src/kit/platform/rng";
import { paceFor } from "../../src/sim/pace";
import { buildDeck } from "../../src/typing/deck";
import { eEffX1000, flashEX1000 } from "../../src/typing/grading";
import { createNewWordLedger } from "../../src/typing/new-word-ledger";

/** app.ts DECK_SEED_SALT: the deck draws from its own stream of the match seed. */
export const DECK_SEED_SALT = 0x5eed_dec0;

/** app.ts newWordAllowance (canon §6.4). */
export function botAllowance(remaining: number, dueCount: number): number {
  const left = Math.max(0, Math.floor(remaining));
  return dueCount > NEW_WORDS.manyDue ? Math.min(left, NEW_WORDS.manyDueCap) : left;
}

/** app.ts matchRulesHash: the same tables in the same order. */
export function botRulesHash(stage: StageDef): string {
  return contentHash([RULES, stage, BEASTS, GENERALS, ELITE_TRAITS, BOSSES, TELEGRAPHS, SCHOOL_KIEM, TAM_PHAP, MECHANISM_DEFS, CONSUMABLE_DEFS, SHOP_ITEMS]);
}

export interface BotMatchRequest {
  readonly seed: number;
  readonly stage?: StageDef;
  readonly preset: Preset;
  readonly pacing: boolean;
  readonly loadout: Loadout;
  readonly profile: SeatProfile;
  readonly records: readonly WordRecord[];
  readonly level: number;
  readonly dueCount: number;
}

/** The header the page would write for this request with an empty `.newwords` and no pace memory. */
export function botHeader(request: BotMatchRequest): ReplayHeader {
  const stage = request.stage ?? THANH_THACH_AI;
  const ledger = createNewWordLedger({ v: 1, entries: [] });
  const allowance = botAllowance(ledger.remaining(0), request.dueCount);
  const rng = createRng((request.seed ^ DECK_SEED_SALT) >>> 0);
  const deck: DeckWord[] = buildDeck(request.records, request.level, allowance, rng.words);
  const profile = { e: request.profile.e, a: request.profile.a, cv: request.profile.cv };
  const flash = flashEX1000(eEffX1000(profile), []);
  return {
    v: 1,
    gameId: GAME_ID,
    rulesHash: botRulesHash(stage),
    seed: request.seed >>> 0,
    stageId: stage.id,
    preset: request.preset,
    pacing: request.pacing,
    seats: [{ seat: 0, profile, kPm: paceFor(profile).kPm, flashEX1000: flash }],
    deck: deck.map((word) => ({ wordId: word.wordId, text: word.text, group: word.group, mastery: word.mastery, recalls: word.recalls, assumed: word.assumed })),
    newWordAllowance: allowance,
    loadout: { guard: request.loadout.guard, tamPhap: request.loadout.tamPhap },
  };
}
