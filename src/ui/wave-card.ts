/**
 * Wave card (canon §4.1, §13.3; M0A_PLAN §6.6): what the next wave brings,
 * gate by gate (A, B, the sky route): each family's silhouette icon (shape
 * before colour, canon §24) and head count; marks: wing = flyer, hammer =
 * node capture (Thiết Giáp Trư), crown = thú tướng, horn = Thú Vương; a peak
 * strip (the wave's peaks as bright blocks, each group's start as a tick).
 * Shown in prep, the wave warning, breaks (the next wave) and the lull (the
 * Vương's card); hidden while a wave runs. The footer says when it starts
 * and what Enter does. It picks its spot a few times a second (top right,
 * bottom right above the Bàn Quyết, top left) so it covers no corridor, sky
 * route, mechanism slot or panel when it can (screen-zones.ts), and never
 * reaches the Bàn Quyết band. The summary is pure and tested in node.
 * Owner: Lane 6.
 */
import type { FrameInfo, Presenter, Projector } from "../app/contracts";
import { BEASTS, GENERALS } from "../content/data/beasts";
import { BOSSES } from "../content/data/boss";
import { PRESETS, SIM } from "../content/rules";
import type { BeastDef, GateId, Gait, Phase, SimEvent, SpeciesId, StageDef, World } from "../content/types";
import { CROWD_LOOKS } from "../view/crowd";
import { chooseSpot, keepoutRects, publishZones, screenZones, type Rect } from "./screen-zones";
import { el, icon, setShown, setText, type CardMark } from "./skin";

// ── Pure summary ────────────────────────────────────────────────────────────

export interface FoeTally {
  readonly species: SpeciesId;
  readonly name: string;
  readonly gait: Gait;
  readonly colour: string;
  count: number;
  elite: boolean;
  readonly marks: readonly CardMark[];
}

export interface GateTally {
  readonly gate: GateId;
  readonly label: string;
  readonly foes: FoeTally[];
  count: number;
}

export interface WaveSummary {
  /** Wave number (1-based); 0 is the Thú Vương's card. */
  readonly n: number;
  readonly waves: number;
  readonly gates: readonly GateTally[];
  readonly total: number;
  /** Every mark of the wave once, in the order wing, hammer, crown, horn. */
  readonly marks: readonly CardMark[];
  readonly durationMs: number;
  readonly peaks: readonly { readonly atMs: number; readonly lenMs: number }[];
  /** Group start times, ms from the wave start. */
  readonly beats: readonly number[];
}

export const GATE_LABELS: Readonly<Record<GateId, string>> = { A: "Cổng A", B: "Cổng B", sky: "Đường trời" };
const MARK_ORDER: readonly CardMark[] = ["wing", "hammer", "crown", "horn"];
export const MARK_TITLES: Readonly<Record<CardMark, string>> = { wing: "Thú bay", hammer: "Chiếm nhãn", crown: "Thú tướng", horn: "Thú Vương" };

function defOf(species: SpeciesId): BeastDef | undefined {
  return ({ ...BEASTS, ...GENERALS, ...BOSSES } as Partial<Record<SpeciesId, BeastDef>>)[species];
}

/** A family's marks on the card (canon §13.3, M0A_PLAN §6.6). */
export function marksOf(def: Pick<BeastDef, "flying" | "capturesNodes" | "tier">): CardMark[] {
  const out: CardMark[] = [];
  if (def.flying) out.push("wing");
  if (def.capturesNodes) out.push("hammer");
  if (def.tier === "general") out.push("crown");
  if (def.tier === "boss") out.push("horn");
  return out;
}

function tallyOf(species: SpeciesId): FoeTally {
  const def = defOf(species);
  return {
    species,
    name: def?.name ?? species,
    gait: def?.placeholder.gait ?? "quadruped",
    // The colour the crowd draws the family in (one colour per family, canon D27).
    colour: CROWD_LOOKS[species]?.colour ?? def?.placeholder.colour ?? "#cccccc",
    count: 0,
    elite: false,
    marks: def ? marksOf(def) : [],
  };
}

function finish(n: number, waves: number, gates: GateTally[], durationMs: number, peaks: WaveSummary["peaks"], beats: number[]): WaveSummary {
  const used = gates.filter((gate) => gate.count > 0);
  for (const gate of used) gate.foes.sort((a, b) => b.marks.length - a.marks.length || b.count - a.count);
  const marks = MARK_ORDER.filter((mark) => used.some((gate) => gate.foes.some((foe) => foe.marks.includes(mark))));
  return { n, waves, gates: used, total: used.reduce((sum, gate) => sum + gate.count, 0), marks, durationMs, peaks, beats };
}

