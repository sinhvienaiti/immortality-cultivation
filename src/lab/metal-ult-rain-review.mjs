/** Ticket 433d: Claude's 55-degree/Alt+1 and Alt+2 captures, 4 s clip and GPU gate.
 * Requires the existing worktree host. Does not start servers, builds or game suites.
 * METRICS_ONLY=1 writes nothing; CLIP=0 skips video. Alternate views use ultCam=0. */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const review = '/Volumes/SS990TPRO/htdocs/typing-game-review';
const out = process.env.OUT || `${review}/owner-review/2026-11-17/tu-tien/metal-ult-rain-433d`;
const metricsOnly = process.env.METRICS_ONLY === '1';
const p95 = rows => rows.length ? rows.toSorted((a, b) => a - b)[Math.ceil(rows.length * 0.95) - 1] : null;
const magick = process.env.ART_MAGICK || '/opt/homebrew/bin/magick';
const font = '/System/Library/Fonts/Supplemental/Arial.ttf';
const times = [0.4, 1.2, 2.4, 3.2];
const about = purpose => `purpose: ${purpose}\nmade-by: Codex viết kịch bản; Claude chạy kiểm hình và GPU\ndoc: /Volumes/SS990TPRO/htdocs/typing-game/docs/codex-queue/433d-report.md\ndelete-when: Sau khi owner duyệt và không còn cần đối chiếu\n`;

