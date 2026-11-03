// Source: src/kit/audio/scene-audio.ts (kit 0.1.0; games/space-typing/src/scene3d/sfx.ts) (adapted: only the file playback - buffer(), start() - with a bus per sound group and a duck; SceneAudio itself imports kit/audio/dragon-voice, which tests/boundary.test.ts bans from every game file, so it cannot be imported)
/**
 * The skills lab's sound hooks (canon D58 (6): the lab and the demo have
 * sound; dev-only). The bus's events map to recorded files under
 * art-src/lab/audio/<event-id>/ (wav or ogg, made later in Firefly):
 * - cast (the first key of a typed word), release-<slot> then release (the
 *   last key), flyby (only the 8–12 nearest swords: the skills choose them),
 *   impact-flesh, impact-stone, impact-spirit (grouped into 40 ms buckets per
 *   material: the bucket's first blow sounds on its own frame, the rest only
 *   count, and a full bucket adds one heavier, lower take when it closes;
 *   never 500 one-shots), death (50 ms buckets, the same way), world-open, world-climax,
 *   world-close (the ultimate's world change, the finisher, the bell), and
 *   callout-<slot> then callout (the shout);
 * - hush: 40–60 ms of near-silence before a finisher (the buses duck).
 * Files: art-src/lab/audio/manifest.json ({ "<event-id>": ["a.ogg", …] }) when
 * present, else 01–03 .ogg or .wav in each folder, found by HEAD requests
 * (the dev server answers a missing file with its HTML page, so the type is
 * checked). Absent files are silent. Playback is decoded files only, through
 * gain and pan nodes: nothing here synthesizes sound. One event, one frame:
 * the bus calls `on` on the same frame as the body, VFX, camera and hit-stop.
 */
import type { LabEvent } from "./events";

const BASE = "/art-src/lab/audio/";
/** Every event id the lab may play (folders under BASE). */
export const SOUND_IDS = [
  "cast",
  "release",
  "release-auto",
  "release-k1",
  "release-k2",
  "release-guard",
  "release-dash",
  "release-k4",
  "release-k5",
  "release-k7",
  "flyby",
  "impact-flesh",
  "impact-stone",
  "impact-spirit",
  "death",
  "world-open",
  "world-climax",
  "world-close",
  "callout",
  "callout-k2",
  "callout-guard",
  "callout-k4",
  "callout-k5",
  "callout-k7",
] as const;
export type SoundId = (typeof SOUND_IDS)[number];

type Bus = "combat" | "voice" | "world";
const BUS_GAIN: Record<Bus, number> = { combat: 0.8, voice: 0.95, world: 0.85 };
/** Impacts merge into one sound per bucket per material (s); deaths too. */
const IMPACT_BUCKET_S = 0.04;
const DEATH_BUCKET_S = 0.05;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

interface Bucket {
  open: boolean;
  age: number;
  count: number;
  x: number;
  power: number;
}

/**
 * One sound the lab started while recording (fixed-step captures have no live audio, so a video's sound is mixed
 * offline from these: scripts/visual/mix-lab-sound.mjs). `at` is the lab clock (s since `record()`) when it was asked,
 * the start of the frame it belongs to; `gain` includes its bus; a duck has no url.
 */
export interface SoundTake {
  readonly at: number;
  readonly url: string;
  readonly gain: number;
  readonly pan: number;
  readonly rate: number;
  /** A duck of every bus to 8 % for this long (s): the hush before a finisher. */
  readonly duck?: number;
}

export class LabSound {
  enabled = true;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buses = new Map<Bus, GainNode>();
  private readonly files = new Map<string, string[]>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly last = new Map<string, number>();
  private discovered: Promise<void> | null = null;
  private readonly impact: Record<"flesh" | "stone" | "spirit", Bucket> = {
    flesh: { open: false, age: 0, count: 0, x: 0, power: 0 },
    stone: { open: false, age: 0, count: 0, x: 0, power: 0 },
    spirit: { open: false, age: 0, count: 0, x: 0, power: 0 },
  };
  private readonly death: Bucket = { open: false, age: 0, count: 0, x: 0, power: 0 };
  private rr = 0;
  /** What the lab asked for since reset, by id (heard or silent: files may be absent). */
  readonly asked: Record<string, number> = {};
  /** Sounds actually started (a file was there). */
  played = 0;
  /** Recording (captures): the lab clock and what started on it; null when the lab plays live. */
  private clock = 0;
  private recording: SoundTake[] | null = null;
  private readonly lastRecorded = new Map<string, number>();

