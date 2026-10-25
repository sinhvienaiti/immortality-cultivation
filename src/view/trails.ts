/**
 * Sword trails and glows (canon §20.3): the swords' recent tip positions live
 * in a ring DataTexture (one row per sword, one column per sample, a sample
 * every 1/60 s whatever the frame rate; the newest column always holds the
 * current tip), and one instanced ribbon draw reads them back in the vertex
 * shader: a camera-facing strip that thins and fades to the tail. One
 * additive instanced quad draw is the glow round each blade. Two draw calls
 * for every sword of the pool; the texture is re-uploaded once a frame
 * (capacity × samples × 16 B: 128 KB for 500 swords × 16 samples). L1 of the
 * ladder halves the trail length and keeps the glow on half the swords
 * (setLength, setGlowShare). Nothing allocates per frame.
 * Owner: Lane 1.
 */
import * as THREE from "three";
import type { Renderer3D } from "./renderer";

/** Seconds between two trail samples. */
export const TRAIL_SAMPLE_S = 1 / 60;

export interface TrailOptions {
  /** Ribbon half width at the head, metres (default 0.11). */
  readonly widthM?: number;
  /** Glow quad side, metres (default 0.9). */
  readonly glowM?: number;
  /** Share of the swords with a glow, 0–1 (default 1). */
  readonly glowShare?: number;
  /** Ribbon colour (HDR multiplier on top, additive). */
  readonly colour?: string;
  readonly glowColour?: string;
}

export interface Trails {
  readonly capacity: number;
  readonly samples: number;
  /** This frame's head of each sword: x, y, z (m), alpha (0: none). Write, then sync(). */
  readonly heads: Float32Array;
  /** Swords to draw: the highest live index + 1 (set by the owner). */
  count: number;
  /** Seconds of this frame (set by the owner before sync(): no float crosses a call). */
  stepS: number;
  /** Records this frame's heads into the ring and marks the uploads. */
  sync(): void;
  /** Clears a sword's history (a slot reused by a new sword). */
  reset(index: number): void;
  /** Samples the ribbon shows (2 … samples): L1 draws half. */
  setLength(samples: number): void;
  /** Share of swords with a glow (L1: 0.5). */
  setGlowShare(share: number): void;
  /** stepS = dt, then sync(). */
  update(dt: number): void;
  drawCalls(): number;
  /** Texture bytes (the ring). */
  textureBytes(): number;
  dispose(): void;
}

/** A float uniform with its own hidden class (a `{ value }` literal would box each write, crowd.ts). */
class FloatUniform {
  value = 0;
  constructor(value = 0) {
    this.value = value;
  }
}

const RIBBON_VERTEX = /* glsl */ `
uniform highp sampler2D uRing;
uniform float uHead;
uniform float uSamples;
uniform float uVisible;
uniform float uWidth;
attribute float aSeg;
attribute float aSide;
attribute float iSword;
varying float vAlpha;
varying float vAlong;
vec4 ringAt(float k) {
  float col = mod(uHead - k + uSamples * 4.0, uSamples);
  return texelFetch(uRing, ivec2(int(col + 0.5), int(iSword + 0.5)), 0);
}
void main() {
  float k = min(aSeg, uVisible - 1.0);
  vec4 p = ringAt(k);
  vec4 q = ringAt(k > 0.5 ? k - 1.0 : k + 1.0);
  vec3 dir = k > 0.5 ? q.xyz - p.xyz : p.xyz - q.xyz;
  if (dot(dir, dir) < 1e-8) dir = vec3(0.0, 1.0, 0.0);
  vec3 toCam = cameraPosition - p.xyz;
  vec3 side = normalize(cross(dir, toCam) + vec3(0.0, 1e-6, 0.0));
  float along = k / max(1.0, uVisible - 1.0);
  vAlong = along;
  vAlpha = p.w * q.w * (aSeg < uVisible ? 1.0 : 0.0);
  vec3 world = p.xyz + side * aSide * uWidth * (1.0 - along * 0.85);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const RIBBON_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
varying float vAlpha;
varying float vAlong;
void main() {
  float a = vAlpha * (1.0 - vAlong) * (1.0 - vAlong);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColour * a, a);
}`;

const GLOW_VERTEX = /* glsl */ `
uniform float uGlowSize;
uniform float uGlowStep;
attribute vec4 iHead;
attribute float iSword;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vUv = uv;
  float shown = mod(iSword, uGlowStep) < 0.5 ? 1.0 : 0.0;
  vAlpha = iHead.w * shown;
  vec3 right = vec3(viewMatrix[0].x, viewMatrix[1].x, viewMatrix[2].x);
  vec3 up = vec3(viewMatrix[0].y, viewMatrix[1].y, viewMatrix[2].y);
  vec3 world = iHead.xyz + (right * position.x + up * position.y) * uGlowSize * shown;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uGlowColour;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.0, 1.0, d)) * vAlpha;
  a *= a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uGlowColour * a, a);
}`;

