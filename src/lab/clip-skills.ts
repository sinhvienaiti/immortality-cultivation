/**
 * Castable clip skills (docs/work/tasks/lab-castable-skills.md; owner 06/11 00:05: "tạm thời chưa cần chấm, tôi sẽ là
 * người chấm, bạn hãy bắt đầu triển khai từng cái vào lab để nó thành skill để tôi test là được"): a showcase item
 * (showcase.ts) cast on the lab's herd. One data table (ClipSkill rows), one runner (ClipSkillRunner), no code per skill.
 * The runner aims by the skill's shape from where the beasts stand (8 m cells, as key 7 groups them; no beast: the
 * field's middle), stands the clip there, marks the ground MARK_S before a blow from the sky (REF_VIDEO_LESSONS lesson
 * 1), lands each strike on the clip's own frame (its manifest peak through the showcase's time map, never a guess), and
 * leaves its marks on the ground eroding for `linger` s (lesson 3). Every blow goes through the host, the same hit path
 * as keys 0–7: the herd's hit, the impact event and its numbers, reactions and deaths, the screen's tier with its
 * hit-stop, the camera kick, the light. The lab has no cooldown.
 * Batch 1: key 8's pillars and ultimates (PRODUCTION_LIST_2026-11-05 §4, §7); keys 9's batches add their rows from
 * docs/work/tasks/clip-skills-expansion.json.
 */
import * as THREE from "three";
import type { FoeStatusKind } from "../view/skills/element-kit";
import { layFlat } from "../view/skills/element-clips";
import { FlipbookPool, parseFlipbookManifest, type FlipbookMeta, type FlipbookPlayer, type FlipOptions } from "../view/skills/flipbook";
import type { TargetField } from "../view/skills/targets";
import type { ImpactRole } from "../view/screen-fx";
import type { Showcase } from "./showcase";

/**
 * How a skill lands: on the densest group (point), on the N densest (multi), on the whole field (field), from the caster
 * straight through the densest line (line), as a ring widening round a centre (ring), as an arc swept round the caster
 * (sweep), along a beast's flight across the field (path), as a fan from the caster (cone).
 */
export type ClipShape = "point" | "multi" | "field" | "line" | "ring" | "sweep" | "path" | "cone";
export type ClipDamage = "light" | "heavy" | "ult";
/** In the lab a status only stills (stun, bind) or slows a beast, its rim in the element's colour. */
export type ClipStatus = "stun" | "bind" | "slow";
export type ClipElement = "metal" | "wood" | "water" | "fire" | "earth" | "thunder" | "wind" | "ice" | "dark" | "light" | "poison" | "blood" | "void" | "star";

/**
 * One strike: the clip frame it lands on ("peak": the manifest's timing.peak) or its seconds after the first strike
 * (`after`: the expansion table's rhythm), its power (0–1, the herd's; relative within the skill) and its kind: a hit
 * (the tier's reaction and hit-stop) or a tick (a light damage-over-time blow, no hit-stop).
 */
export interface ClipStrike {
  readonly frame?: number | "peak";
  readonly after?: number;
  readonly power: number;
  readonly kind?: "hit" | "tick";
}

/** One castable skill: its clip, element and how it lands (lab-castable-skills.md §1). */
export interface ClipSkill {
  /** Its clip's manifest id (the showcase item it casts: names, sound and light come from there). */
  readonly id: string;
  readonly element: ClipElement;
  readonly shape: ClipShape;
  /** Metres: round each point (point, multi, ring), the field's reach, a line's or path's half width, a sweep's or cone's reach. */
  readonly radius: number;
  /** Points (multi); 1 for the rest. */
  readonly count: number;
  readonly strikes: readonly ClipStrike[];
  readonly damage: ClipDamage;
  readonly status?: { readonly kind: ClipStatus; readonly seconds: number };
  /** A mark on the ground before a blow from the sky or onto a point: MARK_S (true) or this many seconds. */
  readonly mark: boolean | number;
  /** Seconds its marks stay on the ground after the first strike, eroding (1.5–2.5); 0: none. */
  readonly linger: number;
  /** What in the row is a guess (not measured on the clip). */
  readonly guess?: string;
  /** A line or a path at this world angle (degrees from +x toward −z, screen up) through where the clip stands (its drawn chasm or slashes, a beast's flight). */
  readonly angle?: number;
  /** A ring that closes from its edge onto its centre (thorns from the field's rim). */
  readonly inward?: boolean;
  /** Its Firefly sound and take ("tt-sfx-x-<id>/take2.wav"; none: its showcase item's). */
  readonly sfx?: string;
  /**
   * Where its shape centres when that is not where its clip stands: the field's middle, the densest group, the caster,
   * or the field's far (north) edge (a gourd or a mirror drawn at the top of its clip).
   */
  readonly centre?: ClipPlace | "north";
  /** A sweep's or cone's whole arc (degrees; none: a cone 70°, a sweep all round its clip or 180° from the caster). */
  readonly arc?: number;
  /** Lines at these world angles crossing where it centres (an X-slash), in place of `angle` and `count`. */
  readonly angles?: readonly number[];
  /** Its hits go one point after another: hit strike k strikes points k, k + n, … (n hit strikes); its ticks strike all. */
  readonly perPoint?: boolean;
}

/** Where a clip stands (showcase.ts ShowcasePlace): its shapes centre there. */
export type ClipPlace = "foe" | "field" | "caster" | "foes";

/** Cells a field groups its beasts in (m: key 7's), how long a mark leads a blow from the sky (s). */
export const CELL_M = 8;
export const MARK_S = 0.2;
/** A field skill's blows run out from its centre (m/s); a ring widens over RING_S, a sweep turns in SWEEP_S. */
const SPREAD_MPS: Readonly<Record<ClipShape, number>> = { point: 0, multi: 0, field: 60, line: 120, ring: 0, sweep: 0, path: 26, cone: 40 };
const RING_S = 0.5;
const SWEEP_S = 0.45;
/** A line's length and a path's half length (m); a cone's half angle (rad). */
const LINE_M = 30;
const PATH_HALF_M = 22;
/** A divine beast's flight across its path (s, edge to edge); the share of the view its card fills while it flies (or a field scene dropped on a point). */
const FLY_S = 1;
export const FLY_SCALE = 0.55;
const CONE_HALF = (35 * Math.PI) / 180;
/** Marks a field skill leaves (on its densest cells). */
const FIELD_MARKS = 5;
/** A blow's element rim on a struck beast (s) when the skill has no status. */
const RIM_S = 1.2;
/** Marks along a line (its chasm). */
const LINE_MARKS = 5;
/** The field's far (north) edge from the ground under the screen's centre (m). */
const NORTH_M = 11;

/** The status rim each element leaves on a beast (element-kit.ts FoeStatusKind). */
const RIM: Readonly<Record<ClipElement, FoeStatusKind>> = {
  metal: "cut", wood: "rooted", water: "wet", fire: "burn", earth: "crushed", thunder: "shocked", wind: "swept", ice: "frozen",
  dark: "devoured", light: "judged", poison: "corroded", blood: "drained", void: "rifted", star: "starfall",
};

const peak = (power: number): ClipStrike => ({ frame: "peak", power });
const at = (frame: number, power: number): ClipStrike => ({ frame, power });

/**
 * Key 8's rows (batch 1): PRODUCTION_LIST_2026-11-05 §7 (pillars: one column on one beast, dozens of columns each on one
 * beast, the light column, the meteor's molten crater) and §4 (each element's ultimate over the whole field). The
 * first strike of each is its clip's peak frame (art-src/lab/vfx/ult/manifest.json timing.peak); a later strike is a
 * frame inside the clip's hold chosen by what the clip shows, marked as a guess.
 */
