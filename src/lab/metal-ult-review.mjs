/** Ticket 426: Tripo PBR swords, exact recipe-time frames, full-frame hold cost and GPU pool checks.
 * BASE=http://127.0.0.1:3146/stress.html node src/kit/tools/cdp-run.mjs src/lab/metal-ult-review.mjs --width=1920 --height=1080 --dpr=1
 * Does not start a server or build the game. The 100-target CPU probe is metal-ult-check.mjs. Do not run through a blocked browser access path.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const out = process.env.OUT || '/Volumes/SS990TPRO/htdocs/typing-game-review/owner-review/2026-11-17/tu-tien/ult-metal-3d';
const target = join(root, 'games/immortality-cultivation/art-src/concept/ult-metal/ult-metal-moment-b.v1-try1.png');
const magick = process.env.ART_MAGICK || '/opt/homebrew/bin/magick';
const font = '/System/Library/Fonts/Supplemental/Arial.ttf';
const percentile = (a, p) => a.length ? a.toSorted((x, y) => x - y)[Math.ceil(a.length * p) - 1] : null;

export default async function (page) {
  mkdirSync(out, { recursive: true });
  const url = new URL(process.env.BASE || 'http://127.0.0.1:3146/stress.html');
  for (const [k, v] of Object.entries({ fixed: '1', ui: '0', dpr: '1', herd: 'march' })) url.searchParams.set(k, v);
  for (const k of ['auto', 'ultMetal']) url.searchParams.delete(k);
  await page.goto(url.href, { settle: 1500 });
  const evaluate = async expression => {
    const value = await page.eval(expression);
    if (value?.evalError) throw new Error(value.evalError);
    return value;
  };
  const waitFor = async (expression, message) => {
    for (let i = 0; i < 240; i++) { if (await evaluate(expression)) return; await page.sleep(250); }
    throw new Error(message);
  };
  await waitFor('!!(window.__lab?.ready && window.__stress?.ready)', 'Lab/stress chưa sẵn sàng');
  if (!await evaluate('typeof window.__lab.metalUlt === "function"')) throw new Error('Host chưa phục vụ mã Kim');
  await evaluate('window.__lab.metalUlt("layered"); true');
  await waitFor('window.__lab.metalUlt().ready', 'PNG hoặc GLB Tripo Kim chưa tải/upload xong');
  const restart = view => evaluate(`window.__lab.reset(); window.__lab.setHerd('march'); window.__lab.viewMode(${JSON.stringify(view)}); window.__lab.step(45); window.__lab.showcase('ult-metal-geng'); window.__lab.metalUlt().last`);
  // The host may slow or stop world time: count the recipe's clock, not wall-time frames.
  const seek = async time => {
    const state = await evaluate(`(() => {
      let r = window.__lab.metalUlt().last;
      if (!Number.isFinite(r?.clock)) throw new Error('Host chưa phục vụ clock của phiếu 402');
      for (let i = 0; i < 1200 && r.clock < ${time} - 1e-8; i++) {
        window.__lab.step(1, Math.min(1 / 60, ${time} - r.clock));
        r = window.__lab.metalUlt().last;
      }
      return r;
    })()`);
    if (Math.abs(state.clock - time) > 1e-7) throw new Error(`Không tới đúng mốc ${time}: ${state.clock}`);
    return state;
  };
  // Compile the cloned body programs and traverse all phases before collecting a frame measurement.
  const warm = await restart('top');
  if (!Number.isFinite(warm?.clock) || !(warm?.swordInstances > 0)) throw new Error('Cổng BASE chưa phục vụ kiếm Tripo phiếu 426');
  await evaluate('window.__lab.step(480); true');
  writeFileSync(join(out, 'ABOUT.md'), 'purpose: Phiếu 426: kiếm Tripo, góc trên/sau lưng lúc va chạm/trói, p95 toàn khung và tài nguyên qua năm lần tung\nmade-by: Kịch bản Codex src/lab/metal-ult-review.mjs, phiếu 426\ndoc: /Volumes/SS990TPRO/htdocs/typing-game/docs/codex-queue/426-report.md\ndelete-when: Sau khi owner duyệt và không còn cần đối chiếu\n');
  const result = { url: url.href, requestedViewport: [page.width, page.height], views: {},
    note: 'stress.html có 87 mục tiêu TargetField và 13 walker: cảnh 100 quái, tối đa 87 cùng trói. total là khung CPU+GPU chờ readPixels, không phải khoảng cách rAF. Không suy ra GPU100 mục tiêu cùng trói.' };
  for (const view of ['top', 'behind']) {
    const cast = await restart(view);
    if (cast?.meshDraws !== 5 || cast?.bindDraws !== 3 || !(cast?.swordInstances > 0) || cast.swordLoadError) throw new Error('Sai host hoặc chưa có kiếm Tripo phiếu 426');
    const population = await evaluate(`({ lab: Array.from({ length: 87 }, (_, i) => window.__lab.beast(i)).filter(f => f.alive).length, walkers: window.__stress.report().walkers.instances })`);
    if (population.lab + population.walkers !== 100) throw new Error('Cảnh stress không đủ 100 quái: ' + JSON.stringify(population));
    const shots = [], frames = [];
    for (const [name, time] of [['charge', 0.3], ['release', 0.6], ['wave-mid', 1.2], ['wave-full', 1.9],
      ['hold', Math.max(2.2, cast.firstBindAt + 1.5)], ['bind-end', cast.firstBindAt + 2.85],
      ['break', cast.firstBreakAt + 0.25], ['ground-fade', 6.3]]) {
      const state = await seek(time);
      const file = join(out, `426-${view}-${name}.png`); await page.shot(file); shots.push(file);
      frames.push({ name, requestedTime: time, recipeTime: state.clock, bound: state.bound, broken: state.broken,
        swordInstances: state.swordInstances, swordTriangles: state.swordTriangles });
    }
    const panel = (file, label) => ['-label', label, file];
    execFileSync(magick, ['montage', '-font', font, '-pointsize', '18', '-fill', '#e5eee5',
      ...shots.flatMap((file, i) => panel(file, `${frames[i].name} · ${frames[i].recipeTime.toFixed(3)} s`)),
      '-tile', '4x2', '-geometry', '480x320+4+4', '-background', '#111b17', join(out, `426-${view}-phases.jpg`)]);
    execFileSync(magick, ['montage', '-font', font, '-pointsize', '18', '-fill', '#e5eee5',
      ...panel(target, 'Target · moment-b'), ...panel(shots[3], 'Wave · 1.900 s'), ...panel(shots[4], `Hold · ${frames[4].recipeTime.toFixed(3)} s`),
      '-tile', '3x1', '-geometry', '640x427+8+8', '-background', '#111b17', join(out, `426-${view}-reference.jpg`)]);
    execFileSync(magick, ['montage', '-font', font, '-pointsize', '18', '-fill', '#e5eee5', ...panel(target, 'Target · moment-b'),
      ...shots.slice(1, 4).flatMap((file, i) => panel(file, `Wave · ${frames[i + 1].recipeTime.toFixed(3)} s`)),
      '-tile', '2x2', '-geometry', '960x640+8+8', '-background', '#111b17', join(out, `426-${view}-impact-window.jpg`)]);
    await restart(view);
    const rows = await evaluate(`(() => {
      const rows = [];
      for (let i = 0; i < 440; i++) {
        const p = window.__lab.perf(1), r = window.__lab.metalUlt().last;
        rows.push({ cpu: p.cpu[0], total: p.total[0], draws: p.drawCalls, triangles: p.triangles,
          swordInstances: r.swordInstances, swordTriangles: r.swordTriangles, clock: r.clock, bound: r.bound, broken: r.broken,
          tinted: r.activeTints, gpu: p.gpu, active: r.activeTints > 0 && r.clock >= 1.9 && r.clock < r.firstBreakAt - 0.05 });
      }
      return rows;
    })()`);
    const holding = rows.filter(r => r.active);
    if (holding.length < 30) throw new Error('Thiếu mẫu lúc trói: ' + holding.length);
    const last = await evaluate('window.__lab.metalUlt().last');
    const p95 = percentile(holding.map(r => r.total), 0.95);
    result.views[view] = { cast, last, population, rows, frames, submittedFrames: shots.map(f => f.split('/').at(-1)),
      cpuFrameP95Ms: percentile(holding.map(r => r.cpu), 0.95),
      frameP95WithReadbackMs: p95, holdSamples: holding.length, passes16_7ms: p95 <= 16.7,
      peakTotalSubmittedTriangles: Math.max(...rows.map(r => r.triangles)), peakSwordTriangles: Math.max(...rows.map(r => r.swordTriangles)),
      maxDrawCalls: Math.max(...rows.map(r => r.draws)), actualBound: last.bound, actualTinted: last.tintedFoes,
      scene100Foes: population.lab + population.walkers === 100,
      passes100BoundFoes: last.bound >= 100 && last.tintedFoes >= 100 };
    const memory = [];
    for (let k = 0; k < 5; k++) { await restart(view); await seek(2.2); memory.push(await evaluate('window.__lab.memory().gl')); }
    result.views[view].recastMemory = memory;
    result.views[view].stableGpuResources = memory.every(m => m.textures === memory[0].textures && m.geometries === memory[0].geometries);
  }
  result.console = page.logs ?? [];
  result.exceptions = page.exceptions ?? [];
  writeFileSync(join(out, '426-measure.json'), JSON.stringify(result, null, 2) + '\n');
  execFileSync(process.execPath, [join(root, 'scripts/review-index.mjs')], { cwd: root, stdio: 'inherit' });
  return { out, top: result.views.top.last, behind: result.views.behind.last };
}
