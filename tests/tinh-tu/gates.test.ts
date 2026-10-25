// Tĩnh Tu bots and gates HC4, HC4b, HC5, HC6, HC6b, HC7 on a small matrix (the full one: pnpm tt:bots). Lane 8.
import { describe, expect, it } from "vitest";
import { HC4_BOTS, NO_TYPE_BOT, TYPE_ALL_BOT, runLesson } from "../../scripts/tinh-tu/bot";
import { reportMarkdown, runTinhTuGates } from "../../scripts/tinh-tu/gates";

describe("Tĩnh Tu gates (canon §18.4, M0A_PLAN §8)", () => {
  it("pass on 3 seeds", () => {
    const report = runTinhTuGates(3, 3);
    for (const gate of report.gates) expect(gate.pass, gate.id + ": " + gate.value).toBe(true);
    expect(report.minhSchedule.short).toBe(0);
    expect(report.hc7.queued).toBe(0);
    expect(report.hc7.refused).toBe(report.hc7.total);
    expect(reportMarkdown(report)).toContain("| HC6b | ĐẠT |");
  });

  it("HC4b: the no-typing bot never reaches lĩnh ngộ; the type-everything bot pays for its wrong choices", () => {
    const idle = runLesson(NO_TYPE_BOT, "tham-ngo", 4, 10, false, "test");
    expect(idle.sessions.length).toBe(10);
    expect(idle.progress.points).toBe(0);
    const all = runLesson(TYPE_ALL_BOT, "tham-ngo", 4, 2, false, "test");
    expect(all.sessions.some((session) => session.summary.wrong > 0)).toBe(true);
  });

  it("bots are deterministic", () => {
    const a = runLesson(HC4_BOTS[0]!, "nhap-mon", 5, 2, true, "test");
    const b = runLesson(HC4_BOTS[0]!, "nhap-mon", 5, 2, true, "test");
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
