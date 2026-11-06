import * as THREE from "three";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIREFLY_SOUND, LabSound, SPRINT_TAKES } from "../../src/lab/sound";
import { BUS_GAIN, FIREFLY_LEVELS, MASTER_GAIN } from "../../src/lab/sound-tiers";
import { FOE_AURA_CLIPS, FoeFlipbookFx, type FoePose } from "../../src/lab/foe-flipbook-fx";
import { HERO_PRESENCE_IDS, HeroPresenceFx, type HeroPresencePose } from "../../src/lab/hero-presence-fx";
import { FlipbookLibrary, parseFlipbookManifest } from "../../src/view/skills/flipbook";

const picks = {
  "guard-body": [3, -18, 0.0096],
  "boss-entrance-roar": [6, -13.5, 0.0094],
  "boss-phase2-roar": [3, -13.5, 0.0193],
  "boss-phase-shockwave": [1, -22, 0.014],
  "elite-reveal-aura": [3, -18, 0],
  "ui-skill-ready": [1, -18, 0],
} as const;
const ids = (sound: LabSound) => sound.takes().map((t) => t.url.slice(FIREFLY_SOUND.length).split("/")[0]!.replace("tt-sfx-", ""));
async function recording() {
  vi.stubGlobal("fetch", async () => ({ ok: false, headers: { get: () => "text/html" } }));
  const sound = new LabSound(); await sound.record(); return sound;
}
function beast(boss = true): FoePose {
  return { target: 0, x: 2, y: 1, z: 3, radius: 0.5, serial: 1, species: boss ? "thiet-boi-lang-vuong" : "thiet-giap-tru", beastTier: boss ? 4 : 2, elite: true, hpFraction: 1 };
}
function foe(sound: LabSound, p = beast(), search = "") {
  const live = new Set([0]);
  const fx = new FoeFlipbookFx(new THREE.Group(), "/v/", {
    alive: (target) => live.has(target), pose: (_, out) => { Object.assign(out, p); }, auraCount: () => 1, auraTarget: () => 0,
  }, search, { sound: (id) => { sound.sprint(id); } });
  for (const c of FOE_AURA_CLIPS) {
    const meta = parseFlipbookManifest({ flipbooks: { [c.id]: { file: c.id + ".png", cols: 4, rows: 4, frames: 16, fps: 8, cell: [320, 160], loop: c.id.endsWith("loop"), mode: "fire" } } }, "/v/").get(c.id)!;
    fx.adopt(c, meta, new THREE.Texture());
  }
  return { fx, p, live };
}
function hero(sound: LabSound, search = "") {
  const fx = new HeroPresenceFx(new THREE.Group(), "/v/", search, undefined, (id) => { sound.sprint(id); });
  const p: HeroPresencePose = { x: 0, y: 0, z: 0, height: 2, guardActive: true, ultimateReady: false };
  for (const id of HERO_PRESENCE_IDS) {
    const meta = parseFlipbookManifest({ flipbooks: { [id]: { file: id + ".png", cols: 4, rows: 4, frames: 16, fps: 8, cell: [320, 320], loop: true, mode: "fire" } } }, "/v/").get(id)!;
    fx.adopt(id, meta, new THREE.Texture());
  }
  return { fx, p, step: (dt = 1 / 60) => fx.update(dt, dt, p) };
}
beforeEach(() => { vi.spyOn(FlipbookLibrary.prototype, "load").mockResolvedValue(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("B3 activation sounds (node, recorded files only)", () => {
  it("registers each exact WAV/prompt, measured level, onset and safe playback target", () => {
    for (const [id, [number, target, onset]] of Object.entries(picks)) {
      const cue = SPRINT_TAKES[id]!;
      expect(cue.file).toBe(`tt-sfx-${id}/take${number}.wav`);
      const path = resolve("art-src/lab/firefly-sprint-2026-11-05/sound", cue.file);
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path).subarray(0, 4).toString()).toBe("RIFF");
      expect(readFileSync(path.replace(".wav", ".prompt.txt"), "utf8")).toContain("job: tt-sfx-" + id);
      const level = FIREFLY_LEVELS[cue.file]!;
      expect(level).toBeDefined();
      const bus = cue.options.bus ?? "combat", fixed = MASTER_GAIN * (bus === "ui" ? 1 : BUS_GAIN[bus]);
      expect(level[0] + 20 * Math.log10(cue.gain * fixed)).toBeCloseTo(target, 6);
      expect(level[1] + 20 * Math.log10(cue.gain * fixed)).toBeLessThanOrEqual(-1);
      expect(cue.onset).toBe(onset);
    }
    expect(SPRINT_TAKES["ui-skill-ready"]!.options).toEqual({ bus: "ui", send: 0 });
  });

  it("fires entrance once and both phase layers on the exact 50% crossing, rearming on a new serial", async () => {
    const sound = await recording(), { fx, p } = foe(sound);
    fx.update(0);
    for (let i = 0; i < 180; i++) fx.update(1 / 60);
    expect(ids(sound)).toEqual(["boss-entrance-roar"]);
    p.hpFraction = 0.5001; fx.update(0);
    expect(ids(sound)).toHaveLength(1);
    sound.update(3); p.hpFraction = 0.5; fx.update(0);
    expect(ids(sound)).toEqual(["boss-entrance-roar", "boss-phase2-roar", "boss-phase-shockwave"]);
    expect(sound.takes().slice(1).map((t) => t.at)).toEqual([3, 3]);
    p.hpFraction = 0.8; fx.update(0.1); p.hpFraction = 0.2; fx.update(3);
    expect(ids(sound)).toHaveLength(3);
    p.serial = 2; p.hpFraction = 1; fx.update(0); p.hpFraction = 0.4; fx.update(0);
    expect(ids(sound).slice(3)).toEqual(["boss-entrance-roar", "boss-phase2-roar", "boss-phase-shockwave"]);
  });

  it("does not invent a phase crossing for a boss first seen below half health", async () => {
    const sound = await recording(), p = beast(); p.hpFraction = 0.4;
    const { fx } = foe(sound, p); fx.update(0); fx.update(2);
    expect(ids(sound)).toEqual(["boss-entrance-roar"]);
  });

  it("accents the elite aura once per activation, keeping its visual loop silent", async () => {
    const sound = await recording(), { fx, live, p } = foe(sound, beast(false));
    fx.update(0); for (let i = 0; i < 180; i++) fx.update(1 / 60);
    expect(ids(sound)).toEqual(["elite-reveal-aura"]);
    fx.stop(0); fx.update(1); expect(ids(sound)).toHaveLength(1);
    live.delete(0); fx.update(0); live.add(0); fx.update(0);
    p.serial = 2; fx.update(0);
    expect(ids(sound)).toEqual(Array(3).fill("elite-reveal-aura"));
    fx.clear(); fx.update(0); expect(ids(sound)).toHaveLength(4);
  });

  it("keeps ordinary beasts silent and obeys foeaura=0 for entrance, elite and threshold cues", async () => {
    const sound = await recording(), ordinary = beast(false); ordinary.elite = false;
    foe(sound, ordinary).fx.update(0);
    for (const p of [beast(), beast(false)]) {
      const { fx } = foe(sound, p, "?foeaura=0");
      fx.update(0); p.hpFraction = 0.4; fx.update(1); fx.clear(); fx.update(0);
    }
    expect(ids(sound)).toEqual([]);
  });

  it("accents readiness once, rearming on false-to-true even during fade-out and after clear", async () => {
    const sound = await recording(), { fx, p, step } = hero(sound);
    step(); expect(ids(sound)).toEqual([]);
    p.ultimateReady = true; step(); for (let i = 0; i < 180; i++) step();
    expect(ids(sound)).toEqual(["ui-skill-ready"]);
    p.ultimateReady = false; step(); p.ultimateReady = true; step();
    fx.clear(); step();
    expect(ids(sound)).toEqual(Array(3).fill("ui-skill-ready"));
    expect(sound.takes().every((t) => t.ui && t.send === 0)).toBe(true);
  });

  it("accents golden body only on a successful active-guard block, never on its loop or fading frames", async () => {
    const sound = await recording(), { fx, p, step } = hero(sound);
    step(0.01); expect(ids(sound)).toEqual([]); // Guard alone does not activate the shell.
    p.guardActive = false; fx.block(); step(0.01); expect(ids(sound)).toEqual([]);
    step(0.2); p.guardActive = true; step(0.01); expect(ids(sound)).toEqual([]);
    fx.block(); step(0.01); expect(ids(sound)).toEqual(["guard-body"]);
    fx.block(); step(0.01); expect(ids(sound)).toHaveLength(1); // Extending the same activation stays silent.
    step(0.17); step(0.1); expect(ids(sound)).toHaveLength(1);
    fx.block(); step(0.01); expect(ids(sound)).toEqual(["guard-body", "guard-body"]);
    const take = sound.takes()[0]!;
    expect(take.ui).toBe(true); expect(take.send).toBe(0);
    expect(take.fade![0]).toBeCloseTo(0.16); expect(take.fade![1]).toBe(0.25);
    fx.clear(); step(0.01); expect(ids(sound)).toHaveLength(2);
    fx.block(); step(0.01); expect(ids(sound)).toHaveLength(3);
  });

  it("obeys presence=0 even when readiness and successful blocks activate", async () => {
    const sound = await recording(), { fx, p, step } = hero(sound, "?presence=0");
    p.ultimateReady = true; fx.block(); step(2); fx.clear(); step(1);
    expect(ids(sound)).toEqual([]);
  });

  it("connects the production presence hooks to the existing sprint player", () => {
    const source = readFileSync("src/lab/skills-main.ts", "utf8");
    expect(source).toContain('sound: (id, x) => { sound.sprint(id, { pan: Math.max(-1, Math.min(1, x / 22)) }); }');
    expect(source).toContain('new HeroPresenceFx(view.layers.fx, "/art-src/lab/vfx/", location.search, undefined, (id) => { sound.sprint(id); })');
  });
});