  /**
   * Starts recording from now (captures): later sounds are logged on the lab clock instead of played. Resolves
   * when the files are known (it finds them without an audio context).
   */
  record(): Promise<void> {
    this.recording = [];
    this.lastRecorded.clear();
    this.clock = 0;
    this.discovered ??= this.discover();
    return this.discovered;
  }

  /** What was recorded since `record()`. */
  takes(): readonly SoundTake[] {
    return this.recording ?? [];
  }

  /** Starts the audio on the first user gesture (browsers block it before). */
  unlock(): void {
    if (this.context !== null) {
      if (this.context.state === "suspended") void this.context.resume();
      return;
    }
    if (typeof AudioContext === "undefined") return;
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(context.destination);
    for (const bus of Object.keys(BUS_GAIN) as Bus[]) {
      const node = context.createGain();
      node.gain.value = BUS_GAIN[bus];
      node.connect(this.master);
      this.buses.set(bus, node);
    }
    this.discovered ??= this.discover();
  }

  /** Finds the files: the manifest, else 01–03 .ogg/.wav per folder. */
  private async discover(): Promise<void> {
    try {
      const r = await fetch(BASE + "manifest.json", { cache: "no-store" });
      if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) {
        const m = (await r.json()) as Record<string, string[]>;
        for (const [id, list] of Object.entries(m)) this.files.set(id, list.map((f) => BASE + id + "/" + f));
        this.preload();
        return;
      }
    } catch {
      // No manifest: probe below.
    }
    await Promise.all(
      SOUND_IDS.map(async (id) => {
        const found: string[] = [];
        for (const n of ["01", "02", "03"]) {
          for (const ext of ["ogg", "wav"]) {
            const url = BASE + id + "/" + n + "." + ext;
            try {
              const head = await fetch(url, { method: "HEAD" });
              const type = head.headers.get("content-type") ?? "";
              if (head.ok && !type.includes("text/html")) {
                found.push(url);
                break;
              }
            } catch {
              // absent
            }
          }
        }
        if (found.length > 0) this.files.set(id, found);
      }),
    );
    this.preload();
  }

  private preload(): void {
    for (const list of this.files.values()) for (const url of list) void this.buffer(url);
  }

  private buffer(url: string): Promise<AudioBuffer | null> {
    const context = this.context;
    if (context === null) return Promise.resolve(null);
    const known = this.loading.get(url);
    if (known !== undefined) return known;
    const load = fetch(url)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(url))))
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        this.buffers.set(url, buffer);
        return buffer;
      })
      .catch(() => null);
    this.loading.set(url, load);
    return load;
  }

  /** Plays one take of `id` (round robin over its files); silent when it has none (yet). */
  private play(id: string, bus: Bus, gain: number, pan = 0, rate = 1, gap = 0.03): boolean {
    this.asked[id] = (this.asked[id] ?? 0) + 1;
    const list = this.files.get(id);
    const recording = this.recording;
    if (recording !== null) {
      // The same choices as live playback (round robin, ±5 % rate, the gap), on the lab clock.
      if (!this.enabled || list === undefined || list.length === 0) return false;
      if (this.clock - (this.lastRecorded.get(id) ?? -Infinity) < gap) return false;
      this.lastRecorded.set(id, this.clock);
      const url = list[this.rr++ % list.length]!;
      recording.push({ at: this.clock, url, gain: gain * BUS_GAIN[bus], pan: clamp(pan, -1, 1), rate: rate * (0.96 + 0.08 * ((this.rr * 0.618) % 1)) });
      this.played += 1;
      return true;
    }
    const context = this.context;
    if (!this.enabled || context === null || list === undefined || list.length === 0) return false;
    const now = context.currentTime;
    if (now - (this.last.get(id) ?? -1) < gap) return false;
    const url = list[this.rr++ % list.length]!;
    const buffer = this.buffers.get(url);
    if (buffer === undefined) return false;
    this.last.set(id, now);
    const source = context.createBufferSource();
    source.buffer = buffer;
    // A little variation per take (the kit's ±5 %).
    source.playbackRate.value = rate * (0.96 + 0.08 * ((this.rr * 0.618) % 1));
    const volume = context.createGain();
    volume.gain.value = gain;
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    source.connect(volume).connect(panner).connect(this.buses.get(bus) ?? this.master!);
    source.start();
    this.played += 1;
    return true;
  }

  /** The first of `ids` that has files, else the last (asked, silent). */
  private playFirst(a: string, b: string, bus: Bus, gain: number, pan = 0): void {
    if (this.files.has(a)) this.play(a, bus, gain, pan);
    else this.play(b, bus, gain, pan);
  }

  /** Ducks every bus for `seconds` (the hush before a finisher). */
  private duck(seconds: number): void {
    if (this.recording !== null) {
      this.recording.push({ at: this.clock, url: "", gain: 0, pan: 0, rate: 1, duck: seconds });
      return;
    }
    const context = this.context;
    if (context === null) return;
    const now = context.currentTime;
    for (const [bus, node] of this.buses) {
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(node.gain.value, now);
      node.gain.linearRampToValueAtTime(BUS_GAIN[bus] * 0.08, now + 0.012);
      node.gain.setValueAtTime(BUS_GAIN[bus] * 0.08, now + seconds);
      node.gain.linearRampToValueAtTime(BUS_GAIN[bus], now + seconds + 0.01);
    }
  }

  /** Screen x (−1 left … 1 right) of a field point, for the pan: the field is 40 m wide. */
  private pan(x: number): number {
    return clamp(x / 22, -0.8, 0.8);
  }

  /** The bus's listener: every event on the frame it happens. */
  on(e: LabEvent): void {
    switch (e.kind) {
      case "cast":
        this.play("cast", "combat", 0.5, this.pan(e.x));
        break;
      case "release":
        this.playFirst("release-" + e.slot, "release", "combat", e.tier === "ultimate" ? 1 : e.tier === "skill" ? 0.85 : 0.6, this.pan(e.x));
        break;
      case "flyby":
        this.play("flyby", "combat", 0.55, this.pan(e.x), 1, 0.05);
        break;
      case "impact": {
        const b = this.impact[e.material];
        if (!b.open) {
          // The bucket's first blow sounds now, on the frame the blow lands.
          b.open = true;
          b.age = 0;
          b.count = 0;
          b.x = 0;
          b.power = 0;
          this.play("impact-" + e.material, "combat", clamp(0.5 + 0.4 * e.power, 0.4, 1), this.pan(e.x), 1, 0.02);
        }
        b.count += 1;
        b.x += e.x;
        b.power = Math.max(b.power, e.role === "finisher" ? 1.4 : e.power);
        break;
      }
      case "death": {
        const b = this.death;
        if (!b.open) {
          b.open = true;
          b.age = 0;
          b.count = 0;
          b.x = 0;
          this.play("death", "combat", 0.6, this.pan(e.x), 1, 0.03);
        }
        b.count += 1;
        b.x += e.x;
        break;
      }
      case "world":
        if (e.phase === "hush") this.duck(0.05);
        else this.play("world-" + e.phase, "world", e.phase === "climax" ? 1 : 0.85, 0, 1, 0.2);
        break;
      case "callout":
        this.playFirst("callout-" + e.slot, "callout", "voice", 1);
        break;
    }
  }

  /** Closes the buckets that are due (real time). */
  update(dt: number): void {
    this.clock += dt;
    for (const m of ["flesh", "stone", "spirit"] as const) {
      const b = this.impact[m];
      if (!b.open) continue;
      b.age += dt;
      if (b.age < IMPACT_BUCKET_S) continue;
      b.open = false;
      // A full bucket adds one heavier take: louder (√n) and a little lower as it filled, capped.
      const n = b.count;
      if (n >= 4) this.play("impact-" + m, "combat", clamp(0.35 + 0.15 * Math.sqrt(n) * (0.6 + 0.4 * b.power), 0.3, 1.1), this.pan(b.x / n), 1 - Math.min(0.15, 0.015 * n), 0.02);
    }
    const d = this.death;
    if (d.open) {
      d.age += dt;
      if (d.age >= DEATH_BUCKET_S) {
        d.open = false;
        if (d.count >= 3) this.play("death", "combat", clamp(0.4 + 0.12 * Math.sqrt(d.count), 0.4, 1), this.pan(d.x / d.count), 0.92, 0.03);
      }
    }
  }

  /** Files found per id (checks). */
  found(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, list] of this.files) out[id] = list.length;
    return out;
  }

  reset(): void {
    for (const k of Object.keys(this.asked)) delete this.asked[k];
    this.played = 0;
    for (const b of Object.values(this.impact)) b.open = false;
    this.death.open = false;
  }
}
