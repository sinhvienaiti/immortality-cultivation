/**
 * Ngũ Lôi Oanh Đỉnh (Five Thunders Smite the Crown) in the lab, the thunder direction the owner chose on 11/11 in place
 * of the Thunder Pillar (docs/work/tasks/five-thunder-lab.md; 07/11: "chỉ là tia sét đánh xuống", many bolts over a
 * wide area in 3–5 s, cracked and charred ground after; 11/11: white-blue, "dồn dập nhiều tia sét đánh lực mạnh mẽ").
 * Five phases on one clock: the charge (a lightning formation on the ground growing to the area, the lightning seal at the hand), the
 * barrage (12–20 single bolts, faster and faster, each a flash that is whole on its first frame and restrikes dimmer),
 * every landing's burst, shock ring, new scorch crack, blows and jolt, the final five-bolt strike into the middle, and
 * the aftermath (the cracks cooling, arcs skipping over the ground). Code only places, times and animates the owner's
 * approved stills; THUNDER_SOURCES names each layer's source, so a cut flipbook replaces a still by one line. Seeded:
 * the same seed draws the same frames on fixed steps. No allocation per frame.
 */
import * as THREE from "three";
import { layFlat } from "../view/skills/element-clips";
import { FlipbookPool, ONE_FRAME, type FlipbookMeta, type FlipbookMode, type FlipOptions } from "../view/skills/flipbook";
import { Rand } from "../view/skills/fxkit";
import type { ImpactRole } from "../view/screen-fx";

/** The owner's approved stills (11/11 white-blue; 12/11 the platinum ink-wash set, canon D65; never in Git). */
/** The cut flipbooks (tools/vfx-flipbook: <folder>/<id>.json beside its atlas). */
export const THUNDER_FLIPBOOKS = "/art-src/lab/vfx/";
export const THUNDER_STILLS = "/art-src/lab/firefly-sprint-2026-11-05/stills/skills/";

export type ThunderLayer = "formationShade" | "formation" | "formationRim" | "formationFlash" | "cloud" | "seal" | "sparks" | "sparkle" | "embers" | "motes" | "corpseArc" | "boltA" | "boltB" | "boltC" | "boltD" | "burst" | "ring" | "arcs" | "scarHot" | "scarCold" | "smoke" | "lichtenberg" | "columnA" | "columnCoreA" | "trailRock" | "trailGlow" | "trailCap" | "trailCapGlow" | "crawlA" | "crawlB" | "crawlC" | "crawlD" | "glowPool" | "lichtStrip" | "boltCentre" | "dim" | "ribbon" | "ringBurst";

export interface ThunderSource {
  /** The still under THUNDER_STILLS, drawn until its flipbook is cut. */
  readonly still: string;
  /** The effect's root in the image: x from the left, y from the top (0–1); a bolt's foot, a ring's centre. */
  readonly pivot: readonly [number, number];
  /** A sheet of cells (cols, rows): one cell per card, picked by the seed. */
  readonly grid?: readonly [number, number];
  /** The pool's mode (default "fire": light on black, added): "rgba" for a painted layer with real alpha. */
  readonly mode?: FlipbookMode;
  /** Drawn this many times its asked size: the padded stills keep the size the unpadded ones had. */
  readonly scale?: number;
  /** Laid flat on the ground instead of facing the camera. */
  readonly flat: boolean;
  /** The flipbook that replaces the still once it exists (its folder under art-src/lab/vfx and its id); one line. */
  readonly flipbook?: { readonly folder: string; readonly id: string; /** Its strike point in a cell and its drawn size × (the cut is cropped to its content): default the json's pivot, 1. */ readonly pivot?: readonly [number, number]; readonly scale?: number };
}

/** Each layer's source (the task's table). Pivots measured from the stills' bright pixels (11/11). */
/**
 * The sharp two-bolt column's four-frame strip (2048 × 768) in the stills folder: owner-approved art, the one line to
 * change for a new grade. Run `scripts/lab/sharp-column-atlas.sh <this name>` first: it writes the eight-cell atlas
 * (frames as drawn, then mirrored) and its core beside it. Round 34: v2-try2, the platinum regrade (Codex 379j).
 */
export const SHARP_COLUMN_STRIP = "thunder-energy-sharp-frames.v2-try2.png";
/**
 * Its Firefly video job (both takes), cut by `scripts/lab/sharp-column-video-atlas.sh <job>` into a 12 × 4 flipbook
 * (take 1, take 1 mirrored, take 2, take 2 mirrored; 0.5–1.9 s, the top cloud faded out). Set to "" to fall back to the
 * four-frame strip above. Round 34: the owner-approved grade's two takes.
 */
export const SHARP_COLUMN_VIDEO: string = "i2v-thunder-energy-sharp-i2v5";
function sharpAtlas(suffix: string): string {
  return SHARP_COLUMN_VIDEO !== "" ? SHARP_COLUMN_VIDEO + suffix + ".lab.png" : SHARP_COLUMN_STRIP.replace(/\.png$/, suffix + ".lab.png");
}
/** Round 36: the mixed column atlas (video two-bolt rows, one-bolt row, three-bolt row). */
export const COLUMN_MIX = "thunder-columns-mix";
/** The column kinds in it: the video's two takes, the one-bolt and three-bolt strips. */
const KIND_VIDEO1 = 0;
const KIND_VIDEO2 = 1;
const KIND_ONE = 2;
const KIND_THREE = 3;
/** Each sheaf's main column kind round the ring (no two neighbours alike); the sides take the kind two along. */
const MAIN_KINDS = [KIND_VIDEO1, KIND_ONE, KIND_VIDEO2, KIND_THREE, KIND_VIDEO1, KIND_ONE, KIND_VIDEO2, KIND_THREE] as const;
/** A column's cell: a video row ping-ponging, or a strip row's four frames in the column's own order. */
function mixCell(M: Member, run: number): number {
  if (M.kind <= KIND_VIDEO2) return columnFrame(M.kind * 2 + M.flip, run + M.phase);
  const row = M.kind === KIND_ONE ? 4 : 5;
  return row * 12 + M.flip * 4 + M.seq[Math.floor((run * 60 + M.lag) / M.every) % 4]!;
}
/** The column atlas's grid and the foot in each cell. */
const SHARP_GRID: [number, number] = SHARP_COLUMN_VIDEO !== "" ? [12, 4] : [8, 1];
const SHARP_PIVOT: [number, number] = SHARP_COLUMN_VIDEO !== "" ? [0.5, 0.887] : [0.497, 0.909];

export const THUNDER_SOURCES: Readonly<Record<ThunderLayer, ThunderSource>> = {
  // Round 8 (canon D65): the platinum ink-wash Thunder set (v4/v3, padded 30 %: `scale` keeps each layer's drawn size)
  // and the pale silver-blue formation. Pivots and scales measured from the stills' bright pixels (12/11).
  // The charge (owner 12/11 08:5x: "dưới mặt đất xuất hiện 1 vòng tròn trận pháp dạng của lôi hiển thị từ bé rồi to dần
  // 1 cách nhanh chóng"): the silver formation flat on the ground, its loose ring 3 % wider turning the other way, a
  // flash at its middle when it reaches its size; an ink cloud over the area's far edge, behind the bolts.
  // Round 9: an ink shadow under the formation so its silver lines stand out on the grey stone (the old cloud painting,
  // drawn as darkness alone: no light, the ground under it darkened by its own shape, soft-edged).
  formationShade: { still: "thunder-five-cloud-vortex-top.v2-try1.png", pivot: [0.5, 0.49], flat: true },
  formation: { still: "thunder-array-silver-a.v1-try9.png", pivot: [0.499, 0.479], flat: true },
  formationRim: { still: "thunder-array-silver-ring.v1-try9.png", pivot: [0.498, 0.476], flat: true },
  formationFlash: { still: "thunder-five-caster-seal.v3-try9.png", pivot: [0.495, 0.467], flat: true, scale: 1.98 },
  cloud: { still: "thunder-five-cloud-ink.v4-try9.png", pivot: [0.5, 0.495], flat: false, flipbook: { folder: "thunder", id: "thunder-five-cloud-ink-wg", pivot: [0.5, 0.5], scale: 0.546 } },
  // Round 6 (owner 12/11 10:2x: "nếu gỡ bạn phải thêm 1 cái khác đẹp hơn đúng kiểu hơn"): what replaces the layers
  // taken out in round 5. A landing throws spark streaks up in a cone (for the shader-drawn star); a beast killed by
  // lightning bursts into arcs round its body, ash flakes and bright dust rising, small arcs skipping on where it
  // fell (for the sprite orb, the ink hit streak and the grey ink smoke).
  sparks: { still: "a9-spark-streaks.v1-try1.png", pivot: [0.5, 0.5], flat: false, grid: [4, 4] },
  sparkle: { still: "thunder-five-lingering-arcs.v4-try9.png", pivot: [0.498, 0.488], flat: false, flipbook: { folder: "thunder", id: "thunder-sparkle" } },
  embers: { still: "a9-ember-flakes.v1-try1.png", pivot: [0.5, 0.5], flat: false, grid: [4, 4] },
  motes: { still: "a9-dust-motes.v1-try1.png", pivot: [0.5, 0.5], flat: false, grid: [4, 4] },
  corpseArc: { still: "thunder-five-lingering-arcs.v4-try9.png", pivot: [0.498, 0.488], flat: false, flipbook: { folder: "thunder", id: "thunder-five-lingering-arcs-wg", pivot: [0.5, 0.5], scale: 0.85 } },
  seal: { still: "thunder-five-caster-seal.v3-try9.png", pivot: [0.495, 0.467], flat: false, scale: 1.98 },
  boltA: { still: "thunder-single-bolt-a.v4-try9.png", pivot: [0.485, 0.845], flat: false, scale: 1.4, flipbook: { folder: "thunder", id: "thunder-single-bolt-a-wg-hi", pivot: [0.45, 0.96], scale: 1.05 } },
  // Round 36 (light hierarchy): the final strike's centre bolt in its own pool (bolt A's texture), the only bolt at HDR.
  boltCentre: { still: "thunder-single-bolt-a.v4-try9.png", pivot: [0.485, 0.845], flat: false, scale: 1.4, flipbook: { folder: "thunder", id: "thunder-single-bolt-a-wg-hi", pivot: [0.45, 0.96], scale: 1.05 } },
  boltB: { still: "thunder-single-bolt-b.v4-try9.png", pivot: [0.493, 0.855], flat: false, scale: 1.26, flipbook: { folder: "thunder", id: "thunder-single-bolt-b-wg-hi", pivot: [0.5, 0.95], scale: 1.05 } },
  boltC: { still: "thunder-single-bolt-c.v4-try9.png", pivot: [0.672, 0.825], flat: false, scale: 1.39, flipbook: { folder: "thunder", id: "thunder-single-bolt-c-wg-hi", pivot: [0.457, 0.96], scale: 1.05 } },
  boltD: { still: "thunder-single-bolt-d.v4-try9.png", pivot: [0.473, 0.8], flat: false, scale: 1.57, flipbook: { folder: "thunder", id: "thunder-single-bolt-d-wg-hi", pivot: [0.46, 0.95], scale: 1.05 } },
  // Round 21 (the judges' "crystal flower"): the burst lies flat on the ground at the landing, wider than deep; no
  // upright card at a landing but the bolt itself.
  burst: { still: "thunder-five-impact-burst.v4-try9.png", pivot: [0.487, 0.6], flat: true },
  ring: { still: "thunder-five-shock-ring-top.v3-try9.png", pivot: [0.496, 0.479], flat: true, scale: 1.4 },
  // Quy Nhất (owner 15/11: the five threads and the ring read thin, "xấu"): key 8's energy ribbon laid along the ground
  // (its leading edge on its tail point) and the animated ring burst, both light × the element's tint, white-hot cores.
  ribbon: { still: "thunder-trail-glow.v1-try1.png", pivot: [0, 0.5], flat: true, grid: [8, 1], flipbook: { folder: "thunder", id: "thunder-ribbon-loop", pivot: [0, 0.5] } },
  ringBurst: { still: "thunder-five-shock-ring-top.v3-try9.png", pivot: [0.496, 0.479], flat: true, flipbook: { folder: "thunder", id: "thunder-ring-burst", pivot: [0.5, 0.5] } },
  arcs: { still: "thunder-five-lingering-arcs.v4-try9.png", pivot: [0.498, 0.488], flat: true, flipbook: { folder: "thunder", id: "thunder-five-lingering-arcs-wg", pivot: [0.5, 0.5], scale: 0.85 } },
  // Round 13: the bolts, the final strike, the burst, the arcs and the ink cloud play their cut Firefly flipbooks
  // (vfx/thunder/*-wg; the v4 stills stand in if one does not load).
  // Round 12: the lightning's print on the ground (Codex's set, painted ground patches): cracked glowing ground on the
  // landing frame, cross-fading to the same patch cooled; the final strike's bigger, under a Lichtenberg burn. Drawn as
  // decals (`decal`: the patch covers the ground, its dark cracks stay dark). The old scorch-crack star is gone.
  scarHot: { still: "thunder-scar-crack-hot.v1-try9.png", pivot: [0.496, 0.488], flat: true },
  scarCold: { still: "thunder-scar-cooled.v1-try9.png", pivot: [0.499, 0.491], flat: true },
  // Round 14: a landing's one-frame white pop (the burst still, small, added at HDR) and the soft dark tint on the
  // ground (a white texel, its card's vignette the falloff: a tint, no drawing; also the rock chips' shadows).
  lichtenberg: { still: "thunder-scar-lichtenberg.v1-try9.png", pivot: [0.502, 0.483], flat: true },
  // Round 23 (owner: the eight streaks "kiểu vệt tự style, nhìn rất xấu… nên là những vệt dạng sấm sét in dưới, hoặc
  // nứt đất, có rực lửa 1 chút"): the columns' trail is a cracked-ground strip (Codex 366, seamless along x, its glow
  // registered on its cracks), cut into TRAIL_TILES square cells laid end to end, and its cap where the column stops.
  // Round 24 (owner: the eight runs "những dạng hình cột", the single bolt "dạng nhành cây, k hợp"; "tại sao không
  // dùng cả 3"): three braided columns (Codex 367, approved), each beside its mirror in one two-cell sheet, and its
  // core: the column's own pixels brighter than 0.8, cut by script (thunder-column-core.lab.README.txt).
  // Round 30: the three sheets (a | b | c, each as drawn | mirrored) joined side by side by script, and their cores, so
  // the 24 columns draw in one pass and their cores in another (cell = kind × 2 + mirrored); the feet's pivot is the
  // three sheets' mean (they differ by ≤ 0.011 of the cell).
  // Round 32 (owner approved the three Firefly column videos): the columns from the video, 12 frames of each of the six
  // takes (a1 a2 b1 b2 c1 c2, one row each) before the top cloud swells, its band faded out; the core cut by script.
  // The still sheets above (thunder-columns-abc, Codex 367) stay as the fallback (VFX_LIBRARY.md).
  // Round 33 (owner approved the straight-strike columns, Codex 378): A (one thick core), B (many fine strands), C (two
  // parallel cores), each beside its mirror (one six-cell sheet, the cores in another, joined by script). The braided
  // columns (Codex 367 and the round-32 video atlas) stay in the library (VFX_LIBRARY.md).
  // Round 34 (owner: "thử triển khai với bản gãy gắt đã chỉnh màu"): the sharp two-bolt column graded platinum, its four
  // frames then the same four mirrored (one eight-cell sheet, the cores in another, by script). Until its Firefly video
  // comes the four frames keep it alive. The straight columns (378) are in the library.
  // The atlases are built from SHARP_COLUMN_STRIP by scripts/lab/sharp-column-atlas.sh (the one line to change).
  // Round 36 (judges: fewer repeats): one mixed atlas, by scripts/lab/column-mix-atlas.sh: rows 0–3 the sharp two-bolt
  // video (take 1, mirrored, take 2, mirrored; 12 frames), row 4 the one-bolt column, row 5 the three-bolt one (four
  // frames, mirrored, again).
  columnA: { still: COLUMN_MIX + ".lab.png", pivot: SHARP_PIVOT, flat: false, grid: [12, 6] },
  columnCoreA: { still: COLUMN_MIX + "-core.lab.png", pivot: SHARP_PIVOT, flat: false, grid: [12, 6] },
  trailRock: { still: "thunder-trail-rock.v1-try1.png", pivot: [0, 0.5], flat: true, grid: [8, 1], mode: "rgba" },
  trailGlow: { still: "thunder-trail-glow.v1-try1.png", pivot: [0, 0.5], flat: true, grid: [8, 1] },
  trailCap: { still: "thunder-trail-cap.v1-try1.png", pivot: [0, 0.5], flat: true, mode: "rgba" },
  trailCapGlow: { still: "thunder-trail-cap-glow.v1-try1.png", pivot: [0, 0.5], flat: true },
  // Round 26 (the columns did not read at the play camera): the single bolts A–D laid flat on the court, chained
  // behind each sheaf's foot along its run. They share the upright bolts' textures (the same clip, no second upload).
  crawlA: { still: "thunder-single-bolt-a.v4-try9.png", pivot: [0.485, 0.845], flat: true },
  crawlB: { still: "thunder-single-bolt-b.v4-try9.png", pivot: [0.493, 0.855], flat: true },
  crawlC: { still: "thunder-single-bolt-c.v4-try9.png", pivot: [0.672, 0.825], flat: true },
  crawlD: { still: "thunder-single-bolt-d.v4-try9.png", pivot: [0.473, 0.8], flat: true },
  // Round 28: a soft warm pool of light under each snake's head (a white texel faded round by its vignette).
  glowPool: { still: "", pivot: [0.5, 0.5], flat: true },
  // Round 28 fix: the Lichtenberg scar laid along the strips, faded round (its square card read as dark tiles).
  lichtStrip: { still: "thunder-scar-lichtenberg.v1-try9.png", pivot: [0.502, 0.483], flat: true },
  dim: { still: "", pivot: [0.5, 0.5], flat: true },
  // A landing's thin smoke: the ink cloud, small, rising and thinning.
  smoke: { still: "thunder-five-cloud-ink.v4-try9.png", pivot: [0.5, 0.495], flat: false },
};
const BOLTS: readonly ThunderLayer[] = ["boltA", "boltB", "boltC", "boltD"];
const COLUMNS: readonly ThunderLayer[] = ["columnA"];
const COLUMN_CORES: readonly ThunderLayer[] = ["columnCoreA"];
const CRAWLS: readonly ThunderLayer[] = ["crawlA", "crawlB", "crawlC", "crawlD"];
/** The lab's paved court (look.ts buildField: 40 × 26 m, its centre at z −5): the strips stop at its edge. */
export const COURT = { x0: -20, x1: 20, z0: -18, z1: 8 } as const;
/** The column's own height in its card (its art spans 78 % of the sheet's height). */
const COLUMN_FILL = SHARP_COLUMN_VIDEO !== "" ? 0.8 : 0.82;
/** The column video atlas: frames per take, takes, its play rate (frames a second, ping-pong). */
const COLUMN_TAKE_FRAMES = 12;
const COLUMN_TAKES = 6;
const COLUMN_FPS = 12;
/** A column video frame for take `take` at `t` s (ping-pong through its frames). */
function columnFrame(take: number, t: number): number {
  const n = COLUMN_TAKE_FRAMES;
  const k = Math.floor(Math.max(0, t) * COLUMN_FPS) % (2 * n - 2);
  return take * n + (k < n ? k : 2 * n - 2 - k);
}

