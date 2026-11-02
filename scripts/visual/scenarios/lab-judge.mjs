// Blind-judge captures of the equipped sword in the skills lab (Clear Wind lab test, 03/11/2026): on the
// dev-only page /skills-lab.html?fixed=1&ui=0, on a fixed 60 Hz clock.
//   turntable  the caster idles with the sword in hand; one frozen frame redrawn from an orbit round the held
//              sword's middle (__lab.view("orbit"), setOrbit(…, true)) at 8 yaws, then the caster idle at the 6 m close-up (__lab.view("follow"))
//              at 4 moments of the breathing cycle, facing the field and turned to the camera
//   skills     every Kiếm skill typed at WPM, 12 frames per skill (charge, release, travel, impact, aftermath),
//              at the play camera and at the per-skill close-up of lab-skills.mjs
// Raw frames go to OUT_DIR/raw/, sheets (3 × 4 or 4 × 2 tiles, phase words only: blind-judge sheets print no
// metrics) to OUT_DIR/sheets/. Delete raw/ once the sheets are made (AGENTS.md "Test captures").
//   OUT_DIR=tmp/shots/clearwind/final WEAPON=clear-wind node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-judge.mjs --width=1280 --height=720
// Env: URL, OUT_DIR, WEAPON, WPM (45), PARTS (turntable,skills), SKILLS (auto,k1,k2,guard,dash,k4,k5),
// VIEWS (play,close), ORBIT_M (1.5, orbit distance), ORBIT_ON (sword | hand), TURN (8 "yaw:pitch[:metres]" views, degrees; the views on the
// caster's side stand farther and higher, since a close orbit there passes through the body), FOLLOW_M (6).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FONT = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((f) => existsSync(f));

const NAMES = {
  auto: "Phi Kiếm · Flying Sword",
  k1: "Ngự Kiếm Quyết · Threefold Sword Command",
  k2: "Nhất Tuyến Xuyên Vân · Cloud-Piercing Line",
  guard: "Hồi Kiếm Hộ Thân · Returning Sword Aegis",
  dash: "Lưu Quang Bộ · Flowing-Light Step",
  k4: "Lạc Kiếm Trận · Falling Sword Array",
  k5: "Thiên Hà Kiếm Vũ · Milky-Way Sword Rain",
};

/**
 * 12 frames per skill: lab-skills.mjs's phase frames, filled to 12. charge = shares of the typed word; after =
 * frames from the release (the last key; for a wordless skill, from the cast); shot / afterShot / parry as there.
 */
const PLAN = {
  auto: { word: 0, after: [[0, "release"], [4, "travel"], [8, "travel"], [12, "travel"], [16, "travel"], [18, "impact"], [20, "impact"], [23, "impact"], [30, "aftermath"], [38, "aftermath"], [45, "aftermath"], [60, "aftermath"]] },
  k1: { word: 5, charge: [0.5, 0.9], after: [[0, "release"], [3, "travel"], [6, "impact"], [8, "impact"], [18, "between strikes"], [33, "travel"], [36, "impact"], [63, "travel"], [66, "impact"], [95, "aftermath"]] },
  k2: { word: 6, charge: [0.2, 0.5, 0.9], after: [[0, "release"], [3, "travel"], [6, "travel"], [9, "travel"], [12, "impact"], [14, "impact"], [18, "impact"], [30, "aftermath"], [70, "aftermath"]] },
  guard: { word: 5, charge: [0.5, 0.9], after: [[0, "release"], [4, "travel"], [9, "landed"], [60, "orbit"]], shot: 70, afterShot: [[0, "enemy bolt"], [10, "enemy bolt"]], parry: [[0, "parry"], [4, "parry"], [12, "aftermath"], [30, "aftermath"]] },
  dash: { word: 4, charge: [0.25, 0.5, 0.9], after: [[0, "release"], [2, "travel"], [5, "travel"], [8, "travel"], [12, "arrive"], [15, "arrive"], [20, "aftermath"], [30, "aftermath"], [45, "aftermath"]] },
  k4: { word: 6, charge: [0.5, 0.9], after: [[0, "release"], [8, "fall"], [12, "open"], [14, "open"], [42, "beat"], [90, "array"], [150, "array"], [220, "array"], [300, "close"], [330, "aftermath"]] },
  k5: { word: 8, charge: [0.4, 0.8, 0.95], after: [[0, "release"], [10, "travel"], [30, "wave 1"], [32, "wave 1"], [75, "wave 2"], [118, "dive"], [120, "wave 3"], [150, "aftermath"], [190, "aftermath"]] },
};
// Close-up aim per skill (lab-skills.mjs): x, z, distance (m) at the play camera's 55°.
const CLOSE = { auto: [0, -1, 17], k1: [0, -1, 17], k2: [0, -3.5, 22], guard: [0, 2.2, 11], dash: [2.5, 2.2, 12], k4: [-3, -3, 19], k5: [0, -5, 25] };

