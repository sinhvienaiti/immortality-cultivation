// Power pass round 3b (03/11/2026) on the dev-only skills lab, fixed 60 Hz clock, play camera, DPR 1.
// MODE picks the run:
//   seq     SKILL types one skill (k1, k7, k5; TYPED=1 letter by letter) and shoots the frames in FRAMES (after the key; "c" frames count from
//           its climax: c-1, c0, c+4 …); VIEW=close shoots it in the close view (zoom 1). JSON: screen state per shot.
//   totals  key 7 and K5 one after the other: the running headline total of each cast (stand-in numbers).
// Output: OUT_DIR/raw-<PHASE>/… and OUT_DIR/<mode>-<PHASE>.json. Montage and prune the raw folder afterwards.
//   BASE=http://127.0.0.1:3026/skills-lab.html MODE=seq SKILL=k5 FRAMES=60,80,c0,c+4 OUT_DIR=tmp/shots/power-r3b \
//   node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-power-r3b.mjs --width=1920 --height=1080
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AT_CLIMAX = "(() => { const s = window.__lab.screen(); return s.impactStep === 0 && s.impactLocal === 0; })()";

async function open(page, base) {
  // TYPED=1: words are typed letter by letter (the charge at the caster shows), at WPM (default 45).
  const typed = process.env.TYPED === "1" ? `&typed=1&wpm=${process.env.WPM ?? "45"}` : "";
  await page.goto(`${base}?fixed=1&ui=0&dpr=1&weapon=clear-wind${typed}`, { settle: 1500 });
  for (let i = 0; i < 240; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) return;
    await sleep(250);
  }
  throw new Error("lab not ready");
}

async function fresh(page, view) {
  await page.eval("window.__lab.reset()");
  await page.eval("window.__lab.camera('play')");
  if (view === "close") await page.eval("window.__lab.zoom(1)");
  await page.eval("window.__lab.step(40)");
}

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3026/skills-lab.html";
  const mode = process.env.MODE ?? "seq";
  const phase = process.env.PHASE ?? "r3b";
  const outRoot = resolve(process.env.OUT_DIR ?? "tmp/shots/power-r3b");
  const out = join(outRoot, `raw-${phase}`);
  mkdirSync(out, { recursive: true });
  await open(page, base);
  const report = { mode, phase, shots: [] };
  if (mode === "seq") {
    const skill = process.env.SKILL ?? "k5";
    const view = process.env.VIEW ?? "play";
    const frames = (process.env.FRAMES ?? "1,30,60").split(",").map((s) => s.trim());
    await fresh(page, view);
    await page.eval(`window.__lab.type(${JSON.stringify(skill)})`);
    let at = 0;
    let climax = -1;
    for (const f of frames) {
      let goal;
      if (f.startsWith("c")) {
        if (climax < 0) {
          for (let i = 0; i < 400; i += 1) {
            await page.eval("window.__lab.step(1)");
            at += 1;
            if (await page.eval(AT_CLIMAX)) {
              climax = at;
              break;
            }
          }
          if (climax < 0) throw new Error("no climax");
        }
        goal = climax + Number(f.slice(1) || "0");
      } else goal = Number(f);
      if (goal > at) {
        await page.eval(`window.__lab.step(${goal - at})`);
        at = goal;
      }
      const file = join(out, `${skill}-${view}-${f.replace("+", "p").replace("-", "m")}.png`);
      await page.shot(file);
      report.shots.push({ f, at, file, screen: await page.eval("window.__lab.screen()") });
    }
    report.climax = climax;
  } else if (mode === "totals") {
    report.casts = {};
    for (const skill of ["k7", "k5"]) {
      await fresh(page, "play");
      await page.eval(`window.__lab.type(${JSON.stringify(skill)})`);
      let peak = 0;
      for (let i = 0; i < 420; i += 1) {
        await page.eval("window.__lab.step(1)");
        const n = await page.eval("window.__lab.numbers()");
        peak = Math.max(peak, skill === "k7" ? n.castK7 : n.castK5);
      }
      report.casts[skill] = { peak, last: await page.eval("window.__lab.numbers()") };
    }
  }
  writeFileSync(join(outRoot, `${mode}-${phase}.json`), JSON.stringify(report, null, 1));
  return report;
}
