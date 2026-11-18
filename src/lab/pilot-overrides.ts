/** Lab-only source substitution. Base and pilot manifests are parsed separately so every media URL keeps its folder. */
import { parseFlipbookManifest, setFlipbookManifestTransform, type FlipbookMeta, type FlipbookPlayback } from "../view/skills/flipbook";

export const PILOT_ROOT = "/art-src/lab/vfx-pilot-2026-11-07/";
export const PILOT_IDS = {
  boss: "boss-entrance-vortex",
  blood: "blood-ring-burst",
  fire: "fire-comet",
  beast: "beast-hit-spark-burst",
} as const;

type Curve = readonly (readonly [number, number])[];
export interface PilotEnvelope {
  readonly durationS: number;
  readonly scale?: Curve;
  readonly alpha?: Curve;
  readonly erosion?: { readonly start: number; readonly end: number };
}

const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const unit = (v: unknown): v is number => finite(v) && v >= 0 && v <= 1;

function curve(value: unknown, name: string): Curve | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) throw new Error("Invalid envelope " + name);
  let previous = -1;
  return value.map((p: unknown): readonly [number, number] => {
    if (!Array.isArray(p) || p.length !== 2 || !unit(p[0]) || p[0] <= previous || !finite(p[1]) || p[1] < 0 || (name === "alpha" && p[1] > 1)) throw new Error("Invalid envelope " + name);
    previous = p[0];
    return [p[0], p[1]];
  });
}

export function readPilotEnvelope(value: unknown): PilotEnvelope | undefined {
  if (value === undefined) return undefined;
  if (!record(value) || !finite(value.durationS) || value.durationS <= 0) throw new Error("Invalid envelope durationS");
  const scale = curve(value.scale, "scale"), alpha = curve(value.alpha, "alpha");
  const erosion = value.erosion;
  if (erosion !== undefined && (!record(erosion) || !unit(erosion.start) || !unit(erosion.end) || erosion.start >= erosion.end)) throw new Error("Invalid envelope erosion");
  return {
    durationS: value.durationS,
    ...(scale !== undefined ? { scale } : {}),
    ...(alpha !== undefined ? { alpha } : {}),
    ...(record(erosion) ? { erosion: { start: erosion.start as number, end: erosion.end as number } } : {}),
  };
}

function curveAt(points: Curve | undefined, t: number): number {
  if (points === undefined) return 1;
  if (t <= points[0]![0]) return points[0]![1];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!, b = points[i]!;
    if (t <= b[0]) return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]);
  }
  return points[points.length - 1]![1];
}

export function pilotPlayback(envelope: PilotEnvelope): FlipbookPlayback {
  return {
    durationS: envelope.durationS,
    sample(t, out) {
      t = Math.max(0, Math.min(1, t));
      out.scale = curveAt(envelope.scale, t);
      out.alpha = curveAt(envelope.alpha, t);
      out.erosion = envelope.erosion === undefined ? 0 : Math.max(0, Math.min(1, (t - envelope.erosion.start) / (envelope.erosion.end - envelope.erosion.start)));
    },
  };
}

function envelopesOf(value: unknown): Map<string, PilotEnvelope> {
  const out = new Map<string, PilotEnvelope>();
  if (!record(value)) return out;
  const raw = value.flipbooks ?? value.clips;
  const pairs: [string, unknown][] = Array.isArray(raw)
    ? raw.map((entry) => [record(entry) && typeof entry.id === "string" ? entry.id : "", entry])
    : record(raw) ? Object.entries(raw) : [];
  for (const [id, entry] of pairs) {
    const envelope = readPilotEnvelope(record(entry) ? entry.envelope : undefined);
    if (envelope !== undefined) out.set(id, envelope);
  }
  return out;
}

