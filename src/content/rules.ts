/**
 * Every rule number of Tu Tiên Thủ Ải, each pointing to its section of the
 * canon (`docs/games/tu-tien/00-canon.md` in the parent repo). Systems read
 * numbers from here, never from literals (M0A_PLAN §3.1). All numbers are trial
 * numbers until the bots and the owner's playtest settle them; tuning changes
 * data, never rules. Per-entity tables live in `data/*.ts` (lane-owned).
 *
 * Pure and deterministic: no Math.pow, trig or **; integers in ms, mm, %, ‰, w100.
 * Owner: step 0 wrote it; Lane 2 owns it from now on (LANES.md).
 */
import type { BeastTier, GateId, Grade, Preset, Quality, SlotId, StageKind, WordGroup } from "./types";

// ── Identity, units, save (canon §0, §6.1, §7.1, §23.1) ─────────────────────

/** canon §0, D01: written into every learning event, never renamed. */
export const GAME_ID = "immortality-cultivation" as const;

/** canon §7.1, §6.1: 60 Hz; 1 m = 60 000 u; `origin` quantum 100 mm = 6 000 u. */
export const SIM = {
  tickHz: 60,
  uPerM: 60_000,
  uPerMm: 60,
  originQuantumMm: 100,
  /** Replay tail: both hashes every 600 ticks (canon §23.2). */
  hashEveryTicks: 600,
} as const;

/** `origin` of a command: the player's position rounded to 100 mm = 6 000 u (canon §6.1). */
export function quantizeOrigin(point: { readonly x: number; readonly z: number }): { readonly x: number; readonly z: number } {
  const step = SIM.originQuantumMm * SIM.uPerMm;
  // + 0 turns −0 into 0 (hashes and JSON must not see −0).
  return { x: Math.round(point.x / step) * step + 0, z: Math.round(point.z / step) * step + 0 };
}

/** canon §23.1: key prefix, version, the 20-minute window of `.newwords`. */
export const SAVE = {
  prefix: GAME_ID + ".",
  version: 1,
  newWordsKeepMs: 20 * 60_000,
} as const;

// ── Strength and HP (canon §7.1) ────────────────────────────────────────────

/** g(K) = 1.12^K × 1000 for K0–K6 (canon §7.1; no pow in rules, so a table). */
export const STRENGTH = {
  gPmByRealm: [1000, 1120, 1254, 1405, 1574, 1762, 1974],
  /** P_ref(K) = 100 × g(K): one ô 1 word of quality 1.00 at K0. */
  pRefHp: 100,
  /** 1 W = 0.9 × P_ref(K) = 90 × g(K) HP. */
  wHp: 90,
} as const;

/** g(K) × 1000 (canon §7.1). */
export function gPm(realm: number): number {
  const row = STRENGTH.gPmByRealm[realm];
  if (row === undefined) throw new Error("rules: no g(K) for realm " + realm);
  return row;
}

/** Beast HP = round(W × 90 × g(K) × preset factor) (canon §7.1, D38); `presetPm` 1000 for swarm and small. */
export function beastHp(w100: number, realm: number, presetPm: number): number {
  return Math.round((w100 * STRENGTH.wHp * gPm(realm) * presetPm) / 100_000_000);
}

// ── Typing: Cast, letters, slots (canon §6.1–6.3) ───────────────────────────

/** canon §6.1: a held Cast waits 3 s for a target; actionId = seat × 2^20 + n. */
export const CAST = {
  heldMs: 3000,
  actionSeatStride: 1_048_576,
} as const;

/** canon §6.2: live letters. */
export const LETTERS = {
  /** A released word rests 1 s before its letter may start a live word again. */
  restMs: 1000,
  /** Preset cap of live words (also canon §13.4). */
  liveCap: { relax: 5, balanced: 8, challenge: 8, learn: 5 } as Readonly<Record<Preset, number>>,
  /** Cap = min(preset cap; A − 3), A = letters with ≥ 3 valid deck words. */
  alphabetMargin: 3,
  minWordsPerLetter: 3,
  /** Every word is 3–8 letters, even after the ±1 fallback. */
  minLen: 3,
  maxLen: 8,
  /** Cân bằng, Thử thách: 5 slots + ≤ 2 Ấn + ≤ 1 urgent word. */
  sealsPerSeat: 2,
  urgentPerSeat: 1,
  /** Who keeps a place over the cap (canon §6.2): urgent > seal (≤ 1) > ô 3 > ô 1 > ô 2 > ô 5 > ô 4; Học swaps ô 4 before ô 5. */
  priority: ["urgent", "seal", 3, 1, 2, 5, 4] as const,
  priorityLearn: ["urgent", "seal", 3, 1, 2, 4, 5] as const,
} as const;