/** Ribbon strip of `samples` points: 2 vertices per sample (sides ±1), quads between neighbours. */
export function stripGeometry(samples: number): { index: number[]; seg: Float32Array; side: Float32Array } {
  const seg = new Float32Array(samples * 2);
  const side = new Float32Array(samples * 2);
  for (let k = 0; k < samples; k += 1) {
    seg[k * 2] = k;
    seg[k * 2 + 1] = k;
    side[k * 2] = -1;
    side[k * 2 + 1] = 1;
  }
  const index: number[] = [];
  for (let k = 0; k < samples - 1; k += 1) {
    const a = k * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return { index, seg, side };
}

/** `capacity` swords, `samples` tip positions each. */
export function createTrails(renderer: Renderer3D, capacity: number, samples: number, options: TrailOptions = {}): Trails {
  const n = Math.max(1, Math.floor(capacity));
  const s = Math.max(2, Math.floor(samples));
  const ring = new Float32Array(n * s * 4);
  const texture = new THREE.DataTexture(ring, s, n, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const heads = new Float32Array(n * 4);
  const head = new FloatUniform(0);
  const visible = new FloatUniform(s);
  const glowStep = new FloatUniform(1);
  // Doubles that change every frame live in an object field (a closure's `let` would box each write).
  const clock = new FloatUniform(0.5 * TRAIL_SAMPLE_S);
  let cursor = 0;

  const strip = new THREE.InstancedBufferGeometry();
  const shape = stripGeometry(s);
  strip.setIndex(shape.index);
  strip.setAttribute("position", new THREE.BufferAttribute(new Float32Array(s * 2 * 3), 3));
  strip.setAttribute("aSeg", new THREE.BufferAttribute(shape.seg, 1));
  strip.setAttribute("aSide", new THREE.BufferAttribute(shape.side, 1));
  const swordIds = new Float32Array(n);
  for (let k = 0; k < n; k += 1) swordIds[k] = k;
  strip.setAttribute("iSword", new THREE.InstancedBufferAttribute(swordIds, 1));
  strip.instanceCount = 0;
  const colour = new THREE.Color(options.colour ?? "#cffaf0").multiplyScalar(1.6);
  const ribbonMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uRing: { value: texture },
      uHead: head,
      uSamples: { value: s },
      uVisible: visible,
      uWidth: { value: options.widthM ?? 0.11 },
      uColour: { value: colour },
    },
    vertexShader: RIBBON_VERTEX,
    fragmentShader: RIBBON_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const ribbon = new THREE.Mesh(strip, ribbonMaterial);
  ribbon.frustumCulled = false;
  ribbon.renderOrder = 4;
  ribbon.name = "sword-trails";

  const base = new THREE.PlaneGeometry(1, 1);
  const glowGeometry = new THREE.InstancedBufferGeometry();
  glowGeometry.index = base.index;
  glowGeometry.setAttribute("position", base.getAttribute("position"));
  glowGeometry.setAttribute("uv", base.getAttribute("uv"));
  const headAttr = new THREE.InstancedBufferAttribute(heads, 4).setUsage(THREE.DynamicDrawUsage);
  glowGeometry.setAttribute("iHead", headAttr);
  glowGeometry.setAttribute("iSword", new THREE.InstancedBufferAttribute(swordIds, 1));
  glowGeometry.instanceCount = 0;
  const glowColour = new THREE.Color(options.glowColour ?? "#7ff5e0").multiplyScalar(1.8);
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: { uGlowSize: { value: options.glowM ?? 0.9 }, uGlowStep: glowStep, uGlowColour: { value: glowColour } },
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.frustumCulled = false;
  glow.renderOrder = 5;
  glow.name = "sword-glows";
  renderer.layers.fx.add(ribbon, glow);

  const setGlowShare = (share: number): void => {
    // Every k-th sword keeps its glow: share 1 → all, 0.5 → every second, 0 → none.
    glowStep.value = share <= 0 ? 1e9 : Math.max(1, Math.round(1 / Math.min(1, share)));
  };
  setGlowShare(options.glowShare ?? 1);

  const trails: Trails = {
    capacity: n,
    samples: s,
    heads,
    count: 0,
    stepS: 0.5 * TRAIL_SAMPLE_S,
    sync() {
      clock.value += trails.stepS;
      if (clock.value >= TRAIL_SAMPLE_S) {
        clock.value %= TRAIL_SAMPLE_S;
        cursor = (cursor + 1) % s;
      }
      // The newest column follows the tip every frame; a column freezes when the cursor moves on.
      for (let k = 0; k < trails.count; k += 1) {
        const at = (k * s + cursor) * 4;
        ring[at] = heads[k * 4]!;
        ring[at + 1] = heads[k * 4 + 1]!;
        ring[at + 2] = heads[k * 4 + 2]!;
        ring[at + 3] = heads[k * 4 + 3]!;
      }
      head.value = cursor;
      strip.instanceCount = trails.count;
      glowGeometry.instanceCount = trails.count;
      if (trails.count > 0) {
        texture.needsUpdate = true;
        headAttr.needsUpdate = true;
      }
    },
    reset(index) {
      if (index < 0 || index >= n) return;
      ring.fill(0, index * s * 4, (index + 1) * s * 4);
    },
    setLength(count) {
      visible.value = Math.max(2, Math.min(s, Math.round(count)));
    },
    setGlowShare,
    update(dt) {
      trails.stepS = dt;
      trails.sync();
    },
    drawCalls: () => (trails.count > 0 ? 2 : 0),
    textureBytes: () => n * s * 16,
    dispose() {
      ribbon.removeFromParent();
      glow.removeFromParent();
      strip.dispose();
      glowGeometry.dispose();
      base.dispose();
      ribbonMaterial.dispose();
      glowMaterial.dispose();
      texture.dispose();
    },
  };
  return trails;
}
