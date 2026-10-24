// Source: games/space-typing@survival-s0 src/feedback/audio-cues.ts (kit copy: per-game profile, shared context, generic bus and method names, wood keys; log fixes in shared/game-kit/DRIFT.md)
/**
 * Combat sounds made in code (SURVIVAL_MODE_PLAN.md 7; dragon-hold 05 §7; no
 * files), on buses keys / shots / hits / kills / alerts into a limiter:
 * - a hit is a sharp head (filtered noise) and a body (a falling tone), with
 *   a low thump from T2 and a tail from T4; hits are gathered for 30–45 ms
 *   and play as one, louder for more;
 * - kills confirm with a crisp crack, and kills close together climb a
 *   pentatonic scale instead of piling up; at most 4 bursts in 120 ms;
 * - keys by the profile: "click" (5 variants, ±3 % pitch) or "wood" (a knock
 *   and a small bell, a semitone up a letter of the word, at most keySteps;
 *   starts at once, under 60 ms); a wrong key is a small dull knock, never a
 *   buzzer;
 * - while a word is pronounced (kit speech's event) shots and hits duck by
 *   the profile's duckDb (80 ms down, 400 ms back).
 * Nothing plays before resume() (browsers start audio on a gesture).
 */
import { SHIP, type FeedbackProfile } from "./profiles";
import { tier } from "./tiers";

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const HIT_GATHER_MS = 38;
const BURSTS = { max: 4, windowMs: 120 } as const;
const DUCK = { downS: 0.08, upS: 0.4 } as const;

export type CueBus = "keys" | "shots" | "hits" | "kills" | "alerts";
export const CUE_BUS_GAIN: Readonly<Record<CueBus, number>> = { keys: 0.55, shots: 0.32, hits: 0.6, kills: 0.55, alerts: 0.8 };

/** The pitch ratio of a "wood" key at letter `step` (0 = the word's first): a semitone a letter, at most `maxSteps`. */
export const keyStepRatio = (step: number, maxSteps: number): number => 2 ** (Math.max(0, Math.min(maxSteps, step | 0)) / 12);

/** The ratio of the pentatonic note `step` (0 … 12) above the root. */
export const pentatonicRatio = (step: number): number => 2 ** (SCALE[Math.max(0, Math.min(SCALE.length - 1, step | 0))]! / 12);

export type AudioCuesOptions = {
  /** Master volume 0 … 1. */
  volume?: number;
  profile?: FeedbackProfile;
  /** A context to share (kit/audio's), made on resume() when a function; default: its own. */
  context?: AudioContext | (() => AudioContext);
  /** Where the limiter plays into (a kit/audio bus); default the context's destination. */
  destination?: AudioNode | (() => AudioNode);
  /** Where the pronunciation event comes from: default `window` when there is one; null: none. */
  events?: EventTarget | null;
  /** Pitch and noise variation. */
  random?: () => number;
};

export class AudioCues {
  readonly profile: FeedbackProfile;
  private ctx: AudioContext | null = null;
  private own = false;
  private master: GainNode | null = null;
  private readonly buses = new Map<CueBus, GainNode>();
  private noise: AudioBuffer | null = null;
  private volume: number;
  muted = false;
  private readonly pending = { count: 0, tier: 0, pan: 0, at: 0 };
  private readonly chain = { step: 0, last: -1e9 };
  private readonly bursts: number[] = [];
  private readonly random: () => number;
  private readonly events: EventTarget | null;
  private readonly onSpeech = (event: Event): void => this.duck((event as CustomEvent<{ active?: boolean }>).detail?.active === true);

  constructor(private readonly options: AudioCuesOptions = {}) {
    this.profile = options.profile ?? SHIP;
    this.volume = Math.max(0, Math.min(1, options.volume ?? 0.7));
    this.random = options.random ?? Math.random;
    this.events = options.events !== undefined ? options.events : typeof window === "undefined" ? null : window;
    this.events?.addEventListener(this.profile.audio.pronunciationEvent, this.onSpeech);
  }

