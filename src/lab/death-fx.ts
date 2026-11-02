/**
 * Deaths that change the silhouette (power pass, canon D58 (5), POWER_RESEARCH
 * §4, dev-only lab): on the frame a beast falls, on top of the herd's dissolve
 * with its glowing edge, a light burst (a hot star and a shock ring), spirit
 * threads unwinding upward in the killer's colour, ink flecks flung along the
 * blow and falling (ink, never blood: canon §10.9), and for elites and the
 * king six luminous spirit shards. Sized to read at the play camera (~37 px
 * a metre at 1080p). Round 2: the body shatters into spirit sparks in the
 * killer's saturated colour (12 on a small beast, 26 on an elite or the
 * king) while the herd slices it away (herd.ts), every death throws a few
 * shards, and a ground scorch with a brief lit pool stays under it.
 * Eight draw calls, preallocated pools, no allocation per frame. The bus's
 * death event drives it (events.ts).
 */
import * as THREE from "three";
import { BeamPool, Rand, SpritePool } from "../view/skills/fxkit";

const INK = [0.045, 0.05, 0.065] as const;

export interface DeathTextures {
  readonly flare: THREE.Texture;
  readonly shock: THREE.Texture;
  readonly splash: THREE.Texture;
  readonly glow: THREE.Texture;
  /** An ink stain (the ground scorch). */
  readonly scorch: THREE.Texture;
}

export class DeathFx {
  private readonly burst: SpritePool;
  private readonly ring: SpritePool;
  private readonly ink: SpritePool;
  private readonly shards: SpritePool;
  private readonly threads: BeamPool;
  private readonly sparks: SpritePool;
  private readonly scorch: SpritePool;
  private readonly pool: SpritePool;
  private readonly rand = new Rand(4242);
  private readonly c = new THREE.Color();
  /** Low: fewer threads and flecks. */
  private readonly dens: number;

  constructor(parent: THREE.Object3D, tex: DeathTextures, lite: boolean) {
    this.dens = lite ? 0.5 : 1;
    this.burst = new SpritePool(48, tex.flare, "add", "camera", 15);
    this.ring = new SpritePool(48, tex.shock, "add", "camera", 14);
    this.ink = new SpritePool(160, tex.splash, "ink", "camera", 11);
    this.shards = new SpritePool(96, tex.glow, "add", "camera", 15);
    this.threads = new BeamPool(160, 14);
    this.sparks = new SpritePool(720, tex.glow, "add", "camera", 15, { crop: 0.6 });
    this.scorch = new SpritePool(96, tex.scorch, "ink", "ground", 3, { fadeIn: 0.05, twoSided: true });
    this.pool = new SpritePool(64, tex.glow, "add", "ground", 5, { crop: 0.7, twoSided: true });
    parent.add(this.scorch.mesh, this.pool.mesh, this.ink.mesh, this.ring.mesh, this.threads.mesh, this.shards.mesh, this.sparks.mesh, this.burst.mesh);
  }