export const KEY8_SKILLS: readonly ClipSkill[] = [
  { id: "pillar-thunder-single", element: "thunder", shape: "point", radius: 2.2, count: 1, strikes: [peak(1)], damage: "heavy", status: { kind: "stun", seconds: 1 }, mark: true, linger: 2 },
  { id: "pillar-thunder-field", element: "thunder", shape: "multi", radius: 1.4, count: 12, strikes: [peak(0.85)], damage: "heavy", status: { kind: "stun", seconds: 0.8 }, mark: true, linger: 1.6 },
  { id: "pillar-light-judgement", element: "light", shape: "point", radius: 3, count: 1, strikes: [peak(1)], damage: "heavy", status: { kind: "stun", seconds: 0.6 }, mark: true, linger: 2.2 },
  { id: "pillar-fire-meteor", element: "fire", shape: "point", radius: 3.6, count: 1, strikes: [peak(1)], damage: "heavy", mark: true, linger: 2.5 },
  { id: "ult-metal-geng", element: "metal", shape: "field", radius: 30, count: 1, strikes: [peak(1), at(12, 0.5)], damage: "ult", status: { kind: "stun", seconds: 0.8 }, mark: false, linger: 2, guess: "frame 12: the bell's second toll" },
  { id: "ult-wood-primordial-tree", element: "wood", shape: "field", radius: 30, count: 1, strikes: [peak(0.9)], damage: "ult", status: { kind: "bind", seconds: 2.2 }, mark: false, linger: 2.5 },
  { id: "ult-water-profound-sea-v2", element: "water", shape: "field", radius: 30, count: 1, strikes: [peak(0.9), at(12, 0.6)], damage: "ult", status: { kind: "slow", seconds: 2.5 }, mark: false, linger: 2, guess: "frame 12: the sea dragon's pass" },
  { id: "ult-fire-one-spark", element: "fire", shape: "field", radius: 30, count: 1, strikes: [peak(1), at(10, 0.4), at(18, 0.4)], damage: "ult", mark: false, linger: 2.5, guess: "frames 10, 18: the burning sky's two burns" },
  { id: "ult-earth-ink-peaks", element: "earth", shape: "field", radius: 30, count: 1, strikes: [peak(1)], damage: "ult", status: { kind: "stun", seconds: 1 }, mark: false, linger: 2.5 },
  { id: "ult-thunder-nine-heavens-v2", element: "thunder", shape: "field", radius: 30, count: 1, strikes: [peak(0.8), at(6, 0.6), at(12, 0.6)], damage: "ult", status: { kind: "stun", seconds: 1 }, mark: true, linger: 2, guess: "frames 6, 12: the edict's next bolts" },
  { id: "ult-wind-firmament", element: "wind", shape: "field", radius: 30, count: 1, strikes: [peak(1)], damage: "ult", status: { kind: "slow", seconds: 1.5 }, mark: false, linger: 1.5 },
  { id: "ult-ice-cold-silence", element: "ice", shape: "field", radius: 30, count: 1, strikes: [peak(0.6)], damage: "ult", status: { kind: "bind", seconds: 3 }, mark: false, linger: 2.5 },
  { id: "ult-dark-a", element: "dark", shape: "field", radius: 30, count: 1, strikes: [peak(1)], damage: "ult", status: { kind: "slow", seconds: 2 }, mark: false, linger: 2 },
  { id: "ult-light", element: "light", shape: "field", radius: 30, count: 1, strikes: [peak(1)], damage: "ult", status: { kind: "stun", seconds: 0.8 }, mark: true, linger: 2 },
  { id: "ult-poison", element: "poison", shape: "field", radius: 30, count: 1, strikes: [peak(0.6), at(8, 0.35), at(16, 0.35), at(24, 0.35)], damage: "ult", status: { kind: "slow", seconds: 2.5 }, mark: false, linger: 2.5, guess: "frames 8, 16, 24: the miasma's bites" },
  { id: "ult-blood", element: "blood", shape: "field", radius: 30, count: 1, strikes: [peak(1), at(20, 0.5)], damage: "ult", mark: false, linger: 2, guess: "frame 20: the blood lotus drinks" },
  { id: "ult-void", element: "void", shape: "field", radius: 30, count: 1, strikes: [peak(1), at(8, 0.6)], damage: "ult", status: { kind: "stun", seconds: 0.8 }, mark: false, linger: 1.5, guess: "frame 8: the mirror's shards" },
  { id: "ult-star", element: "star", shape: "field", radius: 30, count: 1, strikes: [peak(0.8), at(6, 0.8), at(12, 1)], damage: "ult", mark: true, linger: 2, guess: "frames 6, 12: the next meteors" },
];

/**
 * Key 9's rows, batch by batch (lab-castable-skills.md), transcribed from docs/work/tasks/clip-skills-expansion.json
 * (lab-flipbooks, 06/11; Gemini's gameplay lines, the arena 40 × 26 m): shape, radius, count, strikes (the first, then
 * seconds after it), damage, status (seconds: a lab default, stun 1, bind 1.8, slow 2), mark (s), linger, sound take.
 * The clips are at full strength from frame 0 (the table measured no impact frame): their first strike lands on the
 * clip's peak frame (the acceptance rule), the table's later strikes keep its rhythm after it. A2's chasm runs 35° on
 * screen (40° on the ground at the 55° camera); A8's thorns close from the field's rim. Batch 3, the divine beasts: C1's
 * dragon and C3's phoenix fly across the field (path: C1 left to right, C3 south to north, as their lines say), each
 * beast struck when the body reaches it; C2's tiger rakes four parallel claw lines along its clip's diagonal (30°).
 * Batch 4, the treasures: D1's seal drops onto the densest group; D3's gourd and D6's mirror work from the field's far
 * edge, where their clips draw them; D6, D7, D8 have no Firefly sound (their first element's ultimate stands in).
 * Batch 5, the avatars (rising over the caster): B1's six weapons and B2's sixteen palms slam one point after another;
 * B3 cleaves 270° round the caster; B4's star sword lands at its feet; B5's X crosses at the caster, its arms reaching
 * the field's far corners.
 */