export interface SlotRule {
  /** Cooldown after a resolved Cast (ô 3: Hộ thân 15 s, thân pháp 8 s; ô 5 spends Chân Nguyên). */
  readonly cooldownMs: number;
  readonly groups: readonly WordGroup[];
  readonly minLen: number;
  readonly maxLen: number;
  /** Ô gấp: never a new word (canon §6.3). */
  readonly folded: boolean;
}

/** canon §6.3 slot table. */
export const SLOTS: Readonly<Record<SlotId, SlotRule>> = {
  1: { cooldownMs: 0, groups: ["known", "due"], minLen: 3, maxLen: 5, folded: true },
  2: { cooldownMs: 8000, groups: ["learning", "due"], minLen: 4, maxLen: 7, folded: false },
  3: { cooldownMs: 15_000, groups: ["known"], minLen: 3, maxLen: 5, folded: true },
  4: { cooldownMs: 12_000, groups: ["new", "learning"], minLen: 4, maxLen: 7, folded: false },
  5: { cooldownMs: 0, groups: ["due", "weak"], minLen: 5, maxLen: 8, folded: true },
};

/** canon §6.3, §12.1: thân pháp (Lưu Quang Bộ) cools down 8 s instead of Hộ thân's 15 s. */
export const SLOT3_DASH_COOLDOWN_MS = 8000;

/** canon §6.3: Ấn (never new; base words only through the fallback) and Tẩy. */
export const SEAL_WORDS = {
  groups: ["known", "due"] as readonly WordGroup[],
  lengths: { relax: [3, 5], balanced: [4, 6], challenge: [4, 7], learn: [3, 5] } as Readonly<Record<Preset, readonly [number, number]>>,
} as const;
export const CLEANSE_WORDS = { groups: ["known"] as readonly WordGroup[], minLen: 3, maxLen: 4 } as const;

/** canon §6.3 (Rồng 01 §3.4): mean length ℓ̄ × 10 by E: 4.5 under 45 WPM, 5.5 at 45–64, 6.0 from 65. */
export const LENGTH_BY_E: readonly { readonly minWpm: number; readonly meanX10: number }[] = [
  { minWpm: 0, meanX10: 45 },
  { minWpm: 45, meanX10: 55 },
  { minWpm: 65, meanX10: 60 },
];

// ── New words (canon §6.4, D11, D39) ────────────────────────────────────────

export const NEW_WORDS = {
  /** ≤ 8 new words in any sliding 20-minute window, shared by Học trước, Tĩnh Tu, Chiêu B. */
  perWindow: 8,
  windowMs: 20 * 60_000,
  /** > 80 words due: allowance = min(remaining; 4). */
  manyDue: 80,
  manyDueCap: 4,
  /** Each new word of the match met ≥ 3 times, ≥ 45 s apart, done before wave 4 (HC8). */
  meetings: 3,
  meetGapMs: 45_000,
  meetBeforeWave: 4,
  /** Ô 4 takes new words only in waves 1–2. */
  slot4LastWave: 2,
  /** Fewer new words below 90 % accuracy or when recognising them takes > 1.5 s (BALANCE §4.1). */
  lowAccuracyPm: 900,
  slowRecognizeMs: 1500,
  /** No new words in a wave with load > 1.00. */
  maxLoadX100: 100,
} as const;

/** canon §17.1, D35: cold start. */
export const DECK = {
  minWords: 70,
  maxWords: 100,
  /** Never under 40 words: a short group shrinks the deck instead of relabelling. */
  floorWords: 40,
  /** ≤ 40 base words (one level below the profile, A1 at the lowest), flag `assumed`. */
  baseWords: 40,
} as const;

// ── Grades, Chân Nguyên (canon §6.5, §6.6) ──────────────────────────────────

export const GRADE = {
  /** M_q × 1000. */
  mqPm: { flash: 1250, perfect: 1100, good: 1000, ok: 900, sloppy: 600 } as Readonly<Record<Grade, number>>,
  /** Chớp: 0 errors and t ≤ 0.85 × t_expected of the player's own profile. */
  flashRatioPm: 850,
  /** 1 error: Tốt from 6 letters, Vừa up to 5; ≥ 2 errors: Ẩu. */
  goodMinLetters: 6,
  sloppyErrors: 2,
  /** The Chớp floor follows the profile E of the last 5 sessions. */
  floorSessions: 5,
  /** Profile changes are capped at −10 % a session, downwards only, once ≥ 60 words over ≥ 3 sessions (D41). */
  downCapPct: 10,
  trustWords: 60,
  trustSessions: 3,
} as const;

/** canon §6.6: +5 clean, +3 with errors, +2 more for an Ấn, × 1 / k (‰, half up); full at 100. */
export const CHAN_NGUYEN = { clean: 5, withErrors: 3, sealBonus: 2, full: 100 } as const;

