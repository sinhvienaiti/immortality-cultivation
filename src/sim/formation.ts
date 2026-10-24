/**
 * Trận Tâm and friends (canon §8.2): Trận Lực 1 000 (solo); Kết Giới r 9 m
 * (beasts −15 % speed); Tâm nhãn (Công +8 %, Thủ −15 %, Dưỡng 0.1 %/s with a
 * resolved Cast within 3 s / k, cap 15 %, off while down or the bar is not
 * live); node capture 3 s + Tẩy; Trận Trụ (2 rams then cracked; blocks rocks
 * and rams); Linh Dịch; `down` costs 5 %.
 * Owner: Lane 4. TODO(lane-4).
 */
import type { BeastState, FormationState, NodeId, NodeState, PillarState, PointU, SimCommand, World, WorldInit } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-4): sim/formation.ts " + name);
};

export function createFormationState(_init: WorldInit): FormationState {
  return todo("createFormationState");
}

/** Trận Lực damage (after Thủ); 0 → defeat at cleanup. */
export function damageFormation(_world: World, _amount: number, _source: string): number {
  return todo("damageFormation");
}

/** (x, z) in u inside the Kết Giới. */
export function inBarrier(_x: number, _z: number): boolean {
  return todo("inBarrier");
}

export function nodeState(_world: World, _node: NodeId): NodeState {
  return todo("nodeState");
}

/** A capturer stands on the node (3 s turns it off until it dies). */
export function occupyNode(_world: World, _beast: BeastState, _node: NodeId): void {
  todo("occupyNode");
}

/** The first intact or cracked pillar on segment a–b (integer test), or null. */
export function pillarOnSegment(_world: World, _a: PointU, _b: PointU): PillarState | null {
  return todo("pillarOnSegment");
}

/** A boss ram hits a pillar (2 rams crack it). */
export function hitPillar(_world: World, _pillar: PillarState): void {
  todo("hitPillar");
}

/** `down` from local: Trận Lực −5 % (solo), the seat is down 8 s. */
export function applyDown(_world: World, _command: Extract<SimCommand, { type: "down" }>): void {
  todo("applyDown");
}

export function stepFormation(_world: World): void {
  todo("stepFormation");
}