  /** A beast died at (x, y, z), struck along (dx, dz), by a blow of colour `rgb` (0xRRGGBB); `beastTier` 0–4. */
  spawn(x: number, y: number, z: number, dx: number, dz: number, rgb: number, beastTier: number): void {
    this.c.setHex(rgb, THREE.SRGBColorSpace);
    // The blow's colour is a pale flash (45 % white): take the white out (a power on the unit colour), so the
    // threads and the burst read as jade or cyan, not as white bloom.
    const m = Math.max(this.c.r, this.c.g, this.c.b, 1e-4);
    let ur = Math.pow(this.c.r / m, 2.4);
    let ug = Math.pow(this.c.g / m, 2.4);
    let ub = Math.pow(this.c.b / m, 2.4);
    const m2 = Math.max(ur, ug, ub, 1e-4);
    ur /= m2;
    ug /= m2;
    ub /= m2;
    const big = beastTier >= 2;
    const k = beastTier >= 4 ? 2.2 : big ? 1.35 : 1;
    // Light burst: a hot star (thin HDR core blooms) and a shock ring at ≤ 0.9.
    const b = this.burst.spec.reset();
    b.x = x;
    b.y = y;
    b.z = z;
    b.life = 0.2;
    b.size0 = 1.0 * k;
    b.size1 = 1.5 * k;
    b.rot = this.rand.range(0, Math.PI);
    b.r = ur * 3.2;
    b.g = ug * 3.2;
    b.b = ub * 3.2;
    this.burst.emit();
    const r = this.ring.spec.reset();
    r.x = x;
    r.y = y;
    r.z = z;
    r.life = 0.28;
    r.size0 = 0.4 * k;
    r.size1 = 1.7 * k;
    r.r = ur * 0.8;
    r.g = ug * 0.8;
    r.b = ub * 0.8;
    r.a = 0.6;
    this.ring.emit();
    // The body shatters into spirit sparks: from all over it, outward, rising, in the killer's colour.
    const nSparks = Math.max(6, Math.round((big ? 26 : 12) * this.dens));
    for (let i = 0; i < nSparks; i += 1) {
      const a = this.rand.range(0, Math.PI * 2);
      const r = this.rand.range(0.1, 0.45) * k;
      const s = this.sparks.spec.reset();
      s.x = x + Math.cos(a) * r;
      s.y = y + this.rand.range(-0.3, 0.35) * k;
      s.z = z + Math.sin(a) * r;
      const sp = this.rand.range(1.8, 4.6) * (k > 2 ? 1.3 : 1);
      s.vx = Math.cos(a) * sp + dx * 1.6;
      s.vz = Math.sin(a) * sp + dz * 1.6;
      s.vy = this.rand.range(1.4, 3.4);
      s.drag = 2.6;
      s.gravity = 0.8;
      s.stretch = 0.035;
      s.life = this.rand.range(0.45, 0.8);
      s.size0 = this.rand.range(0.16, 0.28) * (k > 2 ? 1.4 : 1);
      s.size1 = 0.04;
      const hot = i % 4 === 0 ? 1.6 : 1;
      s.r = (ur * 2.4 + (hot - 1)) * hot;
      s.g = (ug * 2.4 + (hot - 1)) * hot;
      s.b = (ub * 2.4 + (hot - 1)) * hot;
      this.sparks.emit();
    }
    // A scorch on the ground where it fell and a brief pool of the killer's light.
    const g = this.scorch.spec.reset();
    g.x = x;
    g.y = 0.02;
    g.z = z;
    g.life = 2.4;
    g.size0 = 1.2 * k;
    g.size1 = 1.6 * k;
    g.rot = this.rand.range(0, 6.28);
    g.r = INK[0];
    g.g = INK[1];
    g.b = INK[2];
    g.a = 0.72;
    this.scorch.emit();
    const p = this.pool.spec.reset();
    p.x = x;
    p.y = 0.03;
    p.z = z;
    p.life = 0.4;
    p.size0 = 1.6 * k;
    p.size1 = 2.4 * k;
    p.r = ur * 0.7;
    p.g = ug * 0.7;
    p.b = ub * 0.7;
    this.pool.emit();
    // Spirit threads unwinding upward, each leaning its own way, growing from the body over ~0.18 s.
    const nThreads = Math.max(2, Math.round((big ? 5 : 3) * this.dens));
    for (let i = 0; i < nThreads; i += 1) {
      const a = (i / nThreads) * Math.PI * 2 + this.rand.range(-0.4, 0.4);
      const lean = this.rand.range(0.08, 0.3);
      const t = this.threads.spec.reset();
      t.x = x + Math.cos(a) * 0.15;
      t.y = y;
      t.z = z + Math.sin(a) * 0.15;
      const hx = Math.cos(a) * lean + dx * 0.25;
      const hz = Math.sin(a) * lean + dz * 0.25;
      const l = Math.hypot(hx, 1, hz);
      t.dx = hx / l;
      t.dy = 1 / l;
      t.dz = hz / l;
      t.vx = hx * 0.8;
      t.vy = 1.1;
      t.vz = hz * 0.8;
      t.len0 = 0.25;
      t.len1 = (1.0 + this.rand.range(0, 0.6)) * k;
      t.grow = 0.2;
      t.w0 = 0.2 * k;
      t.w1 = 0.07;
      t.life = this.rand.range(0.65, 0.9);
      // A soft coloured wisp: a modest core (only its middle blooms) inside a strong halo.
      t.cr = ur * 1.3;
      t.cg = ug * 1.3;
      t.cb = ub * 1.3;
      t.hr = ur * 0.85;
      t.hg = ug * 0.85;
      t.hb = ub * 0.85;
      t.fadeBase = 0.45;
      t.fadeTip = 0.4;
      t.rise = 0.03;
      this.threads.emit();
    }
    // Ink flecks flung along the blow, falling.
    const nInk = Math.max(2, Math.round((big ? 5 : 3) * this.dens));
    for (let i = 0; i < nInk; i += 1) {
      const s = this.ink.spec.reset();
      s.x = x;
      s.y = y;
      s.z = z;
      const sp = this.rand.range(2.0, 3.4);
      const side = this.rand.range(-0.7, 0.7);
      s.vx = (dx + -dz * side) * sp;
      s.vz = (dz + dx * side) * sp;
      s.vy = this.rand.range(1.2, 2.6);
      s.gravity = -9;
      s.drag = 1;
      s.life = this.rand.range(0.45, 0.65);
      s.size0 = this.rand.range(0.3, 0.45) * k;
      s.size1 = s.size0 * 1.5;
      s.rot = this.rand.range(0, 6.28);
      s.rotV = this.rand.range(-3, 3);
      s.r = INK[0];
      s.g = INK[1];
      s.b = INK[2];
      s.a = 0.92;
      this.ink.emit();
    }
    // Every death throws luminous spirit shards: four from a small beast, eight from an elite or the king.
    {
      const nShards = big ? 8 : 4;
      for (let i = 0; i < nShards; i += 1) {
        const a = (i / nShards) * Math.PI * 2 + this.rand.range(-0.3, 0.3);
        const s = this.shards.spec.reset();
        s.x = x;
        s.y = y;
        s.z = z;
        const sp = this.rand.range(4, 6) * (k > 2 ? 1.3 : 1);
        s.vx = Math.cos(a) * sp;
        s.vz = Math.sin(a) * sp;
        s.vy = this.rand.range(1.5, 3.5);
        s.gravity = -4;
        s.drag = 2.2;
        s.stretch = 0.06;
        s.life = 0.55;
        s.size0 = (big ? 0.42 : 0.3) * k;
        s.size1 = 0.14 * k;
        s.r = ur * 2.6;
        s.g = ug * 2.6;
        s.b = ub * 2.6;
        this.shards.emit();
      }
    }
  }

  update(dt: number): void {
    this.burst.update(dt);
    this.ring.update(dt);
    this.ink.update(dt);
    this.shards.update(dt);
    this.threads.update(dt);
    this.sparks.update(dt);
    this.scorch.update(dt);
    this.pool.update(dt);
  }

  reset(): void {
    this.burst.clear();
    this.ring.clear();
    this.ink.clear();
    this.shards.clear();
    this.threads.clear();
    this.sparks.clear();
    this.scorch.clear();
    this.pool.clear();
  }
}
