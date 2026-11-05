/**
 * The lab's showcases, for the owner to review clips as they land (docs/work/tasks/lab-element-kits.md), each played
 * as its Firefly video layer on the field at the play camera with a Firefly sound (take 1), in its catalogue's order:
 * - key 8 (Shift+8 back; owner 05/11 ~20:00 "xử lý nhanh cho tôi lớp tuyệt kỹ, trình diễn trụ cột"): the pillar skills
 *   and the element ultimates of art-src/lab/vfx/ult/ (roles "pillar", "ultimate"; PRODUCTION_LIST_2026-11-05 §4, §7);
 * - key 9 (Shift+9 back; owner approved 05/11 20:20): the 30 designs of SKILLS_EXPANSION_2026-11-05.md in
 *   art-src/lab/vfx/expansion/ (roles "area", "avatar", "beast", "treasure"), matched by their manifest `code` (A1 … D8).
 * A caption names the item (English, Vietnamese, its group and element); the panel's lists pick any.
 * The clips were drawn from the play camera's angle (55°), so they stand as camera-facing cards (added light: the clips
 * are on black): a pillar on the foe nearest the screen's centre, its column's foot on the ground under it and its top
 * leaving the frame's top edge; an ultimate, an area skill or a treasure filling the view over the ground at the screen's
 * centre; an avatar (pháp tướng) rising over the caster and a divine beast over the foe group, both see-through (the
 * expansion's 25–40 %, so the word tags stay readable). Fast attack to the clip's peak frame, slow decay; the screen
 * shakes and flashes at the ultimate tier for ultimates, avatars and beasts, the skill tier for the rest. Not wired to
 * the sim. Key 8's items are cast on the lab's herd by clip-skills.ts (play with `at` and `feel: false`, `timeOf`): the
 * strikes, not the spawn, bring the light and the shake.
 */
import * as THREE from "three";
import type { FlipbookMeta, FlipbookPlayer, FlipbookPool } from "../view/skills/flipbook";
import { SCREEN_TIERS } from "../view/screen-fx";

/** Where a pillar's column meets the ground in its cell (x from the left, y from the top). */
const FOOT: readonly [number, number] = [0.5, 0.8];
/** Seconds to the clip's peak (the attack), then from its peak to its end (the hold and decay). */
const ATTACK_S = 0.2;
const PILLAR_S = 2.4;
const SCENE_S = 4.6;
/** An avatar's and a beast's share shown (25–40 % see-through: SKILLS_EXPANSION, "Cách dựng"). */
const FIGURE_ALPHA = 0.68;
/** The caption shows this long, then fades over CAPTION_FADE_S. */
const CAPTION_S = 4.5;
const CAPTION_FADE_S = 0.6;
const SOUND_BASE = "/art-src/lab/firefly-sprint-2026-11-05/sound/";

export type ShowcaseKind = "pillar" | "ultimate" | "area" | "avatar" | "beast" | "treasure";
/** How it stands: on the foe nearest the centre (a pillar), over the field, over the caster, over the foe group. */
export type ShowcasePlace = "foe" | "field" | "caster" | "foes";

/** One showcase item: its clip (id, or its design code), kind, element and names, sound, light and staging. */
export interface ShowcaseItem {
  readonly id: string;
  /** The manifest `code` it matches instead of its id (key 9). */
  readonly code?: string;
  readonly kind: ShowcaseKind;
  /** English and Vietnamese names of its (first) element. */
  readonly element: readonly [en: string, vi: string];
  /** Every element it unites, in Vietnamese (key 9's caption). */
  readonly elements?: string;
  readonly en: string;
  readonly vi: string;
  /** Its Firefly sound folder (take1.wav). */
  readonly sound: string;
  readonly light: string;
  readonly place: ShowcasePlace;
}

const KIND_VI: Readonly<Record<ShowcaseKind, string>> = {
  pillar: "Cột trụ", ultimate: "Tuyệt kỹ", area: "Diện rộng", avatar: "Pháp tướng", beast: "Thần thú", treasure: "Pháp bảo",
};

const E = {
  metal: ["Metal", "Kim"], wood: ["Wood", "Mộc"], water: ["Water", "Thủy"], fire: ["Fire", "Hỏa"], earth: ["Earth", "Thổ"],
  thunder: ["Thunder", "Lôi"], wind: ["Wind", "Phong"], ice: ["Ice", "Băng"], dark: ["Dark", "Ám"], light: ["Light", "Quang"],
  poison: ["Poison", "Độc"], blood: ["Blood", "Huyết"], void: ["Void", "Không gian"], star: ["Star", "Tinh tú"],
} as const;
type ElementKey = keyof typeof E;

