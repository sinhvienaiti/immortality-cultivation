// Source: games/space-typing/src/scene3d/sfx.ts (SceneAudio; kit copy: game sound table, one gain node per bus; log fixes in shared/game-kit/DRIFT.md)
import {
  DRAGON_SAMPLES,
  noiseBuffer,
  recordedVoice,
  synthVoice,
  voiceBus,
  type DragonSample,
  type SceneVoice,
} from "./dragon-voice";
import { BusMix, DEFAULT_BUSES, type AudioGroup, type BusTable } from "./mix";
import { DEFAULT_AUDIO_BASE, audioUrl, clamp, rand } from "./util";

/** One sound of a game's table: a file (under the audio base, or a full URL) and its bus. */
export type SoundSpec<B extends string> = string | { url: string; bus?: B; gain?: number; gap?: number };
export type SoundTable<S extends string, B extends string> = Readonly<Record<S, SoundSpec<B>>>;

export type PlayOptions<B extends string> = { rate?: number; pan?: number; gap?: number; bus?: B };

export type SceneAudioOptions<S extends string, B extends string> = {
  /** The game's sounds by name. */
  sounds: SoundTable<S, B>;
  /** Mix buses; Space's five groups by default. */
  buses?: BusTable<B>;
  /** Bus for sounds that name none (default: "combat" when present, else the first bus). */
  defaultBus?: B;
  /** Bus the dragon voices go through (default: defaultBus). */
  voiceBus?: B;
  /** Defaults to "/assets/audio/". */
  audioBase?: string;
  /** Dragon recordings to load for `voice` (false: synthesized only). Paths are under the audio base. */
  dragonSamples?: Partial<Record<DragonSample, (typeof DRAGON_SAMPLES)[DragonSample]>> | false;
  sfxVolume?: number;
  musicVolume?: number;
};

type ResolvedSound<B extends string> = { url: string; bus: B; gain: number; gap: number | undefined };

/**
 * Web Audio effects on a few mix buses and one looping music track. Unlocks
 * on the first user gesture (browsers block audio before it).
 */
export class SceneAudio<S extends string, B extends string = AudioGroup> {
  enabled = true;
  readonly mix: BusMix<B>;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly busNodes = new Map<B, GainNode>();
  private music: { source: AudioBufferSourceNode; gain: GainNode; url: string } | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly last = new Map<string, number>();
  private readonly sounds: Map<S, ResolvedSound<B>>;
  private readonly defaultBus: B;
  private readonly voiceBusName: B;
  private readonly audioBase: string;
  private readonly dragonSamples: Partial<Record<DragonSample, (typeof DRAGON_SAMPLES)[DragonSample]>>;
  private pronunciationActive = false;
  /** Two seconds of white noise, the raw stuff of the synthesized fire sounds. */
  private noise: AudioBuffer | null = null;
  /** The dragon's recordings, as they finish loading (`recordedVoice`). */
  private readonly dragon = new Map<DragonSample, AudioBuffer>();
  /** Saturation and compression every dragon voice goes through (`voiceBus`). */
  private voiceOut: AudioNode | null = null;
  private sfxVolume: number;
  private musicVolume: number;

  constructor(options: SceneAudioOptions<S, B>) {
    const buses = (options.buses ?? DEFAULT_BUSES) as BusTable<B>;
    this.mix = new BusMix(buses);
    const names = this.mix.busNames;
    if (names.length === 0) throw new RangeError("SceneAudio needs at least one bus");
    this.defaultBus = options.defaultBus ?? (names.includes("combat" as B) ? ("combat" as B) : names[0]!);
    this.voiceBusName = options.voiceBus ?? this.defaultBus;
    this.audioBase = options.audioBase ?? DEFAULT_AUDIO_BASE;
    this.dragonSamples = options.dragonSamples === false ? {} : (options.dragonSamples ?? DRAGON_SAMPLES);
    this.sfxVolume = clamp(options.sfxVolume ?? 0.5, 0, 1);
    this.musicVolume = clamp(options.musicVolume ?? 0.35, 0, 1);
    this.sounds = new Map();
    for (const [name, spec] of Object.entries(options.sounds) as [S, SoundSpec<B>][]) {
      const full = typeof spec === "string" ? { url: spec } : spec;
      const bus = full.bus ?? this.defaultBus;
      if (!(bus in buses)) throw new RangeError("sound " + name + " names an unknown bus " + bus);
      this.sounds.set(name, { url: audioUrl(full.url, this.audioBase), bus, gain: full.gain ?? 1, gap: full.gap });
    }
  }

  get unlocked(): boolean {
    return this.context !== null;
  }

  /** The resolved URL of a sound in the table. */
  url(name: S): string | undefined {
    return this.sounds.get(name)?.url;
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = clamp(sfx, 0, 1);
    this.musicVolume = clamp(music, 0, 1);
    if (this.master !== null) this.master.gain.value = this.sfxVolume;
    if (this.music !== null) this.music.gain.gain.value = this.musicVolume;
  }

  /** Dips every bus by its duck while a word is spoken (speech/PRONUNCIATION_EVENT). */
  setPronunciationActive(active: boolean): void {
    this.pronunciationActive = active;
    const context = this.context;
    if (context === null) return;
    for (const [bus, node] of this.busNodes) {
      node.gain.setTargetAtTime(this.mix.busGain(bus, active), context.currentTime, 0.05);
    }
  }

