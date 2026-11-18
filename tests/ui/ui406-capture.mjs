// Run with the kit CDP runner outside the sandbox; Vite must already serve port 3008.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export default async function capture406(page) {
  const out = resolve(process.env.OUT_DIR ?? "/Volumes/SS990TPRO/htdocs/typing-game-review/owner-review/2026-11-16/tu-tien/406-layout-icons");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "ABOUT.md"), "purpose: Đo DOM thẻ dự báo/Shop và chụp icon E1/B1 phiếu 406\nmade-by: Claude chạy kịch bản Codex\ndoc: docs/codex-queue/406-report.md\ndelete-when: Owner đã duyệt và lưu số đo cần thiết\n");
  const records = [], failures = [];
  const save = () => writeFileSync(join(out, "measurements.json"), JSON.stringify({ records, failures }, null, 2));
  const evaluate = async expression => {
    const result = await page.eval(expression);
    if (result?.evalError) throw new Error(result.evalError);
    return result;
  };
  const wait = async (expression, label) => {
    for (let n = 0; n < 200; n++) {
      if (await evaluate(expression)) return;
      await page.sleep(100);
    }
    throw new Error("Timed out: " + label);
  };
  try {
    for (const [width, height] of [[1280, 720], [1920, 1080]]) {
      await page.viewport(width, height, 1);
      await page.goto(process.env.URL ?? "http://127.0.0.1:3008/");
      await wait("(document.querySelector('.ic-pace__row[data-wpm=\"35\"]')?.click(), Boolean(window.__ic?.state().ready))", "match");
      await page.key("Shift", { code: "ShiftLeft" });
      await wait("window.__ic.state().phase === 'prep' && !window.__ic.state().paused", "prep");
      for (const mode of ["mouse", "keyboard"]) {
        if (mode === "keyboard") await page.key("`", { code: "Backquote" });
        // Include initial placement, not only a later screenshot after the card has moved.
        for (let frame = 0; frame < 15; frame++) {
          const snapshot = await evaluate(`(() => {
            const visible = node => node && !node.closest('[hidden]') && getComputedStyle(node).display !== 'none';
            const box = node => { const r = node.getBoundingClientRect(); return { x:r.left, y:r.top, w:r.width, h:r.height }; };
            const card = document.querySelector('[data-ui="wave-card"]');
            const shops = [...document.querySelectorAll('.ic-shop')].filter(visible).map(box);
            if (!visible(card) || !shops.length) return { missing: true, state: window.__ic.state() };
            const c = box(card);
            return { card:c, shops, areas:shops.map(s => Math.max(0, Math.min(c.x+c.w,s.x+s.w)-Math.max(c.x,s.x))*Math.max(0,Math.min(c.y+c.h,s.y+s.h)-Math.max(c.y,s.y))) };
          })()`);
          records.push({ width, height, mode, frame, ...snapshot });
          if (snapshot.missing || snapshot.areas?.some(area => area !== 0)) failures.push({ width, height, mode, frame, problem: "Shop/card DOM intersection", snapshot });
          await page.sleep(20);
        }
        await page.shot(join(out, `prep-${width}x${height}-${mode}.png`));
        if (mode === "keyboard") await page.key("`", { code: "Backquote" });
      }
      await page.key("Enter");
      await wait("window.__ic.state().phase === 'wave'", "wave");
      await evaluate(`(async () => {
        const { spawnBeast } = await import('/src/sim/spawn.ts');
        const w = window.__ic.world();
        w.waves.groupsTotal = 999;
        const fixtures = [
          { species:'phong-lang', elite:'thiet-bi', x:-240000, z:-240000 },
          { species:w.stage.boss, elite:null, x:240000, z:-240000 }
        ];
        for (const fixture of fixtures) {
          const b = spawnBeast(w, fixture.species, 'A', { wave:-1, x:fixture.x, z:fixture.z, elite:fixture.elite, cluster:-1 });
          if (!b) throw new Error('No room for foe fixture');
          b.hp = b.hpMax = 10000000;
          b.hardUntil = w.tick + 10000;
        }
      })()`);
      await wait("window.__ic.foeBadges()?.roles.includes(0) && window.__ic.foeBadges()?.roles.includes(1)", "both loaded badge roles");
      const icons = await evaluate("({ badges:window.__ic.foeBadges(), state:window.__ic.state(), perf:window.__ic.perf(), domMarkers:document.querySelectorAll('.ic-foe-badge').length })");
      records.push({ width, height, icons });
      if (icons.domMarkers !== 0) failures.push({ width, height, problem: "per-foe DOM marker" });
      if (/swiftshader|llvmpipe/i.test(icons.perf.gpu)) failures.push({ width, height, problem: "software GPU capture" });
      await page.shot(join(out, `elite-boss-${width}x${height}.png`));
      save();
    }
    if (page.exceptions.length) failures.push({ problem: "page exception", exceptions: page.exceptions });
    if (page.logs.some(log => /Shader Error|WebGLProgram|VALIDATE_STATUS/i.test(JSON.stringify(log)))) failures.push({ problem: "shader compile", logs:page.logs });
    save();
    if (failures.length) throw new Error("406 capture failed; evidence preserved at " + out);
    return { out, records: records.length, failures };
  } finally { save(); }
}
