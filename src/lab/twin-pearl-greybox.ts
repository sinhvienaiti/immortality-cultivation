/**
 * Twin Dragons, One Burning Pearl's grey box in the skills lab (?key2=twin-pearl; dev only, never built):
 * DRAGON_SKILL.md §6 step 1. No art: the lab runs a real sim world (sim/world.ts with the header flag
 * `swordKey2: "twin-pearl"`, sim/twin-pearl.ts) holding a dense tide on both lanes and both sky routes, and
 * draws the sim's own hit volumes as plain translucent shapes while they live (hold box, touch boxes and
 * beams, head capsules and their trail, sky sweeps, pearl, lotus disc and petals), each labelled, with the
 * phase on top. Beasts are grey boxes that turn yellow, orange, red with their 1st, 2nd, 3rd hit of the cast
 * (the 3-hit cap reads at a glance) and flash white on each hit.
 *
 * Key 2 (or the panel's button) casts on the key's own frame: the Cast resolves and the world steps its F0
 * tick at once, so the first hit shows on the next drawn frame (key-to-first-hit is measured, __lab.twinPearl).
 * N refills the tide, V brings the Vương in at gate A (his cap per cast). The world's Trận Lực is kept full
 * and its prep never ends (no waves): the tide is the lab's, refilled at the gates to stay near 40 + 4 crows.
 */
import * as THREE from "three";
import { THANH_THACH_AI } from "../content/data/stage-m0a";
import { TWIN_PEARL, TWIN_PEARL_END_TICK } from "../content/data/twin-pearl";
import type { BeastState, Cast, GateId, ReplayHeader, SimEvent, SpeciesId, World } from "../content/types";
import { emitCast } from "../sim/cast";
import { mToU, uToM } from "../sim/fixed";
import { spawnBeast } from "../sim/spawn";
import { liveSamples, skyFront, twinPearlGeometry, type TwinGeometry, type TwinPearlCast } from "../sim/twin-pearl";
import { createWorld, step } from "../sim/world";

const TICK_S = 1 / 60;
/** Ground beasts the lab keeps on the two lanes, and crows on the two sky routes (DRAGON_SKILL §2 rule 4: about 40). */
const TIDE_GROUND = 38;
const TIDE_CROWS = 4;

/** Plain grey-box colours (no art): shapes are greys with a faint tint per kind so the labels can name them. */
const COLOURS = {
  hold: 0xd8d8d8,
  touch: 0xe9e2cc,
  body: 0xbfc3c8,
  head: 0xffffff,
  sky: 0xc9d5e2,
  pearl: 0xffffff,
  lotusFull: 0xf1e8da,
  lotusHalf: 0x8e9196,
  lane: 0x9aa0a8,
  beast: [0x80858c, 0xe3c25a, 0xe08a3c, 0xd0453a] as const,
} as const;

const header = (seed: number): ReplayHeader => ({
  v: 1,
  gameId: "immortality-cultivation",
  rulesHash: "00000000",
  seed,
  stageId: THANH_THACH_AI.id,
  preset: "balanced",
  pacing: false,
  seats: [{ seat: 0, profile: { e: 45, a: 970, cv: 250 }, kPm: 1000 }],
  deck: [],
  newWordAllowance: 0,
  loadout: { guard: "ward", tamPhap: "kiem-tam" },
  swordKey2: "twin-pearl",
});

/** A small seeded random for the lab's tide (never the sim's streams). */
class LabRand {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
}

const translucent = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });

/** One cast's numbers as the lab saw them (the sim's book and its `hit` events). */
export interface TwinCastReport {
  castId: number;
  startTick: number;
  alive: number;
  aliveGround: number;
  crowsAlive: number;
  /** Distinct beasts hit, hits in all, by kind (from the sim's book). */
  victims: number;
  hits: number;
  touch: number;
  corridor: number;
  lotus: number;
  maxHitsOnOne: number;
  crowsHit: number;
  /** Effective HP dealt, west (x < 0) and east, and on the Vương. */
  dealt: number;
  west: number;
  east: number;
  boss: number;
  kills: number;
  /** Ticks from F0 to the first hit, and ms from the key to the first drawn frame showing it. */
  firstHitTick: number;
  keyToFirstHitMs: number;
}

interface Label {
  readonly el: HTMLDivElement;
  readonly at: THREE.Vector3;
  shown: boolean;
}

