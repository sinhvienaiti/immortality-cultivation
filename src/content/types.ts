/**
 * Data contract of Tu Tiên Thủ Ải (canon §23.3, PB-24; replay §23.2; save §23.1).
 * Every state field of `World` and of the `local` layer is declared here at
 * step 0 (PB-36), so no lane adds fields to another lane's file.
 *
 * Units (canon §7.1, M0A_PLAN §3.1): state holds integers only: ticks at 60 Hz,
 * u (1 m = 60 000 u), permille (…Pm), whole HP. Content data uses mm (…Mm),
 * ms (…Ms), percent (…Pct), permille (…Pm) and W × 100 (w100); the load step
 * converts. Readers (events, view) get metres.
 *
 * Owner: step 0 wrote it; Lane 2 owns it from now on. A lane that needs a field
 * in its own state adds it by module augmentation in its own file
 * (`declare module "../content/types" { interface WordsState { … } }`) and
 * reports it; Lane 2 folds it in here. Never edit another lane's section.
 * Part A's augmentations (Lanes 3 and 5) are folded in (part A fixes, 25/10).
 */
import type { PaceDirector } from "../kit/balance/director";
import type { FlowMeter } from "../kit/balance/flow";
import type { Rng } from "../kit/platform/rng";
import type { BudgetLedger } from "../kit/typing/budget";
import type { TypingSession } from "../kit/typing/session";

// ── Basics ──────────────────────────────────────────────────────────────────

/** A field point in sim u (1 m = 60 000 u); x east, z south, the heart at the origin (canon §8.1). */
export interface PointU {
  readonly x: number;
  readonly z: number;
}

/** A field point in content millimetres (data files). */
export interface PointMm {
  readonly xMm: number;
  readonly zMm: number;
}

/** The four presets (canon §13.4); the same ids as kit/balance SkillMode. */
export type Preset = "relax" | "balanced" | "challenge" | "learn";

/** Device tier: changes how things are drawn, never the rules (canon D12, §20). */
export type Quality = "low" | "medium" | "high" | "ultra";

/** Input channel of a Cast and of a learning event (canon §6.1, §17). */
export type Channel = "typing" | "voice" | "hybrid";

/** Word results: Chớp, Hoàn hảo, Tốt, Vừa, Ẩu (canon §6.5). */
export type Grade = "flash" | "perfect" | "good" | "ok" | "sloppy";

/** Typed (every Cast from a word) ignores armour; physical meets armour; magic meets resist (canon §7.2). */
export type DamageType = "typed" | "physical" | "magic";

/** Armour or resist tier G0–G3 = G 0 / 43 / 122 / 300 (canon §7.2). */
export type ArmourTier = 0 | 1 | 2 | 3;

/** Feedback tiers T0–T5 (canon §21.1). */
export type FeedbackTier = 0 | 1 | 2 | 3 | 4 | 5;

/** Ngũ hành (canon §11): Kim, Mộc, Thủy, Hỏa, Thổ. */
export type Element = "kim" | "moc" | "thuy" | "hoa" | "tho";

// ── Ids ─────────────────────────────────────────────────────────────────────

/** The five chapter-1 families (canon §10.2): T01 Thạch Thử, T02 Phong Lang, T03 Hỏa Nha, T04 Nham Viên, T05 Thiết Giáp Trư. */
export type BeastId = "thach-thu" | "phong-lang" | "hoa-nha" | "nham-vien" | "thiet-giap-tru";
/** Thú tướng (canon §10.4). */
export type GeneralId = "lang-dau-dan";
/** Thú Vương (canon §10.5). */
export type BossId = "thiet-boi-lang-vuong";
export type SpeciesId = BeastId | GeneralId | BossId;

/** Bầy, Nhỏ, Vừa, thú tướng, Thú Vương (canon §10.2 bậc). */
export type BeastTier = "swarm" | "small" | "medium" | "general" | "boss";
export type BeastFamily = "thu" | "lang" | "dieu" | "vien" | "giap";
/** Placeholder shape (canon §10.9): biped tall, quadruped long and low, flyer floats, swarm small blocks in a cluster. */
export type Gait = "biped" | "quadruped" | "flyer" | "swarm";

/** Tinh anh traits (canon §10.3): Cuồng, Thiết Bì, Hồi Nguyên. */
export type EliteTraitId = "cuong" | "thiet-bi" | "hoi-nguyen";

/** Ground gates A, B and the sky route (canon §8.1). */
export type GateId = "A" | "B" | "sky";

export type SchoolId = "kiem";
/** Bàn Quyết slots 1–5 (canon §6.3). */
export type SlotId = 1 | 2 | 3 | 4 | 5;
/** Ô 3: Hộ thân (`ward`) or thân pháp (dash), chosen before the match (canon §12.1). */
export type GuardChoice = "ward" | "dash";
/** Tâm pháp S Kiếm Tâm, R Tích Kiếm (canon §12.1). */
export type TamPhapId = "kiem-tam" | "tich-kiem";

/** M0a mechanisms (canon §8.3); Mê Vụ Trận is M1. */
export type MechanismId = "kiem-thung" | "loi-phu-tru" | "phong-an-vong";
/** M0a đan, phù (canon §12.3); Định Thân Phù is M1. */
export type ConsumableId = "hoi-xuan-dan" | "kim-than-phu" | "loi-hoa-phu";

/** Solo has one Tâm nhãn (canon §8.2); M1 adds cong, thu, duong. */
export type NodeId = "tam-nhan";
/** Trận Trụ T (west) and P (east) (canon §8.1). */
export type PillarId = "west" | "east";

/** Word kinds for slot rules (canon §6.3): mới, đang học, đến hạn, đã thuộc, yếu. Base words are "known" with `assumed`. */
export type WordGroup = "new" | "learning" | "due" | "known" | "weak";
/** Learning activity types (canon §17). */
export type ActivityType = "typing-skill" | "typing-elite" | "typing-boss" | "review-card" | "meaning-recall" | "listening";
/** Where a new word was first met (canon §6.4 sổ cái). */
export type NewWordChannel = "learn-ahead" | "tinh-tu" | "slot4";

// ── Content: beasts, generals, boss ─────────────────────────────────────────

/** A primitive placeholder (canon D27): one colour per family, size for the view. */
export interface PlaceholderDef {
  readonly gait: Gait;
  readonly colour: string;
  readonly heightMm: number;
  readonly lengthMm: number;
  readonly widthMm: number;
}

/** One species at K0 Cân bằng (canon §10.2). HP = round(W × 90 × g(K) × preset) (rules.ts beastHp). */
export interface BeastDef {
  readonly id: SpeciesId;
  /** T01–T05, G01, V01. */
  readonly code: string;
  readonly name: string;
  readonly family: BeastFamily;
  readonly tier: BeastTier;
  /** W × 100 at K0 Cân bằng. */
  readonly w100: number;
  /** Walk speed, mm/s (= u per tick). */
  readonly speedMm: number;
  readonly flying: boolean;
  readonly armour: ArmourTier;
  readonly resist: ArmourTier;
  /** null: vô hệ (every M0a beast). */
  readonly element: Element | null;
  /** Beasts per group: cluster 6–8, pack 3–5, single 1–1. */
  readonly groupSize: readonly [min: number, max: number];
  /** Trận Lực bitten a second at the heart edge (canon §10.8: swarm 1, small 2, medium 4); 0 never bites. */
  readonly bitePerS: number;
  /** Telegraphed attacks by TelegraphDef id (data/telegraphs.ts). */
  readonly attacks: readonly string[];
  /** Stops this far from its target to throw (Nham Viên 11 m, PB-17), mm; 0 walks to the heart edge. */
  readonly standOffMm: number;
  /** Captures Trận nhãn (Thiết Giáp Trư, canon §8.2). */
  readonly capturesNodes: boolean;
  /** Thế (canon §10.7): 0 for plain beasts (elites get ELITES.posture). */
  readonly posture: number;
  readonly placeholder: PlaceholderDef;
  /** Lane 5 behaviour numbers the canon leaves to the beast lane (in the def so rulesHash covers it). */
  readonly act?: BeastActDef;
}

