/**
 * The 15-group topic map and its distances (canon §16, D40, PB-13). The
 * groups are shared/vocabulary/topics' 15 groups; the map lays them on a
 * 5 × 3 grid with related groups side by side, and the distance between two
 * groups is the number of steps between their cells (Manhattan). Tâm ma come
 * from groups ≥ TINH_TU.topicDistance (3) steps from the lesson's group.
 * Words of ≥ 2 groups and polysemous words are left out of both Thường and
 * Tâm ma (wordFitsPools).
 * The grid layout is this round's proposal (canon gives only "a 15-group map").
 * Pure and deterministic.
 * Owner: Lane 8.
 */
import { TINH_TU } from "../../content/rules";

export const GROUP_IDS = [
  "everyday-life",
  "people-relationships",
  "home-living",
  "food-drink",
  "health-body",
  "education",
  "work-business",
  "travel-tourism",
  "transport",
  "shopping-money",
  "technology",
  "communication-media",
  "nature-environment",
  "society-culture",
  "academic-abstract",
] as const;

export type GroupId = (typeof GROUP_IDS)[number];

export interface TopicGroup {
  readonly id: GroupId;
  /** Vietnamese name shown on the Tham Ngộ screen. */
  readonly vi: string;
  /** Cell on the 5 × 3 map. */
  readonly row: number;
  readonly col: number;
}

/**
 * Row 0: nature · travel · transport · shopping · technology
 * Row 1: health · food · home · work · communication
 * Row 2: people · everyday · society · education · academic
 */
export const TOPIC_MAP: readonly TopicGroup[] = [
  { id: "nature-environment", vi: "Thiên nhiên, môi trường", row: 0, col: 0 },
  { id: "travel-tourism", vi: "Du lịch", row: 0, col: 1 },
  { id: "transport", vi: "Giao thông", row: 0, col: 2 },
  { id: "shopping-money", vi: "Mua sắm, tiền bạc", row: 0, col: 3 },
  { id: "technology", vi: "Công nghệ", row: 0, col: 4 },
  { id: "health-body", vi: "Sức khỏe, cơ thể", row: 1, col: 0 },
  { id: "food-drink", vi: "Ăn uống", row: 1, col: 1 },
  { id: "home-living", vi: "Nhà ở", row: 1, col: 2 },
  { id: "work-business", vi: "Công việc, kinh doanh", row: 1, col: 3 },
  { id: "communication-media", vi: "Giao tiếp, truyền thông", row: 1, col: 4 },
  { id: "people-relationships", vi: "Con người, quan hệ", row: 2, col: 0 },
  { id: "everyday-life", vi: "Đời sống hằng ngày", row: 2, col: 1 },
  { id: "society-culture", vi: "Xã hội, văn hóa", row: 2, col: 2 },
  { id: "education", vi: "Giáo dục", row: 2, col: 3 },
  { id: "academic-abstract", vi: "Học thuật", row: 2, col: 4 },
];

const BY_ID: ReadonlyMap<string, TopicGroup> = new Map(TOPIC_MAP.map((group) => [group.id, group]));

export const isGroupId = (value: string): value is GroupId => BY_ID.has(value);

export function topicGroup(id: string): TopicGroup {
  const group = BY_ID.get(id);
  if (group === undefined) throw new Error("tinh-tu: unknown topic group " + id);
  return group;
}

/** Steps between two groups on the map. */
export function topicDistance(a: string, b: string): number {
  const from = topicGroup(a);
  const to = topicGroup(b);
  return Math.abs(from.row - to.row) + Math.abs(from.col - to.col);
}

/** The 15 × 15 distance table in GROUP_IDS order (docs and tests). */
export const DISTANCE_TABLE: readonly (readonly number[])[] = GROUP_IDS.map((a) => GROUP_IDS.map((b) => topicDistance(a, b)));

/** Groups a Tâm ma of a lesson in `group` may come from (≥ TINH_TU.topicDistance steps). */
export function farGroups(group: string, min: number = TINH_TU.topicDistance): GroupId[] {
  return GROUP_IDS.filter((other) => topicDistance(group, other) >= min);
}

/** Senses of a Vietnamese gloss: `;`-separated, notes in brackets left out. */
export function senseCount(vi: string): number {
  return vi
    .replace(/\s*\([^)]*\)/g, "")
    .split(";")
    .map((sense) => sense.trim())
    .filter((sense) => sense !== "").length;
}

/**
 * Polysemous for Tĩnh Tu: a gloss of ≥ 3 senses. shared/vocabulary marks no
 * polysemy; this cut is this round's proposal (it drops "wash: rửa; giặt; lớp
 * sơn mỏng" and keeps "lạnh; rét").
 */
export const POLYSEMY_MIN_SENSES = 3;
export const isPolysemous = (vi: string): boolean => senseCount(vi) >= POLYSEMY_MIN_SENSES;

/** Thường and Tâm ma take only words of exactly one group, not polysemous (canon §16, PB-13). */
export function wordFitsPools(groups: readonly string[], vi: string): boolean {
  return new Set(groups).size === 1 && isGroupId(groups[0]!) && !isPolysemous(vi);
}