/** Each element's ultimate sound (key 8's) and light: key 9 borrows its first element's until its own sounds exist. */
const ULT_SOUND: Readonly<Record<ElementKey, string>> = {
  metal: "tt-sfx-ult-metal-geng", wood: "tt-sfx-ult-wood-tree", water: "tt-sfx-ult-water-sea", fire: "tt-sfx-ult-fire-spark",
  earth: "tt-sfx-ult-earth-peaks", thunder: "tt-sfx-ult-thunder-edict", wind: "tt-sfx-ult-wind-firmament", ice: "tt-sfx-ult-ice-silence",
  dark: "tt-sfx-ult-dark", light: "tt-sfx-ult-light", poison: "tt-sfx-ult-poison", blood: "tt-sfx-ult-blood", void: "tt-sfx-ult-void",
  star: "tt-sfx-ult-star",
};
const LIGHT: Readonly<Record<ElementKey, string>> = {
  metal: "#d6f3ff", wood: "#d8f2a8", water: "#7cc2ff", fire: "#ffb060", earth: "#f0d6a8", thunder: "#c9b8ff", wind: "#c4f2d6",
  ice: "#cfe6ff", dark: "#d0301f", light: "#fff0c8", poison: "#d8f890", blood: "#f0a0b8", void: "#d8d0ff", star: "#dfe6ff",
};

function ult(id: string, el: ElementKey, en: string, vi: string): ShowcaseItem {
  return { id, kind: "ultimate", element: E[el], en, vi, sound: ULT_SOUND[el], light: LIGHT[el], place: "field" };
}

/**
 * Key 8's catalogue in the owner's order: the four pillars (§7), then one ultimate per element (§4; the six elements of
 * §7 carry the names of their stills, docs/work/tasks/skill-stills-0511.json). Water and Thunder are their "-v2"
 * redraws, Dark its palette-A redraw.
 */
export const SHOWCASE: readonly ShowcaseItem[] = [
  { id: "pillar-thunder-single", kind: "pillar", element: E.thunder, en: "Thunder Pillar", vi: "Lôi Trụ", sound: "tt-sfx-pillar-thunder", light: LIGHT.thunder, place: "foe" },
  { id: "pillar-thunder-field", kind: "pillar", element: E.thunder, en: "Thunder Field", vi: "Vạn Lôi Trụ", sound: "tt-sfx-pillar-thunder", light: LIGHT.thunder, place: "field" },
  { id: "pillar-light-judgement", kind: "pillar", element: E.light, en: "Light Judgement", vi: "Thiên Quang Trụ", sound: "tt-sfx-pillar-light", light: LIGHT.light, place: "foe" },
  { id: "pillar-fire-meteor", kind: "pillar", element: E.fire, en: "Fire Meteor", vi: "Hỏa Tinh Trụy", sound: "tt-sfx-pillar-meteor", light: LIGHT.fire, place: "foe" },
  ult("ult-metal-geng", "metal", "Heavenly Geng Manifestation", "Thiên Canh Pháp Tướng"),
  ult("ult-wood-primordial-tree", "wood", "Primordial Tree Descends", "Tổ Mộc Giáng Thế"),
  ult("ult-water-profound-sea-v2", "water", "Profound Sea Opens a Realm", "Huyền Hải Khai Giới"),
  ult("ult-fire-one-spark", "fire", "One Spark Burns Heaven", "Nhất Tinh Phần Thiên"),
  ult("ult-earth-ink-peaks", "earth", "Ten Thousand Peaks Become Real", "Vạn Nhạc Thành Chân"),
  ult("ult-thunder-nine-heavens-v2", "thunder", "Thunder Edict of the Nine Heavens", "Cửu Tiêu Lôi Chiếu"),
  ult("ult-wind-firmament", "wind", "Firmament Rolls Up the Realm", "Thương Khung Quyển Giới"),
  ult("ult-ice-cold-silence", "ice", "Cold Heaven Returns to Silence", "Hàn Thiên Quy Tịch"),
  ult("ult-dark-a", "dark", "Eclipse of the Black Sun", "Nhật thực, mặt trời đen"),
  ult("ult-light", "light", "Halo Gate Opens", "Cổng hào quang mở"),
  ult("ult-poison", "poison", "Miasma Lotus Field", "Chướng khí phủ sân, sen độc nở"),
  ult("ult-blood", "blood", "Blood Moon", "Trăng máu"),
  ult("ult-void", "void", "Space Shatters Like a Mirror", "Không gian vỡ như gương"),
  ult("ult-star", "star", "Nine Constellations Fall", "Chín chòm sao rơi thành thiên thạch"),
];

