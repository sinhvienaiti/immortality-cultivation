import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/sim/skills", () => ({ resolveCast: vi.fn(() => true) }));
vi.mock("../../src/sim/chan-nguyen", () => ({ addChanNguyen: vi.fn() }));
vi.mock("../../src/sim/posture", () => ({ postureHit: vi.fn() }));

import type { FrameInfo } from "../../src/app/contracts";
import { resolveCast } from "../../src/sim/skills";
import { dealSeal, slotEntry, stepWords, typeBackspace, typeKey } from "../../src/sim/words";
import { createBanQuyet } from "../../src/ui/ban-quyet";
import { addBeast, key, makeWorld } from "../typing/world-fixture";
import { TestDocument, type TestNode } from "./word-fx-dom";

beforeEach(() => vi.mocked(resolveCast).mockReset().mockReturnValue(true));
const hasClass = (name: string) => (node: TestNode): boolean => node.className.split(" ").includes(name);

function setup() {
  const { world } = makeWorld({ phase: "wave" });
  const doc = new TestDocument();
  const host = doc.createElement("main");
  const presenter = createBanQuyet(host as unknown as HTMLElement, 0);
  const frame = (now: number): void => {
    presenter.onEvents(world.events.drain(), world);
    presenter.frame(world, { now } as FrameInfo);
  };
  stepWords(world);
  frame(0);
  frame(300);
  const cell = (key: string): TestNode => host.find(node => node.dataset.wordKey === key)!;
  return { world, doc, host, presenter, frame, cell };
}

