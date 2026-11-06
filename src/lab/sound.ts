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
 * Element (canon D59): with `element` set (the kit's sound suffix, e.g. "fire"), every event plays
 * "<event>-<element>" when it has files and falls back to "<event>" (release-k1-fire, then release-k1, then
 * release-fire, then release), live and while recording.
 * Files: art-src/lab/audio/manifest.json ({ "<event-id>": ["a.ogg", …] }) when
 * present, else 01–03 .ogg or .wav in each folder, found by HEAD requests
 * (the dev server answers a missing file with its HTML page, so the type is
 * checked). Absent files are silent. Playback is decoded files only, through
 * gain and pan nodes: nothing here synthesizes sound. One event, one frame:
 * the bus calls `on` on the same frame as the body, VFX, camera and hit-stop.
 */
import type { LabEvent } from "./events";
import {
  BUS_GAIN, CALLOUT_TRIM_DB, FIREFLY_FADE, FIREFLY_TARGET, KEYS_MIX, LIMITER, MASTER_GAIN, MUSIC, SEND_LEVEL, SPEECH_DIP, VERB_RETURN, VOICE_CAP, classOf,
  fireflyGain, trimGain, type SoundBus, type VoiceGroup,
} from "./sound-tiers";

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

type Bus = SoundBus;

/** The Firefly sprint's sounds (art-src/lab/firefly-sprint-2026-11-05/sound/<job>/takeN.wav). */
export const FIREFLY_SOUND = "/art-src/lab/firefly-sprint-2026-11-05/sound/";

/**
 * A Firefly take the lab plays as it is (no event folder): its file, the gain that brings its momentary maximum (400 ms,
 * measured) to its tier's playback target with the bus and master gains, where its sound starts (s: the quiet lead-in
 * Firefly leaves before it is skipped, so it sounds on its event's frame), where its main hit lands (s, from the file's
 * start: a sound timed to a landing puts it there) and an optional fade-out [from s, over s] for a take whose file
 * ends while it still sounds.
 */
export interface FireflyTake {
  readonly file: string;
  readonly gain: number;
  readonly onset: number;
  readonly peak?: number;
  readonly fade?: readonly [number, number];
}

/**
 * The takes chosen by measurement on 06/11 (game-art-pipeline references/audio.md §5.4; numbers in
 * typing-game-review/captures/tu-tien/lab-sounds/measure-2026-11-06.md), each at the gain that brings its momentary max
 * (sound-tiers.ts FIREFLY_LEVELS, ebur128) to its level with its bus and master, never past −1 dBTP: UI sounds dry (T1:
 * the streak's tick −30, its Flash ping −25, its tier rise −22, its break −28 LUFS), combat on the lab's tiers (the
 * channel is a normal skill: its start −16, a pulse on every word −21 under the word's hit, its collapse T3 −18, its
 * loop a bed at −22; the meteor T5 −11.5). Picks: the
 * quickest clean onset and no clipped samples first; then the densest body and longest tail for combat, the shortest
 * clean tail for UI; a loop the steadiest level (its seam is crossfaded on load).
 */
const take = (file: string, target: number, bus: SoundBus | "ui", onset: number): { file: string; gain: number; onset: number } =>
  ({ file, gain: fireflyGain(file, target, bus), onset });
export const LAB_TAKES = {
  streakCount: take("tt-sfx-streak-count/take4.wav", -30, "ui", 0),
  streakFlash: take("tt-sfx-streak-flash/take3.wav", -25, "ui", 0),
  streakTierUp: take("tt-sfx-streak-tier-up/take3.wav", -22, "ui", 0),
  streakBreak: { ...take("tt-sfx-streak-break/take4.wav", -28, "ui", 0.053), fade: [1.2, 0.45] as const },
  channelStart: take("tt-sfx-channel-start/take2.wav", -16, "combat", 0.142),
  channelLoop: take("tt-sfx-channel-loop/take8.wav", -22, "combat", 0),
  channelPulse: take("tt-sfx-channel-pulse/take3.wav", -21, "combat", 0.214),
  channelPulseB: take("tt-sfx-channel-pulse/take6.wav", -21, "combat", 0.546),
  channelCollapse: take("tt-sfx-channel-collapse/take1.wav", -18, "combat", 0.508),
  meteor: { ...take("tt-sfx-meteor-slant-fall/take2.wav", -11.5, "combat", 0.268), peak: 1.13 },
  meteorB: { ...take("tt-sfx-meteor-slant-fall/take7.wav", -11.5, "combat", 0.244), peak: 1.14 },
} as const satisfies Record<string, FireflyTake>;

/** Options of one take's playback: its bus ("ui": dry, straight to the master), gain × its own, pan, rate, reverb send, a delay (s). */
export interface TakeOptions {
  readonly bus?: Bus | "ui";
  readonly gain?: number;
  readonly pan?: number;
  readonly rate?: number;
  readonly send?: number;
  readonly delay?: number;
  /** Starts this far into the file (s) instead of its onset (a whoosh joined late, so its hit still lands on time). */
  readonly from?: number;
  /** Its voice group (a capped number sound at once; VOICE_CAP). */
  readonly group?: VoiceGroup;
}

/** A loop playing (loopTake): its level (0–1, eased over `over` s) and its stop (faded over `over` s). */
export interface TakeLoop {
  level(k: number, over?: number): void;
  stop(over: number): void;
}

/** A loop's seam is crossfaded over this much of its end (s) when it loads. */
const LOOP_XF_S = 0.25;
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
  /** Offline wet multiplier: SEND_LEVEL / bus gain, since `gain` already includes the dry bus. */
  readonly send: number;
  readonly pan: number;
  readonly rate: number;
  /** A duck of every bus to 8 % for this long (s): the hush before a finisher. */
  readonly duck?: number;
  /** A voice-bus take (a callout): a later `stopVoices` cuts it, as reset() stops it live. */
  readonly voice?: boolean;
  /** Where in its file it starts (s; its quiet lead-in skipped, or a whoosh joined late). */
  readonly from?: number;
  /** A UI sound: it joins after the mix's headroom and limiter (its `gain` is before the master's). */
  readonly ui?: boolean;
  /** A typed key (Typing Feel): it joins after the mix's headroom and limiter too, outside every duck. */
  readonly key?: boolean;
  /** Its voice group, the group's cap and the oldest's fade (the offline mix applies them as live does). */
  readonly group?: VoiceGroup;
  /** A fade-out from this many seconds after its start, over [1] s (a long file shortened to its skill). */
  readonly fade?: readonly [number, number];
  /** The music's pre-duck: the hit this many s later, its depth (dB) and hold after the hit (s). */
  readonly musicDuck?: readonly [number, number, number];
  /** reset() while recording: every voice take still sounding stops here. */
  readonly stopVoices?: boolean;
}