/** A camera-facing card `k` times as wide across the screen (its height, so its foot's place, unchanged). */
export function wideCard(pool: FlipbookPool, k: number): void {
  const material = pool.mesh.material;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|five-thunder-wide-" + k.toFixed(2);
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const local = "  vec2 local = vec2((uv.x - uPivot.x) * uAspect, uv.y - uPivot.y) * iData.x;";
    if (!shader.vertexShader.includes(local)) throw new Error("[five-thunder] wide-card anchor missing");
    // Round 37: a camera-facing card with a span (no direction) is that much narrower again (the side columns, in the
    // main columns' pool); vFvSide tells the fragment it is one.
    shader.vertexShader = "varying float vFvSide;\n" + shader.vertexShader.replace(local, "  float fvSpan = (iLift.y > 0.0 && dot(iDir.xyz, iDir.xyz) < 1e-8) ? iLift.y : 1.0;\n  vFvSide = fvSpan < 0.7 ? 1.0 : 0.0;\n  vec2 local = vec2((uv.x - uPivot.x) * uAspect * " + k.toFixed(2) + " * fvSpan, uv.y - uPivot.y) * iData.x;");
    if (!shader.fragmentShader.includes("varying float vFvSide;")) shader.fragmentShader = "varying float vFvSide;\n" + shader.fragmentShader;
  };
}
/** Layers first drawn late in the cast, warmed on its first frame. */
const WARM_LAYERS: readonly ThunderLayer[] = [...COLUMNS, ...COLUMN_CORES, "boltCentre", "trailRock", "trailGlow", "trailCap", "trailCapGlow", ...CRAWLS, "lichtStrip", "lichtenberg"];

/** Whether column `c`'s core flashes `run` s into its run: in 3-frame beats, on about one beat in three, each column
 * on its own beats (seeded by its index; the same every cast). */
export function columnFlash(c: number, run: number): boolean {
  const beat = Math.floor(run * 20);
  const h = Math.imul((beat + 1) * 2654435761 + (c + 1) * 40503, 2246822519) >>> 0;
  return h % 3 === 0;
}

/** Times (s after the key), counts and sizes (m, px at 1080p). */
export const FIVE_THUNDER = {
  /** The charge: the formation grows, the seal at the hand; the first bolt lands at its end. */
  chargeS: 0.6,
  /** The barrage: from the first bolt to the last single one; the final strike lands at finalS. */
  barrageEndS: 3.4,
  finalS: 3.4,
  finalEndS: 4.0,
  /** The aftermath ends: the cracks are cold. */
  endS: 5.5,
  min: 12,
  max: 24,
  /** The gap between bolts at the start and at the end of the barrage (s). */
  gapFirst: 0.22,
  gapLast: 0.07,
  /** Round 14 (owner 12/11 13:0x: "mềm", 6–7): the last three bolts nearly on top of one another, then a silent
   * pause before the final strike. */
  lastGap: 0.03,
  pauseS: 0.18,
  /** The area struck (m round the centre); two bolts in a row land at least this far apart. */
  areaR: 6,
  apartM: 1.8,
  /** Two bolts within closeS of one another land at least closeM apart (round 21: a dark gap between them). */
  closeS: 0.1,
  closeM: 2.5,
  /** A bolt's size (× its card: boltM tall), its restrikes' delays (s) and light (× the first flash). */
  boltM: 32,
  /** The main bolts' (A, B) width × this. */
  // Round 18: 1.4 across the screen only, in the pool's shader (scaling the whole card pushed the trunk out of frame).
  mainWide: 1.4,
  /** The release thread's height (m). */
  threadM: 1.5,
  scaleMin: 0.8,
  scaleMax: 1.25,
  /** A flash lives 3–6 frames (s); a restrike comes this long after the flash before it. */
  flashS: [0.05, 0.1] as const,
  restrikeGapS: [0.05, 0.1] as const,
  restrikeK: [0.6, 0.4] as const,
  /** A bolt strikes beasts within this (× scale, m) with this power; the final strike covers the area. */
  hitR: 2.2,
  power: [0.65, 1] as const,
  shockedS: 0.5,
  /** A struck beast is thrown this far (m) away from the formation's centre. */
  shoveM: [1.2, 1.8] as const,
  /** A landing's jolt (px, by scale) and its full-screen flash (screen.warm's strength: the frame brightened by up to tint × this, two frames; white-out measured ≤ 6 %). */
  joltPx: [4, 10] as const,
  joltS: 0.18,
  // Round 18: lower (the close zoom's white-out first comes down by the whole-frame flash, not the bolts).
  flash: [0.3, 0.5] as const,
  light: [5, 9] as const,
  /** The final strike: its card, its jolt, stop and flash. */
  strikeM: 48,
  finalJoltPx: 22,
  finalJoltS: 0.35,
  finalStopMs: 120,
  // Round 15: its whole-frame flash peaks at 0.85 for 2 frames.
  // Round 19: 0.7 (the hard gate: the close zoom's white-out ≤ 6 % on every frame).
  finalFlash: 0.7,
  /** Round 21 (owner: components, no whole-scene frame; "khoảng 8 cột lôi toả ra 8 hướng di chuyển đến hết màn"). The
   * final strike: one thick bolt on the centre (centreScale × a single bolt), then eight columns running out from it,
   * the four main directions first, the four diagonals colFrames frames later; each a single bolt leaning colLean
   * along its run, reaching colReachM in colS, fading from 1 at the centre to colFar at its end; the columns toward
   * the camera run colNearK as far and dimmer, so they stop short of the caster. Each leaves a Lichtenberg streak
   * strip behind it (round 23: trailW wide), small flat bursts every colStepM, sparks to both sides, and throws the beasts it passes. */
  centreScale: 1.6,
  // Round 22 (the columns read as a tall sheaf round the formation, not as running): low bolts (colBoltK of a single
  // one) leaning colLean forward, running colS to the frame's edge in their own direction (measured from the centre
  // at the play camera), slowing over the last colSlow of the run; a hot streak right behind the foot, cooling behind
  // it; sparks thrown back. Each column a further 0–2 frames late; their glow ≤ 0.5; no whole-screen flash while
  // they run.
  colS: 0.8,
  colSlow: 0.3,
  /** The longest a column runs (m) if the frame's edge is further. */
  colReachM: 40,
  /** The trail: its width across (m; a square tile's side), where it starts out from the centre (m), its glow's level,
   * how long it burns (s) after the foot passes, the ember it keeps. */
  trailW: 1.6,
  /** A column stops this far (m) short of the caster (its trail's 3.2 m cap and a clear gap). */
  casterGapM: 4,
  trailM: 1.6,
  trailFrom: 1,
  trailGlowK: 2.4,
  /** Round 26: the rock at most 0.75 dark, its broken edges from the image's own alpha. */
  trailRockA: 0.65,
  trailGlowS: 0.8,
  trailEmber: 0.2,
  /** Round 26: a strip tapers to trailTaper of its width at its end, its width varying ±trailWobble along it; it
   * stops courtMarginM inside the court's edge. */
  trailTaper: 0.55,
  trailWobble: 0.2,
  courtMarginM: 0.6,
  /** Round 26: the ground-crawling lightning under each sheaf: a card crawlM long along the run (crawlW across), one
   * after another every crawlStepM behind the foot, a new frame and bolt every crawlEveryF frames, at crawlK light (its
   * core at the bolts' HDR), crawlTailS on after the column stops. */
  crawlM: 4,
  /** Round 28: each of the two layers crawlW across, crawlLayerM apart (≈ 3.6 m in all); the branches at crawlBranch;
   * the pool under the head crawlPoolM long (half as wide) at crawlPoolK, its wake crawlPoolS in crawlPoolCards discs. */
  crawlW: 3.1,
  crawlLayerM: 1.2,
  crawlBranch: 0.6,
  crawlBranchK: 1.3,
  crawlPoolM: 6,
  /** Round 29: the pool's width (m) and how hard its edge is (its light gone at the edge, whole within crawlPoolCore of it). */
  crawlPoolW: 2.5,
  crawlPoolCore: 0.45,
  /** Round 30: what the head leaves every colStepM: an ivory core flash stepFlashF frames, stepFlashM (long, wide) m,
   * at stepFlashK (≤ 0.9), and stepSparks small sparks thrown low. */
  stepFlashF: 2,
  stepFlashM: [2.6, 1.3] as const,
  stepFlashK: 0.9,
  stepSparks: 6,
  crawlPoolK: 0.35,
  /** The pool comes in over its first crawlPoolFromM out from the centre (eight pools at the centre made one pale blob). */
  crawlPoolFromM: 3,
  crawlPoolS: 0.15,
  crawlPoolCards: 4,
  crawlStepM: 3.4,
  crawlEveryF: 2,
  crawlK: 1,
  crawlTailS: 0.1,
  /** Round 27: the snake: crawlCards bolts long, swaying ±crawlSwayM across its run over a wave crawlWaveM long, its
   * body falling to crawlBody of its head over crawlBodyS after the head passed. */
  crawlCards: 4,
  crawlSwayM: 0.6,
  crawlWaveM: 7,
  crawlBody: 0.5,
  crawlBodyS: 0.3,
  /** Round 27: the sheaf at the edge: its burst (m) and ring (m) at the foot.
   * (Round 31 dropped round 29's upright bolt at the edge: the riding sheaf swells there instead.) */
  /** Round 31: at the edge the sheaf swells colEdgeGrow times over colEdgeGrowS, then fades out by colEdgeS. */
  colEdgeS: 0.45,
  colEdgeGrow: 1.4,
  colEdgeGrowS: 0.1,
  /** Round 29: the burst at the foot twice the round-27 size (3 m). */
  colEdgeBurstM: 6,
  colEdgeRingM: 7,
  /** Round 28: a light jolt (px at 1080p, s) when the eight sheaves flare. */
  colEdgeJoltPx: 8,
  colEdgeJoltS: 0.22,
  /** Round 26: a column's body light, low to high as it breathes (only its core at HDR). */
  /** Round 34: the halo at most 0.9; the core (its own pixels > 0.8) added at colCoreHdr on its beats, 15 % over the picture. */
  colBody: [0.8, 0.9] as const,
  colFrames: 3,
  colLean: 0.52,
  /** The columns (round 24): their card's height (m; the column itself about 5 m), how fast their body breathes (Hz),
   * their core's light. */
  colM: 6.4,
  colBreathHz: 1.4,
  /** Round 33: the straight columns' cores are pure white already (378); at 2.5 the close zoom whited out 17 %, at 1.4 still 10.7 % with the edge cores held on. */
  colCoreHdr: 0.3,
  /** Round 25 (owner: "quá mỏng, nên cho nhiều cột lôi để nó dày hơn"): each run a sheaf of three. Its side columns
   * sheafOffM to the side, sheafLateF frames late, sheafSideK as far; the centre one sheafMidM tall (the column
   * itself), the sides sheafSideM; the strip under the centre sheafMidW wide, under the sides sheafSideW. */
  /** Round 32 ("đặc và dày hơn nữa", "cái chạy trước cái chạy sau"): a sheaf of five side by side sheafOffM apart, all
   * starting on one frame and level along the run; the middle sheafMidM tall, the inner pair sheafSideM, the outer pair
   * sheafOuterM; each card sheafWide times as wide. */
  /** Round 36: the side columns clear of the main one by at least half its width. */
  sheafOffM: [1.9, 2.2] as const,
  /** Round 36: every column's height × a random 0.85–1.15; each direction's strip width × 0.8–1.2. */
  colHeightK: [0.85, 1.15] as const,
  stripWideK: [0.8, 1.2] as const,
  /** Round 36: the columns' halo (their light under the core) capped here, so the halo reads narrower. */
  colHaloCap: 0.55,
  /** Round 37: the halo cap at the low views. */
  lowHaloCap: 0.45,
  /** Round 36: at the low views the ground lightning at lowCrawlK; the sheaves farther than the centre dimmed up to
   * rearDimK over rearDimM past it. */
  lowCrawlK: 0.6,
  rearDimK: 0.6,
  rearDimM: 6,
  /** Round 36 (five phases): a seal at the caster's hand for handSealS as the formation appears; a ring of motes drawn
   * in to the centre over pullS before the final strike, from pullR m. */
  handSealS: 0.25,
  handSealM: 1.4,
  pullS: 0.3,
  pullR: 9,
  pullMotes: 28,
  sheafMidM: 9,
  /** Round 34: the side columns this much of the main one. */
  sheafSideK: 0.75,
  /** Round 35 (one accent per sheaf): the side columns at sideBodyK of the main one's body light and sideCoreK of its
   * core, sideWideK as wide, set sideBackM behind it (away from the camera). */
  sideBodyK: 0.6,
  sideCoreK: 1,
  sideWideK: 0.55,
  sideBackM: 0.6,
  /** Round 35: each sheaf's swell at the edge waits PEAK_LAG[c % 3] s, so no two neighbours flare on one frame. */
  peakLagS: [0, 0.13, 0.26, 0.13] as const,
  /** Round 37: at the low views the sheaves heading toward the camera (the three nearest its side) this much shorter. */
  towardCamK: 0.7,
  /** Round 34: the card at the picture's own proportions. */
  sheafWide: 0.8,
  /** Round 32: a column's light at the centre (colRiseFloor), whole colRiseM out. */
  colRiseFloor: 0.2,
  colRiseM: 4,
  colEdgeCoreF: 0,
  sheafMidW: 4.5,
  /** Round 28: a strip tile's length along its run (m; the strip 3 m wide in tiles half as long, to follow its bends). */
  trailTileM: 2.25,
  /** Round 28 fix: Lichtenberg cracks laid flat along the strip every lichtStepM, lichtSize of its width, turned at random. */
  lichtStepM: 3,
  lichtSize: [0.6, 1] as const,
  sheafSideW: 0.9,
  colFar: 0.45,
  colNearK: 1,
  /** Round 31 addendum: a run shorter on screen than colShortRatio of the longest gets a sheaf colShortK bigger. */
  colShortRatio: 0.6,
  colShortK: 1.3,
  /** Round 31 addendum: the formation under the centre at finalDimK for the runs' first finalDimS, back over 0.15 s. */
  finalDimK: 0.2,
  finalDimS: 0.3,
  colNearDim: 0.7,
  colBoltK: 0.6,
  colAlpha: 1,
  colStepM: 2,
  colHitM: 1.6,
  colShoveM: 1.5,
  /** Before it: the gathering (s), its motes, the height they rise to (m), the formation's level in the pause. */
  gatherS: 0.4,
  gatherMotes: 40,
  /** A streak's (and the Lichtenberg scar's) width in its card. */
  lichtFill: 0.506,
  gatherTopM: 8.5,
  pauseDim: 0.4,
  /** Arcs skipping over the cracks in the aftermath (count, each 2–4 frames). */
  arcs: 12,
  /** The formation: the time it grows from nothing to the area's width (s), its overshoot and the time it settles (s),
   * the ring's width in its still's card, its light held through the barrage, each bolt's pulse on top and how long. */
  formGrowS: 0.3,
  formOver: 0.05,
  formSettleS: 0.12,
  formFill: 0.489,
  /** Its loose ring: its width in its card, how much wider than the formation it is, a turn every this many seconds. */
  rimFill: 0.471,
  rimWider: 1.03,
  rimTurnS: 9,
  /** The ink cloud: its height over the area's far edge (m), its width (m), the cloud's width in its card's height. */
  // 5.5 m over the far edge (the ask) is above the play frame when the group stands at the field's far end: 4.2 m,
  // half-way to the far edge, keeps it in frame there.
  cloudY: 3.5,
  cloudBack: 0.5,
  // Round 16: twice the formation's width, 0.95 dark: the dark sky the bolts stand on. A separate dark veil behind
  // the bolts was tried and taken out in the same round (it cut the close zoom's coverage from 53.0 to 51.4 %).
  cloudM: 44,
  /** Its darkness at the final strike (how much of the scene behind it it covers): the dark the bolts stand on. */
  cloudAlpha: 0.95,
  /** The formation's ink shadow: its darkness, how much wider than the formation, the cloud's width in its card. */
  shadeAlpha: 0.6,
  shadeWider: 1.06,
  shadeFill: 0.77,
  cloudFill: 0.836,
  // Round 10 (owner 12/11 11:4x: "trận pháp đang bị quá mờ, và nó cần rộng gấp đôi nhìn nó mới đẹp"): the formation is
  // 24 m across (the bolts still fall within areaR of its centre), its light × formGain, its ring's × rimGain, 0.9 shown.
  // Round 11 (owner 12/11 11:5x: "vòng tròn trận pháp nhìn hơi 2D, nên chỉnh lại để nhìn giống 3d hơn"): depth by tiers
  // and motion, the same stills. The shadow on the ground, the formation just over it, its ring lifted off the ground
  // turning the other way, a smaller ring higher still turning with the formation (parallax at the 55° camera), a low
  // upright core at the centre, bright dust rising from the formation, a slow breath, one frame's flare on each bolt.
  // 22 m (24 m ran past the frame's top edge when the group stands at the field's far end).
  formR: 11,
  formY: 0.02,
  // Round 17 (the blind judges: "đĩa lơ lửng"): the tiers sit low (12 and 24 cm, were 45 and 90), a soft contact
  // shadow under the outer ring, a wider dark edge round the formation.
  // Round 21: flat on the ground with the formation (no lift), their outer edge fading over its last 8 %.
  rimY: 0.025,
  rimTurnS2: 8,
  topY: 0.03,
  /** The contact shadow under the ring, and the dark edge round the formation (how much wider, its darkness). */
  contactAlpha: 0.6,
  edgeWider: 1.2,
  edgeAlpha: 0.35,
  topScale: 0.7,
  topAlpha: 0.5,
  topTurnS: 12,
  coreM: 1.45,
  coreAlpha: 0.6,
  breathS: 1.2,
  breath: 0.1,
  flare: 1.6,
  /** Rising dust: how many through the charge and the barrage, how high (m), how long each lives (s). */
  risers: 50,
  riseM: 1.5,
  riseS: 1.4,
  formGain: 2,
  rimGain: 1.6,
  formAlpha: 0.9,
  formHold: 0.8,
  /** Its level (and its five vortex knots') while the bolts fall. */
  formDim: 0.35,
  /** Round 26: the outer lettered ring's level while the bolts fall (the formation itself at formDim). */
  rimDim: 0.25,
  formPulse: 0.2,
  formPulseS: 0.18,
  /** A landing's sparks (count), a lightning kill's ash flakes, dust motes and corpse arcs (counts), the arcs' window (s). */
  sparks: [10, 16],
  ashes: [6, 10],
  dusts: [4, 6],
  corpseArcs: [2, 3],
  corpseArcS: 0.5,
  /** A scar: its width (m; the final strike's), the patch's width in its card, how long it stays hot (s), its
   * cross-fade to the cooled patch (s), the cooled patch's fade after the aftermath (s), how many show at once. */
  scarM: [3, 4] as const,
  /** The final strike's scar stays hot this much longer (s). */
  scarFinalHotS: 0.5,
  /** The aftermath: smoke puffs rising from the scars (count, s), ash flakes (count). */
  puffs: [3, 5] as const,
  puffS: 2,
  ashFall: 20,
  /** The arcs skip on this long past the aftermath's end (s). */
  arcTailS: 0.75,
  scarFill: 0.513,
  scarHotS: 0.6,
  scarCoolS: 1.2,
  scarOutS: 1,
  scarMax: 10,
  scarEarlyS: 0.4,
  /** A landing's rock chips (count). */
  chips: [8, 12] as const,
  /** The ground darkens round the centre so the bolts stand out: out to dimR (m) at dimTo of its light, in over dimInS
   * with the charge, back over dimOutS in the aftermath. A soft tint, no shape. */
  dimR: 14,
  // 0.48 here shows as about 0.55 of the ground's brightness on screen (measured; 0.55 showed as 0.60–0.65).
  // Round 16: 0.38 here, about 0.45 on screen.
  dimTo: 0.38,
  dimInS: 0.3,
  dimOutS: 1,
  /** A landing's shock ring: from nothing to this wide (m; the final strike's twice) in ringFrames frames, then cut. */
  ringM: 7,
  ringFrames: 6,
  /** A single bolt's burst × this. 1.3 in round 18; back to 1 in round 19: at 1.3 the stacked bursts of the last
   * bolts were what took the close zoom past 6 % white-out (7.5 %; 5.7 % at 1). */
  burstScale: 1,
  ringFill: 0.77,
} as const;

/**
 * The finisher (owner 15/11, night): "Ngũ Lôi Quy Nhất" (the five thunders return to one) replaces the eight runs. Kept
 * switchable: "eightRuns" is round 37's centre bolt and eight spreading sheaves (?finisher=eight in the lab; the parts
 * are listed in VFX_LIBRARY.md).
 */