// ── Damage (canon §7.2, §7.3, §11) ──────────────────────────────────────────

export const DAMAGE = {
  /** G of armour or resist tiers G0–G3; reduction = G / (G + 100), cap 75 %. */
  armourG: [0, 43, 122, 300] as readonly number[],
  armourDivisor: 100,
  reductionCapPct: 75,
  /** Σ same-bucket increases ≤ +50 %; cooldown reduction ≤ 30 %. */
  bucketCapPct: 50,
  cooldownCapPct: 30,
  /** Total element factor within 0.60–1.60. */
  elementMaxPm: 1600,
  elementMinPm: 600,
  /** Phá thế: × 1.5. */
  brokenPm: 1500,
  /** An area hit deals ≤ 60 % of a swarm cluster's total HP. */
  clusterCapPct: 60,
  /** A beast dead before the hit lands: the hit goes to the nearest within 4 m at 50 %. */
  redirectMm: 4000,
  redirectPct: 50,
  /** Slows: different sources multiply, same source keeps the strongest, total ≤ 60 %. */
  slowCapPct: 60,
  /** Hard control ≤ 35 % of each beast's life (canon §8.3, Rồng G15). */
  hardControlCapPct: 35,
} as const;

/** canon §11, D23: counter × 1.30, countered × 0.80; Kim → Mộc → Thổ → Thủy → Hỏa → Kim. */
export const ELEMENT = {
  counterPm: 1300,
  counteredPm: 800,
  counters: { kim: "moc", moc: "tho", tho: "thuy", thuy: "hoa", hoa: "kim" },
} as const;

/** canon §7.2 slow sources (%). */
export const SLOWS = { barrierPct: 15, kiemThungPct: 25, lacKiemPct: 20, dinhThanPct: 40 } as const;

/** canon §7.3 share targets (reports; gates in GATES). */
export const SHARES = {
  typedMinPct: 60,
  typedMaxPct: 70,
  autoPct: [12, 18] as readonly [number, number],
  supportMaxPct: 25,
  slot1OfTypedMaxPct: 30,
  areaSkillMaxPct: 20,
} as const;

/**
 * canon §7.4, D13: D_ref and D_đơn of the reference school (Kiếm, K0) in W × 100
 * a minute. Trial numbers until Lane 7's calibrate.ts measures them; wave and
 * boss HP follow these.
 */
export const REF_OUTPUT = {
  school: "kiem",
  realm: 0,
  measured: false,
  dRefW100PerMin: 7500,
  dSingleW100PerMin: 4600,
  /** The estimate behind D_ref (canon §7.4, §12.1): typed 47 (ô 1 ~10, ô 2 ~18, ô 4 ~11, ultimate ~8), auto ~12, support ~16. */
  estimateW100PerMin: { slot1: 1000, slot2: 1800, slot4: 1100, slot5: 800, auto: 1200, support: 1600 },
} as const;

// ── Pace (canon §7.5) ───────────────────────────────────────────────────────

export const PACE = {
  /** C(E) = 60 / (0.45 + 12 (ℓ̄ + 1) / (E × 0.86)) words a minute. */
  reactMs: 450,
  perCharS: 12,
  dPm: 860,
  /** C_ref = C(E_eff of the Chuẩn bot) ≈ 19.6 words a minute. */
  cRefX10: 196,
  /** k clamp 0.75–1.30; k only scales time. */
  kMinPm: 750,
  kMaxPm: 1300,
  /** E_eff = E (0.6 + 0.4 a²)(1 − 0.5 CV), held in [0.7 E; E]. */
  eEffFloorPm: 700,
  defaultAccuracyPm: 950,
  defaultCvPm: 250,
  /** "Chưa biết" on the speed card: 25 WPM, measured in wave 1 (D18, D41). */
  unknownWpm: 25,
} as const;

// ── Field and formation (canon §8.1, §8.2) ──────────────────────────────────

/** canon §8.1: Thanh Thạch Ải, 40 × 26 m, heart at (0; 0). */
export const FIELD = {
  minXMm: -20_000,
  maxXMm: 20_000,
  minZMm: -18_000,
  maxZMm: 8000,
  gates: { A: { xMm: -15_000, zMm: -18_000 }, B: { xMm: 15_000, zMm: -18_000 } } as Readonly<Record<Exclude<GateId, "sky">, { xMm: number; zMm: number }>>,
  skyEntries: [
    { xMm: -20_000, zMm: -18_000 },
    { xMm: 20_000, zMm: -18_000 },
  ] as readonly { xMm: number; zMm: number }[],
  /** Ground route ~24 m; sky route 26.9 m straight. */
  routeMm: 24_000,
  skyRouteMm: 26_900,
  /** Flow field and player nav grid: 0.5 m cells, 80 × 52. */
  cellMm: 500,
  cols: 80,
  rows: 52,
  /** Small beasts reach the barrier edge in 8–12 s at k 1 Cân bằng; exceptions never under 6 s. */
  approachMs: [8000, 12_000] as readonly [number, number],
  approachFloorMs: 6000,
} as const;