/** The capped voice group of an event's files: hits, deaths, and the big world sounds and ultimate releases. */
function groupOf(id: string): VoiceGroup | null {
  if (id.startsWith("impact-")) return "impact";
  if (id.startsWith("death")) return "death";
  if (id.startsWith("world-") || id.startsWith("release-k5") || id.startsWith("release-k7")) return "big";
  return null;
}

/** Pre-ducks sorted and merged where one starts before the last has come back up (the deeper level wins). */
export function mergeDucks(list: readonly { start: number; end: number; low: number }[]): { start: number; end: number; low: number }[] {
  const out: { start: number; end: number; low: number }[] = [];
  for (const d of [...list].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last !== undefined && d.start <= last.end + MUSIC.release) {
      last.end = Math.max(last.end, d.end);
      last.low = Math.min(last.low, d.low);
    } else out.push({ ...d });
  }
  return out;
}

/** The 1–4 kHz peaking cut (SPEECH_DIP). */
function speechDip(context: BaseAudioContext): BiquadFilterNode {
  const f = context.createBiquadFilter();
  f.type = "peaking";
  f.frequency.value = SPEECH_DIP.freq;
  f.Q.value = SPEECH_DIP.q;
  f.gain.value = SPEECH_DIP.gain;
  return f;
}

