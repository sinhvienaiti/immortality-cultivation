import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bindingsFor } from "../../src/app/input-router";

describe("removed pre-match learning UI", () => {
  it("ships no learn-ahead panel, app hook, opening flag or key", () => {
    expect(existsSync(new URL("../../src/ui/learn-ahead.ts", import.meta.url))).toBe(false);
    const app = readFileSync(new URL("../../src/app/app.ts", import.meta.url), "utf8");
    expect(app).not.toMatch(/createLearnAhead|learnAhead\.open|readonly prelearn/);
    expect(bindingsFor().has("Digit4")).toBe(false);
  });
});
