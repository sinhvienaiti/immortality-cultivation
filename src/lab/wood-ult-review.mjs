/** Ticket 395b: exact recipe-time owner frames, only with browser and review-folder access.
 * BASE=http://127.0.0.1:3146/stress.html node src/kit/tools/cdp-run.mjs src/lab/wood-ult-review.mjs --width=1920 --height=1080 --dpr=1
 * Does not start a server or build the game. The 100-target CPU probe is wood-ult-check.mjs.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const out = process.env.OUT || '/Volumes/SS990TPRO/htdocs/typing-game-review/owner-review/2026-11-16/tu-tien/ult-wood';
const target = join(root, 'games/immortality-cultivation/art-src/concept/ult-wood/ult-wood-moment-b.v1-try1.png');
const magick = process.env.ART_MAGICK || '/opt/homebrew/bin/magick';
const font = '/System/Library/Fonts/Supplemental/Arial.ttf';
const percentile = (a, p) => a.length ? a.toSorted((x, y) => x - y)[Math.ceil(a.length * p) - 1] : null;

export default async function (page) {
  mkdirSync(out, { recursive: true });
  const url = new URL(process.env.BASE || 'http://127.0.0.1:3146/stress.html');
  for (const [k, v] of Object.entries({ fixed: '1', ui: '0', dpr: '1', herd: 'march' })) url.searchParams.set(k, v);
  for (const k of ['auto', 'ultWood']) url.searchParams.delete(k);
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
  if (!await evaluate('typeof window.__lab.woodUlt === "function"')) throw new Error('Host chưa phục vụ mã Mộc');
  await evaluate('window.__lab.woodUlt("layered"); true');
  await waitFor('window.__lab.woodUlt().ready', 'Hai PNG Mộc chưa tải/upload xong');
  const restart = view => evaluate(`window.__lab.reset(); window.__lab.setHerd('march'); window.__lab.viewMode(${JSON.stringify(view)}); window.__lab.step(45); window.__lab.showcase('ult-wood-primordial-tree'); window.__lab.woodUlt().last`);
  // The host may slow or stop world time: count the recipe's clock, not wall-time frames.
  const seek = async time => {
    const state = await evaluate(`(() => {
      let r = window.__lab.woodUlt().last;
      if (!Number.isFinite(r?.clock)) throw new Error('Host chưa phục vụ clock của phiếu 395b');
      for (let i = 0; i < 1200 && r.clock < ${time} - 1e-8; i++) {
        window.__lab.step(1, Math.min(1 / 60, ${time} - r.clock));
        r = window.__lab.woodUlt().last;
      }
      return r;
    })()`);
    if (Math.abs(state.clock - time) > 1e-7) throw new Error(`Không tới đúng mốc ${time}: ${state.clock}`);
    return state;
  };
  // Compile the cloned body programs and traverse all phases before collecting a frame measurement.
  const warm = await restart('top');
  if (!Number.isFinite(warm?.clock)) throw new Error('Cổng BASE đang phục vụ Mộc trước phiếu 395b');
  await evaluate('window.__lab.step(480); true');
  writeFileSync(join(out, 'ABOUT.md'), 'purpose: Phiếu 395b: so ảnh đích với mốc trúng 0,60/0,72/0,84 s và lúc trói; góc trên và sau lưng\nmade-by: Kịch bản Codex src/lab/wood-ult-review.mjs, phiếu 395b\ndoc: /Volumes/SS990TPRO/htdocs/typing-game/docs/codex-queue/395b-report.md\ndelete-when: Sau khi owner duyệt và không còn cần đối chiếu\n');
  const result = { url: url.href, requestedViewport: [page.width, page.height], views: {},
    note: 'stress.html có 87 mục tiêu TargetField và 13 walker trang trí; không gọi đây là benchmark GPU 100 quái cùng trói.' };
  for (const view of ['top', 'behind']) {
    const cast = await restart(view);
    if (cast?.meshDraws !== 10 || cast?.bindDraws !== 2) throw new Error('Sai host hoặc phiên bản công thức 395');
    const shots = [], frames = [];
    for (const [name, time] of [['charge', 0.3], ['impact-060', 0.6], ['impact-072', 0.72], ['impact-084', 0.84],
      ['hold', Math.max(2.2, cast.firstBindAt + 1.5)], ['bind-end', cast.firstBindAt + 2.85],
      ['break', cast.firstBreakAt + 0.25], ['ground-fade', 6.3]]) {
      const state = await seek(time);
      const file = join(out, `395-${view}-${name}.png`); await page.shot(file); shots.push(file);
      frames.push({ name, requestedTime: time, recipeTime: state.clock, bound: state.bound, broken: state.broken });
    }
    const panel = (file, label) => ['-label', label, file];
    execFileSync(magick, ['montage', '-font', font, '-pointsize', '18', '-fill', '#e5eee5',
      ...shots.flatMap((file, i) => panel(file, `${frames[i].name} · ${frames[i].recipeTime.toFixed(3)} s`)),
      '-tile', '4x2', '-geometry', '480x320+4+4', '-background', '#111b17', join(out, `395-${view}-phases.jpg`)]);
    execFileSync(magick, ['montage', '-font', font, '-pointsize', '18', '-fill', '#e5eee5',
      ...panel(target, 'Target · moment-b'), ...panel(shots[3], 'Impact · 0.840 s'), ...panel(shots[4], `Hold · ${frames[4].recipeTime.toFixed(3)} s`),
      '-tile', '3x1', '-geometry', '640x427+8+8', '-background', '#111b17', join(out, `395-${view}-reference.jpg`)]);
    execFileSync(magick, ['montage', '-font', font, '-pointsize', '18', '-fill', '#e5eee5', ...panel(target, 'Target · moment-b'),
      ...shots.slice(1, 4).flatMap((file, i) => panel(file, `Impact · ${frames[i + 1].recipeTime.toFixed(3)} s`)),
      '-tile', '2x2', '-geometry', '960x640+8+8', '-background', '#111b17', join(out, `395-${view}-impact-window.jpg`)]);
    await restart(view);
    const rows = await evaluate(`(() => {
      const rows = [];
      for (let i = 0; i < 440; i++) {
        const p = window.__lab.perf(1), r = window.__lab.woodUlt().last;
        rows.push({ cpu: p.cpu[0], total: p.total[0], draws: p.drawCalls, bound: r.bound, broken: r.broken,
          tinted: r.activeTints, gpu: p.gpu, active: r.activeTints > 0 });
      }
      return rows;
    })()`);
    const holding = rows.filter(r => r.active);
    const last = await evaluate('window.__lab.woodUlt().last');
    result.views[view] = { cast, last, rows, frames, submittedFrames: shots.map(f => f.split('/').at(-1)),
      cpuFrameP95Ms: percentile(holding.map(r => r.cpu), 0.95),
      frameP95WithReadbackMs: percentile(holding.map(r => r.total), 0.95),
      maxDrawCalls: Math.max(...rows.map(r => r.draws)), actualBound: last.bound, actualTinted: last.tintedFoes,
      passes100BoundFoes: last.bound >= 100 && last.tintedFoes >= 100 };
  }
  result.console = page.logs ?? [];
  result.exceptions = page.exceptions ?? [];
  writeFileSync(join(out, '395-measure.json'), JSON.stringify(result, null, 2) + '\n');
  execFileSync(process.execPath, [join(root, 'scripts/review-index.mjs')], { cwd: root, stdio: 'inherit' });
  return { out, top: result.views.top.last, behind: result.views.behind.last };
}
