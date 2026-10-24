// Source: games/space-typing/src/scene3d/sfx.ts (dragon voice part; audio base is a parameter; log fixes in shared/game-kit/DRIFT.md)
import { DEFAULT_AUDIO_BASE, audioUrl, rand } from "./util";

/**
 * A fire dragon's sounds: its voice, its fire and what the fire does. Built
 * from CC0 recordings (DRAGON_SAMPLES) layered over a synthesized sub-bass;
 * fully synthesized (`synthVoice`) until the recordings have loaded.
 */
export type SceneVoice = "spit" | "spitBig" | "inhale" | "breath" | "fireImpact" | "blaze" | "blazeBig" | "wing" | "grunt" | "roar" | "fall";
export const SCENE_VOICES: readonly SceneVoice[] = ["spit", "spitBig", "inhale", "breath", "fireImpact", "blaze", "blazeBig", "wing", "grunt", "roar", "fall"];

/** Two seconds of white noise, the raw stuff of the synthesized fire sounds. */
export function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Builds one dragon sound into `out`, starting at `now`. Nothing here hisses
 * high: a swept band of bright noise reads as a laser "swish", so fire is
 * low-passed noise (a deep "whoomph") over a sine thump, with a few dry
 * crackles; the voice is two detuned saws plus breath noise through two
 * formant filters (the resonances that make a vowel), trembling and falling
 * in pitch, a throaty snarl.
 */
export function synthVoice(context: BaseAudioContext, out: AudioNode, noise: AudioBuffer, name: SceneVoice, now: number): void {
  const { fire, thump, crackle, growl } = voiceTools(context, out, noise, now);
  const pitch = rand(0.92, 1.08);

  switch (name) {
    case "spit":
      // A short throaty "khah!" and the ball of fire leaving with a whoomph.
      growl(0, 0.2, 150 * pitch, 0.65, 0.3, 0.8);
      fire(0.02, 0.32, 260, 900, 0.85, 0.04);
      thump(0.02, 0.16, 110, 45, 0.5);
      break;
    case "spitBig":
      growl(0, 0.5, 118 * pitch, 0.62, 0.42, 0.7);
      fire(0.06, 0.6, 200, 1000, 1, 0.06);
      thump(0.06, 0.26, 95, 34, 0.8);
      crackle(0.15, 0.4, 4, 0.08);
      break;
    case "inhale":
      // Air drawn in over a rising rumble, before the breath.
      fire(0, 0.7, 250, 700, 0.35, 0.4, 1.4);
      growl(0.1, 0.6, 62, 1.25, 0.22, 0.6);
      break;
    case "breath":
      fire(0, 1.25, 240, 1100, 1, 0.05);
      fire(0.05, 1.1, 700, 380, 0.35, 0.1, 1.2);
      thump(0, 0.3, 90, 35, 0.7);
      growl(0, 0.9, 92, 0.68, 0.34, 0.7);
      crackle(0.2, 0.9, 7, 0.07);
      break;
    case "fireImpact":
      fire(0, 0.32, 900, 180, 0.75, 0.02);
      thump(0, 0.18, 120, 45, 0.5);
      crackle(0.05, 0.22, 2, 0.06);
      break;
    case "blaze":
      // An enemy goes up in flames: a soft deep burst, no sharp crack, and its burning.
      fire(0, 0.65, 1300, 140, 1, 0.025, 0.8);
      thump(0, 0.38, 85, 30, 0.85);
      crackle(0.08, 0.5, 6, 0.09);
      break;
    case "blazeBig":
      fire(0, 1.3, 1100, 90, 1, 0.04, 0.8);
      fire(0.12, 1, 500, 120, 0.6, 0.12);
      thump(0, 0.75, 70, 24, 1);
      crackle(0.1, 1.1, 12, 0.09);
      break;
    case "wing":
      fire(0, 0.38, 240, 520, 0.35, 0.12, 1.1);
      break;
    case "grunt":
      growl(0, 0.32, 110 * pitch, 0.72, 0.34, 0.6);
      break;
    case "roar":
      growl(0, 1.15, 122 * pitch, 0.55, 0.52, 0.7);
      fire(0.1, 1, 300, 800, 0.3, 0.2);
      break;
    case "fall":
      growl(0, 1.4, 80, 0.5, 0.4, 0.8);
      fire(0.2, 1.4, 600, 90, 0.4, 0.3);
      thump(0, 0.6, 60, 24, 0.6);
      break;
  }
}

