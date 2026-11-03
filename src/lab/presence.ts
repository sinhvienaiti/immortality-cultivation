/**
 * The caster's presence in the skills lab (dev-only, never built; skill
 * game-hero-presence-vfx, round 2 of the smooth-motion pass: "the caster is
 * hard to read at the play camera"). Three switchable layers:
 * - P7 ground ring: a thin antialiased ring under the feet that follows the
 *   caster (fxkit GroundSigil "presence": three slow arc marks, a dark
 *   backing, soft edge, never red), in the colours of the skill at hand;
 * - P1 key rim: a fresnel rim biased to the top, added to the caster's own
 *   materials (chained after the caster's hit rim in caster.ts, which this
 *   file does not edit), so the silhouette separates from the paving;
 * - the hit reaction: sparks and a small flash in the attacker's red at the
 *   point the blow lands on the caster (the impact carries its source's
 *   colour, VFX_STANDARD §3.6), with a short dip of the presence.
 * States (layers.md §3): idle breathes (3 s), ready grows with the typing,
 * action swells into the release and settles in ~0.25 s, hit dips < 0.1 s.
 * Bloom rule: the rim ≤ 0.9 a channel, the ring's light ≤ 0.9 with a thin
 * core; only the sparks' thin cores are HDR. Nothing allocates per frame.
 */
import * as THREE from "three";
import { approach, GroundSigil, SpritePool, smooth01 } from "../view/skills/fxkit";
import type { SwordSkillFx } from "../view/skills/sword-skills";

/** The rim term (view space): (1 − N·V)³, stronger on the upper edges (the key from above). */
const RIM_GLSL = [
  "\tfloat presF = pow( clamp( 1.0 - dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), 3.0 );",
  "\tfloat presK = 0.4 + 0.6 * clamp( dot( normal, uPresKey ), 0.0, 1.0 );",
  "\ttotalEmissiveRadiance += uPresRim * ( presF * presK );",
].join("\n");

/** The enemy red (canon §21.1, #FF4A4A) for the blow's sparks: a hot core and a glow ≤ 0.9. */
const ENEMY_CORE = [2.8, 0.75, 0.6] as const;
const ENEMY_GLOW = [0.9, 0.22, 0.18] as const;

export class CasterPresence {
  /** P7: the ground ring (the probe names it by this field). */
  readonly presenceRing: GroundSigil;
  /** The blow's sparks on the caster and its ring of red light (flash layers). */
  readonly hitSparks: SpritePool;
  readonly hitRing: SpritePool;
  /** Layer switches (a lab check: each layer judged alone). */
  ringOn = true;
  rimOn = true;
  private readonly rimU = { value: new THREE.Color() };
  private readonly keyU = { value: new THREE.Vector3(0.3, 0.95, 0).normalize() };
  private time = 0;
  /** Drawn levels: ready (typing), the release swell, the hit dip; the swell and dip ease toward goals that decay. */
  private ready = 0;
  private swell = 0;
  private swellGoal = 0;
  private dip = 0;
  private dipGoal = 0;
  /** Releases seen (fx.presence.releases); −1 after a reset: the next frame re-syncs without a swell. */
  private releases = -1;
  private readonly col = new THREE.Color();
  private readonly core = new THREE.Color();

  /** `glow`: a soft disc sheet; `ring`: a thick ring sheet (visible radius 0.36 of the sprite, sword-skills.ts R_SHOCK). */
  constructor(layer: THREE.Object3D, glow: THREE.Texture, ring: THREE.Texture) {
    this.presenceRing = new GroundSigil("presence", 1.6, 1.6, "#9fb2cc", "#ffffff");
    this.presenceRing.mesh.renderOrder = 4;
    this.presenceRing.uniforms.uReveal.value = 1;
    this.hitSparks = new SpritePool(96, glow, "add", "camera", 13, { crop: 0.56 });
    this.hitRing = new SpritePool(8, ring, "add", "camera", 14);
    layer.add(this.presenceRing.mesh, this.hitSparks.mesh, this.hitRing.mesh);
  }