/** canon §8.2. */
export const FORMATION = {
  /** Trận Lực: solo 1 000 · Lưỡng Nghi 1 400 · Tam Tài 1 800; Thất Tinh 3 500. */
  heartBySeats: [1000, 1400, 1800] as readonly number[],
  heartSeven: 3500,
  barrierRadiusMm: 9000,
  barrierSlowPct: 15,
  /** Players inside take −10 %; leaving keeps it 1.5 s, then it fades over 3 s; re-entry joins after 1 s. */
  barrierPlayerReductionPct: 10,
  barrierGraceMs: 1500,
  barrierFadeMs: 3000,
  barrierJoinMs: 1000,
  /** Tâm nhãn (solo) at 2/3 of the three nodes. Dưỡng in ‱ of Trận Lực a second. */
  tamNhan: { attackPct: 8, defencePct: 15, regenPermyriadPerS: 10, regenCapPct: 15, regenWindowMs: 3000 },
  /** Three nodes (M1). */
  nodes: { attackPct: 12, defencePct: 25, regenPermyriadPerS: 15, regenCapPct: 20 },
  /** A capturer standing 3 s turns the node off until it dies; Tẩy lights it after 1 s and pushes the beast 2 m. */
  captureMs: 3000,
  relightMs: 1000,
  pushMm: 2000,
  /** Each Trận Trụ takes 2 boss rams, then cracks (still blocks rocks); 1.5 m around it is safe from Lôi Kiếp. */
  pillarRams: 2,
  pillarSafeMm: 1500,
  /** A down player costs 5 % Trận Lực (solo); Linh Dịch gives +5 %. */
  downPenaltyPct: 5,
  linhDichPct: 5,
} as const;

/** canon §8.3 (per-mechanism table: data/mechanisms.ts). */
export const MECHANISMS = {
  slots: 6,
  /** Level 2 costs 70 % of the base price for +45 % main effect; level 3 costs 100 % for +35 % more. */
  upgrades: [
    { pricePct: 70, effectPct: 45 },
    { pricePct: 100, effectPct: 35 },
  ] as readonly { pricePct: number; effectPct: number }[],
  refundPct: 70,
  refundSameBreakPct: 100,
} as const;

// ── Player (canon §9) ───────────────────────────────────────────────────────

export const PLAYER = {
  /** Sinh lực at K0 (× g(K)); +30 % at each break. */
  hp: 600,
  breakRegenPct: 30,
  speedMmPerS: 5000,
  radiusMm: 400,
  /** Solo: down 8 s, up at the heart. Team (M1): revive within 3 m by typing any word; else up after 15 s. */
  downMs: 8000,
  teamReviveMm: 3000,
  teamDownMs: 15_000,
} as const;

// ── Beasts (canon §10) ──────────────────────────────────────────────────────

/** canon §10.2 tier bands, W × 100. */
export const BEAST_TIERS: Readonly<Record<Exclude<BeastTier, "boss">, readonly [number, number]>> = {
  swarm: [30, 50],
  small: [80, 120],
  medium: [200, 300],
  general: [500, 700],
};

/** canon §10.3. */
export const ELITES = {
  wPm: 1600,
  posture: 40,
  seals: 1,
  /** Drawn × 1.25. */
  sizePm: 1250,
  /** 3–5 % of non-swarm beasts in chapter 1. */
  sharePct: [3, 5] as readonly [number, number],
} as const;

/** canon §10.4. */
export const GENERAL = {
  posture: 60,
  /** W of a general ≤ 35 % of its wave's HP. */
  maxWaveHpPct: 35,
  sizePm: 1400,
} as const;

/** canon §10.5. */
export const BOSS = {
  w100: 6400,
  targetMs: 120_000,
  /** HP × 1.0 / 1.7 / 2.4 for 1 / 2 / 3 seats; Thất Tinh × 5.0. */
  seatHpPm: [1000, 1700, 2400] as readonly number[],
  sevenHpPm: 5000,
  /** Gọi Đàn ≤ 30 % W_Vương. */
  summonCapPct: 30,
  posture: 100,
  roarMs: 2500,
  /** At most 2 mechanics at once; 1 Ấn per person at a time. */
  maxMechanics: 2,
  sealsPerSeat: 1,
  /** Pillar ram stun (not a break). */
  pillarStunMs: 2000,
  /** Unsolved Thiết Bối Xung: Trận Lực −8 %, players in the line pushed 3 m (local). */
  chargeHeartPm: 80,
  chargeKnockMm: 3000,
} as const;