/** `raw` with its last `xf` s crossfaded into its first (equal power), `xf` shorter: it loops without a seam. */
function seamless(context: BaseAudioContext, raw: AudioBuffer, xf: number): AudioBuffer {
  const n = raw.length;
  const x = Math.min(Math.floor(xf * raw.sampleRate), Math.floor(n / 3));
  const out = context.createBuffer(raw.numberOfChannels, n - x, raw.sampleRate);
  for (let ch = 0; ch < raw.numberOfChannels; ch += 1) {
    const a = raw.getChannelData(ch);
    const b = out.getChannelData(ch);
    b.set(a.subarray(0, n - x));
    for (let i = 0; i < x; i += 1) {
      const w = i / x;
      b[i] = a[i]! * Math.sqrt(w) + a[n - x + i]! * Math.sqrt(1 - w);
    }
  }
  return out;
}

export class LabSound {
  enabled = true;
  /** The element's sound suffix (canon D59; "" none): "<event>-<element>" plays first when it has files. */
  element = "";
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  /** After the master's headroom and limiter: UI sounds join here (their level stays theirs). */
  private ui: GainNode | null = null;
  private verb: DelayNode | null = null;
  private verbReturn: GainNode | null = null;
  private readonly buses = new Map<Bus, GainNode>();
  private readonly files = new Map<string, string[]>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly last = new Map<string, number>();
  /** Callouts sounding now (the voice bus), stopped on reset. */
  private readonly voices = new Set<AudioBufferSourceNode>();
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
  /** Firefly takes to load with the context (playTake, loopTake) and their loop versions (seam crossfaded). */
  private readonly takeUrls = new Set<string>();
  private readonly loops = new Map<string, AudioBuffer>();
  /** Voices sounding per capped group (live): the oldest fades when one more comes (VOICE_CAP). */
  private readonly sounding: Record<VoiceGroup, { src: AudioBufferSourceNode; gain: GainNode }[]> = { impact: [], death: [], big: [] };
  /** The music bus (under the master, outside the hush) and its track; the end of the pre-duck in force (context s). */
  private music: GainNode | null = null;
  private musicSrc: AudioBufferSourceNode | null = null;
  private musicUrl: string | null = null;
  /**
   * Loads a Typing Feel key set (the shared pack, read only; docs/games/TYPING_FEEL_SERVICE.md): `catalogue` is
   * <origin>/v1/keys/keys-manifest.json, `profile` a profile id (none: the catalogue's default). Its files decode with
   * the context. Resolves to the set's id ("" when it is not there).
   */
  async loadKeys(catalogue: string, profile?: string): Promise<string> {
    try {
      const base = catalogue.slice(0, catalogue.lastIndexOf("/") + 1);
      const cat = (await (await fetch(catalogue)).json()) as { default?: string; profiles?: { id: string; manifest: string }[] };
      const id = profile ?? cat.default;
      const row = cat.profiles?.find((p) => p.id === id);
      if (row === undefined) return "";
      const setUrl = base + row.manifest;
      const set = (await (await fetch(setUrl)).json()) as { files?: { file: string; set: string }[] };
      const dir = setUrl.slice(0, setUrl.lastIndexOf("/") + 1);
      this.keyFiles.key = [];
      this.keyFiles.space = [];
      for (const f of set.files ?? []) if (f.set === "key" || f.set === "space") this.keyFiles[f.set].push(dir + f.file);
      if (this.context !== null) for (const url of [...this.keyFiles.key, ...this.keyFiles.space]) void this.buffer(url);
      this.keySet = row.id;
      return row.id;
    } catch {
      return "";
    }
  }

