// Ticket 258b: off-screen FlipbookPool v2 GPU/CPU checks. Writes probe-<PHASE>.json, without captures or lab steps.
//   BASE=http://127.0.0.1:3061/skills-lab.html PHASE=after OUT_DIR=tmp/shots/flipbook-v2 \
//   node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-flipbook-v2-probe.mjs
// cdp-run.mjs page.eval defaults to Runtime.evaluate awaitPromise: true; the returned report is awaited directly.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3061/skills-lab.html";
  const phase = process.env.PHASE ?? "after";
  const out = resolve(process.env.OUT_DIR ?? "tmp/shots/flipbook-v2");
  await page.goto(`${base}?fixed=1&ui=0&dpr=1&probe=0`, { settle: 1500 });
  let ready = false;
  for (let i = 0; i < 240; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) { ready = true; break; }
    await sleep(250);
  }
  if (!ready) throw new Error("Flipbook probe: window.__lab.ready timed out");
  const r = await page.eval("window.__lab.flipbookProbe()");
  if (!r || r.evalError) throw new Error(r?.evalError ?? "Flipbook probe returned no report");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `probe-${phase}.json`), JSON.stringify(r, null, 2) + "\n");
  return {
    pass: r.pass, programs: { distinct: r.programs.distinct, added: r.programs.added },
    maxErr: r.gpuVsCpu.maxErr, maskMaxErr: r.maskDecode.maxErr,
  };
}