/** canon §10.6, D10: one formula T for every attack with a typed answer. */
export const TELEGRAPH = {
  /** T = 1.6 × (0.4 read + 0.5 recognise + 12 (ℓ + 1) / (0.86 × E_floor) + 0.2 animation + t_channel). */
  factorPm: 1600,
  readMs: 400,
  recognizeMs: 500,
  perCharS: 12,
  dPm: 860,
  animMs: 200,
  eFloor: { relax: 15, balanced: 25, challenge: 35, learn: 15 } as Readonly<Record<Preset, number>>,
  /** No typed answer: ≥ 1.2 s + half width ÷ 5 m/s. */
  floorMs: 1200,
  dodgeMmPerS: 5000,
  /** k values CB5 checks. */
  checkKPm: [750, 1000, 1300] as readonly number[],
} as const;

/** canon §10.7. */
export const POSTURE = {
  /** Ấn −35 (team: −35 / √seats); Phong Ấn Võng −15; each W of typed damage −1. */
  seal: 35,
  phongAn: 15,
  perTypedW: 1,
  brokenMs: 6000,
  immuneMs: 15_000,
} as const;

/** canon §10.8: bites a second at the heart edge (r 2 m). */
export const PRESSURE = {
  bitePerS: { swarm: 1, small: 2, medium: 4 } as Readonly<Record<"swarm" | "small" | "medium", number>>,
  heartEdgeMm: 2000,
} as const;

// ── Đan, phù (canon §12.3) ──────────────────────────────────────────────────

export const CONSUMABLES = {
  /** 2 slots (the 3rd opens at Thư Lâu), 3 each, keys 1/2/3, shared cooldown 8 s. */
  slots: 2,
  slotsMax: 3,
  stack: 3,
  cooldownMs: 8000,
} as const;

// ── Waves, director, presets (canon §4.1, §13) ──────────────────────────────

/** canon §4.1. */
export const FLOW = {
  prepMs: 20_000,
  warningMs: 5000,
  lullMs: 8000,
  /** Thư giãn, Học wait for Enter and go on by themselves after 60 s. */
  breakAutoMs: 60_000,
  grandBreakMs: 15_000,
  /** Stars by Trận Lực left: ≥ 70 % ★★★, ≥ 40 % ★★, > 0 ★. */
  threeStarPct: 70,
  twoStarPct: 40,
} as const;

/** canon §13.1 load bands × 100 (Rồng 00 §4.4); gate rule (Rồng 02 §5.3). */
export const LOAD = {
  firstWave: [55, 65] as readonly [number, number],
  middle: [75, 100] as readonly [number, number],
  middlePeakMax: 115,
  last: [105, 125] as readonly [number, number],
  lastPeakMax: 130,
  hardMax: 140,
  teachMax: 85,
  teachPeakMax: 100,
  peakMs: [6000, 10_000] as readonly [number, number],
  peaksPerWave: [2, 3] as readonly [number, number],
  lullMinMs: 8000,
  /** Each gate one group every 1.5 s; two gates ≥ 0.6 s apart; the rule only stretches. */
  gateGapMs: 1500,
  gatePairGapMs: 600,
  /** Analytic filter: a wave off by > 25 % is rejected (Rồng 00 §8). */
  analyticTolerancePct: 25,
} as const;

/** canon §13.2 (kit balance/director.ts). */
export const DIRECTOR = {
  everyTicks: 300,
  windowMs: 20_000,
  stepsPerWave: 2,
  spawnCapPct: 15,
  hpCapPct: 10,
  spawnStepPct: 7,
  shiftMs: 3000,
  linhDichPerWave: 1,
} as const;

/** canon §13.3, §25: the M0a stage. */
export const STAGE_M0A = {
  liveCap: 60,
  /** A Thạch Thử cluster: 7 × 0.33 W = 2.31 W. */
  clusterSize: 7,
  waves: 6,
  /** Proposed for M1 if HN0 at Low passes N = 120 (canon §26 q4). */
  liveCapM1: 120,
} as const;

export interface PresetRow {
  /** Beast HP (not swarm, small), beast damage, beast speed, ‰. */
  readonly hpPm: number;
  readonly damagePm: number;
  readonly speedPm: number;
  /** Break: ms, or "enter" (waits; goes on after FLOW.breakAutoMs). */
  readonly breakMs: number | "enter";
  readonly mixedWaves: number;
  readonly liveWords: number;
  readonly meaning: "always" | "recalls" | "first";
  /** kit/balance BandMode of the pace director. */
  readonly band: "relax" | "balanced" | "challenge";
  readonly thuHachPm: number;
}