export const KEY9_SKILLS: readonly ClipSkill[] = [
  // A1 Myriad Spirit Lotus Bloom · Vạn Linh Liên Hoa Trận
  {
    id: "myriad-lotus-domain", element: "wood", shape: "ring", radius: 18, count: 3, damage: "heavy", status: { kind: "stun", seconds: 1 }, mark: false, linger: 1.8, sfx: "tt-sfx-x-myriad-lotus-domain/take1.wav",
    strikes: [{ frame: "peak", power: 0.6 }, { after: 0.12, power: 0.8 }, { after: 0.24, power: 1 }, { after: 0.8, power: 0.2, kind: "tick" }, { after: 1.3, power: 0.2, kind: "tick" }, { after: 1.8, power: 0.2, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.35 s to the clip peak",
  },
  // A2 Firmament-Sundering Rift · Liệt Thiên Trảm Ngân
  {
    id: "firmament-sundering-cleave", element: "void", shape: "line", radius: 3, count: 1, damage: "heavy", mark: 0.15, linger: 1.6, angle: 40, sfx: "tt-sfx-x-firmament-sundering-cleave/take3.wav",
    strikes: [{ frame: "peak", power: 0.4 }, { after: 0.4, power: 1 }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.2 s to the clip peak",
  },
  // A3 Nine-Heavens Tribulation Grid · Cửu Tiêu Lôi Kiếp Võng
  {
    id: "nine-heavens-tribulation-net", element: "thunder", shape: "multi", radius: 2.4, count: 7, damage: "heavy", mark: 0.2, linger: 1.5, sfx: "tt-sfx-x-nine-heavens-tribulation-net/take2.wav",
    strikes: [{ frame: "peak", power: 1 }, { after: 0.5, power: 0.3, kind: "tick" }, { after: 1, power: 0.3, kind: "tick" }, { after: 1.5, power: 0.3, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.25 s to the clip peak",
  },
  // A4 Karmic Ember Tempest · Hồng Liên Nghiệp Hỏa Vũ
  {
    id: "karmic-ember-tempest", element: "fire", shape: "field", radius: 22, count: 1, damage: "heavy", mark: false, linger: 2, sfx: "tt-sfx-x-karmic-ember-tempest/take1.wav",
    strikes: [{ frame: "peak", power: 1 }, { after: 0.5, power: 0.25, kind: "tick" }, { after: 1, power: 0.25, kind: "tick" }, { after: 1.5, power: 0.25, kind: "tick" }, { after: 2, power: 0.25, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.4 s to the clip peak",
  },
  // A5 Glacial Moon Reflection Tide · Hàn Nguyệt Kính Triều
  {
    id: "glacial-moon-tide", element: "ice", shape: "sweep", radius: 20, count: 1, damage: "heavy", status: { kind: "stun", seconds: 1 }, mark: false, linger: 1.5, sfx: "tt-sfx-x-glacial-moon-tide/take2.wav",
    strikes: [{ frame: "peak", power: 0.6 }, { after: 0.5, power: 1 }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.3 s to the clip peak",
  },
  // A6 Scarlet Samsara Compass · Huyết Luân Luân Hồi Bàn
  {
    id: "samsara-blood-mandala", element: "blood", shape: "field", radius: 20, count: 1, damage: "heavy", mark: false, linger: 1.8, sfx: "tt-sfx-x-samsara-blood-mandala/take2.wav",
    strikes: [{ frame: "peak", power: 0.7 }, { after: 0.45, power: 0.7 }, { after: 0.9, power: 0.25, kind: "tick" }, { after: 1.35, power: 0.25, kind: "tick" }, { after: 1.8, power: 0.25, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.25 s to the clip peak",
  },
  // A7 Seven-Star Astral Fall · Thất Tinh Tinh Hà Trụy
  {
    id: "astral-meteor-constellation", element: "star", shape: "multi", radius: 2.8, count: 7, damage: "heavy", mark: 0.2, linger: 1.7, sfx: "tt-sfx-x-astral-meteor-constellation/take2.wav",
    strikes: [{ frame: "peak", power: 1 }, { after: 0.5, power: 0.4 }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.3 s to the clip peak",
  },
  // A8 Netherworld Briar Vortex · U Minh Kinh Cức Uyên
  {
    id: "miasma-briar-abyss", element: "poison", shape: "ring", radius: 19, count: 1, damage: "heavy", status: { kind: "bind", seconds: 1.8 }, mark: false, linger: 1.9, inward: true, sfx: "tt-sfx-x-miasma-briar-abyss/take2.wav",
    strikes: [{ frame: "peak", power: 0.7 }, { after: 0.6, power: 0.3, kind: "tick" }, { after: 1.2, power: 0.3, kind: "tick" }, { after: 1.8, power: 0.3, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.3 s to the clip peak",
  },
  // C1 Azure Tempest Dragon · Thanh Minh Vân Lôi Long
  {
    id: "azure-cloud-dragon", element: "thunder", shape: "path", radius: 3, count: 1, damage: "heavy", mark: false, linger: 1.8, angle: 0, sfx: "tt-sfx-x-azure-cloud-dragon/take4.wav",
    strikes: [{ frame: "peak", power: 0.35 }, { after: 0.12, power: 0.35 }, { after: 0.24, power: 0.35 }, { after: 0.4, power: 1 }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; a path strikes each beast when the body reaches it (the first strike sets the clock)",
  },
  // C2 Astral Slaying White Tiger · Canh Kim Sát Phạt Bạch Hổ
  {
    id: "white-fiend-tiger", element: "metal", shape: "line", radius: 2.2, count: 4, damage: "heavy", mark: false, linger: 1.5, angle: 30, sfx: "tt-sfx-x-white-fiend-tiger/take2.wav",
    strikes: [{ frame: "peak", power: 0.5 }, { after: 0.2, power: 1 }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.25 s to the clip peak",
  },
  // C3 Nirvana Sunfire Vermilion Bird · Nam Minh Ly Hỏa Chu Tước
  {
    id: "vermilion-solar-phoenix", element: "fire", shape: "path", radius: 6, count: 1, damage: "heavy", mark: false, linger: 1.9, angle: 90, sfx: "tt-sfx-x-vermilion-solar-phoenix/take3.wav",
    strikes: [{ frame: "peak", power: 0.5 }, { after: 0.15, power: 0.5 }, { after: 0.3, power: 0.7 }, { after: 0.7, power: 0.2, kind: "tick" }, { after: 1.3, power: 0.2, kind: "tick" }, { after: 1.9, power: 0.2, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; a path strikes each beast when the body reaches it (the first strike sets the clock)",
  },
  // C4 Black-Abyss Tortoise & Serpent · Huyền Minh Trấn Hải Huyền Vũ
  {
    id: "abyssal-xuanwu-tortoise", element: "water", shape: "ring", radius: 14, count: 1, damage: "heavy", status: { kind: "slow", seconds: 2 }, mark: 0.2, linger: 2, sfx: "tt-sfx-x-abyssal-xuanwu-tortoise/take4.wav",
    strikes: [{ frame: "peak", power: 1 }, { after: 0.8, power: 0.2, kind: "tick" }, { after: 1.6, power: 0.2, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.3 s to the clip peak",
  },
  // C5 Violet-Gold Auspicious Qilin · Tử Kim Thụy Lôi Kỳ Lân
  {
    id: "auspicious-thunder-qilin", element: "thunder", shape: "multi", radius: 4.5, count: 3, damage: "heavy", mark: 0.2, linger: 1.6, sfx: "tt-sfx-x-auspicious-thunder-qilin/take1.wav",
    strikes: [{ frame: "peak", power: 1 }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.35 s to the clip peak",
  },
  // C6 North-Sea Astral Kunpeng · Bắc Minh Hóa Vũ Côn Bằng
  {
    id: "astral-kunpeng-leviathan", element: "water", shape: "field", radius: 22, count: 1, damage: "heavy", mark: false, linger: 1.8, sfx: "tt-sfx-x-astral-kunpeng-leviathan/take3.wav",
    strikes: [{ frame: "peak", power: 1 }, { after: 0.6, power: 0.3, kind: "tick" }, { after: 1.2, power: 0.3, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.4 s to the clip peak",
  },
  // C7 Celestial Truth Spirit Baize · Thông Thiên Hạo Quang Bạch Trạch
  {
    id: "all-knowing-baize-spirit", element: "light", shape: "ring", radius: 20, count: 1, damage: "heavy", status: { kind: "slow", seconds: 2 }, mark: false, linger: 1.7, sfx: "tt-sfx-x-all-knowing-baize-spirit/take1.wav",
    strikes: [{ frame: "peak", power: 0.8 }, { after: 0.6, power: 0.3, kind: "tick" }, { after: 1.2, power: 0.3, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.25 s to the clip peak",
  },
  // C8 Moonlight Illusion Nine-Tailed Fox · Thanh Khâu Huyễn Nguyệt Cửu Vĩ Hồ
  {
    id: "nine-tailed-celestial-fox", element: "ice", shape: "sweep", radius: 14, count: 9, damage: "heavy", status: { kind: "stun", seconds: 1 }, mark: false, linger: 1.8, sfx: "tt-sfx-x-nine-tailed-celestial-fox/take4.wav",
    strikes: [{ frame: "peak", power: 0.6 }, { after: 0.15, power: 0.7 }, { after: 0.3, power: 1 }, { after: 0.8, power: 0.2, kind: "tick" }, { after: 1.3, power: 0.2, kind: "tick" }, { after: 1.8, power: 0.2, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.3 s to the clip peak",
  },
  // D1 Heaven-Overturning Mountain Seal · Phiên Thiên Trấn Nhạc Ấn
  {
    id: "mountain-crushing-imperial-seal", element: "earth", shape: "point", radius: 7, count: 1, damage: "heavy", mark: 0.25, linger: 1.8, sfx: "tt-sfx-x-mountain-crushing-imperial-seal/take4.wav",
    strikes: [{ frame: "peak", power: 1 }, { after: 0.8, power: 0.25, kind: "tick" }, { after: 1.4, power: 0.25, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.25 s to the clip peak; the seal drops onto the densest group (the table: the field's middle)",
  },
  // D2 Soul-Shaking Primordial Bell · Chấn Hồn Hồng Mông Chung
  {
    id: "primordial-chaos-bell", element: "metal", shape: "ring", radius: 20, count: 3, damage: "heavy", status: { kind: "stun", seconds: 1 }, mark: false, linger: 2, sfx: "tt-sfx-x-primordial-chaos-bell/take3.wav",
    strikes: [{ frame: "peak", power: 0.7 }, { after: 0.5, power: 0.85 }, { after: 1, power: 1 }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.2 s to the clip peak",
  },
  // D3 Myriad-Blade Spirit Gourd · Trảm Tiên Vạn Nhận Hồ Lô
  {
    id: "blade-swallowing-immortal-gourd", element: "metal", shape: "cone", radius: 22, count: 1, damage: "heavy", mark: false, linger: 1.6, centre: "north", arc: 120, sfx: "tt-sfx-x-blade-swallowing-immortal-gourd/take4.wav",
    strikes: [{ frame: "peak", power: 1 }, { after: 0.3, power: 0.4, kind: "tick" }, { after: 0.6, power: 0.4, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.2 s to the clip peak; the gourd pours from the far edge (its clip), a 120° fan; element any: its design's first, metal",
  },
  // D4 Nine-Dragon Heaven-Refining Cauldron · Cửu Long Luyện Thiên Đỉnh
  {
    id: "nine-dragon-refining-cauldron", element: "fire", shape: "ring", radius: 16, count: 9, damage: "heavy", mark: 0.2, linger: 1.9, sfx: "tt-sfx-x-nine-dragon-refining-cauldron/take4.wav",
    strikes: [{ frame: "peak", power: 1 }, { after: 0.4, power: 0.5 }, { after: 0.8, power: 0.3, kind: "tick" }, { after: 1.3, power: 0.3, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.25 s to the clip peak",
  },
  // D5 Seven-Aperture Demon-Suppressing Pagoda · Thất Bảo Trấn Yêu Tháp
  {
    id: "seven-treasure-suppressing-pagoda", element: "light", shape: "field", radius: 20, count: 8, damage: "heavy", status: { kind: "bind", seconds: 1.8 }, mark: 0.25, linger: 1.8, sfx: "tt-sfx-x-seven-treasure-suppressing-pagoda/take2.wav",
    strikes: [{ frame: "peak", power: 0.8 }, { after: 0.6, power: 0.3, kind: "tick" }, { after: 1.2, power: 0.3, kind: "tick" }, { after: 1.8, power: 0.3, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.3 s to the clip peak",
  },
  // D6 Taiji Void-Reflecting Mirror · Thái Cực Chiếu Hư Kính
  {
    id: "yin-yang-void-mirror", element: "light", shape: "sweep", radius: 22, count: 1, damage: "heavy", mark: false, linger: 1.6, centre: "north", arc: 140,
    strikes: [{ frame: "peak", power: 0.3 }, { after: 0.5, power: 1 }, { after: 1, power: 0.25, kind: "tick" }, { after: 1.6, power: 0.25, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.15 s to the clip peak; the mirror sweeps from the far edge (its clip), 140°; no Firefly sound: its first element's ultimate stands in",
  },
  // D7 Immortal Binding Aurora Ribbon · Hỗn Thiên Khốn Tiên Lăng
  {
    id: "five-element-heavenly-silk", element: "wind", shape: "field", radius: 16, count: 1, damage: "heavy", status: { kind: "bind", seconds: 1.8 }, mark: false, linger: 1.7,
    strikes: [{ frame: "peak", power: 0.4 }, { after: 0.35, power: 1 }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.35 s to the clip peak; element any: its design's first, wind; no Firefly sound: its first element's ultimate stands in",
  },
  // D8 Twelve-Metropolis Array Banners · Thập Nhị Đô Thiên Trận Kỳ
  {
    id: "twelve-stem-nether-banners", element: "dark", shape: "field", radius: 20, count: 12, damage: "heavy", mark: 0.15, linger: 1.8,
    strikes: [{ frame: "peak", power: 1 }, { after: 0.5, power: 0.3, kind: "tick" }, { after: 1, power: 0.3, kind: "tick" }, { after: 1.5, power: 0.3, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.62 s to the clip peak; no Firefly sound: its first element's ultimate stands in",
  },
  // B1 Three-Faced Six-Armed War Sovereign · Tam Đầu Lục Tí Chiến Tôn Pháp Tướng
  {
    id: "asura-six-arms-avatar", element: "fire", shape: "multi", radius: 3, count: 6, damage: "ult", mark: 0.15, linger: 1.8, perPoint: true, sfx: "tt-sfx-x-asura-six-arms-avatar/take2.wav",
    strikes: [{ frame: "peak", power: 0.7 }, { after: 0.07, power: 0.7 }, { after: 0.14, power: 0.7 }, { after: 0.21, power: 0.7 }, { after: 0.28, power: 0.7 }, { after: 0.35, power: 1 }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.2 s to the clip peak",
  },
  // B2 Thousand-Hand Bodhi Illuminator · Thiên Thủ Lưu Ly Minh Vương Pháp Tướng
  {
    id: "myriad-palm-bodhi-avatar", element: "light", shape: "multi", radius: 2.6, count: 16, damage: "ult", mark: 0.15, linger: 1.7, perPoint: true, sfx: "tt-sfx-x-myriad-palm-bodhi-avatar/take1.wav",
    strikes: [{ frame: "peak", power: 0.6 }, { after: 0.1, power: 0.7 }, { after: 0.2, power: 0.8 }, { after: 0.3, power: 0.9 }, { after: 0.4, power: 1 }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.2 s to the clip peak",
  },
  // B3 Primordial Heaven-and-Earth Titan · Pháp Thiên Tượng Địa Cự Thần
  {
    id: "heaven-earth-titan-avatar", element: "earth", shape: "sweep", radius: 18, count: 1, damage: "ult", mark: false, linger: 2, arc: 270, sfx: "tt-sfx-x-heaven-earth-titan-avatar/take1.wav",
    strikes: [{ frame: "peak", power: 0.6 }, { after: 0.17, power: 0.8 }, { after: 0.35, power: 1 }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.35 s to the clip peak; a 270° cleave round the caster",
  },
  // B4 Purple Micro Star Emperor · Tử Vi Tinh Quân Pháp Tướng
  {
    id: "polar-star-emperor-avatar", element: "star", shape: "ring", radius: 14, count: 1, damage: "ult", mark: 0.2, linger: 1.8, sfx: "tt-sfx-x-polar-star-emperor-avatar/take1.wav",
    strikes: [{ frame: "peak", power: 1 }, { after: 0.6, power: 0.4 }, { after: 1.2, power: 0.3, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.25 s to the clip peak; the star sword lands at the avatar's feet (its clip), the ring round the caster",
  },
  // B5 Nine-Nether Soul Arbiter · Cửu U Minh Đế Pháp Tướng
  {
    id: "nether-samsara-monarch-avatar", element: "dark", shape: "line", radius: 3.2, count: 2, damage: "ult", mark: false, linger: 1.9, angles: [50, 130], sfx: "tt-sfx-x-nether-samsara-monarch-avatar/take3.wav",
    strikes: [{ frame: "peak", power: 1 }, { after: 0.6, power: 0.25, kind: "tick" }, { after: 1.2, power: 0.25, kind: "tick" }, { after: 1.8, power: 0.25, kind: "tick" }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.3 s to the clip peak; the X crosses at the avatar over the caster, its arms to the field's far corners (its clip)",
  },
  // B6 Taixu Sword Immortal Phantom · Thái Hư Kiếm Tiên Pháp Tướng
  {
    id: "immortal-sword-progenitor-avatar", element: "metal", shape: "multi", radius: 1.9, count: 24, damage: "ult", mark: false, linger: 1.6, sfx: "tt-sfx-x-immortal-sword-progenitor-avatar/take4.wav",
    strikes: [{ frame: "peak", power: 1 }],
    guess: "table guesses: shape, radius, count, damage, status, mark, linger, later strikes; first strike moved from the table's 0.2 s to the clip peak; element any: its design's first, metal",
  },
];

const SHAPE_VI: Readonly<Record<ClipShape, string>> = {
  point: "một điểm", multi: "nhiều điểm", field: "cả sân", line: "đường thẳng", ring: "vòng nở", sweep: "cung quét", path: "đường bay", cone: "hình quạt",
};
const DAMAGE_VI: Readonly<Record<ClipDamage, string>> = { light: "nhẹ", heavy: "nặng", ult: "tuyệt kỹ" };
const STATUS_VI: Readonly<Record<ClipStatus, string>> = { stun: "choáng", bind: "trói", slow: "chậm" };
/** The caption's keys line for keys 8 and 9. */
export const KEY8_NAV = "phím 8: tung · Shift+8: chọn mục kế · không hồi chiêu";
export const KEY9_NAV = "phím 9: tung · Shift+9: chọn mục kế · không hồi chiêu";

/** A skill's stats for the panel and the caption (Vietnamese): shape, radius, points, strikes, damage, status. */
export function describeClipSkill(s: ClipSkill): string {
  const fmt = (n: number): string => String(n).replace(".", ",");
  const parts = [SHAPE_VI[s.shape], `${fmt(s.radius)} m`];
  if (s.count > 1) parts.push(`${s.count} điểm`);
  const ticks = s.strikes.filter((x) => x.kind === "tick").length;
  parts.push(`${s.strikes.length - ticks} cú` + (ticks > 0 ? ` + ${ticks} nhịp` : ""), `sát thương ${DAMAGE_VI[s.damage]}`);
  if (s.status !== undefined) parts.push(`${STATUS_VI[s.status.kind]} ${fmt(s.status.seconds)} s`);
  return parts.join(" · ");
}

interface XZ {
  x: number;
  z: number;
}

/** Where a skill lands: its anchor (the clip, the strike's light and kick), its marks' points, the beasts it strikes. */
export interface ClipAim {
  readonly anchor: XZ;
  readonly points: readonly XZ[];
  /** Each struck beast: its delay after a strike (s), the blow's ground direction (unit), the point it belongs to. */
  readonly hits: readonly { readonly i: number; readonly delay: number; readonly dx: number; readonly dz: number; readonly point: number }[];
  /** A path: its clip flies from (x, z) at (vx, vz) m/s, each beast struck as the body reaches it. */
  readonly flight?: { readonly x: number; readonly z: number; readonly vx: number; readonly vz: number };
}

/** Live beasts grouped in CELL_M cells, densest first: each cell's centroid and count. */
export function denseCells(field: TargetField): { x: number; z: number; n: number }[] {
  const map = new Map<number, { x: number; z: number; n: number }>();
  for (let i = 0; i < field.size; i += 1) {
    if (!field.alive(i)) continue;
    const x = field.x(i);
    const z = field.z(i);
    const key = (Math.floor(x / CELL_M) + 512) * 4096 + Math.floor(z / CELL_M) + 512;
    const c = map.get(key);
    if (c === undefined) map.set(key, { x, z, n: 1 });
    else {
      c.x += x;
      c.z += z;
      c.n += 1;
    }
  }
  const out = [...map.values()];
  for (const c of out) {
    c.x /= c.n;
    c.z /= c.n;
  }
  return out.sort((a, b) => b.n - a.n || a.x - b.x || a.z - b.z);
}

const scratch = new Int32Array(512);

/**
 * Aims `skill` from where the beasts stand (never the map: rule of 04/11): the caster's ground point and the field's
 * middle (the ground under the screen's centre) as given, its clip standing at `place` (a field scene over the middle, a
 * figure over the densest group or the caster): a field, ring, sweep or angled line centres where its clip stands. A
 * spread starts at the beast it reaches first, so the first blow lands on the strike's own frame.
 */
export function aimClipSkill(skill: ClipSkill, field: TargetField, caster: XZ, centre: XZ, place: ClipPlace = "field"): ClipAim {
  const groups = denseCells(field);
  const dense: XZ = groups[0] ?? centre;
  // Where its clip stands: the densest group's beast for a figure over the foes, the caster, else the field's middle.
  const near = field.nearest(dense.x, dense.z, CELL_M * 2);
  const at = skill.centre ?? place;
  const origin: XZ = at === "north" ? { x: centre.x, z: centre.z - NORTH_M }
    : at === "foes" || at === "foe" ? (near >= 0 ? { x: field.x(near), z: field.z(near) } : dense) : at === "caster" ? caster : centre;
  const hits: { i: number; delay: number; dx: number; dz: number; point: number }[] = [];
  const seen = new Set<number>();
  let pointNow = 0;
  const add = (i: number, delay: number, ox: number, oz: number): void => {
    if (seen.has(i)) return;
    seen.add(i);
    let dx = field.x(i) - ox;
    let dz = field.z(i) - oz;
    let l = Math.hypot(dx, dz);
    if (l < 1e-3) {
      dx = field.x(i) - caster.x;
      dz = field.z(i) - caster.z;
      l = Math.hypot(dx, dz) || 1;
    }
    hits.push({ i, delay, dx: dx / l, dz: dz / l, point: pointNow });
  };
  const circle = (p: XZ, r: number, delayOf: (i: number) => number): void => {
    const n = field.inCircle(p.x, p.z, r, scratch);
    for (let k = 0; k < n; k += 1) add(scratch[k]!, delayOf(scratch[k]!), p.x, p.z);
  };
  const toward = (from: XZ): XZ => {
    const dx = dense.x - from.x;
    const dz = dense.z - from.z;
    const l = Math.hypot(dx, dz);
    return l > 1e-3 ? { x: dx / l, z: dz / l } : { x: 0, z: -1 };
  };
  const r = skill.radius;
  let anchor: XZ = dense;
  const points: XZ[] = [];
  let flight: ClipAim["flight"];
  switch (skill.shape) {
    case "point": {
      // On the beast nearest the densest group's centre.
      const i = field.nearest(dense.x, dense.z, CELL_M * 2);
      anchor = i >= 0 ? { x: field.x(i), z: field.z(i) } : dense;
      points.push(anchor);
      circle(anchor, r, () => 0);
      break;
    }
    case "multi": {
      // One point a beast, the densest cells' beasts first (nearest their cell's centre), no two closer than 1.5 radii.
      const order: { i: number; n: number; d: number }[] = [];
      for (let i = 0; i < field.size; i += 1) {
        if (!field.alive(i)) continue;
        let best = groups[0]!;
        let bd = Infinity;
        for (const g of groups) {
          const d = Math.hypot(field.x(i) - g.x, field.z(i) - g.z);
          if (d < bd) {
            bd = d;
            best = g;
          }
        }
        order.push({ i, n: best.n, d: bd });
      }
      order.sort((a, b) => b.n - a.n || a.d - b.d || a.i - b.i);
      for (const o of order) {
        if (points.length >= skill.count) break;
        const p = { x: field.x(o.i), z: field.z(o.i) };
        if (points.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= r * 1.5)) points.push(p);
      }
      if (points.length === 0) points.push(centre);
      anchor = centre;
      points.forEach((p, j) => {
        pointNow = j;
        circle(p, r, () => 0);
      });
      break;
    }
    case "field": {
      anchor = origin;
      for (const g of groups.slice(0, FIELD_MARKS)) points.push({ x: g.x, z: g.z });
      circle(origin, r, (i) => Math.hypot(field.x(i) - origin.x, field.z(i) - origin.z) / SPREAD_MPS.field);
      break;
    }
    case "ring": {
      // Widening from where its clip stands (or closing onto it from its edge).
      anchor = origin;
      points.push(anchor);
      circle(anchor, r, (i) => {
        const k = Math.min(1, Math.hypot(field.x(i) - anchor.x, field.z(i) - anchor.z) / r);
        return (skill.inward === true ? 1 - k : k) * RING_S;
      });
      break;
    }
    case "line": {
      if (skill.angle !== undefined || skill.angles !== undefined) {
        // Lines drawn in its clip (a chasm, claw rakes, an X-slash): through where it centres at their angle, `count`
        // parallel lines (or one line per angle, crossing), each run end to end.
        const half = LINE_M * 0.7;
        const lines: { a: number; off: number }[] = skill.angles !== undefined
          ? skill.angles.map((a) => ({ a, off: 0 }))
          : Array.from({ length: skill.count }, (_, k) => ({ a: skill.angle!, off: (k - (skill.count - 1) / 2) * r * 2.5 }));
        anchor = origin;
        for (const ln of lines) {
          const a = (ln.a * Math.PI) / 180;
          const d = { x: Math.cos(a), z: -Math.sin(a) };
          const ox = origin.x - d.z * ln.off;
          const oz = origin.z + d.x * ln.off;
          const n = field.inCapsule(ox - d.x * half, oz - d.z * half, ox + d.x * half, oz + d.z * half, r, scratch);
          for (let q = 0; q < n; q += 1) {
            const i = scratch[q]!;
            add(i, ((field.x(i) - ox) * d.x + (field.z(i) - oz) * d.z + half) / SPREAD_MPS.line, field.x(i) + d.z, field.z(i) - d.x);
          }
        }
        const a0 = ((lines[0]?.a ?? 0) * Math.PI) / 180;
        for (let k = 0; k < LINE_MARKS; k += 1) {
          const u = (k / (LINE_MARKS - 1) - 0.5) * 2 * half * 0.8;
          points.push({ x: origin.x + Math.cos(a0) * u, z: origin.z - Math.sin(a0) * u });
        }
        break;
      }
      const d = toward(caster);
      anchor = caster;
      const n = field.inCapsule(caster.x, caster.z, caster.x + d.x * LINE_M, caster.z + d.z * LINE_M, r, scratch);
      for (let k = 0; k < n; k += 1) {
        const i = scratch[k]!;
        add(i, ((field.x(i) - caster.x) * d.x + (field.z(i) - caster.z) * d.z) / SPREAD_MPS.line, caster.x, caster.z);
      }
      points.push(dense);
      break;
    }
    case "path": {
      // The beast's body flies edge to edge across the field through where its clip stands, at its angle (none: left
      // to right on the play camera), in FLY_S; each beast is struck when the body reaches it, pushed off the path.
      const a = ((skill.angle ?? 0) * Math.PI) / 180;
      const d = { x: Math.cos(a), z: -Math.sin(a) };
      const sx = origin.x - d.x * PATH_HALF_M;
      const sz = origin.z - d.z * PATH_HALF_M;
      const speed = (2 * PATH_HALF_M) / FLY_S;
      flight = { x: sx, z: sz, vx: d.x * speed, vz: d.z * speed };
      anchor = origin;
      const n = field.inCapsule(sx, sz, origin.x + d.x * PATH_HALF_M, origin.z + d.z * PATH_HALF_M, r, scratch);
      for (let k = 0; k < n; k += 1) {
        const i = scratch[k]!;
        const along = (field.x(i) - sx) * d.x + (field.z(i) - sz) * d.z;
        const side = (field.x(i) - sx) * -d.z + (field.z(i) - sz) * d.x >= 0 ? 1 : -1;
        add(i, along / speed, field.x(i) + d.z * side, field.z(i) - d.x * side);
      }
      for (let k = 0; k < LINE_MARKS; k += 1) {
        const u = (k / (LINE_MARKS - 1) - 0.5) * 2 * PATH_HALF_M * 0.8;
        points.push({ x: origin.x + d.x * u, z: origin.z + d.z * u });
      }
      break;
    }
    case "sweep":
    case "cone": {
      // A cone fans from the caster (or from where it centres); a sweep turns round where its clip stands (all the way
      // round), or from the caster across the half facing the densest group. An arc from the far edge faces the field.
      const o = skill.shape === "cone" && skill.centre === undefined ? caster : origin;
      const round = skill.shape === "sweep" && skill.arc === undefined && at !== "caster";
      const d = at === "north" ? { x: 0, z: 1 } : toward(o);
      const facing = round ? Math.PI : Math.atan2(d.z, d.x);
      const half = skill.arc !== undefined ? (skill.arc * Math.PI) / 360 : skill.shape === "cone" ? CONE_HALF : round ? Math.PI : Math.PI / 2;
      anchor = o;
      const n = field.inCircle(o.x, o.z, r, scratch);
      for (let k = 0; k < n; k += 1) {
        const i = scratch[k]!;
        let a = Math.atan2(field.z(i) - o.z, field.x(i) - o.x) - facing;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        if (Math.abs(a) > half) continue;
        const delay = skill.shape === "sweep" ? ((a + half) / (2 * half)) * SWEEP_S : Math.hypot(field.x(i) - o.x, field.z(i) - o.z) / SPREAD_MPS.cone;
        add(i, delay, o.x, o.z);
      }
      points.push(skill.shape === "sweep" ? o : dense);
      break;
    }
  }
  // A spread starts at the beast it reaches first (a flight strikes each beast when its body gets there).
  const first = hits.reduce((m, h) => Math.min(m, h.delay), Infinity);
  if (flight === undefined && Number.isFinite(first) && first > 0) for (const h of hits) h.delay -= first;
  hits.sort((a, b) => a.delay - b.delay || a.i - b.i);
  return { anchor, points, hits, flight };
}

/** The lab's side of a cast: the same hit path as keys 0–7. */
export interface ClipSkillHost {
  readonly targets: TargetField;
  /** The layer its ground marks join. */
  readonly layer: THREE.Object3D;
  /** The lab's flipbooks (an element's mark clip is taken from its library when that element is loaded). */
  readonly player: FlipbookPlayer;
  caster(out: THREE.Vector3): void;
  /** The cast, on the key's frame (the release event). */
  release(skill: ClipSkill, at: THREE.Vector3): void;
  /** One blow on beast `i` through the lab's hit path (the herd's hit, the impact event, the numbers); true: it killed. */
  blow(skill: ClipSkill, i: number, dx: number, dz: number, power: number, role: ImpactRole): boolean;
  /** A strike landing at `at`: the screen's impact at the skill's tier (its hit-stop and shake), the kick, the light. */
  strike(skill: ClipSkill, at: THREE.Vector3, role: ImpactRole, colour: string): void;
  /** On beast `i`: the element's rim for `seconds`, and held (stun, bind) or slowed (null: the rim only). */
  status(i: number, kind: ClipStatus | null, seconds: number, rim: FoeStatusKind, colour: string): void;
}

/** What the last cast did, for __lab.clipSkill (seconds after the key). */
export interface ClipCastReport {
  readonly id: string;
  readonly shape: ClipShape;
  readonly points: number;
  readonly targets: number;
  /** The clip's spawn, each strike (the clip showing its strike frame), the first blow landed; −1: not yet. */
  clipAt: number;
  strikeAt: number[];
  readonly strikeFrames: readonly number[];
  firstBlowAt: number;
  blows: number;
  kills: number;
  marks: number;
}

interface Running {
  readonly skill: ClipSkill;
  t: number;
  /** When its clip spawns (s after the key) and the strikes' times on the clip's own clock. */
  readonly clipAt: number;
  readonly times: readonly number[];
  clipped: boolean;
  readonly anchor: THREE.Vector3;
  readonly aim: ClipAim;
  /** Each strike's time on the cast's clock once the clip is out. */
  readonly beats: { at: number; role: ImpactRole; tick: boolean; done: boolean }[];
  readonly hits: { at: number; i: number; dx: number; dz: number; power: number; role: ImpactRole; first: boolean }[];
  next: number;
  readonly colour: string;
  readonly report: ClipCastReport;
}

const c = new THREE.Vector3();
const m = new THREE.Vector3();
const markAt = new THREE.Vector3();
const flyFrom = new THREE.Vector3();
const flyV = new THREE.Vector3();

export class ClipSkillRunner {
  private readonly table: ReadonlyMap<string, ClipSkill>;
  private readonly running: Running[] = [];
  private readonly marks: GroundMarks;
  /** Whether it ages and clears the marks (a runner sharing another's leaves that to it). */
  private readonly ownsMarks: boolean;
  /** The last cast's report. */
  last: ClipCastReport | null = null;

  /** `marksOf`: a runner whose ground marks it shares (keys 8 and 9: one atlas per element, not two). */
  constructor(private readonly showcase: Showcase, private readonly host: ClipSkillHost, rows: readonly ClipSkill[] = KEY8_SKILLS, private readonly nav = KEY8_NAV, marksOf?: ClipSkillRunner) {
    this.table = new Map(rows.map((r) => [r.id, r]));
    this.marks = marksOf?.marks ?? new GroundMarks(host.layer, host.player);
    this.ownsMarks = marksOf === undefined;
  }

  /** The row of clip `id`, if the table has one. */
  skill(id: string): ClipSkill | undefined {
    return this.table.get(id);
  }

  /** Shift+8: selects the next item and names it (its stats on the caption); its element's mark clip starts loading. */
  selectNext(): string | null {
    const id = this.showcase.next();
    if (id !== null) this.preview(id);
    return id;
  }

  select(id: string): void {
    this.showcase.select(id);
    this.preview(id);
  }

  private preview(id: string): void {
    const s = this.table.get(id);
    if (s !== undefined) this.marks.prepare(s.element);
    this.showcase.caption(id, s !== undefined ? describeClipSkill(s) : undefined, s !== undefined ? this.nav : undefined);
  }

  /** Casts `id` (none: the selected item, else the first) on the herd; what it cast, or null. A clip without a row plays as a video only. */
  cast(id?: string): string | null {
    const pick = id ?? this.showcase.current() ?? this.showcase.ids()[0];
    if (pick === undefined || !this.showcase.has(pick)) return null;
    const skill = this.table.get(pick);
    if (skill === undefined) return this.showcase.play(pick);
    this.showcase.select(pick);
    this.marks.prepare(skill.element);
    this.host.caster(c);
    this.showcase.centre(m);
    const place = this.showcase.item(pick).place;
    const aim = aimClipSkill(skill, this.host.targets, c, m, place);
    // Each strike on its clip frame (the first on the manifest's peak), or its seconds after the first strike.
    const peakFrame = this.showcase.peakOf(pick);
    const frames = skill.strikes.map((s) => (s.after !== undefined ? -1 : s.frame === undefined || s.frame === "peak" ? peakFrame : s.frame));
    const first = this.showcase.timeOf(pick, frames[0]! < 0 ? peakFrame : frames[0]!);
    const times = skill.strikes.map((s, k) => (s.after !== undefined ? first + s.after : this.showcase.timeOf(pick, frames[k]!)));
    // A blow from the sky is marked first: the clip waits until its first strike comes its mark's lead after the key.
    const markS = skill.mark === true ? MARK_S : skill.mark === false ? 0 : skill.mark;
    const lead = Math.max(0, markS - times[0]!);
    const colour = this.showcase.item(pick).light;
    const report: ClipCastReport = {
      id: pick, shape: skill.shape, points: aim.points.length, targets: aim.hits.length, clipAt: -1, strikeAt: [], strikeFrames: frames,
      firstBlowAt: -1, blows: 0, kills: 0, marks: 0,
    };
    // Its marks: on the ground from the key (a mark) or from the first strike (a linger), eroding after it.
    if (markS > 0 || skill.linger > 0) {
      const size = skill.shape === "field" || skill.shape === "ring" || skill.shape === "sweep" ? 6 : Math.max(2.4, Math.min(8, skill.radius * 2.2));
      const from = markS > 0 ? 0 : lead + times[0]!;
      const life = lead + times[0]! - from + Math.max(0.4, skill.linger);
      for (const p of aim.points) if (this.marks.spawn(skill.element, p.x, p.z, size, from, life)) report.marks += 1;
    }
    const run: Running = {
      skill, t: 0, clipAt: lead, times, clipped: false, anchor: new THREE.Vector3(aim.anchor.x, 0, aim.anchor.z), aim, beats: [], hits: [], next: 0,
      colour, report,
    };
    this.host.release(skill, run.anchor);
    this.running.push(run);
    this.last = report;
    if (lead === 0) this.spawnClip(run, 0);
    return pick;
  }

  /** Its clip out now, its strikes on the clip's clock from `t0` (the cast's clock when the clip's age is 0). */
  private spawnClip(r: Running, t0: number): void {
    r.clipped = true;
    r.report.clipAt = t0;
    const it = this.showcase.item(r.skill.id);
    // A pillar or a beast stands on its point; a field scene over the screen's centre.
    const fl = r.aim.flight;
    // A pillar, a figure over the foes or a treasure dropped on a point stands on its point.
    const onPoint = it.place === "foe" || it.place === "foes" || r.skill.shape === "point";
    this.showcase.play(r.skill.id, {
      at: fl !== undefined ? flyFrom.set(fl.x, 0, fl.z) : onPoint ? r.anchor : undefined,
      velocity: fl !== undefined ? flyV.set(fl.vx, 0, fl.vz) : undefined,
      // A flying beast, or a field scene dropped on a point (D1's seal), drawn smaller so it sits on its point.
      scale: fl !== undefined || (r.skill.shape === "point" && it.place === "field") ? FLY_SCALE : undefined,
      feel: false, detail: describeClipSkill(r.skill), nav: this.nav, sound: r.skill.sfx,
    });
    // One point after another (perPoint): hit strike k takes points k, k + n, … of its n hit strikes.
    const hitStrikes = r.skill.strikes.filter((x) => x.kind !== "tick").length;
    let hitNo = 0;
    r.times.forEach((time, k) => {
      const role: ImpactRole = k === 0 ? "primary" : "secondary";
      const tick = r.skill.strikes[k]!.kind === "tick";
      r.beats.push({ at: t0 + time, role, tick, done: false });
      r.report.strikeAt.push(t0 + time);
      const power = r.skill.strikes[k]!.power;
      const turn = tick ? -1 : hitNo++;
      for (const h of r.aim.hits) {
        if (r.skill.perPoint === true && turn >= 0 && h.point % hitStrikes !== turn) continue;
        r.hits.push({ at: t0 + time + h.delay, i: h.i, dx: h.dx, dz: h.dz, power, role, first: k === 0 || (r.skill.perPoint === true && turn >= 0 && h.point % hitStrikes === turn) });
      }
    });
    r.hits.sort((a, b) => a.at - b.at || a.i - b.i);
  }

  /** On world time (a hit-stop holds it, as it holds the clip): spawns, strikes, blows; the marks age. */
  update(dt: number): void {
    if (this.ownsMarks) this.marks.update(dt);
    for (let k = this.running.length - 1; k >= 0; k -= 1) {
      const r = this.running[k]!;
      r.t += dt;
      // Spawned inside this frame, the clip ages by this frame's step with the other flipbooks: its clock starts a step back.
      if (!r.clipped && r.t >= r.clipAt - 1e-6) this.spawnClip(r, r.t - dt);
      for (const b of r.beats) {
        if (b.done || r.t < b.at - 1e-6) continue;
        b.done = true;
        // A tick bites without the tier's reaction (no stop, no shake).
        if (!b.tick) this.host.strike(r.skill, r.anchor, b.role, r.colour);
      }
      while (r.next < r.hits.length && r.hits[r.next]!.at <= r.t + 1e-6) {
        const h = r.hits[r.next]!;
        r.next += 1;
        if (!this.host.targets.alive(h.i)) continue;
        const killed = this.host.blow(r.skill, h.i, h.dx, h.dz, h.power, h.role);
        if (r.report.firstBlowAt < 0) r.report.firstBlowAt = r.t;
        r.report.blows += 1;
        if (killed) r.report.kills += 1;
        else if (h.first) {
          const st = r.skill.status;
          this.host.status(h.i, st?.kind ?? null, st?.seconds ?? RIM_S, RIM[r.skill.element], r.colour);
        }
      }
      if (r.clipped && r.next >= r.hits.length && r.beats.every((b) => b.done)) this.running.splice(k, 1);
    }
  }

  /** An element's mark clip from memory (tests; the lab loads its atlas). */
  adoptMark(folder: string, meta: FlipbookMeta, texture: THREE.Texture): void {
    this.marks.adopt(folder, meta, texture);
  }

  /** Casts still landing. */
  get active(): number {
    return this.running.length;
  }

  clear(): void {
    this.running.length = 0;
    if (this.ownsMarks) this.marks.clear();
  }
}

/** An atlas as the flipbook library loads one (sRGB, mipmapped, straight alpha). */
async function atlas(url: string): Promise<THREE.Texture> {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.premultiplyAlpha = false;
  return texture;
}

/**
 * Each element's ground mark (its folder's `groundMark` clip, laid flat): only that atlas, loaded on the element's first
 * use (or taken from its library when the element is on), never the whole folder. Its own pools, aged by the runner.
 */
class GroundMarks {
  private readonly group = new THREE.Group();
  private readonly pools = new Map<string, FlipbookPool | null>();
  private readonly blank: THREE.DataTexture;
  private readonly o: FlipOptions = {};

  constructor(layer: THREE.Object3D, private readonly player: FlipbookPlayer) {
    this.group.name = "fx-clip-skill-marks";
    layer.add(this.group);
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.blank.needsUpdate = true;
  }

  /** Starts loading `folder`'s mark clip (once). */
  prepare(folder: string): void {
    if (this.pools.has(folder)) return;
    this.pools.set(folder, null);
    void this.load(folder).catch((error: unknown) => console.warn("[clip-skills] no ground mark for " + folder, error));
  }

  private async load(folder: string): Promise<void> {
    if (typeof fetch !== "function" || typeof location === "undefined" || !/^https?:$/.test(location.protocol)) return;
    const base = this.player.base + folder + "/";
    const response = await fetch(base + "manifest.json", { cache: "no-cache" });
    if (!response.ok) return;
    const metas = [...parseFlipbookManifest(await response.json(), base).values()];
    const meta = metas.find((x) => x.role === "groundMark" && x.layer !== "body");
    if (meta === undefined) return;
    const known = this.player.loaded(folder).includes(meta.id) ? this.player.library(folder).get(meta.id) : null;
    this.adopt(folder, known?.meta ?? meta, known?.texture ?? (await atlas(meta.url)));
  }

  /** `folder`'s mark clip, from its atlas (or from memory: tests). */
  adopt(folder: string, meta: FlipbookMeta, texture: THREE.Texture): void {
    const pool = new FlipbookPool(meta.id, meta.mode, 24, 4, this.blank);
    pool.attach(meta, texture);
    layFlat(pool);
    pool.softM = 0.25;
    this.group.add(pool.mesh);
    this.pools.set(folder, pool);
  }

  /** A mark of `folder` at (x, z), `size` m across, shown from `delay` s for `life` s, eroding over its last part. */
  spawn(folder: string, x: number, z: number, size: number, delay: number, life: number): boolean {
    const pool = this.pools.get(folder);
    if (pool === null || pool === undefined || !pool.ready) return false;
    const meta = pool.meta!;
    const o = this.o;
    for (const k of Object.keys(o) as (keyof FlipOptions)[]) delete o[k];
    o.frame = meta.start;
    o.rate = (meta.frames - meta.start) / (meta.fps * life);
    o.life = life;
    o.delay = delay;
    o.fadeIn = 0.06;
    o.cool = 0.55;
    o.occlude = 0.35;
    o.span = size;
    o.lift = 0.05;
    o.rot = ((x * 7.13 + z * 3.71) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    pool.spawn(markAt.set(x, 0.04, z), size, o);
    return true;
  }

  update(dt: number): void {
    for (const pool of this.pools.values()) pool?.update(dt);
  }

  clear(): void {
    for (const pool of this.pools.values()) pool?.clear();
  }
}