/**
 * Behaviour of a species beyond the canon's `BeastDef` fields (Lane 5, data/beasts.ts). `aim`:
 * "heart" walks to the heart edge and bites; "alternate" aims at the heart on an even serial and at
 * the Tâm nhãn on an odd one (no RNG draw). An attack starts within `rangeMm` of its target point
 * (the heart centre or the node point); the next may start `everyMs` after the last one started.
 */
export interface BeastActDef {
  readonly aim: "heart" | "alternate";
  readonly heartAttack: string | null;
  readonly nodeAttack: string | null;
  readonly rangeMm: number;
  readonly everyMs: number;
  /** Flight height, mm (0: ground). */
  readonly flyMm: number;
}

/** One tinh anh trait (canon §10.3). */
export interface EliteTraitDef {
  readonly id: EliteTraitId;
  readonly name: string;
  readonly speedPct: number;
  readonly extraW100: number;
  readonly armourStep: number;
  /** Heals this permille of max HP a second after `regenAfterMs` without a hit. */
  readonly regenPmPerS: number;
  readonly regenAfterMs: number;
}

/** Lang Đầu Đàn (canon §10.4). */
export interface GeneralDef extends BeastDef {
  readonly aura: { readonly radiusMm: number; readonly speedPct: number; readonly family: BeastFamily };
  /** Tru Đàn: telegraph id, what it calls, cooldown, cap a wave. */
  readonly howl: { readonly telegraph: string; readonly species: BeastId; readonly count: number; readonly cooldownMs: number; readonly perWave: number };
}

/** One phase of the Thú Vương (canon §10.5). */
export interface BossPhaseDef {
  /** Phase runs while HP % > this (P1 60, P2 30, P3 0). */
  readonly untilHpPct: number;
  readonly attacks: readonly string[];
  /** Gọi Đàn every this many ms; null: none (P2). */
  readonly summonEveryMs: number | null;
  readonly speedPct: number;
  /** Thiết Bối Xung every this many ms after the last one ended; null: on its own schedule or none. */
  readonly chargeEveryMs: number | null;
}

export interface BossDef extends BeastDef {
  readonly phases: readonly BossPhaseDef[];
  /** One Gọi Đàn: these groups (1 Thạch Thử cluster + 2 Phong Lang). */
  readonly summon: readonly { readonly species: BeastId; readonly count: number; readonly cluster: boolean }[];
  /** Lane 5 movement and cadence numbers the canon leaves open (data/boss.ts). */
  readonly bossAct?: BossActDef;
}

/** Where the Vương stands and how often it pounces (Lane 5); it enters at gate A (canon §13.3, waves.ts). */
export interface BossActDef {
  /** P1: walks to this distance of the Tâm nhãn so the 6 m Vồ Xé cone reaches it. */
  readonly meleeMm: number;
  /** P2, P3: holds this far from the heart centre to charge (a Trận Trụ may stand on the line). */
  readonly chargeFromMm: number;
  /** Vồ Xé every this many ms in P1. */
  readonly voXeEveryMs: number;
  readonly voXe: string;
  readonly charge: string;
  readonly summonCall: string;
}

// ── Content: telegraphs (canon §10.6, §23.3) ────────────────────────────────

export type TelegraphShape = "circle" | "cone" | "line" | "cell";
export type TelegraphAnswer = "seal" | "move" | "ward" | "pillar" | "mech";

/** What a strike does (local applies the player part, D34). */
export interface TelegraphStrike {
  /** Trận Lực lost if the shape touches the heart (× g(K) × preset). */
  readonly formation: number;
  /** Trận Lực lost as permille of its max (Thiết Bối Xung −8 % = 80). */
  readonly formationPm: number;
  /** Sinh lực lost by a player inside at the strike tick (× g(K) × preset). */
  readonly playerHp: number;
  /** Players inside are pushed this far (local), mm. */
  readonly knockMm: number;
}

export interface TelegraphDef {
  readonly id: string;
  readonly shape: TelegraphShape;
  /**
   * Size in mm. `reach`: circle radius, cone or line length, cell side.
   * `width`: across the shape (circle 2 r, cone end chord, line width, cell side);
   * the no-word floor uses width / 2 (canon §10.6).
   */
  readonly sizeMm: { readonly reach: number; readonly width: number };
  /** Has a typed answer: charge ≥ T (CB5). */
  readonly typedAnswer: boolean;
  readonly answers: readonly TelegraphAnswer[];
  /** Fixed charge, or "T" (the preset's T for the answer's longest word). */
  readonly chargeMs: number | "T";
  readonly strike: TelegraphStrike;
}

// ── Content: waves and stage (canon §13, §8.1, §23.3) ───────────────────────

/** One group of a wave. `atMs` scales by 1 / k; the gate rule 1.5 s / 0.6 s clamps after scaling. */
export interface WaveGroupDef {
  readonly atMs: number;
  readonly gate: GateId;
  readonly species: BeastId | GeneralId;
  /** Beasts in the group. */
  readonly count: number;
  /** The group walks as one swarm cluster (one Linh Sa payout when the last dies). */
  readonly cluster?: boolean;
  /** One beast of the group carries this trait. */
  readonly elite?: EliteTraitId;
  /** The group is a thú tướng. */
  readonly general?: boolean;
}

/** canon §23.3 WaveDef; `summonMaxW` is stored in w100 as every W in data (§7.1), hence the name. */
export interface WaveDef {
  readonly id: string;
  readonly durationMs: number;
  readonly gates: readonly GateId[];
  readonly peaks: readonly { readonly atMs: number; readonly lenMs: number }[];
  readonly groups: readonly WaveGroupDef[];
  /** Most W a summoner may call in this wave (Tru Đàn 2 × 3 W = 600), counted in the wave HP. */
  readonly summonMaxW100: number;
}

export interface GateDef {
  readonly id: GateId;
  readonly at: PointMm;
  /** false: the sky route (straight flight, ignores ground mechanisms). */
  readonly ground: boolean;
}

export interface PillarDef {
  readonly id: PillarId;
  readonly at: PointMm;
  readonly radiusMm: number;
}

export type MechSlotKind = "strip" | "post";

export interface MechSlotDef {
  readonly index: number;
  readonly at: PointMm;
  readonly kind: MechSlotKind;
}

