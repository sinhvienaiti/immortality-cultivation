/**
 * Event → sound id mapping and a bus mixer that plays nothing (canon §22,
 * M0a, D26, Q6). Each frame's events become sound requests by the canon §22
 * cards (catalog.ts); the mixer applies the canon's limits (≤ 32 voices, 16
 * at Low; one sound ≤ 4 times in 100 ms; a full mixer drops the lowest
 * priority) and only counts and logs what it would have played: no
 * AudioContext, no buffer, no oscillator, no element (tests/audio/** scans
 * this folder). M0b swaps the silent mixer for a real one fed by recorded
 * sounds; the mapping stays.
 * Owner: Lane 6.
 */
import type { FrameInfo, Presenter } from "../app/contracts";
import { AUDIO } from "../content/rules";
import type { SimEvent, World } from "../content/types";
import { HEART_LOW_PCT } from "../ui/styles/palette";
import { soundCard, type AudioBus, type SoundCard } from "./catalog";

/** Telegraph defs (Lane 5 data ids) → the attack's sound. */
const TELEGRAPH_SOUNDS: Readonly<Record<string, string>> = {
  "nham-vien-throw-heart": "vien-throw",
  "nham-vien-throw-node": "vien-throw",
  "hoa-nha-dive-heart": "nha-dive",
  "hoa-nha-dive-node": "nha-dive",
  "thiet-giap-tru-ram": "tru-ram",
  "lang-dau-dan-howl": "general-howl",
  "vuong-goi-dan": "vuong-call",
  "vuong-vo-xe": "vuong-voxe",
  "vuong-thiet-boi-xung": "vuong-charge",
};

const SKILL_SOUNDS: Readonly<Record<string, string | null>> = {
  auto: "kiem-auto",
  volley: "kiem-volley",
  line: "kiem-line",
  "zone-open": "kiem-zone",
  "zone-close": null,
  ultimate: "kiem-ultimate",
};

/** The sound id an event asks for, for this machine's `seat` (null: none). Own actions only for key and skill sounds. */
export function soundFor(event: SimEvent, seat: number, world?: World): string | null {
  switch (event.type) {
    case "word-progress":
      if (event.seat !== seat) return null;
      if (event.result === "lock") return "key-lock";
      if (event.result === "advance") return "key-letter";
      if (event.result === "done") return "key-word";
      if (event.result === "wrong" || event.result === "stray") return "key-wrong";
      return null;
    case "skill-fx":
      return event.seat === seat ? (SKILL_SOUNDS[event.stage] ?? null) : null;
    case "cast":
      // Lưu Quang Bộ has no world event of its own: a resolved ô 3 Cast with the dash chosen.
      return event.seat === seat && event.state === "resolved" && event.slot === 3 && world?.seats[seat]?.loadout.guard === "dash" ? "kiem-dash" : null;
    case "ward":
      if (event.seat !== seat) return null;
      return event.stage === "start" ? "kiem-ward" : event.stage === "block" ? "kiem-ward-block" : null;
    case "hit": {
      const beast = world?.beasts.list[event.beast.slot];
      const big = beast !== undefined && (beast.tier === "medium" || beast.tier === "general" || beast.tier === "boss");
      return big ? "beast-hit-medium" : "beast-hit-small";
    }
    case "death":
      if (event.species === "thiet-boi-lang-vuong") return "vuong-fall";
      return event.tier >= 3 ? "beast-death-medium" : "death-chain";
    case "spawn":
      return event.elite !== null ? "elite-aura" : null;
    case "telegraph":
      return event.stage === "start" ? (TELEGRAPH_SOUNDS[event.def] ?? null) : null;
    case "formation":
      if (event.what === "heart") return "heart-hit";
      if (event.what === "node-off") return "node-off";
      return "node-on";
    case "pillar":
      return "vuong-pillar";
    case "phase":
      if (event.phase === "warning") return "wave-warning";
      if (event.phase === "boss") return "vuong-roar";
      return null;
    case "wave-end":
      return "wave-end";
    case "mechanism":
      if (event.stage === "built" || event.stage === "upgraded") return "ui-buy";
      if (event.stage === "sold") return "ui-sell";
      return null;
    case "linh-sa":
      return event.seat === seat && event.reason === "buy" ? "ui-buy" : null;
    case "rejected":
      return "ui-reject";
    default:
      return null;
  }
}

