// The hand sword against Lam's body (Clear Wind review, 03/11/2026): on the dev-only page
// /skills-lab.html?fixed=1&ui=0&probe=0, through idle, walk, run, turns, strafe, back and every skill, each
// sampled frame casts the sword's segments (blade middle and edges, across the guard, the pommel) at the skinned
// mesh (__lab.handHits) and counts the frames that cross the body (the holding arm left out), per phase and bone,
// the lowest tip, and how fast the sword's axis turns (deg a frame: a snap shows here).
//   OUT=tmp/shots/clearwind/review/clip.json node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-hand-clip.mjs --width=960 --height=540
// Env: URL (add &clear=0 for the sword rigid in the fist), EVERY (frames a sample, 2), GRIPS ("tilt,roll,yaw,x,y,z;…"
// compares grips), OUT (a JSON file; optional).
import { writeFileSync } from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function (page) {
  const base = process.env.URL ?? "http://127.0.0.1:3018/skills-lab.html?fixed=1&ui=0&probe=0";
  const every = Number(process.env.EVERY ?? "2");
  const grips = (process.env.GRIPS ?? "").split(";").filter(Boolean);
  await page.goto(base, { settle: 1500 });
  for (let i = 0; i < 160; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready && window.__lab.hand().loaded)")) break;
    await sleep(250);
  }
  const plan = [
    ["idle", null, 120],
    ["walk", "window.__lab.walkTo(0, -6, 1.2)", 150],
    ["run", "window.__lab.walkTo(0, -16, 3)", 130],
    ["stop", null, 60],
    ["turn90", "(() => { const c = window.__lab.caster(); window.__lab.faceTo(c.x + 5, c.z); })()", 60],
    ["turn180", "(() => { const c = window.__lab.caster(); window.__lab.faceTo(c.x - 5, c.z); })()", 60],
    ["strafe", "(() => { const c = window.__lab.caster(); window.__lab.faceTo(c.x, c.z - 5); window.__lab.walkTo(c.x + 4, c.z, 1.2, true); })()", 150],
    ["back", "(() => { const c = window.__lab.caster(); window.__lab.walkTo(c.x, c.z + 4, 1.2, true); })()", 150],
    ["auto", "(() => { const c = window.__lab.caster(); window.__lab.faceTo(c.x, c.z - 5); window.__lab.cast('auto', c.x, c.z - 6); })()", 70],
    ["k1", "(() => { const c = window.__lab.caster(); window.__lab.cast('k1', c.x, c.z - 6); })()", 110],
    ["k2", "(() => { const c = window.__lab.caster(); window.__lab.cast('k2', c.x, c.z - 6); })()", 90],
    ["guard", "(() => { const c = window.__lab.caster(); window.__lab.cast('guard', c.x, c.z - 6); })()", 110],
    ["dash", "(() => { const c = window.__lab.caster(); window.__lab.cast('dash', c.x, c.z - 4); })()", 60],
    ["k4", "(() => { const c = window.__lab.caster(); window.__lab.cast('k4', c.x, c.z - 6); })()", 110],
    ["k5", "(() => { const c = window.__lab.caster(); window.__lab.cast('k5', c.x, c.z - 8); })()", 200],
  ];
  const results = [];
  for (const g of grips.length > 0 ? grips : [""]) {
    if (g !== "") {
      const [tiltDeg, rollDeg, yawDeg, x, y, z] = g.split(",").map(Number);
      await page.eval(`window.__lab.setGrip(${JSON.stringify({ tiltDeg, rollDeg, yawDeg, x, y, z })})`);
    }
    await page.eval("window.__lab.reset()");
    await page.eval("window.__lab.step(30)");
    const phases = {};
    let frames = 0;
    let clipFrames = 0;
    let handFrames = 0;
    let minTip = 9;
    let minEnd = 9;
    const bones = {};
    let prevAxis = null;
    let maxTurn = 0;
    let maxTurnAt = "";
    const turns = [];
    const parts = {};
    for (const [name, cmd, n] of plan) {
      if (cmd) await page.eval(cmd);
      const ph = (phases[name] = { frames: 0, clip: 0, bones: {} });
      for (let f = 0; f < n; f += every) {
        await page.eval(`window.__lab.step(${every})`);
        const r = await page.eval("window.__lab.handHits()");
        if (!r || r.evalError) throw new Error(JSON.stringify(r));
        if (r.tipY < 0 && r.hits.length === 0 && r.endY < 0) { prevAxis = null; continue; } // sword away
        frames += 1;
        ph.frames += 1;
        if (prevAxis && r.axis) {
          const dot = Math.max(-1, Math.min(1, prevAxis[0] * r.axis[0] + prevAxis[1] * r.axis[1] + prevAxis[2] * r.axis[2]));
          const deg = (Math.acos(dot) * 180) / Math.PI / every;
          turns.push(deg);
          if (deg > maxTurn) { maxTurn = deg; maxTurnAt = name + "@" + f; }
        }
        prevAxis = r.axis ?? null;
        minTip = Math.min(minTip, r.tipY);
        minEnd = Math.min(minEnd, r.endY);
        const body = r.hits.filter((h) => h.bone !== "hand_r" && h.bone !== "lowerarm_r");
        if (body.length > 0) {
          clipFrames += 1;
          ph.clip += 1;
        }
        if (r.hits.length > body.length) handFrames += 1;
        for (const h of r.hits) {
          bones[h.bone] = (bones[h.bone] ?? 0) + 1;
          ph.bones[h.bone] = (ph.bones[h.bone] ?? 0) + 1;
          parts[h.part + ":" + h.bone] = (parts[h.part + ":" + h.bone] ?? 0) + 1;
        }
      }
    }
    turns.sort((a, b) => a - b);
    results.push({ grip: g || "default", axisTurnDegPerFrame: { p50: Math.round(turns[Math.floor(turns.length * 0.5)] * 10) / 10, p95: Math.round(turns[Math.floor(turns.length * 0.95)] * 10) / 10, max: Math.round(maxTurn * 10) / 10, at: maxTurnAt }, frames, clipFrames, clipShare: Math.round((clipFrames / Math.max(1, frames)) * 1000) / 1000, handFrames, minTipY: Math.round(minTip * 1000) / 1000, minPommelY: Math.round(minEnd * 1000) / 1000, bones, parts, phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, `${v.clip}/${v.frames} ${Object.entries(v.bones).map(([b, c]) => b + ":" + c).join(" ")}`])) });
  }
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(results, null, 1));
  return results;
}
