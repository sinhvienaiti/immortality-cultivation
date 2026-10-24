/**
 * The one renderer (canon §20, §21.1, PB-35): kit Stage3D with rules.ts
 * TT_TIERS (4 keys), budgets from TT_BUDGETS; NeutralToneMapping set on
 * `stage.renderer` after construction (the kit fixes ACES); fixed 3/4 camera
 * (tilt 50–55°, FOV 25–30°, frames 40 × 26 m at 16:9); a Projector; reads
 * `renderer.info` (draw calls including post passes, triangles); disposes all.
 * Owner: Lane 1 (milestone 1a). TODO(lane-1).
 */
import type * as THREE from "three";
import type { Projector, Quality } from "../app/contracts";

export interface RenderInfo {
  readonly drawCalls: number;
  readonly triangles: number;
  /** WEBGL_debug_renderer_info string (SwiftShader / llvmpipe runs are invalid). */
  readonly gpu: string;
}

export interface Renderer3D {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly quality: Quality;
  readonly project: Projector;
  info(): RenderInfo;
  /** Camera before DOM projection (M0A_PLAN §6.9 frame order), then draw. */
  render(dt: number): void;
  resize(): void;
  dispose(): void;
}

export function createRenderer(_host: HTMLElement, _quality: Quality): Renderer3D {
  throw new Error("TODO(lane-1): view/renderer.ts createRenderer");
}
