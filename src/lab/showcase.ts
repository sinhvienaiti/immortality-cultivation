/**
 * The lab's showcase key (8; docs/work/tasks/lab-element-kits.md; owner 05/11/2026 ~20:00: "xử lý nhanh cho tôi lớp
 * tuyệt kỹ, trình diễn trụ cột để tôi review"): the pillar skills and the element ultimates of art-src/lab/vfx/ult/
 * (manifest roles "pillar" and "ultimate"; PRODUCTION_LIST_2026-11-05 §4 and §7), each played as its Firefly video layer
 * on the field at the play camera with its Firefly sound (take 1), in the catalogue's order as their clips land: 8 the
 * next, Shift+8 the one before, the panel's list any. A caption names it (English, Vietnamese, its element).
 * The clips were drawn from the play camera's angle (55°), so they stand as camera-facing cards: a pillar on the foe
 * nearest the screen's centre, its column's foot on the ground under it and its top leaving the frame's top edge; a
 * field of pillars or an ultimate filling the view over the ground at the screen's centre. Added light (the clips are on
 * black); fast attack to the clip's peak frame, slow decay; an ultimate shakes and flashes the screen at the ultimate
 * tier, a pillar at the skill tier. Not wired to the sim: nothing is struck.
 */
import * as THREE from "three";
import type { FlipbookPlayer, FlipbookPool } from "../view/skills/flipbook";
import { SCREEN_TIERS } from "../view/screen-fx";

const FOLDER = "ult";
/** Where a pillar's column meets the ground in its cell (x from the left, y from the top). */
const FOOT: readonly [number, number] = [0.5, 0.8];
/** Seconds to the clip's peak (the attack), then from its peak to its end (the hold and decay). */
const ATTACK_S = 0.2;
const PILLAR_S = 2.4;
const SCENE_S = 4.6;
/** The caption shows this long, then fades over CAPTION_FADE_S. */
const CAPTION_S = 4.5;
const CAPTION_FADE_S = 0.6;
const SOUND_BASE = "/art-src/lab/firefly-sprint-2026-11-05/sound/";

/** One showcase item: its clip id, kind, element and names, its Firefly sound folder (take1.wav) and light. */
export interface ShowcaseItem {
  readonly id: string;
  readonly kind: "pillar" | "ultimate";
  /** English and Vietnamese element names. */
  readonly element: readonly [en: string, vi: string];
  readonly en: string;
  readonly vi: string;
  readonly sound: string;
  readonly light: string;
}

const E = {
  metal: ["Metal", "Kim"], wood: ["Wood", "Mộc"], water: ["Water", "Thủy"], fire: ["Fire", "Hỏa"], earth: ["Earth", "Thổ"],
  thunder: ["Thunder", "Lôi"], wind: ["Wind", "Phong"], ice: ["Ice", "Băng"], dark: ["Dark", "Ám"], light: ["Light", "Quang"],
  poison: ["Poison", "Độc"], blood: ["Blood", "Huyết"], void: ["Void", "Không gian"], star: ["Star", "Tinh tú"],
} as const;

/**
 * The catalogue in the owner's order: the four pillars (§7), then one ultimate per element (§4; the six elements of
 * §7 carry the names of their stills, docs/work/tasks/skill-stills-0511.json). Only items whose clip is in the manifest
 * play; Water and Thunder are their "-v2" redraws, Dark its palette-A redraw.
 */