export type ThunderFinisher = "quyNhat" | "eightRuns";
export const QUY_NHAT = {
  /** The gather: from finalS, five thin bolts (one per element) strike the formation's ring boltGapS apart, then are
   * pulled along the ground to the centre from pullFromS, arriving together at gatherS, when the pillar slams. */
  gatherS: 0.8,
  boltGapS: 0.07,
  boltRingK: 0.92,
  boltM: 11,
  boltLight: 0.6,
  boltFlashS: 0.14,
  pullFromS: 0.36,
  /** Each thread: a stretch of energy ribbon up to pullLenM long, its head racing in; a core pullW thick and a glow
   * pullGlowW thick at pullGlowK of its light, each tiled every pullTileM with its own frame. */
  pullLenM: 6,
  pullW: 2.6,
  pullGlowW: 5,
  pullGlowK: 0.4,
  pullTileM: 3,
  pullLight: 1,
  /** The one accent: key 8's Thunder Pillar (its cleaned video or atlas) pillarScale times its size, for pillarLifeS. */
  pillarScale: 2.2,
  pillarLifeS: 2.4,
  /** Its blow: within slamR, slamPower, as the finisher; its jolt (px), stop (ms) and a short flash. */
  slamR: 5.5,
  slamPower: 1.4,
  slamJoltPx: 24,
  slamJoltS: 0.35,
  slamStopMs: 110,
  slamFlash: 0.45,
  slamLight: 14,
  /** The aftermath's ring: the ring-burst flipbook from burstFromM to burstToM wide over burstS (its own spokes
   * and rim), and a rim of energy ribbon round a circle growing from 3 m to ringToM wide over ringS, ringSegs chords. */
  burstFromM: 6,
  burstToM: 30,
  burstS: 1.1,
  burstLight: 0.5,
  ringToM: 42,
  ringS: 0.8,
  /** Owner 15/11 night ("quá mỏng, nhìn làm yếu hẳn, tránh dùng các sợi mỏng cho chiêu kết"): the rim is a dense band,
   * not a thread: ringLayers rows of ribbon ringLayerM apart across it, ringW thick each, under a glow ringGlowW
   * thick at ringGlowK of its light. */
  ringLight: 0.8,
  ringSegs: 28,
  ringW: 4.5,
  ringLayers: 3,
  ringLayerM: 0.8,
  ringGlowW: 10,
  ringGlowK: 0.32,
  /** Chain arcs from the centre to every beast within chainR (nearest first, chainV m/s), each from the nearest
   * beast already reached (or the centre): a hop shows chainArcS; its blow, its shock, ticks tickGapS apart. */
  chainR: 60,
  chainMax: 192,
  chainDelayS: 0.18,
  chainV: 20,
  chainArcS: 0.14,
  chainLight: 0.5,
  /** A hop is a stretch of energy ribbon (not a thin bolt), chainW thick. */
  chainW: 2.2,
  chainPower: 0.3,
  chainShockS: 0.7,
  ticks: 2,
  tickGapS: 0.3,
  tickPower: 0.15,
  /** At most this many chain blows a frame (a cluster reached together spreads over the next frames: the lab's hit
   * path per blow is the aftermath's cost). */
  blowsPerFrame: 4,
  /** A crackle while hops fly, at most one every crackleS. */
  crackleS: 0.22,
} as const;
/** The five elements' colours (metal, wood, water, fire, earth), pale: support layers. */
export const ELEMENT_TINTS: readonly THREE.Color[] = [
  new THREE.Color(1, 0.94, 0.78), new THREE.Color(0.62, 1, 0.66), new THREE.Color(0.58, 0.76, 1), new THREE.Color(1, 0.58, 0.48), new THREE.Color(0.96, 0.8, 0.5),
];
const CHAIN_TINT = new THREE.Color(0.86, 0.8, 1);

/**
 * The chain's order: beasts nearest the centre first, each fed from the nearest one already reached (or the centre).
 * `xs`/`zs` the beasts' places; returns, per hop, the beast's index into them and its source (−1: the centre).
 */
export function chainOrder(cx: number, cz: number, xs: readonly number[], zs: readonly number[]): { order: number[]; from: number[] } {
  const n = xs.length;
  const order = [...Array(n).keys()].sort((a, b) => Math.hypot(xs[a]! - cx, zs[a]! - cz) - Math.hypot(xs[b]! - cx, zs[b]! - cz));
  const from: number[] = [];
  for (let k = 0; k < n; k += 1) {
    const i = order[k]!;
    let best = -1;
    let bd = Math.hypot(xs[i]! - cx, zs[i]! - cz);
    for (let j = 0; j < k; j += 1) {
      const p = order[j]!;
      const d = Math.hypot(xs[i]! - xs[p]!, zs[i]! - zs[p]!);
      if (d < bd) { bd = d; best = p; }
    }
    from.push(best);
  }
  return { order, from };
}

export interface ThunderPlan {
  /** Each single bolt: when it lands (s after the key), its shape (0–3), its tilt (rad), its scale, its offset from the centre (m). */
  readonly at: readonly number[];
  readonly shape: readonly number[];
  readonly tilt: readonly number[];
  readonly scale: readonly number[];
  readonly ox: readonly number[];
  readonly oz: readonly number[];
  /** Its restrikes (1–2) and each flash's length (s): the first, then the restrikes. */
  readonly restrikes: readonly number[];
  readonly flashS: readonly (readonly number[])[];
  /** The aftermath's arcs: when (s after the key), on which crack (an index into the landings, the final strike last), their tilt and length (s). */
  readonly arcAt: readonly number[];
  readonly arcOn: readonly number[];
  readonly arcRot: readonly number[];
  readonly arcS: readonly number[];
}

/** The barrage from `seed` (`count`: fixed instead of 12–20). Pure. */
export function planFiveThunder(seed: number, count?: number): ThunderPlan {
  const F = FIVE_THUNDER;
  const R = new Rand(seed);
  // Gaps from gapFirst down to gapLast (eased: the pace quickens), the last three bolts lastGap apart, the whole
  // ending pauseS and gatherS before the final strike. As many bolts as fit at those gaps (a `count` is stretched to fit).
  const span = F.finalS - F.gatherS - F.pauseS - F.chargeS;
  const eased = (m: number, k: number): number => {
    const u = m - 4 <= 0 ? 1 : k / (m - 4);
    return F.gapFirst + (F.gapLast - F.gapFirst) * u * (2 - u);
  };
  const total = (m: number): number => {
    let sum = 2 * F.lastGap;
    for (let k = 0; k < m - 3; k += 1) sum += eased(m, k);
    return sum;
  };
  let n = Math.max(4, count ?? F.max);
  if (count === undefined) while (n > F.min && total(n) > span) n -= 1;
  const gaps: number[] = [];
  for (let k = 0; k < n - 3; k += 1) gaps.push(eased(n, k) * R.range(0.94, 1.06));
  const sum = gaps.reduce((a, g) => a + g, 0);
  const stretch = (span - 2 * F.lastGap) / sum;
  const at: number[] = [F.chargeS];
  for (const g of gaps) at.push(at[at.length - 1]! + g * stretch);
  at.push(at[at.length - 1]! + F.lastGap, at[at.length - 1]! + 2 * F.lastGap);
  const shape: number[] = [];
  const tilt: number[] = [];
  const scale: number[] = [];
  const ox: number[] = [];
  const oz: number[] = [];
  const restrikes: number[] = [];
  const flashS: number[][] = [];
  for (let k = 0; k < n; k += 1) {
    // The main bolt (A: the wide pool, its thick trunk low in the frame) on every even beat, the first included;
    // B, C or D between (round 18: B and C's early frames float short of the ground and show only their tips).
    let s = Math.floor(R.next() * 4);
    if (k > 0 && s === shape[k - 1]) s = (s + 1 + Math.floor(R.next() * 3)) % 4;
    s = k % 2 === 0 ? 0 : s === 0 ? 1 + (k >> 1) % 3 : s;
    shape.push(s);
    tilt.push(R.range(-0.07, 0.07));
    scale.push(R.range(F.scaleMin, F.scaleMax));
    // Alternating left and right of the centre, further out bolt by bolt (round 17), not on the last three landings.
    let x = 0;
    let z = 0;
    const side = k % 2 === 0 ? 1 : -1;
    const reach = 2 + (F.areaR - 2) * (n <= 1 ? 1 : k / (n - 1));
    for (let tries = 0; tries < 48; tries += 1) {
      // Toward the camera's side of the centre (+z): a bolt on the far side lands near the frame's top edge and shows
      // only its foot. After a few misses (the last three bolts, 33 ms apart, need closeM between them) the sector
      // and the radius open up.
      const wide = tries >= 6;
      const a = wide ? R.range(-Math.PI / 6, Math.PI / 2.2) : R.range(Math.PI / 9, Math.PI / 3);
      const d = reach * (wide ? R.range(0.35, 1) : R.range(0.85, 1));
      x = side * Math.cos(a) * d;
      z = Math.sin(a) * d;
      let clear = true;
      for (let j = Math.max(0, k - 3); j < k; j += 1) if (Math.hypot(x - ox[j]!, z - oz[j]!) < (at[k]! - at[j]! <= F.closeS + 1e-6 ? F.closeM : F.apartM)) clear = false;
      if (clear) break;
    }
    ox.push(x);
    oz.push(z);
    const r = 1 + (R.next() < 0.5 ? 1 : 0);
    restrikes.push(r);
    const f: number[] = [];
    for (let j = 0; j <= r; j += 1) f.push(R.range(F.flashS[0], F.flashS[1]));
    flashS.push(f);
  }
  const arcAt: number[] = [];
  const arcOn: number[] = [];
  const arcRot: number[] = [];
  const arcS: number[] = [];
  for (let k = 0; k < F.arcs; k += 1) {
    arcAt.push(R.range(F.finalEndS, F.endS + F.arcTailS));
    arcOn.push(Math.floor(R.next() * (n + 1)));
    arcRot.push(R.next() * Math.PI * 2);
    arcS.push(R.range(2 / 60, 4 / 60));
  }
  arcAt.sort((a, b) => a - b);
  return { at, shape, tilt, scale, ox, oz, restrikes, flashS, arcAt, arcOn, arcRot, arcS };
}

/** The lab around the skill: the herd, the caster, the screen and the sound. */
export interface ThunderHost {
  readonly layer: THREE.Object3D;
  readonly camera: THREE.Camera;
  /** Live beasts within `r` of (x, z) into `out` (their count). */
  inCircle(x: number, z: number, r: number, out: Int32Array): number;
  x(i: number): number;
  z(i: number): number;
  /** One blow on beast `i` from (dx, dz) through the lab's hit path (flash, knockback, numbers, sound); true: it killed. */
  blow(i: number, dx: number, dz: number, power: number, role: ImpactRole): boolean;
  /** Beast `i`'s body radius (m): its death's size. */
  size(i: number): number;
  /** Beast `i` thrown `metres` along (dx, dz) (unit), sliding. */
  shove(i: number, dx: number, dz: number, metres: number): void;
  /** Its rim shocked for `seconds`. */
  status(i: number, seconds: number): void;
  /** A landing at `at`: its jolt (px at 1080p, s), its stop (ms; 0 none), the full-screen flash (0 none), its light. */
  strike(at: THREE.Vector3, joltPx: number, joltS: number, stopMs: number, flash: number, light: number): void;
  /** The thunder crack, pitched by `rate`, `gain` × its own. */
  sound(rate: number, gain: number): void;
  /** The caster's rim while it gathers (0: off), the hand (world), the scene's darkening (0: off). */
  glow(k: number): void;
  hand(out: THREE.Vector3): void;
  dark(k: number): void;
  /** Reduced motion: no full-screen flash, no jolt, no stop. */
  readonly reduced: boolean;
  /** Quy Nhất's pillar: key 8's Thunder Pillar card on `at`, `scale` × its size, for `lifeS` (the lab's showcase). */
  pillar?(at: THREE.Vector3, scale: number, lifeS: number): void;
  /** Whether beast `i` still stands (Quy Nhất's chain skips the dead); none: all do. */
  alive?(i: number): boolean;
}

/** What the last cast did (the lab's __lab.thunder). */
export interface ThunderReport {
  readonly seed: number;
  readonly centre: readonly [number, number];
  readonly count: number;
  /** Each single bolt: when it landed, where, its scale and shape; the final strike after them. */
  readonly bolts: { at: number; x: number; z: number; scale: number; shape: number }[];
  /** Beasts struck (blows) and killed, by phase. */
  struck: number;
  killed: number;
  /** Each bolt's light on its first frame over the brightest it ever drew (all 1: whole on the first frame). */
  readonly firstK: number[];
  finalAt: number;
  arcs: number;
  /** Round 31 addendum: each run's length on screen (px at 1280 × 720, centre to its stop), and whether its sheaf was
   * made colShortK bigger for falling under colShortRatio of the longest. */
  runPx?: number[];
  runBig?: boolean[];
  /** Where each run's sheaf is at three quarters of its reach on screen (px at 1280 × 720): for numbering them. */
  runMark?: [number, number][];
  /** Quy Nhất: when the pillar slammed (s after the key), the gather bolts landed, the chain's hops (and blows). */
  slamAt?: number;
  gatherBolts?: number;
  chainHops?: number;
  chainBlows?: number;
}

/** One of the final strike's columns: its unit direction, bolt shape, start (s after the key), reach (m), light,
 * streak width ×, first clip frame, and how many colStepM marks it has passed. */
/** One column of a sheaf: its lane's offset to the side (m), its delay (s), its reach × the run's, its look (kind,
 * sheet cell, breathing phase), its card's height (m), its strip's width (m), first strip cell, tiles laid, when. */
interface Member { off: number; delay: number; reachK: number; kind: number; flip: number; phase: number; cardM: number; w: number; cell: number; tiles: number; passed: number[]; seq: number[]; every: number; lag: number }

/** One of the final strike's eight runs: its unit direction, start (s after the key), reach (m), light, how many
 * colStepM marks its centre column has passed, and its sheaf of columns. */
interface Column { dx: number; dz: number; start: number; reach: number; dim: number; stepped: number; members: Member[] }

interface Landing {
  x: number;
  z: number;
  /** The landing's size (m; its burst and ring), its scar's width (m), turn (rad), the landing's time (s after the key). */
  size: number;
  scar: number;
  /** The final strike's centre (its scar stays hot longer; the biggest burst and ring). */
  final?: boolean;
  /** Which of the three scar looks (0 hot → cooled, 1 hot → Lichtenberg, 2 Lichtenberg → cooled). */
  kind: number;
  rot: number;
  at: number;
}

const v = new THREE.Vector3();
const w = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const near = new Int32Array(256);
const opts: FlipOptions = { life: ONE_FRAME, rate: 0, frame: 0 };
/** A thrown particle's options (its own object: flip() never sees its velocity, tint or fades). */
const part: FlipOptions = { dir: new THREE.Vector3() };
/** Warm ivory (sparks, dust), grey slate (ash): the sheets are warm white on black, multiplied to the skill's tone. */
const SPARK_TINT = new THREE.Color(1, 0.95, 0.8);
const ASH_TINT = new THREE.Color(0.52, 0.55, 0.6);
/** The sparkle clip is orange glints on black (thunder-sparkle): its pool draws its brightness alone (`lightOnly`) in this pale gold. */
/** The dust rising from the formation: pale gold. */
const RISER_TINT = new THREE.Color(1, 0.9, 0.62);
const SPARKLE_TINT = new THREE.Color(1, 0.9, 0.66);
/** Rock chips thrown from a landing: stone grey. */
const CHIP_TINT = new THREE.Color(0.6, 0.58, 0.55);

/**
 * A pool that draws its clip's brightness (its brightest channel) in the card's tint, not the clip's own hue: the
 * orange sparkle clip in one tint, with no orange left at any brightness (a multiplied tint leaves dim pixels orange).
 */
/**
 * A pool whose clip's core alone (its brightest channel from 0.6 to 0.85, linear: the cut clips' cores peak lower than the stills') adds its light; the halo round it is laid over the
 * scene like paint (the card's occlude: 1), no brighter than 0.9 a channel, so stacked bolts do not add up to a
 * washed-out patch (round 9).
 */
/** The halo's ceiling per channel (linear, before tone mapping and bloom): 0.9 still showed near white once stacked with the bloom. */
const HALO_CAP = 0.5;
/** The core's light × this (HDR: the bloom takes the core alone, a sharp hot line in a thin halo). */
const CORE_HDR = 3;
/** The final strike's (round 15: its close-zoom frames washed out at 3). */
const STRIKE_HDR = 2.5;
/** How much of the core is added on top of the scene (the rest is laid over it): all of it stacked five bolts into a white patch at the close zoom. */
const CORE_ADD = 1;

/** A bolt's level `age` s after it lands, in 60 Hz frames: whole for 3 (the first and two held), an afterimage at 0.4 for
 * one, dark for two, a restrike at 0.6 for two (not with `restrike` false), then nothing. Cut, never faded. */
export function boltLevel(age: number, restrike = true): number {
  const n = Math.floor(age * 60 + 1e-4);
  return n < 0 ? 0 : n < 3 ? 1 : n === 3 ? AFTERIMAGE : restrike && (n === 6 || n === 7) ? 0.6 : 0;
}

/** The final strike's: whole for 12 frames, an afterimage for one, a restrike at 0.6 for three. */
export function strikeLevel(age: number): number {
  const n = Math.floor(age * 60 + 1e-4);
  return n < 0 ? 0 : n < 12 ? 1 : n === 12 ? AFTERIMAGE : n >= 15 && n <= 17 ? 0.6 : 0;
}

/** The afterimage's level. Its card is drawn at this ÷ the core's HDR gain, so the core itself shows at 0.4 (at 0.4 of
 * an HDR core it was still white: four lit frames, no afterimage). */
export const AFTERIMAGE = 0.4;

export function coreSplit(pool: FlipbookPool, hdr = CORE_HDR, wide = 1): void {
  const material = pool.mesh.material;
  // After a flat card's own patch (layFlat; the crawling bolts), when it has one.
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|five-thunder-core-split-" + hdr.toFixed(2) + "-" + wide.toFixed(2);
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const colour = "  vec3 rgb = t.rgb * vTint;";
    const out = "  gl_FragColor = vec4(rgb * soft, body * vOcclude * soft);";
    if (!shader.fragmentShader.includes(colour) || !shader.fragmentShader.includes(out)) throw new Error("[five-thunder] core-split anchor missing");
    // The cover follows the clip's own light (a video's wide dim glow otherwise covered the scene as a flat patch).
    // A wider card across the screen only (its height, so its trunk's place in the frame, unchanged).
    if (wide !== 1) {
      const local = "  vec2 local = vec2((uv.x - uPivot.x) * uAspect, uv.y - uPivot.y) * iData.x;";
      if (!shader.vertexShader.includes(local)) throw new Error("[five-thunder] wide-card anchor missing");
      shader.vertexShader = shader.vertexShader.replace(local, "  vec2 local = vec2((uv.x - uPivot.x) * uAspect * " + wide.toFixed(2) + ", uv.y - uPivot.y) * iData.x;");
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(colour, "  float fvCore = smoothstep(0.66, 0.78, max(t.r, max(t.g, t.b)));\n  vec3 rgb = mix(min(t.rgb * vTint, vec3(" + HALO_CAP.toFixed(2) + ")), t.rgb * vTint * " + hdr.toFixed(2) + ", fvCore);")
      .replace(out, "  gl_FragColor = vec4(rgb * soft, smoothstep(0.04, 1.0, lum) * vOcclude * soft * (1.0 - " + CORE_ADD.toFixed(2) + " * fvCore));");
  };
}