/** A key-9 design: code, names, its elements (the first gives its sound and light), its group's staging. */
function design(code: string, en: string, vi: string, els: readonly ElementKey[], place?: ShowcasePlace): ShowcaseItem {
  const kind: ShowcaseKind = code[0] === "A" ? "area" : code[0] === "B" ? "avatar" : code[0] === "C" ? "beast" : "treasure";
  const first = els[0]!;
  return {
    id: code, code, kind, element: E[first], elements: els.map((e) => E[e][1]).join(", "), en, vi,
    sound: ULT_SOUND[first], light: LIGHT[first], place: place ?? (kind === "avatar" ? "caster" : kind === "beast" ? "foes" : "field"),
  };
}

/** Key 9's catalogue: SKILLS_EXPANSION_2026-11-05.md (approved 05/11 20:20), in its order. */
export const EXPANSION: readonly ShowcaseItem[] = [
  design("A1", "Myriad Spirit Lotus Bloom", "Vạn Linh Liên Hoa Trận", ["wood", "light", "water", "fire"]),
  design("A2", "Firmament-Sundering Rift", "Liệt Thiên Trảm Ngân", ["void", "metal", "blood", "thunder"]),
  design("A3", "Nine-Heavens Tribulation Grid", "Cửu Tiêu Lôi Kiếp Võng", ["thunder", "star", "light"]),
  design("A4", "Karmic Ember Tempest", "Hồng Liên Nghiệp Hỏa Vũ", ["fire", "poison", "dark", "blood"]),
  design("A5", "Glacial Moon Reflection Tide", "Hàn Nguyệt Kính Triều", ["ice", "water", "star"]),
  design("A6", "Scarlet Samsara Compass", "Huyết Luân Luân Hồi Bàn", ["blood", "dark", "earth", "void"], "foes"),
  design("A7", "Seven-Star Astral Fall", "Thất Tinh Tinh Hà Trụy", ["star", "metal", "light", "ice"]),
  design("A8", "Netherworld Briar Vortex", "U Minh Kinh Cức Uyên", ["poison", "wood", "dark"]),
  design("B1", "Three-Faced Six-Armed War Sovereign", "Tam Đầu Lục Tí Chiến Tôn Pháp Tướng", ["fire", "blood", "metal", "thunder"]),
  design("B2", "Thousand-Hand Bodhi Illuminator", "Thiên Thủ Lưu Ly Minh Vương Pháp Tướng", ["light", "wood", "metal", "earth"]),
  design("B3", "Primordial Heaven-and-Earth Titan", "Pháp Thiên Tượng Địa Cự Thần", ["earth", "thunder", "ice", "metal"]),
  design("B4", "Purple Micro Star Emperor", "Tử Vi Tinh Quân Pháp Tướng", ["star", "void", "light", "ice"]),
  design("B5", "Nine-Nether Soul Arbiter", "Cửu U Minh Đế Pháp Tướng", ["dark", "blood", "poison", "void"]),
  design("B6", "Taixu Sword Immortal Phantom", "Thái Hư Kiếm Tiên Pháp Tướng", ["metal", "wind", "ice", "light"]),
  design("C1", "Azure Tempest Dragon", "Thanh Minh Vân Lôi Long", ["thunder", "wind", "water", "wood"]),
  design("C2", "Astral Slaying White Tiger", "Canh Kim Sát Phạt Bạch Hổ", ["metal", "wind", "ice", "blood"]),
  design("C3", "Nirvana Sunfire Vermilion Bird", "Nam Minh Ly Hỏa Chu Tước", ["fire", "light", "wind", "star"], "field"),
  design("C4", "Black-Abyss Tortoise & Serpent", "Huyền Minh Trấn Hải Huyền Vũ", ["water", "earth", "ice", "dark"]),
  design("C5", "Violet-Gold Auspicious Qilin", "Tử Kim Thụy Lôi Kỳ Lân", ["thunder", "fire", "light", "earth"]),
  design("C6", "North-Sea Astral Kunpeng", "Bắc Minh Hóa Vũ Côn Bằng", ["water", "wind", "void", "star"], "field"),
  design("C7", "Celestial Truth Spirit Baize", "Thông Thiên Hạo Quang Bạch Trạch", ["light", "star", "wind", "wood"]),
  design("C8", "Moonlight Illusion Nine-Tailed Fox", "Thanh Khâu Huyễn Nguyệt Cửu Vĩ Hồ", ["ice", "dark", "fire", "poison", "void"]),
  design("D1", "Heaven-Overturning Mountain Seal", "Phiên Thiên Trấn Nhạc Ấn", ["earth", "metal", "light", "star"]),
  design("D2", "Soul-Shaking Primordial Bell", "Chấn Hồn Hồng Mông Chung", ["metal", "thunder", "wind", "void"]),
  design("D3", "Myriad-Blade Spirit Gourd", "Trảm Tiên Vạn Nhận Hồ Lô", ["metal", "wind", "poison", "blood", "fire"]),
  design("D4", "Nine-Dragon Heaven-Refining Cauldron", "Cửu Long Luyện Thiên Đỉnh", ["fire", "poison", "blood", "earth"]),
  design("D5", "Seven-Aperture Demon-Suppressing Pagoda", "Thất Bảo Trấn Yêu Tháp", ["light", "earth", "thunder", "dark"]),
  design("D6", "Taiji Void-Reflecting Mirror", "Thái Cực Chiếu Hư Kính", ["light", "dark", "ice", "void", "star"]),
  design("D7", "Immortal Binding Aurora Ribbon", "Hỗn Thiên Khốn Tiên Lăng", ["wind", "water", "fire", "wood", "light"]),
  design("D8", "Twelve-Metropolis Array Banners", "Thập Nhị Đô Thiên Trận Kỳ", ["dark", "blood", "thunder", "poison", "void"]),
];