/** Thanh Thạch Ải's field (canon §8.1): 40 × 26 m, heart at the origin. */
export interface FieldDef {
  readonly minXMm: number;
  readonly maxXMm: number;
  readonly minZMm: number;
  readonly maxZMm: number;
  readonly barrierRadiusMm: number;
  readonly gates: readonly GateDef[];
  /** Sky entries (±20 m; −18 m). */
  readonly skyEntries: readonly PointMm[];
  readonly pillars: readonly PillarDef[];
  readonly mechSlots: readonly MechSlotDef[];
  readonly nodes: readonly { readonly id: NodeId; readonly at: PointMm }[];
  /** Blocked terrain rectangles for the flow field and player nav (cliffs, Sơn Môn edge). */
  readonly blocked: readonly { readonly from: PointMm; readonly to: PointMm }[];
}

/** f_loại of the Linh Sa fund (canon §14.2). */
export type StageKind = "teach" | "mixed" | "grand" | "m0a";

export interface StageDef {
  readonly id: string;
  readonly name: string;
  /** Cảnh giới K of the chapter. */
  readonly realm: number;
  readonly kind: StageKind;
  readonly field: FieldDef;
  readonly waves: readonly WaveDef[];
  readonly boss: BossId | null;
  /** Live beasts cap of the rules (60 at M0a, D12). */
  readonly liveCap: number;
}

// ── Content: school, mechanisms, consumables ────────────────────────────────

/** Kiểu tung (canon §12.1): khi đi · dừng ngắn có báo · đặt đất. */
export type CastStyle = "move" | "short" | "ground";

/** What a Kiếm skill does (canon §12.1); hit ticks after the Cast tick (§23.3). */
export type SkillEffect =
  | { readonly kind: "auto"; readonly everyMs: number; readonly w100: number; readonly rangeMm: number; readonly hitTick: number }
  | {
      readonly kind: "volley";
      readonly swords: number;
      readonly rangeMm: number;
      readonly pierceSmall: number;
      readonly piercePct: number;
      readonly maxBands: number;
      readonly hitTicks: readonly number[];
    }
  | {
      readonly kind: "line";
      readonly lengthMm: number;
      readonly widthMm: number;
      readonly w100: number;
      readonly falloffPct: number;
      readonly floorPct: number;
      readonly posture: number;
      readonly hitTick: number;
    }
  | { readonly kind: "ward"; readonly radiusMm: number; readonly durationMs: number; readonly charges: number }
  | { readonly kind: "dash"; readonly distanceMm: number; readonly unpushableMs: number }
  | {
      readonly kind: "zone";
      readonly radiusMm: number;
      readonly durationMs: number;
      readonly w100PerS: number;
      readonly slowPct: number;
      readonly capW100: number;
      readonly rangeMm: number;
      readonly openTick: number;
      readonly beatTicks: number;
    }
  | {
      readonly kind: "ultimate";
      readonly radiusMm: number;
      readonly rangeMm: number;
      readonly totalW100: number;
      readonly perBeastCapW100: number;
      readonly posture: number;
      readonly hitTicks: readonly number[];
    };

export interface SkillDef {
  readonly id: string;
  readonly school: SchoolId;
  /** "auto" is đánh nền. Ô 3 has two defs (ward, dash); the loadout picks one. */
  readonly slot: SlotId | "auto";
  readonly name: string;
  /** 0: none (ô 1); ô 5 spends Chân Nguyên instead. */
  readonly cooldownMs: number;
  readonly castStyle: CastStyle;
  readonly effect: SkillEffect;
}

export interface TamPhapDef {
  readonly id: TamPhapId;
  readonly name: string;
  readonly kind: "S" | "R";
}

export type MechanismEffect =
  | { readonly kind: "strip"; readonly slowPct: number; readonly w100PerS: number; readonly lengthMm: number; readonly widthMm: number }
  | { readonly kind: "chain"; readonly everyMs: number; readonly targets: number; readonly rangeMm: number; readonly w100: number }
  | { readonly kind: "snare"; readonly everyMs: number; readonly rangeMm: number; readonly holdMs: number; readonly posture: number };

export interface MechanismDef {
  readonly id: MechanismId;
  readonly name: string;
  readonly slotKind: MechSlotKind;
  readonly price: number;
  readonly damageType: DamageType;
  readonly effect: MechanismEffect;
}

export type ConsumableEffect =
  | { readonly kind: "heal"; readonly pct: number; readonly durationMs: number }
  | { readonly kind: "shield"; readonly pct: number; readonly durationMs: number }
  | { readonly kind: "bomb"; readonly radiusMm: number; readonly rangeMm: number; readonly w100: number };

export interface ConsumableDef {
  readonly id: ConsumableId;
  readonly name: string;
  readonly price: number;
  /** self: `local` applies it (D34); world: the sim applies it. */
  readonly target: "self" | "world";
  readonly effect: ConsumableEffect;
}

// ── Words, deck, replay header (canon §17.1, §23.2) ─────────────────────────

/** One deck word as the replay header holds it (canon §23.2). */
export interface DeckWord {
  /** Learning entity id (normalised text, kit/learning). */
  readonly wordId: string;
  /** Lower case a–z. */
  readonly text: string;
  readonly group: WordGroup;
  /** Shared-learning mastery 0–100 (read only). */
  readonly mastery: number;
  /** Correct recalls (canon §17). */
  readonly recalls: number;
  /** A base word of a cold start (D35): counts as known, used straight in ô 1, ô 3, Tẩy. */
  readonly assumed: boolean;
}

/** A learning record as the learning core returns it, the input of buildDeck (Lane 3 may refine). */
export interface WordRecord {
  readonly wordId: string;
  readonly text: string;
  readonly group: WordGroup;
  readonly level: number;
  readonly mastery: number;
  readonly recalls: number;
}

/** A seat's typing profile in the header: e WPM, a and cv in permille (950 = 95 %). */
export interface SeatProfile {
  readonly e: number;
  readonly a: number;
  readonly cv: number;
}

export interface SeatHeader {
  readonly seat: number;
  readonly profile: SeatProfile;
  /** Pace k × 1000 at load (canon §7.5). */
  readonly kPm: number;
  /**
   * Chớp E_eff × 1000 after the 5-session floor (canon §6.5, §23.2; app/typing-pace.ts flashFloorFor);
   * words.ts uses the profile's E_eff when absent.
   */
  readonly flashEX1000?: number;
}

export interface Loadout {
  readonly guard: GuardChoice;
  readonly tamPhap: TamPhapId;
}

/** Replay header (canon §23.2): everything from outside the sim, written before tick 0. */
export interface ReplayHeader {
  readonly v: 1;
  readonly gameId: "immortality-cultivation";
  readonly rulesHash: string;
  readonly seed: number;
  readonly stageId: string;
  readonly preset: Preset;
  /** The pace director is on (settings "Nhịp tự điều"). */
  readonly pacing: boolean;
  readonly seats: readonly SeatHeader[];
  readonly deck: readonly DeckWord[];
  /** New words this match may bring (sổ cái `remaining` at load; ≤ 4 with > 80 due, canon §6.4). */
  readonly newWordAllowance: number;
  readonly loadout: Loadout;
}

// ── Commands (M0A_PLAN §3.3) ────────────────────────────────────────────────

/** A beast in the store: `slot` is reused, `serial` never (stable id for view and commands). */
export interface BeastRef {
  readonly slot: number;
  readonly serial: number;
}

