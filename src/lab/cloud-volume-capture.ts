/** Run through cdp-run.mjs from the worktree. Claude owns the GPU run and review-folder writes. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

interface CapturePage {
  width: number; height: number;
  goto(url: string, options: { settle: number }): Promise<void>;
  eval(expression: string): Promise<unknown>;
  key(key: string, options?: { code?: string }): Promise<void>;
  shot(path: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  exceptions: unknown[];
  logs: unknown[];
}

export default async function (page: CapturePage) {
  if (page.width !== 1280 || page.height !== 720) throw new Error("Use --width=1280 --height=720.");
  const base = process.env.BASE ?? "http://127.0.0.1:3146/stress.html";
  const measureOnly = process.env.MEASURE_ONLY === "1";
  const out = resolve(process.env.OUT ?? "/Volumes/SS990TPRO/htdocs/typing-game-review/owner-review/2026-11-17/tu-tien/cloud-438");
  if (!out.startsWith("/Volumes/SS990TPRO/htdocs/typing-game-review/")) throw new Error("OUT must be inside typing-game-review.");
  if (!measureOnly) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "ABOUT.md"), "purpose: Phiếu 438 — mây thể tích, ba hệ và ba góc nhìn\nmade-by: Claude, qua cloud-volume-capture.ts\ndoc: docs/codex-queue/438-report.md\ndelete-when: Chủ dự án duyệt xong và đã lưu kết quả nghiệm thu\n");
  }
  const results: Record<string, unknown> = {};
  for (const kind of ["thunder", "poison", "dark"]) {
    const url = new URL(base);
    url.search = "fixed=1&ui=0&dpr=1&herd=march&cloud=" + kind;
    await page.goto(url.href, { settle: 1500 });
    let ready = false;
    for (let attempt = 0; attempt < 240; attempt++) {
      ready = await page.eval("!!(window.__lab?.ready && window.__stress?.ready && window.__cloud438)") === true;
      if (ready) break;
      await page.eval("window.__lab?.step(1); true"); await page.sleep(250);
    }
    if (!ready) throw new Error("Stress/cloud not ready: " + url.href);
    await page.key("q", { code: "KeyQ" });
    await page.eval("window.__lab.step(90); true");
    const views: Record<string, unknown> = {};
    for (const [label, key] of [["play", "0"], ["top", "1"], ["behind", "2"]]) {
      await page.key(key!, { code: "Digit" + key });
      await page.eval("window.__lab.step(30); true");
      const measurement = await page.eval("window.__cloud438.probe(120)");
      if (measurement && typeof measurement === "object" && "evalError" in measurement) throw new Error(JSON.stringify(measurement));
      views[label!] = measurement;
      if (!measureOnly) {
        await page.shot(join(out, kind + "-" + label + ".jpg"));
        writeFileSync(join(out, "probe.json"), JSON.stringify({ ...results, [kind]: views }, null, 2) + "\n");
      }
    }
    results[kind] = views;
  }
  if (!measureOnly) writeFileSync(join(out, "probe.json"), JSON.stringify({ results, exceptions: page.exceptions, logs: page.logs }, null, 2) + "\n");
  return { out: measureOnly ? null : out, results, exceptions: page.exceptions };
}
