/** Ticket 397: Claude runs this only when browser + review-folder access are available.
 * BASE=http://127.0.0.1:3146/skills-lab.html node --import tsx src/kit/tools/cdp-run.mjs src/lab/anim-r1-review.ts --width=1920 --height=1080 --dpr=1
 * Existing host only: never starts a build or server. Captures do not establish shared-system acceptance.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

interface ReviewPage {
  width: number; height: number; logs?: unknown; exceptions?: unknown;
  goto(url: string, options: { settle: number }): Promise<unknown>;
  eval(expression: string): Promise<unknown>;
  shot(path: string): Promise<unknown>;
  sleep(ms: number): Promise<unknown>;
}

export default async function review(page: ReviewPage): Promise<unknown> {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const out = "/Volumes/SS990TPRO/htdocs/typing-game-review/owner-review/2026-11-16/tu-tien/hero-anim-r1";
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "ABOUT.md"), "purpose: Lát thử hoạt ảnh Kiếm A, góc chơi và cận tay, phiếu 397\nmade-by: Codex 397; Claude chạy lệnh chụp\ndoc: /Volumes/SS990TPRO/htdocs/typing-game/docs/codex-queue/397-report.md\ndelete-when: Sau khi owner xem và không còn cần đối chiếu\n");
  const base = new URL(process.env.BASE || "http://127.0.0.1:3146/skills-lab.html");
  const evalPage = async (expression: string): Promise<unknown> => {
    const result = await page.eval(expression);
    if (typeof result === "object" && result && "evalError" in result) throw new Error(String(result.evalError));
    return result;
  };
  for (const [k, v] of Object.entries({ hero: "human", fixed: "1", ui: "0", herd: "still", dpr: "1" })) base.searchParams.set(k, v);
  await page.goto(base.href, { settle: 1500 });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (await evalPage("!!(window.__lab?.ready && window.__labAnimR1)")) { ready = true; break; }
    await page.sleep(250);
  }
  if (!ready) throw new Error("Host chưa phục vụ human và mã 397");
  const files: string[] = [];
  const reports: unknown[] = [];
  for (const close of [false, true]) {
    await evalPage("window.__lab.reset(); window.__lab.view('play'); window.__lab.step(60); window.__labAnimR1.begin(); true");
    if (close) await evalPage("window.__lab.setOrbit(30, 25, false); window.__lab.view('orbit', 1.7); true");
    const view = close ? "hands" : "play";
    for (const [name, input, step] of [["s0", "s", 18], ["bridge", "w", 14], ["s1", "o", 14], ["coil", "r", 18],
      ["release-f1", "d", 1], ["release-f3", "", 2], ["follow", "", 8], ["recover", "", 24]] as const) {
      if (input) await evalPage(`window.__labAnimR1.text(${JSON.stringify(input)}); true`);
      await evalPage(`window.__lab.step(${step}); true`);
      if (close) await evalPage("window.__lab.setOrbit(30, 25, false); window.__lab.view('orbit', 1.7); true");
      const file = join(out, `397-${view}-${name}.png`); await page.shot(file); files.push(file);
    }
    reports.push(await evalPage("window.__labAnimR1.report()"));
    if (close) await evalPage("window.__lab.view('play'); true");
  }
  const magick = process.env.ART_MAGICK || "/opt/homebrew/bin/magick";
  for (const view of ["play", "hands"]) {
    execFileSync(magick, ["montage", ...files.filter(f => f.includes(`-${view}-`)), "-font", "/System/Library/Fonts/Supplemental/Arial.ttf",
      "-tile", "4x2", "-geometry", "640x360+4+4", "-background", "#141c24", join(out, `397-${view}-phases.jpg`)]);
  }
  writeFileSync(join(out, "397-browser.json"), JSON.stringify({ url: base.href, reports, logs: page.logs, exceptions: page.exceptions,
    note: "Fixed stepping plus screenshot overhead is not real OS-key-to-display timing. Review fingers, weight, transitions and foot contacts before scoring." }, null, 2) + "\n");
  execFileSync(process.execPath, [join(root, "scripts/review-index.mjs")], { cwd: root, stdio: "inherit" });
  return { out, frames: files.length };
}