/** canon §13.4. */
export const PRESETS: Readonly<Record<Preset, PresetRow>> = {
  relax: { hpPm: 850, damagePm: 700, speedPm: 900, breakMs: "enter", mixedWaves: 5, liveWords: 5, meaning: "always", band: "relax", thuHachPm: 800 },
  balanced: { hpPm: 1000, damagePm: 1000, speedPm: 1000, breakMs: 20_000, mixedWaves: 6, liveWords: 8, meaning: "recalls", band: "balanced", thuHachPm: 1000 },
  challenge: { hpPm: 1150, damagePm: 1200, speedPm: 1050, breakMs: 15_000, mixedWaves: 6, liveWords: 8, meaning: "first", band: "challenge", thuHachPm: 1250 },
  learn: { hpPm: 850, damagePm: 700, speedPm: 900, breakMs: "enter", mixedWaves: 5, liveWords: 5, meaning: "always", band: "relax", thuHachPm: 800 },
};

// ── Economy (canon §14) ─────────────────────────────────────────────────────

/** canon §14.2 (Rồng 00 §4.9). */
export const LINH_SA = {
  start: 200,
  /** Thư Lâu tiers 2 and 5. */
  thuLauStart: [20, 40] as readonly number[],
  fund: 900,
  /** f_cổng by ground gates 1 / 2 / 3 (sky not counted). */
  gatesPm: [1000, 1250, 1450] as readonly number[],
  /** f_loại. */
  kindPm: { teach: 600, mixed: 1000, grand: 1200, m0a: 1000 } as Readonly<Record<StageKind, number>>,
  killPct: 60,
  waveEndPct: 25,
  learningPct: 15,
  /** Each wave end pays +10 % over the previous one. */
  waveStepPct: 10,
  /** Thẻ Ôn: 80 % of the learning fund over 3 × breaks; Học trước: 20 % over 8 words. */
  reviewSharePct: 80,
  reviewPerBreak: 3,
  learnAheadSharePct: 20,
  learnAheadWords: 8,
  /** A summoned beast's ĐĐ is 50 % of its W. */
  summonThreatPct: 50,
} as const;

/** canon §14.1 (in-match part; the rest is M1). */
export const THU_HACH = {
  elite: 1,
  general: 2,
  /** Leftover Linh Sa → min(3; floor(left / 100)). */
  leftoverPer: 100,
  leftoverMax: 3,
  firstStars: [3, 2, 3] as readonly number[],
  firstBoss: 20,
  replayPct: 30,
  defeatKeepPct: 50,
} as const;

// ── Tĩnh Tu (canon §16, D40) ────────────────────────────────────────────────

export const TINH_TU = {
  sessionMs: 60_000,
  readPoints: [3, 4] as readonly [number, number],
  /** Words live at once: Nhập Môn 2–3, Tham Ngộ 3–4. */
  liveNhapMon: [2, 3] as readonly [number, number],
  liveThamNgo: [3, 4] as readonly [number, number],
  /** L = 1.0 + 1.6 × typing time at E_eff + 1.0 s; Thường 1.5 L, Tâm ma 2 L. */
  lifeHeadMs: 1000,
  lifeTypeX10: 16,
  lifeTailMs: 1000,
  thuongLifePm: 1500,
  tamMaLifePm: 2000,
  minhPoints: 5,
  thuongPoints: 2,
  wrongPoints: 3,
  /** Completed session: clamp(40 + …; 40; 100); uncompleted: max(0; …), no floor. */
  completeFloor: 40,
  full: 100,
  minhPerSession: 2,
  /** No two Minh expire within the same 1.5 s window (HC5). */
  minhExpireGapMs: 1500,
  lockGraceMs: 1200,
  lessonWords: 6,
  /** Tâm ma: mastery ≥ 70 from a topic ≥ 3 steps away on the 15-topic map; 1/3 unlabelled in Tham Ngộ. */
  tamMaMastery: 70,
  topicDistance: 3,
  topics: 15,
  tamMaUnlabelledPm: 333,
} as const;

// ── Gates and budgets (canon §18.4, §20) ────────────────────────────────────

export const GATES = {
  seeds: 20,
  /** CB1: no typing loses 20/20 before the end of wave 3 (Cân bằng, Thử thách). */
  cb1LoseByWave: 3,
  cb2TypedMinPct: 55,
  cb2SeedMinPct: 50,
  cb3Slot1MaxPct: 30,
  cb4WinGapPct: 10,
  /** CB9 at M0a: 9–10.5 minutes with the Chuẩn bot, × 10. */
  cb9MinutesX10: [90, 105] as readonly [number, number],
  hc3WinPct: 85,
  hc4Sessions: 2,
  hc4bSessions: 10,
  hc6bWrongMaxPct: 10,
  hc7RulePct: 90,
  hc8Meetings: { standard: 3, child: 2 },
  /** Linh Sa of the M0a stage with every learning reward: 1 325 ± 3; doing it pays ≤ 15 % more. */
  m0aLinhSaMax: 1325,
  m0aLinhSaTolerance: 3,
  learningGainMaxPct: 15,
  /** B9: bots on the same profile within 15 %. */
  humanBotDeltaPct: 15,
} as const;