export interface MixerStats {
  /** Requests, voices it would have started, requests dropped by the limits. */
  requested: number;
  voiced: number;
  dropped: number;
  readonly byBus: Record<AudioBus, number>;
}

interface Voice {
  card: SoundCard;
  until: number;
}

/**
 * A bus mixer that plays nothing (M0a): it keeps the canon §22 limits so the
 * mapping can be judged (how many voices a big wave would ask for), and logs
 * the last requests. `play` returns whether the sound would have played.
 */
export class SilentMixer {
  readonly stats: MixerStats;
  /** The last 64 voiced ids (newest last). */
  readonly log: string[] = [];
  private readonly voices: Voice[] = [];
  private readonly recent = new Map<string, number[]>();

  constructor(readonly maxVoices: number = AUDIO.voices) {
    const byBus = {} as Record<AudioBus, number>;
    for (const bus of AUDIO.buses) byBus[bus] = 0;
    this.stats = { requested: 0, voiced: 0, dropped: 0, byBus };
  }

  /** Voices the mixer holds at `nowMs`. */
  active(nowMs: number): number {
    this.expire(nowMs);
    return this.voices.length;
  }

  play(id: string, nowMs: number): boolean {
    const card = soundCard(id);
    this.stats.requested += 1;
    if (card === undefined) {
      this.stats.dropped += 1;
      return false;
    }
    // One sound ≤ AUDIO.perSoundPer100Ms times in any 100 ms.
    const times = this.recent.get(id) ?? [];
    while (times.length > 0 && nowMs - times[0]! >= 100) times.shift();
    if (times.length >= AUDIO.perSoundPer100Ms) {
      this.stats.dropped += 1;
      return false;
    }
    this.expire(nowMs);
    if (this.voices.length >= this.maxVoices) {
      // Full: the lowest priority (highest number) voice gives way to a more important sound, or the new one is dropped.
      let worst = 0;
      for (let k = 1; k < this.voices.length; k += 1) if (this.voices[k]!.card.priority > this.voices[worst]!.card.priority) worst = k;
      if (this.voices[worst]!.card.priority <= card.priority) {
        this.stats.dropped += 1;
        return false;
      }
      this.voices.splice(worst, 1);
      this.stats.dropped += 1;
    }
    times.push(nowMs);
    this.recent.set(id, times);
    this.voices.push({ card, until: nowMs + card.lengthMs });
    this.stats.voiced += 1;
    this.stats.byBus[card.bus] += 1;
    this.log.push(id);
    if (this.log.length > 64) this.log.shift();
    return true;
  }

  private expire(nowMs: number): void {
    for (let k = this.voices.length - 1; k >= 0; k -= 1) if (this.voices[k]!.until <= nowMs) this.voices.splice(k, 1);
  }
}

export interface SoundHooks extends Presenter {
  readonly mixer: SilentMixer;
}

export interface SoundHooksOptions {
  readonly seat?: number;
  /** AUDIO.voices (32), or AUDIO.voicesLow (16) at Low. */
  readonly voices?: number;
}

/** The silent sound hooks presenter: events → ids → the silent mixer. Nothing is ever heard (canon §22, M0a). */
export function createSoundHooks(options: SoundHooksOptions = {}): SoundHooks {
  const seat = options.seat ?? 0;
  const mixer = new SilentMixer(options.voices ?? AUDIO.voices);
  const pending: string[] = [];
  let heartLow = false;
  return {
    mixer,
    onEvents(events: readonly SimEvent[], world: World): void {
      for (const event of events) {
        const id = soundFor(event, seat, world);
        if (id !== null) pending.push(id);
      }
    },
    frame(world: World, info: FrameInfo): void {
      const formation = world.formation;
      const low = formation !== undefined && formation.heartMax > 0 && formation.heart * 100 < formation.heartMax * HEART_LOW_PCT;
      if (low && !heartLow) pending.push("heart-low");
      heartLow = low;
      for (const id of pending) mixer.play(id, info.now);
      pending.length = 0;
    },
    dispose(): void {
      pending.length = 0;
    },
  };
}
