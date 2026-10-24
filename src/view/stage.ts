/**
 * The grey-box scene on Lane 1's renderer (canon §8.1, §21.1): ground 40 × 26 m,
 * gates, Trận Trụ, Trận Tâm, Kết Giới ring, Tâm nhãn, mechanism marks (prep
 * and breaks only), sky route hint; ramp shading and a temporary ink outline.
 * Owner: Lane 6. TODO(lane-6).
 */
import type { Presenter } from "../app/contracts";
import type { Renderer3D } from "./renderer";

export function createStageView(_renderer: Renderer3D): Presenter {
  throw new Error("TODO(lane-6): view/stage.ts createStageView");
}
