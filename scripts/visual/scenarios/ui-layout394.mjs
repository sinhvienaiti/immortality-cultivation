// Run through src/kit/tools/cdp-run.mjs. Writes only to the owner's review folder.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export default async function uiLayout394(page) {
  const out = resolve(process.env.OUT_DIR ?? "/Volumes/SS990TPRO/htdocs/typing-game-review/owner-review/2026-11-16/tu-tien/ui-layout-build");
  const label = process.env.LABEL ?? "after";
  const base = process.env.URL ?? "http://127.0.0.1:3008/";
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "ABOUT.md"), "purpose: Đối chiếu UI phiếu 394, đo hợp DOM rect và chụp chuẩn bị/đánh căng\nmade-by: Claude chạy scenario do Codex chuẩn bị\ndoc: docs/codex-queue/394-report.md\ndelete-when: Owner đã duyệt bố cục và lưu số liệu cần thiết\n");
  const waitFor = async (test, name) => {
    for (let n = 0; n < 150; n += 1) {
      const s = await page.eval("window.__ic?.state()");
      if (s && test(s)) return s;
      await page.sleep(100);
    }
    throw new Error("Timed out: " + name);
  };
  const records = [];
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    await page.viewport(width, height, 1);
    await page.goto(base);
    await page.eval(`document.querySelector('.ic-pace__row[data-wpm="35"]')?.click()`);
    // The vocabulary load may complete after the first click attempt.
    for (let n = 0; n < 100; n += 1) {
      const state = await page.eval("window.__ic?.state()");
      if (state?.ready) break;
      await page.eval(`document.querySelector('.ic-pace__row[data-wpm="35"]')?.click()`);
      await page.sleep(100);
    }
    await waitFor(s => s.ready, "match");
    await page.key("Shift", { code: "ShiftLeft" });
    await page.sleep(200);
    const capture = async phase => {
      const metric = await page.eval("window.__ic.layout()");
      if (!metric || metric.evalError) throw new Error("Use the 394 runtime (layout() is required for DOM measurement)");
      const state = await page.eval("window.__ic.state()");
      const file = join(out, `${label}-${width}x${height}-${phase}.png`);
      await page.shot(file);
      records.push({ label, phase, file, state, ...metric });
    };
    await waitFor(s => s.phase === "prep" && !s.paused, "preparation");
    await capture("prep");
    await page.key("Enter");
    await waitFor(s => s.phase === "wave", "combat");
    const stress = await page.eval(`(async () => {
      const { spawnBeast } = await import('/src/sim/spawn.ts');
      const { dealSeal, dealCleanse, stepWords } = await import('/src/sim/words.ts');
      const h = window.__ic, w = h.world();
      w.seats[0].chanNguyenPm = 100000;
      w.waves.groupsTotal = 999;
      const foes = [];
      for (let i = 0; i < 30; i++) {
        const b = spawnBeast(w, 'phong-lang', 'A', { wave: -1, x: (i % 6 - 3) * 60000, z: (-5 - Math.floor(i / 6)) * 60000, elite: i < 2 ? 'thiet-bi' : null, cluster: -1 });
        if (b) { b.hp = Math.max(1, Math.floor(b.hpMax * .55)); foes.push(b); }
      }
      for (const b of foes.slice(0, 2)) dealSeal(w, 0, { slot: b.slot, serial: b.serial });
      if (w.formation.nodes[0]) dealCleanse(w, 0, w.formation.nodes[0].id);
      stepWords(w);
      return { spawned: foes.length };
    })()`);
    if (stress?.evalError) throw new Error(stress.evalError);
    await page.sleep(250);
    const words = await page.eval("window.__ic.words()");
    const ultimate = words?.slots?.[4]?.text;
    if (ultimate) await page.typeKeys(ultimate, 25);
    const active = await page.eval("window.__ic.words()?.slots?.[3]?.text?.[0]");
    if (active) await page.typeKeys(active, 25);
    await page.sleep(200);
    await capture("combat-stress");
  }
  writeFileSync(join(out, `${label}-coverage.json`), JSON.stringify(records, null, 2));
  return records.map(({ phase, width, height, percent, minimumWordPx, overlaps }) => ({ phase, width, height, percent, minimumWordPx, overlaps }));
}
