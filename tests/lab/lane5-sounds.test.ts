import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIREFLY_SOUND, LabSound, SPRINT_TAKES } from "../../src/lab/sound";
import { BUS_GAIN, FIREFLY_LEVELS, MASTER_GAIN } from "../../src/lab/sound-tiers";
import { QiSwarmLab } from "../../src/lab/qi-dragon-swarm";
import { SwarmTimeline } from "../../src/view/skills/qi-dragon-swarm";
import { CUTIN_ART, CutIn } from "../../src/lab/cutin";
import { LabBus } from "../../src/lab/events";
import type { SimEvent, World } from "../../src/content/types";
import type { SwarmSlot } from "../../src/view/skills/qi-dragon-swarm";

async function recording(): Promise<LabSound> {
  vi.stubGlobal("fetch", async () => ({ ok: false, headers: { get: () => "text/html" } }));
  const sound = new LabSound();
  await sound.record();
  return sound;
}
const ids = (sound: LabSound): string[] => sound.takes().filter((t) => t.url.startsWith(FIREFLY_SOUND)).map((t) => t.url.slice(FIREFLY_SOUND.length).split("/")[0]!);

// Node only: real asset paths and recorded audio events; no browser or audio device.
describe("lane 5: existing lab events use measured sprint files", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("has a real WAV and exact prompt, measured levels, safe gain and valid onset for every new file", () => {
    for (const [id, cue] of Object.entries(SPRINT_TAKES)) {
      expect(cue.file.startsWith("tt-sfx-" + id + "/"), id).toBe(true);
      expect(existsSync(resolve("art-src/lab/firefly-sprint-2026-11-05/sound", cue.file)), cue.file).toBe(true);
      const prompt = resolve("art-src/lab/firefly-sprint-2026-11-05/sound", cue.file.replace(/\.wav$/, ".prompt.txt"));
      expect(readFileSync(prompt, "utf8").trim().length).toBeGreaterThan(10);
      const level = FIREFLY_LEVELS[cue.file];
      expect(level, cue.file).toBeDefined();
      const bus = cue.options.bus ?? "combat";
      const fixed = MASTER_GAIN * (bus === "ui" ? 1 : BUS_GAIN[bus]);
      expect(level![1] + 20 * Math.log10(cue.gain * fixed), cue.file).toBeLessThanOrEqual(-1 + 1e-8);
      expect(cue.onset).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(cue.gain)).toBe(true);
    }
  });

  it("maps the greybox's actual F0, F3, F49, F57, F78 to all 19 layers, alternating roars and bells", async () => {
    const sound = await recording();
    for (let cast = 0; cast < 2; cast += 1) for (let frame = 0; frame <= 300; frame += 1) {
      sound.twinFrame(frame);
      sound.update(1 / 60);
    }
    const cues = ids(sound);
    expect(new Set(cues).size).toBe(19);
    expect(cues.filter((id) => id === "tt-sfx-twin-bronze-bell-high")).toHaveLength(2);
    expect(cues.filter((id) => id === "tt-sfx-twin-bell-giant")).toHaveLength(1);
    expect(cues.filter((id) => id === "tt-sfx-twin-bell-giant-b")).toHaveLength(1);
    const byFrame = (frame: number) => sound.takes().filter((t) => Math.abs(t.at - frame / 60) < 1e-6).map((t) => t.url);
    expect(byFrame(3).some((url) => url.includes("twin-fire-whoosh-a/"))).toBe(true);
    expect(byFrame(49).some((url) => url.includes("twin-dragon-roar-a/"))).toBe(true);
    expect(byFrame(57).some((url) => url.includes("twin-bell-giant/"))).toBe(true);
    expect(byFrame(78).some((url) => url.includes("twin-ember-crackle/"))).toBe(true);
    expect(sound.takes().find((t) => t.url.includes("twin-dragon-roar-a/"))!.pan).toBe(-0.45);
    expect(sound.takes().find((t) => t.url.includes("twin-dragon-roar-b/"))!.pan).toBe(0.45);
  });

  it("uses accepted swarm packet launch/dive ticks once, including paused/repeated draw frames", async () => {
    const sound = await recording();
    const slots = [{ packet: { castId: 7, castTick: 10, dragons: [{ launchTick: 2, diveTick: 40 }] } }] as unknown as SwarmSlot[];
    sound.swarmFrame(slots, 10);
    expect(ids(sound)).toEqual([]);
    sound.swarmFrame(slots, 12);
    sound.swarmFrame(slots, 12);
    expect(ids(sound).filter((id) => id.includes("fire-whoosh-a"))).toHaveLength(1);
    sound.swarmFrame(slots, 49);
    expect(ids(sound).some((id) => id.includes("dragon-roar"))).toBe(false);
    sound.swarmFrame(slots, 50);
    sound.swarmFrame(slots, 50);
    expect(ids(sound).filter((id) => id.includes("dragon-roar"))).toHaveLength(2);
    sound.reset();
    sound.swarmFrame(slots, 12);
    expect(sound.asked["take:" + SPRINT_TAKES["twin-fire-whoosh-a"]!.file]).toBe(1);
  });
  it("sounds one species reaction per shared bucket, and closes a mass kill once for 100 beasts", async () => {
    const sound = await recording(), bus = new LabBus();
    const hit = { ...bus.impact, beastTier: 1, killed: false };
    for (let i = 0; i < 100; i += 1) { sound.beast(hit); sound.on(hit); }
    expect(ids(sound)).toEqual(["tt-sfx-confirm-flesh", "tt-sfx-beast-wolf-hurt"]);
    sound.update(0.05);
    sound.beast(hit); sound.on(hit);
    expect(ids(sound).at(-1)).toBe("tt-sfx-beast-wolf-snarl");
    const death = { ...bus.death, beastTier: 1 };
    for (let i = 0; i < 100; i += 1) { sound.beast(death); sound.on(death); }
    expect(ids(sound).filter((id) => id === "tt-sfx-beast-wolf-death")).toHaveLength(1);
    sound.update(0.05);
    expect(ids(sound).filter((id) => id === "tt-sfx-beast-common-dissolve-chain")).toHaveLength(1);
    expect(ids(sound).filter((id) => id.startsWith("tt-sfx-mass-kill-"))).toHaveLength(1);
    sound.update(1);
    expect(ids(sound).filter((id) => id.startsWith("tt-sfx-mass-kill-"))).toHaveLength(1);
    expect(sound.takes().every((t) => t.group === "impact" || t.group === "death")).toBe(true);
  });

  it.each([
    [0, "swarm-kill-crunch"], [1, "beast-wolf-death"], [2, "beast-boar-death"], [4, "boss-death"],
  ] as const)("maps herd tier %s to %s without a hurt on a lethal hit", async (beastTier, expected) => {
    const sound = await recording(), bus = new LabBus();
    const hit = { ...bus.impact, beastTier, killed: true, material: beastTier >= 2 ? "stone" as const : "flesh" as const };
    sound.beast(hit); sound.on(hit);
    const death = { ...bus.death, beastTier };
    sound.beast(death); sound.on(death);
    expect(ids(sound)).toContain("tt-sfx-" + expected);
    expect(ids(sound).some((id) => id.endsWith("-hurt"))).toBe(false);
  });

  it("reads the greybox crow's actual species, rejects recycled references and keeps its material bucket", async () => {
    const sound = await recording();
    const world = { beasts: { list: [{ serial: 5, species: "hoa-nha", boss: false }] } } as unknown as World;
    const event = { type: "hit", beast: { slot: 0, serial: 5 }, source: "slot2", x: 0, z: 0, hpLeft: 2 } as SimEvent;
    sound.simBeast(event, world);
    sound.simBeast(event, world);
    expect(ids(sound)).toEqual(["tt-sfx-confirm-flesh", "tt-sfx-beast-crow-hurt"]);
    sound.update(0.05);
    sound.simBeast({ ...event, beast: { slot: 0, serial: 4 } } as SimEvent, world);
    expect(ids(sound)).toHaveLength(2);
    sound.simBeast({ type: "death", beast: { slot: 0, serial: 5 }, x: 0, z: 0 } as SimEvent, world);
    expect(ids(sound).at(-1)).toBe("tt-sfx-beast-crow-death");
  });

  it("adds the correct k5/k7 layers only on their existing release/world events", async () => {
    const sound = await recording(), bus = new LabBus();
    sound.skill({ ...bus.release, slot: "k1" });
    sound.skill({ ...bus.world, slot: "k7", phase: "hush" });
    expect(ids(sound)).toEqual([]);
    sound.skill({ ...bus.release, slot: "k5" });
    expect(ids(sound)).toEqual(["tt-sfx-k5-release-instant", "tt-sfx-k5-release-tail", "tt-sfx-k5-sky-split", "tt-sfx-ult-sword-rain"]);
    sound.skill({ ...bus.release, slot: "k7" });
    sound.skill({ ...bus.world, slot: "k5", phase: "open" });
    sound.skill({ ...bus.world, slot: "k7", phase: "open" });
    sound.skill({ ...bus.world, slot: "k7", phase: "climax" });
    sound.skill({ ...bus.world, slot: "k7", phase: "close" });
    expect(new Set(ids(sound))).toEqual(new Set([
      "tt-sfx-k5-release-instant", "tt-sfx-k5-release-tail", "tt-sfx-k5-sky-split", "tt-sfx-ult-sword-rain",
      "tt-sfx-ult-release-instant", "tt-sfx-world-open-punch", "tt-sfx-ult-heaven-drone", "tt-sfx-ult-preverb-swell",
      "tt-sfx-k7-sword-river", "tt-sfx-ult-climax-boom", "tt-sfx-ult-close-tail",
    ]));
  });

  it("maps the cut-in wipe, shout, seal and exit to their exact recorded IDs", async () => {
    const sound = await recording();
    sound.cutin("open");
    expect(ids(sound)).toEqual(["tt-sfx-cutin-ink-whoosh", "tt-sfx-cutin-time-freeze"]);
    sound.cutin("shout"); sound.cutin("stamp"); sound.cutin("close");
    expect(ids(sound).slice(2)).toEqual([
      "tt-sfx-cutin-frame-hit", "tt-sfx-cutin-power-burst", "tt-sfx-cutin-sword-swarm",
      "tt-sfx-cutin-seal-stamp", "tt-sfx-cutin-exit-whoosh", "tt-sfx-cutin-bell-tail",
    ]);
  });

  it("sounds B's successful guard block with the shield and deflect files", async () => {
    const sound = await recording();
    sound.guardBlock(-11);
    expect(ids(sound)).toEqual(["tt-sfx-enemy-hit-hero-shield", "tt-sfx-guard-deflect"]);
    expect(sound.takes().every((t) => t.group === "impact" && t.pan === -0.5)).toBe(true);
    expect(readFileSync("src/lab/skills-main.ts", "utf8")).toContain("} else sound.guardBlock(caster.x);");
  });

  it("fires cut-in audio once on the rendered shout/stamp frames and natural end, and rearms after reset", () => {
    const element = () => ({ style: { setProperty() {} }, append() {}, replaceChildren() {}, offsetWidth: 900 });
    vi.stubGlobal("document", { createElement: element, fonts: { check: () => true } });
    vi.stubGlobal("Image", class { decode() { return Promise.resolve(); } });
    vi.stubGlobal("innerWidth", 1280); vi.stubGlobal("innerHeight", 720);
    const phases: string[] = [];
    const cutin = new CutIn(element() as unknown as HTMLElement, (phase) => phases.push(phase));
    const spec = { name: "SWORD RAIN", hanzi: "天河劍雨", seconds: 1.7, shoutAt: 1.08, art: CUTIN_ART.c };
    cutin.start(spec);
    cutin.update(1);
    expect(phases).toEqual(["open"]);
    cutin.update(0.09); cutin.update(0);
    expect(phases).toEqual(["open", "shout"]);
    cutin.update(0.05); cutin.update(0);
    expect(phases).toEqual(["open", "shout", "stamp"]);
    cutin.update(1); cutin.update(1);
    expect(phases).toEqual(["open", "shout", "stamp", "close"]);
    cutin.start(spec); cutin.update(1.2); cutin.stop(); cutin.update(1);
    expect(phases.slice(4)).toEqual(["open", "shout", "stamp"]);
  });

  it("keeps all five UI operations dry at T1 levels with their selected IDs and onset trims", async () => {
    const sound = await recording();
    const actions = ["confirm", "back", "panel-open", "panel-close", "cursor-move"] as const;
    for (const action of actions) sound.uiCue(action);
    expect(ids(sound)).toEqual(actions.map((action) => "tt-sfx-ui-" + action));
    for (const t of sound.takes()) {
      expect(t.ui).toBe(true); expect(t.send).toBe(0);
      const file = t.url.slice(FIREFLY_SOUND.length), level = FIREFLY_LEVELS[file]!;
      expect(level[0] + 20 * Math.log10(t.gain * MASTER_GAIN)).toBeLessThanOrEqual(-28 + 1e-8);
      expect(t.from ?? 0).toBe(SPRINT_TAKES[file.split("/")[0]!.replace("tt-sfx-", "")]!.onset);
    }
  });

  it("keeps the audio hooks at the existing lab operations", () => {
    const main = readFileSync("src/lab/skills-main.ts", "utf8");
    for (const call of [
      "sound.skill(e);", "sound.beast(e);", "sound.simBeast(event, qiSwarm!.world);", "sound.swarmEvent(event);",
      "sound.twinFrame(frame)", "sound.simBeast(event, world)", "sound.cutin(phase)",
      'sound.uiCue(collapsed ? "panel-close" : "panel-open")',
      'sound.uiCue(scSelect.value === "" ? "back" : "confirm")',
      'b.onpointerenter = () => sound.uiCue("cursor-move")',
    ]) expect(main).toContain(call);
    const greybox = readFileSync("src/lab/twin-pearl-greybox.ts", "utf8");
    expect(greybox).toContain("this.soundFrame(this.world.tick - live.startTick - 1)");
    expect(greybox).toContain("this.soundEvent(e, this.world)");
  });

  it("reaches every registered new take from its named existing event, including alternates", async () => {
    const sound = await recording(), bus = new LabBus();
    for (let cast = 0; cast < 2; cast += 1) for (let frame = 0; frame <= 78; frame += 1) { sound.twinFrame(frame); sound.update(1 / 60); }
    for (const beastTier of [0, 1, 1, 2, 2, 4]) {
      const hit = { ...bus.impact, beastTier, material: beastTier >= 2 ? "stone" as const : "flesh" as const };
      sound.beast(hit); sound.on(hit); sound.update(0.05);
      const death = { ...bus.death, beastTier };
      sound.beast(death); sound.on(death); sound.update(0.05);
    }
    for (const kind of ["impact", "death"] as const) {
      const event = kind === "impact" ? { ...bus.impact } : { ...bus.death };
      sound.beast(event, "hoa-nha"); sound.on(event); sound.update(0.05);
    }
    sound.beast({ ...bus.impact, material: "spirit" }); sound.update(0.05);
    for (let batch = 0; batch < 2; batch += 1) {
      for (let i = 0; i < 3; i += 1) { sound.beast(bus.death); sound.on(bus.death); }
      sound.update(0.05);
    }
    for (const slot of ["k5", "k7"]) {
      sound.skill({ ...bus.release, slot });
      for (const phase of ["open", "climax", "close"] as const) sound.skill({ ...bus.world, slot, phase });
    }
    for (const phase of ["open", "shout", "stamp", "close"] as const) sound.cutin(phase);
    sound.guardBlock(0);
    for (const action of ["confirm", "back", "panel-open", "panel-close", "cursor-move"] as const) sound.uiCue(action);
    expect(new Set(ids(sound))).toEqual(new Set(Object.keys(SPRINT_TAKES).map((id) => "tt-sfx-" + id)));
  });

  it("keeps audio on the real swarm's production lifecycle and accepted launch/dive ticks", async () => {
    const sound = await recording(), timeline = new SwarmTimeline();
    let lab: QiSwarmLab;
    const herd = { size: 6, autoRespawn: true, alive: () => true, x: (i: number) => i % 2 ? 12 : -12,
      z: (i: number) => -12 + i, tier: (i: number) => i === 5 ? 4 : i % 3, hitFromSim() {} };
    lab = new QiSwarmLab(herd, { timeline, event: (e) => timeline.event(e), frame() {}, reset: () => timeline.reset() },
      () => ({ x: 0, z: 3 }), (e) => { sound.swarmEvent(e); sound.simBeast(e, lab.world); });
    lab.cast();
    const packet = timeline.slots[0]!.packet;
    const launch = Math.min(...packet.dragons.map((d) => d.launchTick));
    for (let i = 0; i <= packet.endTick + 1; i += 1) {
      sound.swarmFrame(timeline.slots, lab.world.tick - 1);
      sound.update(1 / 60); lab.advance(1 / 60);
    }
    const take = (id: string) => sound.takes().find((t) => t.url.includes(id + "/"))!;
    expect(take("twin-bronze-bell-high").at).toBe(0);
    expect(take("twin-fire-whoosh-a").at).toBeCloseTo(launch / 60, 6);
    expect(take("twin-bell-giant").at).toBeCloseTo(packet.burstTick / 60, 6);
    expect(take("twin-ember-crackle").at).toBeCloseTo(packet.endTick / 60, 6);
    expect(timeline.slots).toEqual([null, null]);
  });

});
