// Source: games/space-typing/src/scene3d/textures.ts (kit copy: the fire photos' folder is a parameter; log fixes in shared/game-kit/DRIFT.md)
import * as THREE from "three";

/** Procedural canvas textures for glows, sparks, rings, nebula puffs and rune circles. */
function canvasTexture(size: number, draw: (context: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context !== null) draw(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function radial(context: CanvasRenderingContext2D, size: number, stops: readonly (readonly [number, number])[]): void {
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, alpha] of stops) gradient.addColorStop(at, "rgba(255,255,255," + alpha + ")");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
}

/** A rune circle: rings, ticks, a hexagram and procedural glyphs (no font needed). */
function drawMagicCircle(context: CanvasRenderingContext2D, size: number): void {
  const r = size / 2;
  context.translate(r, r);
  context.strokeStyle = "rgba(255,255,255,0.95)";
  context.shadowColor = "rgba(255,255,255,0.9)";
  context.shadowBlur = 6;
  const ring = (radius: number, width: number): void => {
    context.lineWidth = width;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
  };
  const polygon = (sides: number, radius: number, rotation: number): void => {
    context.beginPath();
    for (let index = 0; index <= sides; index += 1) {
      const angle = rotation + (index / sides) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  };
  ring(r * 0.96, 3);
  ring(r * 0.9, 1.4);
  ring(r * 0.62, 2.6);
  ring(r * 0.57, 1);
  ring(r * 0.2, 2);
  for (let index = 0; index < 72; index += 1) {
    const angle = (index / 72) * Math.PI * 2;
    const major = index % 6 === 0;
    context.lineWidth = major ? 2.4 : 1;
    context.beginPath();
    context.moveTo(Math.cos(angle) * r * (major ? 0.84 : 0.9), Math.sin(angle) * r * (major ? 0.84 : 0.9));
    context.lineTo(Math.cos(angle) * r * 0.96, Math.sin(angle) * r * 0.96);
    context.stroke();
  }
  context.lineWidth = 2;
  polygon(3, r * 0.57, -Math.PI / 2);
  polygon(3, r * 0.57, Math.PI / 2);
  context.lineWidth = 1.2;
  polygon(4, r * 0.4, Math.PI / 4);
  polygon(4, r * 0.4, 0);
  for (let index = 0; index < 6; index += 1) {
    const angle = -Math.PI / 2 + (index / 6) * Math.PI * 2;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(Math.cos(angle) * r * 0.57, Math.sin(angle) * r * 0.57, r * 0.05, 0, Math.PI * 2);
    context.stroke();
  }
  // Glyphs: three seeded strokes each, in the band between the rings.
  let seed = 11;
  const random = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const glyph = r * 0.05;
  context.lineWidth = 2;
  for (let index = 0; index < 24; index += 1) {
    context.save();
    context.rotate((index / 24) * Math.PI * 2);
    context.translate(0, -r * 0.74);
    context.beginPath();
    for (let stroke = 0; stroke < 3; stroke += 1) {
      context.moveTo((random() - 0.5) * glyph * 2, (random() - 0.5) * glyph * 2);
      context.lineTo((random() - 0.5) * glyph * 2, (random() - 0.5) * glyph * 2);
    }
    context.stroke();
    context.restore();
  }
}

export type FireImages = { blast: THREE.Texture; flame: THREE.Texture };
export type FireImageNames = { blast: string; flame: string };
const photos = new Map<string, FireImages>();

/**
 * Photographed fire (Space keeps its set in its combat VFX folder; a game
 * passes a folder of its own assets): an explosion (`blast`) and a
 * flame burst (`flame`), loaded once per folder; transparent until they
 * arrive. `base` ends with "/".
 */
export function fireImages(base: string, names: FireImageNames = { blast: "explosion-core.webp", flame: "fire-medium.webp" }): FireImages {
  const key = base + "|" + names.blast + "|" + names.flame;
  let set = photos.get(key);
  if (set === undefined) {
    const loader = new THREE.TextureLoader();
    const load = (name: string): THREE.Texture => {
      const texture = loader.load(base + name);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    set = { blast: load(names.blast), flame: load(names.flame) };
    photos.set(key, set);
  }
  return set;
}

export type TextureLibrary = { soft: THREE.Texture; spark: THREE.Texture; ring: THREE.Texture; cloud: THREE.Texture; runes: THREE.Texture };
let library: TextureLibrary | null = null;

/** Built once, on first use (needs a document). */
export function textures(): TextureLibrary {
  library ??= {
    soft: canvasTexture(64, (context, size) => radial(context, size, [[0, 1], [0.2, 0.8], [0.5, 0.22], [1, 0]])),
    spark: canvasTexture(64, (context, size) => {
      radial(context, size, [[0, 1], [0.1, 0.75], [0.3, 0.1], [1, 0]]);
      context.globalCompositeOperation = "lighter";
      for (const [w, h] of [[size, size * 0.05], [size * 0.05, size]] as const) {
        const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, "rgba(255,255,255,0.95)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = gradient;
        context.fillRect((size - w) / 2, (size - h) / 2, w, h);
      }
    }),
    ring: canvasTexture(128, (context, size) => radial(context, size, [[0, 0], [0.6, 0], [0.8, 1], [0.88, 0.4], [1, 0]])),
    cloud: canvasTexture(256, (context, size) => {
      let seed = 7;
      const random = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let index = 0; index < 34; index += 1) {
        const x = size * (0.2 + random() * 0.6);
        const y = size * (0.2 + random() * 0.6);
        const r = size * (0.08 + random() * 0.22);
        const gradient = context.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, "rgba(255,255,255," + (0.08 + random() * 0.12) + ")");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, size, size);
      }
      context.globalCompositeOperation = "destination-in";
      radial(context, size, [[0, 1], [0.6, 0.6], [1, 0]]);
    }),
    runes: canvasTexture(512, drawMagicCircle),
  };
  return library;
}