export const SHOWCASE: readonly ShowcaseItem[] = [
  { id: "pillar-thunder-single", kind: "pillar", element: E.thunder, en: "Thunder Pillar", vi: "Lôi Trụ", sound: "tt-sfx-pillar-thunder", light: "#c9b8ff" },
  { id: "pillar-thunder-field", kind: "pillar", element: E.thunder, en: "Thunder Field", vi: "Vạn Lôi Trụ", sound: "tt-sfx-pillar-thunder", light: "#c9b8ff" },
  { id: "pillar-light-judgement", kind: "pillar", element: E.light, en: "Light Judgement", vi: "Thiên Quang Trụ", sound: "tt-sfx-pillar-light", light: "#fff0c8" },
  { id: "pillar-fire-meteor", kind: "pillar", element: E.fire, en: "Fire Meteor", vi: "Hỏa Tinh Trụy", sound: "tt-sfx-pillar-meteor", light: "#ffb060" },
  { id: "ult-metal-geng", kind: "ultimate", element: E.metal, en: "Heavenly Geng Manifestation", vi: "Thiên Canh Pháp Tướng", sound: "tt-sfx-ult-metal-geng", light: "#d6f3ff" },
  { id: "ult-wood-primordial-tree", kind: "ultimate", element: E.wood, en: "Primordial Tree Descends", vi: "Tổ Mộc Giáng Thế", sound: "tt-sfx-ult-wood-tree", light: "#d8f2a8" },
  { id: "ult-water-profound-sea-v2", kind: "ultimate", element: E.water, en: "Profound Sea Opens a Realm", vi: "Huyền Hải Khai Giới", sound: "tt-sfx-ult-water-sea", light: "#7cc2ff" },
  { id: "ult-fire-one-spark", kind: "ultimate", element: E.fire, en: "One Spark Burns Heaven", vi: "Nhất Tinh Phần Thiên", sound: "tt-sfx-ult-fire-spark", light: "#ffb060" },
  { id: "ult-earth-ink-peaks", kind: "ultimate", element: E.earth, en: "Ten Thousand Peaks Become Real", vi: "Vạn Nhạc Thành Chân", sound: "tt-sfx-ult-earth-peaks", light: "#f0d6a8" },
  { id: "ult-thunder-nine-heavens-v2", kind: "ultimate", element: E.thunder, en: "Thunder Edict of the Nine Heavens", vi: "Cửu Tiêu Lôi Chiếu", sound: "tt-sfx-ult-thunder-edict", light: "#c9b8ff" },
  { id: "ult-wind-firmament", kind: "ultimate", element: E.wind, en: "Firmament Rolls Up the Realm", vi: "Thương Khung Quyển Giới", sound: "tt-sfx-ult-wind-firmament", light: "#c4f2d6" },
  { id: "ult-ice-cold-silence", kind: "ultimate", element: E.ice, en: "Cold Heaven Returns to Silence", vi: "Hàn Thiên Quy Tịch", sound: "tt-sfx-ult-ice-silence", light: "#cfe6ff" },
  { id: "ult-dark-a", kind: "ultimate", element: E.dark, en: "Eclipse of the Black Sun", vi: "Nhật thực, mặt trời đen", sound: "tt-sfx-ult-dark", light: "#d0301f" },
  { id: "ult-light", kind: "ultimate", element: E.light, en: "Halo Gate Opens", vi: "Cổng hào quang mở", sound: "tt-sfx-ult-light", light: "#fff0c8" },
  { id: "ult-poison", kind: "ultimate", element: E.poison, en: "Miasma Lotus Field", vi: "Chướng khí phủ sân, sen độc nở", sound: "tt-sfx-ult-poison", light: "#d8f890" },
  { id: "ult-blood", kind: "ultimate", element: E.blood, en: "Blood Moon", vi: "Trăng máu", sound: "tt-sfx-ult-blood", light: "#f0a0b8" },
  { id: "ult-void", kind: "ultimate", element: E.void, en: "Space Shatters Like a Mirror", vi: "Không gian vỡ như gương", sound: "tt-sfx-ult-void", light: "#d8d0ff" },
  { id: "ult-star", kind: "ultimate", element: E.star, en: "Nine Constellations Fall", vi: "Chín chòm sao rơi thành thiên thạch", sound: "tt-sfx-ult-star", light: "#dfe6ff" },
];

/**
 * Clips the owner turned down (05/11: Water's and Thunder's first ultimates, the eyes and the scroll; Dark's purple
 * eclipse): never played, even when a manifest still lists them.
 */
const REJECTED: ReadonlySet<string> = new Set(["ult-water-profound-sea", "ult-thunder-nine-heavens", "ult-dark"]);

const v = new THREE.Vector3();
const f = new THREE.Vector3();
const p = new THREE.Vector3();

