/**
 * HUD (canon §6.6): in a match only Sinh lực (the khiên drawn over it),
 * Chân Nguyên, Trận Lực, and the Thế bar while an elite, a general or the
 * Thú Vương is on the field; plus the Linh Sa chip the motes fly to (the
 * currency, read from the seat's wallet in the world, D34) and short notices
 * (wave start, boss, phá thế, node taken, Linh Dịch, a cracked Trận Trụ,
 * down, Trận Lực under 30 %, a rejected shop or đan phù command). Sinh lực,
 * khiên and down come from the `local` layer (FrameInfo.local), never the
 * world. DOM over the canvas: Trận Lực, Thế and the notices top centre;
 * Sinh lực, Chân Nguyên and Linh Sa bottom left just above the Bàn Quyết
 * (screen-zones.ts), so the far corners with the gates and sky entries stay
 * clear (canon D48); never over the Bàn Quyết; it never shakes. The view
 * model `hudView` is pure and tested in node.
 * Thế bar target (canon names "the nearest"; this round's reading, đề xuất
 * của vòng này, chờ chủ dự án xác nhận): the Thú Vương while it lives, else
 * the seat's soft target when it has Thế, else the elite or general nearest
 * the Trận Tâm (the one whose Ấn comes first, canon §10.3).
 * Owner: Lane 6.
 */
import type { FrameInfo, Presenter } from "../app/contracts";
import { BEASTS, GENERALS } from "../content/data/beasts";
import { BOSSES } from "../content/data/boss";
import { ELITE_TRAITS } from "../content/data/elites";
import { CHAN_NGUYEN, PLAYER, SIM } from "../content/rules";
import type { BeastState, LocalState, SimCommandType, SimEvent, SpeciesId, World } from "../content/types";
import { el, setClass, setShown, setText, setVar, viNumber } from "./skin";
import { HEART_LOW_PCT, PALETTE } from "./styles/palette";

// ── View model (pure) ───────────────────────────────────────────────────────

export interface PostureView {
  readonly name: string;
  readonly value: number;
  readonly max: number;
  readonly broken: boolean;
  /** No Thế loss for 15 s after a break (canon §10.7). */
  readonly immune: boolean;
  readonly boss: boolean;
}

export interface HudView {
  readonly hp: number;
  readonly hpMax: number;
  readonly shield: number;
  readonly down: boolean;
  /** Whole seconds until the player stands up (0 when standing). */
  readonly downLeftS: number;
  /** Chân Nguyên 0–100 (canon §6.6). */
  readonly chanNguyen: number;
  readonly heart: number;
  readonly heartMax: number;
  /** Trận Lực under 30 % (canon §22 warning). */
  readonly heartLow: boolean;
  readonly posture: PostureView | null;
  readonly linhSa: number;
}

const NAMES = { ...BEASTS, ...GENERALS, ...BOSSES } as Partial<Record<SpeciesId, { name: string }>>;

/** A species' display name (data tables of Lane 5). */
export function speciesName(species: SpeciesId): string {
  return NAMES[species]?.name ?? species;
}

/** The beast whose Thế the HUD shows (see the file comment), or null. */
export function postureTarget(world: World, seat: number): BeastState | null {
  const list = world.beasts.list;
  let best: BeastState | null = null;
  let bestD = Infinity;
  for (const beast of list) {
    if (!beast.alive || beast.freed || beast.posture === null) continue;
    if (beast.boss) return beast;
  }
  const soft = world.seats[seat]?.softTarget ?? null;
  if (soft !== null) {
    const beast = list[soft.slot];
    if (beast !== undefined && beast.alive && beast.serial === soft.serial && beast.posture !== null) return beast;
  }
  for (const beast of list) {
    if (!beast.alive || beast.freed || beast.posture === null || (beast.elite === null && !beast.general)) continue;
    // View-only distance (the rules' "nearest the heart" is field.ts heartDistance; the HUD only picks a bar).
    const d = beast.x * beast.x + beast.z * beast.z;
    if (d < bestD || (d === bestD && best !== null && beast.serial < best.serial)) {
      best = beast;
      bestD = d;
    }
  }
  return best;
}