export class TwinPearlGreybox {
  readonly group = new THREE.Group();
  world!: World;
  private geo!: TwinGeometry;
  private rand = new LabRand(7);
  private acc = 0;
  private nextAction = 0;
  private refillAt = 0;
  private refillGate: "A" | "B" = "A";
  private speciesCycle = 0;
  /** The latest cast (the sim drops its state after F96; the view keeps its clock to F300). */
  private current: { castId: number; startTick: number; keyAt: number } | null = null;
  private report: TwinCastReport | null = null;
  readonly reports: TwinCastReport[] = [];
  private firstHitShownPending = false;
  /** Per beast (slot·serial): hits this cast and the last hit's lab time (the white flash). */
  private readonly flash = new Map<number, number>();
  private readonly gates = new Map<number, GateId>();
  private labTime = 0;

  // Shapes.
  private readonly beasts: THREE.InstancedMesh;
  private readonly hold: THREE.Mesh;
  private readonly touch: THREE.Mesh[] = [];
  private readonly beams: THREE.Line[] = [];
  private readonly bodies: THREE.InstancedMesh[] = [];
  private readonly heads: THREE.Mesh[] = [];
  private readonly skies: THREE.Mesh[] = [];
  private readonly pearl: THREE.Mesh;
  private readonly lotusDisc: THREE.Mesh;
  private readonly lotusFull: THREE.Group = new THREE.Group();
  private readonly statics = new THREE.Group();
  private readonly labels = new Map<string, Label>();
  private readonly overlay: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  /** Volumes' last live lab time: shapes alive for one or two ticks stay faintly for 0.3 s so they can be seen. */
  private readonly lastLive = new Map<THREE.Object3D, number>();