function montage(tiles, cols, tile, title, file) {
  const args = ["-background", "#11151c", "-fill", "#e6e9ef", "-pointsize", "16"];
  if (FONT) args.push("-font", FONT);
  for (const [path, label] of tiles) args.push("-label", label, path);
  args.push("-tile", `${cols}x`, "-geometry", `${tile}+4+4`, "-quality", "92", "-title", title, file);
  const r = spawnSync("montage", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error("montage failed: " + (r.stderr || "").slice(-600));
}

export default async function (page) {
  const url = process.env.URL ?? "http://127.0.0.1:3018/skills-lab.html?fixed=1&ui=0";
  const out = resolve(process.env.OUT_DIR ?? "tmp/shots/judge");
  const raw = join(out, "raw");
  const sheets = join(out, "sheets");
  mkdirSync(raw, { recursive: true });
  mkdirSync(sheets, { recursive: true });
  const parts = (process.env.PARTS ?? "turntable,skills").split(",");
  const skills = (process.env.SKILLS ?? "auto,k1,k2,guard,dash,k4,k5").split(",");
  const views = (process.env.VIEWS ?? "play,close").split(",");
  const wpm = Number(process.env.WPM ?? "45");
  const orbitM = Number(process.env.ORBIT_M ?? "1.6");
  const onSword = (process.env.ORBIT_ON ?? "sword") === "sword";
  const turn = (process.env.TURN ?? "0:35:2.4,45:26,90:18,135:18,180:26,225:35,270:48:3.2,315:48:3.2").split(",").map((v) => v.split(":").map(Number));
  const followM = Number(process.env.FOLLOW_M ?? "6");

  await page.goto(url, { settle: 1500 });
  for (let i = 0; i < 200; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready && window.__lab.hand().loaded)")) break;
    await sleep(250);
  }
  if (!(await page.eval("!!(window.__lab && window.__lab.ready)"))) throw new Error("lab not ready");
  if (process.env.WEAPON) {
    const ok = await page.eval(`window.__lab.setWeapon(${JSON.stringify(process.env.WEAPON)})`);
    if (ok !== true) throw new Error(`lab refused weapon "${process.env.WEAPON}"`);
    for (let i = 0; i < 80 && !(await page.eval("window.__lab.hand().loaded")); i += 1) await sleep(250);
  }
  const weapon = await page.eval("window.__lab.weapon()");
  const weaponName = { "clear-wind": "Clear Wind" }[weapon] ?? weapon;
  await page.eval(`window.__lab.setWpm(${wpm})`);
  const made = [];
  let shots = 0;
  const shoot = async (file) => {
    await page.shot(file);
    shots += 1;
    return file;
  };

  if (parts.includes("turntable")) {
    await page.eval("window.__lab.reset()");
    await page.eval("window.__lab.camera('play')");
    // Settle into the idle loop (2.5 s), then one frozen frame from 8 views round the sword.
    await page.eval("window.__lab.step(150)");
    const tiles = [];
    for (const [yaw, pitch, metres] of turn) {
      await page.eval(`window.__lab.setOrbit(${yaw}, ${pitch}, ${onSword})`);
      await page.eval(`window.__lab.view('orbit', ${metres || orbitM})`);
      tiles.push([await shoot(join(raw, `turn-${String(yaw).padStart(3, "0")}.png`)), `yaw ${yaw}° · pitch ${pitch}°`]);
    }
    await page.eval("window.__lab.view('play')");
    const turnSheet = join(sheets, `turntable-${weapon}.jpg`);
    montage(tiles, 4, "640x360", `${weaponName} · in hand, idle · lookdev light · 8 views round the ${onSword ? "sword" : "hand"}`, turnSheet);
    made.push(turnSheet);
    // The caster idle at the 6 m close-up: 4 moments of the 3 s breathing cycle facing the field, then 4 turned to the camera.
    const idle = [];
    for (const [facing, label] of [
      ["field", "facing the field"],
      ["camera", "turned to the camera"],
    ]) {
      if (facing === "camera") {
        await page.eval("(() => { const c = window.__lab.caster(); window.__lab.faceTo(c.x - 2.5, c.z + 5); })()");
        await page.eval("window.__lab.step(120)");
      }
      for (let k = 0; k < 4; k += 1) {
        if (k > 0) await page.eval("window.__lab.step(45)");
        await page.eval(`window.__lab.view('follow', ${followM})`);
        idle.push([await shoot(join(raw, `idle-${facing}-${k}.png`)), `${label} · ${(k * 0.75).toFixed(2)} s`]);
        await page.eval("window.__lab.view('play')");
      }
    }
    const idleSheet = join(sheets, `idle-6m-${weapon}.jpg`);
    montage(idle, 4, "640x360", `${weaponName} · caster idle · ${followM} m close-up at 55°`, idleSheet);
    made.push(idleSheet);
  }

  if (parts.includes("skills")) {
    const framesPerLetter = Math.round(3600 / (wpm * 5));
    for (const view of views) {
      for (const skill of skills) {
        const plan = PLAN[skill];
        if (!plan) continue;
        const tiles = [];
        let n = 0;
        const take = async (label) => {
          n += 1;
          tiles.push([await shoot(join(raw, `${skill}-${view}-${String(n).padStart(2, "0")}.png`)), `${n} · ${label}`]);
        };
        await page.eval("window.__lab.reset()");
        if (view === "close") {
          const [cx, cz, cd] = CLOSE[skill];
          await page.eval(`window.__lab.camera('close', ${cx}, ${cz}, ${cd})`);
        } else await page.eval("window.__lab.camera('play')");
        await page.eval("window.__lab.step(30)");
        await page.eval(`window.__lab.type('${skill}')`);
        let elapsed = 0;
        const total = plan.word > 0 ? 1 + (plan.word - 1) * framesPerLetter : 0;
        for (const p of plan.charge ?? []) {
          const f = Math.max(1, Math.round(total * p)) - elapsed;
          if (f > 0) await page.eval(`window.__lab.step(${f})`);
          elapsed += Math.max(0, f);
          await take("charge");
        }
        const toRelease = plan.word > 0 ? Math.max(0, total - elapsed) : 1;
        if (toRelease > 0) await page.eval(`window.__lab.step(${toRelease})`);
        let since = plan.word > 0 ? 0 : toRelease;
        for (const [f, label] of plan.after) {
          if (f > since) await page.eval(`window.__lab.step(${f - since})`);
          since = Math.max(since, f);
          await take(label);
        }
        if (plan.shot) {
          if (plan.shot > since) await page.eval(`window.__lab.step(${plan.shot - since})`);
          await page.eval("window.__lab.enemyShot()");
          let s2 = 0;
          for (const [f, label] of plan.afterShot) {
            if (f > s2) await page.eval(`window.__lab.step(${f - s2})`);
            s2 = Math.max(s2, f);
            await take(label);
          }
          for (let i = 0; i < 120 && (await page.eval("window.__lab.boltActive()")); i += 1) await page.eval("window.__lab.step(1)");
          let s3 = 0;
          for (const [f, label] of plan.parry) {
            if (f > s3) await page.eval(`window.__lab.step(${f - s3})`);
            s3 = Math.max(s3, f);
            await take(label);
          }
        }
        const file = join(sheets, `${skill}-${view}-${weapon}.jpg`);
        montage(tiles, 4, "640x360", `${weaponName} · ${NAMES[skill]} · ${view === "play" ? "play camera" : "close-up"}`, file);
        made.push(file);
        if (n !== 12) throw new Error(`${skill}: ${n} frames, not 12`);
      }
    }
  }
  return { weapon, shots, sheets: made };
}