/** The name on the Thế bar: "Phong Lang · Cuồng" for an elite. */
export function postureName(beast: BeastState): string {
  const base = speciesName(beast.species);
  return beast.elite !== null ? base + " · " + (ELITE_TRAITS[beast.elite]?.name ?? beast.elite) : base;
}

/** What the HUD shows for `seat` now (pure: reads the world and the local layer). */
export function hudView(world: World, local: LocalState, seat: number): HudView {
  const formation = world.formation;
  const heart = formation?.heart ?? 0;
  const heartMax = formation?.heartMax ?? 0;
  const target = postureTarget(world, seat);
  const posture = target?.posture ?? null;
  return {
    hp: local.hp,
    hpMax: local.hpMax,
    shield: local.shield,
    down: local.down,
    downLeftS: local.down ? Math.max(0, Math.ceil((local.downUntil - local.tick) / SIM.tickHz)) : 0,
    chanNguyen: Math.floor((world.seats[seat]?.chanNguyenPm ?? 0) / 1000),
    heart,
    heartMax,
    heartLow: heartMax > 0 && heart * 100 < heartMax * HEART_LOW_PCT,
    posture:
      target !== null && posture !== null
        ? { name: postureName(target), value: posture.value, max: posture.max, broken: posture.brokenUntil > world.tick, immune: posture.immuneUntil > world.tick, boss: target.boss }
        : null,
    linhSa: world.economy?.wallets?.[seat]?.linhSa ?? 0,
  };
}

export type NoticeKind = "info" | "warn" | "good" | "soft";

export interface NoticeText {
  readonly text: string;
  readonly kind: NoticeKind;
}

/** Commands whose rejection the player should hear about (the rest are routine, e.g. đánh nền out of range). */
const TOLD: ReadonlySet<SimCommandType> = new Set(["buy", "place", "upgrade", "sell", "consumable", "start", "continue", "loadout"]);

/** Reasons of `rejected` in Vietnamese (Lane 4's sim/shop.ts and sim/consumables.ts name them; unknown ones get a plain line). */
const REASONS: Readonly<Record<string, string>> = {
  phase: "Chưa làm được lúc này",
  money: "Không đủ Linh Sa",
  "linh-sa": "Không đủ Linh Sa",
  funds: "Không đủ Linh Sa",
  cooldown: "Đan phù đang hồi",
  down: "Đang gục",
  empty: "Ô trống",
  full: "Ô đan phù đã đầy",
  occupied: "Ô đã có cơ quan",
  taken: "Ô đã có cơ quan",
  slot: "Ô không hợp",
  kind: "Cơ quan này không đặt được ở ô này",
  item: "Không có món này",
  target: "Không có đích trong tầm",
  "max-level": "Đã nâng tối đa",
  max: "Đã nâng tối đa",
  level: "Đã nâng tối đa",
  stack: "Đã đủ 3 viên",
  seat: "Ghế không hợp lệ",
};

const PILLAR_NAMES: Readonly<Record<string, string>> = { west: "Tây", east: "Đông" };

/** The notice an event earns for `seat` (null: none). */
export function noticeFor(event: SimEvent, seat: number): NoticeText | null {
  switch (event.type) {
    case "wave-start":
      return { text: "Đợt " + event.wave + " / " + event.waves, kind: "info" };
    case "phase":
      if (event.phase === "lull") return { text: "Lặng trước Thú Vương", kind: "info" };
      if (event.phase === "boss") return { text: "Thú Vương xuất hiện", kind: "warn" };
      return null;
    case "posture":
      return event.stage === "break" ? { text: "Phá thế! Sát thương × 1,5", kind: "good" } : null;
    case "formation":
      if (event.what === "node-off") return { text: "Tâm nhãn bị chiếm: gõ Tẩy", kind: "warn" };
      if (event.what === "node-on") return { text: "Tâm nhãn sáng lại", kind: "good" };
      if (event.what === "linh-dich") return { text: "Linh Dịch: Trận Lực hồi", kind: "good" };
      return null;
    case "pillar":
      return event.stage === "crack" ? { text: "Trận Trụ " + (PILLAR_NAMES[event.pillar] ?? event.pillar) + " đã nứt", kind: "warn" } : null;
    case "player-down":
      return event.seat === seat ? { text: "Gục: dậy ở Trận Tâm sau " + PLAYER.downMs / 1000 + " s", kind: "warn" } : null;
    case "player-up":
      return event.seat === seat ? { text: "Đã đứng dậy", kind: "soft" } : null;
    case "rejected":
      if (!TOLD.has(event.command)) return null;
      return { text: REASONS[event.reason] ?? "Không làm được: " + event.reason, kind: "soft" };
    default:
      return null;
  }
}

