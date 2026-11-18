// Run with src/kit/tools/cdp-run.mjs outside the sandbox; Vite must already be up.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export default async function uiLayout394b(page) {
  const out = resolve(process.env.OUT_DIR ?? "/Volumes/SS990TPRO/htdocs/typing-game-review/owner-review/2026-11-16/tu-tien/ui-layout-394b");
  const base = process.env.URL ?? "http://127.0.0.1:3008/";
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "ABOUT.md"), "purpose: Kiểm UI 394b ở bốn trạng thái; giao cắt landmark, Ultimate và quái đầy/bị thương\nmade-by: Claude chạy kịch bản CDP do Codex chuẩn bị\ndoc: docs/codex-queue/394b-report.md\ndelete-when: Owner đã duyệt và lưu số đo cần thiết\n");
  const records = [], failures = [];
  const evaluate = async expression => {
    const value = await page.eval(expression);
    if (value?.evalError) throw new Error(value.evalError);
    return value;
  };
  const wait = async (expression, name) => {
    for (let n = 0; n < 200; n += 1) {
      if (await evaluate(expression)) return;
      await page.sleep(100);
    }
    throw new Error("Timed out: " + name);
  };
  const save = () => writeFileSync(join(out, "after-coverage.json"), JSON.stringify({ records, failures }, null, 2));
  try {
    for (const [width, height] of [[1280, 720], [1920, 1080]]) {
      await page.viewport(width, height, 1);
      await page.goto(base);
      await wait("(document.querySelector('.ic-pace__row[data-wpm=\"35\"]')?.click(), Boolean(window.__ic?.state().ready))", "match");
      await page.key("Shift", { code: "ShiftLeft" });
      await wait("window.__ic.state().phase === 'prep' && !window.__ic.state().paused", "prep");
      const capture = async (phase, ultimateBefore = null) => {
        const snapshot = await evaluate(`(() => {
          const h = window.__ic, w = h.world();
          const beasts = w.beasts.list.filter(b => b.alive && !b.freed && b.hp > 0);
          return {
            state: h.state(), ...h.layout(), ultimate: h.words().slots[4], bars: h.healthBars(),
            full: beasts.filter(b => b.hp === b.hpMax).map(b => ({ slot: b.slot, serial: b.serial })),
            damaged: beasts.filter(b => b.hp < b.hpMax).map(b => ({ slot: b.slot, serial: b.serial, fraction: b.hp / b.hpMax })),
            waveNotices: [...document.querySelectorAll('.ic-notice')].filter(n => /^Wave\\s+\\d/.test(n.textContent)).length
          };
        })()`);
        const file = join(out, `after-${width}x${height}-${phase}.png`);
        await page.shot(file);
        records.push({ width, height, phase, file, ultimateBefore, ...snapshot });
        const landmarks = snapshot.overlaps.filter(hit => /^(slot-|gate-|core$)/.test(hit.landmark));
        if (landmarks.length) failures.push({ width, height, phase, problem: "landmark overlap", landmarks });
        if (snapshot.waveNotices) failures.push({ width, height, phase, problem: "duplicate wave notice" });
        if (/swiftshader|llvmpipe/i.test(snapshot.state.gpu)) failures.push({ width, height, problem: "software GPU capture" });
        if (phase === "combat-stress") {
          if (snapshot.percent > 17) failures.push({ width, height, problem: "combat coverage > 17%", percent: snapshot.percent });
          if (!snapshot.full.length || !snapshot.damaged.length) failures.push({ width, height, problem: "mixed health fixture missing" });
          const expected = snapshot.damaged.map(b => b.fraction).sort((a, b) => a - b);
          const drawn = snapshot.bars?.fractions.slice().sort((a, b) => a - b) ?? [];
          if (expected.length !== drawn.length || expected.some((value, i) => Math.abs(value - drawn[i]) > 1e-6)) failures.push({ width, height, problem: "health instance mismatch", expected, drawn });
          if (snapshot.ultimate.note !== "Ultimate ready · Space") failures.push({ width, height, problem: "Ultimate not prepared", ultimateBefore, ultimate: snapshot.ultimate });
        }
        save();
      };
      await capture("prep");
      await page.key("Enter");
      await wait("window.__ic.state().phase === 'wave'", "combat");
      await evaluate(`(async () => {
        const { spawnBeast } = await import('/src/sim/spawn.ts');
        const { dealSeal, dealCleanse, stepWords } = await import('/src/sim/words.ts');
        const w = window.__ic.world();
        w.waves.groupsTotal = 999;
        w.seats[0].chanNguyenPm = 100000;
        for (let i = 0; i < 30; i++) {
          const b = spawnBeast(w, 'phong-lang', 'A', { wave: -1, x: (i % 6 - 3) * 60000, z: (-5 - Math.floor(i / 6)) * 60000, elite: i < 2 ? 'thiet-bi' : null, cluster: -1 });
          if (!b) throw new Error('Cannot spawn mixed-health fixture');
          b.hpMax = 100000;
          b.hp = i % 2 ? 55000 : 100000;
          if (i < 2) dealSeal(w, 0, { slot: b.slot, serial: b.serial });
        }
        if (w.formation.nodes[0]) dealCleanse(w, 0, w.formation.nodes[0].id);
        stepWords(w);
      })()`);
      await page.sleep(300);
      const ultimateBefore = await evaluate("window.__ic.words().slots[4]");
      // Do not invent a display word when the allocator leaves Ultimate waiting.
      if (ultimateBefore.state === "ready" && ultimateBefore.text) await page.typeKeys(ultimateBefore.text, 25);
      const letter = await evaluate("window.__ic.words().slots[3].text[0]");
      if (letter) await page.typeKeys(letter, 25);
      await page.sleep(300);
      await capture("combat-stress", ultimateBefore);
    }
    if (page.exceptions.length) failures.push({ problem: "page exceptions", exceptions: page.exceptions });
    save();
    if (failures.length) throw new Error("394b checks failed; all completed captures and failures saved in " + out);
    return records.map(({ width, height, phase, percent, overlaps, full, damaged, bars }) => ({ width, height, phase, percent, overlaps, full: full.length, damaged: damaged.length, healthInstances: bars?.count }));
  } finally {
    save();
  }
}