  unlock(): void {
    if (this.context !== null) {
      if (this.context.state === "suspended") void this.context.resume();
      return;
    }
    if (typeof AudioContext === "undefined") return;
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = this.sfxVolume;
    this.master.connect(context.destination);
    for (const bus of this.mix.busNames) {
      const node = context.createGain();
      node.gain.value = this.mix.busGain(bus, this.pronunciationActive);
      node.connect(this.master);
      this.busNodes.set(bus, node);
    }
    this.voiceOut = voiceBus(context, this.busNodes.get(this.voiceBusName) ?? this.master);
    for (const sound of this.sounds.values()) void this.buffer(sound.url);
    for (const [key, spec] of Object.entries(this.dragonSamples) as [DragonSample, (typeof DRAGON_SAMPLES)[DragonSample]][]) {
      void this.buffer(audioUrl(spec.file, this.audioBase)).then((buffer) => {
        if (buffer !== null) this.dragon.set(key, buffer);
      });
    }
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

  private output(bus: B): AudioNode | null {
    return this.busNodes.get(bus) ?? this.master;
  }

  /** `gap`: minimum seconds between two plays of the same sound. */
  play(name: S, gain = 1, options: PlayOptions<B> = {}): void {
    const sound = this.sounds.get(name);
    if (sound === undefined) return;
    this.start(name, sound.url, gain * sound.gain, { ...options, gap: options.gap ?? sound.gap, bus: options.bus ?? sound.bus });
  }

  /** Starts loading sound files outside the table (paths under the audio base or full URLs) for `playFile`. */
  preload(urls: readonly string[]): void {
    for (const url of urls) void this.buffer(audioUrl(url, this.audioBase));
  }

  /** Like `play`, for a file `preload` loaded; `gap` is kept per file. */
  playFile(url: string, gain = 1, options: PlayOptions<B> = {}): void {
    if (!this.enabled || this.context === null || this.master === null) return;
    const full = audioUrl(url, this.audioBase);
    if (!this.buffers.has(full)) {
      void this.buffer(full);
      return;
    }
    this.start(full, full, gain, options);
  }

  private start(key: string, url: string, gain: number, options: PlayOptions<B>): void {
    if (!this.enabled || this.context === null || this.master === null) return;
    const buffer = this.buffers.get(url);
    if (buffer === undefined) return;
    const now = this.context.currentTime;
    if (now - (this.last.get(key) ?? -1) < (options.gap ?? 0.03)) return;
    this.last.set(key, now);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = (options.rate ?? 1) * rand(0.95, 1.05);
    const volume = this.context.createGain();
    volume.gain.value = gain;
    const panner = this.context.createStereoPanner();
    panner.pan.value = clamp(options.pan ?? 0, -1, 1);
    source.connect(volume).connect(panner).connect(this.output(options.bus ?? this.defaultBus)!);
    source.start();
  }

  /** A sound built on the spot: `build` wires Web Audio nodes into `out` (on a bus), from `now`. */
  synth(
    key: string,
    build: (context: AudioContext, out: AudioNode, noise: AudioBuffer, now: number) => void,
    gain = 1,
    options: { pan?: number; gap?: number; bus?: B } = {},
  ): void {
    const context = this.context;
    if (!this.enabled || context === null || this.master === null) return;
    const now = context.currentTime;
    if (now - (this.last.get("synth:" + key) ?? -1) < (options.gap ?? 0.03)) return;
    this.last.set("synth:" + key, now);
    this.noise ??= noiseBuffer(context);
    const out = context.createGain();
    out.gain.value = gain;
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(options.pan ?? 0, -1, 1);
    out.connect(panner).connect(this.output(options.bus ?? this.defaultBus)!);
    build(context, out, this.noise, now);
  }

  /** A dragon's sound: from its recordings once loaded (`recordedVoice`), synthesized until then. */
  voice(name: SceneVoice, gain = 1, options: { pan?: number; gap?: number } = {}): void {
    const context = this.context;
    if (!this.enabled || context === null || this.master === null) return;
    const now = context.currentTime;
    if (now - (this.last.get("voice:" + name) ?? -1) < (options.gap ?? 0.03)) return;
    this.last.set("voice:" + name, now);
    this.noise ??= noiseBuffer(context);
    const out = context.createGain();
    out.gain.value = gain;
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(options.pan ?? 0, -1, 1);
    out.connect(panner).connect(this.voiceOut ?? this.master);
    if (!recordedVoice(context, out, this.noise, this.dragon, name, now)) synthVoice(context, out, this.noise, name, now);
  }

  /** Loops one track (a path under the audio base), crossfading from the previous one. */
  async playMusic(path: string | null): Promise<void> {
    const context = this.context;
    if (context === null) return;
    const url = path === null ? "" : audioUrl(path, this.audioBase);
    if (this.music?.url === url) return;
    const previous = this.music;
    this.music = null;
    if (previous !== null) {
      previous.gain.gain.setTargetAtTime(0, context.currentTime, 0.4);
      previous.source.stop(context.currentTime + 2);
    }
    if (path === null) return;
    const buffer = await this.buffer(url);
    if (buffer === null || this.context !== context || this.music !== null) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(this.enabled ? this.musicVolume : 0, context.currentTime, 0.6);
    source.connect(gain).connect(context.destination);
    source.start();
    this.music = { source, gain, url };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.music !== null && this.context !== null) this.music.gain.gain.setTargetAtTime(enabled ? this.musicVolume : 0, this.context.currentTime, 0.2);
  }
}
