/**
 * The five chapter-1 families and Lang Đầu Đàn (canon §10.2, §10.4): W at K0
 * Cân bằng, speed, role, attacks, primitive placeholder (canon D27, §10.9: one
 * colour per family; biped tall, quadruped long and low, flyer floats, swarm
 * in clusters). Every M0a beast is vô hệ (canon §25). `act` holds the
 * behaviour numbers the canon leaves to the beast lane; values without a canon
 * section are this round's proposals (docs/changelog/2026-10-25-m0a-lane-5.md).
 * Owner: Lane 5.
 */
import type { BeastDef, BeastId, GeneralDef, GeneralId } from "../types";

/**
 * Behaviour of a species beyond the canon's `BeastDef` fields (Lane 5). `aim`:
 * "heart" walks to the heart edge and bites; "alternate" aims at the heart on
 * an even serial and at the Tâm nhãn on an odd one (no RNG draw). An attack
 * starts within `rangeMm` of its target point (the heart centre or the node
 * point); the next may start `everyMs` after the last one started.
 */
export interface BeastActDef {
  readonly aim: "heart" | "alternate";
  readonly heartAttack: string | null;
  readonly nodeAttack: string | null;
  readonly rangeMm: number;
  readonly everyMs: number;
  /** Flight height, mm (0: ground). */
  readonly flyMm: number;
}

// Lane 5 field on BeastDef (reported for Lane 2 to fold into types.ts); in the def so rulesHash covers it.
declare module "../types" {
  interface BeastDef {
    readonly act?: BeastActDef;
  }
}

/** Walks to the heart edge and bites; no telegraphed attack. */
export const BITE_ONLY: BeastActDef = { aim: "heart", heartAttack: null, nodeAttack: null, rangeMm: 0, everyMs: 0, flyMm: 0 };

export const BEASTS: Readonly<Record<BeastId, BeastDef>> = {
  "thach-thu": {
    id: "thach-thu",
    code: "T01",
    name: "Thạch Thử",
    family: "thu",
    tier: "swarm",
    w100: 33,
    speedMm: 1600,
    flying: false,
    armour: 0,
    resist: 0,
    element: null,
    groupSize: [6, 8],
    bitePerS: 1,
    attacks: [],
    standOffMm: 0,
    capturesNodes: false,
    posture: 0,
    placeholder: { gait: "swarm", colour: "#9a917c", heightMm: 350, lengthMm: 550, widthMm: 300 },
    act: BITE_ONLY,
  },
  "phong-lang": {
    id: "phong-lang",
    code: "T02",
    name: "Phong Lang",
    family: "lang",
    tier: "small",
    w100: 100,
    speedMm: 1400,
    flying: false,
    armour: 0,
    resist: 0,
    element: null,
    groupSize: [3, 5],
    bitePerS: 2,
    attacks: [],
    standOffMm: 0,
    capturesNodes: false,
    posture: 0,
    placeholder: { gait: "quadruped", colour: "#5f7a99", heightMm: 900, lengthMm: 1600, widthMm: 450 },
    act: BITE_ONLY,
  },
  "hoa-nha": {
    id: "hoa-nha",
    code: "T03",
    name: "Hỏa Nha",
    family: "dieu",
    tier: "small",
    w100: 80,
    speedMm: 2000,
    flying: true,
    armour: 0,
    resist: 0,
    element: null,
    groupSize: [1, 3],
    // Dives instead of biting (canon §10.8).
    bitePerS: 0,
    attacks: ["hoa-nha-dive-heart", "hoa-nha-dive-node"],
    standOffMm: 0,
    capturesNodes: false,
    posture: 0,
    placeholder: { gait: "flyer", colour: "#c9733f", heightMm: 500, lengthMm: 700, widthMm: 1200 },
    // Hovers 3 m from its dive point and dives every 4 s (proposals); flies 4 m up like the sky route's spawn height.
    act: { aim: "alternate", heartAttack: "hoa-nha-dive-heart", nodeAttack: "hoa-nha-dive-node", rangeMm: 3000, everyMs: 4000, flyMm: 4000 },
  },
  "nham-vien": {
    id: "nham-vien",
    code: "T04",
    name: "Nham Viên",
    family: "vien",
    tier: "medium",
    w100: 200,
    speedMm: 1000,
    flying: false,
    armour: 0,
    resist: 0,
    element: null,
    groupSize: [1, 1],
    bitePerS: 4,
    attacks: ["nham-vien-throw-heart", "nham-vien-throw-node"],
    // Stops 11 m from its target so ô 1 reaches it from the heart (PB-17).
    standOffMm: 11_000,
    capturesNodes: false,
    posture: 0,
    placeholder: { gait: "biped", colour: "#7d6a50", heightMm: 2000, lengthMm: 900, widthMm: 1000 },
    // Throws every 3 s from 11 m (canon §10.2).
    act: { aim: "alternate", heartAttack: "nham-vien-throw-heart", nodeAttack: "nham-vien-throw-node", rangeMm: 11_000, everyMs: 3000, flyMm: 0 },
  },
  "thiet-giap-tru": {
    id: "thiet-giap-tru",
    code: "T05",
    name: "Thiết Giáp Trư",
    family: "giap",
    tier: "medium",
    w100: 300,
    speedMm: 1000,
    flying: false,
    armour: 2,
    resist: 0,
    element: null,
    groupSize: [1, 1],
    bitePerS: 4,
    attacks: ["thiet-giap-tru-ram"],
    standOffMm: 0,
    capturesNodes: true,
    posture: 0,
    placeholder: { gait: "quadruped", colour: "#6c727c", heightMm: 1200, lengthMm: 2200, widthMm: 1000 },
    // Rams from 10 m of the heart centre, an 8 m line to the edge (analysis/05 "húc 8 m"); may ram again 6 s after a ram started (proposal).
    act: { aim: "heart", heartAttack: "thiet-giap-tru-ram", nodeAttack: null, rangeMm: 10_000, everyMs: 6000, flyMm: 0 },
  },
};

export const GENERALS: Readonly<Record<GeneralId, GeneralDef>> = {
  "lang-dau-dan": {
    id: "lang-dau-dan",
    code: "G01",
    name: "Lang Đầu Đàn",
    family: "lang",
    tier: "general",
    w100: 700,
    // Walks with its pack at Phong Lang's speed (proposal).
    speedMm: 1400,
    flying: false,
    armour: 0,
    resist: 0,
    element: null,
    groupSize: [1, 1],
    // Bites like a medium beast (proposal; canon §10.8 lists swarm, small, medium).
    bitePerS: 4,
    attacks: ["lang-dau-dan-howl"],
    standOffMm: 0,
    capturesNodes: false,
    posture: 60,
    placeholder: { gait: "quadruped", colour: "#4b6585", heightMm: 1300, lengthMm: 2400, widthMm: 650 },
    act: BITE_ONLY,
    aura: { radiusMm: 6000, speedPct: 15, family: "lang" },
    howl: { telegraph: "lang-dau-dan-howl", species: "phong-lang", count: 3, cooldownMs: 20_000, perWave: 2 },
  },
};