describe("Bàn Quyết letter presenter", () => {
  it("shows the allocated full-energy Ultimate word, then keeps its ready prompt until Space", () => {
    const { world, frame, cell } = setup();
    world.seats[0]!.chanNguyenPm = 100_000;
    stepWords(world);
    const entry = slotEntry(world, 0, 5)!;
    expect(entry.state).toBe("ready");
    expect(entry.text.length).toBeGreaterThan(0);
    frame(400);
    frame(700);
    const root = cell("slot-5");
    const word = root.find(hasClass("ic-bq__word"))!;
    const note = root.find(hasClass("ic-bq__note"))!;
    expect(word.textContent).toBe(entry.text);
    expect(note.textContent).not.toBe("Waiting for slot");
    for (const char of entry.text) typeKey(world, key(world, char));
    frame(800);
    expect(root.className).toContain("is-ultimate-ready");
    expect(note.textContent).toBe("Ultimate ready · Space");
    expect(world.casts.prepared[0]).not.toBeNull();
    expect(world.casts.resolved).toBe(0);
    frame(1800);
    expect(note.textContent).toBe("Ultimate ready · Space");
    expect(word.textContent).toBe(entry.text);
  });

  it("reuses glyphs and the mote pool on keys/errors/Backspace; keeps the other words still", () => {
    const { world, doc, host, frame, cell } = setup();
    const entry = slotEntry(world, 0, 1)!;
    const root = cell("slot-1");
    const word = root.find(hasClass("ic-bq__word"))!;
    const letters = [...word.children];
    const motes = root.all(hasClass("ic-bq__mote"));
    const created = doc.created;
    const tracks = host.find(hasClass("ic-bq"))!.style.gridTemplateColumns;
    typeKey(world, key(world, entry.text[0]!));
    frame(400);
    expect(word.children).toEqual(letters);
    expect(word.children[0]!.className).toContain("is-done");
    expect(word.children[0]!.style.getPropertyValue("opacity")).toBe("1");
    expect(word.children[1]!.className).toContain("is-next");
    const other = cell("slot-2").find(hasClass("ic-bq__word"))!;
    expect(other.children.every(glyph => glyph.style.getPropertyValue("transform") === "scale(1)")).toBe(true);
    const wrong = entry.text[1] === "z" ? "x" : "z";
    typeKey(world, key(world, wrong));
    frame(410);
    expect(root.style.getPropertyValue("--word-error")).toBe("1");
    frame(420);
    expect(root.style.getPropertyValue("transform")).not.toBe("none");
    frame(560);
    expect(root.style.getPropertyValue("--word-error")).toBe("0");
    typeBackspace(world, 0);
    frame(570);
    expect(word.children).toEqual(letters);
    expect(root.all(hasClass("ic-bq__mote"))).toEqual(motes);
    expect(doc.created).toBe(created);
    expect(host.find(hasClass("ic-bq"))!.style.gridTemplateColumns).toBe(tracks);
    expect(motes).toHaveLength(8);
  });

  it("flashes the completed word this frame and reveals its zero-cooldown replacement only after the exit", () => {
    const { world, doc, frame, cell } = setup();
    const entry = slotEntry(world, 0, 1)!;
    const text = entry.text;
    const root = cell("slot-1");
    const word = root.find(hasClass("ic-bq__word"))!;
    for (const char of text) typeKey(world, key(world, char));
    expect(world.casts.resolved).toBe(1);
    stepWords(world);
    const next = slotEntry(world, 0, 1)!.text;
    frame(400);
    expect(root.dataset.wordPhase).toBe("flash");
    expect(word.textContent).toBe(text);
    expect(word.style.getPropertyValue("--word-flash")).toBe("1");
    frame(700);
    expect(root.dataset.wordPhase).toBe("depart");
    expect(word.textContent).toBe(text);
    doc.documentElement.dataset.motion = "reduce";
    frame(710);
    expect(word.children.every(glyph => glyph.style.getPropertyValue("transform") === "translate(0px, 0px) rotate(0deg)")).toBe(true);
    expect(root.all(hasClass("ic-bq__mote")).every(mote => mote.style.getPropertyValue("opacity") === "0")).toBe(true);
    frame(1040);
    expect(root.dataset.wordPhase).toBe("enter");
    expect(word.textContent).toBe(next);
    expect(word.children.every(glyph => glyph.style.getPropertyValue("opacity") === "0")).toBe(true);
  });

  it("dims cooling previews without an underline and fades defence downward", () => {
    const { world, frame, cell } = setup();
    const text = slotEntry(world, 0, 3)!.text;
    for (const char of text) typeKey(world, key(world, char));
    stepWords(world);
    frame(400);
    const root = cell("slot-3");
    const word = root.find(hasClass("ic-bq__word"))!;
    frame(700);
    expect(Number(word.children[0]!.style.getPropertyValue("transform").match(/translate\([^,]+, ([^p]+)px/)?.[1])).toBeGreaterThan(10);
    frame(1040);
    expect(root.className).toContain("is-preview");
    expect(root.find(hasClass("ic-bq__ring"))!.hidden).toBe(false);
    expect(word.children.some(hasClass("is-next"))).toBe(false);
  });

  it("keeps a removed Seal alive through its exit without remapping the remaining Seal", () => {
    const { world, host, frame, cell, presenter } = setup();
    dealSeal(world, 0, addBeast(world));
    dealSeal(world, 0, addBeast(world));
    frame(400);
    const indices = [...world.words.seats[0]!.seals];
    const text = world.words.live[indices[0]!]!.text;
    const first = cell("seal-" + indices[0]);
    const second = cell("seal-" + indices[1]);
    const secondLetters = [...second.find(hasClass("ic-bq__word"))!.children];
    for (const char of text) typeKey(world, key(world, char));
    frame(700);
    expect(first.dataset.wordPhase).toBe("flash");
    expect(cell("seal-" + indices[1])).toBe(second);
    expect(second.find(hasClass("ic-bq__word"))!.children).toEqual(secondLetters);
    frame(1340);
    expect(host.find(node => node === first)).toBeUndefined();
    presenter.dispose();
    expect(host.children).toHaveLength(0);
  });

  it("reads a browser reduced-motion change even when the game setting is full", () => {
    const { world, doc, frame, cell } = setup();
    doc.documentElement.dataset.motion = "full";
    doc.systemReduced = true;
    const entry = slotEntry(world, 0, 1)!;
    typeKey(world, key(world, entry.text[0]!));
    frame(400);
    frame(440);
    expect(cell("slot-1").find(hasClass("ic-bq__word"))!.children[0]!.style.getPropertyValue("transform")).toBe("scale(1)");
  });
});
