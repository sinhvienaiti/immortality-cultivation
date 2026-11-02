// Skills lab capture (dev-only page /skills-lab.html?fixed=1): each Kiếm skill is
// typed at a fixed WPM on a fixed 60 Hz clock, and frames are taken at the
// five phases (charge, release, travel, impact, aftermath) for the frame
// sheets of VFX_STANDARD §5.6. Writes PNGs to
// OUT_DIR/<skill>-<view>-<weapon>-NN-<label>.png. Run from the game root with Vite dev up:
//   URL=http://127.0.0.1:3018/skills-lab.html?fixed=1&ui=0 OUT_DIR=tmp/lab/shots WEAPON=clear-wind \
//   node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-skills.mjs --width=1280 --height=720
// SKILLS=auto,k1,... picks skills; WPM (45); VIEW=play|close; WEAPON=<sword id> equips
// that sword first (D55: its blade and element colours drive every skill; default:
// the lab's ?weapon or clear-wind).
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Frames after the release (last key) to capture, with a label; "c" frames count from the first key. */
const PLAN = {
  auto: { word: 0, after: [[0, "release"], [8, "travel"], [18, "impact"], [20, "impact+2"], [45, "aftermath"]] },
  k1: { word: 5, charge: [0.5, 0.9], after: [[0, "release"], [3, "travel"], [6, "impact1"], [8, "impact1+2"], [33, "launch2"], [36, "impact2"], [66, "impact3"], [95, "aftermath"]] },
  k2: { word: 6, charge: [0.5, 0.9], after: [[0, "release"], [6, "travel"], [12, "impact"], [14, "impact+2"], [30, "aftermath"], [70, "ink"]] },
  guard: { word: 5, charge: [0.5, 0.9], after: [[0, "release"], [9, "landed"], [60, "orbit"]], shot: 70, afterShot: [[0, "bolt"], [10, "bolt+10"], [20, "parry"], [24, "parry+4"], [50, "after"]] },
  dash: { word: 4, charge: [0.5, 0.9], after: [[0, "release"], [5, "travel"], [12, "arrive"], [30, "aftermath"]] },
  k4: { word: 6, charge: [0.5, 0.9], after: [[0, "release"], [8, "fall"], [12, "open"], [14, "open+2"], [42, "beat2"], [44, "beat2+2"], [150, "mid"], [300, "close"], [330, "aftermath"]] },
  k5: { word: 8, charge: [0.4, 0.8, 0.95], after: [[0, "release"], [10, "belts"], [30, "wave1"], [32, "wave1+2"], [75, "wave2"], [118, "dive3"], [120, "wave3"], [122, "wave3+2"], [150, "aftermath"], [190, "ink"]] },
};

export default async function (page) {
  const url = process.env.URL ?? "http://127.0.0.1:3018/skills-lab.html?fixed=1&ui=0";
  const out = resolve(process.env.OUT_DIR ?? "tmp/lab/shots");
  const wpm = Number(process.env.WPM ?? "45");
  const skills = (process.env.SKILLS ?? "auto,k1,k2,guard,dash,k4,k5").split(",");
  const view = process.env.VIEW ?? "play";
  // Close-up aim per skill: x, z, distance (m) at the play camera's 55°.
  const CLOSE = { auto: [0, -1, 17], k1: [0, -1, 17], k2: [0, -3.5, 22], guard: [0, 2.2, 11], dash: [2.5, 2.2, 12], k4: [-3, -3, 19], k5: [0, -5, 25] };
  mkdirSync(out, { recursive: true });
  await page.goto(url, { settle: 1500 });
  for (let i = 0; i < 120; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
    await sleep(250);
  }
  if (process.env.WEAPON) {
    const ok = await page.eval(`window.__lab.setWeapon(${JSON.stringify(process.env.WEAPON)})`);
    if (ok !== true) throw new Error(`lab refused weapon "${process.env.WEAPON}" (${JSON.stringify(ok)}): swords only`);
  }
  const weapon = await page.eval("window.__lab.weapon()");
  await page.eval(`window.__lab.setWpm(${wpm})`);
  const framesPerLetter = Math.round(3600 / (wpm * 5));
  const taken = [];
  const shot = async (skill, n, label) => {
    const file = join(out, `${skill}-${view}-${weapon}-${String(n).padStart(2, "0")}-${label}.png`);
    await page.shot(file);
    taken.push(file);
  };
  for (const skill of skills) {
    const plan = PLAN[skill];
    if (!plan) continue;
    await page.eval("window.__lab.reset()");
    if (view === "close") {
      const [cx, cz, cd] = CLOSE[skill];
      await page.eval(`window.__lab.camera('close', ${cx}, ${cz}, ${cd})`);
    } else await page.eval("window.__lab.camera('play')");
    await page.eval("window.__lab.step(30)");
    let n = 0;
    await page.eval(`window.__lab.type('${skill}')`);
    let elapsed = 0;
    const charge = plan.charge ?? [];
    // The first key lands on the first frame, then one every framesPerLetter: the last key (release) is on frame 1 + (word − 1) × fpl.
    const total = plan.word > 0 ? 1 + (plan.word - 1) * framesPerLetter : 0;
    for (const p of charge) {
      const f = Math.max(1, Math.round(total * p)) - elapsed;
      if (f > 0) await page.eval(`window.__lab.step(${f})`);
      elapsed += Math.max(0, f);
      await shot(skill, n++, `charge${Math.round(p * 100)}`);
    }
    // Step to the release frame (the last key).
    const toRelease = Math.max(0, total - elapsed);
    if (toRelease > 0) await page.eval(`window.__lab.step(${toRelease})`);
    let since = 0;
    for (const [f, label] of plan.after) {
      if (f > since) await page.eval(`window.__lab.step(${f - since})`);
      since = Math.max(since, f);
      await shot(skill, n++, label);
    }
    if (plan.shot) {
      if (plan.shot > since) await page.eval(`window.__lab.step(${plan.shot - since})`);
      await page.eval("window.__lab.enemyShot()");
      let s2 = 0;
      for (const [f, label] of plan.afterShot) {
        if (f > s2) await page.eval(`window.__lab.step(${f - s2})`);
        s2 = Math.max(s2, f);
        await shot(skill, n++, label);
      }
    }
  }
  return { weapon, framesPerLetter, taken: taken.length };
}
