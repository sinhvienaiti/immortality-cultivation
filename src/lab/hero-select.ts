/**
 * Which caster the skills lab shows, and each one's rig profile (dev-only, never built; skill
 * game-character-animation, rig-and-retarget §1: code reads canonical bone names, each rig ships its file, clip
 * names, front axis, sockets and the grip of the held weapon).
 *
 * ?hero=lam (default): Wordwoven's Lam, the borrowed hooded stand-in of motion rounds 1–3.
 * ?hero=human: motion round 4's human-proportioned proxy (MOTION_PLAN "Vòng 4"): the Mesh2Motion human
 * (art-src/lab/anim/human-base-animations.glb, 13,757 triangles, 66 joints with fingers, CC0, THIRD_PARTY.md) at
 * 1.65 m in a flat plain material, its own clips played as authored (same rig, no retarget), Clear Wind in hand_r.
 * Round 3's blind judges could not read Lam at 30–70 px from the 55° rear camera because the hood hides the arms;
 * the proxy tests whether authored camera-space key poses on human proportions read (ChatGPT's step 1).
 */
import type { ClipKey } from "./anim/animator";
import type { GripPose } from "./hand-sword";

export type HeroId = "lam" | "human";

/** A socket the model lacks, added under a canonical bone at load (bone frame, model units). */
export interface SocketDef {
  readonly name: string;
  readonly bone: string;
  readonly at: readonly [number, number, number];
}

export interface HeroProfile {
  readonly id: HeroId;
  /** The model and its own clips, under LAB_ASSETS. */
  readonly file: string;
  readonly heightM: number;
  /** The model's front in its own frame. The Animator's convention is −z (Lam); a +z model is wrapped in a half turn. */
  readonly front: "-z" | "+z";
  /** Clip key → clip name in `file`. */
  readonly clips: Partial<Record<ClipKey, string>>;
  /** Clip key → [file under LAB_ASSETS/anim, clip name] from Mesh2Motion. */
  readonly extra: Partial<Record<ClipKey, readonly [string, string]>>;
  /** Whether `extra` clips come from another rig (retargeted at load) or the same one (played as authored). */
  readonly retargetExtra: boolean;
  /** Clip key → clip key copied (a skill with its own clip and rhythm on another's keys). */
  readonly copies: Partial<Record<ClipKey, ClipKey>>;
  /** Strike clip times (s); a strike clip without one gets the right or left hand's speed peak, measured at load. */
  readonly release: Partial<Record<ClipKey, number>>;
  /** Sockets to add (Lam ships its own FX_HAND_R). */
  readonly sockets: readonly SocketDef[];
  /** The weapon's grip in hand_r (hand-sword.ts GripPose). */
  readonly grip: GripPose;
  /** A flat plain colour replacing the model's materials (the body-only test), or null to keep them. */
  readonly plain: number | null;
  /** The dash's after-image colour. */
  readonly colour: number;
  /** Authored key-pose skills on this rig (anim/key-pose.ts): slot → key-pose skill id. */
  readonly keyPoses: Readonly<Record<string, string>>;
}

/** Lam (lam.glb, 31 bones, 13 clips; its front is −z). Its grip was tuned on the round-3 frame sheets. */
const LAM: HeroProfile = {
  id: "lam",
  file: "models/lam.glb",
  heightM: 1.75,
  front: "-z",
  clips: {
    idle: "Hero_Idle",
    fidget: "Hero_Idle_Fidget",
    run: "Hero_Run",
    attack: "Hero_Attack",
    skill1: "Hero_Skill1",
    skill2: "Hero_Skill2",
    ult: "Hero_Ult",
    dash: "Hero_Dash",
    hit: "Hero_Hit",
  },
  // Clips Lam lacks, from Mesh2Motion's human set (CC0), retargeted at load.
  extra: {
    walk: ["human-base-animations.glb", "Walk"],
    strafeL: ["human-addon-animations.glb", "Strafe_left"],
    strafeR: ["human-addon-animations.glb", "Strafe_right"],
    back: ["human-addon-animations.glb", "Walk_Backwards"],
  },
  retargetExtra: true,
  copies: { thrust: "attack" },
  // Hand speed peak by FK on lam.glb (MOTION_PLAN appendix A, §5.6 `release`).
  release: { attack: 0.267, thrust: 0.267, skill1: 0.267, skill2: 0.708, ult: 1.083 },
  sockets: [],
  grip: { x: -0.01, y: 0.125, z: 0.0, tiltDeg: 28, rollDeg: 0, yawDeg: 0 },
  plain: null,
  colour: 0x3d7bff,
  keyPoses: {},
};

/**
 * The Mesh2Motion human (T-pose rest, faces +z, 1.75 m as authored). Clips from both Mesh2Motion files, played as
 * authored: Idle_A stands upright (Idle_Sword is a deep fighting crouch, pelvis 0.68 m of 0.83); Sword_Regular_A/B, Sword_Attack and Sword_Block are
 * the sword strikes and the guard; Spell_Simple_Shoot the cast under the two raised-arm gestures; Run_Anime the
 * glide (arms swept back). Release times are measured at load (hand speed peak).
 */
const HUMAN: HeroProfile = {
  id: "human",
  file: "anim/human-base-animations.glb",
  heightM: 1.65,
  front: "+z",
  clips: {
    idle: "Idle_A",
    walk: "Walk",
    jog: "Jog",
    run: "Sprint",
    attack: "Sword_Regular_A",
    thrust: "Sword_Regular_B",
    skill1: "Sword_Attack",
    skill2: "Sword_Block",
    ult: "Spell_Simple_Shoot",
    hit: "Hit_Chest",
  },
  extra: {
    strafeL: ["human-addon-animations.glb", "Strafe_left"],
    strafeR: ["human-addon-animations.glb", "Strafe_right"],
    back: ["human-addon-animations.glb", "Walk_Backwards"],
    dash: ["human-addon-animations.glb", "Run_Anime"],
  },
  retargetExtra: false,
  copies: {},
  release: {},
  // Palm sockets a little past the knuckles' root, on the palm side (hand frame: +y wrist → fingers, +z thumb side).
  sockets: [
    { name: "FX_HAND_R", bone: "hand_r", at: [0, 0.085, -0.012] },
    { name: "FX_HAND_L", bone: "hand_l", at: [0, 0.085, -0.012] },
  ],
  // Tuned on the round-4 close frames: the grip in the closed fist of Idle_Sword, the blade out of the thumb side.
  grip: { x: -0.005, y: 0.085, z: 0.012, tiltDeg: 12, rollDeg: 0, yawDeg: 0 },
  plain: 0xb4aea4,
  colour: 0x3fd2b0,
  keyPoses: { k4: "fanSweep" },
};

const PROFILES: Record<HeroId, HeroProfile> = { lam: LAM, human: HUMAN };

function pick(): HeroId {
  try {
    const v = new URLSearchParams(location.search).get("hero");
    return v === "human" ? "human" : "lam";
  } catch {
    return "lam";
  }
}

/** The hero this page shows (read once from the URL). */
export const HERO: HeroProfile = PROFILES[pick()];

export function heroProfile(id: HeroId): HeroProfile {
  return PROFILES[id];
}