/**
 * The dragon's recordings (public/assets/audio/dragon/, CC0 from Freesound,
 * see ATTRIBUTION.md), each with the stretch that is used: where it starts
 * (`from`, s), how long (`length`, s) and the gain that brings its peak near
 * full scale (`level`). The files are the untouched HQ previews; trimming
 * and fades happen as they play.
 */
export const DRAGON_SAMPLES = {
  burst: { file: "dragon/fire-burst.mp3", from: 0, length: 0.62, level: 1.3 },
  fireball: { file: "dragon/fireball-explosion.mp3", from: 0, length: 0.55, level: 0.95 },
  explosion: { file: "dragon/fire-explosion.mp3", from: 0, length: 1.1, level: 1.15 },
  combust: { file: "dragon/combust.mp3", from: 0.32, length: 2, level: 0.94 },
  roar: { file: "dragon/roar.mp3", from: 0.94, length: 1.65, level: 0.95 },
  breath: { file: "dragon/fire-breath.mp3", from: 1.4, length: 2.2, level: 1.18 },
  swell: { file: "dragon/fireball-swell.mp3", from: 0.34, length: 0.95, level: 1.1 },
} as const;
export type DragonSample = keyof typeof DRAGON_SAMPLES;

/** Which recordings each voice needs; with any of them missing it falls back to `synthVoice`. */
const RECORDED_VOICES: Partial<Record<SceneVoice, readonly DragonSample[]>> = {
  spit: ["burst"],
  spitBig: ["burst", "fireball", "roar"],
  inhale: ["swell"],
  breath: ["breath", "roar"],
  fireImpact: ["explosion"],
  blaze: ["fireball", "explosion"],
  blazeBig: ["combust", "fireball"],
  grunt: ["roar"],
  roar: ["roar"],
  fall: ["roar", "combust"],
};

/**
 * A dragon sound from its recordings, with a synthesized sub-bass punch under
 * the fire (what a recording thin on low end lacks) and a little burning
 * crackle. Returns false when a recording it needs is not loaded.
 */
export function recordedVoice(
  context: BaseAudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  samples: ReadonlyMap<DragonSample, AudioBuffer>,
  name: SceneVoice,
  now: number,
): boolean {
  const needs = RECORDED_VOICES[name];
  if (needs === undefined || needs.some((key) => !samples.has(key))) return false;
  const { thump, crackle } = voiceTools(context, out, noise, now);
  /** One stretch of a recording: `at` s from now, faded in and out, optionally darkened. */
  const layer = (key: DragonSample, at: number, gain: number, options: { rate?: number; skip?: number; length?: number; lowpass?: number } = {}): void => {
    const spec = DRAGON_SAMPLES[key];
    const buffer = samples.get(key)!;
    const rate = options.rate ?? 1;
    const offset = spec.from + (options.skip ?? 0);
    const length = Math.min(options.length ?? spec.length, Math.max(0.05, buffer.duration - offset)) / rate;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const envelope = context.createGain();
    const start = now + at;
    const level = gain * spec.level;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(level, start + 0.006);
    envelope.gain.setValueAtTime(level, start + length * 0.7);
    envelope.gain.linearRampToValueAtTime(0, start + length);
    let tail: AudioNode = envelope;
    if (options.lowpass !== undefined) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = options.lowpass;
      envelope.connect(filter);
      tail = filter;
    }
    source.connect(envelope);
    tail.connect(out);
    source.start(start, offset, length * rate + 0.02);
  };
  const vary = (): number => rand(0.94, 1.06);

  switch (name) {
    case "spit":
      // A burst of flame leaving the jaws, over a deep punch.
      layer("burst", 0, 0.95, { rate: vary() });
      thump(0, 0.17, 115, 42, 0.62);
      break;
    case "spitBig":
      // The finisher: a snarl, the burst, and the fireball's own boom under it.
      layer("roar", 0, 0.5, { rate: 1.12, length: 0.62 });
      layer("burst", 0.02, 0.8, { rate: 0.86 });
      layer("fireball", 0.05, 0.85, { rate: 0.9, lowpass: 5200 });
      thump(0.03, 0.3, 95, 30, 0.95);
      crackle(0.2, 0.4, 4, 0.06);
      break;
    case "inhale":
      layer("swell", 0, 0.6);
      break;
    case "breath":
      layer("roar", 0, 0.42, { length: 0.9 });
      layer("breath", 0.03, 1);
      thump(0, 0.32, 85, 32, 0.8);
      break;
    case "fireImpact":
      layer("explosion", 0, 0.5, { rate: rand(1, 1.12), length: 0.6, lowpass: 6500 });
      thump(0, 0.14, 120, 50, 0.4);
      break;
    case "blaze":
      // An enemy goes up in flames: a heavy burst and its burning.
      layer("fireball", 0, 1, { rate: rand(0.88, 1) });
      layer("explosion", 0.03, 0.42, { length: 0.8, lowpass: 5000 });
      thump(0, 0.38, 82, 28, 0.95);
      crackle(0.12, 0.55, 6, 0.07);
      break;
    case "blazeBig":
      layer("combust", 0, 1);
      layer("fireball", 0.02, 0.8, { rate: 0.8 });
      thump(0, 0.8, 66, 22, 1);
      crackle(0.2, 1.2, 12, 0.07);
      break;
    case "grunt":
      layer("roar", 0, 0.55, { rate: 1.25, skip: 0.2, length: 0.5 });
      break;
    case "roar":
      layer("roar", 0, 0.95);
      break;
    case "fall":
      // Defeat: the roar slowed to a low groan, the fire dying out under it.
      layer("roar", 0, 0.6, { rate: 0.68, lowpass: 1300 });
      layer("combust", 0.25, 0.38, { skip: 0.25, lowpass: 2200 });
      thump(0, 0.7, 58, 22, 0.7);
      break;
    default:
      return false;
  }
  return true;
}