export interface ShowcaseHost {
  readonly camera: THREE.PerspectiveCamera;
  /** The beast nearest (x, z) within r m, else −1, and its ground position. */
  nearest(x: number, z: number, r: number): number;
  at(i: number, out: THREE.Vector3): void;
  /** An impact light at a point (the lab's FlashLights). */
  light(at: THREE.Vector3, colour: string, intensity: number): void;
  /** The screen's flash (strength 0–1) and shake (px, s, roll °). */
  accent(strength: number): void;
  shake(px: number, seconds: number, rollDeg: number): void;
  /** Where the caption goes (the lab: document.body); null: none (tests). */
  readonly captionHost: HTMLElement | null;
}

export class UltShowcase {
  private readonly pools = new Map<string, FlipbookPool>();
  private readonly roles = new Map<string, string>();
  private readonly listeners: (() => void)[] = [];
  private turn = -1;
  private audio: HTMLAudioElement | null = null;
  private readonly caption: HTMLDivElement | null = null;
  private captionTimer = 0;

  constructor(player: FlipbookPlayer, private readonly host: ShowcaseHost) {
    const lib = player.library(FOLDER);
    lib.watch((id) => {
      const e = lib.get(id);
      const role = e?.meta.role;
      if (e === null || (role !== "pillar" && role !== "ultimate") || this.pools.has(id) || REJECTED.has(id)) return;
      const pool = player.pool(FOLDER, id, { mode: "fire", capacity: 2, renderOrder: 15 });
      if (role === "pillar" && !id.includes("field")) pool.attach({ ...e.meta, pivot: FOOT }, e.texture, e.controls);
      pool.vignette = 0.35;
      this.pools.set(id, pool);
      this.roles.set(id, role);
      for (const fn of this.listeners) fn();
    });
    if (host.captionHost !== null) {
      const c = document.createElement("div");
      c.style.cssText = "position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:20;pointer-events:none;padding:10px 22px 12px;"
        + "border-radius:10px;background:rgba(8,10,16,.72);border:1px solid rgba(220,228,240,.25);color:#f2f4f8;text-align:center;"
        + "font:15px system-ui;opacity:0";
      host.captionHost.append(c);
      this.caption = c;
    }
  }