/** What wave `n` (1-based) of `stage` brings, gate by gate in A, B, sky order; null past the last wave. */
export function summarizeWave(stage: StageDef, n: number): WaveSummary | null {
  const wave = stage.waves[n - 1];
  if (!wave) return null;
  const gates: GateTally[] = (["A", "B", "sky"] as const).map((gate) => ({ gate, label: GATE_LABELS[gate], foes: [], count: 0 }));
  for (const group of wave.groups) {
    const gate = gates.find((item) => item.gate === group.gate)!;
    let tally = gate.foes.find((item) => item.species === group.species);
    if (!tally) {
      tally = tallyOf(group.species);
      gate.foes.push(tally);
    }
    tally.count += group.count;
    tally.elite ||= group.elite !== undefined;
    gate.count += group.count;
  }
  const beats = [...new Set(wave.groups.map((group) => group.atMs))].sort((a, b) => a - b);
  return finish(n, stage.waves.length, gates, wave.durationMs, wave.peaks, beats);
}

/** The Thú Vương's card (canon §10.5: it walks in from gate A after the lull); null on a stage without one. */
export function summarizeBoss(stage: StageDef): WaveSummary | null {
  if (stage.boss === null) return null;
  const gate: GateTally = { gate: "A", label: GATE_LABELS.A, foes: [tallyOf(stage.boss)], count: 1 };
  gate.foes[0]!.count = 1;
  return finish(0, stage.waves.length, [gate], 0, [], []);
}

/** The wave the card shows in `phase` (1-based), 0 for the Vương's card, −1 for none. */
export function cardWave(phase: Phase, waveIndex: number, total: number): number {
  switch (phase) {
    case "prep":
      return 1;
    case "warning":
    case "break":
      return waveIndex + 1 <= total ? waveIndex + 1 : -1;
    case "lull":
      return 0;
    default:
      return -1;
  }
}

/** The peak strip in 0–1 of the wave's length: peak blocks and group ticks. */
export function peakStrip(summary: Pick<WaveSummary, "durationMs" | "peaks" | "beats">): { readonly peaks: readonly { readonly from: number; readonly to: number }[]; readonly beats: readonly number[] } {
  const length = Math.max(1, summary.durationMs);
  const clamp = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  return {
    peaks: summary.peaks.map((peak) => ({ from: clamp(peak.atMs / length), to: clamp((peak.atMs + peak.lenMs) / length) })),
    beats: summary.beats.map((at) => clamp(at / length)),
  };
}

/** The footer line: when the wave starts and what Enter does (canon §4.1, §5.1). */
export function footerText(world: Pick<World, "phase" | "phaseEndsAt" | "tick" | "preset">): { readonly when: string; readonly enter: string } {
  const left = world.phaseEndsAt >= 0 ? Math.max(0, Math.ceil((world.phaseEndsAt - world.tick) / SIM.tickHz)) : -1;
  const waits = PRESETS[world.preset]?.breakMs === "enter";
  switch (world.phase) {
    case "prep":
      return { when: left >= 0 ? "Bắt đầu sau " + left + " s" : "", enter: "Enter: bắt đầu ngay" };
    case "warning":
      return { when: left >= 0 ? "Thú tới sau " + left + " s" : "", enter: "" };
    case "break":
      return { when: left >= 0 ? (waits ? "Tự tiếp sau " + left + " s" : "Đợt kế sau " + left + " s") : "", enter: waits ? "Enter: tiếp" : "" };
    case "lull":
      return { when: left >= 0 ? "Thú Vương tới sau " + left + " s" : "", enter: "" };
    default:
      return { when: "", enter: "" };
  }
}

// ── The card ────────────────────────────────────────────────────────────────

export interface WaveCardPresenter extends Presenter {
  /** The summary shown (null: hidden). */
  readonly summary: WaveSummary | null;
}

export interface WaveCardOptions {
  /** The stage (field zones); default the world's. */
  readonly stage?: StageDef;
  /** The renderer's Projector: the card keeps off corridors and slots. Without it, it stays top right. */
  readonly project?: Projector;
}