/**
 * Every dragon voice goes through this: a soft saturation that thickens the
 * fire (harmonics, so it reads louder on small speakers) and a compressor
 * that keeps overlapping spits punchy instead of clipping.
 */
export function voiceBus(context: BaseAudioContext, destination: AudioNode): AudioNode {
  const drive = context.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let index = 0; index < curve.length; index += 1) {
    const x = (index / (curve.length - 1)) * 2 - 1;
    curve[index] = Math.tanh(x * 1.8) / Math.tanh(1.8);
  }
  drive.curve = curve;
  drive.oversample = "2x";
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 8;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.16;
  const trim = context.createGain();
  trim.gain.value = 0.9;
  drive.connect(compressor).connect(trim).connect(destination);
  return drive;
}

/** The synthesized pieces the dragon's sounds are built from. */
function voiceTools(context: BaseAudioContext, out: AudioNode, noise: AudioBuffer, now: number) {
  const fire = (start: number, length: number, from: number, to: number, level: number, attack = 0.03, q = 0.7): void => {
    const source = context.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = rand(0.9, 1.1);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, now + start);
    filter.frequency.exponentialRampToValueAtTime(to, now + start + length);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, now + start);
    envelope.gain.exponentialRampToValueAtTime(level, now + start + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
    source.connect(filter).connect(envelope).connect(out);
    source.start(now + start, rand(0, 1), length + 0.05);
  };
  const thump = (start: number, length: number, from: number, to: number, level: number): void => {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(from, now + start);
    osc.frequency.exponentialRampToValueAtTime(to, now + start + length);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, now + start);
    envelope.gain.exponentialRampToValueAtTime(level, now + start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
    osc.connect(envelope).connect(out);
    osc.start(now + start);
    osc.stop(now + start + length + 0.02);
  };
  // Dry ticks of burning: short, soft, scattered.
  const crackle = (start: number, length: number, count: number, level: number): void => {
    for (let index = 0; index < count; index += 1) {
      const at = now + start + rand(0, length);
      const source = context.createBufferSource();
      source.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = rand(1400, 2600);
      filter.Q.value = 1.2;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(level * rand(0.5, 1), at);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + rand(0.008, 0.02));
      source.connect(filter).connect(envelope).connect(out);
      source.start(at, rand(0, 1.5), 0.03);
    }
  };
  const growl = (start: number, length: number, pitch: number, drop: number, level: number, rasp = 0.5): void => {
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, now + start);
    envelope.gain.exponentialRampToValueAtTime(level, now + start + Math.min(0.05, length * 0.18));
    envelope.gain.setTargetAtTime(0.0001, now + start + length * 0.55, length * 0.16);
    const formants = [430, 980].map((frequency, index) => {
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(frequency * 1.1, now + start);
      filter.frequency.exponentialRampToValueAtTime(frequency * 0.85, now + start + length);
      filter.Q.value = index === 0 ? 3.5 : 5;
      filter.connect(envelope);
      return filter;
    });
    // A rough edge: the voice trembles, and breath rasps through it.
    const tremolo = context.createOscillator();
    tremolo.frequency.value = rand(24, 34);
    const depth = context.createGain();
    depth.gain.value = pitch * 0.08;
    tremolo.connect(depth);
    const end = now + start + length + 0.3;
    for (const detune of [0, 9]) {
      const osc = context.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(pitch, now + start);
      osc.frequency.exponentialRampToValueAtTime(pitch * drop, now + start + length);
      osc.detune.value = detune * 10;
      depth.connect(osc.frequency);
      for (const filter of formants) osc.connect(filter);
      osc.start(now + start);
      osc.stop(end);
    }
    const breath = context.createBufferSource();
    breath.buffer = noise;
    const breathLevel = context.createGain();
    breathLevel.gain.value = rasp;
    breath.connect(breathLevel);
    for (const filter of formants) breathLevel.connect(filter);
    breath.start(now + start, rand(0, 1), length + 0.3);
    tremolo.start(now + start);
    tremolo.stop(end);
    // The saws' upper harmonics leak past the formants as a buzz: a throat is darker.
    const throat = context.createBiquadFilter();
    throat.type = "lowpass";
    throat.frequency.value = 1500;
    throat.Q.value = 0.5;
    envelope.connect(throat).connect(out);
  };
  return { fire, thump, crackle, growl };
}

