/** Dev-only adapter: the existing lab supplies target poses; production cast/skills own paths, hits and events. */
import type { BeastState, Cast, Quality, ReplayHeader, SimEvent, World } from "../content/types";
import { THANH_THACH_AI } from "../content/data/stage-m0a";
import { emitCast, stepCasts } from "../sim/cast";
import { stepSkills } from "../sim/skills";
import { cellAt } from "../sim/field";
import { mToU } from "../sim/fixed";
import { spawnBeast } from "../sim/spawn";
import { createWorld } from "../sim/world";
import type { SwarmSlot } from "../view/skills/qi-dragon-swarm";

export function skillsLabQuality(params: URLSearchParams): Quality {
  const tier = params.get("key2") === "swarm" ? params.get("tier") : null;
  const q = tier !== null && ["high", "medium", "low"].includes(tier) ? tier : params.get("q");
  return (["low", "medium", "high", "ultra"].includes(q ?? "") ? q : "high") as Quality;
}
export interface SwarmLabHerd {
  readonly size: number;
  autoRespawn: boolean;
  alive(i: number): boolean;
  x(i: number): number;
  z(i: number): number;
  tier(i: number): number;
  hitFromSim(i: number, dx: number, dz: number, power: number, rgb: number, hpFraction: number): void;
}
export interface SwarmLabPresenter {
  event(event: Extract<SimEvent, { type: "skill-fx" }>): boolean;
  frame(nextTick: number, alpha: number, worldDt: number): void;
  reset(): void;
  readonly timeline: { readonly slots: readonly (SwarmSlot | null)[] };
}
export interface SwarmLabReport {
  readonly castId: number;
  readonly tick: number;
  release: number;
  touch: number;
  burst: number;
  hits: number;
}
export class QiSwarmLab {
  world!: World;
  paused = false;
  readonly reports: SwarmLabReport[] = [];
  private acc = 0;
  private action = 0;
  private readonly mirrors = new Map<number, BeastState>();
  private readonly targets = new Map<number, number>();
  private readonly tickS = 1 / 60;
  constructor(private readonly herd: SwarmLabHerd, private readonly presenter: SwarmLabPresenter,
    private readonly origin: () => { x: number; z: number }, private readonly onEvent: (event: SimEvent, target: number) => void = () => {}) {
    this.herd.autoRespawn = false;
    this.reset();
  }
  reset(): void {
    const header: ReplayHeader = { v: 1, gameId: "immortality-cultivation", rulesHash: "00000000", seed: 1,
      stageId: THANH_THACH_AI.id, preset: "balanced", pacing: false,
      seats: [{ seat: 0, profile: { e: 45, a: 970, cv: 250 }, kPm: 1000 }], deck: [], newWordAllowance: 0,
      loadout: { guard: "ward", tamPhap: "kiem-tam" }, swordKey2: "swarm" };
    // The lab already shows up to 100 targets. Capacity is a harness setting, never a combat/balance override.
    this.world = createWorld({ ...THANH_THACH_AI, liveCap: Math.max(THANH_THACH_AI.liveCap, this.herd.size) }, 1, header);
    this.world.phaseEndsAt = -1;
    this.acc = 0; this.action = 0; this.paused = false; this.mirrors.clear(); this.targets.clear(); this.reports.length = 0; this.presenter.reset();
    for (let i = 0; i < this.herd.size; i += 1) {
      if (!this.herd.alive(i)) continue;
      const tier = this.herd.tier(i), species = tier >= 4 ? THANH_THACH_AI.boss ?? "thiet-giap-tru" : tier >= 2 ? "thiet-giap-tru" : tier === 0 ? "thach-thu" : "phong-lang";
      const b = spawnBeast(this.world, species, this.herd.x(i) < 0 ? "A" : "B", { wave: -1, x: mToU(this.herd.x(i)), z: mToU(this.herd.z(i)) });
      this.mirrors.set(i, b); this.targets.set(b.serial, i);
    }
    this.world.events.drain();
  }
  private syncTargets(): void {
    for (const [i, b] of this.mirrors) {
      if (!b.alive) continue;
      if (!this.herd.alive(i)) { b.alive = false; continue; }
      b.x = mToU(this.herd.x(i)); b.z = mToU(this.herd.z(i)); b.cell = cellAt(this.world.field, b.x, b.z);
    }
  }
  private drain(): void {
    for (const event of this.world.events.drain()) {
      if (event.type === "skill-fx") {
        this.presenter.event(event);
        if (event.stage === "swarm-cast") this.reports.push({ castId: event.castId!, tick: event.tick, release: 0, touch: 0, burst: 0, hits: 0 });
      }
      let target = -1;
      if (event.type === "hit" && event.castId !== undefined && event.phase !== undefined) {
        target = this.targets.get(event.beast.serial) ?? -1;
        const b = this.world.beasts.list[event.beast.slot];
        if (target >= 0 && b?.serial === event.beast.serial) {
          const from = this.origin(), dx = this.herd.x(target) - from.x, dz = this.herd.z(target) - from.z, length = Math.hypot(dx, dz) || 1;
          this.herd.hitFromSim(target, dx / length, dz / length, event.phase === "burst" ? 0.85 : 0.4, 0xffd899, event.hpLeft / b.hpMax);
        }
        const report = this.reports.find((r) => r.castId === event.castId);
        if (report) { report[event.phase] += event.amount; report.hits += 1; }
      }
      this.onEvent(event, target);
    }
  }
  private tick(): void {
    this.syncTargets();
    // Exactly the production held-cast and skill steps; the lab's herd retains ownership of movement/poses.
    stepCasts(this.world); stepSkills(this.world);
    this.world.events.endTick?.(); this.world.tick += 1; this.drain();
  }
  cast(): void {
    if (this.paused) return;
    this.syncTargets();
    const at = this.origin(), n = this.action++;
    const cast: Cast = { seat: 0, slot: 2, actionId: n, wordId: "swarm-lab-" + n, tick: this.world.tick, channel: "typing", quality: "good",
      origin: { x: mToU(at.x), z: mToU(at.z) }, aim: null, state: "held", heldUntil: -1, target: null, node: null };
    emitCast(this.world, cast); this.drain(); this.tick(); this.acc = 0;
  }
  advance(worldDt: number): void {
    if (this.paused) return;
    this.acc += Math.max(0, Math.min(worldDt, 0.1));
    while (this.acc + 1e-10 >= this.tickS) { this.acc = Math.max(0, this.acc - this.tickS); this.tick(); }
  }
  draw(worldDt: number): void { this.presenter.frame(this.world.tick, this.acc / this.tickS, this.paused ? 0 : worldDt); }
}
