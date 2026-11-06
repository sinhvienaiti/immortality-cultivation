import * as THREE from "three";

export const SIGIL_MASK_IDS = ["line", "arrow", "arcs", "hex", "spiral", "crack", "rift"] as const;
export type SigilMaskId = (typeof SIGIL_MASK_IDS)[number];
export const PAINTED_SIGIL_BASE = "/art-src/lab/vfx/sigils/";
export const SIGIL_PLANES: Readonly<Record<SigilMaskId, number>> = {
  line: 14, arrow: 5, arcs: 4.8, hex: 7.2, spiral: 13.5, crack: 7.5, rift: 22,
};
export const METAL_SIGIL_TINT = {
  body: [0.58, 0.6, 0.62], core: [1, 1, 1], inner: [1, 0.83, 0.48], innerMix: 0.3,
} as const;

export type SigilMode = "painted" | "code";
export interface SigilMaskEntry {
  readonly id: SigilMaskId;
  readonly file: string;
  readonly md5: string;
  readonly metres: number;
  readonly aspect: number;
  readonly px: readonly [number, number];
}
export interface SigilManifest {
  readonly version: 1;
  readonly masks: ReadonlyMap<SigilMaskId, SigilMaskEntry>;
}

export function sigilModeOf(search: string): SigilMode {
  return new URLSearchParams(search).get("sigil") === "code" ? "code" : "painted";
}

export function paintedPlane(sizeX: number, aspect: number): [number, number] {
  return [sizeX, sizeX / aspect];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Bad entries are isolated so the other painted masks remain usable. */
export function parseSigilManifest(json: unknown): SigilManifest | null {
  if (!isObject(json) || json.version !== 1 || !isObject(json.channels)) return null;
  const ch = json.channels;
  if (Object.keys(ch).length !== 3 || ch.lines !== "r" || ch.glow !== "g" || ch.hot !== "b") return null;
  if (!Array.isArray(json.masks)) return null;
  const masks = new Map<SigilMaskId, SigilMaskEntry>();
  for (const entry of json.masks) {
    if (!isObject(entry) || !SIGIL_MASK_IDS.includes(entry.id as SigilMaskId)) continue;
    if (typeof entry.file !== "string" || !/^[a-z0-9][a-z0-9._-]*\.png$/i.test(entry.file)) continue;
    if (typeof entry.md5 !== "string" || !/^[a-f0-9]{32}$/i.test(entry.md5)) continue;
    if (!positive(entry.metres) || !positive(entry.aspect)) continue;
    const px = entry.px;
    if (!Array.isArray(px) || px.length !== 2 || !px.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 1)) continue;
    const id = entry.id as SigilMaskId;
    if (!masks.has(id)) masks.set(id, { id, file: entry.file, md5: entry.md5, metres: entry.metres, aspect: entry.aspect, px: [px[0], px[1]] });
  }
  return masks.size > 0 ? { version: 1, masks } : null;
}

export function sigilPaths(mode: SigilMode, manifest: SigilManifest | null, loaded: ReadonlySet<SigilMaskId>): Record<SigilMaskId, SigilMode> {
  const paths = {} as Record<SigilMaskId, SigilMode>;
  for (const id of SIGIL_MASK_IDS) paths[id] = mode === "painted" && manifest?.masks.has(id) && loaded.has(id) ? "painted" : "code";
  return paths;
}

export type PaintedSigils = { masks: ReadonlyMap<SigilMaskId, { texture: THREE.Texture; aspect: number }> };

export async function loadPaintedSigils(base = PAINTED_SIGIL_BASE): Promise<PaintedSigils | null> {
  let manifest: SigilManifest | null;
  try {
    const res = await fetch(base + "manifest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = parseSigilManifest(await res.json());
    if (manifest === null) throw new Error("invalid manifest");
  } catch (error) {
    console.warn("[sigils] manifest unavailable, analytic sigils", error);
    return null;
  }
  const masks = new Map<SigilMaskId, { texture: THREE.Texture; aspect: number }>();
  const loader = new THREE.TextureLoader();
  await Promise.all([...manifest.masks.values()].map(async (entry) => {
    try {
      const texture = await loader.loadAsync(base + entry.file + "?v=" + entry.md5);
      texture.colorSpace = THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = 8;
      masks.set(entry.id, { texture, aspect: entry.aspect });
    } catch (error) {
      console.warn(`[sigils] ${entry.id} unavailable`, error);
    }
  }));
  const paths = sigilPaths("painted", manifest, new Set(masks.keys()));
  const fallback = SIGIL_MASK_IDS.filter((id) => paths[id] === "code");
  const painted = SIGIL_MASK_IDS.filter((id) => paths[id] === "painted");
  if (fallback.length > 0) console.warn(`[sigils] analytic fallback: ${fallback.join(", ")}`);
  if (painted.length > 0) console.info(`[sigils] painted: ${painted.join(", ")}`);
  return { masks };
}