/** One cached request and at most one warning per kit, shared by all lab players. */
export function createPilotOverrides(search: string | URLSearchParams, fetcher: typeof fetch = fetch, warn: (message: string) => void = console.warn) {
  const enabled = new URLSearchParams(search).get("pilot") === "1";
  const requests = new Map<string, Promise<Map<string, FlipbookMeta> | null>>();
  const warned = new Set<string>();
  const warnOnce = (base: string, detail: string): void => {
    if (warned.has(base)) return;
    warned.add(base);
    warn(`[pilot] ${base}: ${detail}; keeping other sources`);
  };
  return async (original: Map<string, FlipbookMeta>, base: string): Promise<Map<string, FlipbookMeta>> => {
    if (!enabled) return original;
    const match = base.match(/^(.*\/art-src\/lab\/)vfx\/(boss|blood|fire|beast|hybrid)\/$/);
    if (match === null) return original;
    const kit = (match[2] === "hybrid" ? "fire" : match[2]) as keyof typeof PILOT_IDS;
    const pilotBase = match[1] + "vfx-pilot-2026-11-07/" + kit + "/";
    let request = requests.get(pilotBase);
    if (request === undefined) {
      request = (async () => {
        try {
          const response = await fetcher(pilotBase + "manifest.json", { cache: "no-cache" });
          if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) throw new Error("missing manifest");
          const raw: unknown = await response.json();
          const metas = parseFlipbookManifest(raw, pilotBase);
          for (const [id, envelope] of envelopesOf(raw)) {
            const meta = metas.get(id);
            // Frame-driven lab cards also use this rate for their lifetime and normalized source time.
            if (meta !== undefined) metas.set(id, { ...meta, fps: (meta.frames - meta.start) / envelope.durationS, playback: pilotPlayback(envelope) });
          }
          return metas;
        } catch {
          warnOnce(pilotBase, "missing or invalid manifest/envelope");
          return null;
        }
      })();
      requests.set(pilotBase, request);
    }
    const overrides = await request;
    if (overrides === null) return original;
    const result = new Map(original);
    for (const [id, meta] of overrides) {
      if (id === PILOT_IDS[kit] && original.has(id)) result.set(id, meta);
      else warnOnce(pilotBase, "override id absent from base: " + id);
    }
    if (!overrides.has(PILOT_IDS[kit])) warnOnce(pilotBase, "no override for " + PILOT_IDS[kit]);
    return result;
  };
}

export interface PilotSourceStatus {
  readonly override: boolean;
  readonly atlasUrl: string | null;
  readonly textureUrl: string | null;
  readonly loaded: boolean;
  /** Successful sprite submissions; ONE_FRAME cards count once per submitted frame. */
  readonly plays: number;
}
type SourceState = PilotSourceStatus & { order: number };
const sources = new Map<string, SourceState[]>();
let order = 0;
export function isPilotSource(meta: FlipbookMeta): boolean { return meta.url.includes(PILOT_ROOT); }
export function pilotStatus(): Record<string, PilotSourceStatus> {
  return Object.fromEntries(Object.values(PILOT_IDS).map((id) => {
    const states = sources.get(id) ?? [];
    const latest = states.reduce<SourceState | undefined>((a, b) => a === undefined || b.order > a.order ? b : a, undefined);
    return [id, { override: latest?.override ?? false, atlasUrl: latest?.atlasUrl ?? null, textureUrl: latest?.textureUrl ?? null,
      loaded: latest?.loaded ?? false, plays: states.reduce((n, s) => n + s.plays, 0) }];
  }));
}

export function installPilotOverrides(search: string | URLSearchParams): Promise<void> {
  sources.clear(); order = 0;
  const transform = createPilotOverrides(search);
  return setFlipbookManifestTransform(async (original, base) => {
    const metas = await import("./burst-v2").then(m => m.overrideBursts(transform, original, base, search));
    if (!/\/art-src\/lab\/vfx\/(boss|blood|fire|beast|hybrid)\/$/.test(base)) return metas;
    const result = new Map(metas);
    for (const id of Object.values(PILOT_IDS)) {
      const meta = metas.get(id);
      if (meta === undefined) continue;
      const state = { override: isPilotSource(meta), atlasUrl: meta.url, textureUrl: null as string | null, loaded: false, plays: 0, order: 0 };
      const states = sources.get(id) ?? []; states.push(state); sources.set(id, states);
      result.set(id, { ...meta, trace: {
        loaded(ready, url) { state.loaded = ready; state.textureUrl = ready ? url : null; if (ready) state.order = ++order; },
        played() { if (state.loaded) { state.plays += 1; state.order = ++order; } },
      } });
    }
    return result;
  });
}
