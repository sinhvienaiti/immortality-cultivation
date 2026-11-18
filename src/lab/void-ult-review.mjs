/** Ticket 427: exact recipe-time frames and full-frame readback timing, for Claude with browser access.
 * BASE=http://127.0.0.1:3146/stress.html node src/kit/tools/cdp-run.mjs src/lab/void-ult-review.mjs --width=1920 --height=1080 --dpr=1
 * Does not start a server or build the game. The 100-target CPU/GLB probe is void-ult-check.mjs.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const out = process.env.OUT || '/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/ult-void-3d-427';
const target = join(root, 'games/immortality-cultivation/art-src/concept/ult-void/ult-void-moment-b.v1-try1.png');
const magick = process.env.ART_MAGICK || '/opt/homebrew/bin/magick';
const font = '/System/Library/Fonts/Supplemental/Arial.ttf';
const percentile = (a, p) => a.length ? a.toSorted((x, y) => x - y)[Math.ceil(a.length * p) - 1] : null;

export default async function (page) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'ABOUT.md'), 'purpose: Phiếu 427: tinh thể GLB, góc trên/sau lưng lúc trúng và lúc trói; thời gian khung trên cảnh stress 100 quái\nmade-by: Kịch bản Codex src/lab/void-ult-review.mjs, chạy bởi Claude\ndoc: /Volumes/SS990TPRO/htdocs/typing-game/docs/codex-queue/427-report.md\ndelete-when: Sau khi owner duyệt và không còn cần đối chiếu\n');
  const url = new URL(process.env.BASE || 'http://127.0.0.1:3146/stress.html');
  for (const [k, v] of Object.entries({ fixed: '1', ui: '0', dpr: '1', herd: 'march' })) url.searchParams.set(k, v);
  for (const k of ['auto', 'ultVoid']) url.searchParams.delete(k);
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
  if (!await evaluate('typeof window.__lab.voidUlt === "function"')) throw new Error('Host chưa phục vụ mã Hư Không');
  await evaluate('window.__lab.voidUlt("layered"); true');
  await waitFor('window.__lab.voidUlt().ready', 'Atlas PNG/GLB Hư Không chưa tải/upload xong');
  const restart = view => evaluate(`window.__lab.reset(); window.__lab.setHerd('march'); window.__lab.viewMode(${JSON.stringify(view)}); window.__lab.step(45); window.__lab.showcase('ult-void'); window.__lab.voidUlt().last`);
  // The host may slow or stop world time: count the recipe's clock, not wall-time frames.
  const seek = async time => {
    const state = await evaluate(`(() => {
      let r = window.__lab.voidUlt().last;
      if (!Number.isFinite(r?.clock)) throw new Error('Host chưa phục vụ clock của phiếu 408');
      for (let i = 0; i < 1200 && r.clock < ${time} - 1e-8; i++) {
        window.__lab.step(1, Math.min(1 / 60, ${time} - r.clock));
        r = window.__lab.voidUlt().last;
      }
      return r;
    })()`);
    if (Math.abs(state.clock - time) > 1e-7) throw new Error(`Không tới đúng mốc ${time}: ${state.clock}`);
    return state;
  };
  // Compile the cloned body programs and traverse all phases before collecting a frame measurement.
  const warm = await restart('top');
  if (!Number.isFinite(warm?.clock)) throw new Error('Cổng BASE đang phục vụ Hư Không trước phiếu 408');
  await evaluate('window.__lab.step(480); true');
  const result = { url: url.href, requestedViewport: [page.width, page.height], views: {},
    note: 'stress.html có 87 mục tiêu TargetField và 13 walker trang trí: cảnh 100 quái, trói tối đa 87; không phải 100 quái cùng trói. total là khung CPU+GPU chờ readPixels, không phải khoảng cách rAF.' };
  for (const view of ['top', 'behind']) {
    const cast = await restart(view);
    if (cast?.meshDraws !== 5 || cast?.bindDraws !== 3 || !(cast?.crystalInstances > 0)) throw new Error('Sai host hoặc chưa có tinh thể 3D phiếu 427');
    const population = await evaluate(`({ lab: Array.from({ length: 87 }, (_, i) => window.__lab.beast(i)).filter(f => f.alive).length, walkers: window.__stress.report().walkers.instances })`);
    if (population.lab + population.walkers !== 100) throw new Error('Cảnh stress không đủ 100 quái: ' + JSON.stringify(population));
    const shots = [], frames = [];
    for (const [name, time] of [['charge', 0.3], ['release', 0.6], ['wave-mid', 1.2], ['wave-full', 1.9],
      ['hold', Math.max(2.2, cast.firstBindAt + 1.5)], ['bind-end', cast.firstBindAt + 2.85],
      ['break', cast.firstBreakAt + 0.25], ['ground-fade', 6.3]]) {
      const state = await seek(time);
      const file = join(out, `427-${view}-${name}.png`); await page.shot(file); shots.push(file);
      frames.push({ name, requestedTime: time, recipeTime: state.clock, bound: state.bound, broken: state.broken,
        crystalInstances: state.crystalInstances, crystalTriangles: state.crystalTriangles });
    }
    const panel = (file, label) => ['-label', label, file];
    execFileSync(magick, ['montage', '-font', font, '-pointsize', '18', '-fill', '#e5eee5',
      ...shots.flatMap((file, i) => panel(file, `${frames[i].name} · ${frames[i].recipeTime.toFixed(3)} s`)),
      '-tile', '4x2', '-geometry', '480x320+4+4', '-background', '#111b17', join(out, `427-${view}-phases.jpg`)]);
    execFileSync(magick, ['montage', '-font', font, '-pointsize', '18', '-fill', '#e5eee5',
      ...panel(target, 'Target · moment-b'), ...panel(shots[3], 'Wave · 1.900 s'), ...panel(shots[4], `Hold · ${frames[4].recipeTime.toFixed(3)} s`),
      '-tile', '3x1', '-geometry', '640x427+8+8', '-background', '#111b17', join(out, `427-${view}-reference.jpg`)]);
    execFileSync(magick, ['montage', '-font', font, '-pointsize', '18', '-fill', '#e5eee5', ...panel(target, 'Target · moment-b'),
      ...shots.slice(1, 4).flatMap((file, i) => panel(file, `Wave · ${frames[i + 1].recipeTime.toFixed(3)} s`)),
      '-tile', '2x2', '-geometry', '960x640+8+8', '-background', '#111b17', join(out, `427-${view}-impact-window.jpg`)]);
    await restart(view);
    const rows = await evaluate(`(() => {
      const rows = [];
      for (let i = 0; i < 440; i++) {
        const p = window.__lab.perf(1), r = window.__lab.voidUlt().last;
        rows.push({ cpu: p.cpu[0], total: p.total[0], draws: p.drawCalls, triangles: p.triangles,
          crystalInstances: r.crystalInstances, crystalTriangles: r.crystalTriangles, clock: r.clock, bound: r.bound, broken: r.broken,
          tinted: r.activeTints, gpu: p.gpu, active: r.activeTints > 0 && r.clock >= 1.9 && r.clock < r.firstBreakAt - 0.05 });
      }
      return rows;
    })()`);
    const holding = rows.filter(r => r.active);
    if (holding.length < 30) throw new Error('Thiếu mẫu lúc trói: ' + holding.length);
    const last = await evaluate('window.__lab.voidUlt().last');
    const p95 = percentile(holding.map(r => r.total), 0.95);
    result.views[view] = { cast, last, population, rows, frames, submittedFrames: shots.map(f => f.split('/').at(-1)),
      cpuFrameP95Ms: percentile(holding.map(r => r.cpu), 0.95),
      frameP95WithReadbackMs: p95, holdSamples: holding.length, passes16_7ms: p95 <= 16.7,
      peakTotalSubmittedTriangles: Math.max(...rows.map(r => r.triangles)), peakCrystalTriangles: Math.max(...rows.map(r => r.crystalTriangles)),
      maxDrawCalls: Math.max(...rows.map(r => r.draws)), actualBound: last.bound, actualTinted: last.tintedFoes,
      scene100Foes: population.lab + population.walkers === 100 };
    // Warm pools were filled above. Record GPU resource counts after each cleared/recast recipe.
    const memory = [];
    for (let k = 0; k < 5; k++) { await restart(view); await seek(2.2); memory.push(await evaluate('window.__lab.memory().gl')); }
    result.views[view].recastMemory = memory;
    result.views[view].stableGpuResources = memory.every(m => m.textures === memory[0].textures && m.geometries === memory[0].geometries);
  }
  result.console = page.logs ?? [];
  result.exceptions = page.exceptions ?? [];
  result.passed = Object.values(result.views).every(v => v.scene100Foes && v.passes16_7ms && v.stableGpuResources)
    && result.exceptions.length === 0 && !result.console.some(line => line.startsWith('error:'));
  writeFileSync(join(out, '427-measure.json'), JSON.stringify(result, null, 2) + '\n');
  execFileSync(process.execPath, [join(root, 'scripts/review-index.mjs')], { cwd: root, stdio: 'inherit' });
  if (!result.passed) throw new Error('Chưa đạt cổng đo/GPU: xem 427-measure.json');
  return { out, top: result.views.top.last, behind: result.views.behind.last };
}