/** canon §18.4: one 60 Hz step ≤ 0.3 ms at 300 beasts headless; a match ≥ 200× real time. */
export const SIM_BUDGET = { stepMicros: 300, realtimeFactor: 200, beasts: 300 } as const;

/** Structurally kit/three StageTier (rules cannot import three). */
export interface TierRow {
  readonly dpr: number;
  readonly particles: number;
  readonly bloom: boolean;
  readonly tipsPerSide: number;
  readonly trail: number;
}

/**
 * canon §20.2, PB-35: the Stage3D tier table, 4 keys (ultra = high at MVP).
 * DPR 1 and particles from the canon; bloom on from Medium and the kit's
 * tipsPerSide and trail are this round's proposal (Lane 1 confirms in HN0).
 */
export const TT_TIERS: Readonly<Record<Quality, TierRow>> = {
  low: { dpr: 1, particles: 600, bloom: false, tipsPerSide: 1, trail: 12 },
  medium: { dpr: 1, particles: 1500, bloom: true, tipsPerSide: 2, trail: 18 },
  high: { dpr: 1, particles: 3000, bloom: true, tipsPerSide: 3, trail: 30 },
  ultra: { dpr: 1, particles: 3000, bloom: true, tipsPerSide: 3, trail: 30 },
};

export interface TierBudget {
  readonly width: number;
  readonly height: number;
  readonly skinnedMax: number;
  readonly swords: number;
  readonly lodTris: number;
  readonly particles: number;
  readonly numbers: number;
  /** Including post-processing passes. */
  readonly drawCalls: number;
  readonly textureMb: number;
  /** Dell frame budget, µs (mean null: only p95 binds). */
  readonly frameMeanUs: number | null;
  readonly frameP95Us: number;
  /** Sub-budgets of the Dell p95 (D36): base + crowd + swords, VFX, numbers + skinned, µs. */
  readonly subUs: { readonly base: number; readonly crowd: number; readonly swordsFx: number; readonly skinned: number };
  /** Apple M4 frame budget, µs. */
  readonly m4MeanUs: number | null;
  readonly m4P95Us: number;
  readonly cpuP95Us: number;
}

/** canon §20.2 budget table (the parts StageTier has no room for). */
export const TT_BUDGETS: Readonly<Record<Quality, TierBudget>> = {
  low: {
    width: 1280, height: 720, skinnedMax: 6, swords: 150, lodTris: 1000, particles: 600, numbers: 50, drawCalls: 80, textureMb: 64,
    frameMeanUs: null, frameP95Us: 8000, subUs: { base: 1500, crowd: 3000, swordsFx: 2000, skinned: 1500 }, m4MeanUs: null, m4P95Us: 16_000, cpuP95Us: 6000,
  },
  medium: {
    width: 1600, height: 900, skinnedMax: 6, swords: 300, lodTris: 1800, particles: 1500, numbers: 100, drawCalls: 110, textureMb: 128,
    frameMeanUs: 8000, frameP95Us: 10_000, subUs: { base: 2000, crowd: 4000, swordsFx: 2500, skinned: 1500 }, m4MeanUs: null, m4P95Us: 12_000, cpuP95Us: 6000,
  },
  high: {
    width: 1920, height: 1080, skinnedMax: 8, swords: 500, lodTris: 3000, particles: 3000, numbers: 160, drawCalls: 150, textureMb: 192,
    frameMeanUs: 8000, frameP95Us: 12_000, subUs: { base: 2000, crowd: 5000, swordsFx: 3500, skinned: 1500 }, m4MeanUs: 8000, m4P95Us: 12_000, cpuP95Us: 6000,
  },
  ultra: {
    width: 1920, height: 1080, skinnedMax: 8, swords: 500, lodTris: 3000, particles: 3000, numbers: 160, drawCalls: 150, textureMb: 192,
    frameMeanUs: 8000, frameP95Us: 12_000, subUs: { base: 2000, crowd: 5000, swordsFx: 3500, skinned: 1500 }, m4MeanUs: 8000, m4P95Us: 12_000, cpuP95Us: 6000,
  },
};

/** canon §20.2: Thất Tinh may run 10 SkinnedMesh at High; the swords minimum of L2. */
export const TT_LIMITS = { skinnedSeven: 10, swordsFloor: 80, keyToStrikeMs: 50, banQuyetUpdateUs: 300 } as const;

