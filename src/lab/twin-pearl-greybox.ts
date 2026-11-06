/**
 * Field-wide Twin Pearl grey box (?key2=twin-pearl, dev only), DRAGON_SKILL.md §9.
 * A real moving tide and the cast's own discs, nodes, S samples, sky capsules and
 * lotus. R resets to two gates; L cycles layouts; N restores the current layout;
 * V spawns the boss at gate A. The lab never replenishes beasts automatically.
 */
import * as THREE from "three";
import { THANH_THACH_AI } from "../content/data/stage-m0a";
import { TWIN_PEARL, TWIN_PEARL_END_TICK } from "../content/data/twin-pearl";
import type { BeastState, Cast, GateId, ReplayHeader, SimEvent, SpeciesId, World } from "../content/types";
import { emitCast } from "../sim/cast";
import { cellAt, gatePoint } from "../sim/field";
import { mToU, uToM } from "../sim/fixed";
import { POOL_PARTS, headIndex, liveSamples, staticCoverage, type TwinDragon, type TwinPearlCast } from "../sim/twin-pearl";
import { spawnBeast } from "../sim/spawn";
import { createWorld, step } from "../sim/world";

const TICK_S = 1 / 60;
const LAYOUT_NAMES = ["Two gates", "One gate", "Three gates", "Surrounding", "Behind the caster"] as const;
const COLOURS = { hold: 0xd8d8d8, touch: 0xe9e2cc, body: 0xbfc3c8, head: 0xffffff, sky: 0xc9d5e2, pearl: 0xffffff, lotusFull: 0xf1e8da, lotusHalf: 0x8e9196, lane: 0x9aa0a8, beast: [0x80858c, 0xe3c25a, 0xe08a3c, 0xd0453a] as const };
const translucent = (color: number, opacity: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
const header = (seed: number): ReplayHeader => ({
  v: 1, gameId: "immortality-cultivation", rulesHash: "00000000", seed, stageId: THANH_THACH_AI.id, preset: "balanced", pacing: false,
  seats: [{ seat: 0, profile: { e: 45, a: 970, cv: 250 }, kPm: 1000 }], deck: [], newWordAllowance: 0,
  loadout: { guard: "ward", tamPhap: "kiem-tam" }, swordKey2: "twin-pearl",
});
type SnapshotPoint = { x: number; z: number; y: number };

export interface TwinCastReport {
  castId: number;
  startTick: number;
  alive: number;
  aliveGround: number;
  crowsAlive: number;
  victims: number;
  hits: number;
  touch: number;
  corridor: number;
  lotus: number;
  maxHitsOnOne: number;
  crowsHit: number;
  dealt: number;
  side0: number;
  side1: number;
  boss: number;
  kills: number;
  poolSide0: number;
  poolSide1: number;
  poolStart: number;
  /** Number reached from the F0 points, computed once after the F1 discs are chosen. */
  coverageStatic: number;
  snapshotCount: number;
  firstHitTick: number;
  keyToFirstHitMs: number;
  keyToFirstHitSubmitMs: number;
}
interface Label { readonly el: HTMLDivElement; readonly at: THREE.Vector3; shown: boolean }

export class TwinPearlGreybox {
  readonly group = new THREE.Group();
  world!: World;
  private acc = 0;
  private nextAction = 0;
  private layoutIndex = 0;
  private current: { castId: number; startTick: number; keyAt: number; geometry: TwinPearlCast | null; points: SnapshotPoint[] | null } | null = null;
  private report: TwinCastReport | null = null;
  readonly reports: TwinCastReport[] = [];
  private firstHitShownPending = false;
  private readonly flash = new Map<number, number>();
  private readonly gates = new Map<number, GateId>();
  private labTime = 0;
  private readonly beasts: THREE.InstancedMesh;
  private readonly hold: THREE.Mesh;
  private readonly touch: THREE.Mesh[] = [];
  private readonly beams: THREE.Line[] = [];
  private readonly bodies: THREE.InstancedMesh[] = [];
  private readonly heads: THREE.Mesh[] = [];
  private readonly skies: THREE.InstancedMesh[] = [];
  private readonly skyBridges: THREE.InstancedMesh[] = [];
  private readonly pearl: THREE.Mesh;
  private readonly lotusDisc: THREE.Mesh;
  private readonly lotusFull = new THREE.Group();
  private readonly statics = new THREE.Group();
  private readonly labels = new Map<string, Label>();
  private readonly overlay: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private readonly lastLive = new Map<THREE.Object3D, number>();

  constructor(private readonly camera: THREE.Camera, private readonly sword: () => { x: number; y: number; z: number }, private readonly soundFrame: (frame: number) => void = () => {}, private readonly soundEvent: (event: SimEvent, world: World) => void = () => {}) {
    this.group.name = "twin-pearl-greybox";
    this.beasts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false, toneMapped: false }), 80);
    this.beasts.setColorAt(0, new THREE.Color(COLOURS.beast[0]));
    const groundH = (TWIN_PEARL.groundTopMm - 200) / 1000, groundY = 0.2 + groundH / 2;
    const cylinder = (r: number, h: number): THREE.CylinderGeometry => new THREE.CylinderGeometry(r / 1000, r / 1000, h, 24, 1, false);
    this.hold = new THREE.Mesh(cylinder(TWIN_PEARL.hold.radiusMm, groundH), translucent(COLOURS.hold, 0.32));
    this.hold.position.y = groundY;
    const bodyGeo = cylinder(TWIN_PEARL.heads.radiusMm, groundH);
    const skyH = (TWIN_PEARL.sky.topMm - TWIN_PEARL.sky.bottomMm) / 1000;
    for (let i = 0; i < 2; i += 1) {
      this.touch.push(new THREE.Mesh(cylinder(TWIN_PEARL.touch.radiusMm, groundH), translucent(COLOURS.touch, 0.36)));
      const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: COLOURS.touch, transparent: true, opacity: 0.9, fog: false, toneMapped: false }));
      beam.frustumCulled = false; this.beams.push(beam);
      const body = new THREE.InstancedMesh(bodyGeo, translucent(COLOURS.body, 0.16), 512);
      body.setColorAt(0, new THREE.Color(COLOURS.body)); this.bodies.push(body);
      const head = new THREE.Mesh(bodyGeo, translucent(COLOURS.head, 0.5)); head.position.y = groundY; this.heads.push(head);
      this.skies.push(new THREE.InstancedMesh(cylinder(TWIN_PEARL.sky.radiusMm, skyH), translucent(COLOURS.sky, 0.13), 512));
      this.skyBridges.push(new THREE.InstancedMesh(new THREE.BoxGeometry(TWIN_PEARL.sky.radiusMm / 500, skyH, 1), translucent(COLOURS.sky, 0.2), 80));
    }
    this.pearl = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 14), translucent(COLOURS.pearl, 0.8));
    this.lotusDisc = this.flatDisc(TWIN_PEARL.lotus.radiusMm, COLOURS.lotusHalf, 0.22);
    this.group.add(this.beasts, this.hold, ...this.touch, ...this.beams, ...this.bodies, ...this.heads, ...this.skies, ...this.skyBridges, this.pearl, this.lotusDisc, this.lotusFull, this.statics);
    for (const mesh of [this.beasts, ...this.bodies, ...this.skies, ...this.skyBridges]) { mesh.count = 0; mesh.frustumCulled = false; }
    this.overlay = document.createElement("div");
    this.overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9;font:12px system-ui;color:#eef1f5";
    this.banner = document.createElement("div");
    this.banner.style.cssText = "position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:6px 12px;background:rgba(10,13,19,.82);border:1px solid #4a5568;border-radius:6px;font:600 14px system-ui;white-space:nowrap";
    this.stats = document.createElement("div");
    this.stats.style.cssText = "position:absolute;right:12px;bottom:12px;padding:8px 10px;background:rgba(10,13,19,.82);border:1px solid #4a5568;border-radius:6px;white-space:pre;font:12px ui-monospace,monospace;line-height:1.45";
    this.overlay.append(this.banner, this.stats); document.body.append(this.overlay);
    this.reset();
  }

  private flatDisc(radiusMm: number, colour: number, opacity: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radiusMm / 1000, 64), translucent(colour, opacity));
    mesh.rotation.x = -Math.PI / 2; return mesh;
  }

  private clear(group: THREE.Group): void {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      }
    });
    group.clear();
  }

  reset(): void {
    this.world = createWorld(THANH_THACH_AI, 1, header(1)); this.world.phaseEndsAt = -1;
    this.acc = 0; this.nextAction = 0; this.layoutIndex = 0; this.current = null; this.report = null;
    this.flash.clear(); this.gates.clear(); this.lastLive.clear();
    this.clear(this.statics); this.clear(this.lotusFull);
    for (const o of [this.hold, ...this.touch, ...this.beams, ...this.heads, ...this.skies, ...this.skyBridges, this.pearl, this.lotusDisc, this.lotusFull]) o.visible = false;
    for (const m of this.bodies) { m.count = 0; m.visible = false; }
    this.seedTide();
  }

  private buildStatics(cast: TwinPearlCast): void {
    this.clear(this.statics); this.clear(this.lotusFull);
    const line = (positions: number[], dashed: boolean): THREE.Line => {
      const material = dashed ? new THREE.LineDashedMaterial({ color: COLOURS.lane, transparent: true, opacity: 0.6, dashSize: 0.35, gapSize: 0.25, fog: false, toneMapped: false }) : new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, fog: false, toneMapped: false });
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const l = new THREE.Line(g, material); if (dashed) l.computeLineDistances(); l.frustumCulled = false; return l;
    };
    for (const d of cast.dragons) {
      const nodes: number[] = [], samples: number[] = [];
      for (let k = 0; k < d.nodes.length; k += 2) nodes.push(uToM(d.nodes[k]!), 0.09, uToM(d.nodes[k + 1]!));
      for (let k = 0; k < d.sx.length; k += 1) samples.push(uToM(d.sx[k]!), 0.06, uToM(d.sz[k]!));
      this.statics.add(line(nodes, false), line(samples, true));
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(nodes, 3));
      this.statics.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.28, fog: false, toneMapped: false })));
      this.addPetal(d);
    }
    const core = this.flatDisc(TWIN_PEARL.lotus.coreMm, COLOURS.lotusFull, 0.4);
    core.position.set(uToM(cast.px), 0.07, uToM(cast.pz));
    const hold = this.flatDisc(TWIN_PEARL.hold.radiusMm, COLOURS.lotusFull, 0.4);
    hold.position.set(uToM(cast.hx), 0.07, uToM(cast.hz)); this.lotusFull.add(core, hold);
    this.hold.position.x = uToM(cast.hx); this.hold.position.z = uToM(cast.hz);
    this.lotusDisc.position.set(uToM(cast.px), 0.05, uToM(cast.pz));
  }

  /** Capsules over the same sample segments as lotusRegion, including the allowed first-step overhang. */
  private addPetal(d: TwinDragon): void {
    const positions: number[] = [];
    const half = TWIN_PEARL.lotus.petalHalfWidthMm / 1000;
    const first = Math.max(0, d.petalFrom - 1);
    const caps = new THREE.InstancedMesh(new THREE.CircleGeometry(half, 24), translucent(COLOURS.lotusFull, 0.28), d.sx.length - first);
    caps.frustumCulled = false;
    const tmp = new THREE.Object3D(); tmp.rotation.x = -Math.PI / 2;
    for (let k = first; k < d.sx.length; k += 1) {
      const ax = uToM(d.sx[k]!), az = uToM(d.sz[k]!);
      tmp.position.set(ax, 0.065, az); tmp.updateMatrix(); caps.setMatrixAt(k - first, tmp.matrix);
      if (k + 1 >= d.sx.length) continue;
      const bx = uToM(d.sx[k + 1]!), bz = uToM(d.sz[k + 1]!);
      const len = Math.hypot(bx - ax, bz - az); if (len === 0) continue;
      const nx = -(bz - az) * half / len, nz = (bx - ax) * half / len;
      const a = [ax + nx, 0.06, az + nz], b = [ax - nx, 0.06, az - nz], c = [bx + nx, 0.06, bz + nz], e = [bx - nx, 0.06, bz - nz];
      positions.push(...a, ...b, ...c, ...b, ...e, ...c);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.lotusFull.add(new THREE.Mesh(g, translucent(COLOURS.lotusFull, 0.28)), caps);
  }

  // ── Layouts: §9.8, clipped to this moving world's usable cells ────────────
  private spawn(species: SpeciesId, gate: GateId, x: number, z: number): BeastState | null {
    if (this.world.beasts.live >= this.world.liveCap) return null;
    const beast = spawnBeast(this.world, species, gate, { wave: -1, x: mToU(x), z: mToU(z) });
    this.gates.set(beast.slot * 100_000 + beast.serial, gate); return beast;
  }

  private seedTide(): void {
    const f = this.world.stage.field;
    const add = (x: number, z: number, sky = false): void => {
      if (x * 1000 < f.minXMm || x * 1000 > f.maxXMm || z * 1000 < f.minZMm || z * 1000 > f.maxZMm) return;
      if (this.world.field.blocked[cellAt(this.world.field, mToU(x), mToU(z))] !== 0) return;
      this.spawn(sky ? "hoa-nha" : "phong-lang", sky ? "sky" : "A", x, z);
    };
    const stream = (ax: number, az: number, bx: number, bz: number, n: number): void => {
      for (let k = 0; k < n; k += 1) { const t = k / (n - 1); add(ax + (bx - ax) * t + 0.5 * (k % 3 - 1), az + (bz - az) * t); }
    };
    if (this.layoutIndex === 0) { stream(-15, -17.5, -1.8, -2.2, 19); stream(15, -17.5, 1.8, -2.2, 19); add(-19, -17, true); add(19, -17, true); }
    else if (this.layoutIndex === 1) { for (let k = 0; k < 38; k += 1) add(0.6 * (k % 5 - 2), -17.5 + 15 * Math.floor(k / 5) / 7); add(-1.5, -16, true); add(1.5, -16, true); }
    else if (this.layoutIndex === 2) { stream(-19.5, -6, -2.2, -1, 13); stream(0, -17.5, 0, -2.2, 13); stream(19.5, -6, 2.2, -1, 13); add(-19, -17, true); add(0, -17, true); add(19, -17, true); }
    else if (this.layoutIndex === 3) {
      for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) for (const r of [5, 8, 11, 14, 17]) add(x! * r, z! * r);
      add(15, 0, true); add(-15, 0, true); add(0, 15, true); add(0, -15, true);
    } else { for (let k = 0; k < 38; k += 1) add(-18 + 3 * (k % 13), 4 + 1.5 * Math.floor(k / 13)); add(-17, 7, true); add(17, 7, true); }
  }

  private counts(): { ground: number; crows: number } {
    let ground = 0, crows = 0;
    for (const b of this.world.beasts.list) if (b.alive) b.gate === "sky" ? crows += 1 : ground += 1;
    return { ground, crows };
  }

  refillAll(): void {
    for (const b of this.world.beasts.list) if (b.alive) b.alive = false;
    this.stepWorld(); this.seedTide();
  }
  nextLayout(): void { this.layoutIndex = (this.layoutIndex + 1) % LAYOUT_NAMES.length; this.refillAll(); }
  addBoss(): void {
    const boss = this.world.stage.boss; if (boss === null) return;
    const p = gatePoint(this.world.stage, "A"); this.spawn(boss, "A", uToM(p.x), uToM(p.z));
  }

  cast(keyAt = performance.now()): void {
    const world = this.world, n = this.nextAction++;
    const cast: Cast = { seat: 0, slot: 2, actionId: n, wordId: "twin-pearl-" + n, tick: world.tick, channel: "typing", quality: "good", origin: { x: 0, z: mToU(3) }, aim: null, state: "held", heldUntil: -1, target: null, node: null };
    const counts = this.counts(); emitCast(world, cast);
    this.current = { castId: cast.actionId, startTick: world.tick, keyAt, geometry: null, points: null };
    this.report = { castId: cast.actionId, startTick: world.tick, alive: counts.ground + counts.crows, aliveGround: counts.ground, crowsAlive: counts.crows, victims: 0, hits: 0, touch: 0, corridor: 0, lotus: 0, maxHitsOnOne: 0, crowsHit: 0, dealt: 0, side0: 0, side1: 0, boss: 0, kills: 0, poolSide0: 0, poolSide1: 0, poolStart: 0, coverageStatic: -1, snapshotCount: 0, firstHitTick: -1, keyToFirstHitMs: -1, keyToFirstHitSubmitMs: -1 };
    this.reports.push(this.report); this.firstHitShownPending = true;
    this.stepWorld();
    // Immediately after F0, retain snapshot positions even if the F0 hit killed them.
    this.captureSnapshot(); this.acc = 0;
  }

  liveCast(): TwinPearlCast | null {
    const casts = this.world.skills.twinPearl?.casts ?? [];
    return casts.length > 0 ? casts[casts.length - 1]! : null;
  }

  private captureSnapshot(): void {
    const cur = this.current, live = this.liveCast();
    if (cur === null || live === null || live.castId !== cur.castId || cur.points !== null) return;
    cur.geometry = live; cur.startTick = live.startTick;
    cur.points = [];
    for (let i = 0; i < live.snapshot.length; i += 2) {
      const b = this.world.beasts.list[live.snapshot[i]!]!;
      if (b.serial === live.snapshot[i + 1]) cur.points.push({ x: b.x, z: b.z, y: b.y });
    }
    if (this.report !== null) { this.report.startTick = live.startTick; this.report.snapshotCount = cur.points.length; }
    this.buildStatics(live);
  }

  private stepWorld(): void {
    step(this.world, []); this.world.formation.heart = this.world.formation.heartMax;
    this.captureSnapshot();
    for (const e of this.world.events.drain()) this.onEvent(e);
    const live = this.current?.geometry ?? this.liveCast(), r = this.report, cur = this.current;
    if (live === null || r === null || live.castId !== r.castId) return;
    this.soundFrame(this.world.tick - live.startTick - 1);
    Object.assign(r, { victims: live.victims, dealt: live.dealt, boss: live.bossDealt, poolSide0: live.pool.slice(0, POOL_PARTS).reduce((s, v) => s + v, 0), poolSide1: live.pool.slice(POOL_PARTS).reduce((s, v) => s + v, 0), poolStart: live.poolStart.reduce((s, v) => s + v, 0) });
    let hits = 0, touch = 0, corridor = 0, lotus = 0, most = 0, crows = 0;
    for (const v of live.book) {
      hits += v.hits; if (v.kinds & 1) touch += 1; if (v.kinds & 2) corridor += 1; if (v.kinds & 4) lotus += 1;
      most = Math.max(most, v.hits); if (this.gates.get(v.slot * 100_000 + v.serial) === "sky") crows += 1;
    }
    Object.assign(r, { hits, touch, corridor, lotus, maxHitsOnOne: most, crowsHit: crows });
    if (r.coverageStatic < 0 && cur?.points !== null && cur?.points !== undefined && this.world.tick - live.startTick - 1 >= TWIN_PEARL.touch.fromTick) r.coverageStatic = staticCoverage(live, cur.points);
  }

  private onEvent(e: SimEvent): void {
    this.soundEvent(e, this.world);
    const r = this.report;
    if (e.type === "hit" && e.source === "slot2") {
      this.flash.set(e.beast.slot * 100_000 + e.beast.serial, this.labTime);
      const entry = this.current?.geometry?.book.find((v) => v.slot === e.beast.slot && v.serial === e.beast.serial);
      if (r !== null && entry !== undefined) {
        if (r.firstHitTick < 0) r.firstHitTick = e.tick - r.startTick;
        if (entry.side === 0) r.side0 += e.amount; else r.side1 += e.amount;
      }
    } else if (e.type === "death" && e.by === "slot2" && r !== null) r.kills += 1;
  }

  update(dt: number): void {
    this.labTime += dt; this.acc += Math.min(dt, 0.1);
    while (this.acc >= TICK_S) { this.acc -= TICK_S; this.stepWorld(); }
    this.draw();
  }

  /**
   * After the frame that draws the first hit of the latest cast is submitted: the submit time now, and the shown time
   * at the start of the next frame (requestAnimationFrame's timestamp; the drawn frame is presented by then).
   */
  afterRender(now = performance.now()): void {
    const r = this.report;
    if (!this.firstHitShownPending || r === null || this.current === null || r.firstHitTick < 0) return;
    this.firstHitShownPending = false;
    const keyAt = this.current.keyAt;
    r.keyToFirstHitSubmitMs = Math.round((now - keyAt) * 10) / 10;
    requestAnimationFrame((frameStart) => {
      r.keyToFirstHitMs = Math.round((frameStart - keyAt) * 10) / 10;
    });
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
    for (const l of this.labels.values()) l.shown = false;
    const world = this.world, tmp = new THREE.Object3D(), size = new THREE.Vector3(), colour = new THREE.Color();
    const cur = this.current, cast = cur?.geometry ?? null;
    const hitsOf = new Map<number, number>();
    if (cast !== null) for (const v of cast.book) hitsOf.set(v.slot * 100_000 + v.serial, v.hits);
    let n = 0;
    for (const b of world.beasts.list) {
      if (!b.alive || n >= this.beasts.instanceMatrix.count) continue;
      this.beastSize(b, size);
      tmp.position.set(uToM(b.x), uToM(b.y) + size.y / 2, uToM(b.z));
      tmp.rotation.set(0, Math.atan2(-uToM(b.x), -uToM(b.z)), 0); tmp.scale.copy(size); tmp.updateMatrix();
      this.beasts.setMatrixAt(n, tmp.matrix);
      const id = b.slot * 100_000 + b.serial;
      colour.setHex(COLOURS.beast[Math.min(3, hitsOf.get(id) ?? 0)]!);
      if (this.labTime - (this.flash.get(id) ?? -10) < 0.12) colour.setHex(0xffffff);
      this.beasts.setColorAt(n++, colour);
    }
    this.beasts.count = n; this.beasts.instanceMatrix.needsUpdate = true;
    if (this.beasts.instanceColor) this.beasts.instanceColor.needsUpdate = true;
    const t = cur === null ? -1 : world.tick - cur.startTick - 1;
    const stillHits = cast !== null && t >= TWIN_PEARL.hold.tick && t <= TWIN_PEARL_END_TICK;
    this.statics.visible = cast !== null && t <= 300;
    if (this.show(this.hold, stillHits && t === TWIN_PEARL.hold.tick, 0.32)) this.label("hold", "hold disc r 4.5 m · F0 · touch 15 %").at.set(this.hold.position.x, 1.7, this.hold.position.z);
    for (let side = 0; side < 2; side += 1) {
      const disc = cast?.disc[side], mesh = this.touch[side]!, beam = this.beams[side]!;
      const liveNow = stillHits && disc !== undefined && disc.on !== 0 && t >= TWIN_PEARL.touch.fromTick && t <= TWIN_PEARL.touch.toTick;
      if (disc !== undefined && disc.on !== 0) {
        const h = disc.sky === 0 ? (TWIN_PEARL.groundTopMm - 200) / 1000 : (TWIN_PEARL.sky.topMm - TWIN_PEARL.sky.bottomMm) / 1000;
        const y = disc.sky === 0 ? 0.2 + h / 2 : (TWIN_PEARL.sky.bottomMm + TWIN_PEARL.sky.topMm) / 2000;
        mesh.position.set(uToM(disc.x), y, uToM(disc.z)); mesh.scale.y = h / ((TWIN_PEARL.groundTopMm - 200) / 1000);
        const s = this.sword(), pos = beam.geometry.getAttribute("position") as THREE.BufferAttribute;
        pos.setXYZ(0, s.x, s.y, s.z); pos.setXYZ(1, mesh.position.x, y, mesh.position.z); pos.needsUpdate = true;
      }
      if (this.show(mesh, liveNow, 0.36)) this.label("touch" + side, "side " + side + (disc?.sky === 1 ? " sky disc · corridor" : " ground disc · touch") + " · F1–F2").at.set(mesh.position.x, mesh.position.y + 1, mesh.position.z);
      this.show(beam as THREE.Line & { material: THREE.Material }, liveNow, 0.9);
      const d = cast?.dragons[side], body = this.bodies[side]!, head = this.heads[side]!;
      const range = { first: 0, last: -1 };
      let count = 0;
      if (stillHits && d !== undefined) {
        liveSamples(d, t, range);
        // Preserve the head end if a future field needs more samples than this instance buffer.
        for (let k = range.last; k >= range.first && count < body.instanceMatrix.count; k -= 1) {
          tmp.position.set(uToM(d.sx[k]!), this.hold.position.y, uToM(d.sz[k]!)); tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); body.setMatrixAt(count, tmp.matrix);
          colour.setHex(COLOURS.body).multiplyScalar(1 - 0.6 * Math.max(0, Math.min(1, (t - d.pass[k]!) / TWIN_PEARL.trailTicks)));
          body.setColorAt(count++, colour);
        }
      }
      body.count = count; body.visible = count > 0; body.instanceMatrix.needsUpdate = true;
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
      const hi = d === undefined ? -1 : headIndex(d, t);
      const headLive = stillHits && d !== undefined && hi >= 0 && t <= TWIN_PEARL.roar.toTick;
      if (headLive && d !== undefined) head.position.set(uToM(d.sx[hi]!), head.position.y, uToM(d.sz[hi]!));
      if (this.show(head, headLive, 0.5)) this.label("head" + side, "head " + side + " · F3–F48 · corridor 45 %").at.set(head.position.x, 2, head.position.z);
      else if (count > 0 && d !== undefined) this.label("trail" + side, "trail " + side + " · 54 ticks after passage").at.set(uToM(d.sx[range.last]!), 1.9, uToM(d.sz[range.last]!));
      this.drawSky(side, d, t, stillHits, tmp);
    }
    const pearlOn = cast !== null && t >= TWIN_PEARL.pearl.fromTick && t < TWIN_PEARL.lotus.fromTick;
    if (pearlOn && cast !== null) {
      const s = this.sword(), f = Math.min(1, (t - TWIN_PEARL.pearl.fromTick) / (TWIN_PEARL.pearl.arriveTick - TWIN_PEARL.pearl.fromTick));
      this.pearl.position.set(s.x + (uToM(cast.px) - s.x) * f, s.y + (2.2 - s.y) * f + Math.sin(Math.PI * f) * 1.5, s.z + (uToM(cast.pz) - s.z) * f);
      this.label("pearl", "pearl · no hit").at.copy(this.pearl.position).y += 0.8;
    }
    this.pearl.visible = pearlOn;
    const lotusLive = stillHits && t >= TWIN_PEARL.lotus.fromTick && t <= TWIN_PEARL.lotus.toTick;
    const shown = this.show(this.lotusDisc, lotusLive, 0.22); this.lotusFull.visible = shown;
    this.lotusFull.traverse((c) => { if (c instanceof THREE.Mesh) (c.material as THREE.MeshBasicMaterial).opacity = (this.lotusDisc.material as THREE.MeshBasicMaterial).opacity * 1.3; });
    if (shown && cast !== null) this.label("lotus", "lotus · F57–F77 · full core + petals + hold, half elsewhere in 9 m").at.set(uToM(cast.px), 0.6, uToM(cast.pz) - 5);
    const v = new THREE.Vector3();
    for (const l of this.labels.values()) {
      if (!l.shown) { l.el.style.display = "none"; continue; }
      v.copy(l.at).project(this.camera); l.el.style.display = v.z < 1 ? "block" : "none";
      l.el.style.left = ((v.x * 0.5 + 0.5) * innerWidth).toFixed(1) + "px"; l.el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight).toFixed(1) + "px";
    }
    this.banner.textContent = this.phaseText(t, cur !== null); this.stats.textContent = this.statsText();
  }

  private drawSky(side: number, d: TwinDragon | undefined, t: number, stillHits: boolean, tmp: THREE.Object3D): void {
    const caps = this.skies[side]!, bridges = this.skyBridges[side]!;
    const on = stillHits && d !== undefined && t >= TWIN_PEARL.sky.fromTick && t <= TWIN_PEARL.sky.toTick;
    let count = 0, segments = 0;
    const y = (TWIN_PEARL.sky.bottomMm + TWIN_PEARL.sky.topMm) / 2000;
    const add = (x: number, z: number): void => {
      if (count >= caps.instanceMatrix.count) return;
      tmp.position.set(uToM(x), y, uToM(z)); tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); caps.setMatrixAt(count++, tmp.matrix);
    };
    if (on && d !== undefined) {
      const hi = headIndex(d, t), range = { first: 0, last: -1 };
      liveSamples(d, t, range);
      for (let k = range.last; k >= range.first; k -= 1) add(d.sx[k]!, d.sz[k]!);
      if (hi >= 0) {
        const hx = d.sx[hi]!, hz = d.sz[hi]!; add(hx, hz);
        for (let k = 0; k < d.sky.length && segments < bridges.instanceMatrix.count; k += 2) {
          const x = d.sky[k]!, z = d.sky[k + 1]!; add(x, z);
          const dx = uToM(x - hx), dz = uToM(z - hz);
          tmp.position.set(uToM(hx) + dx / 2, y, uToM(hz) + dz / 2); tmp.rotation.set(0, Math.atan2(dx, dz), 0); tmp.scale.set(1, 1, Math.hypot(dx, dz)); tmp.updateMatrix(); bridges.setMatrixAt(segments++, tmp.matrix);
        }
        this.label("sky" + side, "sky capsules " + side + " · F30–F56 · 2.5–6 m").at.set(uToM(hx), 6.4, uToM(hz));
      }
    }
    for (const [mesh, n] of [[caps, count], [bridges, segments]] as const) { mesh.count = n; mesh.visible = n > 0; mesh.instanceMatrix.needsUpdate = true; }
  }

  private phaseText(t: number, cast: boolean): string {
    const name = "Twin Dragons, One Burning Pearl · " + LAYOUT_NAMES[this.layoutIndex];
    if (!cast || t > 300) return name + " · press 2 to cast · L layout · N restore";
    const f = " · F" + t + " · ";
    if (t < TWIN_PEARL.hold.tick) return name + " · waiting for a target";
    if (t === TWIN_PEARL.hold.tick) return name + f + "Release: heart disc";
    if (t <= TWIN_PEARL.touch.toTick) return name + f + "Release: two target discs";
    if (t < TWIN_PEARL.sky.fromTick) return name + f + "Travel: heads, pearl and trail";
    if (t <= TWIN_PEARL.heads.toTick) return name + f + "Travel: heads and sky capsules";
    if (t <= TWIN_PEARL.roar.toTick) return name + f + "Impact: roar, trail and sky capsules";
    if (t <= TWIN_PEARL.lotus.toTick) return name + f + "Impact: lotus";
    if (t <= TWIN_PEARL_END_TICK) return name + f + "Aftermath: trail still hits";
    return name + f + "Aftermath: view only, to F300";
  }

  private statsText(): string {
    const { ground, crows } = this.counts(), r = this.report;
    const lines = ["layout: " + LAYOUT_NAMES[this.layoutIndex] + " · L next · N restore", "tide now: " + ground + " ground + " + crows + " crows · tick " + this.world.tick];
    if (r === null) return lines.join("\n");
    const total = r.side0 + r.side1 || 1;
    lines.push("last cast #" + r.castId + " · " + r.aliveGround + " ground + " + r.crowsAlive + " crows at key",
      "distinct hit: " + r.victims + " · hits " + r.hits + " · most on one " + r.maxHitsOnOne,
      "touch " + r.touch + " · corridor " + r.corridor + " · lotus " + r.lotus,
      "coverageStatic: " + (r.coverageStatic < 0 ? "pending F1" : r.coverageStatic + "/" + r.snapshotCount + " (" + Math.round(100 * r.coverageStatic / Math.max(1, r.snapshotCount)) + " %)"),
      "crows hit " + r.crowsHit + "/" + r.crowsAlive + " · kills " + r.kills,
      "damage " + r.dealt + " HP · side 0/side 1 " + Math.round(100 * r.side0 / total) + "/" + Math.round(100 * r.side1 / total) + " · boss " + r.boss,
      "budget left: side 0 " + r.poolSide0 + " · side 1 " + r.poolSide1 + " of " + r.poolStart + " HP",
      "first hit F" + r.firstHitTick + " · key → shown ≤ " + (r.keyToFirstHitMs < 0 ? "…" : r.keyToFirstHitMs + " ms") + " (submitted " + (r.keyToFirstHitSubmitMs < 0 ? "…" : r.keyToFirstHitSubmitMs + " ms") + ")");
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
    const instances = [this.beasts, ...this.bodies, ...this.skies, ...this.skyBridges];
    const counts = instances.map((m) => m.count);
    for (const m of instances) m.count = Math.max(1, m.count);
    renderer.compile(this.group, camera);
    instances.forEach((m, i) => (m.count = counts[i]!));
    for (const [o, v] of shown) o.visible = v;
    // The labels' first layout too.
    for (const key of ["hold", "touch0", "touch1", "head0", "head1", "trail0", "trail1", "sky0", "sky1", "pearl", "lotus"]) this.label(key, key).el.style.display = "none";
  }

  dispose(): void {
    this.overlay.remove();
  }
}