  /** Browsers start audio only after a gesture: call on the first key or click. */
  resume(): void {
    if (this.ctx === null) {
      const given = this.options.context;
      const ctx = given === undefined ? new AudioContext() : typeof given === "function" ? given() : given;
      this.own = given === undefined;
      this.ctx = ctx;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      const target = this.options.destination;
      this.master = new GainNode(ctx, { gain: this.volume });
      this.master.connect(limiter).connect(target === undefined ? ctx.destination : typeof target === "function" ? target() : target);
      for (const bus of Object.keys(CUE_BUS_GAIN) as CueBus[]) {
        const node = new GainNode(ctx, { gain: CUE_BUS_GAIN[bus] });
        node.connect(this.master);
        this.buses.set(bus, node);
      }
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = this.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get ready(): boolean {
    return this.ctx !== null && !this.muted;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master !== null) this.master.gain.value = this.volume;
  }

  /** Shots and hits down by the profile's duckDb while a word is spoken. */
  duck(active: boolean): void {
    if (this.ctx === null) return;
    const t = this.ctx.currentTime;
    const down = 10 ** (-this.profile.audio.duckDb / 20);
    for (const bus of ["shots", "hits"] as const) {
      const gain = this.buses.get(bus)!.gain;
      gain.cancelScheduledValues(t);
      gain.setValueAtTime(gain.value, t);
      gain.linearRampToValueAtTime(CUE_BUS_GAIN[bus] * (active ? down : 1), t + (active ? DUCK.downS : DUCK.upS));
    }
  }

  private out(bus: CueBus, pan: number): AudioNode {
    const ctx = this.ctx!;
    const panner = new StereoPannerNode(ctx, { pan: Math.max(-0.8, Math.min(0.8, pan)) });
    panner.connect(this.buses.get(bus)!);
    return panner;
  }

  /** A tone `freq` → `to` Hz for `seconds`, with a 2 ms attack and an exponential fall. */
  private tone(bus: AudioNode, delay: number, seconds: number, gain: number, freq: number, to: number, type: OscillatorType = "sine"): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const env = new GainNode(ctx, { gain: 0.0001 });
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    const osc = new OscillatorNode(ctx, { type, frequency: freq });
    osc.frequency.setValueAtTime(freq, t);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + seconds);
    osc.connect(env).connect(bus);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  /** Filtered noise for `seconds`. */
  private hiss(bus: AudioNode, delay: number, seconds: number, gain: number, cutoff: number, type: BiquadFilterType, q = 0.8): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const env = new GainNode(ctx, { gain: 0.0001 });
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    const source = new AudioBufferSourceNode(ctx, { buffer: this.noise, playbackRate: 0.8 + this.random() * 0.4 });
    const filter = new BiquadFilterNode(ctx, { type, frequency: cutoff, Q: q });
    source.connect(filter).connect(env).connect(bus);
    source.start(t, this.random() * 0.5);
    source.stop(t + seconds + 0.02);
  }

  /**
   * A typed key: `letter` 0–25, `step` its place in the word (0 = first; the
   * "wood" keys climb with it). A wrong key is a dull knock about 12 dB down.
   */
  key(ok: boolean, letter: number, step = 0): void {
    if (!this.ready) return;
    const bus = this.out("keys", 0);
    const wood = this.profile.audio.keys === "wood";
    if (!ok) {
      if (wood) {
        this.tone(bus, 0, 0.05, 0.06, 190, 130, "triangle");
        this.hiss(bus, 0, 0.03, 0.03, 500, "lowpass");
      } else {
        this.tone(bus, 0, 0.07, 0.22, 150, 110, "sine");
        this.hiss(bus, 0, 0.04, 0.08, 600, "lowpass");
      }
      return;
    }
    const jitter = 1 + (this.random() - 0.5) * 0.06;
    if (wood) {
      // A knock and a small bell; the bell climbs a semitone a letter.
      const rise = keyStepRatio(step, this.profile.audio.keySteps);
      this.hiss(bus, 0, 0.012, 0.14, 1900 * jitter, "bandpass", 2.2);
      this.tone(bus, 0, 0.04, 0.16, 560 * jitter, 380 * jitter, "triangle");
      this.tone(bus, 0.002, 0.055, 0.07, 1318.5 * rise, 1318.5 * rise, "sine");
      return;
    }
    const pitch = jitter * [1, 1.06, 0.94, 1.12, 0.89][letter % 5]!;
    this.hiss(bus, 0, 0.018, 0.16, 4200 * pitch, "bandpass", 1.6);
    this.tone(bus, 0, 0.03, 0.08, 1850 * pitch, 1500 * pitch, "triangle");
  }

  /** A word done: a clack and a bright note on `rootHz` (the music's key), a fifth above it too when perfect. */
  word(perfect: boolean, pan = 0, rootHz = 1046.5): void {
    if (!this.ready) return;
    const bus = this.out("alerts", pan);
    const note = perfect ? rootHz * pentatonicRatio(3) : rootHz;
    this.hiss(bus, 0, 0.05, 0.28, 1800, "bandpass", 2);
    this.tone(bus, 0.015, 0.09, 0.2, 220, 160, "square");
    this.tone(bus, 0.03, 0.22, 0.16, note, note, "sine");
    if (perfect) this.tone(bus, 0.09, 0.3, 0.12, rootHz * 2, rootHz * 2, "sine");
  }

  /** A round leaving its source (a fireball, a bolt). */
  shot(pan: number): void {
    if (!this.ready) return;
    const bus = this.out("shots", pan);
    this.hiss(bus, 0, 0.035, 0.22, 2600, "highpass");
    this.tone(bus, 0, 0.05, 0.12, 900, 260, "sawtooth");
  }

  /** A beam or a breath opening (a rising sweep and a hum), or closing. */
  beam(start: boolean, pan: number): void {
    if (!this.ready) return;
    const bus = this.out("shots", pan);
    if (start) {
      this.tone(bus, 0, 0.35, 0.22, 180, 720, "sawtooth");
      this.hiss(bus, 0, 0.4, 0.18, 1200, "bandpass", 3);
      this.tone(bus, 0.02, 0.6, 0.18, 70, 55, "sine");
    } else this.tone(bus, 0, 0.25, 0.12, 400, 120, "triangle");
  }

  /** One pulse of a beam (or a trap's burn) on `hits` targets: a soft crackle. */
  pulse(pan: number, hits: number): void {
    if (!this.ready || hits === 0) return;
    const bus = this.out("hits", pan);
    this.hiss(bus, 0, 0.05, Math.min(0.25, 0.08 + hits * 0.012), 3200, "bandpass", 0.9);
  }

  /** A hit of tier `t` (gathered for ~38 ms and played once); `now` in ms. */
  hit(t: number, pan: number, now: number): void {
    const p = this.pending;
    if (p.count === 0) p.at = now;
    p.count += 1;
    p.tier = Math.max(p.tier, t);
    p.pan += pan;
    if (now - p.at >= HIT_GATHER_MS) this.flush(now);
  }

  /** Plays the gathered hits; call once a frame. */
  flush(now: number): void {
    const p = this.pending;
    if (p.count === 0 || now - p.at < HIT_GATHER_MS * 0.8) return;
    if (this.ready) {
      const row = tier(p.tier, this.profile.tiers);
      const bus = this.out("hits", p.pan / p.count);
      const loud = Math.min(1, 0.45 + Math.log2(1 + p.count) * 0.18);
      this.hiss(bus, 0, 0.022, 0.35 * loud, 5200, "highpass");
      this.tone(bus, 0, 0.07 + p.tier * 0.015, 0.28 * loud, 520 + this.random() * 60, 150, "triangle");
      if (row.bass) this.tone(bus, 0, 0.16, 0.5 * loud, 120, 42, "sine");
      if (row.tail) this.hiss(bus, 0.02, 0.5, 0.2, 700, "lowpass");
    }
    p.count = 0;
    p.tier = 0;
    p.pan = 0;
  }

  /** `count` kills at `now` ms: a burst (at most 4 in 120 ms) and a note that climbs while kills keep coming. `light`: a small foe's softer crack. */
  kill(count: number, pan: number, light: boolean, now: number): void {
    if (!this.ready || count === 0) return;
    while (this.bursts.length > 0 && now - this.bursts[0]! > BURSTS.windowMs) this.bursts.shift();
    if (this.bursts.length >= BURSTS.max) return;
    this.bursts.push(now);
    this.chain.step = now - this.chain.last < 1000 ? Math.min(SCALE.length - 1, this.chain.step + 1) : 0;
    this.chain.last = now;
    const bus = this.out("kills", pan);
    const note = 660 * pentatonicRatio(this.chain.step);
    const size = Math.min(1, 0.55 + Math.sqrt(count) * 0.15);
    this.hiss(bus, 0, 0.09, 0.4 * size, light ? 900 : 2400, "bandpass", 1.2);
    this.tone(bus, 0, 0.12, 0.3 * size, light ? 160 : 240, 50, "sine");
    this.tone(bus, 0.01, 0.16, 0.13, note, note, "triangle");
    this.tone(bus, 0.012, 0.12, 0.06, note * 2.01, note * 2.01, "sine");
  }

  /** The defended thing is hurt: a low boom and a short warning blip. */
  hurt(heavy: boolean): void {
    if (!this.ready) return;
    const bus = this.out("alerts", 0);
    this.tone(bus, 0, heavy ? 0.45 : 0.3, 0.55, 95, 32, "sine");
    this.hiss(bus, 0, 0.3, 0.3, 500, "lowpass");
    this.tone(bus, 0.05, 0.12, 0.08, 880, 660, "square");
  }

  /** End of the run: up for a win, down for a loss. */
  end(won: boolean): void {
    if (!this.ready) return;
    const bus = this.out("alerts", 0);
    const notes = won ? [523.25, 659.25, 783.99, 1046.5] : [392, 329.63, 261.63, 196];
    notes.forEach((freq, index) => this.tone(bus, index * 0.12, 0.45, 0.2, freq, freq, "triangle"));
  }

  /** Stops listening; closes the context when it is its own. */
  dispose(): void {
    this.events?.removeEventListener(this.profile.audio.pronunciationEvent, this.onSpeech);
    this.master?.disconnect();
    if (this.own && this.ctx !== null) void this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.buses.clear();
  }
}