/** What a showcase plays: its folder, the roles it takes, its catalogue, how clips match it, what it never plays. */
export interface ShowcaseConfig {
  readonly folder: string;
  readonly roles: readonly string[];
  readonly items: readonly ShowcaseItem[];
  /** Match catalogue items by the clip's manifest `code` (else by its id). */
  readonly byCode: boolean;
  readonly rejected: ReadonlySet<string>;
  /** Its key, for the caption ("8": "phím 8: tiếp · Shift+8: lùi lại"). */
  readonly key: string;
}

/** Key 8: art-src/lab/vfx/ult/. The owner turned down Water's and Thunder's first ultimates and Dark's purple eclipse. */
export const ULT_SHOWCASE: ShowcaseConfig = {
  folder: "ult", roles: ["pillar", "ultimate"], items: SHOWCASE, byCode: false, key: "8",
  rejected: new Set(["ult-water-profound-sea", "ult-thunder-nine-heavens", "ult-dark"]),
};

/** Key 9: art-src/lab/vfx/expansion/ (lab-flipbooks; roles by group, `code` A1 … D8). */
export const EXPANSION_SHOWCASE: ShowcaseConfig = {
  folder: "expansion", roles: ["area", "avatar", "beast", "treasure"], items: EXPANSION, byCode: true, key: "9", rejected: new Set(),
};

const v = new THREE.Vector3();
const f = new THREE.Vector3();
const p = new THREE.Vector3();

/** How a castable skill plays its clip (clip-skills.ts). */
export interface PlayOptions {
  /** Where a pillar or a beast stands (a ground point) instead of on the foe nearest the screen's centre. */
  readonly at?: THREE.Vector3;
  /** The light, shake and flash on its spawn (default true; false: the skill's strikes bring them). */
  readonly feel?: boolean;
  /** The caption's stats line and its keys line (a castable skill's). */
  readonly detail?: string;
  readonly nav?: string;
}

/** A clip's time map: to its peak frame in ATTACK_S, then the rest over its tail (or all of it over its tail). */
interface TimeMap {
  readonly start: number;
  readonly peak: number;
  readonly last: number;
  readonly rate: number;
  readonly slowRate: number | null;
}

