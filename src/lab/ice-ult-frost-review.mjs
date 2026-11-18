/** Ticket 390: owner captures and a synchronized frame/rAF probe; run only with browser/review access. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const out = '/Volumes/SS990TPRO/htdocs/typing-game-review/owner-review/2026-11-16/tu-tien/ult-ice-v3/frost-motion';
const target = join(root, 'games/immortality-cultivation/art-src/concept/ult-ice/ult-ice-moment-a.v1-try1.png');
const magick = process.env.ART_MAGICK || '/opt/homebrew/bin/magick';
const font = '/System/Library/Fonts/Supplemental/Arial.ttf';
const percentile = (a, p) => a.length ? [...a].sort((x, y) => x - y)[Math.ceil(a.length * p) - 1] : null;

export default async function (page) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'ABOUT.md'), 'purpose: Kiểm hình trói băng chuyển động, góc trên và sau lưng, cùng chi phí stress\nmade-by: Codex, phiếu 390\ndoc: /Volumes/SS990TPRO/htdocs/typing-game/docs/codex-queue/390-report.md\ndelete-when: Sau khi owner duyệt và không còn cần đối chiếu\n');
  const url = new URL(process.env.BASE || 'http://127.0.0.1:3146/stress.html');
  for (const [k, v] of Object.entries({ fixed: '1', ui: '0', dpr: '1', herd: 'march' })) url.searchParams.set(k, v);
  for (const k of ['auto', 'iceVersion', 'ultIce']) url.searchParams.delete(k);
  await page.goto(url.href, { settle: 1500 });
  const evaluate = async expression => {
    const value = await page.eval(expression);
    if (value?.evalError) throw new Error(value.evalError);
    return value;
  };
  const waitFor = async (expression, message) => {
    for (let i = 0; i < 240; i++) {
      if (await evaluate(expression)) return;
      await page.sleep(250);
    }
    throw new Error(message);
  };
  await waitFor('!!(window.__lab?.ready && window.__stress?.ready && window.__opt?.scene)', 'Lab/stress chưa sẵn sàng');
  await evaluate('window.__lab.iceUlt("layered"); window.__lab.showcase("ult-ice-cold-silence"); true');
  await waitFor('window.__lab.iceUlt().last?.assetsReady === true', 'Bộ ảnh băng chưa tải xong');
  // Warm every phase, including the cloned body programs, before either timing pass.
  await evaluate('window.__lab.step(480); true');
  const restart = view => evaluate(`window.__lab.reset(); window.__lab.setHerd('march'); window.__lab.viewMode(${JSON.stringify(view)}); window.__lab.step(45); window.__lab.showcase('ult-ice-cold-silence'); window.__lab.iceUlt().last`);
  const result = { url: url.href, requestedViewport: [page.width, page.height],
    note: 'stress.html hiện có 87 mục tiêu và 13 walker trang trí. Không tự nhận đạt 100 quái cùng trói.', views: {} };
  for (const view of ['top', 'behind']) {
    const cast = await restart(view);
    if (cast?.bindDraws !== 3) throw new Error('Host không phục vụ bản 390; kiểm đúng worktree trước khi chụp');
    let frame = 0;
    const shots = [];
    for (const [name, time] of [['bind-start', cast.firstFreezeAt + 0.12], ['bind-middle', cast.firstFreezeAt + 1.5],
      ['bind-end', cast.firstFreezeAt + 2.85], ['release', cast.firstShatterAt + 0.25], ['dust-end', cast.lastShatterAt + 0.9]]) {
      const next = Math.ceil(time * 60);
      await evaluate(`window.__lab.step(${next - frame}); true`); frame = next;
      const file = join(out, `${view}-${name}.png`);
      await page.shot(file); shots.push(file);
    }
    execFileSync(magick, ['montage', ...shots, '-font', font, '-tile', '3x2', '-geometry', '640x360+4+4', '-background', '#111822', join(out, `${view}-phases.jpg`)]);
    execFileSync(magick, ['montage', target, shots[1], '-font', font, '-tile', '2x1', '-geometry', '960x640+8+8', '-background', '#111822', join(out, `${view}-reference.jpg`)]);

    await restart(view);
    const frames = await evaluate(`(() => {
      const rows = [];
      for (let i = 0; i < 420; i++) {
        const p = window.__lab.perf(1), r = window.__lab.iceUlt().last;
        rows.push({ cpu: p.cpu[0], total: p.total[0], draws: p.drawCalls, gpu: p.gpu, frozen: r.frozen, shattered: r.shattered, active: r.frozen > r.shattered });
      }
      return rows;
    })()`);
    if (!Array.isArray(frames) || frames.length !== 420) throw new Error('Thiếu số đo khung');
    await restart(view);
    const raf = await evaluate(`new Promise(resolve => {
      const rows = []; let last = null;
      function step(stamp) {
        const p = window.__lab.perf(1), r = window.__lab.iceUlt().last;
        if (last !== null) rows.push({ interval: stamp - last, total: p.total[0], active: r.frozen > r.shattered });
        last = stamp;
        if (rows.length >= 360) resolve(rows); else requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    })`);
    const active = frames.filter(f => f.active), activeRaf = raf.filter(f => f.active);
    const last = await evaluate('window.__lab.iceUlt().last');
    const workP95 = percentile(active.map(f => f.total), 0.95);
    const rafP95 = percentile(activeRaf.map(f => f.interval), 0.95);
    result.views[view] = { shots, last, stress: await evaluate('window.__stress.report()'),
      pipeline: await evaluate('window.__lab.pipeline()'), gpu: frames[0]?.gpu,
      frameP95WithReadbackMs: workP95, cpuP95Ms: percentile(active.map(f => f.cpu), 0.95), rafP95Ms: rafP95,
      passesExistingWorkload16_7: workP95 !== null && workP95 <= 16.7,
      passes100BoundFoes: last.frozen >= 100 && last.tintedFoes >= 100 && workP95 !== null && workP95 <= 16.7,
      activeFrames: active.length, activeRafFrames: activeRaf.length, frames, raf };
  }
  result.console = page.logs; result.exceptions = page.exceptions;
  writeFileSync(join(out, 'measure.json'), JSON.stringify(result, null, 2) + '\n');
  execFileSync(process.execPath, [join(root, 'scripts/review-index.mjs')], { cwd: root });
  return { out, views: Object.fromEntries(Object.entries(result.views).map(([view, r]) => [view,
    { frameP95WithReadbackMs: r.frameP95WithReadbackMs, rafP95Ms: r.rafP95Ms, frozen: r.last.frozen, tinted: r.last.tintedFoes,
      passes100BoundFoes: r.passes100BoundFoes }])), exceptions: result.exceptions };
}
