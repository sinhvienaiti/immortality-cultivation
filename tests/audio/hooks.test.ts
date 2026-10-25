import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FrameInfo } from "../../src/app/contracts";
import { createSoundHooks, SilentMixer, soundFor } from "../../src/audio/hooks";
import { soundCard, SOUNDS } from "../../src/audio/catalog";
import { TELEGRAPHS } from "../../src/content/data/telegraphs";
import { AUDIO } from "../../src/content/rules";
import type { LocalState, SimEvent, World } from "../../src/content/types";

/** canon §22, D26, D44, Q6: M0a has silent sound hooks only; nothing is synthesized, nothing plays. */

const ROOT = join(__dirname, "../..");

/** Source text with comments and string/template literals blanked (what the code does, not what it says). */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = dir + "/" + entry.name;
    if (entry.isDirectory()) out.push(...filesUnder(path));
    else if (/\.(ts|mts|js|mjs)$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe("the sound catalogue (canon §22)", () => {
  it("marks every id silent: true", () => {
    expect(SOUNDS.length).toBeGreaterThan(0);
    for (const card of SOUNDS) expect(card.silent, card.id).toBe(true);
  });

  it("has ~55 unique ids in the canon's groups: keys 4, Kiếm 8, Thổ thể 8, beasts 14, Vương 6, tide 2, formation 4, UI 4, Tĩnh Tu 5", () => {
    const ids = SOUNDS.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(4 + 8 + 8 + 14 + 6 + 2 + 4 + 4 + 5);
    const count = (prefix: RegExp) => ids.filter((id) => prefix.test(id)).length;
    expect(count(/^key-/)).toBe(4);
    expect(count(/^kiem-/)).toBe(8);
    expect(count(/^tho-/)).toBe(8);
    expect(count(/^vuong-/)).toBe(6);
    expect(count(/^tt-/)).toBe(5);
    expect(count(/^ui-/)).toBe(4);
    expect(SOUNDS.filter((card) => card.milestone === "M1").map((card) => card.id).every((id) => id.startsWith("tho-"))).toBe(true);
  });

  it("gives each card the 4-part shape, a size, a length, a bus of canon §22 and a priority", () => {
    const buses = new Set<string>(AUDIO.buses);
    for (const card of SOUNDS) {
      expect(card.purpose.length, card.id).toBeGreaterThan(3);
      for (const part of ["prepare", "attack", "body", "tail"] as const) expect(card.shape[part], card.id + " " + part).toBeTruthy();
      expect(buses.has(card.bus), card.id + " bus").toBe(true);
      expect(card.lengthMs).toBeGreaterThan(0);
      expect(card.priority).toBeGreaterThanOrEqual(1);
      expect(card.priority).toBeLessThanOrEqual(6);
    }
    // Size follows the action's size (Q6): the Vương and the ultimate are huge, a key is tiny.
    expect(soundCard("kiem-ultimate")!.size).toBe("huge");
    expect(soundCard("vuong-roar")!.size).toBe("huge");
    expect(soundCard("key-letter")!.size).toBe("tiny");
    // Words banned by Q6 never describe a sound.
    for (const card of SOUNDS) expect([card.purpose, ...Object.values(card.shape)].join(" ").toLowerCase(), card.id).not.toMatch(/\b(puff|pop|balloon|thump|thud|bụp|thụp)\b/);
  });
});

describe("event → sound id", () => {
  const world = { seats: [{ loadout: { guard: "dash", tamPhap: "kiem-tam" } }], beasts: { list: [{ tier: "small" }, { tier: "boss" }] } } as unknown as World;
  const tick = 1;

  it("maps every id it can return to a catalogue card", () => {
    const events: SimEvent[] = [
      { tick, type: "word-progress", seat: 0, word: 1, typed: 1, result: "lock", letter: 0 },
      { tick, type: "word-progress", seat: 0, word: 1, typed: 2, result: "advance", letter: 1 },
      { tick, type: "word-progress", seat: 0, word: 1, typed: 3, result: "done", letter: 2 },
      { tick, type: "word-progress", seat: 0, word: 1, typed: 3, result: "wrong", letter: 2 },
      ...(["auto", "volley", "line", "zone-open", "ultimate"] as const).map((stage): SimEvent => ({ tick, type: "skill-fx", seat: 0, skill: "k", stage, x: 0, z: 0, toX: 0, toZ: 0, count: 1 })),
      { tick, type: "cast", state: "resolved", seat: 0, slot: 3, actionId: 1, wordId: "w", origin: { x: 0, z: 0 } },
      { tick, type: "ward", stage: "start", wardId: 1, seat: 0, origin: { x: 0, z: 0 }, charges: 3 },
      { tick, type: "ward", stage: "block", wardId: 1, seat: 0, origin: { x: 0, z: 0 }, charges: 2 },
      { tick, type: "hit", beast: { slot: 0, serial: 1 }, amount: 1, damageType: "typed", bucket: "typed", source: "slot1", seat: 0, grade: "ok", tier: 1, x: 0, z: 0, hpLeft: 1 },
      { tick, type: "hit", beast: { slot: 1, serial: 2 }, amount: 1, damageType: "typed", bucket: "typed", source: "slot1", seat: 0, grade: "ok", tier: 1, x: 0, z: 0, hpLeft: 1 },
      { tick, type: "death", beast: { slot: 0, serial: 1 }, species: "thach-thu", by: "slot1", x: 0, z: 0, cluster: 1, clusterDone: false, tier: 1 },
      { tick, type: "death", beast: { slot: 0, serial: 1 }, species: "nham-vien", by: "slot1", x: 0, z: 0, cluster: -1, clusterDone: false, tier: 3 },
      { tick, type: "death", beast: { slot: 1, serial: 2 }, species: "thiet-boi-lang-vuong", by: "slot5", x: 0, z: 0, cluster: -1, clusterDone: false, tier: 5 },
      { tick, type: "spawn", beast: { slot: 0, serial: 1 }, species: "phong-lang", gate: "A", x: 0, z: 0, elite: "cuong", cluster: -1, summoned: false },
      { tick, type: "formation", what: "heart", heart: 900, heartMax: 1000, node: null },
      { tick, type: "formation", what: "node-off", heart: 900, heartMax: 1000, node: "tam-nhan" },
      { tick, type: "formation", what: "linh-dich", heart: 950, heartMax: 1000, node: null },
      { tick, type: "pillar", stage: "hit", pillar: "west", rams: 1 },
      { tick, type: "phase", phase: "warning", wave: 1, endsAtTick: 300 },
      { tick, type: "phase", phase: "boss", wave: 6, endsAtTick: -1 },
      { tick, type: "wave-end", wave: 1 },
      { tick, type: "mechanism", stage: "built", slot: 0, mech: "kiem-thung", level: 1, x: 0, z: 0 },
      { tick, type: "mechanism", stage: "sold", slot: 0, mech: "kiem-thung", level: 1, x: 0, z: 0 },
      { tick, type: "linh-sa", seat: 0, delta: -30, total: 170, reason: "buy" },
      { tick, type: "rejected", command: "buy", reason: "linh-sa" },
      ...Object.keys(TELEGRAPHS).map((def): SimEvent => ({ tick, type: "telegraph", stage: "start", id: 1, def, shape: "circle", x: 0, z: 0, toX: 0, toZ: 0, reachM: 1, widthM: 2, strikeTick: 10, answers: ["move"], source: null })),
    ];
    const ids = events.map((event) => soundFor(event, 0, world));
    for (let k = 0; k < ids.length; k += 1) {
      expect(ids[k], events[k]!.type).not.toBeNull();
      expect(soundCard(ids[k]!), String(ids[k])).toBeDefined();
    }
    expect(ids.slice(0, 4)).toEqual(["key-lock", "key-letter", "key-word", "key-wrong"]);
    expect(soundFor(events[8]!, 0, world)).toBe("kiem-ultimate");
    expect(soundFor(events[9]!, 0, world)).toBe("kiem-dash");
  });

  it("plays only this machine's keys and skills", () => {
    expect(soundFor({ tick, type: "word-progress", seat: 1, word: 1, typed: 1, result: "advance", letter: 0 }, 0, world)).toBeNull();
    expect(soundFor({ tick, type: "skill-fx", seat: 1, skill: "k", stage: "line", x: 0, z: 0, toX: 0, toZ: 0, count: 1 }, 0, world)).toBeNull();
  });
});

describe("the silent mixer (canon §22 limits, nothing ever heard)", () => {
  it("keeps one sound to 4 starts in any 100 ms", () => {
    const mixer = new SilentMixer();
    const played = Array.from({ length: 6 }, (_, k) => mixer.play("key-letter", 1000 + k * 10));
    expect(played).toEqual([true, true, true, true, false, false]);
    expect(mixer.play("key-letter", 1100)).toBe(true);
    expect(mixer.stats.dropped).toBe(2);
  });

  it("holds at most 32 voices (16 at Low); a full mixer keeps the more important sound", () => {
    const low = new SilentMixer(AUDIO.voicesLow);
    expect(low.maxVoices).toBe(16);
    const mixer = new SilentMixer();
    expect(mixer.maxVoices).toBe(32);
    let now = 0;
    for (let k = 0; k < 40; k += 1) {
      mixer.play(k % 2 === 0 ? "tide-swarm" : "death-chain", now);
      now += 30;
    }
    expect(mixer.active(now)).toBeLessThanOrEqual(32);
    // A warning (priority 2) pushes out a swarm sound (6); an unknown id is dropped.
    expect(mixer.play("vuong-roar", now)).toBe(true);
    expect(mixer.play("no-such-sound", now)).toBe(false);
    expect(mixer.log.at(-1)).toBe("vuong-roar");
  });

  it("runs as a presenter: events become requests, Trận Lực under 30 % once, never anything audible", () => {
    const hooks = createSoundHooks({ seat: 0 });
    const world = { formation: { heart: 250, heartMax: 1000 }, seats: [], beasts: { list: [] } } as unknown as World;
    const info: FrameInfo = { dt: 1 / 60, worldDt: 1 / 60, alpha: 0, now: 5000, local: {} as LocalState };
    hooks.onEvents([{ tick: 1, type: "wave-end", wave: 2 }], world);
    hooks.frame(world, info);
    hooks.frame(world, { ...info, now: 6000 });
    expect(hooks.mixer.log).toEqual(["wave-end", "heart-low"]);
    hooks.dispose();
  });
});

describe("no sound source anywhere in src/audio (Q6, D26, D44)", () => {
  const files = filesUnder("src/audio");

  it("creates no oscillator, context, buffer source, media element or speech, and imports no kit sound module", () => {
    expect(files.length).toBeGreaterThan(0);
    const banned = /\b(OscillatorNode|createOscillator|AudioContext|webkitAudioContext|OfflineAudioContext|AudioBufferSourceNode|createBufferSource|createMediaElementSource|decodeAudioData|HTMLAudioElement|speechSynthesis|SpeechSynthesisUtterance)\b|\bnew\s+Audio\s*\(|\.play\s*\(\s*\)/;
    for (const path of files) {
      const text = readFileSync(join(ROOT, path), "utf8");
      expect(code(text), path).not.toMatch(banned);
      expect(text, path).not.toMatch(/from\s+["'][^"']*kit\/(feedback\/audio-cues|audio\/dragon-voice|feedback|audio)["']/);
    }
  });

  it("is checked by a scan that sees code, not comments or strings", () => {
    expect(code('const a = "createOscillator"; // OscillatorNode')).not.toMatch(/Oscillator/);
    expect(code("ctx.createOscillator();")).toMatch(/createOscillator/);
  });
});
