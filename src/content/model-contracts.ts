/**
 * Local model contract (canon §21.2, D44, PB-21): `cultivators` (Idle, Run,
 * Cast_Short, Hit; 8 000–30 000 triangles), `beasts` (Idle, Move, Attack,
 * Death; 800–3 000 triangles by LOD, the VAT source), `beast-kings`
 * (12 000–45 000 triangles, 8–10 clips); `props` use the kit's. Replaces kit
 * MODEL_CONTRACTS for characters and beasts (SYNC_DEBT.md).
 * Owner: Lane 1. TODO(lane-1).
 */

export type IcModelKind = "cultivators" | "beasts" | "beast-kings";

export interface IcModelContract {
  readonly kind: IcModelKind;
  readonly clips: readonly string[];
  readonly minTris: number;
  readonly maxTris: number;
  readonly sockets: readonly string[];
}

/** TODO(lane-1): stub cast until filled. */
export const IC_MODEL_CONTRACTS = {} as Readonly<Record<IcModelKind, IcModelContract>>;