/** Seconds a notice stays (wall time). */
export const NOTICE_S = { info: 2.2, warn: 3, good: 2.2, soft: 1.8 } as const;
const NOTICE_MAX = 3;

// ── The HUD ────────────────────────────────────────────────────────────────

export interface HudPresenter extends Presenter {
  /** The last view drawn (scenarios, tests). */
  readonly view: HudView | null;
  /** The Linh Sa chip's centre in CSS px (Linh Sa motes fly there), or null before the first frame. */
  linhSaAnchor(): { readonly x: number; readonly y: number } | null;
  /** A notice from the app (pause, focus, …). */
  notify(text: string, kind?: NoticeKind): void;
}

interface Bar {
  readonly root: HTMLElement;
  readonly fill: HTMLElement;
  readonly over: HTMLElement | null;
  readonly num: HTMLElement;
}

function bar(doc: Document, label: string, colour: string, over = false): Bar {
  const root = el(doc, "div", "ic-hud__row");
  const name = el(doc, "span", "ic-hud__label", label);
  const track = el(doc, "div", "ic-bar");
  const fill = el(doc, "div", "ic-bar__fill");
  fill.style.setProperty("--c", colour);
  track.append(fill);
  let overNode: HTMLElement | null = null;
  if (over) {
    overNode = el(doc, "div", "ic-bar__over");
    track.append(overNode);
  }
  const num = el(doc, "span", "ic-hud__num");
  root.append(name, track, num);
  return { root, fill, over: overNode, num };
}

const ratio = (value: number, max: number): string => (max > 0 ? Math.max(0, Math.min(1, value / max)) : 0).toFixed(3);