export type SimCommand =
  /** a–z as 0–25. `ms` is wall time for learning only, never hashed. `aim`: cursor on the ground (ô 4, ô 5), else null. */
  | { readonly type: "key"; readonly seat: number; readonly letter: number; readonly ms: number; readonly origin: PointU; readonly aim: PointU | null }
  | { readonly type: "backspace"; readonly seat: number }
  /** Esc while a word is locked (D19: errors stay). */
  | { readonly type: "release"; readonly seat: number }
  /** Left click on a beast (or on the ground: null). */
  | { readonly type: "soft-target"; readonly seat: number; readonly beast: BeastRef | null }
  /** Đánh nền from `local` at the school's rate; the sim checks range from `origin`. */
  | { readonly type: "auto"; readonly seat: number; readonly beast: BeastRef; readonly origin: PointU }
  /** Sinh lực 0 in `local`: Trận Lực −5 % (solo), the seat is down 8 s. */
  | { readonly type: "down"; readonly seat: number; readonly origin: PointU }
  /** `local` blocked a hit with this ward: one charge less (clamped at 0). */
  | { readonly type: "ward-use"; readonly seat: number; readonly wardId: number }
  /** Key 1/2/3 → slot 0/1/2. */
  | { readonly type: "consumable"; readonly seat: number; readonly slot: number; readonly origin: PointU; readonly aim: PointU | null }
  | { readonly type: "buy"; readonly seat: number; readonly item: ConsumableId }
  /** Build a mechanism on map slot 0–5. */
  | { readonly type: "place"; readonly seat: number; readonly slot: number; readonly mech: MechanismId }
  | { readonly type: "upgrade"; readonly seat: number; readonly slot: number }
  | { readonly type: "sell"; readonly seat: number; readonly slot: number }
  /** Prep only: ô 3 and the tâm pháp. */
  | { readonly type: "loadout"; readonly seat: number; readonly guard: GuardChoice; readonly tamPhap: TamPhapId }
  /** Enter in prep: wave 1's warning starts. */
  | { readonly type: "start" }
  /** Enter in a break that waits for it (Thư giãn, Học). */
  | { readonly type: "continue" }
  /** Prep: one Học trước word typed (Linh Sa per word, canon §14.2). */
  | { readonly type: "learn-ahead"; readonly seat: number; readonly wordId: string; readonly correct: boolean }
  /** Break: one Thẻ Ôn answer. */
  | { readonly type: "review-card"; readonly seat: number; readonly wordId: string; readonly correct: boolean }
  /** First match of an "unknown" profile: k from wave 1's measure, applied from wave 2 (canon §6.5). */
  | { readonly type: "pace-update"; readonly seat: number; readonly kPm: number };

export type SimCommandType = SimCommand["type"];

/** Inputs of the `local` layer only (replayed, never sent to the world). Arrows mask: up 1, down 2, left 4, right 8. */
export type LocalInput = { readonly type: "move-to"; readonly point: PointU } | { readonly type: "arrows"; readonly mask: number };

export const ARROW_MASK = { up: 1, down: 2, left: 4, right: 8 } as const;

/** One replay body entry at the tick it applies (canon §23.2). */
export type ReplayEntry = { readonly tick: number; readonly command: SimCommand } | { readonly tick: number; readonly local: LocalInput };

/** Replay tail: both hashes every 600 ticks and at the end. */
export interface ReplayHashes {
  readonly tick: number;
  readonly world: string;
  readonly local: string;
}

export interface Replay {
  readonly header: ReplayHeader;
  readonly body: readonly ReplayEntry[];
  readonly tail: readonly ReplayHashes[];
}

// ── Events (M0A_PLAN §3.4) ──────────────────────────────────────────────────

/** Match phases (canon §4.1): prep → warning → wave → break → … → lull → boss → victory | defeat. */
export type Phase = "prep" | "warning" | "wave" | "break" | "lull" | "boss" | "victory" | "defeat";

export type CastState = "held" | "resolved" | "fizzled";

/** What dealt a hit or a kill (share buckets, reports). */
export type HitSource =
  | "auto"
  | "slot1"
  | "slot2"
  | "slot4"
  | "slot5"
  | "seal"
  | "cleanse"
  | "mechanism"
  | "consumable"
  | "formation";

/** Share buckets (canon §7.3): typed by slot, auto, support (mechanism + consumable + formation). */
export type ShareBucket = "typed" | "auto" | "mechanism" | "consumable" | "formation";

/** What a Bàn Quyết entry is: one of the 5 slots, an Ấn on a beast, or Tẩy on a node. */
export type WordSlotKind = "slot" | "seal" | "cleanse";

export type WordKeyResult = "lock" | "advance" | "done" | "wrong" | "stray" | "back" | "asleep";
export type WordReleaseReason = "done" | "target-gone" | "released" | "down" | "phase" | "replaced" | "fizzled";

export type LinhSaReason = "start" | "kill" | "wave-end" | "learn-ahead" | "review-card" | "build" | "upgrade" | "sell" | "buy" | "consume";