  constructor(
    private readonly camera: THREE.Camera,
    private readonly sword: () => { x: number; y: number; z: number },
  ) {
    this.group.name = "twin-pearl-greybox";
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.beasts = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ fog: false, toneMapped: false }), 80);
    this.beasts.count = 0;
    this.beasts.frustumCulled = false;
    this.beasts.setColorAt(0, new THREE.Color(COLOURS.beast[0]));
    const groundH = (TWIN_PEARL.groundTopMm - 200) / 1000;
    const groundY = 0.2 + groundH / 2;
    this.hold = new THREE.Mesh(new THREE.BoxGeometry(TWIN_PEARL.hold.halfWidthMm / 500, groundH, TWIN_PEARL.hold.depthMm / 1000), translucent(COLOURS.hold, 0.32));
    this.hold.position.set(0, groundY, -TWIN_PEARL.hold.depthMm / 2000);
    const touchGeo = new THREE.BoxGeometry(TWIN_PEARL.touch.halfWidthMm / 500, groundH, TWIN_PEARL.touch.halfLengthMm / 500);
    const bodyGeo = new THREE.CylinderGeometry(TWIN_PEARL.heads.radiusMm / 1000, TWIN_PEARL.heads.radiusMm / 1000, groundH, 20, 1, true);
    const skyH = (TWIN_PEARL.sky.topMm - TWIN_PEARL.sky.bottomMm) / 1000;
    const skyGeo = new THREE.CylinderGeometry(TWIN_PEARL.sky.radiusMm / 1000, TWIN_PEARL.sky.radiusMm / 1000, skyH, 28, 1, false);
    for (let i = 0; i < 2; i += 1) {
      const t = new THREE.Mesh(touchGeo, translucent(COLOURS.touch, 0.36));
      t.position.y = groundY;
      this.touch.push(t);
      const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: COLOURS.touch, transparent: true, opacity: 0.9, fog: false, toneMapped: false }));
      beam.frustumCulled = false;
      this.beams.push(beam);
      const body = new THREE.InstancedMesh(bodyGeo, translucent(0xffffff, 0.16), 64);
      body.count = 0;
      body.frustumCulled = false;
      body.setColorAt(0, new THREE.Color(COLOURS.body));
      this.bodies.push(body);
      const head = new THREE.Mesh(bodyGeo, translucent(COLOURS.head, 0.5));
      head.position.y = groundY;
      this.heads.push(head);
      const sky = new THREE.Mesh(skyGeo, translucent(COLOURS.sky, 0.3));
      sky.position.y = (TWIN_PEARL.sky.bottomMm + TWIN_PEARL.sky.topMm) / 2000;
      this.skies.push(sky);
    }
    this.pearl = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 14), translucent(COLOURS.pearl, 0.8));
    this.lotusDisc = new THREE.Mesh(new THREE.CircleGeometry(TWIN_PEARL.lotus.radiusMm / 1000, 64), translucent(COLOURS.lotusHalf, 0.22));
    this.lotusDisc.rotation.x = -Math.PI / 2;
    this.group.add(this.beasts, this.hold, ...this.touch, ...this.beams, ...this.bodies, ...this.heads, ...this.skies, this.pearl, this.lotusDisc, this.lotusFull, this.statics);
    for (const o of [this.hold, ...this.touch, ...this.beams, ...this.heads, ...this.skies, this.pearl, this.lotusDisc, this.lotusFull]) o.visible = false;

    this.overlay = document.createElement("div");
    this.overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9;font:12px system-ui;color:#eef1f5";
    this.banner = document.createElement("div");
    this.banner.style.cssText = "position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:6px 12px;background:rgba(10,13,19,.82);border:1px solid #4a5568;border-radius:6px;font:600 14px system-ui;white-space:nowrap";
    this.stats = document.createElement("div");
    this.stats.style.cssText = "position:absolute;right:12px;bottom:12px;padding:8px 10px;background:rgba(10,13,19,.82);border:1px solid #4a5568;border-radius:6px;white-space:pre;font:12px ui-monospace,monospace;line-height:1.45";
    this.overlay.append(this.banner, this.stats);
    document.body.append(this.overlay);
    this.reset();
  }

  /** A fresh world and tide (R, N). */
  reset(): void {
    this.world = createWorld(THANH_THACH_AI, 1, header(1));
    // The lab holds the prep (no waves) and its own tide.
    this.world.phaseEndsAt = -1;
    this.geo = twinPearlGeometry(this.world);
    this.rand = new LabRand(7);
    this.acc = 0;
    this.nextAction = 0;
    this.refillAt = 0;
    this.current = null;
    this.report = null;
    this.flash.clear();
    this.gates.clear();
    this.buildStatics();
    this.seedTide();
  }

  private buildStatics(): void {
    for (const child of [...this.statics.children]) {
      this.statics.remove(child);
      if (child instanceof THREE.Line || child instanceof THREE.Mesh) child.geometry.dispose();
    }
    const v = (p: { x: number; z: number }, y = 0.04): THREE.Vector3 => new THREE.Vector3(uToM(p.x), y, uToM(p.z));
    const line = (points: THREE.Vector3[], color: number, opacity: number, dashed = false): THREE.Line => {
      const material = dashed
        ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.35, gapSize: 0.25, fog: false, toneMapped: false })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity, fog: false, toneMapped: false });
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
      if (dashed) l.computeLineDistances();
      l.frustumCulled = false;
      return l;
    };
    for (const lane of this.geo.lanes) {
      // The lane from the flow field (gate → heart edge) and the head's S path, with the sky route at 4 m.
      this.statics.add(line(lane.route.map((p) => v(p)), COLOURS.lane, 0.9));
      this.statics.add(line(lane.sx.map((x, i) => new THREE.Vector3(uToM(x), 0.06, uToM(lane.sz[i]!))), COLOURS.lane, 0.55, true));
      this.statics.add(line([v(lane.skyFrom, 4), v(lane.skyTo, 4)], COLOURS.sky, 0.5, true));
      // The lotus's long petal on this lane: the corridor's half-width round the head's base path, 13 m from the meeting point.
      this.lotusFull.add(this.petalMesh(lane.path, lane.pathArc));
    }
    const hold = new THREE.Mesh(new THREE.PlaneGeometry(TWIN_PEARL.hold.halfWidthMm / 500, TWIN_PEARL.hold.depthMm / 1000), translucent(COLOURS.lotusFull, 0.34));
    hold.rotation.x = -Math.PI / 2;
    hold.position.set(0, 0.07, -TWIN_PEARL.hold.depthMm / 2000);
    this.lotusFull.add(hold);
    const m = this.geo.meet;
    this.statics.add(line([new THREE.Vector3(uToM(m.x) - 0.6, 0.05, uToM(m.z)), new THREE.Vector3(uToM(m.x) + 0.6, 0.05, uToM(m.z))], 0xffffff, 0.9));
    this.statics.add(line([new THREE.Vector3(uToM(m.x), 0.05, uToM(m.z) - 0.6), new THREE.Vector3(uToM(m.x), 0.05, uToM(m.z) + 0.6)], 0xffffff, 0.9));
    this.lotusDisc.position.set(uToM(m.x), 0.05, uToM(m.z));
    this.label("meet", "meeting point (" + uToM(m.x).toFixed(2) + "; " + uToM(m.z).toFixed(2) + ")").at.set(uToM(m.x), 0.3, uToM(m.z) + 0.9);
  }

  /** A flat ribbon over `path` (u) up to the petal's length, the petal's half-width each side. */
  private petalMesh(path: readonly { x: number; z: number }[], arc: readonly number[]): THREE.Mesh {
    const half = TWIN_PEARL.lotus.petalHalfWidthMm / 1000;
    const length = TWIN_PEARL.lotus.petalLengthMm / 1000;
    const positions: number[] = [];
    const index: number[] = [];
    let n = 0;
    for (let k = 0; k + 1 < path.length; k += 1) {
      const s0 = uToM(arc[k]!);
      if (s0 >= length) break;
      const ax = uToM(path[k]!.x);
      const az = uToM(path[k]!.z);
      const bx = uToM(path[k + 1]!.x);
      const bz = uToM(path[k + 1]!.z);
      const len = Math.hypot(bx - ax, bz - az);
      const end = Math.min(len, length - s0);
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      const nx = -uz * half;
      const nz = ux * half;
      for (const s of [0, end]) {
        positions.push(ax + ux * s + nx, 0.06, az + uz * s + nz, ax + ux * s - nx, 0.06, az + uz * s - nz);
      }
      index.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      n += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(index);
    return new THREE.Mesh(g, translucent(COLOURS.lotusFull, 0.4));
  }

  // ── The tide ──────────────────────────────────────────────────────────────

  private spawn(species: SpeciesId, gate: GateId, x: number, z: number, cluster = -1): BeastState | null {
    if (this.world.beasts.live >= this.world.liveCap) return null;
    const beast = spawnBeast(this.world, species, gate, { wave: -1, x: mToU(x), z: mToU(z), cluster });
    this.gates.set(beast.slot * 100_000 + beast.serial, gate);
    return beast;
  }

  /** A point `f` (0 at the gate, 1 at the heart edge) along a lane's route, metres, with a little sideways spread. */
  private along(gate: "A" | "B", f: number, spread: number): [number, number] {
    const lane = this.geo.lanes[gate === "A" ? 0 : 1];
    const pts = lane.route.map((p) => [uToM(p.x), uToM(p.z)] as const);
    const lens: number[] = [];
    let total = 0;
    for (let k = 0; k + 1 < pts.length; k += 1) {
      const l = Math.hypot(pts[k + 1]![0] - pts[k]![0], pts[k + 1]![1] - pts[k]![1]);
      lens.push(l);
      total += l;
    }
    let s = f * total;
    for (let k = 0; k < lens.length; k += 1) {
      if (s <= lens[k]! || k === lens.length - 1) {
        const t = Math.min(1, s / lens[k]!);
        const [ax, az] = pts[k]!;
        const [bx, bz] = pts[k + 1]!;
        const ux = (bx - ax) / lens[k]!;
        const uz = (bz - az) / lens[k]!;
        const side = (this.rand.next() * 2 - 1) * spread;
        return [ax + (bx - ax) * t - uz * side, az + (bz - az) * t + ux * side];
      }
      s -= lens[k]!;
    }
    return [pts[0]![0], pts[0]![1]];
  }

  /** One group at `f` along a lane: the species cycle of a wave 5–6 tide (rats in clusters, wolf packs, apes, boars). */
  private group1(gate: "A" | "B", f: number): void {
    const kind = this.speciesCycle % 6;
    this.speciesCycle += 1;
    if (kind === 0 || kind === 3) {
      const cluster = this.world.beasts.nextCluster++;
      for (let k = 0; k < 5; k += 1) {
        const [x, z] = this.along(gate, f + (this.rand.next() - 0.5) * 0.03, 0.8);
        this.spawn("thach-thu", gate, x, z, cluster);
      }
    } else if (kind === 1 || kind === 4) {
      for (let k = 0; k < 3; k += 1) {
        const [x, z] = this.along(gate, f + (this.rand.next() - 0.5) * 0.04, 1.2);
        this.spawn("phong-lang", gate, x, z);
      }
    } else {
      const [x, z] = this.along(gate, f, 0.6);
      this.spawn(kind === 2 ? "nham-vien" : "thiet-giap-tru", gate, x, z);
    }
  }

  private crow(side: 0 | 1, f: number): void {
    const lane = this.geo.lanes[side];
    const x = uToM(lane.skyFrom.x) + (uToM(lane.skyTo.x) - uToM(lane.skyFrom.x)) * f;
    const z = uToM(lane.skyFrom.z) + (uToM(lane.skyTo.z) - uToM(lane.skyFrom.z)) * f;
    this.spawn("hoa-nha", "sky", x, z);
  }

  private counts(): { ground: number; crows: number; byGate: Record<string, number> } {
    let ground = 0;
    let crows = 0;
    const byGate: Record<string, number> = { A: 0, B: 0, sky: 0 };
    for (const b of this.world.beasts.list) {
      if (!b.alive) continue;
      byGate[b.gate] = (byGate[b.gate] ?? 0) + 1;
      if (b.gate === "sky") crows += 1;
      else ground += 1;
    }
    return { ground, crows, byGate };
  }

  /** The densest fight: about 38 ground beasts spread over both lanes (more near the heart) and 4 crows. */
  private seedTide(): void {
    let f = 0.04;
    while (this.counts().ground < TIDE_GROUND) {
      this.group1("A", f);
      this.group1("B", f);
      f += 0.13;
      if (f > 0.97) f = 0.1 + this.rand.next() * 0.8;
    }
    this.crow(0, 0.15);
    this.crow(0, 0.55);
    this.crow(1, 0.3);
    this.crow(1, 0.7);
  }

  private refill(): void {
    if (this.world.tick < this.refillAt) return;
    this.refillAt = this.world.tick + 45;
    const { ground, crows, byGate } = this.counts();
    if (ground < TIDE_GROUND) {
      // The thinner lane first, else alternate.
      const gate = (byGate.A ?? 0) < (byGate.B ?? 0) ? "A" : (byGate.B ?? 0) < (byGate.A ?? 0) ? "B" : this.refillGate;
      this.refillGate = gate === "A" ? "B" : "A";
      this.group1(gate, 0.01);
    }
    if (crows < TIDE_CROWS) this.crow(this.world.tick % 2 === 0 ? 0 : 1, 0);
  }

  /** N: the tide again (the world and its clock stay). */
  refillAll(): void {
    for (const b of this.world.beasts.list) if (b.alive && !b.boss) b.alive = false;
    this.stepWorld();
    this.seedTide();
  }

  /** V: the Vương at gate A (his cap a cast: TWIN_PEARL.bossCapW100). */
  addBoss(): void {
    const boss = THANH_THACH_AI.boss;
    if (boss === null) return;
    const [x, z] = this.along("A", 0.35, 0);
    this.spawn(boss, "A", x, z);
  }

  // ── Casting ───────────────────────────────────────────────────────────────

  /** Key 2: the word's last key. The Cast resolves now (F0) and the world steps that tick at once. */
  cast(keyAt = performance.now()): void {
    const world = this.world;
    const n = this.nextAction;
    this.nextAction += 1;
    const cast: Cast = {
      seat: 0, slot: 2, actionId: n, wordId: "twin-pearl-" + n, tick: world.tick, channel: "typing", quality: "good",
      origin: { x: 0, z: mToU(3) }, aim: null, state: "held", heldUntil: -1, target: null, node: null,
    };
    const counts = this.counts();
    // Resolved now, F0 is this tick; held (no beast alive), the sim retries it for 3 s and draw() takes its start then.
    emitCast(world, cast);
    this.current = { castId: cast.actionId, startTick: world.tick, keyAt };
    this.report = {
      castId: cast.actionId, startTick: world.tick, alive: counts.ground + counts.crows, aliveGround: counts.ground, crowsAlive: counts.crows,
      victims: 0, hits: 0, touch: 0, corridor: 0, lotus: 0, maxHitsOnOne: 0, crowsHit: 0, dealt: 0, west: 0, east: 0, boss: 0, kills: 0,
      firstHitTick: -1, keyToFirstHitMs: -1,
    };
    this.reports.push(this.report);
    this.firstHitShownPending = true;
    // F0 now: the hold strike lands this tick, drawn on the next frame; the next tick comes a whole tick later.
    this.stepWorld();
    this.acc = 0;
  }

  /** The sim's state of the latest cast while it still hits (null after F96). */
  liveCast(): TwinPearlCast | null {
    const casts = this.world.skills.twinPearl?.casts ?? [];
    return casts.length > 0 ? casts[casts.length - 1]! : null;
  }

  private stepWorld(): void {
    const world = this.world;
    this.refill();
    step(world, []);
    world.formation.heart = world.formation.heartMax;
    for (const e of world.events.drain()) this.onEvent(e);
    // The sim's book of the live cast (it is dropped after F96).
    const live = this.liveCast();
    const r = this.report;
    if (live !== null && r !== null && live.castId === r.castId) {
      r.victims = live.victims;
      r.dealt = live.dealt;
      r.boss = live.bossDealt;
      let hits = 0;
      let touch = 0;
      let corridor = 0;
      let lotus = 0;
      let most = 0;
      let crows = 0;
      for (const v of live.book) {
        hits += v.hits;
        if (v.kinds & 1) touch += 1;
        if (v.kinds & 2) corridor += 1;
        if (v.kinds & 4) lotus += 1;
        if (v.hits > most) most = v.hits;
        if (this.gates.get(v.slot * 100_000 + v.serial) === "sky") crows += 1;
      }
      Object.assign(r, { hits, touch, corridor, lotus, maxHitsOnOne: most, crowsHit: crows });
    }
  }

  private onEvent(e: SimEvent): void {
    const r = this.report;
    if (e.type === "hit" && e.source === "slot2") {
      this.flash.set(e.beast.slot * 100_000 + e.beast.serial, this.labTime);
      if (r !== null) {
        if (r.firstHitTick < 0) r.firstHitTick = e.tick - r.startTick;
        if (e.x < 0) r.west += e.amount;
        else r.east += e.amount;
      }
    } else if (e.type === "death" && e.by === "slot2" && r !== null) r.kills += 1;
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  /** Steps the world on real time (60 Hz ticks) and draws the live volumes. */
  update(dt: number): void {
    this.labTime += dt;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= TICK_S) {
      this.acc -= TICK_S;
      this.stepWorld();
    }
    this.draw();
  }

  /** After the frame is drawn: the first hit of the latest cast is on screen, so its key-to-hit time is known. */
  afterRender(now = performance.now()): void {
    const r = this.report;
    if (!this.firstHitShownPending || r === null || this.current === null || r.firstHitTick < 0) return;
    this.firstHitShownPending = false;
    r.keyToFirstHitMs = Math.round((now - this.current.keyAt) * 10) / 10;
  }

  private beastSize(b: BeastState, out: THREE.Vector3): void {
    if (b.boss) out.set(1.7, 1.6, 2.4);
    else if (b.tier === "swarm") out.set(0.45, 0.35, 0.6);
    else if (b.tier === "small") out.set(b.gate === "sky" ? 0.8 : 0.6, b.gate === "sky" ? 0.3 : 0.6, b.gate === "sky" ? 0.8 : 1.0);
    else if (b.tier === "general") out.set(0.9, 1.0, 1.5);
    else out.set(1.0, 1.1, 1.3);
  }

  private label(key: string, text: string): Label {
    let l = this.labels.get(key);
    if (l === undefined) {
      const el = document.createElement("div");
      el.style.cssText = "position:absolute;transform:translate(-50%,-100%);padding:2px 6px;background:rgba(10,13,19,.72);border:1px solid #586274;border-radius:4px;white-space:nowrap";
      this.overlay.append(el);
      l = { el, at: new THREE.Vector3(), shown: false };
      this.labels.set(key, l);
    }
    if (l.el.textContent !== text) l.el.textContent = text;
    l.shown = true;
    return l;
  }

  /** Shows `o` while live; a volume that lived lately stays faint for 0.3 s (one-tick volumes would never be seen). */
  private show(o: THREE.Object3D & { material: THREE.Material | THREE.Material[] }, live: boolean, opacity: number): boolean {
    if (live) this.lastLive.set(o, this.labTime);
    const since = this.labTime - (this.lastLive.get(o) ?? -10);
    const k = live ? 1 : since < 0.3 ? 0.35 * (1 - since / 0.3) : 0;
    o.visible = k > 0;
    const m = o.material as THREE.MeshBasicMaterial;
    m.opacity = opacity * k;
    return o.visible;
  }

  private draw(): void {
    for (const l of this.labels.values()) l.shown = l === this.labels.get("meet");
    const world = this.world;
    const tmp = new THREE.Object3D();
    const size = new THREE.Vector3();
    const colour = new THREE.Color();
    // Beasts: grey, then yellow / orange / red with their 1st / 2nd / 3rd hit of the live cast; white for 0.12 s on a hit.
    const live = this.liveCast();
    const hitsOf = new Map<number, number>();
    if (live !== null) for (const v of live.book) hitsOf.set(v.slot * 100_000 + v.serial, v.hits);
    let n = 0;
    for (const b of world.beasts.list) {
      if (!b.alive || n >= this.beasts.instanceMatrix.count) continue;
      this.beastSize(b, size);
      tmp.position.set(uToM(b.x), uToM(b.y) + size.y / 2, uToM(b.z));
      tmp.rotation.set(0, Math.atan2(-uToM(b.x), -uToM(b.z)), 0);
      tmp.scale.copy(size);
      tmp.updateMatrix();
      this.beasts.setMatrixAt(n, tmp.matrix);
      const id = b.slot * 100_000 + b.serial;
      const flashAt = this.flash.get(id);
      const hits = hitsOf.get(id) ?? 0;
      colour.setHex(COLOURS.beast[Math.min(3, hits)]!);
      if (flashAt !== undefined && this.labTime - flashAt < 0.12) colour.setHex(0xffffff);
      this.beasts.setColorAt(n, colour);
      n += 1;
    }
    this.beasts.count = n;
    this.beasts.instanceMatrix.needsUpdate = true;
    if (this.beasts.instanceColor) this.beasts.instanceColor.needsUpdate = true;

    const cur = this.current;
    const stillHits = live !== null && cur !== null && live.castId === cur.castId;
    if (stillHits && cur !== null && live !== null) cur.startTick = live.startTick;
    // The tick offset the world last stepped (world.tick is already the next one).
    const t = cur === null ? -1 : world.tick - cur.startTick - 1;
    // F0 hold box.
    if (this.show(this.hold, stillHits && t === TWIN_PEARL.hold.tick, 0.32)) this.label("hold", "hold strike 8 × 8 m · F0 · touch 15 %").at.set(0, 1.7, -4);
    // F1–F2 touch boxes and beams.
    for (let i = 0; i < 2; i += 1) {
      const box = this.touch[i]!;
      const beam = this.beams[i]!;
      const touch = live?.touch[i];
      const on = stillHits && touch !== undefined && touch.on !== 0;
      const liveNow = on && t >= TWIN_PEARL.touch.fromTick && t <= TWIN_PEARL.touch.toTick;
      if (on && touch !== undefined) {
        box.position.set(uToM(touch.x), box.position.y, uToM(touch.z));
        box.rotation.set(0, Math.atan2(touch.dx, touch.dz), 0);
        const s = this.sword();
        const pos = beam.geometry.getAttribute("position") as THREE.BufferAttribute;
        pos.setXYZ(0, s.x, s.y, s.z);
        pos.setXYZ(1, uToM(touch.x), 0.8, uToM(touch.z));
        pos.needsUpdate = true;
      }
      const shown = this.show(box, liveNow, 0.36);
      this.show(beam as THREE.Line & { material: THREE.Material }, liveNow, 0.9);
      if (shown) this.label("touch" + i, "touch " + (i === 0 ? "A" : "B") + " · F1–F2 · 15 %").at.set(box.position.x, 1.8, box.position.z);
    }
    // F3–F42 heads, body and 0.9 s trail; F30–F50 sky sweeps.
    const range = { first: 0, last: -1 };
    for (let i = 0; i < 2; i += 1) {
      const lane = this.geo.lanes[i]!;
      const body = this.bodies[i]!;
      const head = this.heads[i]!;
      let count = 0;
      if (stillHits) {
        liveSamples(lane, t, range);
        for (let k = range.first; k <= range.last && count < body.instanceMatrix.count; k += 1) {
          tmp.position.set(uToM(lane.sx[k]!), this.hold.position.y, uToM(lane.sz[k]!));
          tmp.rotation.set(0, 0, 0);
          tmp.scale.set(1, 1, 1);
          tmp.updateMatrix();
          body.setMatrixAt(count, tmp.matrix);
          // Older trail samples are darker (they still hit until 0.9 s after the head passed).
          const age = Math.max(0, Math.min(1, (t - lane.pass[k]!) / TWIN_PEARL.trailTicks));
          colour.setHex(COLOURS.body).multiplyScalar(1 - 0.6 * age);
          body.setColorAt(count, colour);
          count += 1;
        }
      }
      body.count = count;
      body.visible = count > 0;
      body.instanceMatrix.needsUpdate = true;
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
      const headLive = stillHits && t >= TWIN_PEARL.heads.fromTick && t <= TWIN_PEARL.heads.toTick && range.last >= 0;
      if (headLive) head.position.set(uToM(lane.sx[range.last]!), head.position.y, uToM(lane.sz[range.last]!));
      if (this.show(head, headLive, 0.5)) this.label("head" + i, "head " + lane.gate + " · F3–F42 · corridor 45 %").at.set(head.position.x, 2.0, head.position.z);
      else if (count > 0) {
        const k = range.last;
        this.label("trail" + i, "trail " + lane.gate + " · hits 0.9 s after the head").at.set(uToM(lane.sx[k]!), 1.9, uToM(lane.sz[k]!));
      }
      const sky = this.skies[i]!;
      const front = { x: 0, z: 0 };
      const skyLive = stillHits && skyFront(lane, t, front);
      if (skyLive) sky.position.set(uToM(front.x), sky.position.y, uToM(front.z));
      if (this.show(sky, skyLive, 0.3)) this.label("sky" + i, "sky sweep " + (i === 0 ? "west" : "east") + " · 2.5–6 m · F30–F50").at.set(sky.position.x, 6.4, sky.position.z);
    }
    // The pearl: from the sword to the meeting point over F3–F42, hangs to F51 (view only, no hit).
    const pearl = this.pearl;
    const pearlOn = cur !== null && t >= TWIN_PEARL.pearl.fromTick && t < TWIN_PEARL.lotus.fromTick;
    if (pearlOn) {
      const s = this.sword();
      const f = Math.min(1, (t - TWIN_PEARL.pearl.fromTick) / (TWIN_PEARL.pearl.arriveTick - TWIN_PEARL.pearl.fromTick));
      const m = this.geo.meet;
      pearl.position.set(s.x + (uToM(m.x) - s.x) * f, s.y + (2.2 - s.y) * f + Math.sin(Math.PI * f) * 1.5, s.z + (uToM(m.z) - s.z) * f);
      this.label("pearl", "pearl · no hit").at.set(pearl.position.x, pearl.position.y + 0.8, pearl.position.z);
    }
    pearl.visible = pearlOn;
    // F51–F71 the lotus: full on the petals and the hold zone, half within r 9 m.
    const lotusLive = stillHits && t >= TWIN_PEARL.lotus.fromTick && t <= TWIN_PEARL.lotus.toTick;
    const discShown = this.show(this.lotusDisc, lotusLive, 0.22);
    this.lotusFull.visible = discShown;
    for (const c of this.lotusFull.children) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (this.lotusDisc.material as THREE.MeshBasicMaterial).opacity * 1.8;
    if (discShown) {
      const m = this.geo.meet;
      this.label("lotus", "lotus r 9 m · F51–F71 · 40 % on petals + hold, 20 % elsewhere").at.set(uToM(m.x), 0.6, uToM(m.z) - 5);
    }
    // Labels on screen.
    const v = new THREE.Vector3();
    for (const l of this.labels.values()) {
      if (!l.shown) {
        l.el.style.display = "none";
        continue;
      }
      v.copy(l.at).project(this.camera);
      l.el.style.display = v.z < 1 ? "block" : "none";
      l.el.style.left = ((v.x * 0.5 + 0.5) * innerWidth).toFixed(1) + "px";
      l.el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight).toFixed(1) + "px";
    }
    this.banner.textContent = this.phaseText(t, cur !== null);
    this.stats.textContent = this.statsText();
  }

  private phaseText(t: number, cast: boolean): string {
    const name = "Twin Dragons, One Burning Pearl · grey box";
    if (!cast || t > 300) return name + " · press 2 to cast";
    const f = "F" + t + " · ";
    if (t < 0) return name + " · F0 next tick";
    if (t === 0) return name + " · " + f + "Release: hold strike 8 × 8 m";
    if (t <= 2) return name + " · " + f + "Release: touch beams on both lanes";
    if (t <= 29) return name + " · " + f + "Travel: heads up both lanes, trail hits 0.9 s";
    if (t <= 42) return name + " · " + f + "Travel: heads + sky sweeps (F30–F50)";
    if (t <= 50) return name + " · " + f + "Impact: roar beat, trail and sky sweeps still hit";
    if (t <= TWIN_PEARL.lotus.toTick) return name + " · " + f + "Impact: the lotus (F51–F71)";
    if (t <= TWIN_PEARL_END_TICK) return name + " · " + f + "Aftermath: the trail near the gates still hits (to F96)";
    return name + " · " + f + "Aftermath (view only, no hits, to F300)";
  }

  private statsText(): string {
    const { ground, crows } = this.counts();
    const lines = ["tide now: " + ground + " ground + " + crows + " crows · tick " + this.world.tick];
    const r = this.report;
    if (r === null) return lines.join("\n");
    const total = r.west + r.east || 1;
    lines.push(
      "last cast #" + r.castId + " (alive at the key: " + r.aliveGround + " ground + " + r.crowsAlive + " crows)",
      "distinct beasts hit: " + r.victims + " · hits " + r.hits + " · most on one: " + r.maxHitsOnOne,
      "  touch " + r.touch + " · corridor " + r.corridor + " · lotus " + r.lotus,
      "crows hit: " + r.crowsHit + " / " + r.crowsAlive + " · kills " + r.kills,
      "damage " + r.dealt + " HP · west/east " + Math.round((100 * r.west) / total) + "/" + Math.round((100 * r.east) / total) + " · Vương " + r.boss,
      "first hit: F" + r.firstHitTick + " · key → drawn " + (r.keyToFirstHitMs < 0 ? "…" : r.keyToFirstHitMs + " ms"),
    );
    return lines.join("\n");
  }

  /**
   * Compiles every shape's program now (the lab calls it for the post chain's buffer and for the screen), so the
   * first cast pays no shader compile on its key's frame (the first live key took 121 ms before this, 04/11).
   */
  prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const shown: [THREE.Object3D, boolean][] = [];
    this.group.traverse((o) => {
      shown.push([o, o.visible]);
      o.visible = true;
    });
    const counts = [this.beasts, ...this.bodies].map((m) => m.count);
    for (const m of [this.beasts, ...this.bodies]) m.count = Math.max(1, m.count);
    renderer.compile(this.group, camera);
    [this.beasts, ...this.bodies].forEach((m, i) => (m.count = counts[i]!));
    for (const [o, v] of shown) o.visible = v;
    // The labels' first layout too.
    for (const key of ["hold", "touch0", "touch1", "head0", "head1", "trail0", "trail1", "sky0", "sky1", "pearl", "lotus"]) this.label(key, key).el.style.display = "none";
  }

  dispose(): void {
    this.overlay.remove();
  }
}
