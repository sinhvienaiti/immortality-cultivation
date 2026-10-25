import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { FrameInfo } from "../../src/app/contracts";
import { TELEGRAPHS } from "../../src/content/data/telegraphs";
import { COLOURS } from "../../src/content/rules";
import type { EventOf, LocalState, TelegraphShape, World } from "../../src/content/types";
import { insideShape } from "../../src/local/zones";
import { createTelegraphView, fillAt, insideDrawn, isSummonCall, shapeFrame, TELEGRAPH_COLOUR, toLocal } from "../../src/view/telegraphs";
import type { Renderer3D } from "../../src/view/renderer";

/** canon §10.6, §21.1, D34: what the player sees on the ground is what `local` tests at the strike tick. */

function fakeRenderer(): Renderer3D {
  return { layers: { ground: new THREE.Group(), actors: new THREE.Group(), fx: new THREE.Group() } } as unknown as Renderer3D;
}

function telegraph(over: Partial<EventOf<"telegraph">> = {}): EventOf<"telegraph"> {
  return {
    tick: 100,
    type: "telegraph",
    stage: "start",
    id: 1,
    def: "nham-vien-throw-heart",
    shape: "circle",
    x: 0,
    z: -10,
    toX: 0,
    toZ: 0,
    reachM: 2,
    widthM: 4,
    strikeTick: 160,
    answers: ["move", "ward"],
    source: null,
    ...over,
  };
}

/** xorshift in [0, 1) for repeatable samples. */
function random(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4_294_967_296;
  };
}

describe("telegraph shapes match local/zones.ts (canon §10.6, D34)", () => {
  it("draws every shape exactly where the strike lands: 4 shapes × 40 random telegraphs × 400 points", () => {
    const rand = random(1234);
    const shapes: TelegraphShape[] = ["circle", "cell", "line", "cone"];
    for (const shape of shapes) {
      let inside = 0;
      for (let n = 0; n < 40; n += 1) {
        const event = telegraph({
          shape,
          x: Math.round((rand() * 30 - 15) * 1000) / 1000,
          z: Math.round((rand() * 20 - 16) * 1000) / 1000,
          toX: Math.round((rand() * 30 - 15) * 1000) / 1000,
          toZ: Math.round((rand() * 20 - 16) * 1000) / 1000,
          reachM: Math.round((1 + rand() * 8) * 1000) / 1000,
          widthM: Math.round((0.8 + rand() * 6) * 1000) / 1000,
        });
        const frame = shapeFrame(event);
        for (let p = 0; p < 400; p += 1) {
          const px = event.toX + (rand() * 2 - 1) * (event.reachM + 2);
          const pz = event.toZ + (rand() * 2 - 1) * (event.reachM + 2);
          const qx = shape === "circle" || shape === "cell" ? px : event.x + (px - event.toX);
          const qz = shape === "circle" || shape === "cell" ? pz : event.z + (pz - event.toZ);
          const local = toLocal(frame, qx, qz);
          const drawn = insideDrawn(shape, frame, local.a, local.b);
          const hit = insideShape(event, Math.round(qx * 1000), Math.round(qz * 1000));
          // Points within 2 cm of an edge may round either way (the sim works in whole mm).
          const nearEdge = [0.02, -0.02].some((d) => insideDrawn(shape, frame, local.a + d, local.b) !== drawn || insideDrawn(shape, frame, local.a, local.b + d) !== drawn);
          if (!nearEdge) expect(drawn, shape + " at " + qx.toFixed(3) + ", " + qz.toFixed(3)).toBe(hit);
          if (hit) inside += 1;
        }
      }
      // The samples did reach inside every kind of shape.
      expect(inside, shape).toBeGreaterThan(200);
    }
  });

  it("lays a line and a cone from the source towards the target, a circle and a cell on the target", () => {
    const line = shapeFrame(telegraph({ shape: "line", x: 0, z: -10, toX: 0, toZ: 0, reachM: 6, widthM: 2 }));
    expect([line.ox, line.oz, line.fx, line.fz, line.bMin, line.bMax, line.aMin, line.aMax]).toEqual([0, -10, 0, 1, 0, 6, -1, 1]);
    const circle = shapeFrame(telegraph({ shape: "circle", toX: 3, toZ: -4, reachM: 2.5 }));
    expect([circle.ox, circle.oz, circle.aMin, circle.aMax]).toEqual([3, -4, -2.5, 2.5]);
    const cell = shapeFrame(telegraph({ shape: "cell", toX: 1, toZ: 1, reachM: 3 }));
    expect([cell.aMin, cell.aMax, cell.bMin, cell.bMax]).toEqual([-1.5, 1.5, -1.5, 1.5]);
  });
});