/** Every event carries its tick. Positions are metres for readers; the sim never reads events back. */
export type SimEvent = { readonly tick: number } & (
  | { readonly type: "phase"; readonly phase: Phase; readonly wave: number; readonly endsAtTick: number }
  | { readonly type: "wave-start"; readonly wave: number; readonly waves: number; readonly gates: readonly GateId[] }
  | { readonly type: "wave-end"; readonly wave: number }
  | { readonly type: "victory"; readonly stars: 1 | 2 | 3 }
  | { readonly type: "defeat"; readonly wave: number }
  | {
      readonly type: "spawn";
      readonly beast: BeastRef;
      readonly species: SpeciesId;
      readonly gate: GateId;
      readonly x: number;
      readonly z: number;
      readonly elite: EliteTraitId | null;
      readonly cluster: number;
      readonly summoned: boolean;
    }
  | {
      readonly type: "death";
      readonly beast: BeastRef;
      readonly species: SpeciesId;
      readonly by: HitSource;
      readonly x: number;
      readonly z: number;
      /** Cluster id (−1 none) and whether this was its last beast. */
      readonly cluster: number;
      readonly clusterDone: boolean;
      readonly tier: FeedbackTier;
    }
  | {
      readonly type: "hit";
      readonly beast: BeastRef;
      readonly amount: number;
      readonly damageType: DamageType;
      readonly bucket: ShareBucket;
      readonly source: HitSource;
      readonly seat: number;
      readonly grade: Grade | null;
      readonly tier: FeedbackTier;
      readonly x: number;
      readonly z: number;
      readonly hpLeft: number;
    }
  | {
      readonly type: "cast";
      readonly state: CastState;
      readonly seat: number;
      readonly slot: SlotId | "seal" | "cleanse";
      readonly actionId: number;
      readonly wordId: string;
      readonly origin: PointU;
    }
  | {
      readonly type: "skill-fx";
      readonly seat: number;
      readonly skill: string;
      readonly stage: "volley" | "line" | "zone-open" | "zone-close" | "ultimate" | "auto";
      readonly x: number;
      readonly z: number;
      readonly toX: number;
      readonly toZ: number;
      /** Swords or strikes in this beat (view picks the visual count from the tier). */
      readonly count: number;
    }
  /**
   * Shapes in metres (`local` tests itself against them at the strike tick, D34): circle centred on
   * (toX, toZ) with radius reachM; cone from its apex (x, z) towards (toX, toZ), length reachM, end
   * chord widthM; line from (x, z) towards (toX, toZ), length reachM, width widthM; cell a square of
   * side reachM centred on (toX, toZ).
   */
  | {
      readonly type: "telegraph";
      readonly stage: "start" | "strike" | "cancel";
      readonly id: number;
      readonly def: string;
      readonly shape: TelegraphShape;
      readonly x: number;
      readonly z: number;
      readonly toX: number;
      readonly toZ: number;
      readonly reachM: number;
      readonly widthM: number;
      readonly strikeTick: number;
      readonly answers: readonly TelegraphAnswer[];
      readonly source: BeastRef | null;
    }
  | { readonly type: "posture"; readonly stage: "change" | "break" | "recover"; readonly beast: BeastRef; readonly value: number; readonly max: number }
  | {
      readonly type: "formation";
      readonly what: "heart" | "node-off" | "node-on" | "linh-dich";
      readonly heart: number;
      readonly heartMax: number;
      readonly node: NodeId | null;
    }
  | { readonly type: "pillar"; readonly stage: "hit" | "crack"; readonly pillar: PillarId; readonly rams: number }
  | {
      readonly type: "mechanism";
      readonly stage: "trigger" | "built" | "upgraded" | "sold";
      readonly slot: number;
      readonly mech: MechanismId;
      readonly level: number;
      readonly x: number;
      readonly z: number;
    }
  | { readonly type: "consumable"; readonly seat: number; readonly kind: ConsumableId; readonly x: number; readonly z: number }
  | { readonly type: "ward"; readonly stage: "start" | "block" | "end"; readonly wardId: number; readonly seat: number; readonly origin: PointU; readonly charges: number }
  | { readonly type: "linh-sa"; readonly seat: number; readonly delta: number; readonly total: number; readonly reason: LinhSaReason }
  | {
      readonly type: "word-assigned";
      readonly seat: number;
      /** Word store index. */
      readonly word: number;
      readonly kind: WordSlotKind;
      readonly slot: SlotId | null;
      readonly wordId: string;
      readonly text: string;
      readonly group: WordGroup;
      readonly assumed: boolean;
      readonly beast: BeastRef | null;
      readonly node: NodeId | null;
    }
  | { readonly type: "word-progress"; readonly seat: number; readonly word: number; readonly typed: number; readonly result: WordKeyResult; readonly letter: number }
  | {
      readonly type: "word-complete";
      readonly seat: number;
      readonly word: number;
      readonly wordId: string;
      readonly text: string;
      readonly grade: Grade;
      readonly errors: number;
      /** First key to last key, ticks. */
      readonly keyTicks: number;
      /** Wall time from the keys' `ms`, learning only. */
      readonly responseMs: number;
      readonly activity: ActivityType;
      /** The one scored learning event of this word in this match (canon §17). */
      readonly scored: boolean;
      readonly hintUsed: boolean;
      readonly channel: Channel;
    }
  | { readonly type: "word-released"; readonly seat: number; readonly word: number; readonly reason: WordReleaseReason }
  | { readonly type: "grade"; readonly seat: number; readonly word: number; readonly grade: Grade; readonly mqPm: number }
  /** A new word met for the first time: the app calls the ledger's `take` (canon §6.4). */
  | { readonly type: "word-first-seen"; readonly seat: number; readonly wordId: string; readonly channel: NewWordChannel }
  /** The pace director stepped (canon §13.2). */
  | { readonly type: "pace"; readonly lever: "spawn" | "elite" | "peak" | "lull" | "linh-dich"; readonly dir: 1 | -1; readonly amount: number; readonly spawnPm: number; readonly level: number }
  | { readonly type: "pace-update"; readonly seat: number; readonly kPm: number }
  | { readonly type: "rejected"; readonly command: SimCommandType; readonly reason: string }
  // From the `local` layer (its own event list, drained by the app with the world's).
  | { readonly type: "player-hit"; readonly seat: number; readonly amount: number; readonly blocked: boolean; readonly x: number; readonly z: number }
  | { readonly type: "player-down"; readonly seat: number; readonly x: number; readonly z: number }
  | { readonly type: "player-up"; readonly seat: number; readonly x: number; readonly z: number }
);

export type SimEventType = SimEvent["type"];
/** The event of one type, e.g. `EventOf<"hit">`. */
export type EventOf<T extends SimEventType> = Extract<SimEvent, { readonly type: T }>;

/** The world's output queue (sim/events.ts EventQueue implements it); not hashed. */
export interface EventSink {
  push(event: SimEvent): void;
  /** Everything since the last drain, oldest first (the app, once a frame). */
  drain(): SimEvent[];
  /** Events of the last completed tick, without draining (the `local` layer reads its consumable, ward, cast, telegraph events). */
  lastTick(): readonly SimEvent[];
  /** The world's step closes its tick: what it pushed becomes `lastTick()` (optional, so hand-made test sinks still fit). */
  endTick?(): void;
  readonly length: number;
}

/** One entry of the new-word ledger (canon §6.4). */
export interface NewWordEntry {
  readonly wordId: string;
  readonly firstSeenMs: number;
  readonly channel: NewWordChannel;
}

/** The ledger's snapshot, stored as `.newwords` v1 (canon §6.4, §23.1). */
export interface NewWordsSnapshot {
  readonly v: 1;
  readonly entries: readonly NewWordEntry[];
}

// ── World state (canon §23.3: every field declared at step 0) ───────────────

/** Static inputs the per-system create functions get; the world does not exist yet. */
export interface WorldInit {
  readonly stage: StageDef;
  readonly header: ReplayHeader;
  readonly seed: number;
  readonly preset: Preset;
  readonly realm: number;
  /** g(K) × 1000 (canon §7.1). */
  readonly gPm: number;
  readonly seats: number;
  readonly rng: Rng;
}

/** One seat: the person or bot in it (canon §19.1). Owner: Lane 2 (kPm, downUntil), Lane 4 (chanNguyenPm), Lane 3 (softTarget). */
export interface SeatState {
  readonly seat: number;
  readonly human: boolean;
  readonly profile: SeatProfile;
  /** Pace k × 1000; `pace-update` may change it from wave 2 (canon §6.5). */
  kPm: number;
  /** Changed by `loadout` in prep. */
  loadout: Loadout;
  /** Chân Nguyên × 1000 (0–100 000), resolved Casts only, × 1 / k (canon §6.6). */
  chanNguyenPm: number;
  /** Tick the seat stands up after `down` (−1: standing). */
  downUntil: number;
  softTarget: BeastRef | null;
  /** Last resolved Cast tick (Dưỡng window, canon §8.2). */
  lastResolvedTick: number;
}

/** What a beast aims at (canon §10.1): never a real player. */
export type TargetRef =
  | { readonly kind: "heart" }
  | { readonly kind: "node"; readonly node: NodeId }
  | { readonly kind: "pillar"; readonly pillar: PillarId }
  | { readonly kind: "gate"; readonly gate: GateId }
  | { readonly kind: "bot"; readonly seat: number }
  | { readonly kind: "taunt"; readonly seat: number }
  | { readonly kind: "zone"; readonly telegraph: number };

export type BeastMode = "walk" | "bite" | "hold" | "throw" | "dive" | "ram" | "capture" | "stunned" | "downed" | "roar" | "leave";

/** Thế of an elite, general or boss (canon §10.7). */
export interface PostureState {
  value: number;
  max: number;
  /** Phá thế ends (−1: not broken). */
  brokenUntil: number;
  /** No Thế loss until this tick (15 s after a break). */
  immuneUntil: number;
  /** Typed HP carried below one whole W (Lane 5 posture.ts postureFromTypedHp: 1 Thế per whole W). */
  typedHp?: number;
}

