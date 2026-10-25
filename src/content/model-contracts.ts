/**
 * Local model contract (canon §21.2, D44, PB-21): what every authored model of
 * this game must hold, per kind. The kit's MODEL_CONTRACTS fit a flying game
 * (heroes need Hero_Fly, bosses Boss_Idle_Hover and FX_HALO), not walking
 * cultivators and wolves, so characters and beasts use these; props use the
 * kit's. Moves to the kit when a second game needs it (SYNC_DEBT.md).
 *
 * - `cultivators` (players, bots; canon §21.3): Idle, Run, Cast_Short, Hit
 *   required; Cast_Heavy, Dash, Down, Victory used when present; 8 000–30 000
 *   triangles; a SkinnedMesh through src/view/walker-rig.ts.
 * - `beasts` (the five chapter-1 families): Idle, Move, Attack, Death; 800–3 000
 *   triangles by LOD (Low 1 000, Medium 1 800, High 3 000, canon §20.2): the
 *   source of the VAT and impostor bakes (scripts/models/blender).
 * - `beast-kings` (Thiết Bối Lang Vương; generals like Lang Đầu Đàn use it
 *   too): 12 000–45 000 triangles, 8–10 clips; a SkinnedMesh.
 *
 * Units metres, +Y up, the model faces +Z in glTF (nose forward), origin at
 * the feet. Sockets are empties named exactly; clips are actions named
 * exactly (a substring match lets "_V2" suffixes pass, as the kit's).
 * Socket lists and the beast-king clip names beyond canon §21.3 are this
 * round's proposal (đề xuất của vòng này, chờ chủ dự án xác nhận).
 * Pure data and checks (src/content: no three, no DOM).
 * Owner: Lane 1.
 */

export type IcModelKind = "cultivators" | "beasts" | "beast-kings";

export interface IcModelContract {
  readonly kind: IcModelKind;
  /** Clips that must exist. */
  readonly clips: readonly string[];
  /** Clips used when present. */
  readonly optionalClips: readonly string[];
  /** How many clips in all (beast-kings: 8–10). */
  readonly minClips: number;
  readonly maxClips: number;
  readonly minTris: number;
  readonly maxTris: number;
  /** Sockets that must exist (empty names). */
  readonly sockets: readonly string[];
  readonly optionalSockets: readonly string[];
  /** How the game draws it: a SkinnedMesh (walker-rig) or baked VAT and impostor (crowd). */
  readonly draw: "skinned" | "vat";
}

export const IC_MODEL_CONTRACTS: Readonly<Record<IcModelKind, IcModelContract>> = {
  cultivators: {
    kind: "cultivators",
    clips: ["Idle", "Run", "Cast_Short", "Hit"],
    optionalClips: ["Cast_Heavy", "Dash", "Down", "Victory"],
    minClips: 4,
    maxClips: 12,
    minTris: 8_000,
    maxTris: 30_000,
    // Swords rise behind the back (canon §12.1), the cast hand, the body's centre.
    sockets: ["FX_CORE", "FX_CAST_R", "FX_BACK"],
    optionalSockets: ["FX_CAST_L", "FX_HEAD", "FX_FOOT_L", "FX_FOOT_R"],
    draw: "skinned",
  },
  beasts: {
    kind: "beasts",
    clips: ["Idle", "Move", "Attack", "Death"],
    optionalClips: ["Hit"],
    minClips: 4,
    maxClips: 6,
    minTris: 800,
    maxTris: 3_000,
    sockets: [],
    optionalSockets: ["FX_CORE", "FX_HEAD"],
    draw: "vat",
  },
  "beast-kings": {
    kind: "beast-kings",
    clips: ["Idle", "Move", "Attack", "Death"],
    // Thiết Bối Xung (charge), the roar of Gọi Đàn, the posture break, the phase change (canon §10.5, §10.7).
    optionalClips: ["Hit", "Roar", "Charge", "Stagger", "Phase", "Summon"],
    minClips: 8,
    maxClips: 10,
    minTris: 12_000,
    maxTris: 45_000,
    sockets: ["FX_CORE", "FX_MOUTH"],
    optionalSockets: ["FX_HEAD", "FX_BACK", "FX_FOOT_L", "FX_FOOT_R"],
    draw: "skinned",
  },
};

/** The beasts' VAT LOD per tier (canon §20.2: triangles a crowd beast). */
export const BEAST_LOD_TRIS = { low: 1_000, medium: 1_800, high: 3_000, ultra: 3_000 } as const;

/** What a model holds (from a GLB manifest or a placeholder rig). */
export interface ModelFacts {
  readonly triangles: number;
  readonly clips: readonly string[];
  readonly sockets: readonly string[];
}

const has = (list: readonly string[], name: string): boolean => list.some((item) => item === name || item.includes(name));

/** Required clips the model lacks. */
export function missingClips(contract: IcModelContract, clips: readonly string[]): string[] {
  return contract.clips.filter((name) => !has(clips, name));
}

/** Required sockets the model lacks. */
export function missingSockets(contract: IcModelContract, sockets: readonly string[]): string[] {
  return contract.sockets.filter((name) => !sockets.includes(name));
}

/** Every way `facts` break the contract of `kind` (empty: it passes). */
export function checkModel(kind: IcModelKind, facts: ModelFacts): string[] {
  const contract = IC_MODEL_CONTRACTS[kind];
  const problems: string[] = [];
  if (facts.triangles < contract.minTris || facts.triangles > contract.maxTris) problems.push("triangles " + facts.triangles + " outside " + contract.minTris + "–" + contract.maxTris);
  for (const clip of missingClips(contract, facts.clips)) problems.push("missing clip " + clip);
  if (facts.clips.length < contract.minClips || facts.clips.length > contract.maxClips) problems.push("clips " + facts.clips.length + " outside " + contract.minClips + "–" + contract.maxClips);
  for (const socket of missingSockets(contract, facts.sockets)) problems.push("missing socket " + socket);
  return problems;
}