export function lightOnly(pool: FlipbookPool): void {
  const material = pool.mesh.material;
  // After a flat card's own patch (layFlat), when it has one.
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|five-thunder-light-only";
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const line = "  vec3 rgb = t.rgb * vTint;";
    if (!shader.fragmentShader.includes(line)) throw new Error("[five-thunder] light-only anchor missing");
    shader.fragmentShader = shader.fragmentShader.replace(line, "  vec3 rgb = vec3(max(t.r, max(t.g, t.b))) * vTint;");
  };
}
/** Light × tint with a white-hot core (the violet flipbooks take the elements' colours; their brightest lines stay white). */
export function lumaCore(pool: FlipbookPool): void {
  const material = pool.mesh.material;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|five-thunder-luma-core";
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const line = "  vec3 rgb = t.rgb * vTint;";
    if (!shader.fragmentShader.includes(line)) throw new Error("[five-thunder] luma-core anchor missing");
    shader.fragmentShader = shader.fragmentShader.replace(line, "  float fvLum = max(t.r, max(t.g, t.b));\n  vec3 rgb = mix(fvLum * vTint, vec3(fvLum) * max(vTint.r, max(vTint.g, vTint.b)), smoothstep(0.72, 1.0, fvLum));");
  };
}
function particle(): FlipOptions {
  const o = part;
  o.life = 0.3;
  o.rate = 0;
  o.frame = 0;
  o.rot = o.spin = o.alpha = o.intensity = o.tint = o.vx = o.vy = o.vz = o.drag = o.gravity = o.fadeIn = o.fadeOut = o.delay = o.lift = o.ground = undefined;
  o.dir = null;
  o.grow = undefined;
  o.occlude = 0;
  return o;
}
const flyDir = new THREE.Vector3();
const dirV = new THREE.Vector3();
const crawlV = new THREE.Vector3();
/** The pool of light under a snake's head: warm ivory. */
const POOL_TINT = new THREE.Color(1, 0.92, 0.78);
const edgeV = new THREE.Vector3();
const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
let blank: THREE.DataTexture | null = null;
function blankTexture(): THREE.DataTexture {
  if (blank === null) {
    blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    blank.needsUpdate = true;
  }
  return blank;
}

/** A landing's burst shows this long (s): 6 frames at 60. */
/** The cut clips play at this rate (frames a second), whatever their json says (the burst's was cut at 6). */
const CLIP_FPS = 24;
/** The burst's clip plays once over this long (s). */
const BURST_CLIP_S = 0.5;
/** The trail strip's cells (2048 × 256 cut into eight squares). */
const TRAIL_TILES = 8;
/** Round 36: every layer's light at most this, but the centre bolt's and the main columns' cores. */
const LIGHT_CAP = 0.9;
/** A strip tile's faded ends (share of its length), each overlapping its neighbour by as much. */
const TILE_ENDS = 0.18;
/** The trail's rock darkened, its glow pale gold (a little fire in the cracks). */
const TRAIL_ROCK_TINT = new THREE.Color(0.5, 0.5, 0.52);
const TRAIL_GLOW_TINT = new THREE.Color(1, 0.86, 0.6);
const BURST_S = 4 / 60;
/** Its first part: at full light from the first frame, growing from 0.5 to 1.2 of its size (4 frames); the rest fades. */
const BURST_GROW_S = 4 / 60;

/** The fields read from a cut flipbook's json (tools/vfx-flipbook v1). */
interface CutJson { loop?: boolean; id: string; image: string; cols: number; rows: number; frames: number; fps: number; cell: [number, number]; pivot: [number, number] }

/** A scar's hot and cooled patches' levels `age` s after its landing: hot for `hotS`, then cross-fading over `coolS`. */
export function scarLevels(age: number, hotS: number, coolS: number): { hot: number; cold: number } {
  const k = smooth((age - hotS) / coolS);
  return { hot: age < 0 ? 0 : 1 - k, cold: age < 0 ? 0 : k };
}

/**
 * A pool that draws a painted patch on black as a decal: the patch (its blurred light, so the dark cracks inside it
 * count) covers the ground under it and its own colours are laid over, instead of adding light.
 */
/** A column's share of its run at `u` (0–1 of its time): steady, slowing to a stop over the last `slow`. */
export function columnRun(u: number, slow: number): number {
  const k = Math.min(1, Math.max(0, u));
  const steady = 1 - slow;
  const total = steady + slow / 2;
  if (k <= steady) return k / total;
  const w = k - steady;
  return (steady + w - (w * w) / (2 * slow)) / total;
}

/** A scar patch's radius in its card (its bright box is 0.513 of the card), and how much of its stone body covers the ground. */
const PATCH_R = 0.262;
const STONE_KEEP = 0.45;
const STONE_DARK = 0.32;
const STONE_COVER = 0.8;

/** A flat card whose outer edge fades over the last 8 % of radius `r` (in the card, from its pivot): no hard rim. */
export function edgeFade(pool: FlipbookPool, r: number): void {
  const material = pool.mesh.material;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|five-thunder-edge-" + r.toFixed(3);
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const soft = "  float soft = vxSoftGround(vWorld, vGround, uSoftM) * border * vAlpha;";
    if (!shader.fragmentShader.includes(soft)) throw new Error("[five-thunder] edge-fade anchor missing");
    shader.fragmentShader = shader.fragmentShader
      .replace(soft, soft + "\n  soft *= 1.0 - smoothstep(" + (r * 0.92).toFixed(4) + ", " + r.toFixed(4) + ", length(vUv - uPivot));")
      .replace(/^/, "uniform vec2 uPivot;\n");
  };
}

/** A bolt's crawling twin (it shares its texture); "" for a crawl itself (never loaded on its own); null otherwise. */
function crawlOf(id: ThunderLayer): ThunderLayer[] | "" {
  if (id.startsWith("crawl") || id === "boltCentre") return "";
  const i = BOLTS.indexOf(id);
  return i < 0 ? [] : i === 0 ? [CRAWLS[i]!, "boltCentre"] : [CRAWLS[i]!];
}

/** How far (m) run `c` sways across itself `d` m out (its snake and its strip on one path), and the slope of that. */
export function runSway(d: number, c: number): number {
  const F = FIVE_THUNDER;
  return F.crawlSwayM * Math.sin(d * ((Math.PI * 2) / F.crawlWaveM) + c * 1.7);
}
export function runSlope(d: number, c: number): number {
  const F = FIVE_THUNDER;
  const wave = (Math.PI * 2) / F.crawlWaveM;
  return F.crawlSwayM * wave * Math.cos(d * wave + c * 1.7);
}

/** A flat card faded from its centre like a soft light (no flat plateau): the snakes' pool of light (round 28). */
export function softPool(pool: FlipbookPool): void {
  const material = pool.mesh.material;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|five-thunder-soft-pool";
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const line = "  border *= 1.0 - uVignette * smoothstep(0.6, 0.98, length(vUv - 0.5) * 2.0);";
    if (!shader.fragmentShader.includes(line)) throw new Error("[five-thunder] soft-pool anchor missing");
    shader.fragmentShader = shader.fragmentShader.replace(line, "  float fvR = length(vUv - 0.5) * 2.0;\n  border *= 1.0 - smoothstep(" + FIVE_THUNDER.crawlPoolCore.toFixed(2) + ", 1.0, fvR);");
  };
}

/**
 * The lab's view profile (camera-modes.ts; view only): flat cards lifted and their far half tipped up toward the camera
 * (so a low camera does not squash them flat), upright cards drawn bigger. Shared by every flat pool's shader.
 */
export const VIEW_UNIFORMS = {
  uViewLift: { value: 0 },
  uViewTilt: { value: 0 },
  uViewToCam: { value: new THREE.Vector2(0, 1) },
  /** The far edge rises at most this high (m): the 22 m formation tipped 35° stood up as a wall in the side view. */
  uViewMaxM: { value: 1.5 },
  /** Round 35: at the low views the lower body of a column (above its strike) at 55 % so the beasts behind show. */
  uViewLowCol: { value: 0 },
  /** Round 37: the columns' halo cap (haloCap), lower at the low views. */
  uViewHaloCap: { value: 0.55 },
};
/** A column card's lower body faded (view profile, low views): 0–45 % of the column's height above its foot, less its
 * bottom 10 % (the strike), at LOW_COL_K, eased in and out. */
const LOW_COL_K = 0.55;
export function lowFade(pool: FlipbookPool): void {
  const material = pool.mesh.material;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|five-thunder-low-fade";
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const out = "  gl_FragColor = vec4(rgb * soft, body * vOcclude * soft);";
    if (!shader.fragmentShader.includes(out)) throw new Error("[five-thunder] low-fade anchor missing");
    shader.uniforms.uViewLowCol = VIEW_UNIFORMS.uViewLowCol;
    const foot = (1 - SHARP_PIVOT[1]).toFixed(3);
    const h = COLUMN_FILL.toFixed(3);
    if (!shader.fragmentShader.includes("varying float vFvSide;")) shader.fragmentShader = "varying float vFvSide;\n" + shader.fragmentShader;
    shader.fragmentShader = "uniform float uViewLowCol;\n" + shader.fragmentShader.replace(out,
      "  float fvH = (vUv.y - " + foot + ") / " + h + ";\n" +
      "  float fvLow = 1.0 - uViewLowCol * (1.0 - vFvSide) * (1.0 - " + LOW_COL_K.toFixed(2) + ") * smoothstep(0.08, 0.14, fvH) * (1.0 - smoothstep(0.39, 0.47, fvH));\n" +
      "  gl_FragColor = vec4(rgb * soft * fvLow, body * vOcclude * soft * fvLow);");
  };
}
export function viewTilt(pool: FlipbookPool): void {
  const material = pool.mesh.material;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|five-thunder-view-tilt";
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const line = "  vWorld = (modelMatrix * vec4(iPos + vec3(corner.x, 0.0, corner.y), 1.0)).xyz;";
    if (!shader.vertexShader.includes(line)) throw new Error("[five-thunder] view-tilt anchor missing");
    Object.assign(shader.uniforms, VIEW_UNIFORMS);
    shader.vertexShader = "uniform float uViewLift;\nuniform float uViewTilt;\nuniform vec2 uViewToCam;\nuniform float uViewMaxM;\n" + shader.vertexShader.replace(line,
      "  float fvUp = uViewLift + min(uViewMaxM, max(0.0, -dot(corner, uViewToCam)) * tan(uViewTilt));\n  vWorld = (modelMatrix * vec4(iPos + vec3(corner.x, fvUp, corner.y), 1.0)).xyz;");
  };
}

/** The four frames 0–3 in an order drawn from `R`. */
function shuffle4(R: Rand): number[] {
  const a = [0, 1, 2, 3];
  for (let i = 3; i > 0; i -= 1) {
    const j = Math.floor(R.next() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

/** A column body's halo (its light under its core's brightness) capped at `cap`: the halo reads narrower, the core whole. */
export function haloCap(pool: FlipbookPool, cap: number): void {
  const material = pool.mesh.material;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|five-thunder-halo-cap-" + cap.toFixed(2);
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const line = "  vec3 rgb = t.rgb * vTint;";
    if (!shader.fragmentShader.includes(line)) throw new Error("[five-thunder] halo-cap anchor missing");
    // Round 37: the cap from the view profile (VIEW_UNIFORMS.uViewHaloCap; `cap` at the top view).
    shader.uniforms.uViewHaloCap = VIEW_UNIFORMS.uViewHaloCap;
    VIEW_UNIFORMS.uViewHaloCap.value = cap;
    shader.fragmentShader = "uniform float uViewHaloCap;\n" + shader.fragmentShader.replace(line, line + "\n  rgb = mix(min(rgb, vec3(uViewHaloCap)), rgb, smoothstep(0.62, 0.8, max(t.r, max(t.g, t.b))));");
  };
}

/** A fixed 0–1 number from an integer (layouts that must not draw on the seeded streams). */
function hash01(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Whether (x, z) lies `margin` m inside the lab's court. */
export function inCourt(x: number, z: number, margin = 0): boolean {
  return x >= COURT.x0 + margin && x <= COURT.x1 - margin && z >= COURT.z0 + margin && z <= COURT.z1 - margin;
}

/** A strip's width (0–1 of its own) at `frac` (0 at its start, 1 at its end) of its length: tapered to trailTaper,
 * varying ±trailWobble along it (`seed` sets its own wobble). */
export function trailWidth(frac: number, seed: number): number {
  const F = FIVE_THUNDER;
  const f = Math.min(1, Math.max(0, frac));
  const wob = 0.6 * Math.sin(f * 11.3 + seed * 5.1) + 0.4 * Math.sin(f * 27.7 + seed * 2.3);
  return (1 - (1 - F.trailTaper) * f) * (1 + F.trailWobble * wob);
}

/** Round 26: a rock strip whose plates let the court through and whose cracks stay dark (its opacity follows the
 * image's own darkness, CRACK_KEEP on its lit plates), so it reads as broken ground, never a solid black band. */
export const CRACK_KEEP = 0.4;
export function crackOpacity(pool: FlipbookPool): void {
  const material = pool.mesh.material;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|five-thunder-crack-opacity";
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const line = "    gl_FragColor = vec4(pm * vTint * soft, a * soft);";
    if (!shader.fragmentShader.includes(line)) throw new Error("[five-thunder] crack-opacity anchor missing");
    shader.fragmentShader = shader.fragmentShader.replace(line, `    float fvRock = a > 1e-4 ? dot(pm / a, vec3(0.3, 0.59, 0.11)) : 0.0;
    float fvCrack = mix(${CRACK_KEEP.toFixed(2)}, 1.0, smoothstep(0.26, 0.18, fvRock));
    pm *= fvCrack;
    a *= fvCrack;
` + line);
  };
}

/** A flat card that does not fade its cell's left and right edges (strip tiles laid end to end). */
export function seamlessX(pool: FlipbookPool, edge = 0.18, ends = 0): void {
  const material = pool.mesh.material;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|five-thunder-seamless-x-" + edge.toFixed(3) + "-" + ends.toFixed(3);
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const line = "  float border = smoothstep(0.0, 0.025, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));";
    if (!shader.fragmentShader.includes(line)) throw new Error("[five-thunder] seamless-x anchor missing");
    shader.fragmentShader = shader.fragmentShader
      // Its long edges melt into the ground over `edge` of its width (a hard edge read as a laid rope of stone); the rock
      // (round 26) only a hair, its own broken alpha edge showing.
      // With `ends` (round 28 fix: tiles 4.5 m wide turned round the bends), each tile's two ends fade over that much of
      // its length, laid overlapping its neighbours by as much, so the joints blend instead of showing a square corner.
      .replace(line, "  float border = smoothstep(0.0, " + edge.toFixed(3) + ", min(vUv.y, 1.0 - vUv.y))" + (ends > 0 ? " * smoothstep(0.0, " + ends.toFixed(3) + ", min(vUv.x, 1.0 - vUv.x))" : "") + ";")
      .replace("  vec2 uv = clamp(vUv, 0.004, 0.996);", "  vec2 uv = vec2(clamp(vUv.x, 0.0005, 0.9995), clamp(vUv.y, 0.004, 0.996));");
  };
}

export function decal(pool: FlipbookPool): void {
  const material = pool.mesh.material;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|five-thunder-decal";
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const out = "  gl_FragColor = vec4(rgb * soft, body * vOcclude * soft);";
    if (!shader.fragmentShader.includes(out)) throw new Error("[five-thunder] decal anchor missing");
    shader.fragmentShader = shader.fragmentShader.replace(out, `  vec4 fvWide = texture2D(uMap, vxCell(f0, uv0), 5.5);
  float fvCover = smoothstep(0.03, 0.12, max(fvWide.r, max(fvWide.g, fvWide.b)));
  // Its edge melts into the ground over the patch's outer 10 % (the patch is PATCH_R of the card from its pivot).
  // (round 17) along a noisy radius, so no straight or circular boundary shows.
  float fvEdge = ${PATCH_R.toFixed(3)} * (0.66 + 0.34 * vxNoise(vUv * 17.0 + uPivot * 9.0) * 0.6 + 0.34 * 0.4 * vxNoise(vUv * 43.0));
  fvCover *= 1.0 - smoothstep(fvEdge * 0.78, fvEdge, length(vUv - uPivot));
  // Its stone body lets the ground's own tiles through (not pasted flat); its dark cracks and its glow stay whole.
  float fvKeep = mix(${STONE_KEEP.toFixed(2)}, 1.0, max(1.0 - smoothstep(0.05, 0.22, lum), smoothstep(0.55, 0.8, lum)));
  // The stone body is drawn darker than the court (round 21: the scar's heart at least a quarter darker than the tiles).
  gl_FragColor = vec4(rgb * soft * fvKeep * mix(${STONE_DARK.toFixed(2)}, 1.0, smoothstep(0.55, 0.8, lum)), fvCover * mix(fvKeep, 1.0, ${STONE_COVER.toFixed(2)}) * vOcclude * soft);`)
      // The pivot is a vertex uniform in the pool's shader: the fragment declares it too.
      .replace(/^/, "uniform vec2 uPivot;\n");
  };
}

export function stillMeta(id: string, url: string, width: number, height: number, pivot: readonly [number, number], mode: FlipbookMode = "fire"): FlipbookMeta {
  return { id, url, cols: 1, rows: 1, frames: 1, fps: 1, loop: false, mode, aspect: width / height, pivot, start: 0, heading: 0, role: "still" };
}

/** Resets the shared options for one card. */
function flip(): FlipOptions {
  const o = opts;
  o.life = ONE_FRAME;
  o.rate = 0;
  o.frame = 0;
  o.rot = o.alpha = o.intensity = o.occlude = o.lift = o.ground = o.grow = undefined;
  o.tint = undefined;
  o.dir = undefined;
  o.span = undefined;
  return o;
}

export class FiveThunder {
  private readonly pools = new Map<ThunderLayer, FlipbookPool>();
  private readonly attached = new Set<ThunderLayer>();
  private plan: ThunderPlan | null = null;
  private seed = 0;
  /** The particles' own stream (the landings' turns keep theirs). */
  private dust = new Rand(1);
  /** Each layer's drawn size × (its still's or its flipbook's). */
  private readonly scales = new Map<ThunderLayer, number>();
  /** Rising dust thrown so far this cast. */
  private risers = 0;
  /** The aftermath's smoke and ash thrown this cast. */
  private aftermath = false;
  /** The gathering's motes thrown this cast. */
  private gathered = 0;
  /** The final strike's eight columns, and the beasts they have thrown. */
  private readonly cols: Column[] = [];
  private readonly swept = new Set<number>();
  private cx = 0;
  private cz = 0;
  private t = 0;
  /** The next single bolt to land, the final strike's state (0 waiting, 1 landed), the next arc. */
  private next = 0;
  private finalDone = false;
  private pulled = false;
  /** The finisher (Quy Nhất by default; "eightRuns": round 37's). */
  finisher: ThunderFinisher = "quyNhat";
  private slamT = -1;
  private gatherLanded = 0;
  private readonly chainI = new Int32Array(QUY_NHAT.chainMax);
  private readonly chainFromX = new Float32Array(QUY_NHAT.chainMax);
  private readonly chainFromZ = new Float32Array(QUY_NHAT.chainMax);
  private readonly chainFrom = new Int32Array(QUY_NHAT.chainMax);
  private readonly chainAt = new Float32Array(QUY_NHAT.chainMax);
  private readonly chainHits = new Uint8Array(QUY_NHAT.chainMax);
  private chainN = 0;
  private nextCrackle = 0;
  /** The view's profile (camera-modes.ts): upright cards this much bigger. */
  uprightK = 1;
  /** The view's profile: flat cards lifted (m), their far half tipped up toward the camera (rad) along `toCam` (ground). */
  setView(liftM: number, tilt: number, uprightK: number, toCamX: number, toCamZ: number, lowCol = tilt > 0 ? 1 : 0): void {
    VIEW_UNIFORMS.uViewLowCol.value = lowCol;
    VIEW_UNIFORMS.uViewHaloCap.value = lowCol > 0 ? FIVE_THUNDER.lowHaloCap : FIVE_THUNDER.colHaloCap;
    VIEW_UNIFORMS.uViewLift.value = liftM;
    VIEW_UNIFORMS.uViewTilt.value = tilt;
    VIEW_UNIFORMS.uViewToCam.value.set(toCamX, toCamZ);
    this.uprightK = uprightK;
  }
  private edgeJolted = false;
  private nextArc = 0;
  private readonly landings: Landing[] = [];
  private readonly rand = new Rand(1);
  private glowing = false;
  private darkened = false;
  private loading = false;
  last: ThunderReport | null = null;
  /** What was drawn since the last reset. */
  readonly audit = { formation: 0, seal: 0, bolts: 0, flashes: 0, bursts: 0, rings: 0, cracks: 0, arcs: 0, strike: 0, blows: 0, sparks: 0, deaths: 0, risers: 0, puffs: 0, thread: 0, columns: 0, trail: 0, crawl: 0 };