/**
 * For the visual/audio check scenarios: renders a dragon sound offline and
 * measures it (peak, loudness, attack, and how bright it is: the spectral
 * centroid, which is high for hiss and swish, low for a deep roar).
 */
export async function voiceStats(name: SceneVoice, recorded = true, audioBase = DEFAULT_AUDIO_BASE): Promise<Record<string, number>> {
  const rate = 44100;
  const context = new OfflineAudioContext(1, rate * 3, rate);
  const samples = new Map<DragonSample, AudioBuffer>();
  if (recorded) {
    for (const [key, spec] of Object.entries(DRAGON_SAMPLES) as [DragonSample, (typeof DRAGON_SAMPLES)[DragonSample]][]) {
      const data = await (await fetch(audioUrl(spec.file, audioBase))).arrayBuffer();
      samples.set(key, await context.decodeAudioData(data));
    }
  }
  const bus = voiceBus(context, context.destination);
  const noise = noiseBuffer(context);
  if (!recordedVoice(context, bus, noise, samples, name, 0)) synthVoice(context, bus, noise, name, 0);
  return bufferStats(await context.startRendering());
}

/** The same measures for any decoded buffer (a recorded sample, to compare). */
export function bufferStats(buffer: AudioBuffer): Record<string, number> {
  const data = buffer.getChannelData(0);
  let peak = 0;
  let peakAt = 0;
  let sum = 0;
  let end = 0;
  for (let index = 0; index < data.length; index += 1) {
    const value = Math.abs(data[index]!);
    if (value > peak) {
      peak = value;
      peakAt = index;
    }
    if (value > 0.003) end = index;
    sum += value * value;
  }
  const rms = Math.sqrt(sum / Math.max(1, end));
  // Spectral centroid by a plain DFT over a few 1024-sample windows.
  const size = 1024;
  let weighted = 0;
  let total = 0;
  for (let start = 0; start + size < end; start += Math.max(size, Math.floor(end / 8))) {
    for (let bin = 1; bin < size / 2; bin += 2) {
      let re = 0;
      let im = 0;
      for (let n = 0; n < size; n += 1) {
        const angle = (2 * Math.PI * bin * n) / size;
        const sample = data[start + n]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * n) / size));
        re += sample * Math.cos(angle);
        im -= sample * Math.sin(angle);
      }
      const magnitude = Math.hypot(re, im);
      weighted += magnitude * ((bin * buffer.sampleRate) / size);
      total += magnitude;
    }
  }
  return {
    seconds: Math.round((end / buffer.sampleRate) * 100) / 100,
    peak: Math.round(peak * 100) / 100,
    rms: Math.round(rms * 1000) / 1000,
    attackMs: Math.round((peakAt / buffer.sampleRate) * 1000),
    centroidHz: Math.round(total > 0 ? weighted / total : 0),
  };
}
