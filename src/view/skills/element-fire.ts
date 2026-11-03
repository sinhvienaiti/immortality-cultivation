/**
 * Fire (canon D59, ELEMENT_LAYER §2): compress → burst. Registered so the lab, the sound bus and the captures can
 * pick it; its look is built next (Sword × Fire on key 1 and key 7, the five phases of ELEMENT_LAYER §6 step 2).
 * Until then it draws as Metal (`fallback`): its palette, key 7's tone, trail and blade are Metal's and it has no
 * hooks; only its ramp (D54: white-gold → amber → vermilion-orange → soot, never the enemy red #FF4A4A) and its
 * sound suffix are Fire's. To build it: fill the fields below, add `attach(stage)` returning its sword and stream
 * hooks (element-kit.ts), and drop `fallback`.
 */
import * as THREE from "three";
import type { ElementKit } from "./element-kit";
import { METAL } from "./element-metal";
import type { Rgb } from "./weapons";

/** Linear RGB of an sRGB hex (load time). */
function lin(hex: string): Rgb {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export const FIRE: ElementKit = {
  ...METAL,
  id: "fire",
  name: "Fire",
  verb: "compress → burst",
  fallback: "metal",
  ramp: { core: lin("#FFF1C9"), edge: lin("#FFB13C"), body: lin("#FF7A2A"), soot: lin("#2B1D18") },
  sound: "fire",
};