  constructor(private readonly host: ThunderHost) {
    const order: Record<ThunderLayer, number> = { dim: 2, lichtenberg: 6, columnA: 15, columnCoreA: 16, trailRock: 6, trailCap: 6, trailGlow: 7, trailCapGlow: 7, crawlA: 8, crawlB: 8, crawlC: 8, crawlD: 8, glowPool: 5, lichtStrip: 6, ribbon: 9, ringBurst: 9, scarCold: 6, scarHot: 6, smoke: 12, formation: 5, formationRim: 5, arcs: 6, ring: 7, formationShade: 3, formationFlash: 8, cloud: 11, corpseArc: 12, embers: 13, motes: 13, sparks: 16, sparkle: 16, burst: 14, seal: 14, boltA: 15, boltCentre: 15, boltB: 15, boltC: 15, boltD: 15, };
    const capacity: Partial<Record<ThunderLayer, number>> = { dim: 192, lichtenberg: 48, lichtStrip: 80, ribbon: 320, ringBurst: 2, trailRock: 512, trailGlow: 512, columnA: 48, columnCoreA: 48, trailCap: 24, trailCapGlow: 24, crawlA: 96, crawlB: 96, crawlC: 96, crawlD: 96, glowPool: 48, boltA: 16, boltCentre: 4, boltB: 16, boltC: 16, boltD: 16, scarCold: 24, scarHot: 24, smoke: 32, arcs: 8, ring: 24, formation: 2, formationRim: 6, formationShade: 4, formationFlash: 2, cloud: 2, corpseArc: 64, embers: 224, motes: 192, sparks: 160, sparkle: 32, burst: 96, seal: 4, };
    for (const id of Object.keys(THUNDER_SOURCES) as ThunderLayer[]) {
      const pool = new FlipbookPool("five-thunder-" + id, THUNDER_SOURCES[id].mode ?? "fire", capacity[id] ?? 8, order[id], blankTexture());
      const flat = THUNDER_SOURCES[id].flat;
      pool.vignette = flat ? 0.25 : 0.15;
      if (flat) layFlat(pool);
      if (id === "dim" || id === "glowPool") {
        // A white texel: the card darkens what is under it by its occlude, faded by its vignette.
        const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
        white.needsUpdate = true;
        pool.vignette = 1;
        pool.attach(stillMeta("five-thunder-" + id, "", 1, 1, [0.5, 0.5]), white);
        this.attached.add(id);
        this.scales.set(id, 1);
      }
      if (flat) viewTilt(pool);
      if (id === "sparkle") lightOnly(pool);
      if (id === "ribbon" || id === "ringBurst") lumaCore(pool);
      if (id === "columnA" || id === "columnCoreA") wideCard(pool, FIVE_THUNDER.sheafWide);
      if (id === "columnA" || id === "columnCoreA") lowFade(pool);
      if (id === "columnA") haloCap(pool, FIVE_THUNDER.colHaloCap);
      if (id === "glowPool") softPool(pool);
      if (id === "trailRock" || id === "trailGlow" || id === "trailCap" || id === "trailCapGlow") {
        // Tiles meet edge to edge: no fade along x (the strip is seamless), no vignette.
        pool.vignette = 0;
        seamlessX(pool, id === "trailRock" || id === "trailCap" ? 0.03 : 0.18, id === "trailRock" || id === "trailGlow" ? TILE_ENDS : 0);
        if (id === "trailRock" || id === "trailCap") crackOpacity(pool);
      }
      if (id === "scarHot" || id === "scarCold" || id === "lichtenberg" || id === "lichtStrip") decal(pool);
      if (id === "lichtStrip") pool.vignette = 1;
      if (id === "formation") edgeFade(pool, FIVE_THUNDER.formFill / 2);
      if (id === "formationRim") edgeFade(pool, (FIVE_THUNDER.rimFill / 2) * 1.04);
      else if (id === "boltCentre") coreSplit(pool, CORE_HDR, FIVE_THUNDER.mainWide);
      // Round 36: every other bolt's core at 1 (its light ≤ 0.9 with the spawn cap); only the centre bolt keeps HDR.
      // Round 37: the barrage bolts back at their HDR (they never stand over the columns); the crawl stays at 1.
      else if (id === "boltA" || id === "boltB") coreSplit(pool, CORE_HDR, FIVE_THUNDER.mainWide);
      else if (id.startsWith("bolt")) coreSplit(pool);
      else if (id.startsWith("crawl")) coreSplit(pool, 1);
      host.layer.add(pool.mesh);
      this.pools.set(id, pool);
    }
  }

  /** A layer's texture (a still or a flipbook already cut to one frame), `width` × `height` px. */
  adopt(id: ThunderLayer, texture: THREE.Texture, width: number, height: number): void {
    const s = THUNDER_SOURCES[id];
    const meta = stillMeta("five-thunder-" + id, THUNDER_STILLS + s.still, width, height, s.pivot, s.mode ?? "fire");
    const g = s.grid;
    this.scales.set(id, s.scale ?? 1);
    this.pools.get(id)!.attach(g === undefined ? meta : { ...meta, cols: g[0], rows: g[1], frames: g[0] * g[1], aspect: (width / g[0]) / (height / g[1]) }, texture);
    this.attached.add(id);
    const twins = crawlOf(id);
    if (twins !== "") for (const twin of twins) if (!this.attached.has(twin)) this.adopt(twin, texture, width, height);
  }