export interface ShowcaseHost {
  readonly camera: THREE.PerspectiveCamera;
  /** The beast nearest (x, z) within r m, else −1, and its ground position. */
  nearest(x: number, z: number, r: number): number;
  at(i: number, out: THREE.Vector3): void;
  /** The caster's ground position. */
  caster(out: THREE.Vector3): void;
  /** An impact light at a point (the lab's FlashLights). */
  light(at: THREE.Vector3, colour: string, intensity: number): void;
  /** The screen's flash (strength 0–1) and shake (px, s, roll °). */
  accent(strength: number): void;
  shake(px: number, seconds: number, rollDeg: number): void;
  /** Where the caption goes (the lab: document.body); null: none (tests). */
  readonly captionHost: HTMLElement | null;
}

/** One caption per host element, shared by the showcases (the last played names itself). */
const CAPTIONS = new WeakMap<HTMLElement, { el: HTMLDivElement; timer: number }>();
function captionOf(host: HTMLElement): { el: HTMLDivElement; timer: number } {
  let c = CAPTIONS.get(host);
  if (c === undefined) {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:20;pointer-events:none;padding:10px 22px 12px;"
      + "border-radius:10px;background:rgba(8,10,16,.72);border:1px solid rgba(220,228,240,.25);color:#f2f4f8;text-align:center;"
      + "font:15px system-ui;opacity:0;max-width:92vw";
    host.append(el);
    CAPTIONS.set(host, (c = { el, timer: 0 }));
  }
  return c;
}

let playing: HTMLAudioElement | null = null;

export class Showcase {
  private readonly pools = new Map<string, FlipbookPool>();
  private readonly items = new Map<string, ShowcaseItem>();
  private readonly listeners: (() => void)[] = [];
  private turn = -1;

  constructor(player: FlipbookPlayer, private readonly host: ShowcaseHost, private readonly cfg: ShowcaseConfig = ULT_SHOWCASE) {
    const lib = player.library(cfg.folder);
    lib.watch((id) => {
      const e = lib.get(id);
      const role = e?.meta.role;
      if (e === null || role === undefined || !cfg.roles.includes(role) || this.pools.has(id) || cfg.rejected.has(id)) return;
      const it = this.match(id, e.meta);
      const pool = player.pool(cfg.folder, id, { mode: "fire", capacity: 2, renderOrder: 15 });
      if (it.place === "foe") pool.attach({ ...e.meta, pivot: FOOT }, e.texture, e.controls);
      pool.vignette = 0.35;
      this.pools.set(id, pool);
      this.items.set(id, it);
      for (const fn of this.listeners) fn();
    });
  }

  /** The catalogue item a clip stands for (by id or code); one outside it: its id as its name, staged by its role. */
  private match(id: string, meta: FlipbookMeta): ShowcaseItem {
    const it = this.cfg.items.find((i) => (this.cfg.byCode ? i.code !== undefined && i.code === meta.code : i.id === id));
    if (it !== undefined) return { ...it, id };
    const kind: ShowcaseKind = (["pillar", "ultimate", "area", "avatar", "beast", "treasure"] as const).find((k) => k === meta.role) ?? "ultimate";
    return { id, kind, element: ["", ""], en: meta.code ?? id, vi: "", sound: "", light: "#ffffff", place: kind === "pillar" ? "foe" : kind === "avatar" ? "caster" : kind === "beast" ? "foes" : "field" };
  }

