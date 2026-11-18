/** Ticket 403: existing host only, no server/build. Claude runs with browser + review write access.
 * BASE=http://127.0.0.1:3146/skills-lab.html ART_MAGICK=/opt/homebrew/bin/magick
 * node --import tsx src/kit/tools/cdp-run.mjs src/lab/anim-r2-review.ts --width=1920 --height=1080 --dpr=1
 */
import { mkdirSync, mkdtempSync, linkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, basename } from "node:path";
import { FAMILIES, FAMILY_WORD, SEAL_NAMES } from "./anim-r2-poses";
interface ReviewPage {
  logs?: unknown; exceptions?: unknown;
  goto(url: string, options: { settle: number }): Promise<unknown>;
  eval(expression: string): Promise<unknown>;
  shot(path: string): Promise<unknown>;
  sleep(ms: number): Promise<unknown>;
}
export default async function review(page: ReviewPage): Promise<unknown> {
  const repo = fileURLToPath(new URL("../../../../", import.meta.url));
  const topic = "/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/hero-anim-r2-403";
  mkdirSync(topic, { recursive: true });
  const out = mkdtempSync(join(topic, "run-"));
  writeFileSync(join(out, "ABOUT.md"), "purpose: Phiếu 403: lưới 10 thủ ấn chính diện và 8 pha của ba họ chiêu, hai camera\nmade-by: Codex 403; Claude chạy lệnh chụp\ndoc: /Volumes/SS990TPRO/htdocs/typing-game/docs/codex-queue/403-report.md\ndelete-when: Sau khi owner xem và không còn cần đối chiếu\n");
  const evaluate = async (expression: string): Promise<unknown> => {
    const r = await page.eval(expression);
    if (r && typeof r === "object" && "evalError" in r) throw new Error(String(r.evalError));
    return r;
  };
  const url = new URL(process.env.BASE || "http://127.0.0.1:3146/skills-lab.html");
  for (const [k, v] of Object.entries({ hero: "human", fixed: "1", ui: "0", herd: "still", dpr: "1" })) url.searchParams.set(k, v);
  await page.goto(url.href, { settle: 1500 });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (await evaluate("!!(window.__lab?.ready && window.__labAnimR2?.version === 403)")) { ready = true; break; }
    await page.sleep(250);
  }
  if (!ready) throw new Error("Host chưa phục vụ đúng worktree có mã 403 và human");
  const shots: string[] = [], reports: unknown[] = [], seals: string[] = [];
  const shot = async (name: string): Promise<string> => {
    const path = join(out, `403-${name}.png`); await page.shot(path); shots.push(path); return path;
  };
  const step = async (n: number): Promise<void> => { await evaluate(`window.__lab.step(${n}); true`); };
  await evaluate("window.__lab.reset(); window.__lab.view('play'); window.__lab.step(60); window.__labAnimR2.begin(); window.__labAnimR2.front(true); true");
  for (let id = 0; id < SEAL_NAMES.length; id++) {
    await evaluate(`window.__labAnimR2.seal(${id}); true`); await step(48);
    seals.push(await shot(`seal-s${id}`));
    reports.push({ seal: id, name: SEAL_NAMES[id], state: await evaluate("window.__labAnimR2.report()") });
  }
  const sheets: string[] = [];
  const magick = process.env.ART_MAGICK || "/opt/homebrew/bin/magick";
  const montage = (files: string[], name: string, tile: string): void => {
    const path = join(out, name);
    execFileSync(magick, ["montage", ...files, "-font", "/System/Library/Fonts/Supplemental/Arial.ttf",
      "-set", "label", "%t", "-label", "%t", "-pointsize", "16", "-fill", "#e7e0d1", "-tile", tile,
      "-geometry", "480x270+4+4", "-background", "#141c24", path]);
    sheets.push(path);
  };
  montage(seals, "403-seals-front-10-sheet.jpg", "5x2");
  for (const family of FAMILIES) for (const front of [false, true]) {
    const view = front ? "front" : "play", files: string[] = [], word = FAMILY_WORD[family];
    await evaluate(`window.__lab.reset(); window.__lab.view('play'); window.__lab.step(60); window.__labAnimR2.family('${family}'); window.__labAnimR2.front(${front}); true`);
    await step(24); files.push(await shot(`${family}-${view}-ready`));
    await evaluate(`window.__labAnimR2.text('${word[0]}'); true`); await step(14);
    files.push(await shot(`${family}-${view}-early`));
    for (const ch of word.slice(1, -2)) { await evaluate(`window.__labAnimR2.text('${ch}'); true`); await step(14); }
    files.push(await shot(`${family}-${view}-mid`));
    await evaluate(`window.__labAnimR2.text('${word.at(-2)}'); true`); await step(18);
    files.push(await shot(`${family}-${view}-coil`));
    await evaluate(`window.__labAnimR2.text('${word.at(-1)}'); true`); await step(1);
    files.push(await shot(`${family}-${view}-release-f1`)); await step(2);
    files.push(await shot(`${family}-${view}-release-f3`));
    const follow = family === "sword" ? 19 : family === "palm" ? 25 : 27;
    await step(follow - 3); files.push(await shot(`${family}-${view}-follow`));
    await step((family === "sword" ? 37 : family === "palm" ? 45 : 48) - follow);
    files.push(await shot(`${family}-${view}-recover`));
    reports.push({ family, view, state: await evaluate("window.__labAnimR2.report()") });
    montage(files, `403-${family}-${view}-8-phases-sheet.jpg`, "4x2");
  }
  await evaluate("window.__labAnimR2.stop(); window.__labAnimR2.front(false); window.__lab.step(60); true");
  writeFileSync(join(out, "403-browser.json"), JSON.stringify({ url: url.href, reports, logs: page.logs, exceptions: page.exceptions,
    limits: "Fixed stepping, scripted text and screenshot overhead are not real-key input latency or audio onset. Front view isolates all FX to keep both hands visible. Inspect the rendered skin and real-time motion before judging." }, null, 2) + "\n");
  const ownerBase = "/Volumes/SS990TPRO/htdocs/typing-game-review/owner-review/2026-11-16/tu-tien/hero-anim-r2";
  const published = join(ownerBase, basename(out));
  mkdirSync(published, { recursive: true });
  for (const file of [...sheets, join(out, "403-browser.json"), join(out, "ABOUT.md")]) linkSync(file, join(published, basename(file)));
  for (const folder of [topic, ownerBase]) writeFileSync(join(folder, "ABOUT.md"), "purpose: Phiếu 403: thủ ấn và ba họ hoạt ảnh trong lab, các lượt chụp có thư mục riêng\nmade-by: Kịch bản Codex 403\ndoc: /Volumes/SS990TPRO/htdocs/typing-game/docs/codex-queue/403-report.md\ndelete-when: Sau khi owner duyệt và không còn cần đối chiếu\n");
  // This unique run contains only this scenario's files. Keep sheets + JSON; prune our own 58 raw PNGs.
  const prune = [join(repo, "tools/capture-prune/prune.mjs"), out, "--min-age-min", "0", "--docs", join(repo, "docs/codex-queue/403-report.md")];
  execFileSync(process.execPath, prune, { cwd: repo, stdio: "inherit" });
  execFileSync(process.execPath, [...prune, "--apply"], { cwd: repo, stdio: "inherit" });
  execFileSync(process.execPath, [join(repo, "scripts/review-index.mjs")], { cwd: repo, stdio: "inherit" });
  return { out, published, capturedFrames: shots.length, sheets };
}