  /**
   * A typed key's sound from the Typing Feel set (a random file, never the last one), at unity: the pack's files carry
   * their level. It sounds on its own bus, so no skill, hush, pre-duck or limiter ever takes it down (audio.md §5.4).
   */
  key(kind: "key" | "space" = "key"): boolean {
    const list = this.keyFiles[kind].length > 0 ? this.keyFiles[kind] : this.keyFiles.key;
    if (!this.enabled || list.length === 0) return false;
    this.keyRand = (this.keyRand * 1103515245 + 12345) >>> 0;
    let url = list[this.keyRand % list.length]!;
    if (url === this.lastKeyFile && list.length > 1) url = list[(this.keyRand + 1) % list.length]!;
    this.lastKeyFile = url;
    this.asked["key:" + kind] = (this.asked["key:" + kind] ?? 0) + 1;
    if (this.recording !== null) {
      this.recording.push({ at: this.clock, url, gain: 10 ** (KEYS_MIX.busDb / 20) / MASTER_GAIN, send: 0, pan: 0, rate: 1, key: true });
      return true;
    }
    const context = this.context;
    const buffer = this.buffers.get(url);
    if (context === null || this.keysBus === null || buffer === undefined) return false;
    // The skills give the click room: their 2–8 kHz dips for a moment (never the key itself).
    if (this.keyDip !== null) {
      const g = this.keyDip.gain;
      const now = context.currentTime;
      const d = KEYS_MIX.dip;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(d.gain, now, d.attack);
      g.setTargetAtTime(0, now + d.hold, d.release);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.keysBus);
    source.start();
    source.onended = () => source.disconnect();
    this.played += 1;
    return true;
  }

  /** The music's pre-ducks in force (context s): each from `start` down to `low` until `end`. */
  private ducks: { start: number; end: number; low: number }[] = [];
  /** The 1–4 kHz cut on loops (SPEECH_DIP). */
  private loopDip: BiquadFilterNode | null = null;
  /** Typed keys: their own bus to the output, outside the master, the hush, the pre-ducks and the limiter. */
  private keysBus: GainNode | null = null;
  /** The skills' 2–8 kHz dip under each keystroke (KEYS_MIX.dip), on the master before the headroom. */
  private keyDip: BiquadFilterNode | null = null;
  /** The Typing Feel set's files by kind (loaded with the context) and the last one played (never twice in a row). */
  private readonly keyFiles: Record<"key" | "space", string[]> = { key: [], space: [] };
  private lastKeyFile = "";
  /** The key set in use ("" none): its profile id and name. */
  keySet = "";
  private keyRand = 0x2468ace;

  /** `variants`: element suffixes to look for beside each event when there is no manifest (the files are probed). */
  constructor(private readonly variants: readonly string[] = []) {}

  /** The files `id` plays with the element: "<id>-<element>" when it has some, else `id`'s. */
  private resolve(id: string): string {
    if (this.element !== "") {
      const variant = id + "-" + this.element;
      if (this.files.has(variant)) return variant;
    }
    return id;
  }