/** One slow on a beast (canon §7.2: different sources multiply, same source keeps the strongest, total ≤ 60 %). */
export interface SlowEntry {
  readonly source: string;
  pct: number;
  until: number;
}

/** One beast. Owner: Lane 2 (alloc, spawn, movement on the field), Lane 5 (behaviour, posture, attacks), Lane 4 (hp via damageBeast). */
export interface BeastState {
  readonly slot: number;
  serial: number;
  alive: boolean;
  /** Cleanup handled the death and freed the slot. */
  freed: boolean;
  species: SpeciesId;
  tier: BeastTier;
  /** Wave it belongs to (summons belong to the running wave, canon §4.1); 0: boss phase. */
  wave: number;
  gate: GateId;
  summoned: boolean;
  elite: EliteTraitId | null;
  general: boolean;
  boss: boolean;
  /** Swarm cluster id (−1: none). */
  cluster: number;
  // Position (u) and movement (Lane 2 field.ts, Lane 5 beasts.ts).
  x: number;
  z: number;
  /** Height above ground (flyers), u. */
  y: number;
  /** Flow-field cell index (−1: off the grid, flyers). */
  cell: number;
  /**
   * Walk speed after preset and traits, in u per tick × 1000 (N mm/s is N u per tick, so a
   * 1.4 m/s beast at preset 1.00 holds 1 400 000). sim/field.ts fieldStep moves round(speedPm / 1000)
   * u a tick unless the caller passes the step with its slows applied.
   */
  speedPm: number;
  bornAt: number;
  // Combat (Lane 4 combat.ts).
  hp: number;
  hpMax: number;
  armour: ArmourTier;
  resist: ArmourTier;
  /** ĐĐ (canon §14.2) × 100: W at K0 Cân bằng, elite × 1.6, summons 50 %. */
  threatW100: number;
  lastHitTick: number;
  killedBy: HitSource | null;
  killedBySeat: number;
  // Behaviour (Lane 5).
  mode: BeastMode;
  modeUntil: number;
  target: TargetRef | null;
  /** Next bite or attack tick (−1: none). */
  attackAt: number;
  /** Active telegraph id (−1: none). */
  telegraph: number;
  posture: PostureState | null;
  slows: SlowEntry[];
  /** Hard control (root, stun, down) ends; ticks under it (35 % cap, canon §8.3). */
  hardUntil: number;
  hardTicks: number;
  /** Live Ấn word index (−1: none). */
  seal: number;
  /** Thú tướng: Tru Đàn uses this wave and the next ready tick. */
  howls: number;
  howlReadyAt: number;
  /** Bite remainder carried between bites, ‰ of one Trận Lực point (Lane 5 pressure.ts). */
  biteCarryPm?: number;
}

export interface BeastStore {
  readonly list: BeastState[];
  readonly free: number[];
  nextSerial: number;
  live: number;
  nextCluster: number;
}

/** A group waiting for its tick or for room at its gate (canon §4.1, §13.3). */
export interface PendingGroup {
  /** Tick it may leave its gate (the director may move it: spawn gaps, peak, lull). */
  tick: number;
  readonly wave: number;
  /** The plan's group; the director may swap in a copy with one elite trait more or less. */
  group: WaveGroupDef;
  readonly summoned: boolean;
  /** Queue order among groups of the same tick (stable). */
  readonly seq: number;
}

/** Lane 2 waves.ts. */
export interface WaveState {
  /** Current or last wave, 1-based (0 before wave 1). */
  index: number;
  readonly total: number;
  /** Tick the running wave started (its clock only drives the spawn schedule). */
  startedAt: number;
  groupsTotal: number;
  groupsSpawned: number;
  /** Highest wave whose end (wave-end event, Linh Sa) was handled. */
  endedThrough: number;
  /** Breaks so far (Thẻ Ôn pay divides by the stage's break count). */
  breaks: number;
  /**
   * Kept false at M0a: the app stops stepping the world while a panel is open (M0A_PLAN §6.9),
   * which stops the break clock without a flag outside the replay.
   */
  breakHeld: boolean;
  lullStarted: boolean;
  /** The boss is on the field (it waits at gate A for room under the live cap). */
  bossStarted: boolean;
  /** Live beasts per wave index; index 0 is the boss phase (the boss and its Gọi Đàn). */
  liveByWave: number[];
}

/** Lane 2 spawn.ts. */
export interface SpawnState {
  /** Waiting groups by (tick, seq). */
  readonly pending: PendingGroup[];
  /** Next tick each gate may release a group (A, B, sky). */
  readonly gateReadyAt: number[];
  /** Last release on any gate (0.6 s between gates). */
  lastReleaseAt: number;
  /** Ticks a ready group waited because of the live cap. */
  capWaitTicks: number;
  nextSeq: number;
}

/** The kit's pace director and flow meter (kit balance/director.ts, flow.ts); hashed through `hashState()` only. */
export interface DirectorKit {
  readonly meter: FlowMeter;
  readonly pace: PaceDirector;
  /** Every number of both, integers (sim/hash.ts walks this instead of the objects). */
  hashState(): number[];
}

/** Lane 2 director.ts (kit PaceDirector, canon §13.2). */
export interface DirectorState {
  readonly enabled: boolean;
  /** Net steps (+ harder). */
  level: number;
  stepsThisWave: number;
  /** Spawn gap scale ‰ (±15 % a match); HP stays 1000 (the director never changes HP at M0a). */
  spawnPm: number;
  hpPm: number;
  /** Tick of the last judgement (−1: none). */
  lastEvalTick: number;
  /** Wave a Linh Dịch dropped in (one a wave; 0: none yet). */
  linhDichWave: number;
  /** Composition change charged by elite steps, ‰ of the stage's W (±10 % a match). */
  compositionPm: number;
  /** Next trait an elite step adds (cycles Cuồng, Thiết Bì, Hồi Nguyên). */
  eliteCursor: number;
  /** Fed to the meter once a tick: kills this tick (‰ of the route walked), dropped locks, damage counters at the last feed. */
  readonly kills: number[];
  abandons: number;
  lastTyped: number;
  lastOther: number;
  readonly kit: DirectorKit;
}

/** One flow field (Lane 2 field.ts), per cell of the 0.5 m grid. */
export interface FlowField {
  /** Grid cost to the heart edge (10 a straight step, 14 a diagonal; 0 at the edge; −1 unreachable). */
  readonly steps: Int32Array;
  /** Cell to walk towards (string-pulled); −2: the heart itself in a straight line; −1: unreachable. */
  readonly waypoint: Int32Array;
  /** Path length from the cell's centre to the heart's centre along the pulled path, u (−1 unreachable). */
  readonly pathU: Int32Array;
}

/** Flow fields (Lane 2 field.ts): derived from the stage and pillars, rebuilt when obstacles change; never hashed. */
export interface FieldRuntime {
  readonly cols: number;
  readonly rows: number;
  readonly cellMm: number;
  readonly cellU: number;
  /** North-west corner of the grid, u. */
  readonly minXU: number;
  readonly minZU: number;
  /** 1 where beasts may not stand (terrain, Trận Trụ, with FIELD.clearanceMm). */
  blocked: Uint8Array;
  /** One field per ground gate towards the heart; at M0a both gates share one (corridors per gate come with later stages). */
  flows: Readonly<Record<"A" | "B", FlowField>>;
  /** Bumped on every rebuild (readers cache by it). */
  version: number;
}