export function createWaveCard(host: HTMLElement, options: WaveCardOptions = {}): WaveCardPresenter {
  const doc = host.ownerDocument;
  const card = el(doc, "section", "ic-panel ic-wave");
  card.dataset.ui = "wave-card";
  card.dataset.keepout = "";
  card.hidden = true;
  const head = el(doc, "div", "ic-wave__head");
  const title = el(doc, "span", "ic-wave__title");
  const marks = el(doc, "div", "ic-wave__marks");
  head.append(title, marks);
  const gates = el(doc, "div", "ic-wave__gates");
  const strip = el(doc, "div", "ic-strip");
  strip.title = "Nhịp đợt: khối sáng là đỉnh, vạch là lúc từng toán vào";
  const foot = el(doc, "div", "ic-wave__foot");
  const when = el(doc, "span");
  const enter = el(doc, "span");
  foot.append(when, enter);
  card.append(head, gates, strip, foot);
  host.append(card);

  let summary: WaveSummary | null = null;
  /** The wave on the card (−1 hidden) and the stage it belongs to: a change redraws it. */
  let shownWave = -1;
  let shownStage = "";
  let spot = -1;
  let frames = 0;

  const draw = (next: WaveSummary): void => {
    setText(title, next.n === 0 ? "Thú Vương" : "Đợt " + next.n + " / " + next.waves);
    marks.replaceChildren(...next.marks.map((mark) => icon(doc, mark, MARK_TITLES[mark])));
    gates.replaceChildren(
      ...next.gates.map((gate) => {
        const row = el(doc, "div", "ic-wave__gate");
        const foes = el(doc, "div", "ic-wave__foes");
        for (const foe of gate.foes) {
          const chip = el(doc, "span", "ic-wave__foe" + (foe.elite ? " is-elite" : ""));
          chip.style.setProperty("--fc", foe.colour);
          chip.title = foe.name + (foe.elite ? " (có tinh anh)" : "");
          chip.append(icon(doc, foe.gait, foe.name), el(doc, "span", "", "× " + foe.count));
          for (const mark of foe.marks) chip.append(icon(doc, mark, MARK_TITLES[mark]));
          foes.append(chip);
        }
        row.append(el(doc, "span", "ic-wave__gate-name", gate.label + " · " + gate.count), foes);
        return row;
      }),
    );
    const parts = peakStrip(next);
    strip.replaceChildren(
      ...parts.peaks.map((peak) => {
        const block = el(doc, "span", "ic-strip__peak");
        block.style.left = (peak.from * 100).toFixed(1) + "%";
        block.style.width = ((peak.to - peak.from) * 100).toFixed(1) + "%";
        return block;
      }),
      ...parts.beats.map((beat) => {
        const tick = el(doc, "span", "ic-strip__beat");
        tick.style.left = (beat * 100).toFixed(1) + "%";
        return tick;
      }),
    );
    setShown(strip, next.n > 0);
  };

  const place = (world: World): void => {
    const view = doc.defaultView;
    const width = view?.innerWidth ?? 1280;
    const height = view?.innerHeight ?? 720;
    const fixed = screenZones(width, height);
    const zone = (id: string) => fixed.find((item) => item.id === id)!;
    const cardZone = zone("card");
    const quyet = zone("quyet");
    const rect = card.getBoundingClientRect();
    const w = rect.width || cardZone.width;
    const h = rect.height || cardZone.height;
    // Top right, bottom right above the Bàn Quyết, top left: the first that covers no route, slot or panel.
    const margin = cardZone.y;
    const right = cardZone.x + cardZone.width - w;
    const spots: Rect[] = [
      { x: right, y: margin, w, h },
      { x: right, y: quyet.y - margin - h, w, h },
      { x: margin, y: margin, w, h },
    ];
    let choice = 0;
    if (options.project) {
      const zones = publishZones(host, options.stage ?? world.stage, options.project);
      choice = chooseSpot(spots, zones, keepoutRects(host, card), { w: width, h: height - zone("quyet").height }, spot);
    }
    spot = choice;
    const chosen = spots[choice]!;
    card.style.left = Math.round(chosen.x) + "px";
    card.style.top = Math.round(chosen.y) + "px";
  };

  return {
    get summary() {
      return summary;
    },
    onEvents(_events: readonly SimEvent[], _world: World): void {
      // Drawn from the world's phase each frame.
    },
    frame(world: World, _info: FrameInfo): void {
      const n = cardWave(world.phase, world.waves.index, world.stage.waves.length);
      // Summaries are built only when the card changes wave (no allocation per frame).
      if (n !== shownWave || world.stage.id !== shownStage) {
        shownWave = n;
        shownStage = world.stage.id;
        const next = n < 0 ? null : n === 0 ? summarizeBoss(world.stage) : summarizeWave(world.stage, n);
        summary = next;
        if (next !== null) draw(next);
        setShown(card, next !== null);
        spot = -1;
      }
      if (summary === null) return;
      const foot = footerText(world);
      setText(when, foot.when);
      setText(enter, foot.enter);
      // The spot is checked a few times a second (layout reads are not free).
      if (spot < 0 || frames % 12 === 0) place(world);
      frames += 1;
    },
    dispose(): void {
      card.remove();
    },
  };
}