  /** `id` has files, with the element's or its own. */
  private has(id: string): boolean {
    return this.files.has(this.resolve(id));
  }

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
    this.master.gain.value = MASTER_GAIN;
    // The mix's headroom, then a peak limiter (LIMITER): stacked skills no longer clip the output.
    const headroom = context.createGain();
    headroom.gain.value = 10 ** ((LIMITER.headroomDb - LIMITER.makeupDb) / 20);
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = LIMITER.thresholdDb;
    limiter.knee.value = 0;
    limiter.ratio.value = LIMITER.ratio;
    limiter.attack.value = LIMITER.attack;
    limiter.release.value = LIMITER.release;
    const keyDip = context.createBiquadFilter();
    keyDip.type = "peaking";
    keyDip.frequency.value = KEYS_MIX.dip.freq;
    keyDip.Q.value = KEYS_MIX.dip.q;
    keyDip.gain.value = 0;
    this.keyDip = keyDip;
    this.master.connect(keyDip).connect(headroom).connect(limiter).connect(context.destination);
    this.ui = context.createGain();
    this.ui.gain.value = MASTER_GAIN;
    this.ui.connect(context.destination);
    this.keysBus = context.createGain();
    this.keysBus.gain.value = 10 ** (KEYS_MIX.busDb / 20);
    this.keysBus.connect(context.destination);
    for (const url of [...this.keyFiles.key, ...this.keyFiles.space]) void this.buffer(url);
    for (const bus of Object.keys(BUS_GAIN) as Bus[]) {
      const node = context.createGain();
      node.gain.value = BUS_GAIN[bus];
      node.connect(this.master);
      this.buses.set(bus, node);
    }
    const delay = context.createDelay();
    delay.delayTime.value = 0.025;
    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 200;
    highpass.Q.value = -3.0103; // Web Audio low/highpass Q is in dB (linear Q = 0.7071).
    const convolver = context.createConvolver();
    convolver.normalize = true;
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 6500;
    lowpass.Q.value = -3.0103;
    const verbReturn = context.createGain();
    verbReturn.gain.value = VERB_RETURN;
    // The return dips at 1–4 kHz so a typed key's onset stays clear of the room (SPEECH_DIP; offline mix the same).
    const dip = speechDip(context);
    delay.connect(highpass).connect(convolver).connect(lowpass).connect(dip).connect(verbReturn).connect(this.master);
    this.loopDip = speechDip(context);
    this.loopDip.connect(this.buses.get("combat") ?? this.master);
    this.music = context.createGain();
    this.music.connect(this.master);
    if (this.musicUrl !== null) this.setMusic(this.musicUrl);
    this.verb = delay;
    this.verbReturn = verbReturn;
    // An unloaded convolver is silent; the dry buses can play while the IR loads.
    void this.buffer(BASE + "ir/hall-a.wav").then((buffer) => { if (buffer !== null) convolver.buffer = buffer; });
    this.discovered ??= this.discover();
    for (const url of this.takeUrls) void this.buffer(url);
  }

  /** Firefly takes the lab will play: they load with the audio context (now, if it runs). */
  registerTakes(takes: readonly FireflyTake[]): void {
    for (const t of takes) {
      const url = FIREFLY_SOUND + t.file;
      this.takeUrls.add(url);
      if (this.context !== null) void this.buffer(url);
    }
  }

  /**
   * Plays Firefly take `t` from its onset (or `o.from`) at its measured gain × `o.gain`, on `o.bus` (combat by default;
   * "ui" dry to the master), `o.delay` s from now. While recording (captures) it is logged on the lab clock with where in
   * its file it starts. False: silent (no context, not loaded yet, or the lab's sound is off).
   */
  playTake(t: FireflyTake, o: TakeOptions = {}): boolean {
    const url = FIREFLY_SOUND + t.file;
    this.takeUrls.add(url);
    const id = "take:" + t.file;
    this.asked[id] = (this.asked[id] ?? 0) + 1;
    const bus = o.bus ?? "combat";
    const busGain = bus === "ui" ? 1 : BUS_GAIN[bus];
    const gain = t.gain * (o.gain ?? 1);
    const from = o.from ?? t.onset;
    const send = bus === "ui" ? 0 : o.send ?? 0;
    const rate = o.rate ?? 1;
    if (!this.enabled) return false;
    if (this.recording !== null) {
      this.recording.push({
        at: this.clock + (o.delay ?? 0), url, gain: gain * busGain, send: send / busGain, pan: clamp(o.pan ?? 0, -1, 1), rate,
        ...(from > 0 ? { from } : {}),
        ...(bus === "ui" ? { ui: true } : {}),
        ...(o.group !== undefined ? { group: o.group } : {}),
        ...(t.fade !== undefined && t.fade[0] > from ? { fade: [(t.fade[0] - from) / rate, t.fade[1] / rate] as const } : {}),
      });
      this.played += 1;
      return true;
    }
    const context = this.context;
    if (context === null) return false;
    const buffer = this.buffers.get(url);
    if (buffer === undefined) {
      // Not decoded yet (keys 8 and 9 load a file on its first cast): it starts when it is, joined where it would be by
      // then, unless that is more than 0.4 s late.
      const asked = context.currentTime;
      void this.buffer(url).then((b) => {
        const late = context.currentTime - asked;
        if (b !== null && late < 0.4) this.playTake(t, { ...o, from: from + late * rate, delay: Math.max(0, (o.delay ?? 0) - late) });
      });
      return false;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const volume = context.createGain();
    const when = context.currentTime + Math.max(0, o.delay ?? 0);
    volume.gain.value = gain;
    if (t.fade !== undefined && t.fade[0] > from) {
      // A file that ends while it still sounds fades out instead of cutting off.
      const at = when + (t.fade[0] - from) / rate;
      volume.gain.setValueAtTime(gain, at);
      volume.gain.linearRampToValueAtTime(0, at + t.fade[1] / rate);
    }
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(o.pan ?? 0, -1, 1);
    source.connect(volume).connect(panner).connect(bus === "ui" ? this.ui ?? this.master! : this.buses.get(bus) ?? this.master!);
    const sendNode = context.createGain();
    sendNode.gain.value = send;
    if (send > 0 && this.verb !== null) panner.connect(sendNode).connect(this.verb);
    source.start(when, Math.min(buffer.duration - 0.01, Math.max(0, from)));
    source.onended = () => {
      source.disconnect();
      volume.disconnect();
      panner.disconnect();
      sendNode.disconnect();
    };
    if (o.group !== undefined) this.admit(o.group, source, volume);
    this.played += 1;
    return true;
  }

  /**
   * Keys 8 and 9's Firefly file (`file`: "job/takeN.wav", "#t=0.8" starts it there) at its class's level (T5 heavy, T6
   * ultimate; FIREFLY_LEVELS) on the world bus, in the big group, faded out from FIREFLY_FADE[0] s after its start.
   */
  playFirefly(file: string, cls: "heavy" | "ult"): boolean {
    const [path, frag] = file.split("#t=");
    const from = Math.max(0, Number(frag ?? "0") || 0);
    const t: FireflyTake = { file: path!, gain: fireflyGain(path!, FIREFLY_TARGET[cls], "world"), onset: from, fade: [from + FIREFLY_FADE[0], FIREFLY_FADE[1]] };
    return this.playTake(t, { bus: "world", send: cls === "ult" ? 0.4 : 0.3, group: "big" });
  }

  /** A new voice of `group` (live): over the group's cap the oldest fades out over its fade and stops. */
  private admit(group: VoiceGroup | null, src: AudioBufferSourceNode, gain: GainNode): void {
    const context = this.context;
    if (group === null || context === null) return;
    const list = this.sounding[group];
    const cap = VOICE_CAP[group];
    const now = context.currentTime;
    while (list.length >= cap.max) {
      const old = list.shift()!;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + cap.fade);
      try {
        old.src.stop(now + cap.fade + 0.02);
      } catch {
        // already stopped
      }
    }
    const entry = { src, gain };
    list.push(entry);
    src.addEventListener("ended", () => {
      const k = list.indexOf(entry);
      if (k >= 0) list.splice(k, 1);
    });
  }

  /** A music track on the music bus, looped at MUSIC.gain (the lab has none: ?music=<url>); null stops it. */
  setMusic(url: string | null): void {
    this.musicUrl = url;
    const context = this.context;
    if (context === null || this.music === null) return;
    try {
      this.musicSrc?.stop();
    } catch {
      // not started
    }
    this.musicSrc = null;
    if (url === null) return;
    void this.buffer(url).then((b) => {
      if (b === null || this.musicUrl !== url || this.music === null) return;
      const src = context.createBufferSource();
      src.buffer = b;
      src.loop = true;
      const g = context.createGain();
      g.gain.value = MUSIC.gain;
      src.connect(g).connect(this.music);
      src.start();
      this.musicSrc = src;
    });
  }

  /**
   * The music's pre-duck before a big hit `hitIn` s from now (REF_VIDEO_LESSONS lesson 11): down MUSIC.depth[cls] dB
   * over MUSIC.ramp from MUSIC.lead s before the hit (now, if the hit is sooner), held MUSIC.hold[cls] after it, back
   * over MUSIC.release. Ducks that meet merge (the deeper wins), so a later one never cuts an earlier one short.
   * Recorded for the offline mix.
   */
  preDuck(hitIn: number, cls: "heavy" | "ult"): void {
    const depth = MUSIC.depth[cls];
    const hold = MUSIC.hold[cls];
    if (this.recording !== null) {
      this.recording.push({ at: this.clock, url: "", gain: 0, send: 0, pan: 0, rate: 1, musicDuck: [Math.max(0, hitIn), depth, hold] });
      return;
    }
    const context = this.context;
    if (context === null || this.music === null) return;
    const now = context.currentTime;
    this.ducks = mergeDucks(
      [...this.ducks.filter((d) => d.end + MUSIC.release > now), { start: now + Math.max(0, hitIn - MUSIC.lead), end: now + Math.max(0, hitIn) + hold, low: 10 ** (depth / 20) }],
    );
    const g = this.music.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    for (const d of this.ducks) {
      if (d.start > now) g.setValueAtTime(g.value > d.low ? 1 : g.value, d.start);
      g.linearRampToValueAtTime(d.low, Math.max(now, d.start) + MUSIC.ramp);
      g.setValueAtTime(d.low, d.end);
      g.linearRampToValueAtTime(1, d.end + MUSIC.release);
    }
  }

  /** The music bus's gain now (checks; 1 without a context). */
  musicLevel(): number {
    return this.music?.gain.value ?? 1;
  }

  /**
   * Starts take `t` as a seamless loop (its last LOOP_XF_S crossfaded into its start, equal power, once on load) at
   * level `k`, faded in over `fadeIn` s; null while it is not loaded (or recording: captures keep no loops).
   */
  loopTake(t: FireflyTake, k: number, o: { bus?: Bus; send?: number; fadeIn?: number } = {}): TakeLoop | null {
    const url = FIREFLY_SOUND + t.file;
    this.takeUrls.add(url);
    this.asked["loop:" + t.file] = (this.asked["loop:" + t.file] ?? 0) + 1;
    const context = this.context;
    if (!this.enabled || this.recording !== null || context === null) return null;
    const raw = this.buffers.get(url);
    if (raw === undefined) {
      void this.buffer(url);
      return null;
    }
    let buffer = this.loops.get(url);
    if (buffer === undefined) {
      buffer = seamless(context, raw, LOOP_XF_S);
      this.loops.set(url, buffer);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const volume = context.createGain();
    const now = context.currentTime;
    volume.gain.setValueAtTime(0, now);
    volume.gain.setTargetAtTime(t.gain * k, now, Math.max(0.005, (o.fadeIn ?? 0.08) / 3));
    const bus = o.bus ?? "combat";
    // A loop sits under the keys: through the 1–4 kHz cut on its way to the combat bus.
    source.connect(volume).connect(bus === "combat" && this.loopDip !== null ? this.loopDip : this.buses.get(bus) ?? this.master!);
    const sendNode = context.createGain();
    sendNode.gain.value = o.send ?? 0;
    if ((o.send ?? 0) > 0 && this.verb !== null) volume.connect(sendNode).connect(this.verb);
    source.start();
    this.played += 1;
    let stopped = false;
    return {
      level: (level, over = 0.12) => {
        if (stopped) return;
        volume.gain.setTargetAtTime(t.gain * level, context.currentTime, Math.max(0.005, over / 3));
      },
      stop: (over) => {
        if (stopped) return;
        stopped = true;
        const at = context.currentTime;
        volume.gain.cancelScheduledValues(at);
        volume.gain.setValueAtTime(volume.gain.value, at);
        volume.gain.linearRampToValueAtTime(0, at + Math.max(0.01, over));
        source.stop(at + Math.max(0.01, over) + 0.05);
        source.onended = () => {
          source.disconnect();
          volume.disconnect();
          sendNode.disconnect();
        };
      },
    };
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
    const ids = SOUND_IDS.flatMap((id) => [id, ...this.variants.filter((v) => v !== "").map((v) => id + "-" + v)]);
    await Promise.all(
      ids.map(async (id) => {
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
    // The element's take when it has one (counted under its own id too); the gap stays the event's.
    const use = this.resolve(id);
    gain *= trimGain(use);
    const sendLevel = SEND_LEVEL[use] ?? (use.startsWith("callout") ? 0.08 : 0);
    if (use !== id) this.asked[use] = (this.asked[use] ?? 0) + 1;
    const list = this.files.get(use);
    const recording = this.recording;
    if (recording !== null) {
      // The same choices as live playback (round robin, ±5 % rate, the gap), on the lab clock.
      if (!this.enabled || list === undefined || list.length === 0) return false;
      // A tolerance: the clock sums 1/60 steps, so three frames come out a hair under 0.05.
      if (this.clock - (this.lastRecorded.get(id) ?? -Infinity) < gap - 1e-6) return false;
      this.lastRecorded.set(id, this.clock);
      const url = list[this.rr++ % list.length]!;
      const group = groupOf(use);
      recording.push({ at: this.clock, url, gain: gain * BUS_GAIN[bus], send: sendLevel / BUS_GAIN[bus], pan: clamp(pan, -1, 1), rate: this.rateOf(bus, rate), ...(bus === "voice" ? { voice: true } : {}), ...(group !== null ? { group } : {}) });
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
    source.playbackRate.value = this.rateOf(bus, rate);
    const volume = context.createGain();
    volume.gain.value = gain;
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    source.connect(volume).connect(panner).connect(this.buses.get(bus) ?? this.master!);
    const send = context.createGain();
    send.gain.value = sendLevel;
    if (this.verb !== null) panner.connect(send).connect(this.verb);
    source.start();
    this.admit(groupOf(use), source, volume);
    if (bus === "voice") this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      volume.disconnect();
      panner.disconnect();
      send.disconnect();
    };
    this.played += 1;
    return true;
  }

  /**
   * A little variation per take (the kit's ±5 %), never on the voice: a callout keeps the picked voice's pitch, and
   * its stressed word stays where the ultimate's cut-in is timed (callout-k5's "天").
   */
  private rateOf(bus: Bus, rate: number): number {
    return bus === "voice" ? rate : rate * (0.96 + 0.08 * ((this.rr * 0.618) % 1));
  }

  /** The first of `ids` that has files, else the last (asked, silent). */
  private playFirst(a: string, b: string, bus: Bus, gain: number, pan = 0): void {
    if (this.has(a)) this.play(a, bus, gain, pan);
    else this.play(b, bus, gain, pan);
  }

  /** Ducks every bus for `seconds` (the hush before a finisher). */
  private duck(seconds: number): void {
    if (this.recording !== null) {
      this.recording.push({ at: this.clock, url: "", gain: 0, send: 0, pan: 0, rate: 1, duck: seconds });
      return;
    }
    const context = this.context;
    if (context === null) return;
    const now = context.currentTime;
    const returns: [GainNode, number][] = [...this.buses].map(([bus, node]) => [node, BUS_GAIN[bus]]);
    if (this.verbReturn !== null) returns.push([this.verbReturn, VERB_RETURN]);
    for (const [node, level] of returns) {
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(node.gain.value, now);
      node.gain.linearRampToValueAtTime(level * 0.08, now + 0.012);
      node.gain.setValueAtTime(level * 0.08, now + seconds);
      node.gain.linearRampToValueAtTime(level, now + seconds + 0.01);
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
        // A shout at its skill's class (CALLOUT_TRIM_DB): a normal skill's no longer over its own blows.
        this.playFirst("callout-" + e.slot, "callout", "voice", 10 ** (CALLOUT_TRIM_DB[classOf(e.slot)] / 20));
        break;
    }
  }

  /** Closes the buckets that are due (real time). */
  update(dt: number): void {
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
    // Last: the buckets closed above belong to this frame, stamped at its start like the frame's other sounds.
    this.clock += dt;
  }

  /** Files found per id (checks). */
  found(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, list] of this.files) out[id] = list.length;
    return out;
  }

  reset(): void {
    if (this.recording !== null) this.recording.push({ at: this.clock, url: "", gain: 0, send: 0, pan: 0, rate: 1, stopVoices: true });
    // A callout still sounding (up to 3 s) would shout over the next cut-in.
    for (const s of this.voices) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    this.voices.clear();
    for (const k of Object.keys(this.asked)) delete this.asked[k];
    this.played = 0;
    for (const b of Object.values(this.impact)) b.open = false;
    this.death.open = false;
  }
}