/** One Bàn Quyết entry (Lane 3 words.ts). */
export type LiveWordState = "ready" | "typing" | "held" | "cooldown" | "waiting" | "dim";

export interface LiveWord {
  readonly index: number;
  seat: number;
  kind: WordSlotKind;
  slot: SlotId | null;
  beast: BeastRef | null;
  node: NodeId | null;
  /** Deck index (header.deck) and its text. */
  deck: number;
  wordId: string;
  text: string;
  group: WordGroup;
  assumed: boolean;
  typed: number;
  errors: number;
  firstKeyTick: number;
  state: LiveWordState;
  /** Cooldown, held or rest end (−1: none). */
  until: number;
  /** Next word shown dim at 50 % while cooling down (deck index, −1 none). */
  next: number;
  // Lane 3 words.ts.
  /** Word slot in the seat's kit session (−1: not live). */
  kitSlot: number;
  /** Tick it went live (−1: not live). */
  born: number;
  /** The meaning or IPA shows while it is typed: reported as `hintUsed`. */
  hint: boolean;
  /** The entry waits in a jam (counted once per jam). */
  jammed: boolean;
  /** Fallback step it was dealt at (typing/fallback.ts). */
  step: FallbackStep;
  /** Its first key came (the recognition time of a new word is measured once). */
  firstLocked: boolean;
}

/** Fallback order of canon §6.2 (typing/fallback.ts): exact, length ±1, more familiar kind, then jam. */
export type FallbackStep = "exact" | "length" | "familiar" | "jam";

/** Per deck word use in this match (canon §6.4 meetings, §17 one scored event). */
export interface DeckUse {
  meetings: number;
  lastMeetTick: number;
  scored: boolean;
  /** Met first in this match (a new word that went through the ledger). */
  firstSeenTick: number;
}

export interface SeatWords {
  /** Locked word index (−1: none). */
  locked: number;
  /** Live word index per slot 1–5 (index 0 unused, −1 none). */
  readonly slots: number[];
  readonly seals: number[];
  cleanse: number;
}

export interface WordsState {
  readonly live: LiveWord[];
  readonly free: number[];
  readonly seats: SeatWords[];
  readonly deckUse: DeckUse[];
  /** New words already used of header.newWordAllowance. */
  newUsed: number;
  /** Tick each letter a–z may start a live word again (1 s rest, canon §6.2). */
  readonly letterRest: number[];
  /** Live-word cap this match: min(preset cap; A − 3). */
  liveCap: number;
  /** kit WordPicker bag (deck indexes) per slot kind. */
  readonly bags: number[][];
  // Lane 3 words.ts.
  /** kit typing session per seat: first letters, router, live words. */
  readonly sessions: TypingSession[];
  /** kit live-word ledger per seat (sources: slot, seal, urgent; typing/fallback.ts SOURCES). */
  readonly ledgers: BudgetLedger[];
  /** kit deck index → header deck index, and back (−1: not dealable). */
  readonly deckOf: number[];
  readonly kitOf: number[];
  /** Picker bags: `bags[b]` is the order (header deck indexes), `bagKeys[b]` its key, `bagNext[b]` words dealt this round. */
  readonly bagKeys: string[];
  readonly bagNext: number[];
  /** Per seat: Chớp E_eff × 1000, E for word lengths (WPM), whether the Bàn Quyết is awake. */
  readonly flashE: number[];
  readonly wpm: number[];
  readonly awake: boolean[];
  /** Per seat: no fresh new word for the rest of this wave (a new word took > 1.5 s to start); 0 none. */
  readonly newPauseWave: number[];
  /** Per seat: tick of the last letter key while the Bàn Quyết was live (−1 none): a new word's recognition time counts from it. */
  readonly lastKeyTick: number[];
}

/** One Cast (canon §6.1). */
export interface Cast {
  readonly seat: number;
  readonly slot: SlotId | "seal" | "cleanse";
  /** seat × 2^20 + n. */
  readonly actionId: number;
  readonly wordId: string;
  readonly tick: number;
  readonly channel: Channel;
  readonly quality: Grade;
  readonly origin: PointU;
  readonly aim: PointU | null;
  state: CastState;
  /** Held Casts fizzle at this tick (3 s). */
  heldUntil: number;
  readonly target: BeastRef | null;
  readonly node: NodeId | null;
}

/** Lane 3 cast.ts. */
export interface CastsState {
  readonly held: Cast[];
  /** Next n per seat. */
  readonly nextAction: number[];
  resolved: number;
  fizzled: number;
  /** Per seat: n of the last Cast emitted (actionId = seat × 2^20 + n); a Cast at or below it is a duplicate. */
  readonly lastAction: number[];
  /** Duplicate Casts dropped (CB6: always 0 in a healthy run). */
  duplicates: number;
}

/** A hit scheduled for its hit tick (Lane 4 skills.ts, canon §12.1). */
export interface PendingStrike {
  readonly id: number;
  readonly tick: number;
  readonly seat: number;
  readonly skill: string;
  readonly source: HitSource;
  readonly actionId: number;
  target: BeastRef | null;
  readonly at: PointU;
  readonly amount: number;
  readonly grade: Grade | null;
  readonly posture: number;
}

/** A Lạc Kiếm Trận zone (ô 4). */
export interface SkillZone {
  readonly id: number;
  readonly seat: number;
  readonly skill: string;
  readonly at: PointU;
  readonly radiusU: number;
  readonly untilTick: number;
  nextBeat: number;
  /** HP dealt so far against its 4 W cap. */
  dealt: number;
  readonly cap: number;
}

export interface SeatSkills {
  /** Cooldown end per slot 1–5 (index 0 unused). */
  readonly cooldownUntil: number[];
  /** Ô 1 bands waiting (≤ 2). */
  bands: number;
  /** Kiếm Tâm extra sword, at most once every 3 s. */
  kiemTamReadyAt: number;
  /** Tích Kiếm ‰ (−8 % wave 1, +4 % a wave held, cap +24 %). */
  tichKiemPm: number;
}

export interface SkillsState {
  readonly seats: SeatSkills[];
  readonly strikes: PendingStrike[];
  readonly zones: SkillZone[];
  nextId: number;
}

/** Hộ thân world object (canon §9.1, §23.3). */
export interface Ward {
  readonly id: number;
  readonly seat: number;
  readonly originU: PointU;
  readonly radiusU: number;
  readonly untilTick: number;
  charges: number;
}

export interface WardsState {
  readonly list: Ward[];
  nextId: number;
}

export interface NodeState {
  readonly id: NodeId;
  readonly at: PointU;
  on: boolean;
  capturedBy: BeastRef | null;
  /** A capturer started standing here (−1: none). */
  captureFrom: number;
  /** Tẩy typed: lights again at this tick (−1: none). */
  relightAt: number;
  /** Live Tẩy word index (−1: none). */
  cleanse: number;
}

export interface PillarState {
  readonly id: PillarId;
  readonly at: PointU;
  readonly radiusU: number;
  rams: number;
  cracked: boolean;
}

/** Lane 4 formation.ts (canon §8.2). */
export interface FormationState {
  heart: number;
  readonly heartMax: number;
  readonly nodes: NodeState[];
  readonly pillars: PillarState[];
  /** Dưỡng healed so far (cap 15 % a match). */
  duongHealed: number;
  lastHeartHitTick: number;
}