describe("telegraph fill and kinds", () => {
  it("fills from the start tick to the strike tick on world ticks (hit stop slows it with the world)", () => {
    expect(fillAt(100, 160, 100, 0)).toBe(0);
    expect(fillAt(100, 160, 130, 0)).toBeCloseTo(0.5, 9);
    expect(fillAt(100, 160, 130, 0.6)).toBeCloseTo(30.6 / 60, 9);
    expect(fillAt(100, 160, 200, 0)).toBe(1);
    expect(fillAt(100, 100, 90, 0)).toBe(1);
  });

  it("draws a summon call (no damage) as an outline and a ring wave; every attack fills", () => {
    expect(isSummonCall("lang-dau-dan-howl")).toBe(true);
    expect(isSummonCall("vuong-goi-dan")).toBe(true);
    for (const id of Object.keys(TELEGRAPHS)) if (!["lang-dau-dan-howl", "vuong-goi-dan"].includes(id)) expect(isSummonCall(id), id).toBe(false);
  });

  it("is red #FF4A4A only (canon §21.1: danger from the enemy)", () => {
    expect(TELEGRAPH_COLOUR.toUpperCase()).toBe(COLOURS.danger.toUpperCase());
  });
});

describe("the telegraph view", () => {
  const world = (tick: number) => ({ tick, beasts: { list: [] } }) as unknown as World;
  const info = (dt: number, alpha = 0): FrameInfo => ({ dt, worldDt: dt, alpha, now: 0, local: {} as LocalState });

  it("shows a telegraph from start, flashes at the strike and fades away; cancel fades too", () => {
    const renderer = fakeRenderer();
    const view = createTelegraphView(renderer);
    expect(renderer.layers.fx.children.length).toBe(1);
    view.onEvents([telegraph({ id: 7 }), telegraph({ id: 8, shape: "cone", def: "vuong-vo-xe", reachM: 6, widthM: 6 })], world(100));
    expect(view.live).toBe(2);
    view.frame(world(130), info(1 / 60));
    expect(view.fillOf(7)).toBeCloseTo(0.5, 6);
    view.onEvents([telegraph({ id: 7, stage: "strike", tick: 160 }), telegraph({ id: 8, stage: "cancel", tick: 140 })], world(160));
    expect(view.fillOf(7)).toBe(1);
    for (let k = 0; k < 30; k += 1) view.frame(world(160 + k), info(1 / 60));
    expect(view.live).toBe(0);
    expect(view.fillOf(7)).toBe(-1);
    view.dispose();
    expect(renderer.layers.fx.children.length).toBe(0);
  });

  it("lets a telegraph whose strike never came go a second after its tick, and clears on a break", () => {
    const view = createTelegraphView(fakeRenderer());
    view.onEvents([telegraph({ id: 1 })], world(100));
    view.frame(world(160 + 61), info(1 / 60));
    for (let k = 0; k < 20; k += 1) view.frame(world(222 + k), info(1 / 60));
    expect(view.live).toBe(0);
    view.onEvents([telegraph({ id: 2 }), { tick: 120, type: "phase", phase: "break", wave: 1, endsAtTick: 1300 }], world(120));
    for (let k = 0; k < 20; k += 1) view.frame(world(120), info(1 / 60));
    expect(view.live).toBe(0);
  });

  it("keeps a pool: more telegraphs than the pool replace the oldest", () => {
    const view = createTelegraphView(fakeRenderer());
    for (let id = 1; id <= 30; id += 1) view.onEvents([telegraph({ id, tick: 100 + id })], world(100 + id));
    expect(view.live).toBe(24);
    expect(view.fillOf(1)).toBe(-1);
    expect(view.fillOf(30)).toBeGreaterThanOrEqual(0);
  });
});
