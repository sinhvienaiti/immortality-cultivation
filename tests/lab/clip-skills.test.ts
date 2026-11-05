import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { aimClipSkill, ClipSkillRunner, KEY8_SKILLS, KEY9_NAV, KEY9_SKILLS, MARK_S, type ClipSkill, type ClipSkillHost } from "../../src/lab/clip-skills";
import { EXPANSION, EXPANSION_SHOWCASE, SHOWCASE, Showcase, ULT_SHOWCASE } from "../../src/lab/showcase";
import { FlipbookPlayer, parseFlipbookManifest } from "../../src/view/skills/flipbook";
import type { TargetField } from "../../src/view/skills/targets";

/** A field of beasts at fixed points (none move); `hit` kills on the second blow. */
class Field implements TargetField {
  readonly hp: number[];
  constructor(readonly pts: readonly (readonly [number, number])[]) {
    this.hp = pts.map(() => 2);
  }
  get size(): number {
    return this.pts.length;
  }
  alive(i: number): boolean {
    return this.hp[i]! > 0;
  }
  x(i: number): number {
    return this.pts[i]![0];
  }
  z(i: number): number {
    return this.pts[i]![1];
  }
  midY(): number {
    return 0.5;
  }
  radius(): number {
    return 0.4;
  }
  tier(): number {
    return 0;
  }
  nearest(x: number, z: number, maxR: number): number {
    let best = -1;
    let bd = maxR;
    this.pts.forEach(([px, pz], i) => {
      const d = Math.hypot(px - x, pz - z);
      if (this.alive(i) && d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }
  inCircle(x: number, z: number, r: number, out: Int32Array): number {
    let n = 0;
    this.pts.forEach(([px, pz], i) => {
      if (this.alive(i) && Math.hypot(px - x, pz - z) <= r + 0.4) out[n++] = i;
    });
    return n;
  }
  inCapsule(ax: number, az: number, bx: number, bz: number, halfW: number, out: Int32Array): number {
    let n = 0;
    const vx = bx - ax;
    const vz = bz - az;
    const l2 = vx * vx + vz * vz || 1;
    this.pts.forEach(([px, pz], i) => {
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
      if (this.alive(i) && Math.hypot(px - ax - vx * t, pz - az - vz * t) <= halfW + 0.4) out[n++] = i;
    });
    return n;
  }
  hit(i: number): boolean {
    this.hp[i] = this.hp[i]! - 1;
    return this.hp[i]! <= 0;
  }
}

/** A dense group of six round (6, −10), a pair at (−12, −4), a lone beast at (0, −20). */
const HERD: readonly (readonly [number, number])[] = [
  [6, -10], [6.6, -10.4], [5.4, -9.6], [6.2, -9.2], [5.8, -10.8], [6.9, -9.7],
  [-12, -4], [-12.8, -4.5],
  [0, -20],
];

function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
  c.position.set(0, 26, 14);
  c.lookAt(0, 0, -6);
  c.updateMatrixWorld(true);
  return c;
}

interface Log {
  release: number;
  strikes: { t: number; role: string; at: THREE.Vector3 }[];
  blows: { t: number; i: number; power: number; role: string }[];
  status: { i: number; kind: string | null; rim: string }[];
}

function setup(rows: readonly ClipSkill[] = KEY8_SKILLS): { runner: ClipSkillRunner; player: FlipbookPlayer; show: Showcase; field: Field; log: Log; step: (s: number) => void } {
  const player = new FlipbookPlayer("/v/");
  const cam = camera();
  const show = new Showcase(player, {
    camera: cam, nearest: () => -1, at: (_i, out) => out.set(0, 0, -6), caster: (out) => out.set(0, 0, 3),
    light: () => {}, accent: () => {}, shake: () => {}, captionHost: null,
  }, ULT_SHOWCASE);
  const entries: Record<string, unknown> = {};
  // Peaks as the ult manifest measures them (art-src/lab/vfx/ult/manifest.json).
  for (const [id, role, pk] of [["pillar-thunder-single", "pillar", 0], ["pillar-thunder-field", "pillar", 0], ["pillar-fire-meteor", "pillar", 16],
    ["ult-metal-geng", "ultimate", 0], ["ult-ice-cold-silence", "ultimate", 18]] as const) {
    entries[id] = { file: `${id}.png`, cols: 4, rows: 8, frames: 31, fps: 6, cell: [640, 360], role, timing: { peak: pk, holdEnd: 23 } };
  }
  const lib = player.library("ult");
  for (const meta of parseFlipbookManifest({ flipbooks: entries }, "/v/ult/").values()) lib.add(meta, new THREE.Texture());
  const field = new Field(HERD);
  const log: Log = { release: -1, strikes: [], blows: [], status: [] };
  let t = 0;
  const host: ClipSkillHost = {
    targets: field,
    layer: new THREE.Group(),
    player,
    caster: (out) => out.set(0, 0, 3),
    release: () => (log.release = t),
    blow: (_s, i, _dx, _dz, power, role) => {
      log.blows.push({ t, i, power, role });
      return field.hit(i);
    },
    strike: (_s, at, role) => log.strikes.push({ t, role, at: at.clone() }),
    status: (i, kind, _sec, rim) => log.status.push({ i, kind, rim }),
  };
  const runner = new ClipSkillRunner(show, host, rows);
  const step = (s: number): void => {
    for (let k = 0; k < Math.round(s * 60); k += 1) {
      t += 1 / 60;
      runner.update(1 / 60);
      player.update(1 / 60);
    }
  };
  return { runner, player, show, field, log, step };
}

describe("lab clip skills (key 8 cast on the herd, lab-castable-skills.md batch 1)", () => {
  it("has a row for every key-8 item: its strikes, damage, radius, linger, a mark for every pillar", () => {
    const ids = new Set(KEY8_SKILLS.map((s) => s.id));
    for (const it of SHOWCASE) expect(ids.has(it.id), it.id).toBe(true);
    for (const s of KEY8_SKILLS) {
      expect(s.strikes.length).toBeGreaterThan(0);
      expect(s.strikes[0]!.frame).toBe("peak");
      for (const st of s.strikes) {
        expect(st.power).toBeGreaterThan(0);
        expect(st.power).toBeLessThanOrEqual(1);
        if (st.frame !== "peak") expect(st.frame).toBeLessThanOrEqual(24);
      }
      expect(s.strikes.some((st) => st.frame !== "peak")).toBe(s.guess !== undefined);
      expect(s.radius).toBeGreaterThan(0);
      if (s.linger > 0) {
        expect(s.linger).toBeGreaterThanOrEqual(1.5);
        expect(s.linger).toBeLessThanOrEqual(2.5);
      }
      if (s.id.startsWith("pillar-")) expect(s.mark).toBe(true);
      expect(s.damage).toBe(s.id.startsWith("ult-") ? "ult" : "heavy");
    }
  });

  it("aims from where the beasts stand: a point on the densest group, one point a beast for multi, the whole field spreading from its first beast", () => {
    const field = new Field(HERD);
    const caster = { x: 0, z: 3 };
    const centre = { x: 0, z: -6 };
    const row = (id: string): ClipSkill => KEY8_SKILLS.find((s) => s.id === id)!;
    const point = aimClipSkill(row("pillar-thunder-single"), field, caster, centre);
    expect(Math.hypot(point.anchor.x - 6, point.anchor.z - 10 * -1)).toBeLessThan(1.5);
    expect(point.hits.map((h) => h.i).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    const multi = aimClipSkill(row("pillar-thunder-field"), field, caster, centre);
    expect(multi.points.length).toBeGreaterThanOrEqual(3);
    expect(multi.points.length).toBeLessThanOrEqual(12);
    for (const p of multi.points) for (const q of multi.points) if (p !== q) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(1.4 * 1.5 - 1e-9);
    const whole = aimClipSkill(row("ult-metal-geng"), field, caster, centre);
    expect(whole.hits.length).toBe(HERD.length);
    expect(whole.hits[0]!.delay).toBe(0);
    expect(whole.hits.at(-1)!.delay).toBeGreaterThan(0.1);
    for (const h of whole.hits) expect(Math.hypot(h.dx, h.dz)).toBeCloseTo(1, 6);
    // The later shapes (batches 2–5) aim too: a line from the caster through the group, a cone and a sweep before them.
    for (const shape of ["line", "ring", "sweep", "path", "cone"] as const) {
      const a = aimClipSkill({ ...row("pillar-fire-meteor"), shape, radius: shape === "line" || shape === "path" ? 2 : 18 }, field, caster, centre);
      expect(a.hits.length, shape).toBeGreaterThan(0);
      // A spread starts on its first beast; a flight strikes when its body gets there.
      if (shape === "path") expect(a.hits[0]!.delay, shape).toBeGreaterThan(0);
      else expect(a.hits[0]!.delay, shape).toBe(0);
    }
    // No beast: the field's middle.
    expect(aimClipSkill(row("pillar-thunder-single"), new Field([]), caster, centre).anchor).toEqual(centre);
  });

  it("lands the first blow on the clip's peak frame (±1 frame): a fast attack to a late peak, a sky blow marked first", () => {
    const meteor = setup();
    meteor.runner.cast("pillar-fire-meteor");
    expect(meteor.log.release).toBe(0);
    const peakS = meteor.show.timeOf("pillar-fire-meteor", 16);
    expect(peakS).toBeCloseTo(0.2, 6);
    meteor.step(1);
    expect(Math.abs(meteor.log.strikes[0]!.t - peakS)).toBeLessThanOrEqual(1 / 60 + 1e-9);
    expect(Math.abs(meteor.log.blows[0]!.t - peakS)).toBeLessThanOrEqual(1 / 60 + 1e-9);
    expect(meteor.runner.last!.firstBlowAt).toBeCloseTo(meteor.runner.last!.strikeAt[0]!, 6);
    // Peak at frame 0: its mark leads by MARK_S, then the clip and its blow come together.
    const bolt = setup();
    bolt.runner.cast("pillar-thunder-single");
    bolt.step(1);
    expect(bolt.runner.last!.clipAt).toBeCloseTo(MARK_S, 1);
    expect(Math.abs(bolt.log.blows[0]!.t - MARK_S)).toBeLessThanOrEqual(1 / 60 + 1e-9);
    expect(bolt.log.strikes.map((s) => s.role)).toEqual(["primary"]);
  });

  it("strikes every beast with an ultimate, a later strike as a secondary blow, and leaves its status on the first", () => {
    const geng = setup();
    geng.runner.cast("ult-metal-geng");
    geng.step(4);
    const r = geng.runner.last!;
    expect(r.strikeFrames).toEqual([0, 12]);
    expect(geng.log.strikes.map((s) => s.role)).toEqual(["primary", "secondary"]);
    expect(new Set(geng.log.blows.filter((b) => b.role === "primary").map((b) => b.i)).size).toBe(HERD.length);
    // Two blows each: all dead by the second strike (this field kills on the second).
    expect(r.kills).toBe(HERD.length);
    expect(geng.log.status.length).toBe(HERD.length);
    expect(geng.log.status.every((s) => s.kind === "stun" && s.rim === "cut")).toBe(true);
    expect(geng.runner.active).toBe(0);
  });

  it("casts the selected item on 8 and selects the next on Shift+8, without a cooldown; a clip without a row plays as a video", () => {
    const { runner, show, log, step } = setup();
    expect(runner.selectNext()).toBe("pillar-thunder-single");
    expect(runner.selectNext()).toBe("pillar-thunder-field");
    expect(runner.cast()).toBe("pillar-thunder-field");
    expect(runner.cast()).toBe("pillar-thunder-field");
    expect(runner.active).toBe(2);
    step(1);
    expect(log.strikes.length).toBe(2);
    expect(show.current()).toBe("pillar-thunder-field");
    const bare = setup(KEY8_SKILLS.filter((s) => s.id !== "ult-ice-cold-silence"));
    expect(bare.runner.cast("ult-ice-cold-silence")).toBe("ult-ice-cold-silence");
    expect(bare.runner.active).toBe(0);
  });

  it("marks the ground before a sky blow and leaves it eroding after (the element's own ground-mark clip)", () => {
    const { runner, player, step } = setup();
    const meta = [...parseFlipbookManifest({ flipbooks: { "thunder-ground-mark": { file: "m.png", cols: 8, rows: 8, frames: 41, fps: 8, cell: [512, 288], role: "groundMark" } } }, "/v/thunder/").values()][0]!;
    runner.adoptMark("thunder", meta, new THREE.Texture());
    runner.cast("pillar-thunder-field");
    expect(runner.last!.marks).toBe(runner.last!.points);
    expect(runner.last!.marks).toBeGreaterThan(1);
    step(0.1);
    expect(player.live).toBe(0);
  });

  it("key 9's area designs (batch 2) cast from the expansion table: their rows, their aim, ticks without the tier's strike", () => {
    // A1 … A8, one each, each a design of the catalogue (matched by the clip's manifest code in the lab).
    const codes = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"];
    expect(KEY9_SKILLS.filter((s) => codes.some((c) => EXPANSION.find((e) => e.code === c) !== undefined)).length).toBeGreaterThanOrEqual(8);
    for (const s of KEY9_SKILLS) {
      expect(s.strikes[0]!.frame).toBe("peak");
      for (const st of s.strikes.slice(1)) expect(st.after).toBeGreaterThan(0);
      // Its Firefly take, or (Firefly's sound ran out: D6, D7, D8) a noted stand-in.
      if (s.sfx !== undefined) expect(s.sfx).toMatch(/^tt-sfx-x-[a-z-]+\/take[1-4]\.wav$/);
      else expect(s.guess).toMatch(/stands in/);
      expect(s.guess).toBeDefined();
    }
    const row = (id: string): ClipSkill => KEY9_SKILLS.find((s) => s.id === id)!;
    const field = new Field(HERD);
    const caster = { x: 0, z: 3 };
    const centre = { x: 0, z: -6 };
    // A8's thorns close from the rim: the farthest beast first.
    const briar = aimClipSkill(row("miasma-briar-abyss"), field, caster, centre);
    const far = briar.hits.reduce((a, b) => (Math.hypot(field.x(a.i) - 0, field.z(a.i) + 6) > Math.hypot(field.x(b.i) - 0, field.z(b.i) + 6) ? a : b));
    expect(far.delay).toBe(0);
    // A2's chasm: a 40° line through the field's middle, its marks along it.
    const rift = aimClipSkill(row("firmament-sundering-cleave"), new Field([[0, -6], [7, -12], [-7, 0], [7, 0]]), caster, centre);
    expect(rift.hits.map((h) => h.i).sort()).toEqual([0, 1, 2]);
    expect(rift.points.length).toBe(5);
    // A6 stands over the foes: its field centres on the densest group.
    const mandala = aimClipSkill(row("samsara-blood-mandala"), field, caster, centre, "foes");
    expect(Math.hypot(mandala.anchor.x - 6, mandala.anchor.z + 10)).toBeLessThan(1.5);

    const player = new FlipbookPlayer("/v/");
    const show = new Showcase(player, {
      camera: camera(), nearest: () => -1, at: (_i, out) => out.set(0, 0, -6), caster: (out) => out.set(0, 0, 3),
      light: () => {}, accent: () => {}, shake: () => {}, captionHost: null,
    }, EXPANSION_SHOWCASE);
    const lib = player.library("expansion");
    const entries = { "myriad-lotus-domain": { file: "a1.png", cols: 4, rows: 8, frames: 31, fps: 6, cell: [640, 360], role: "area", code: "A1", timing: { peak: 0, holdEnd: 22 } } };
    for (const meta of parseFlipbookManifest({ flipbooks: entries }, "/v/expansion/").values()) lib.add(meta, new THREE.Texture());
    const strikes: string[] = [];
    const blows: { t: number; role: string }[] = [];
    let t = 0;
    const runner = new ClipSkillRunner(show, {
      targets: new Field(HERD), layer: new THREE.Group(), player, caster: (out) => out.set(0, 0, 3), release: () => {},
      blow: (_s, _i, _dx, _dz, _p, role) => (blows.push({ t, role }), false),
      strike: (_s, _at, role) => strikes.push(role), status: () => {},
    }, KEY9_SKILLS, KEY9_NAV);
    expect(runner.cast("myriad-lotus-domain")).toBe("myriad-lotus-domain");
    for (let k = 0; k < 180; k += 1) {
      t += 1 / 60;
      runner.update(1 / 60);
    }
    // Three petal waves strike (the tier's reaction), three ticks bite without it; every beast takes all six.
    expect(strikes).toEqual(["primary", "secondary", "secondary"]);
    expect(blows.length).toBe(HERD.length * 6);
    expect(blows[0]!.t).toBeLessThanOrEqual(1 / 60 + 1e-9);
  });

  it("key 9's divine beasts (batch 3) fly their path across the field, striking each beast when the body reaches it", () => {
    const row = (id: string): ClipSkill => KEY9_SKILLS.find((s) => s.id === id)!;
    for (const id of ["azure-cloud-dragon", "white-fiend-tiger", "vermilion-solar-phoenix", "abyssal-xuanwu-tortoise", "auspicious-thunder-qilin", "astral-kunpeng-leviathan", "all-knowing-baize-spirit", "nine-tailed-celestial-fox"]) {
      expect(row(id), id).toBeDefined();
    }
    const field = new Field([[-15, -6], [-5, -6.5], [4, -5.5], [14, -6], [0, -15]]);
    const caster = { x: 0, z: 3 };
    const centre = { x: 0, z: -6 };
    // C1's dragon: left to right through the field's middle, from its edge; the beast far off the path is spared.
    const dragon = aimClipSkill(row("azure-cloud-dragon"), field, caster, centre, "field");
    expect(dragon.flight).toBeDefined();
    expect(dragon.flight!.x).toBeLessThan(-15);
    expect(dragon.flight!.vx).toBeGreaterThan(0);
    expect(dragon.hits.map((h) => h.i)).toEqual([0, 1, 2, 3]);
    for (let k = 1; k < dragon.hits.length; k += 1) expect(dragon.hits[k]!.delay).toBeGreaterThan(dragon.hits[k - 1]!.delay);
    // Struck when the body gets there: the delay is the distance flown over the flight's speed (no shift to zero).
    expect(dragon.hits[0]!.delay).toBeCloseTo((field.x(0) - dragon.flight!.x) / dragon.flight!.vx, 6);
    // C3's phoenix: south to north (toward −z).
    const phoenix = aimClipSkill(row("vermilion-solar-phoenix"), new Field([[0, 2], [0, -8], [0, -16]]), caster, centre, "field");
    expect(phoenix.flight!.vz).toBeLessThan(0);
    expect(phoenix.hits.map((h) => h.i)).toEqual([0, 1, 2]);
    // C2's tiger: four parallel claw lines.
    const tiger = aimClipSkill(row("white-fiend-tiger"), new Field(HERD), caster, centre, "foes");
    expect(tiger.points.length).toBe(5);
    expect(tiger.hits.length).toBeGreaterThan(3);
  });

  it("key 9's treasures (batch 4): every row in, the gourd and the mirror working from the field's far edge", () => {
    const row = (id: string): ClipSkill => KEY9_SKILLS.find((s) => s.id === id)!;
    const ids = ["mountain-crushing-imperial-seal", "primordial-chaos-bell", "blade-swallowing-immortal-gourd", "nine-dragon-refining-cauldron",
      "seven-treasure-suppressing-pagoda", "yin-yang-void-mirror", "five-element-heavenly-silk", "twelve-stem-nether-banners"];
    for (const id of ids) expect(row(id), id).toBeDefined();
    // The gourd at the far edge (z −17 from the middle at −6) pours a 120° fan south: the beast behind it is spared.
    const field = new Field([[0, -8], [6, -4], [-6, -4], [0, -22]]);
    const gourd = aimClipSkill(row("blade-swallowing-immortal-gourd"), field, { x: 0, z: 3 }, { x: 0, z: -6 }, "field");
    expect(gourd.anchor).toEqual({ x: 0, z: -17 });
    expect(gourd.hits.map((h) => h.i).sort()).toEqual([0, 1, 2]);
    expect(gourd.hits[0]!.i).toBe(0);
    // The mirror sweeps across from the same edge, one side to the other.
    const mirror = aimClipSkill(row("yin-yang-void-mirror"), field, { x: 0, z: 3 }, { x: 0, z: -6 }, "field");
    expect(mirror.hits.length).toBe(3);
    expect(new Set(mirror.hits.map((h) => h.delay.toFixed(3))).size).toBe(3);
  });

  it("key 9's avatars (batch 5): weapons slam point after point, an X across the middle, a 270° cleave round the caster", () => {
    const row = (id: string): ClipSkill => KEY9_SKILLS.find((s) => s.id === id)!;
    for (const id of ["asura-six-arms-avatar", "myriad-palm-bodhi-avatar", "heaven-earth-titan-avatar", "polar-star-emperor-avatar", "nether-samsara-monarch-avatar", "immortal-sword-progenitor-avatar"]) {
      expect(row(id), id).toBeDefined();
    }
    expect(KEY9_SKILLS.length).toBe(30);
    const caster = { x: 0, z: 3 };
    const centre = { x: 0, z: -6 };
    // B5's X: two lines crossing at the caster (50° and 130°), their arms up to the far corners; the beasts off both spared.
    const x = aimClipSkill(row("nether-samsara-monarch-avatar"), new Field([[10, -9], [-10, -9], [0, -6], [0, -13]]), caster, centre, "caster");
    expect(x.hits.map((h) => h.i).sort()).toEqual([0, 1]);
    // B3's cleave: 270° round the caster facing the densest group (north), the quarter behind it spared.
    const cleave = aimClipSkill(row("heaven-earth-titan-avatar"), new Field([[2, -10], [2.5, -10.5], [8, 3], [-8, 3], [0, 12]]), caster, centre, "caster");
    expect(cleave.hits.map((h) => h.i).sort()).toEqual([0, 1, 2, 3]);

    // B1: six weapons on six points, one strike each.
    const player = new FlipbookPlayer("/v/");
    const show = new Showcase(player, {
      camera: camera(), nearest: () => -1, at: (_i, out) => out.set(0, 0, -6), caster: (out) => out.set(0, 0, 3),
      light: () => {}, accent: () => {}, shake: () => {}, captionHost: null,
    }, EXPANSION_SHOWCASE);
    const entries = { "asura-six-arms-avatar": { file: "b1.png", cols: 4, rows: 8, frames: 31, fps: 6, cell: [640, 360], role: "avatar", code: "B1", timing: { peak: 16, holdEnd: 22 } } };
    for (const meta of parseFlipbookManifest({ flipbooks: entries }, "/v/expansion/").values()) player.library("expansion").add(meta, new THREE.Texture());
    const spread: [number, number][] = Array.from({ length: 12 }, (_, k) => [(k % 4) * 8 - 12, Math.floor(k / 4) * 8 - 14]);
    const field = new Field(spread);
    const struck: number[][] = [];
    let beat = -1;
    const runner = new ClipSkillRunner(show, {
      targets: field, layer: new THREE.Group(), player, caster: (out) => out.set(0, 0, 3), release: () => {},
      blow: (_s, i) => ((struck[beat] ??= []).push(i), false),
      strike: () => (beat += 1), status: () => {},
    }, KEY9_SKILLS, KEY9_NAV);
    runner.cast("asura-six-arms-avatar");
    for (let k = 0; k < 120; k += 1) runner.update(1 / 60);
    expect(runner.last!.points).toBe(6);
    expect(struck.length).toBe(6);
    const all = struck.flat();
    expect(new Set(all).size).toBe(all.length);
    for (const s of struck) expect(s.length).toBeGreaterThan(0);
  });

  it("plays a clip's 1080p video when it has one: strikes follow the video's own clock, the first at its peakTime", () => {
    const meta = parseFlipbookManifest({ flipbooks: { "pillar-fire-meteor": { file: "m.png", cols: 4, rows: 8, frames: 31, fps: 6, cell: [640, 360], role: "pillar",
      timing: { peak: 16 }, video: { file: "pillar-fire-meteor.mp4", w: 1920, h: 1080, fps: 24, frames: 121, start: 0, peakTime: 2.667, pivot: [0.5, 0.56] } } } }, "/v/ult/").get("pillar-fire-meteor")!;
    expect(meta.video).toEqual({ url: "/v/ult/pillar-fire-meteor.mp4", w: 1920, h: 1080, fps: 24, frames: 121, start: 0, peakTime: 2.667, pivot: [0.5, 0.56] });
    // A bad file name or a missing number: no video (the atlas plays).
    expect(parseFlipbookManifest({ flipbooks: { a: { file: "a.png", cols: 1, rows: 1, video: { file: "../x.mp4", w: 1, h: 1, fps: 24, frames: 1, start: 0, peakTime: 0 } } } }, "/v/").get("a")!.video).toBeUndefined();
    const { runner, show, log, step, player } = setup();
    player.library("ult").add(meta, new THREE.Texture());
    // The page plays it (a browser stand-in): its clock is the video's time, which this test turns.
    let videoT = -1;
    show.canVideo = () => true;
    const play = show.play.bind(show);
    show.play = (id, opts) => {
      const r = play(id, opts);
      show.played = { time: () => videoT };
      return r;
    };
    expect(show.clipTime("pillar-fire-meteor", "peak", true)).toBeCloseTo(2.667, 6);
    expect(show.clipTime("pillar-fire-meteor", 12, true)).toBeCloseTo((12 / 31) * (121 / 24), 6);
    runner.cast("pillar-fire-meteor");
    expect(runner.last!.video).toBe(true);
    // World time runs while the video loads: nothing lands.
    step(1);
    expect(log.blows.length).toBe(0);
    videoT = 2.6;
    step(0.05);
    expect(log.blows.length).toBe(0);
    videoT = 2.67;
    step(1 / 60);
    expect(log.blows.length).toBeGreaterThan(0);
    expect(runner.last!.firstBlowClip).toBeCloseTo(2.67, 6);
    expect(runner.last!.peakClip).toBeCloseTo(2.667, 6);
  });
});