  /** Calls `fn` whenever a clip arrives (the panel's list rebuilds). */
  onList(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** The clips it can play: the catalogue's order, then any other the manifest has. */
  ids(): string[] {
    const rank = (id: string): number => {
      const it = this.items.get(id)!;
      const i = this.cfg.items.findIndex((c) => (this.cfg.byCode ? c.code === it.code : c.id === id));
      return i < 0 ? this.cfg.items.length : i;
    };
    return [...this.pools.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }

  /** The item of a clip it has. */
  item(id: string): ShowcaseItem {
    return this.items.get(id)!;
  }

  /** Whether it has clip `id` loaded. */
  has(id: string): boolean {
    return this.pools.get(id)?.ready === true;
  }

  /** The item selected (the last played or chosen), or null. */
  current(): string | null {
    const ids = this.ids();
    return this.turn >= 0 && this.turn < ids.length ? ids[this.turn]! : null;
  }

  /** Selects `id` without playing it. */
  select(id: string): void {
    const i = this.ids().indexOf(id);
    if (i >= 0) this.turn = i;
  }

  /** Selects the next item (wrapping) without playing it; null when it has none. */
  next(): string | null {
    const ids = this.ids();
    if (ids.length === 0) return null;
    this.turn = (this.turn + 1) % ids.length;
    return ids[this.turn]!;
  }

  /** The ground under the screen's centre. */
  centre(out: THREE.Vector3): THREE.Vector3 {
    const cam = this.host.camera;
    cam.getWorldDirection(f);
    const t = f.y < -1e-3 ? -cam.position.y / f.y : 30;
    return out.set(cam.position.x + f.x * t, 0, cam.position.z + f.z * t);
  }

  /** Its clip's peak frame (the manifest's timing.peak, inside the clip). */
  peakOf(id: string): number {
    return this.map(id)?.peak ?? 0;
  }

  /** Seconds after its spawn that clip `id` shows `frame` (its time map); 0 before it is loaded. */
  timeOf(id: string, frame: number): number {
    const m = this.map(id);
    const meta = this.pools.get(id)?.meta;
    if (m === null || meta === null || meta === undefined) return 0;
    const fr = Math.min(m.last, Math.max(m.start, frame));
    if (m.slowRate === null || fr <= m.peak) return (fr - m.start) / (meta.fps * m.rate);
    return (m.peak - m.start) / (meta.fps * m.rate) + (fr - m.peak) / (meta.fps * m.slowRate);
  }

  private map(id: string): TimeMap | null {
    const pool = this.pools.get(id);
    const it = this.items.get(id);
    if (pool?.meta === null || pool?.meta === undefined || it === undefined) return null;
    const meta = pool.meta;
    const last = meta.frames - 1;
    const peak = Math.min(last - 1, Math.max(meta.start, meta.peak ?? meta.start));
    const tail = it.place === "foe" ? PILLAR_S : SCENE_S;
    return peak > meta.start
      ? { start: meta.start, peak, last, rate: (peak - meta.start) / (meta.fps * ATTACK_S), slowRate: (last + 1 - peak) / (meta.fps * tail) }
      : { start: meta.start, peak, last, rate: (last + 1 - meta.start) / (meta.fps * tail), slowRate: null };
  }

  /** The caption of `id` (a castable skill's: its stats and keys lines), without playing it. */
  caption(id: string, detail?: string, nav?: string): void {
    const it = this.items.get(id);
    if (it !== undefined) this.show(it, this.ids(), detail, nav);
  }

  /** The one before the last played (Shift+key). */
  prev(): string | null {
    const ids = this.ids();
    if (ids.length === 0) return null;
    return this.play(ids[(Math.max(0, this.turn) - 1 + ids.length) % ids.length]);
  }

  /**
   * Plays `id` (none: the next in order); returns what it played, or null when it has no such clip loaded. `opts`: where
   * it stands, whether its spawn brings the light and the shake, its caption's stats (clip-skills.ts).
   */
  play(id?: string, opts: PlayOptions = {}): string | null {
    const ids = this.ids();
    if (ids.length === 0 || (id !== undefined && !this.pools.has(id))) return null;
    this.turn = id === undefined ? (this.turn + 1) % ids.length : ids.indexOf(id);
    const pick = ids[this.turn]!;
    const pool = this.pools.get(pick)!;
    if (!pool.ready) return null;
    const meta = pool.meta!;
    const it = this.items.get(pick)!;
    const cam = this.host.camera;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // The ground under the screen's centre.
    this.centre(p);
    const cx = p.x;
    const cz = p.z;
    // Fast attack: to the clip's peak frame in ATTACK_S, then the rest over the hold and decay.
    const m = this.map(pick)!;
    const figure = it.kind === "avatar" || it.kind === "beast";
    const o = {
      frame: meta.start,
      rate: m.rate,
      ...(m.slowRate !== null ? { slowFrom: m.peak, slowRate: m.slowRate } : {}),
      fadeOut: 0.6,
      // A see-through figure darkens the ground under it less.
      occlude: figure ? 0.12 : 0.25,
      alpha: figure ? FIGURE_ALPHA : 1,
      lift: 0,
    };
    let size: number;
    if (it.place === "foe") {
      // On its point (else the foe nearest the screen's centre); tall enough that the column leaves the top of the frame.
      const i = opts.at !== undefined ? -1 : this.host.nearest(cx, cz, 30);
      if (opts.at !== undefined) v.copy(opts.at);
      else if (i >= 0) this.host.at(i, v);
      else v.set(cx, 0, cz);
      v.y = 0;
      const d = v.distanceTo(cam.position);
      // The column (FOOT[1] of the card above its foot) reaches past the frame's top edge.
      const ndc = p.copy(v).project(cam).y;
      size = THREE.MathUtils.clamp((1.15 * (1 - ndc) * d * tan) / FOOT[1], 8, 40);
      o.lift = 3;
    } else {
      // A scene over the ground at the screen's centre (field), the caster (an avatar rising behind and over them) or
      // the foe nearest the centre (a beast on the group), as tall as the view there; drawn over the near ground (its
      // lower half stands behind it in depth).
      if (it.place === "caster") this.host.caster(v);
      else if (it.place === "foes") {
        const i = opts.at !== undefined ? -1 : this.host.nearest(cx, cz, 30);
        if (opts.at !== undefined) v.copy(opts.at);
        else if (i >= 0) this.host.at(i, v);
        else v.set(cx, 0, cz);
      } else v.set(cx, 0, cz);
      v.y = 0;
      const d = v.distanceTo(cam.position);
      size = 2 * d * tan * (it.place === "field" ? 1 : 0.9);
      // An avatar stands on the caster: its card's lower edge near the feet, its body over them.
      if (it.place === "caster") v.y = size * 0.32;
      o.lift = d * 0.6;
    }
    pool.clear();
    pool.spawn(v, size, o);
    if (opts.feel !== false) {
      this.host.light(p.set(v.x, 1.5, v.z), it.light, it.place === "foe" ? 6 : 8);
      // The ultimate tier's shake and flash for ultimates, avatars and beasts; the skill tier's for the rest.
      const big = it.kind === "ultimate" || figure;
      const tier = big ? SCREEN_TIERS.ultimate : SCREEN_TIERS.skill;
      this.host.shake(tier.shakePx, tier.shakeS, tier.rollDeg);
      this.host.accent(big ? 0.6 : 0.35);
    }
    this.sound(it);
    this.show(it, ids, opts.detail, opts.nav);
    return pick;
  }

  /** Its Firefly sound, take 1 (dev lab only); the previous one (any showcase's) stops. */
  private sound(it: ShowcaseItem): void {
    if (it.sound === "" || typeof Audio === "undefined") return;
    playing?.pause();
    const a = new Audio(SOUND_BASE + it.sound + "/take1.wav");
    a.volume = 0.85;
    void a.play().catch(() => undefined);
    playing = a;
  }

  /** The caption: its English name, its Vietnamese name, group and element(s), its stats, where it is in the list. */
  private show(it: ShowcaseItem, ids: readonly string[], detail?: string, keys?: string): void {
    if (this.host.captionHost === null) return;
    const cap = captionOf(this.host.captionHost);
    const c = cap.el;
    const element = it.elements !== undefined ? ` · Hệ ${it.elements}` : it.element[0] === "" ? "" : ` · Hệ ${it.element[1]} (${it.element[0]})`;
    const en = document.createElement("div");
    en.textContent = (it.code !== undefined ? it.code + " · " : "") + it.en;
    en.style.cssText = 'font:italic 700 30px "Cormorant Garamond", Georgia, serif;letter-spacing:.02em';
    const vi = document.createElement("div");
    vi.textContent = (it.vi === "" ? "" : it.vi + " · ") + KIND_VI[it.kind] + element;
    vi.style.cssText = "margin-top:2px;font:600 17px system-ui";
    const nav = document.createElement("div");
    const k = this.cfg.key;
    nav.textContent = `${ids.indexOf(it.id) + 1} / ${ids.length} · ` + (keys ?? `phím ${k}: tiếp · Shift+${k}: lùi lại · lớp video, chưa nối vào trận`);
    nav.style.cssText = "margin-top:4px;font:12px system-ui;opacity:.7";
    const lines: HTMLElement[] = [en, vi];
    if (detail !== undefined) {
      const d = document.createElement("div");
      d.textContent = detail;
      d.style.cssText = "margin-top:3px;font:600 13px system-ui;opacity:.9";
      lines.push(d);
    }
    c.replaceChildren(...lines, nav);
    c.style.transition = "none";
    c.style.opacity = "1";
    clearTimeout(cap.timer);
    cap.timer = window.setTimeout(() => {
      c.style.transition = `opacity ${CAPTION_FADE_S}s`;
      c.style.opacity = "0";
    }, CAPTION_S * 1000);
  }
}