export default async function(page) {
  const views = (process.env.VIEWS || 'top,behind').split(',');
  if (views.some(v => !['top', 'behind', 'behind25', 'side'].includes(v))) throw new Error('Góc không thuộc camera-modes.ts');
  if (!metricsOnly) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'ABOUT.md'), about('Phiếu 433d: trận pháp và kiếm 3D, góc chơi/Alt+1 và sau lưng/Alt+2, clip 4 giây, stress 100 quái'));
  }
  const base = new URL(process.env.BASE || 'http://127.0.0.1:3146/stress.html');
  for (const [k, v] of Object.entries({ fixed: '1', ui: '0', dpr: String(page.dpr || 1), herd: 'march' })) base.searchParams.set(k, v);
  for (const key of ['auto', 'ultMetal', 'metalUlt']) base.searchParams.delete(key);
  const evaluate = async expression => {
    const result = await page.eval(expression);
    if (result?.evalError) throw new Error(result.evalError);
    return result;
  };
  const waitFor = async (expression, label) => {
    for (let i = 0; i < 240; i++) { if (await evaluate(expression)) return; await page.sleep(250); }
    throw new Error(label);
  };
  const restart = view => evaluate(`(() => {
    window.__lab.reset(); window.__lab.setHerd('march'); window.__lab.viewMode('top'); window.__lab.step(45);
    const population = { targets: Array.from({ length: 87 }, (_, i) => window.__lab.beast(i)).filter(f => f.alive).length,
      walkers: window.__stress.report().walkers.instances };
    const camera = window.__lab.captureCamera();
    window.__lab.showcase('ult-metal-geng'); window.__lab.step(1, 0);
    window.__lab.viewMode(${JSON.stringify(view)});
    return { report: window.__lab.metalUlt().last, population, camera };
  })()`);
  const seek = time => evaluate(`(() => {
    let r = window.__lab.metalUlt().last;
    for (let i = 0; i < 1600 && r.clock < ${time} - 1e-8; i++) {
      window.__lab.step(1, Math.min(1 / 60, ${time} - r.clock)); r = window.__lab.metalUlt().last;
    }
    if (Math.abs(r.clock - ${time}) > 1e-7) throw new Error('Không tới đúng giờ: ' + r.clock);
    return r;
  })()`);
  const result = { base: base.href, viewport: [page.width, page.height], views: {},
    note: 'top là camera chơi 55° (Alt+1), behind là sau lưng (Alt+2). Góc phụ tắt camera đẩy vào để host đổi góc được; hình học không đổi. 100 quái = 87 TargetField + 13 walker. total gồm CPU và chờ GPU qua readPixels; không phải nhịp rAF. Clip là 96 khung mô phỏng/24 fps, không thu âm. Chưa chấm hình/âm.' };
  for (const view of views) {
    const url = new URL(base);
    if (view !== 'top') url.searchParams.set('ultCam', '0');
    await page.goto(url.href, { settle: 1500 });
    await waitFor('window.__lab?.ready && window.__stress?.ready', 'Lab hoặc stress chưa sẵn sàng');
    await evaluate('window.__lab.metalUlt("layered"); true');
    await waitFor('window.__lab.metalUlt().ready', 'Ảnh/GLB Kim chưa nạp xong');
    const warm = await restart('top');
    if (warm.report?.mode !== 'rain' || warm.report?.rain?.sealHeightM !== 8 || !warm.report?.rain?.worldGeometry?.fixedAnchor)
      throw new Error('BASE chưa phục vụ phiếu 433d');
    await seek(4);
    const cast = await restart(view);
    if (cast.population.targets + cast.population.walkers !== 100) throw new Error('Cảnh không đủ 100 quái: ' + JSON.stringify(cast.population));
    const frames = [], shots = [];
    for (const time of times) {
      const state = await seek(time), file = join(out, `433d-${view}-${time.toFixed(1)}s.png`);
      if (state.swordLoadError || !state.assetsReady) throw new Error('Lỗi tài nguyên Kim: ' + JSON.stringify(state));
      if (view === 'top' && (!state.rain.sealScreen.inside || !state.rain.sealScreen.clearOfCaption
        || !state.rain.raysScreen.inside || !state.rain.casterScreen.inside)) throw new Error('Trận/tia rủ/người chơi vượt khung: ' + JSON.stringify(state.rain));
      if (!metricsOnly) { await page.shot(file); shots.push(file); }
      frames.push({ requested: time, report: state, camera: await evaluate('window.__lab.captureCamera()') });
    }
    if (!metricsOnly) execFileSync(magick, ['montage', '-font', font, '-pointsize', '18', '-fill', '#e5eee5',
      ...shots.flatMap((file, i) => ['-label', `${view} · ${times[i].toFixed(1)} s`, file]),
      '-tile', '2x2', '-geometry', '1280x720+4+4', '-background', '#111b17', join(out, `433d-${view}-phases.jpg`)]);
    await seek(4);
    if (view !== 'top') { result.views[view] = { cast, frames, last: await evaluate('window.__lab.metalUlt().last') }; continue; }
    await restart(view);
    const measured = await evaluate(`(() => {
      const rows = [];
      for (let i = 0; i < 1600; i++) {
        const p = window.__lab.perf(1), r = window.__lab.metalUlt().last;
        rows.push({ clock: r.clock, cpu: p.cpu[0], total: p.total[0], draws: p.drawCalls, triangles: p.triangles,
          swords: r.swordInstances, swordTriangles: r.swordTriangles, falling: r.rain.fallingSwords, gpu: p.gpu,
          camera: { ...r.cameraPunch }, seal: { ...r.rain.sealScreen }, rays: { ...r.rain.raysScreen } });
        if (r.clock >= 4) break;
      }
      return { rows, last: window.__lab.metalUlt().last, active: window.__lab.metalUlt().active };
    })()`);
    if (measured.last.clock !== 4 || measured.active || measured.last.rain.returned !== 49) throw new Error('Kho kiếm không sạch ở 4 s');
    const live = measured.rows.filter(r => r.clock >= 0.6 && r.clock < 4), falling = measured.rows.filter(r => r.clock >= 0.8 && r.clock <= 2);
    if (live.length < 100 || falling.length < 60) throw new Error('Thiếu mẫu');
    if (falling.some(r => r.falling < 4)) throw new Error('Thiếu ít nhất 4 kiếm GLB đang rơi ở 0,8–2,0 giây');
    const frameP95 = p95(live.map(r => r.total)), memory = [];
    for (let k = 0; k < 5; k++) {
      await restart(view); await seek(3.2); memory.push(await evaluate('window.__lab.memory().gl')); await seek(4);
    }
    const stable = memory.every(m => m.textures === memory[0].textures && m.geometries === memory[0].geometries);
    result.views[view] = { cast, frames, ...measured, cpuP95Ms: p95(live.map(r => r.cpu)), frameP95WithReadbackMs: frameP95,
      passes16_7ms: frameP95 !== null && frameP95 <= 16.7, recastMemory: memory, stableGpuResources: stable,
      minFalling: Math.min(...falling.map(r => r.falling)), maxSwordTriangles: Math.max(...measured.rows.map(r => r.swordTriangles)) };
    if (!metricsOnly && process.env.CLIP !== '0') {
      const topic = `${review}/captures/tu-tien/metal-ult-rain-433d`;
      mkdirSync(topic, { recursive: true }); writeFileSync(join(topic, 'ABOUT.md'), about('Khung tạm riêng cho clip 433d; prune sau khi mã hóa'));
      const raw = mkdtempSync(join(topic, 'frames-'));
      writeFileSync(join(raw, 'ABOUT.md'), about('96 khung của riêng lượt chạy này'));
      await restart('top');
      for (let i = 0; i < 96; i++) { await seek(i / 24); await page.shot(join(raw, `frame-${String(i).padStart(3, '0')}.png`)); }
      await seek(4);
      execFileSync(process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg', ['-y', '-v', 'error', '-framerate', '24', '-i', join(raw, 'frame-%03d.png'),
        '-frames:v', '96', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', join(out, '433d-top-4s.mp4')]);
      for (const flags of [[], ['--apply']]) execFileSync(process.execPath,
        [join(root, 'tools/capture-prune/prune.mjs'), raw, '--min-age-min', '0', ...flags], { cwd: root, stdio: 'inherit' });
    }
  }
  result.console = page.logs ?? []; result.exceptions = page.exceptions ?? [];
  if (!metricsOnly) {
    writeFileSync(join(out, '433d-measure.json'), JSON.stringify(result, null, 2) + '\n');
    execFileSync(process.execPath, [join(root, 'scripts/review-index.mjs')], { cwd: root, stdio: 'inherit' });
  } else console.log(JSON.stringify(result));
  if (result.views.top && (!result.views.top.passes16_7ms || !result.views.top.stableGpuResources)) throw new Error('Không đạt p95 ≤ 16,7 ms hoặc bộ nhớ GPU; xem 433d-measure.json');
  if (result.exceptions.length || result.console.some(s => /error:|metal-rain|failed to load/i.test(s))) throw new Error('Console hoặc tài nguyên có lỗi; xem 433d-measure.json');
  return { out, views: Object.fromEntries(Object.entries(result.views).map(([name, v]) => [name,
    { p95: v.frameP95WithReadbackMs, memory: v.stableGpuResources, returned: v.last.rain.returned }])) };
}