/** How the crowd is drawn per tier: "procedural" until the HN0 verdict (canon §20.4) names vat or impostor. */
export type CrowdMode = "procedural" | "vat" | "impostor";
export const CROWD_MODE: Readonly<Record<Quality, CrowdMode>> = { low: "procedural", medium: "procedural", high: "procedural", ultra: "procedural" };

/** canon §20.1: first-run tier by GPU; after 10 s a p95 over budget only suggests one tier down. */
export const DEFAULT_TIER = { discrete: "high", apple: "medium", other: "low", suggestAfterMs: 10_000 } as const;

// ── Presentation numbers the rules own (canon §21.1, §22, §24) ──────────────

/** canon §21.1: smallest on-screen sizes at 1080p, px. */
export const SIZES_PX_1080 = { player: 64, swarm: 20, swarmCluster: 60, small: 36, medium: 48, general: 80, boss: 160 } as const;

/** canon §21.1: fixed 3/4 camera (no rotate, no zoom at MVP). */
export const CAMERA = { tiltDeg: [50, 55] as readonly [number, number], fovDeg: [25, 30] as readonly [number, number], frameMm: { width: 40_000, depth: 26_000 } } as const;

/** canon §21.1: semantic colours of the kit (never misused). */
export const COLOURS = { danger: "#FF4A4A", urgent: "#FFB020", money: "#FFC83A", typing: "#7FF5E0" } as const;

/** canon §22: voices and buses (all silent at M0a). */
export const AUDIO = {
  voices: 32,
  voicesLow: 16,
  /** One sound ≤ 4 times every 100 ms. */
  perSoundPer100Ms: 4,
  buses: ["music", "ambience", "world", "enemies", "self", "allies", "formation", "typing", "pronunciation", "ui", "warnings"] as const,
} as const;

/** canon §24: Bàn Quyết text 28–32 px; text scale 100 / 125 / 150 %. */
export const ACCESS = { banQuyetPx: [28, 32] as readonly [number, number], textScales: [100, 125, 150] as readonly number[] } as const;

// ── Keys (canon §5.1, D45; read by event.code) ──────────────────────────────

export interface KeyBinding {
  readonly action: KeyAction;
  readonly code: string;
}

export type KeyAction =
  | "backspace"
  | "escape"
  | "enter"
  | "item-1"
  | "item-2"
  | "item-3"
  | "shop"
  | "arrow-up"
  | "arrow-down"
  | "arrow-left"
  | "arrow-right"
  | "upgrade"
  | "sell";

/** Command keys (canon §5.1). Letters a–z are typing only; keys with Ctrl or Cmd are ignored; no WASD at MVP. */
export const KEYS: readonly KeyBinding[] = [
  { action: "backspace", code: "Backspace" },
  { action: "escape", code: "Escape" },
  { action: "enter", code: "Enter" },
  { action: "enter", code: "NumpadEnter" },
  { action: "item-1", code: "Digit1" },
  { action: "item-2", code: "Digit2" },
  { action: "item-3", code: "Digit3" },
  { action: "shop", code: "Backquote" },
  { action: "arrow-up", code: "ArrowUp" },
  { action: "arrow-down", code: "ArrowDown" },
  { action: "arrow-left", code: "ArrowLeft" },
  { action: "arrow-right", code: "ArrowRight" },
  { action: "upgrade", code: "Equal" },
  { action: "sell", code: "Minus" },
];

/** Keys the game never binds at MVP (canon §5.1). */
export const KEYS_UNUSED = ["Tab", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Insert", "Delete", "PageUp", "Pause"] as const;

/** canon §5.1, D45: in shop mode `=` upgrades and `-` sells only on the second press within this window. */
export const SHOP_MODE = { confirmMs: 2000 } as const;

// ── The rules as one object (rulesHash) ─────────────────────────────────────

/** Every rule table above; the replay header's rulesHash covers it with the stage and data tables. */
export const RULES = {
  GAME_ID, SIM, SAVE, STRENGTH, CAST, LETTERS, SLOTS, SLOT3_DASH_COOLDOWN_MS, SEAL_WORDS, CLEANSE_WORDS, LENGTH_BY_E, NEW_WORDS, DECK, GRADE, CHAN_NGUYEN,
  DAMAGE, ELEMENT, SLOWS, SHARES, REF_OUTPUT, PACE, FIELD, FORMATION, MECHANISMS, PLAYER, BEAST_TIERS, ELITES, GENERAL, BOSS, TELEGRAPH, POSTURE,
  PRESSURE, CONSUMABLES, FLOW, LOAD, DIRECTOR, STAGE_M0A, PRESETS, LINH_SA, THU_HACH, TINH_TU, GATES, SIM_BUDGET, KEYS,
} as const;

/** FNV-1a 32-bit over the JSON of `parts`, 8 hex digits (stable: object literals keep their key order). */
export function contentHash(parts: readonly unknown[]): string {
  const text = JSON.stringify(parts);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