  /** Calls `fn` whenever a clip arrives (the panel's list rebuilds). */
  onList(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** The clips it can play: the catalogue's order, then any other pillar or ultimate the manifest has. */
  ids(): string[] {
    const known = SHOWCASE.filter((it) => this.pools.has(it.id)).map((it) => it.id);
    const other = [...this.pools.keys()].filter((id) => !SHOWCASE.some((it) => it.id === id)).sort();
    return [...known, ...other];
  }

  /** The catalogue entry of `id` (an id outside it: its id as its name). */
  item(id: string): ShowcaseItem {
    return SHOWCASE.find((it) => it.id === id)
      ?? { id, kind: this.roles.get(id) === "pillar" ? "pillar" : "ultimate", element: ["", ""], en: id, vi: "", sound: "", light: "#ffffff" };
  }

  /** The one before the last played (Shift+8). */
  prev(): string | null {
    const ids = this.ids();
    if (ids.length === 0) return null;
    return this.play(ids[(Math.max(0, this.turn) - 1 + ids.length) % ids.length]);
  }

  /** Plays `id` (none: the next in order); returns what it played, or null when it has no such clip loaded. */
  play(id?: string): string | null {
    const ids = this.ids();
    if (ids.length === 0 || (id !== undefined && !this.pools.has(id))) return null;
    this.turn = id === undefined ? (this.turn + 1) % ids.length : ids.indexOf(id);
    const pick = ids[this.turn]!;
    const pool = this.pools.get(pick)!;
    if (!pool.ready) return null;
    const meta = pool.meta!;
    const it = this.item(pick);
    const cam = this.host.camera;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // The ground under the screen's centre.
    cam.getWorldDirection(f);
    const t = f.y < -1e-3 ? -cam.position.y / f.y : 30;
    const cx = cam.position.x + f.x * t;
    const cz = cam.position.z + f.z * t;
    const field = it.kind === "ultimate" || pick.includes("field");
    // Fast attack: to the clip's peak frame in ATTACK_S, then the rest over the hold and decay.
    const last = meta.frames - 1;
    const peak = Math.min(last - 1, Math.max(meta.start, meta.peak ?? meta.start));
    const tail = field ? SCENE_S : PILLAR_S;
    const o = peak > meta.start
      ? { frame: meta.start, rate: (peak - meta.start) / (meta.fps * ATTACK_S), slowFrom: peak, slowRate: (last + 1 - peak) / (meta.fps * tail), fadeOut: 0.6, occlude: 0.25, lift: 0 }
      : { frame: meta.start, rate: (last + 1 - meta.start) / (meta.fps * tail), fadeOut: 0.6, occlude: 0.25, lift: 0 };
    let size: number;
    if (field) {
      // Over the ground at the screen's centre, as tall as the view there; drawn over the near ground (its lower half
      // stands behind it in depth).
      v.set(cx, 0, cz);
      const d = v.distanceTo(cam.position);
      size = 2 * d * tan;
      o.lift = d * 0.6;
    } else {
      // On the foe nearest the screen's centre; tall enough that the column leaves the top of the frame.
      const i = this.host.nearest(cx, cz, 30);
      if (i >= 0) this.host.at(i, v);
      else v.set(cx, 0, cz);
      v.y = 0;
      const d = v.distanceTo(cam.position);
      // The column (FOOT[1] of the card above its foot) reaches past the frame's top edge.
      const ndc = p.copy(v).project(cam).y;
      size = THREE.MathUtils.clamp((1.15 * (1 - ndc) * d * tan) / FOOT[1], 8, 40);
      o.lift = 3;
    }
    pool.clear();
    pool.spawn(v, size, o);
    this.host.light(p.set(v.x, 1.5, v.z), it.light, field ? 8 : 6);
    // The ultimate tier's shake and flash on an ultimate; the skill tier's on a pillar.
    const tier = it.kind === "ultimate" ? SCREEN_TIERS.ultimate : SCREEN_TIERS.skill;
    this.host.shake(tier.shakePx, tier.shakeS, tier.rollDeg);
    this.host.accent(it.kind === "ultimate" ? 0.6 : 0.35);
    this.sound(it);
    this.show(it, ids);
    return pick;
  }

  /** Its Firefly sound, take 1 (dev lab only); the previous one stops. */
  private sound(it: ShowcaseItem): void {
    if (it.sound === "" || typeof Audio === "undefined") return;
    this.audio?.pause();
    const a = new Audio(SOUND_BASE + it.sound + "/take1.wav");
    a.volume = 0.85;
    void a.play().catch(() => undefined);
    this.audio = a;
  }

  /** The caption: its English name, its Vietnamese name, kind and element, where it is in the list. */
  private show(it: ShowcaseItem, ids: readonly string[]): void {
    const c = this.caption;
    if (c === null) return;
    const kind = it.kind === "pillar" ? "Cột trụ" : "Tuyệt kỹ";
    const element = it.element[0] === "" ? "" : ` · Hệ ${it.element[1]} (${it.element[0]})`;
    const en = document.createElement("div");
    en.textContent = it.en;
    en.style.cssText = 'font:italic 700 30px "Cormorant Garamond", Georgia, serif;letter-spacing:.02em';
    const vi = document.createElement("div");
    vi.textContent = (it.vi === "" ? "" : it.vi + " · ") + kind + element;
    vi.style.cssText = "margin-top:2px;font:600 17px system-ui";
    const nav = document.createElement("div");
    nav.textContent = `${ids.indexOf(it.id) + 1} / ${ids.length} · phím 8: tiếp · Shift+8: lùi lại · lớp video, chưa nối vào trận`;
    nav.style.cssText = "margin-top:4px;font:12px system-ui;opacity:.7";
    c.replaceChildren(en, vi, nav);
    c.style.transition = "none";
    c.style.opacity = "1";
    clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => {
      c.style.transition = `opacity ${CAPTION_FADE_S}s`;
      c.style.opacity = "0";
    }, CAPTION_S * 1000);
  }
}