/** The HUD for this machine's `seat` in `host` (#ic-overlay). */
export function createHud(host: HTMLElement, seat: number): HudPresenter {
  const doc = host.ownerDocument;
  const root = el(doc, "div", "ic-hud");
  root.dataset.ui = "hud";
  const left = el(doc, "div", "ic-hud__left");
  const self = el(doc, "section", "ic-panel ic-hud__self");
  self.dataset.keepout = "";
  self.setAttribute("aria-label", "Người chơi");
  const life = bar(doc, "Sinh lực", PALETTE.life, true);
  const chan = bar(doc, "Chân Nguyên", PALETTE.chanNguyen);
  const down = el(doc, "div", "ic-hud__down");
  self.append(life.root, chan.root, down);
  const money = el(doc, "div", "ic-panel ic-hud__money");
  money.dataset.keepout = "";
  const coin = el(doc, "span", "ic-coin");
  const moneyText = el(doc, "span", "", "0");
  money.append(coin, el(doc, "span", "", "Linh Sa"), moneyText);
  left.append(self, money);
  const top = el(doc, "div", "ic-hud__top");
  const heartPanel = el(doc, "section", "ic-panel ic-hud__heart");
  heartPanel.dataset.keepout = "";
  const heartHead = el(doc, "div", "ic-hud__head");
  const heartNum = el(doc, "span", "ic-hud__num");
  heartHead.append(el(doc, "span", "ic-hud__label", "Trận Lực"), heartNum);
  const heartTrack = el(doc, "div", "ic-bar");
  const heartFill = el(doc, "div", "ic-bar__fill");
  heartFill.style.setProperty("--c", PALETTE.heart);
  heartTrack.append(heartFill);
  heartPanel.append(heartHead, heartTrack);
  const posturePanel = el(doc, "section", "ic-panel ic-hud__posture");
  posturePanel.hidden = true;
  const postureHead = el(doc, "div", "ic-hud__head");
  const postureName = el(doc, "span", "ic-hud__label");
  const postureNum = el(doc, "span", "ic-hud__num");
  postureHead.append(postureName, postureNum);
  const postureTrack = el(doc, "div", "ic-bar");
  const postureFill = el(doc, "div", "ic-bar__fill");
  postureFill.style.setProperty("--c", PALETTE.posture);
  postureTrack.append(postureFill);
  posturePanel.append(postureHead, postureTrack);
  const notices = el(doc, "div", "ic-notices");
  notices.setAttribute("role", "status");
  notices.setAttribute("aria-live", "polite");
  top.append(heartPanel, posturePanel, notices);
  root.append(left, top);
  host.append(root);

  let last: HudView | null = null;
  let nowS = 0;
  let wasLow = false;
  let lastMoney = -1;
  let pulse = 0;
  const live: { node: HTMLElement; until: number }[] = [];

  const push = (text: string, kind: NoticeKind): void => {
    // Before the first frame the page clock stands in for the frame's.
    const now = nowS > 0 ? nowS : (globalThis.performance?.now() ?? 0) / 1000;
    // The same line twice in a row only refreshes its time.
    const same = live.find((item) => item.node.textContent === text);
    if (same) {
      same.until = now + NOTICE_S[kind];
      return;
    }
    const node = el(doc, "div", "ic-panel ic-notice is-" + kind, text);
    notices.append(node);
    live.push({ node, until: now + NOTICE_S[kind] });
    while (live.length > NOTICE_MAX) live.shift()!.node.remove();
  };

  return {
    get view() {
      return last;
    },
    linhSaAnchor() {
      const r = coin.getBoundingClientRect();
      return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    },
    notify(text: string, kind: NoticeKind = "info"): void {
      push(text, kind);
    },
    onEvents(events: readonly SimEvent[], _world: World): void {
      for (const event of events) {
        const notice = noticeFor(event, seat);
        if (notice !== null) push(notice.text, notice.kind);
        if (event.type === "linh-sa" && event.seat === seat && event.delta > 0) pulse = 0.35;
      }
    },
    frame(world: World, info: FrameInfo): void {
      nowS = info.now / 1000;
      const view = hudView(world, info.local, seat);
      last = view;
      setVar(life.fill, "--v", ratio(view.hp, view.hpMax));
      if (life.over) setVar(life.over, "--s", ratio(view.shield, view.hpMax));
      setText(life.num, view.shield > 0 ? view.hp + " +" + view.shield : String(view.hp));
      setVar(chan.fill, "--v", ratio(view.chanNguyen, CHAN_NGUYEN.full));
      setText(chan.num, view.chanNguyen + "/" + CHAN_NGUYEN.full);
      setClass(self, "is-down", view.down);
      setText(down, view.down ? "Gục · dậy sau " + view.downLeftS + " s" : "");
      setVar(heartFill, "--v", ratio(view.heart, view.heartMax));
      setVar(heartFill, "--c", view.heartLow ? PALETTE.heartLow : PALETTE.heart);
      setText(heartNum, viNumber(view.heart) + " / " + viNumber(view.heartMax));
      setClass(heartPanel, "is-low", view.heartLow);
      if (view.heartLow && !wasLow) push("Trận Lực dưới " + HEART_LOW_PCT + " %", "warn");
      wasLow = view.heartLow;
      setShown(posturePanel, view.posture !== null);
      if (view.posture !== null) {
        setText(postureName, "Thế · " + view.posture.name);
        setText(postureNum, view.posture.broken ? "Phá thế" : view.posture.value + "/" + view.posture.max);
        setVar(postureFill, "--v", view.posture.broken ? "1" : ratio(view.posture.value, view.posture.max));
        setVar(postureFill, "--c", view.posture.broken ? PALETTE.postureBroken : PALETTE.posture);
        setClass(posturePanel, "is-broken", view.posture.broken);
        setClass(posturePanel, "is-immune", view.posture.immune && !view.posture.broken);
      }
      if (view.linhSa !== lastMoney) {
        lastMoney = view.linhSa;
        setText(moneyText, viNumber(view.linhSa));
      }
      pulse = Math.max(0, pulse - info.dt);
      setClass(money, "is-pulse", pulse > 0);
      for (let k = live.length - 1; k >= 0; k -= 1) {
        if (live[k]!.until > nowS) continue;
        live[k]!.node.remove();
        live.splice(k, 1);
      }
    },
    dispose(): void {
      root.remove();
    },
  };
}