export interface MechSlotState {
  readonly index: number;
  mech: MechanismId | null;
  level: number;
  /** Linh Sa paid in (refund base). */
  paid: number;
  /** Break id it was built or upgraded in (same-break sell refunds 100 %). */
  breakId: number;
  nextFire: number;
}

export interface MechanismsState {
  readonly slots: MechSlotState[];
}

export interface Wallet {
  linhSa: number;
  /** Thú Hạch of this match (kept 50 % on defeat). */
  thuHach: number;
}

/** Lane 4 economy.ts (canon §14.2, D34: wallets per seat live in the world). */
export interface EconomyState {
  readonly wallets: Wallet[];
  /** ΣĐĐ of the match × 100 (WaveDef, max summons at 50 %, no boss). */
  readonly sumThreatW100: number;
  /** The fund 900 × f. */
  readonly fund: number;
  paidKills: number;
  paidWaveEnds: number;
  paidLearning: number;
}

export interface ShopState {
  /** Increments at every break start (prep is 0). */
  breakId: number;
}

export interface SeatConsumables {
  readonly slots: { item: ConsumableId | null; count: number }[];
  cooldownUntil: number;
}

export interface ConsumablesState {
  readonly seats: SeatConsumables[];
}

/** Damage share ledger (canon §7.3): effective damage (≤ HP left) by source. */
export interface ShareLedger {
  /** Typed by slot 1–5 (index 0 unused). */
  readonly typedBySlot: number[];
  seal: number;
  cleanse: number;
  auto: number;
  mechanism: number;
  consumable: number;
  formation: number;
}

export interface ActiveTelegraph {
  readonly id: number;
  readonly def: string;
  readonly source: BeastRef | null;
  readonly from: PointU;
  readonly to: PointU;
  readonly reachU: number;
  readonly widthU: number;
  readonly startTick: number;
  strikeTick: number;
  cancelled: boolean;
}

/** Lane 5 telegraph.ts. */
export interface TelegraphsState {
  readonly active: ActiveTelegraph[];
  nextId: number;
}

/** Lane 5 boss.ts (canon §10.5). */
export interface BossState {
  beast: BeastRef | null;
  /** 0 before the boss, then 1–3. */
  phase: number;
  roarUntil: number;
  nextSummon: number;
  nextCharge: number;
  /** W × 100 called by Gọi Đàn so far (≤ 30 % W_Vương). */
  summonedW100: number;
  /** The Vương died (Lane 2's victory check may read it). */
  defeated?: boolean;
  /** Live Gọi Đàn and Thiết Bối Xung telegraph ids (−1: none). */
  summonTelegraph?: number;
  chargeTelegraph?: number;
  /** Tru Đàn W × 100 called in wave `waveSummonWave` (≤ its WaveDef.summonMaxW100). */
  waveSummonWave?: number;
  waveSummonW100?: number;
}

/** Counters the bots and reports read (Lane 7). */
export interface RunStats {
  keys: number;
  wrongKeys: number;
  strayKeys: number;
  words: number;
  /** Words by grade: flash, perfect, good, ok, sloppy. */
  readonly grades: number[];
  castsHeld: number;
  castsResolved: number;
  castsFizzled: number;
  kills: number;
  maxLive: number;
  maxLiveWords: number;
  /** "nghẽn chữ đầu" and "nghẽn" of the fallback (canon §6.2). */
  firstLetterJams: number;
  fallbackJams: number;
  /** Base-word uses by slot 1–5, then seal, cleanse (index 0 unused). */
  readonly baseWordUses: number[];
  foeTicks: number;
  hardControlTicks: number;
  heartLost: number;
  downs: number;
  linhSaEarned: number;
  linhSaSpent: number;
}

/** Wall-clock values the rules never read (not hashed). */
export interface WallState {
  /** Last key `ms` per seat. */
  readonly lastKeyMs: number[];
  /** Per live word index: wall ms of its first and last key (learning only; Lane 3 words.ts). */
  wordFirstMs?: number[];
  wordLastMs?: number[];
}

export interface World {
  // Static inputs: never hashed (sim/world.ts HASH_SKIP).
  readonly stage: StageDef;
  readonly header: ReplayHeader;
  readonly field: FieldRuntime;
  // Match constants.
  readonly seed: number;
  readonly preset: Preset;
  readonly realm: number;
  readonly gPm: number;
  readonly liveCap: number;
  readonly newWordAllowance: number;
  readonly rng: Rng;
  // Clock and flow (Lane 2).
  tick: number;
  phase: Phase;
  /** Tick the current phase ends (−1: waits for a command or a condition). */
  phaseEndsAt: number;
  readonly seats: SeatState[];
  // Systems, one per lane-owned file.
  readonly beasts: BeastStore;
  readonly waves: WaveState;
  readonly spawn: SpawnState;
  readonly director: DirectorState;
  readonly words: WordsState;
  readonly casts: CastsState;
  readonly skills: SkillsState;
  readonly wards: WardsState;
  readonly formation: FormationState;
  readonly mechanisms: MechanismsState;
  readonly economy: EconomyState;
  readonly shop: ShopState;
  readonly consumables: ConsumablesState;
  readonly shares: ShareLedger;
  readonly telegraphs: TelegraphsState;
  readonly boss: BossState;
  readonly stats: RunStats;
  // Not hashed.
  readonly wall: WallState;
  readonly events: EventSink;
}

// ── The local layer (canon §9.1, D34): this machine's player ────────────────

export interface BarrierBuff {
  inside: boolean;
  /** Buff stays until this tick after leaving (1.5 s), then fades until `fadeUntil` (3 s). */
  graceUntil: number;
  fadeUntil: number;
  /** Re-entry joins after 1 s. */
  joinAt: number;
}

/** Lane 2 local/**. Hashed by hashLocal except `outbox` and `events`. Positions u, directions ‰ (unit vector × 1000). */
export interface LocalState {
  readonly seat: number;
  /** The world tick this layer runs before (set by stepLocal). */
  tick: number;
  x: number;
  z: number;
  hp: number;
  hpMax: number;
  shield: number;
  shieldUntil: number;
  /** Hồi Xuân Đan over 2 s: the dose, HP left to give, its first tick and its end (evenly over the ticks between). */
  healTotal: number;
  healLeft: number;
  healFrom: number;
  healUntil: number;
  down: boolean;
  downUntil: number;
  /** Right-click goal and the pulled path to it (waypoints, u). */
  moveTarget: PointU | null;
  readonly path: PointU[];
  /** Arrow keys held: up 1, down 2, left 4, right 8 (types.ts ARROW_MASK). */
  arrows: number;
  /** Unpushable until (Lưu Quang Bộ 0.3 s); the glide runs while `dashLeft` > 0. */
  dashUntil: number;
  dashLeft: number;
  dashX: number;
  dashZ: number;
  /** Last walk direction (the dash goes this way); north at the start. */
  facingX: number;
  facingZ: number;
  barrier: BarrierBuff;
  /** Next đánh nền command tick. */
  autoNext: number;
  /** Highest telegraph id whose strike this layer already handled. */
  lastStrikeSeen: number;
  /** Highest world tick whose events this layer has read (never twice). */
  seenTick: number;
  /** Commands for the next world tick (drainLocalCommands). */
  readonly outbox: SimCommand[];
  /** player-hit, player-down, player-up for the app. */
  readonly events: SimEvent[];
}