  /**
   * Adds the key rim to every standard material of the caster's model,
   * after any patch it already has (the caster's hit rim): the program key
   * grows with it, so each variant compiles once at load.
   */
  attach(model: THREE.Object3D): void {
    const rimU = this.rimU;
    const keyU = this.keyU;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const m = mat as THREE.MeshStandardMaterial;
        if (!m.isMeshStandardMaterial) continue;
        const prev = m.onBeforeCompile;
        const prevKey = m.customProgramCacheKey();
        m.onBeforeCompile = (shader, renderer) => {
          prev.call(m, shader, renderer);
          shader.uniforms.uPresRim = rimU;
          shader.uniforms.uPresKey = keyU;
          shader.fragmentShader =
            "uniform vec3 uPresRim;\nuniform vec3 uPresKey;\n" +
            shader.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n" + RIM_GLSL);
        };
        m.customProgramCacheKey = () => prevKey + "+presence-rim";
        m.needsUpdate = true;
      }
    });
  }

  /** One frame: `dt` world seconds (the hit-stop slows presence with the world); the caster stands at (x, z). */
  update(dt: number, realDt: number, x: number, z: number, fx: SwordSkillFx): void {
    this.time += dt;
    const p = fx.presence;
    // Action: each new release swells the presence, which settles over ~0.25 s. A counter that went back
    // (the lab's reset zeroes fx's) only re-syncs: it swelled with no release after every reset (review fix).
    if (p.releases !== this.releases) {
      if (this.releases >= 0 && p.releases > this.releases) {
        this.swellGoal = Math.max(this.swellGoal, p.tier >= 5 ? 1 : p.tier >= 3 ? 0.8 : 0.55);
      }
      this.releases = p.releases;
    }
    // Up in 2–3 frames, down over ~0.25 s; the hit's dip down in ~2 frames and back within ~0.1 s.
    this.swellGoal = approach(this.swellGoal, 0, 0.06, dt);
    this.swell = approach(this.swell, this.swellGoal, 0.025, dt);
    this.ready = approach(this.ready, p.charge, 0.06, dt);
    this.dipGoal = approach(this.dipGoal, 0, 0.03, realDt);
    this.dip = approach(this.dip, this.dipGoal, 0.03, realDt);
    const pal = fx.paletteOf(p.slot);
    const breathe = 0.5 + 0.5 * Math.sin((this.time * Math.PI * 2) / 3);
    const lift = 1 - 0.6 * this.dip;
    // P1 rim: idle 0.32, up to ~0.6 while typing, ~0.95 at the release peak; × the skill's rim colour (≤ 0.86).
    const rimK = this.rimOn ? (0.28 + 0.06 * breathe + 0.3 * this.ready + 0.35 * this.swell) * lift : 0;
    this.rimU.value.setRGB(pal.rim[0] * rimK, pal.rim[1] * rimK, pal.rim[2] * rimK);
    // P7 ring: follows the feet; brightens and widens with the typing and the release, eased.
    const ring = this.presenceRing;
    if (!this.ringOn) {
      ring.hide();
    } else {
      ring.place(x, z, 0);
      // Its own clock (uTime): the arc marks turn and the noise moves (it never ticked, review fix).
      ring.tick(dt);
      const s = 1 + 0.12 * this.ready + 0.22 * this.swell;
      ring.mesh.scale.set(s, s, 1);
      const m = Math.max(pal.rim[0], pal.rim[1], pal.rim[2], 1e-3);
      const k = 0.6 / m;
      this.col.setRGB(pal.rim[0] * k, pal.rim[1] * k, pal.rim[2] * k);
      this.core.setRGB(pal.sigilCore[0], pal.sigilCore[1], pal.sigilCore[2]);
      ring.uniforms.uColor.value.lerp(this.col, 1 - Math.pow(2, -dt / 0.08));
      ring.uniforms.uCore.value.lerp(this.core, 1 - Math.pow(2, -dt / 0.08));
      ring.uniforms.uGlow.value = (0.5 + 0.1 * breathe + 0.45 * this.ready + 0.6 * this.swell) * lift;
      ring.uniforms.uInk.value = 0.32;
      // Rises in 0.3 s at the start (no pop on the first frame).
      ring.uniforms.uFade.value = Math.min(1, ring.uniforms.uFade.value + realDt / 0.3);
    }
    this.hitSparks.update(dt);
    this.hitRing.update(dt);
  }

  /** The blow from (fromX, fromZ) lands on the caster at (x, z): red sparks and a small flash at the chest, a dip. */
  hit(x: number, z: number, fromX: number, fromZ: number): void {
    let dx = x - fromX;
    let dz = z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // On the body's side that faces the blow, at chest height.
    const hx = x - dx * 0.22;
    const hz = z - dz * 0.22;
    const hy = 1.0;
    const pool = this.hitSparks;
    const f = pool.spec.reset();
    f.x = hx;
    f.y = hy;
    f.z = hz;
    f.life = 0.14;
    f.size0 = 0.9;
    f.size1 = 1.3;
    f.r = ENEMY_GLOW[0];
    f.g = ENEMY_GLOW[1];
    f.b = ENEMY_GLOW[2];
    f.a = 0.8;
    pool.emit();
    // A ring of red light bursts out of the point (0.15 → 0.9 m, full on its first frame, a flash).
    const r = this.hitRing.spec.reset();
    r.x = hx;
    r.y = hy;
    r.z = hz;
    r.life = 0.2;
    r.size0 = 0.15 / 0.36;
    r.size1 = 0.9 / 0.36;
    r.r = ENEMY_GLOW[0];
    r.g = ENEMY_GLOW[1];
    r.b = ENEMY_GLOW[2];
    r.a = 0.85;
    this.hitRing.emit();
    const a0 = Math.atan2(-dz, -dx);
    for (let i = 0; i < 14; i += 1) {
      const s = pool.spec.reset();
      s.x = hx;
      s.y = hy;
      s.z = hz;
      // Thrown back toward the attacker's side and up, in a fan (a fixed spread: repeatable captures).
      const a = a0 + (i / 13 - 0.5) * 2.2;
      const sp = 5 + ((i * 7) % 5) * 1.6;
      s.vx = Math.cos(a) * sp;
      s.vz = Math.sin(a) * sp;
      s.vy = 1 + ((i * 3) % 4) * 1.1;
      s.gravity = -13;
      s.drag = 2.4;
      s.life = 0.16 + ((i * 5) % 4) * 0.04;
      s.size0 = 0.13;
      s.size1 = 0.04;
      s.stretch = 0.06;
      s.r = ENEMY_CORE[0] * 0.8;
      s.g = ENEMY_CORE[1] * 0.8;
      s.b = ENEMY_CORE[2] * 0.8;
      pool.emit();
    }
    this.dipGoal = 1;
  }

  reset(): void {
    this.hitSparks.clear();
    this.hitRing.clear();
    this.ready = this.swell = this.swellGoal = this.dip = this.dipGoal = 0;
    this.time = 0;
    this.releases = -1;
    this.presenceRing.uniforms.uFade.value = 0;
  }

  /** Smoothstep of the presence's drawn ready level (for checks). */
  get readyShown(): number {
    return smooth01(this.ready);
  }
}