  /** Every layer's still from THUNDER_STILLS (the browser; once). */
  load(): void {
    if (this.loading || this.ready || typeof document === "undefined") return;
    this.loading = true;
    const loader = new THREE.TextureLoader();
    for (const id of Object.keys(THUNDER_SOURCES) as ThunderLayer[]) {
      if (this.attached.has(id) || crawlOf(id) === "") continue;
      const book = THUNDER_SOURCES[id].flipbook;
      const cut = book === undefined ? null : THUNDER_FLIPBOOKS + book.folder + "/" + book.id;
      // A cut flipbook: its own json (cells, frames, pivot, peak) and atlas; the still stands in if it does not load.
      const meta = cut === null ? Promise.resolve(null) : fetch(cut + ".json").then((r) => (r.ok ? (r.json() as Promise<CutJson>) : null)).catch(() => null);
      void meta.then((json) => loader.loadAsync(json === null ? THUNDER_STILLS + THUNDER_SOURCES[id].still : THUNDER_FLIPBOOKS + book!.folder + "/" + json.image).then((texture) => ({ json, texture }))).then(({ json, texture }) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.premultiplyAlpha = false;
        const img = texture.image as { width: number; height: number };
        // Round 29: the strip's rock and its cracks at the image's own resolution (no mip blur; anisotropy 8).
        if (id === "trailRock" || id === "trailCap" || id === "lichtStrip") {
          texture.generateMipmaps = false;
          texture.minFilter = THREE.LinearFilter;
        }
        if (json === null) this.adopt(id, texture, img.width, img.height);
        else {
          this.pools.get(id)!.attach({ id: json.id, url: cut + ".atlas", cols: json.cols, rows: json.rows, frames: json.frames, fps: json.fps, loop: json.loop === true, mode: "fire", aspect: json.cell[0] / json.cell[1], pivot: book!.pivot ?? json.pivot, start: 0, heading: 0, role: "clip" }, texture);
          this.scales.set(id, book!.scale ?? 1);
          const twins = crawlOf(id);
          if (twins !== "") for (const twin of twins) {
            this.pools.get(twin)!.attach(this.pools.get(id)!.meta!, texture);
            this.scales.set(twin, book!.scale ?? 1);
            this.attached.add(twin);
          }
          // The bolts' fine lines: no mip blur (anisotropy 8, linear).
          if (id.startsWith("bolt")) {
            texture.generateMipmaps = false;
            texture.minFilter = THREE.LinearFilter;
            texture.needsUpdate = true;
          }
          this.attached.add(id);
        }
      }).catch((error: unknown) => console.warn("[five-thunder] " + id, error));
    }
  }

  get ready(): boolean {
    return this.attached.size === Object.keys(THUNDER_SOURCES).length;
  }

  get active(): boolean {
    return this.plan !== null && this.t < FIVE_THUNDER.endS + FIVE_THUNDER.scarOutS + 0.05;
  }

  /** The cast on (cx, cz) now, from `seed` (the same seed: the same shower). */
  cast(cx: number, cz: number, seed = 1111): void {
    this.reset();
    this.load();
    this.plan = planFiveThunder(seed);
    this.seed = seed;
    this.dust = new Rand((seed ^ 0x51ed5) >>> 0);
    this.cx = cx;
    this.cz = cz;
    this.t = 0;
    this.last = { seed, centre: [cx, cz], count: this.plan.at.length, bolts: [], struck: 0, killed: 0, firstK: [], finalAt: -1, arcs: 0 };
    this.host.sound(0.85, 0.5);
    this.draw(0);
  }

  /** World time: the clock runs, bolts land on their frame, every card is redrawn (ONE_FRAME) at this frame's light. */
  update(dt: number): void {
    if (this.plan === null) {
      for (const p of this.pools.values()) p.update(dt);
      return;
    }
    this.t += dt;
    this.draw(dt);
    for (const p of this.pools.values()) p.update(dt);
    const chainEnd = this.slamT < 0 ? 0 : this.slamT + QUY_NHAT.chainDelayS + QUY_NHAT.chainR / QUY_NHAT.chainV + QUY_NHAT.ticks * QUY_NHAT.tickGapS + 0.2;
    if (this.t >= Math.max(FIVE_THUNDER.endS + FIVE_THUNDER.scarOutS + 0.05, this.finalDone ? chainEnd : 0)) this.plan = null;
  }

  private draw(dt: number): void {
    const F = FIVE_THUNDER;
    const P = this.plan!;
    const t = this.t;
    const H = this.host;
    // The first frame of a cast draws every late layer once, all but invisible, so their textures go to the GPU now and
    // not on the frame the eight columns set off (round 24: six 2048 × 1536 column sheets).
    if (t <= dt + 1e-6) {
      for (const id of WARM_LAYERS) {
        const o = flip();
        o.alpha = 0.002;
        o.intensity = 0.002;
        o.occlude = 0;
        this.spawn(id, v.set(this.cx, 0.05, this.cz), 0.5, o);
      }
    }
    // 1. The charge: the caster's rim and the scene's darkening up to the first bolt, the formation and the seal.
    const charge = smooth(t / F.chargeS);
    if (t < F.chargeS) {
      this.glowing = true;
      H.glow(0.3 + 0.7 * charge);
      this.darkened = true;
      H.dark(0.22 * charge);
    } else if (this.glowing || this.darkened) {
      this.glowing = false;
      this.darkened = false;
      H.glow(0);
      H.dark(0);
    }
    const cool = smooth((t - F.finalEndS) / (F.endS - F.finalEndS));
    const gone = smooth((t - F.endS) / F.scarOutS);
    // The formation on the ground at the centre: from nothing to the area's width over formGrowS, speeding up, 5 % past
    // it and back; lit as it grows, held through the barrage with a pulse on each bolt, brightest at the final strike,
    // out with the cracks; a second ring turning the other way round its rim; a flash at its middle on its full size.
    const formOut = (1 - cool) * (1 - gone);
    if (formOut > 0) {
      const u = Math.min(1, t / F.formGrowS);
      const grown = t < F.formGrowS ? (1 + F.formOver) * u * u : 1 + F.formOver * (1 - smooth((t - F.formGrowS) / F.formSettleS));
      const final = t >= F.finalS && t < F.finalEndS;
      // Its level (0–1): held through the barrage, a pulse on each bolt, whole at the final strike.
      // The formation breathes. Whole through the charge and at the final strike; once the bolts fall it drops to
      // formDim and stops flaring with them, so the bolts are the only bright thing (the blind judges, 12/11).
      const flare = 1;
      const breath = 1 + F.breath * Math.sin((t / F.breathS) * Math.PI * 2);
      const pauseAt = F.finalS - F.gatherS - F.pauseS;
      const finalK = t - F.finalS < F.finalDimS ? F.finalDimK : F.finalDimK + (1 - F.finalDimK) * smooth((t - F.finalS - F.finalDimS) / 0.15);
      const level = (dim: number, pause: number): number => u * (final ? finalK : t >= pauseAt ? dim + (pause - dim) * smooth((t - pauseAt) / F.pauseS) : 1 - (1 - dim) * smooth((t - F.chargeS + 0.05) / 0.1)) * formOut;
      const lit = level(F.formDim, F.pauseDim);
      const litRim = level(F.rimDim, (F.pauseDim * F.rimDim) / F.formDim);
      const D = (F.formR * 2 * grown * (final ? 1.04 : 1)) / F.formFill;
      let o = flip();
      o.dir = X_AXIS;
      o.rot = -0.1 * t;
      o.intensity = 0.03;
      o.occlude = 1;
      o.alpha = F.shadeAlpha * u * formOut;
      o.lift = 0.1;
      this.spawn("formationShade", v.set(this.cx, 0.02, this.cz), (F.formR * 2 * grown * F.shadeWider) / F.shadeFill, o);
      // The dark edge 20 % past the formation, and the ring's own shape as a contact shadow on the ground under it.
      o = flip();
      o.dir = X_AXIS;
      o.rot = 0.9;
      o.intensity = 0.02;
      o.occlude = 1;
      o.alpha = F.edgeAlpha * u * formOut;
      o.lift = 0.08;
      this.spawn("formationShade", v.set(this.cx, 0.015, this.cz), (F.formR * 2 * grown * F.edgeWider) / F.shadeFill, o);
      o = flip();
      o.dir = X_AXIS;
      o.rot = 2.1 - ((Math.PI * 2) / F.rimTurnS2) * t;
      o.intensity = 0.02;
      o.occlude = 1;
      o.alpha = F.contactAlpha * u * formOut;
      o.lift = 0.12;
      this.spawn("formationRim", v.set(this.cx, 0.03, this.cz), ((F.formR * 2 * grown * F.rimWider) / F.rimFill) * 1.015, o);
      o = flip();
      o.dir = X_AXIS;
      o.rot = 0.25 * t;
      o.intensity = lit * F.formGain * breath;
      o.alpha = F.formAlpha * u * formOut;
      o.lift = 0.2;
      this.spawn("formation", v.set(this.cx, F.formY, this.cz), D, o);
      o = flip();
      o.dir = X_AXIS;
      o.rot = 2.1 - ((Math.PI * 2) / F.rimTurnS2) * t;
      o.intensity = litRim * F.rimGain;
      o.alpha = F.formAlpha * u * formOut;
      o.lift = 0.2;
      const rimD = (F.formR * 2 * grown * F.rimWider) / F.rimFill;
      this.spawn("formationRim", v.set(this.cx, F.rimY * grown, this.cz), rimD, o);
      // The third tier: the same ring, smaller, higher, turning with the formation.
      o = flip();
      o.dir = X_AXIS;
      o.rot = 0.7 + ((Math.PI * 2) / F.topTurnS) * t;
      o.intensity = lit * F.rimGain;
      o.alpha = F.topAlpha * u * formOut;
      o.lift = 0.2;
      this.spawn("formationRim", v.set(this.cx, F.topY * grown, this.cz), rimD * F.topScale, o);
      // The upright core at the centre: a low card facing the camera, breathing.
      o = flip();
      o.intensity = 0.9 * flare;
      o.alpha = F.coreAlpha * u * formOut * (0.9 + 0.1 * Math.sin(t * 4.2));
      o.lift = 0.6;
      this.spawn("seal", v.set(this.cx, 0.75, this.cz), F.coreM * (1 + 0.04 * Math.sin(t * 5.3)), o);
      const lit0 = t - F.formGrowS;
      if (lit0 >= 0 && lit0 < 0.16) {
        o = flip();
        o.dir = X_AXIS;
        o.rot = 3 * t;
        o.intensity = 0.9 * (1 - smooth(lit0 / 0.16));
        o.lift = 0.3;
        this.spawn("formationFlash", v.set(this.cx, 0.07, this.cz), F.areaR * (0.9 + 2 * lit0), o);
      }
      this.audit.formation += 1;
    }
    // Bright dust rising from the formation through the charge and the barrage (seeded, evenly spaced in time).
    while (this.risers < F.risers && t >= 0.12 + (this.risers * (F.finalS - 0.12)) / F.risers) {
      const R = this.dust;
      const a = R.next() * Math.PI * 2;
      const d = Math.sqrt(R.next()) * F.formR * 0.92;
      const o = particle();
      o.life = F.riseS * R.range(0.85, 1.15);
      o.frame = Math.floor(R.next() * 16);
      o.vx = R.range(-0.15, 0.15);
      o.vy = F.riseM / F.riseS;
      o.vz = R.range(-0.15, 0.15);
      o.rot = R.next() * Math.PI * 2;
      o.spin = R.range(-0.6, 0.6);
      o.tint = RISER_TINT;
      o.intensity = 1.2;
      o.fadeIn = 0.2;
      o.fadeOut = 0.5;
      o.lift = 0.5;
      this.spawn("motes", v.set(this.cx + Math.cos(a) * d, 0.1, this.cz + Math.sin(a) * d), R.range(1.4, 2.4), o);
      this.risers += 1;
      this.audit.risers += 1;
    }
    // The ground darkens round the centre (a soft tint): in with the charge, held, back in the aftermath.
    const dim = smooth(t / F.dimInS) * (1 - smooth((t - F.finalEndS) / F.dimOutS));
    if (dim > 0) {
      const o = flip();
      o.dir = X_AXIS;
      o.intensity = 0;
      o.occlude = (1 - F.dimTo) * dim;
      o.lift = 0.02;
      // The card's vignette starts at 0.6 of its radius: dimR is that.
      this.spawn("dim", v.set(this.cx, 0.01, this.cz), (F.dimR / 0.6) * 2, o);
    }
    // The ink cloud over the area's far edge, behind the bolts: faint through the charge, darker through the barrage,
    // darkest at the final strike, gone in the aftermath.
    const cloudOut = 1 - smooth((t - F.finalEndS) / 0.8);
    if (cloudOut > 0) {
      // A dark layer: little of its own light, the scene behind it covered by its shape, more and more from the charge
      // to the final strike (owner: lightning on dark ink cloud).
      const dark = t < F.chargeS ? 0.35 * charge : t < F.finalS ? 0.35 + 0.45 * ((t - F.chargeS) / (F.finalS - F.chargeS)) : 1;
      const o = flip();
      // Its own light is low (round 16: a dark sky; at 0.32 the wider cloud's glow counted as halo and thinned the
      // bolts' core-to-halo ratio) and goes out in the silent pause before the final strike.
      const gatherAt = F.finalS - F.gatherS;
      o.intensity = t >= gatherAt && t < F.finalS ? 0.6 * smooth((t - gatherAt) / F.gatherS) : t >= gatherAt - F.pauseS && t < gatherAt ? 0 : 0.12;
      if (this.frames("cloud") > 1) o.frame = (t * CLIP_FPS) % this.frames("cloud");
      o.occlude = F.cloudAlpha * dark;
      o.alpha = smooth(t / 0.2) * cloudOut;
      o.lift = 0.2;
      o.ground = -1e5;
      this.spawn("cloud", v.set(this.cx, F.cloudY, this.cz - F.areaR * F.cloudBack), (F.cloudM / F.cloudFill) * (1 + 0.02 * Math.sin(t * 2.2)), o);
    }
    const sealOut = 1 - smooth((t - F.chargeS) / 0.14);
    if (t >= 0.08 && sealOut > 0) {
      const o = flip();
      o.rot = 1.8 * t;
      o.intensity = 0.9 * sealOut;
      o.alpha = smooth((t - 0.08) / 0.12);
      o.lift = 0.6;
      H.hand(v);
      this.spawn("seal", v, 1.1 + 0.5 * charge, o);
      this.audit.seal += 1;
    }
    // The release: a thin thread of lightning from the seal at the hand to the ground under it, two frames, just
    // before the first bolt (the judges: no moment where the caster "connects").
    const threadAge = t - (F.chargeS - 3 / 60);
    if (threadAge >= 0 && threadAge < 2 / 60) {
      H.hand(v);
      const hx = v.x;
      const hz = v.z;
      const o = flip();
      o.alpha = 1;
      o.occlude = 1;
      o.lift = 0.8;
      o.ground = 0;
      if (this.frames("boltD") > 1) o.frame = 5;
      this.spawn("boltD", v.set(hx, 0.02, hz), F.threadM, o);
      this.audit.thread += 1;
    }
    // 2. The barrage: each bolt lands on the first frame at or past its time (its blows, burst, ring, crack, jolt, sound).
    while (this.next < P.at.length && t >= P.at[this.next]!) {
      this.land(this.next);
      this.next += 1;
    }
    for (let k = 0; k < this.next; k += 1) {
      const age = t - P.at[k]!;
      // The last three bolts do not restrike: the pause before the final strike stays dark.
      const light = boltLevel(age, k < P.at.length - 3);
      if (light <= 0) continue;
      const o = flip();
      o.rot = P.tilt[k]!;
      // coreSplit cards: the flash's level is the card's alpha (its light and its cover together), its halo laid over.
      o.alpha = light === AFTERIMAGE ? AFTERIMAGE / CORE_HDR : light;
      o.occlude = 1;
      o.lift = 1.5;
      o.ground = 0;
      // Its clip from a frame in its first third (each bolt its own), at CLIP_FPS for as long as it shows.
      const boltFrames = this.frames(BOLTS[P.shape[k]!]!);
      if (boltFrames > 1) o.frame = Math.min(boltFrames - 1, (((k + 1) * 2654435761) >>> 0) % Math.max(1, Math.floor(boltFrames / 3)) + age * CLIP_FPS);
      // (Tried and taken out in round 17: starting every clip at its first full frame, and fitting the bolt's height
      // to the frame; both left only thin legs in the picture and cut the coverage and the core-to-halo ratio.)
      // The main bolts (A, B) are drawn mainWide times the size about their foot: 1.3 times as wide on screen, as
      // sharp, no more light (the extra height is above the frame). A width-only stretch along the screen's x (the
      // pool's dir and span) dropped the bolt from the picture.
      this.spawn(BOLTS[P.shape[k]!]!, v.set(this.cx + P.ox[k]!, 0.04, this.cz + P.oz[k]!), F.boltM * P.scale[k]!, o);
      this.audit.flashes += 1;
    }
    // Round 36 (judges: a release mark at the caster): a thunder seal lit at the caster's hand as the formation appears.
    if (t < F.handSealS) {
      this.host.hand(v);
      const o = flip();
      o.intensity = 0.9 * (1 - t / F.handSealS);
      o.lift = 0.6;
      this.spawn("seal", v, F.handSealM, o);
      const g = flip();
      g.intensity = 0.9 * (1 - t / F.handSealS);
      g.lift = 0.7;
      this.spawn("sparkle", v, F.handSealM * 0.8, g);
    }
    // Round 36 (judges: gathering before the final strike): a ring of motes drawn in to the centre over pullS.
    if (!this.pulled && t >= F.finalS - F.pullS - F.pauseS) {
      this.pulled = true;
      const R = this.dust;
      for (let k = 0; k < F.pullMotes; k += 1) {
        const a = (k / F.pullMotes) * Math.PI * 2 + R.range(-0.08, 0.08);
        const r = F.pullR * R.range(0.9, 1.1);
        const m = particle();
        m.life = F.pullS;
        m.frame = Math.floor(R.next() * 16);
        m.vx = (-Math.cos(a) * r) / F.pullS;
        m.vz = (-Math.sin(a) * r) / F.pullS;
        m.vy = 0;
        m.tint = RISER_TINT;
        m.intensity = 0.9;
        m.fadeIn = 0.04;
        m.fadeOut = 0.06;
        m.lift = 1;
        this.spawn("motes", v.set(this.cx + Math.cos(a) * r, 0.5, this.cz + Math.sin(a) * r), R.range(1.2, 1.8), m);
      }
    }
    // 4. The final strike: Quy Nhất's gather from finalS, its pillar gatherS later; round 37's eight runs at finalS.
    const quy = this.finisher === "quyNhat";
    if (quy && !this.finalDone && t >= F.finalS) this.quyGather(t - F.finalS);
    if (!this.finalDone && t >= F.finalS + (quy ? QUY_NHAT.gatherS : 0)) this.landFinal();
    if (quy && this.finalDone) this.quyAfter(t - this.slamT);
    // The gathering before it: motes drawn up from a ring round the centre to the cloud (which brightens), no card.
    const gatherAge = t - (F.finalS - F.gatherS);
    if (gatherAge >= 0 && !this.finalDone) {
      while (this.gathered < F.gatherMotes && gatherAge >= (this.gathered * (F.gatherS - 0.1)) / F.gatherMotes) {
        const R = this.dust;
        const a = ((this.gathered % 8) * Math.PI) / 4;
        const fx = this.cx + Math.cos(a) * 3;
        const fz = this.cz + Math.sin(a) * 3;
        const life = R.range(0.22, 0.34);
        const m = particle();
        m.life = life;
        m.frame = Math.floor(R.next() * 16);
        m.vx = (this.cx - fx) / life + R.range(-1, 1);
        m.vy = F.gatherTopM / life;
        m.vz = (this.cz - fz) / life + R.range(-0.6, 0.6);
        m.rot = R.next() * Math.PI * 2;
        m.tint = RISER_TINT;
        m.intensity = 1.3;
        m.fadeIn = 0.03;
        m.fadeOut = 0.08;
        m.lift = 1;
        this.spawn("motes", v.set(fx, 0.2, fz), R.range(1.2, 2), m);
        this.gathered += 1;
      }
    }
    if (this.finalDone) {
      const age = t - F.finalS;
      // The thick bolt on the centre: whole on its first frame, cut hard.
      const light = quy ? 0 : strikeLevel(age);
      if (light > 0) {
        const o = flip();
        o.alpha = light === AFTERIMAGE ? AFTERIMAGE / CORE_HDR : light;
        o.occlude = 1;
        o.lift = 1.6;
        o.ground = 0;
        const frames = this.frames("boltCentre");
        if (frames > 1) o.frame = Math.min(frames - 1, 1 + age * CLIP_FPS);
        this.spawn("boltCentre", v.set(this.cx, 0.04, this.cz), F.boltM * F.centreScale, o);
        this.audit.strike += 1;
      }
      // The eight runs (round 27, "hướng 2": what runs flat over the ground reads from the play camera's height; upright
      // columns all along the run read as white scribbles). Each a snake of flat bolts crawling from the centre to the
      // court's edge over colS, its cracked strip laid behind its head; where its head stops, a sheaf of three columns
      // flares for colEdgeS over a flat burst and a shock ring.
      const out = 1 - gone;
      for (let c = 0; c < this.cols.length; c += 1) {
        const C = this.cols[c]!;
        for (let m = 0; m < C.members.length; m += 1) {
          const M = C.members[m]!;
          const run = t - C.start - M.delay;
          if (run < 0) continue;
          const u = Math.min(1, run / F.colS);
          const reach = C.reach * M.reachK;
          const far = reach * columnRun(u, F.colSlow);
          // Its lane: set M.off to the side of the run.
          const lx = this.cx - C.dz * M.off;
          const lz = this.cz + C.dx * M.off;
          if (m === 0) {
            if (run < F.colS) {
              // What the head passes: a small flat burst and sparks thrown back every colStepM; the beasts in its way.
              while (C.stepped * F.colStepM <= far) {
                const d = C.stepped * F.colStepM;
                this.trailStep(this.cx + C.dx * d, this.cz + C.dz * d, C.dx, C.dz);
                C.stepped += 1;
              }
              this.sweep(lx + C.dx * far, lz + C.dz * far, C.dx, C.dz);
            }
            if (run < F.colS + F.crawlTailS) this.crawl(c, lx, lz, C.dx, C.dz, far, reach, run, C.dim * (run < F.colS ? 1 : 1 - (run - F.colS) / F.crawlTailS));
            // Its strip on the ground (Codex 366): tiles M.w long laid end to end behind the head, tapering, a cap
            // where it stopped; the rock to the aftermath's end, the glow whole as the head passes, then an ember.
            if (out > 0) {
              const L = F.trailTileM;
              while (M.tiles < reach / L && (M.tiles + 1) * L + F.trailFrom <= far + 1e-6 && inCourt(lx + C.dx * ((M.tiles + 1) * L + F.trailFrom), lz + C.dz * ((M.tiles + 1) * L + F.trailFrom), F.courtMarginM)) {
                M.passed[M.tiles++] = run;
                this.audit.trail += 1;
              }
              // Round 28: on the snake's own sway (not ruled straight), each tile the chord from its start to its end on
              // that path, so tiles meet end to end round the bends.
              for (let k = 0; k < M.tiles; k += 1) {
                const d = F.trailFrom + k * L;
                const sw = runSway(d, c);
                const sw1 = runSway(d + L, c);
                dirV.set(C.dx * L - C.dz * (sw1 - sw), 0, C.dz * L + C.dx * (sw1 - sw));
                const chord = dirV.length();
                dirV.multiplyScalar(1 / chord);
                this.trailTile("trailRock", "trailGlow", lx + C.dx * d - C.dz * sw, lz + C.dz * d + C.dx * sw, chord, M.w * trailWidth(((k + 0.5) * L) / reach, c), (M.cell + k) % TRAIL_TILES, run - M.passed[k]!, out);
              }
              // Its branching cracks either side: a Lichtenberg scar flat every lichtStepM along it once its tile is laid.
              for (let j = 0; (j + 0.5) * F.lichtStepM <= M.tiles * L; j += 1) {
                const d = F.trailFrom + (j + 0.5) * F.lichtStepM;
                const sw = runSway(d, c);
                const h = hash01(c * 131 + j * 17 + 7);
                const since = run - (M.passed[Math.min(M.tiles - 1, Math.floor(((j + 0.5) * F.lichtStepM) / L))] ?? run);
                const o = flip();
                o.dir = X_AXIS;
                o.rot = h * Math.PI * 2;
                o.occlude = 1;
                o.alpha = out * Math.min(1, since / 0.08);
                o.lift = 0.28;
                const size = M.w * trailWidth(d / reach, c) * (F.lichtSize[0] + (F.lichtSize[1] - F.lichtSize[0]) * hash01(c * 59 + j * 29 + 3));
                this.spawn("lichtStrip", v.set(lx + C.dx * d - C.dz * sw, F.formY + 0.015, lz + C.dz * d + C.dx * sw), size / F.lichtFill, o);
              }
              if (run >= F.colS && M.tiles > 0) {
                const d = F.trailFrom + M.tiles * L;
                const capW = M.w * trailWidth((M.tiles * L) / reach, c);
                const sw = runSway(d, c);
                const sl = runSlope(d, c);
                dirV.set(C.dx - C.dz * sl, 0, C.dz + C.dx * sl).normalize();
                if (inCourt(lx + C.dx * (d + capW), lz + C.dz * (d + capW), F.courtMarginM)) this.trailTile("trailCap", "trailCapGlow", lx + C.dx * d - C.dz * sw, lz + C.dz * d + C.dx * sw, capW, capW, 0, run - F.colS, out);
              }
            }
          }
          // Round 31 (owner: "sao k phải là cột xuất hiện ngay từ đầu"): the sheaf stands on the strip's head from its
          // first frame, at the centre, and rides it to the edge: each column on its own lane, its foot on the head's
          // sway; its body 0.6–0.75 breathing, its core at HDR on its own 2–4-frame beats (no two sheaves on one frame).
          // At the edge it swells colEdgeGrow times over colEdgeGrowS with a flat burst and a shock ring, its core held
          // on, then fades out by colEdgeS.
          // Round 35: its swell at the edge waits its sheaf's peak lag (neighbours never flare on one frame); it stands
          // at the edge whole until then. `edge` counts from the swell.
          const lagS = F.peakLagS[c % F.peakLagS.length]!;
          const edge = run - F.colS - lagS;
          if (run >= 0 && edge < F.colEdgeS) {
            const atEdge = run >= F.colS;
            const swelling = edge >= 0;
            const d = atEdge ? reach : far;
            const sw = runSway(d, c);
            const ex = lx + C.dx * d - C.dz * sw;
            const ez = lz + C.dz * d + C.dx * sw;
            const grow = swelling ? 1 + (F.colEdgeGrow - 1) * smooth(edge / F.colEdgeGrowS) : 1;
            // Round 37: at the low views the sheaves heading toward the camera (along the view's own toward-camera
            // direction: south from behind, east from the side) shorter.
            const tc = VIEW_UNIFORMS.uViewToCam.value;
            const low = VIEW_UNIFORMS.uViewLowCol.value > 0 && C.dx * tc.x + C.dz * tc.y > 0.3 ? F.towardCamK : 1;
            // Round 32: forty columns start on one spot, so each comes up over its first colRiseM out from the centre.
            const rise = F.colRiseFloor + (1 - F.colRiseFloor) * smooth(d / F.colRiseM);
            // Round 36: at the low views a sheaf farther from the camera than the centre dimmed (none stands bright behind another).
            let rear = 1;
            if (VIEW_UNIFORMS.uViewLowCol.value > 0) {
              const cam = this.host.camera.position;
              const past = Math.hypot(ex - cam.x, ez - cam.z) - Math.hypot(this.cx - cam.x, this.cz - cam.z);
              rear = 1 - F.rearDimK * smooth(past / F.rearDimM);
            }
            const flare = (swelling && edge > F.colEdgeGrowS ? 1 - smooth((edge - F.colEdgeGrowS) / (F.colEdgeS - F.colEdgeGrowS)) : 1) * C.dim * rise * rear;
            if (swelling && !this.edgeJolted && m === 0) {
              // The eight sheaves swell within a few frames of one another: one light jolt for them all.
              this.edgeJolted = true;
              const H = this.host;
              H.strike(v.set(this.cx, 0.3, this.cz), H.reduced ? 0 : F.colEdgeJoltPx, F.colEdgeJoltS, 0, 0, 4);
            }
            // Round 35: one accent: the side columns dimmer, narrower (their own pools) and sideBackM behind the main one.
            const side = m !== 0;
            const back = side ? F.sideBackM : 0;
            const at = v.set(ex - VIEW_UNIFORMS.uViewToCam.value.x * back, 0.04, ez - VIEW_UNIFORMS.uViewToCam.value.y * back);
            const o = flip();
            const [b0, b1] = F.colBody;
            o.intensity = ((b0 + b1) / 2 + ((b1 - b0) / 2) * Math.sin((run + M.phase) * Math.PI * 2 * F.colBreathHz)) * flare * (side ? F.sideBodyK : 1);
            o.occlude = 0.6;
            o.lift = 1.5;
            o.ground = 0;
            // Round 34: its four frames in its own order, a new one every M.every frames (3 or 4), from its own lag.
            // With the video: its take's row (mirrored or not), ping-pong at COLUMN_FPS from its own phase.
            const cell = mixCell(M, run);
            o.frame = cell;
            // Round 37: the side columns in the same pool (one draw), narrower by their span (wideCard reads it).
            // The camera-ward sheaves at the low views narrower by the same towardCamK.
            if (side || low < 1) o.span = (side ? F.sideWideK : 1) * low;
            this.spawn("columnA", at, M.cardM * grow * low, o);
            // Round 32: at the edge the core whole for its first colEdgeCoreF frames, then back on its beats (forty
            // cores held on together drove V > 0.9 at the close zoom from 22.5 % to 45 %).
            if ((swelling && edge < F.colEdgeCoreF / 60) || columnFlash(c * 3 + m, run)) {
              const k = flip();
              k.intensity = F.colCoreHdr * flare * (side ? F.sideCoreK : 1);
              k.occlude = 0;
              k.lift = 1.6;
              k.ground = 0;
              k.frame = cell;
              if (side || low < 1) k.span = (side ? F.sideWideK : 1) * low;
              this.spawn("columnCoreA", at, M.cardM * grow * low, k);
            }
            this.audit.columns += 1;
            if (m === 0 && swelling) {
              // Its foot at the edge: the landings' flat burst (growing over its 4 frames, then cut) and shock ring.
              if (edge < BURST_S) {
                const s = F.colEdgeBurstM * (0.6 + 0.7 * (edge / BURST_S));
                const b = flip();
                b.dir = X_AXIS;
                b.rot = c * 0.9;
                b.span = s * 1.4;
                b.intensity = 0.7;
                b.occlude = 0.2;
                b.lift = 0.3;
                this.spawn("burst", v.set(ex, 0.09, ez), s * 0.6, b);
              }
              const ringS = F.ringFrames / 60;
              if (edge < ringS) {
                const r = flip();
                r.dir = X_AXIS;
                r.rot = c * 0.9;
                r.intensity = 1.2;
                r.lift = 0.25;
                this.spawn("ring", v.set(ex, 0.1, ez), (F.colEdgeRingM * ((edge + 1 / 60) / ringS)) / F.ringFill, r);
              }
            }
          }
        }
      }
    }
    // 3. Each landing's burst and ring (short), its crack (to the aftermath's end, cooling after the final strike).
    for (let n = 0; n < this.landings.length; n += 1) {
      const L = this.landings[n]!;
      const age = t - L.at;
      const big = L.size > 6;
      // The burst: flat on the ground at the landing, 1.4 wide by 0.6 deep, growing over its 4 frames, then cut.
      if (age < BURST_S) {
        const k = (big ? 2 : 1) * L.size * (0.6 + 0.7 * (age / BURST_S));
        const o = flip();
        o.dir = X_AXIS;
        o.rot = L.rot;
        o.span = k * 1.4;
        // The foot's glow no brighter than 0.7 (round 21: dark gaps between bolts); the bolt's core keeps its HDR.
        o.intensity = 0.7;
        o.occlude = 0.2;
        o.lift = 0.3;
        this.spawn("burst", v.set(L.x, 0.09, L.z), k * 0.6, o);
      }
      // The shock ring: flat, from nothing to ringM wide in ringFrames frames, then cut.
      const ringS = F.ringFrames / 60;
      if (age < ringS) {
        const o = flip();
        o.dir = X_AXIS;
        o.rot = L.rot;
        o.intensity = 1.2;
        o.lift = 0.25;
        this.spawn("ring", v.set(L.x, 0.1, L.z), ((big ? 2 : 1) * F.ringM * ((age + 1 / 60) / ringS)) / F.ringFill, o);
      }
      // Its scar, over the formation: hot on the landing frame, cross-fading to the cooled patch, which stays to the
      // aftermath's end and fades; past scarMax at once, the oldest go early.
      const newer = this.landings[n + F.scarMax];
      const out = (1 - gone) * (newer === undefined ? 1 : 1 - smooth((t - newer.at) / F.scarEarlyS));
      if (out > 0) {
        const level = scarLevels(age, F.scarHotS + (L.final === true ? F.scarFinalHotS : 0), F.scarCoolS);
        const size = L.scar / F.scarFill;
        // One of three looks: hot → cooled, hot → Lichtenberg, Lichtenberg → cooled.
        const coldId: ThunderLayer = L.kind === 1 ? "lichtenberg" : "scarCold";
        const hotId: ThunderLayer = L.kind === 2 ? "lichtenberg" : "scarHot";
        if (level.cold > 0) {
          const o = flip();
          o.dir = X_AXIS;
          o.rot = L.rot;
          o.occlude = 1;
          o.alpha = level.cold * out;
          o.lift = 0.3;
          this.spawn(coldId, v.set(L.x, F.formY + 0.02, L.z), size, o);
        }
        if (level.hot > 0) {
          const o = flip();
          o.dir = X_AXIS;
          o.rot = L.rot + (L.kind === 1 ? 0.8 : 0);
          o.occlude = 1;
          o.alpha = level.hot * out;
          o.lift = 0.32;
          this.spawn(hotId, v.set(L.x, F.formY + 0.025, L.z), size, o);
        }
      }
    }
    // The aftermath opens: smoke rising from a few scars, ash drifting up over the formation (once).
    if (!this.aftermath && t >= F.finalEndS) {
      this.aftermath = true;
      const R = this.dust;
      const puffs = Math.round(R.range(F.puffs[0], F.puffs[1]));
      for (let k = 0; k < puffs; k += 1) {
        const L = this.landings[Math.max(0, this.landings.length - 1 - Math.floor(R.next() * Math.min(8, this.landings.length)))]!;
        const o = particle();
        o.life = F.puffS * R.range(0.9, 1.05);
        o.vx = R.range(-0.2, 0.2);
        o.vy = R.range(0.45, 0.7);
        o.vz = R.range(-0.2, 0.2);
        o.grow = 1;
        // Round 30: thin and dark (it darkens, barely lights), at most 0.35.
        o.intensity = 0.05;
        o.occlude = 0.6;
        o.alpha = 0.35;
        o.fadeIn = 0.25;
        o.fadeOut = 0.9;
        o.delay = R.range(0, 0.3);
        o.lift = 0.5;
        this.spawn("smoke", v.set(L.x + R.range(-0.6, 0.6), 0.6, L.z + R.range(-0.6, 0.6)), R.range(3, 4.5), o);
      }
      for (let k = 0; k < F.ashFall; k += 1) {
        const a = R.next() * Math.PI * 2;
        const d = Math.sqrt(R.next()) * F.areaR * 1.1;
        const o = particle();
        o.life = R.range(1.5, 2);
        o.frame = Math.floor(R.next() * 16);
        o.vx = R.range(-0.4, 0.4);
        o.vy = R.range(0.6, 1.2);
        o.vz = R.range(-0.4, 0.4);
        o.gravity = 0.2;
        o.drag = 0.6;
        o.rot = R.next() * Math.PI * 2;
        o.spin = R.range(-1.2, 1.2);
        o.tint = ASH_TINT;
        o.intensity = 1;
        o.fadeIn = 0.15;
        o.fadeOut = 0.7;
        o.delay = R.range(0, 0.4);
        o.lift = 0.5;
        this.spawn("embers", v.set(this.cx + Math.cos(a) * d, R.range(0.2, 1), this.cz + Math.sin(a) * d), R.range(0.8, 1.4), o);
      }
      this.audit.puffs += puffs;
    }
    // 5. The aftermath: arcs skipping over the cracks.
    while (this.nextArc < P.arcAt.length && t >= P.arcAt[this.nextArc]!) {
      this.nextArc += 1;
      this.audit.arcs += 1;
      if (this.last !== null) this.last.arcs += 1;
    }
    for (let k = 0; k < this.nextArc; k += 1) {
      const age = t - P.arcAt[k]!;
      if (age >= P.arcS[k]!) continue;
      const L = this.landings[Math.min(this.landings.length - 1, P.arcOn[k]!)];
      if (L === undefined) continue;
      const o = flip();
      o.dir = X_AXIS;
      o.rot = P.arcRot[k]!;
      o.intensity = 0.85 * (age < dt ? 1 : 0.7);
      if (this.frames("arcs") > 1) o.frame = ((k * 13) % this.frames("arcs")) + age * CLIP_FPS;
      o.lift = 0.3;
      this.spawn("arcs", v.set(L.x, 0.08, L.z), L.size * 0.5, o);
    }
  }

  /** A bolt's light at `age`: its first flash whole on its first frame, then each restrike dimmer; 0 between and after. */
  private flashLight(flashS: readonly number[], age: number, k: readonly number[] = FIVE_THUNDER.restrikeK): number {
    let start = 0;
    for (let j = 0; j < flashS.length; j += 1) {
      const len = flashS[j]!;
      if (age >= start && age < start + len) {
        const peak = j === 0 ? 1 : k[Math.min(j - 1, k.length - 1)]!;
        // Cut, not faded: it holds near its peak and drops a little toward its end.
        return peak * (1 - 0.3 * (age - start) / len);
      }
      start += len + this.gap(j);
    }
    return 0;
  }

  /** The dark between a flash and its restrike, from the seed (the same each frame). */
  private gap(j: number): number {
    const g = FIVE_THUNDER.restrikeGapS;
    return g[0] + (g[1] - g[0]) * (((j + 1) * 0.618 + this.seed * 0.0001) % 1);
  }

  /** Single bolt `k` lands. */
  private land(k: number): void {
    const F = FIVE_THUNDER;
    const P = this.plan!;
    const s = P.scale[k]!;
    const u = (s - F.scaleMin) / (F.scaleMax - F.scaleMin);
    const x = this.cx + P.ox[k]!;
    const z = this.cz + P.oz[k]!;
    this.audit.bolts += 1;
    this.last?.bolts.push({ at: this.t, x, z, scale: s, shape: P.shape[k]! });
    this.last?.firstK.push(1);
    this.landings.push({ x, z, size: 5.5 * s, scar: 3.5 * this.dust.range(0.8, 1.3), kind: Math.floor(this.dust.next() * 3), rot: this.rand.next() * Math.PI * 2, at: this.t });
    this.audit.bursts += 1;
    this.audit.rings += 1;
    this.audit.cracks += 1;
    this.blows(x, z, F.hitR * s, F.power[0] + (F.power[1] - F.power[0]) * u, "primary");
    this.sparks(x, z, s);
    this.chips(x, z, s);
    const H = this.host;
    const r = H.reduced;
    H.strike(v.set(x, 0.3, z), r ? 0 : F.joltPx[0] + (F.joltPx[1] - F.joltPx[0]) * u, F.joltS, 0, r ? 0 : F.flash[0] + (F.flash[1] - F.flash[0]) * u, F.light[0] + (F.light[1] - F.light[0]) * u);
    // Bigger bolts crack lower; a little random lean on top.
    H.sound(1.18 - 0.3 * u + this.rand.range(-0.04, 0.04), 0.75 + 0.25 * u);
  }

  /** A landing's sparks: streaks thrown up in a cone from the point, falling back, warm ivory. */
  private sparks(x: number, z: number, scale: number): void {
    const F = FIVE_THUNDER;
    const R = this.dust;
    const n = Math.round(R.range(F.sparks[0], F.sparks[1]));
    for (let k = 0; k < n; k += 1) {
      const a = R.next() * Math.PI * 2;
      // Thrown out along the ground more than up (round 21).
      const up = R.range(0.15, 0.7);
      const speed = R.range(8, 14) * scale;
      const o = particle();
      o.vx = Math.cos(a) * Math.cos(up) * speed;
      o.vy = Math.sin(up) * speed;
      o.vz = Math.sin(a) * Math.cos(up) * speed;
      o.dir = flyDir.set(o.vx, o.vy, o.vz).normalize();
      o.gravity = -22;
      o.drag = 1.2;
      o.life = R.range(0.25, 0.4);
      o.frame = Math.floor(R.next() * 16);
      o.tint = SPARK_TINT;
      o.intensity = 1.6;
      o.fadeOut = 0.12;
      o.lift = 1;
      this.spawn("sparks", v.set(x, 0.3, z), R.range(2.2, 3.8) * scale, o);
      this.audit.sparks += 1;
    }
  }

  /** A column passes (x, z) running along (dx, dz): a small flat burst there, sparks thrown out to both sides. */
  private trailStep(x: number, z: number, dx: number, dz: number): void {
    const R = this.dust;
    const F = FIVE_THUNDER;
    // Round 30: a hard ivory core flash for 2 frames (its flat burst, wide and grey, read as a puff of cotton), and a
    // spray of small sparks thrown low.
    const b = particle();
    b.life = F.stepFlashF / 60;
    b.dir = flyDir.set(dx, 0, dz);
    b.span = F.stepFlashM[0];
    b.tint = POOL_TINT;
    b.intensity = F.stepFlashK;
    b.occlude = 0;
    b.lift = 0.35;
    this.spawn("glowPool", v.set(x, FIVE_THUNDER.formY + 0.03, z), F.stepFlashM[1], b);
    for (let k = 0; k < F.stepSparks; k += 1) {
      const side = k % 2 === 0 ? 1 : -1;
      const speed = R.range(4, 7);
      const o = particle();
      // Thrown back against the run, a little to each side.
      o.vx = -dx * speed - dz * side * speed * 0.35;
      o.vy = R.range(0.6, 1.6);
      o.vz = -dz * speed + dx * side * speed * 0.35;
      o.dir = flyDir.set(o.vx, o.vy, o.vz).normalize();
      o.gravity = -18;
      o.drag = 1.2;
      o.life = R.range(0.2, 0.32);
      o.frame = Math.floor(R.next() * 16);
      o.tint = SPARK_TINT;
      o.intensity = 1.3;
      o.fadeOut = 0.1;
      o.lift = 1;
      this.spawn("sparks", v.set(x, 0.2, z), R.range(1.1, 1.8), o);
    }
  }

  /** A column's head at (x, z): the beasts it reaches are struck once and thrown along its run. */
  private sweep(x: number, z: number, dx: number, dz: number): void {
    const F = FIVE_THUNDER;
    const H = this.host;
    const n = H.inCircle(x, z, F.colHitM, near);
    for (let j = 0; j < n; j += 1) {
      const i = near[j]!;
      if (this.swept.has(i)) continue;
      this.swept.add(i);
      const bx = H.x(i);
      const bz = H.z(i);
      this.audit.blows += 1;
      if (this.last !== null) this.last.struck += 1;
      const killed = H.blow(i, dx, dz, 0.6, "secondary");
      H.shove(i, dx, dz, F.colShoveM);
      if (killed) {
        if (this.last !== null) this.last.killed += 1;
        this.death(bx, bz, H.size(i));
      } else H.status(i, F.shockedS);
    }
  }

  /** A landing's rock chips (thrown low, falling) and its thin smoke (rising, thinning). */
  private chips(x: number, z: number, scale: number): void {
    const F = FIVE_THUNDER;
    const R = this.dust;
    const n = Math.round(R.range(F.chips[0], F.chips[1]));
    for (let k = 0; k < n; k += 1) {
      const a = R.next() * Math.PI * 2;
      const out = R.range(2, 4.5) * scale;
      const o = particle();
      o.life = R.range(0.45, 0.7);
      o.frame = Math.floor(R.next() * 16);
      o.vx = Math.cos(a) * out;
      o.vy = R.range(3, 5.5) * scale;
      o.vz = Math.sin(a) * out;
      o.gravity = -16;
      o.rot = R.next() * Math.PI * 2;
      o.spin = R.range(-6, 6);
      o.tint = CHIP_TINT;
      o.intensity = 1;
      o.occlude = 0.8;
      o.fadeOut = 0.15;
      o.lift = 0.6;
      this.spawn("embers", v.set(x, 0.15, z), R.range(0.7, 1.2) * scale, o);
      // Its small shadow sliding on the ground under it.
      const life = o.life!;
      const vx = o.vx!;
      const vz = o.vz!;
      const sh = particle();
      sh.life = life;
      sh.vx = vx;
      sh.vz = vz;
      sh.intensity = 0;
      sh.occlude = 0.4;
      sh.fadeOut = 0.15;
      sh.lift = 0.05;
      this.spawn("dim", v.set(x, 0.03, z), 0.7 * scale, sh);
    }
    for (let k = 0; k < 2; k += 1) {
      const o = particle();
      o.life = R.range(0.8, 1.1);
      o.vx = R.range(-0.3, 0.3);
      o.vy = R.range(0.6, 1);
      o.vz = R.range(-0.3, 0.3);
      o.grow = 0.7;
      o.intensity = 0.3;
      o.occlude = 0.55;
      o.alpha = 0.55;
      o.fadeIn = 0.08;
      o.fadeOut = 0.6;
      o.lift = 0.5;
      this.spawn("smoke", v.set(x + R.range(-0.5, 0.5), 0.5, z + R.range(-0.5, 0.5)), R.range(2.2, 3.2) * scale, o);
    }
  }

  /** A beast killed by lightning at (x, z), `r` m round: arcs burst round its body, ash and dust rise, arcs skip on where it fell. */
  private death(x: number, z: number, r: number): void {
    const F = FIVE_THUNDER;
    const R = this.dust;
    const body = Math.max(0.35, r);
    this.audit.deaths += 1;
    let o = particle();
    o.life = 8 / 60;
    o.rate = 1;
    o.frame = Math.floor(R.next() * 40);
    o.rot = R.next() * Math.PI * 2;
    o.tint = SPARKLE_TINT;
    o.intensity = 1.4;
    o.fadeOut = 0.05;
    o.lift = 0.8;
    this.spawn("sparkle", v.set(x, body * 1.1, z), body * 5.5, o);
    // Arcs bursting round the body on the same 8 frames (two cards crossed).
    for (let k = 0; k < 2; k += 1) {
      o = particle();
      o.life = 8 / 60;
      o.rate = 1;
      o.frame = Math.floor(R.next() * 48);
      o.rot = R.next() * Math.PI + k * 1.3;
      o.grow = 0.35;
      o.intensity = 1;
      o.fadeOut = 0.06;
      o.lift = 0.7;
      this.spawn("corpseArc", v.set(x, body * 1.1, z), body * 3.6, o);
    }
    const ashes = Math.round(R.range(F.ashes[0], F.ashes[1]));
    for (let k = 0; k < ashes; k += 1) {
      o = particle();
      o.life = R.range(0.7, 1.1);
      o.frame = Math.floor(R.next() * 16);
      o.vx = R.range(-0.8, 0.8);
      o.vy = R.range(1.2, 2.4);
      o.vz = R.range(-0.8, 0.8);
      o.gravity = 0.6;
      o.drag = 1;
      o.rot = R.next() * Math.PI * 2;
      o.spin = R.range(-1.5, 1.5);
      o.tint = ASH_TINT;
      o.intensity = 1.1;
      o.fadeIn = 0.05;
      o.fadeOut = 0.4;
      o.delay = R.range(0, 0.12);
      o.lift = 0.5;
      this.spawn("embers", v.set(x + R.range(-body, body) * 0.6, body * R.range(0.4, 1.4), z + R.range(-body, body) * 0.6), R.range(0.9, 1.6) * (0.7 + body * 0.6), o);
    }
    const dusts = Math.round(R.range(F.dusts[0], F.dusts[1]));
    for (let k = 0; k < dusts; k += 1) {
      o = particle();
      o.life = R.range(0.6, 0.9);
      o.frame = Math.floor(R.next() * 16);
      o.vx = R.range(-0.5, 0.5);
      o.vy = R.range(0.6, 1.2);
      o.vz = R.range(-0.5, 0.5);
      o.rot = R.next() * Math.PI * 2;
      o.tint = SPARK_TINT;
      o.intensity = 1.3;
      o.fadeIn = 0.04;
      o.fadeOut = 0.3;
      o.delay = R.range(0, 0.1);
      o.lift = 0.6;
      this.spawn("motes", v.set(x + R.range(-body, body) * 0.5, body * R.range(0.5, 1.5), z + R.range(-body, body) * 0.5), R.range(1.6, 2.4) * (0.7 + body * 0.5), o);
    }
    const arcs = Math.round(R.range(F.corpseArcs[0], F.corpseArcs[1]));
    for (let k = 0; k < arcs; k += 1) {
      o = particle();
      o.life = R.range(3, 5) / 60;
      o.rate = 1;
      o.frame = Math.floor(R.next() * 48);
      o.delay = 0.1 + ((k + R.next() * 0.6) / arcs) * (F.corpseArcS - 0.15);
      o.rot = R.next() * Math.PI * 2;
      o.intensity = 0.9;
      o.lift = 0.4;
      this.spawn("corpseArc", v.set(x + R.range(-0.3, 0.3), body * 0.5, z + R.range(-0.3, 0.3)), body * R.range(2.4, 3.4), o);
    }
  }

  /** The final five-bolt strike lands in the middle. */
  private landFinal(): void {
    const F = FIVE_THUNDER;
    this.finalDone = true;
    if (this.last !== null) this.last.finalAt = this.t;
    // The centre: the biggest burst, ring and scar; then the eight columns (set here: directions, shapes, timing).
    this.landings.push({ x: this.cx, z: this.cz, size: 9, scar: 6, final: true, kind: 0, rot: this.rand.next() * Math.PI * 2, at: this.t });
    this.chips(this.cx, this.cz, 1.6);
    this.sparks(this.cx, this.cz, 1.5);
    this.audit.bursts += 1;
    this.audit.rings += 1;
    this.audit.cracks += 1;
    if (this.finisher === "quyNhat") {
      this.landQuy();
      return;
    }
    this.blows(this.cx, this.cz, F.areaR * 1.1, 1, "finisher");
    const R = this.dust;
    this.cols.length = 0;
    this.swept.clear();
    // The caster's place: a column heading at it stops casterGapM short (round 23: the south trail ran to its feet).
    this.host.hand(v);
    const kx = v.x - this.cx;
    const kz = v.z - this.cz;
    let prev = -1;
    const kindAt = Math.floor(R.next() * 3);
    for (let c = 0; c < 8; c += 1) {
      const a = (c * Math.PI) / 4;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      // One of the three columns, the next one round always another (eight round a ring: 0,1,2,… never meets itself).
      const shape = (c + kindAt) % 3;
      prev = shape;
      // Round 31 addendum (owner: "8 cột nhưng chỉ thấy 4 hướng"): no run is dimmed or cut short for facing the camera;
      // only one heading at the caster stops casterGapM short of it (guardM).
      const near = false;
      const off = R.range(F.sheafOffM[0], F.sheafOffM[1]);
      const cellAt = Math.floor(R.next() * TRAIL_TILES);
      // Round 32: the columns level with one another (no delay, the same reach). Round 34: one main column, the two
      // beside it the same picture mirrored and sheafSideK as tall; each runs through the four frames in its own order.
      const member = (side: number, kind: number): Member => ({
        off: side * off,
        delay: 0,
        reachK: 1,
        kind,
        flip: R.next() < 0.5 ? 0 : 1,
        phase: R.next() * 2,
        seq: shuffle4(R),
        every: R.next() < 0.5 ? 3 : 4,
        lag: Math.floor(R.next() * 12),
        cardM: ((side === 0 ? F.sheafMidM : F.sheafMidM * F.sheafSideK) * R.range(F.colHeightK[0], F.colHeightK[1])) / COLUMN_FILL,
        // Round 36: each direction's strip its own width.
        w: (side === 0 ? F.sheafMidW : F.sheafSideW) * (F.stripWideK[0] + (F.stripWideK[1] - F.stripWideK[0]) * hash01(c * 37 + 11)),
        // Three sheaf members on three different stretches of the strip (round 26: not the same UV side by side).
        cell: (cellAt + (side + 1) * 3) % TRAIL_TILES,
        tiles: 0,
        passed: [],
      });
      // The three kinds in every sheaf: the centre one, then the two others at its sides.
      // Round 32: the eight sheaves start on one frame (each reaches its edge after the same colS, the short ones slower).
      this.cols.push({ dx, dz, start: this.t + 1 / 60, reach: this.guardM(this.edgeM(dx, dz) * (near ? F.colNearK : 1), dx, dz, kx, kz), dim: near ? F.colNearDim : 1, stepped: 1, members: [member(0, MAIN_KINDS[c]!), member(1, (MAIN_KINDS[c]! + 2) % 4), member(-1, (MAIN_KINDS[c]! + 2) % 4)] });
    }
    // Each run's length on screen; a run under colShortRatio of the longest (the court's north edge is near the centre)
    // gets a colShortK bigger sheaf instead of a run past the court (its head already takes the whole colS to its stop).
    const px = this.cols.map((C) => this.screenPx(C.dx, C.dz, C.reach));
    const longest = Math.max(...px);
    const big = px.map((p) => p < F.colShortRatio * longest);
    for (let c = 0; c < this.cols.length; c += 1) if (big[c]) for (const M of this.cols[c]!.members) M.cardM *= F.colShortK;
    if (this.last !== null) {
      this.last.runPx = px.map((p) => Math.round(p));
      this.last.runBig = big;
      this.last.runMark = this.cols.map((C) => {
        edgeV.set(this.cx + C.dx * C.reach * 0.75, 0, this.cz + C.dz * C.reach * 0.75).project(this.host.camera);
        return [Math.round((edgeV.x * 0.5 + 0.5) * 1280), Math.round((-edgeV.y * 0.5 + 0.5) * 720)];
      });
    }
    const H = this.host;
    const r = H.reduced;
    H.strike(v.set(this.cx, 0.3, this.cz), r ? 0 : F.finalJoltPx, F.finalJoltS, r ? 0 : F.finalStopMs, r ? 0 : F.finalFlash, 14);
    H.sound(0.8, 1);
    H.sound(0.86, 0.8);
  }

  /** Every live beast within `r` of (x, z) struck away from it. */
  private blows(x: number, z: number, r: number, power: number, role: ImpactRole): void {
    const H = this.host;
    const n = H.inCircle(x, z, r, near);
    for (let j = 0; j < n; j += 1) {
      const i = near[j]!;
      let dx = H.x(i) - x;
      let dz = H.z(i) - z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) {
        dx = 0;
        dz = -1;
      } else {
        dx /= len;
        dz /= len;
      }
      this.audit.blows += 1;
      if (this.last !== null) this.last.struck += 1;
      const bx = H.x(i);
      const bz = H.z(i);
      const killed = H.blow(i, dx, dz, power, role);
      // Thrown away from the formation's centre.
      let ax = bx - this.cx;
      let az = bz - this.cz;
      const al = Math.hypot(ax, az);
      if (al < 1e-3) { ax = dx; az = dz; } else { ax /= al; az /= al; }
      H.shove(i, ax, az, this.dust.range(FIVE_THUNDER.shoveM[0], FIVE_THUNDER.shoveM[1]));
      if (killed) {
        if (this.last !== null) this.last.killed += 1;
        this.death(bx, bz, H.size(i));
      }
      else if (!killed) H.status(i, FIVE_THUNDER.shockedS);
    }
  }

  private spawn(id: ThunderLayer, at: THREE.Vector3, size: number, o: FlipOptions): void {
    if (!this.attached.has(id)) return;
    const pool = this.pools.get(id)!;
    // A camera-facing card is sized by its height; a flat one by its height across the ground too (the still's cell).
    // An upright card drawn the view's uprightK bigger (camera-modes.ts; 1 at the top view).
    const up = THUNDER_SOURCES[id].flat ? 1 : this.uprightK;
    // Round 36 (judges: one light hierarchy): only the centre bolt and the main columns' cores go past 0.9.
    if (id !== "boltCentre" && id !== "columnCoreA" && !BOLTS.includes(id) && (o.intensity ?? 1) > LIGHT_CAP) o.intensity = LIGHT_CAP;
    pool.spawn(at, size * up * (this.scales.get(id) ?? 1), o);
  }

  /** How far (m) from the centre along (dx, dz) the ground stays inside the camera's frame (at most colReachM). */
  private edgeM(dx: number, dz: number): number {
    const F = FIVE_THUNDER;
    const cam = this.host.camera;
    cam.updateMatrixWorld();
    let inside = 0;
    for (let d = 0.5; d <= F.colReachM; d += 0.5) {
      edgeV.set(this.cx + dx * d, 0, this.cz + dz * d).project(cam);
      if (Math.abs(edgeV.x) > 0.98 || Math.abs(edgeV.y) > 0.98 || edgeV.z > 1) break;
      if (!inCourt(this.cx + dx * d, this.cz + dz * d, F.courtMarginM)) break;
      inside = d;
    }
    return Math.max(4, inside);
  }

  /** `reach` along (dx, dz), cut casterGapM short of the caster at (kx, kz) from the centre when the run passes near it. */
  private guardM(reach: number, dx: number, dz: number, kx: number, kz: number): number {
    const F = FIVE_THUNDER;
    const along = kx * dx + kz * dz;
    const across = Math.abs(kx * dz - kz * dx);
    if (along <= 0 || across > F.casterGapM) return reach;
    return Math.max(4, Math.min(reach, along - F.casterGapM));
  }

  /** A run's length on screen (px at 1280 × 720) from the centre `reach` m along (dx, dz). */
  private screenPx(dx: number, dz: number, reach: number): number {
    const cam = this.host.camera;
    cam.updateMatrixWorld();
    edgeV.set(this.cx, 0, this.cz).project(cam);
    const x0 = edgeV.x;
    const y0 = edgeV.y;
    edgeV.set(this.cx + dx * reach, 0, this.cz + dz * reach).project(cam);
    return Math.hypot((edgeV.x - x0) * 640, (edgeV.y - y0) * 360);
  }

  /** The sideways part (−1 … 1) of a run along (dx, dz) as the camera sees it. */
  private screenSide(dx: number, dz: number): number {
    const cam = this.host.camera;
    cam.updateMatrixWorld();
    edgeV.set(this.cx, 0, this.cz).project(cam);
    const x0 = edgeV.x;
    const y0 = edgeV.y;
    edgeV.set(this.cx + dx, 0, this.cz + dz).project(cam);
    const sx = edgeV.x - x0;
    const sy = edgeV.y - y0;
    const l = Math.hypot(sx, sy);
    return l < 1e-6 ? 0 : sx / l;
  }

  /**
   * Run `c`'s snake (rounds 27–28): crawlCards flat bolts from its head (`far` m out along (dx, dz) from its lane's start
   * (lx, lz), of a run `reach` m long) back toward the centre, on the run's own sway (runSway), each turned along its
   * bend, in two layers crawlLayerM apart across it (the core at crawlK, the branches at crawlBranch, other bolts and
   * frames); a new bolt and frame every crawlEveryF frames; the head the brightest (its core at the bolts' HDR), a point
   * of the body falling to crawlBody of it over crawlBodyS after the head passed it. Under the head a soft warm pool
   * of light on the ground, crawlPoolM long by half as wide, its wake fading over crawlPoolS behind it.
   */
  private crawl(c: number, lx: number, lz: number, dx: number, dz: number, far: number, reach: number, run: number, light: number): void {
    const F = FIVE_THUNDER;
    if (light <= 0) return;
    const beat = Math.floor((run * 60) / F.crawlEveryF);
    const speed = Math.max(1, reach / F.colS);
    // Round 28 (owner, 23:1x: "toả ra dày và to"): three layers, the core in the middle, the branches either side,
    // crawlBranchK as big, so the strip spreads ≈ 5.5 m.
    for (let layer = 0; layer < 3; layer += 1) {
      const side = layer === 0 ? 0 : layer === 1 ? -F.crawlLayerM : F.crawlLayerM;
      const big = layer === 0 ? 1 : F.crawlBranchK;
      for (let k = 0; k < F.crawlCards; k += 1) {
        const d = far - k * F.crawlStepM - layer * F.crawlStepM * 0.4;
        if (d < F.trailFrom) break;
        const sway = runSway(d, c) + side;
        const slope = runSlope(d, c);
        const x = lx + dx * d - dz * sway;
        const z = lz + dz * d + dx * sway;
        if (!inCourt(x, z, F.courtMarginM)) continue;
        crawlV.set(dx - dz * slope, 0, dz + dx * slope).normalize();
        const id = CRAWLS[(c + k + beat + layer * 2) % CRAWLS.length]!;
        const o = flip();
        o.dir = crawlV;
        // Turned a quarter: the bolt's length (its card's height) along the run, its foot ahead, its tail behind.
        o.rot = Math.PI / 2;
        o.span = F.crawlW * big;
        const frames = this.frames(id);
        if (frames > 1) o.frame = (beat + k * 3 + layer * 5) % frames;
        o.intensity = (layer === 0 ? F.crawlK : F.crawlBranch) * light * (1 - (1 - F.crawlBody) * smooth((k * F.crawlStepM) / speed / F.crawlBodyS)) * (VIEW_UNIFORMS.uViewLowCol.value > 0 ? F.lowCrawlK : 1);
        o.occlude = 0;
        o.lift = 0.4;
        this.spawn(id, v.set(x, F.formY + 0.03, z), F.crawlM * big, o);
        this.audit.crawl += 1;
      }
    }
    // Round 30: no standing pool of light under the head (it read as grey cotton); trailStep's 2-frame core flash
    // and low sparks take its place.
  }

  /** One tile of a strip at (x, z), `w` m wide and long (the run's direction in dirV): the rock (cell `cell`) and its
   * glow, `since` s after the foot passed it, `out` its fade at the end. */
  private trailTile(rock: ThunderLayer, glow: ThunderLayer, x: number, z: number, len: number, w: number, cell: number, since: number, out: number): void {
    const F = FIVE_THUNDER;
    // Tiles (not the cap) reach TILE_ENDS of their length past both ends, over their faded ends.
    const over = rock === "trailRock" ? len * TILE_ENDS : 0;
    x -= dirV.x * over;
    z -= dirV.z * over;
    len += 2 * over;
    let o = flip();
    o.dir = dirV;
    o.span = len;
    o.frame = cell;
    o.occlude = 1;
    // Darker than the court and partly see-through, so it reads as cracked ground, not a laid band of stone.
    o.tint = TRAIL_ROCK_TINT;
    o.alpha = out * F.trailRockA;
    o.lift = 0.3;
    this.spawn(rock, v.set(x, F.formY + 0.02, z), w, o);
    const lit = F.trailEmber + (1 - F.trailEmber) * (1 - smooth(since / F.trailGlowS));
    o = flip();
    o.dir = dirV;
    o.span = len;
    o.frame = cell;
    o.tint = TRAIL_GLOW_TINT;
    o.intensity = lit * F.trailGlowK;
    o.alpha = out;
    o.occlude = 0;
    o.lift = 0.32;
    this.spawn(glow, v.set(x, F.formY + 0.025, z), w, o);
  }

  /** A layer's frames (1: a still). */
  private frames(id: ThunderLayer): number {
    return this.pools.get(id)!.meta?.frames ?? 1;
  }

  /** Shown cards (stats). */
  get live(): number {
    let n = 0;
    for (const p of this.pools.values()) n += p.live;
    return n;
  }

  /** Quy Nhất's gather, `g` s into it: five element bolts strike the ring, then are pulled to the centre. */
  private quyGather(g: number): void {
    const Q = QUY_NHAT;
    const F = FIVE_THUNDER;
    const R = F.formR * Q.boltRingK;
    for (let k = 0; k < 5; k += 1) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = this.cx + ca * R;
      const z = this.cz + sa * R;
      const age = g - k * Q.boltGapS;
      if (age < 0) continue;
      const tint = ELEMENT_TINTS[k]!;
      if (this.gatherLanded <= k) {
        // Its strike on the ring: a crack of thunder, sparks, a beast under it shocked.
        this.gatherLanded = k + 1;
        if (this.last !== null) this.last.gatherBolts = this.gatherLanded;
        this.host.sound(1.45 + k * 0.04, 0.3);
        this.sparks(x, z, 0.6);
        this.blows(x, z, 1.6, 0.3, "secondary");
      }
      if (age < Q.boltFlashS) {
        const id = BOLTS[1 + (k % 3)]!;
        const o = flip();
        o.intensity = Q.boltLight * (age < 0.05 ? 1 : 0.55);
        o.tint = tint;
        o.occlude = 0.5;
        o.lift = 1;
        o.ground = 0;
        const frames = this.frames(id);
        if (frames > 1) o.frame = Math.min(frames - 1, 2 + age * CLIP_FPS);
        this.spawn(id, v.set(x, 0.04, z), Q.boltM, o);
        this.audit.bolts += 1;
      }
      // Pulled along the ground to the centre: a stretch of energy ribbon whose head races from the ring to the middle
      // by gatherS (eased in), its tail pullLenM behind; a core and a wider glow, tiled with their own frames.
      const u = (g - Q.pullFromS) / (Q.gatherS - Q.pullFromS);
      if (u < 0 || u > 1) continue;
      const head = R * (1 - u * u);
      const tail = Math.min(R, head + Q.pullLenM);
      const frames = this.frames("ribbon");
      dirV.set(-ca, 0, -sa);
      for (let layer = 0; layer < 2; layer += 1) {
        for (let d = tail; d > head + 0.05; d -= Q.pullTileM) {
          const len = Math.min(Q.pullTileM, d - head);
          const o = flip();
          o.dir = dirV;
          o.span = len;
          if (frames > 1) o.frame = (Math.floor(g * 24) + k * 7 + Math.round(d) * 3 + layer * 11) % frames;
          o.intensity = Q.pullLight * (layer === 0 ? 1 : Q.pullGlowK);
          o.tint = tint;
          o.occlude = 0;
          o.lift = 0.4;
          this.spawn("ribbon", v.set(this.cx + ca * d, F.formY + 0.04, this.cz + sa * d), layer === 0 ? Q.pullW : Q.pullGlowW, o);
          this.audit.crawl += 1;
        }
      }
    }
  }

  /** Quy Nhất's slam: key 8's pillar on the centre, the heavy blow, the flash, the stop, the kick; the chain's plan. */
  private landQuy(): void {
    const Q = QUY_NHAT;
    const H = this.host;
    this.slamT = this.t;
    if (this.last !== null) this.last.slamAt = this.t;
    H.pillar?.(v.set(this.cx, 0, this.cz), Q.pillarScale, Q.pillarLifeS);
    this.blows(this.cx, this.cz, Q.slamR, Q.slamPower, "finisher");
    const r = H.reduced;
    H.strike(v.set(this.cx, 0.3, this.cz), r ? 0 : Q.slamJoltPx, Q.slamJoltS, r ? 0 : Q.slamStopMs, r ? 0 : Q.slamFlash, Q.slamLight);
    H.sound(0.78, 1.1);
    H.sound(0.9, 0.6);
    // The chain: every live beast within chainR, nearest first, each fed from the nearest one already reached.
    const n = Math.min(H.inCircle(this.cx, this.cz, Q.chainR, near), Q.chainMax);
    const xs: number[] = [];
    const zs: number[] = [];
    for (let j = 0; j < n; j += 1) { xs.push(H.x(near[j]!)); zs.push(H.z(near[j]!)); }
    const { order, from } = chainOrder(this.cx, this.cz, xs, zs);
    this.chainN = n;
    for (let k = 0; k < n; k += 1) {
      const j = order[k]!;
      const f = from[k]!;
      this.chainI[k] = near[j]!;
      this.chainFrom[k] = f < 0 ? -1 : order.indexOf(f);
      this.chainFromX[k] = f < 0 ? this.cx : xs[f]!;
      this.chainFromZ[k] = f < 0 ? this.cz : zs[f]!;
      this.chainAt[k] = Q.chainDelayS + Math.hypot(xs[j]! - this.cx, zs[j]! - this.cz) / Q.chainV;
      this.chainHits[k] = 0;
    }
    if (this.last !== null) { this.last.chainHops = n; this.last.chainBlows = 0; }
    this.nextCrackle = Q.chainDelayS;
  }

  /** Quy Nhất's aftermath, `a` s after the slam: the shock ring over the field, the chain's hops, shocks and ticks. */
  private quyAfter(a: number): void {
    const Q = QUY_NHAT;
    const F = FIVE_THUNDER;
    const H = this.host;
    // The ring burst (its own spokes and rim), growing over the field, pale.
    if (a < Q.burstS) {
      const u = a / Q.burstS;
      const o = flip();
      const frames = this.frames("ringBurst");
      if (frames > 1) o.frame = Math.min(frames - 1, 4 + a * 24);
      o.intensity = Q.burstLight * (1 - u * u);
      o.tint = CHAIN_TINT;
      o.occlude = 0;
      o.lift = 0.3;
      this.spawn("ringBurst", v.set(this.cx, F.formY + 0.06, this.cz), Q.burstFromM + (Q.burstToM - Q.burstFromM) * (1 - (1 - u) * (1 - u)), o);
      this.audit.rings += 1;
    }
    // A dense band of energy ribbon round the growing circle: ringLayers rows across it and a wide glow under them,
    // ringSegs chords each, every chord its own frame.
    if (a < Q.ringS) {
      const u = a / Q.ringS;
      const r0 = 3 + (Q.ringToM / 2 - 3) * (1 - (1 - u) * (1 - u));
      const fade = 1 - u * u;
      const frames = this.frames("ribbon");
      const step = (Math.PI * 2) / Q.ringSegs;
      for (let layer = -1; layer < Q.ringLayers; layer += 1) {
        // layer −1: the glow; 0…: the rows, centred on r0.
        const glow = layer < 0;
        const r = glow ? r0 : r0 + (layer - (Q.ringLayers - 1) / 2) * Q.ringLayerM;
        const chord = 2 * r * Math.sin(step / 2) * 1.1;
        for (let k = 0; k < Q.ringSegs; k += 1) {
          const th = k * step + (glow ? 0 : layer * 0.07);
          dirV.set(-Math.sin(th + step / 2), 0, Math.cos(th + step / 2));
          const o = flip();
          o.dir = dirV;
          o.span = chord;
          if (frames > 1) o.frame = (k * 5 + layer * 13 + Math.floor(a * 24)) % frames;
          o.intensity = Q.ringLight * fade * (glow ? Q.ringGlowK : 1);
          o.tint = CHAIN_TINT;
          o.occlude = 0;
          o.lift = 0.35;
          this.spawn("ribbon", v.set(this.cx + Math.cos(th) * r, F.formY + 0.05, this.cz + Math.sin(th) * r), glow ? Q.ringGlowW : Q.ringW, o);
        }
      }
    }
    let flying = false;
    let budget = Q.blowsPerFrame;
    for (let k = 0; k < this.chainN; k += 1) {
      const age = a - this.chainAt[k]!;
      if (age < 0) break;
      const i = this.chainI[k]!;
      // Its hop: a thin flat bolt from its source to the beast, for chainArcS.
      if (age < Q.chainArcS && H.alive?.(i) !== false) {
        flying = true;
        const bx = H.x(i);
        const bz = H.z(i);
        const fk = this.chainFrom[k]!;
        const sx = fk < 0 ? this.chainFromX[k]! : H.x(this.chainI[fk]!);
        const sz = fk < 0 ? this.chainFromZ[k]! : H.z(this.chainI[fk]!);
        const len = Math.hypot(bx - sx, bz - sz);
        if (len > 0.3) {
          // A stretch of energy ribbon from its source to the beast (laid from its source), chainW thick.
          dirV.set((bx - sx) / len, 0, (bz - sz) / len);
          const o = flip();
          o.dir = dirV;
          o.span = len;
          const frames = this.frames("ribbon");
          if (frames > 1) o.frame = (k * 7 + Math.floor(age * 60)) % frames;
          o.intensity = Q.chainLight * (age < 0.05 ? 1.2 : 0.8);
          o.tint = CHAIN_TINT;
          o.occlude = 0;
          o.lift = 0.5;
          this.spawn("ribbon", v.set(sx, F.formY + 0.06, sz), Q.chainW, o);
          this.audit.crawl += 1;
        }
      }
      // Its blow on arrival (a shock twitch), then ticks.
      while (budget > 0 && this.chainHits[k]! <= Q.ticks && age >= this.chainHits[k]! * Q.tickGapS) {
        budget -= 1;
        const first = this.chainHits[k] === 0;
        this.chainHits[k] = this.chainHits[k]! + 1;
        const bx = H.x(i);
        const bz = H.z(i);
        let dx = bx - this.cx;
        let dz = bz - this.cz;
        const l = Math.hypot(dx, dz);
        if (l > 1e-3) { dx /= l; dz /= l; } else { dx = 0; dz = 1; }
        if (H.alive?.(i) === false) continue;
        const killed = H.blow(i, dx, dz, first ? Q.chainPower : Q.tickPower, "secondary");
        this.audit.blows += 1;
        if (this.last !== null) { this.last.struck += 1; this.last.chainBlows = (this.last.chainBlows ?? 0) + 1; }
        if (killed) {
          if (this.last !== null) this.last.killed += 1;
          this.death(bx, bz, H.size(i));
        } else if (first) H.status(i, Q.chainShockS);
      }
    }
    if (flying && a >= this.nextCrackle) {
      this.nextCrackle = a + Q.crackleS;
      H.sound(1.6, 0.16);
    }
  }

  reset(): void {
    this.plan = null;
    this.slamT = -1;
    this.gatherLanded = 0;
    this.chainN = 0;
    this.t = 0;
    this.next = 0;
    this.nextArc = 0;
    this.finalDone = false;
    this.pulled = false;
    this.edgeJolted = false;
    this.risers = 0;
    this.aftermath = false;
    this.gathered = 0;
    this.cols.length = 0;
    this.swept.clear();
    this.landings.length = 0;
    if (this.glowing || this.darkened) {
      this.host.glow(0);
      this.host.dark(0);
    }
    this.glowing = this.darkened = false;
    for (const p of this.pools.values()) p.clear();
    for (const k of Object.keys(this.audit) as (keyof FiveThunder["audit"])[]) this.audit[k] = 0;
  }
}

/** The final strike's three flashes (s) and the restrikes' light. */
const FINAL_FLASH_S: readonly number[] = [0.1, 0.08, 0.06];
const FINAL_FLASH_K: readonly number[] = [0.8, 0.6];
