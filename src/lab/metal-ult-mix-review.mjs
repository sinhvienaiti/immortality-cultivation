/** 433e: existing localhost host only; deterministic captures and isolated blade luminance. */
import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const review = '/Volumes/SS990TPRO/htdocs/typing-game-review';
const topic = `${review}/captures/tu-tien/metal-sword-mix-433e`;
const owner = `${review}/owner-review/2026-11-17/tu-tien`;
const round = Number(process.env.ROUND || 1), final = process.env.FINAL === '1';
const times = [1.2, 2.4, 3.0];
const magick = process.env.ART_MAGICK || '/opt/homebrew/bin/magick';
const font = '/System/Library/Fonts/Supplemental/Arial.ttf';
const about = purpose => `purpose: ${purpose}\nmade-by: Codex, phiếu 433e\ndoc: docs/codex-queue/433e-report.md\ndelete-when: Sau khi owner duyệt kiếm Kim kết hợp\n`;
const p95 = rows => rows.toSorted((a, b) => a - b)[Math.ceil(rows.length * 0.95) - 1];
const pixels = file => execFileSync(magick, [file, '-alpha', 'off', '-depth', '8', 'rgb:-'], { maxBuffer: 32 * 1024 * 1024 });
const white = p => {
  let n = 0;
  for (let i = 0; i < p.length; i += 3) if (Math.min(p[i], p[i + 1], p[i + 2]) >= 242) n++;
  return n / (p.length / 3) * 100;
};

export default async function(page) {
  if (round < 1 || round > 3) throw new Error('Phiếu cho tối đa 3 vòng');
  mkdirSync(topic, { recursive: true }); mkdirSync(owner, { recursive: true });
  writeFileSync(join(topic, 'ABOUT.md'), about('Tấm xem các vòng 433e; khung thô riêng được prune sau khi xem và mã hóa'));
  const raw = mkdtempSync(join(topic, `round-${round}-`));
  writeFileSync(join(raw, 'ABOUT.md'), about('Khung thô của riêng lượt chụp 433e này'));
  const result = { round, final, viewport: [page.width, page.height], ground: '#353a40', views: {},
    method: 'Đỉnh Y tuyến tính Rec.709 từ render target GPU half-float trước bloom; chỉ vẽ kiếm trên nền đen, giữ nguyên camera và ánh sáng. Không lẫn phong cảnh, chữ số hoặc hậu kỳ theo thời gian. Trắng trên ảnh toàn cảnh khi cả RGB ≥242/255. 1,2 s chưa có kiếm lớn nên tỷ số không áp dụng. p95 theo __lab.perf, CPU + chờ GPU readPixels, 100 quái.' };
  const ev = async expression => {
    const r = await page.eval(expression);
    if (r?.evalError) throw new Error(r.evalError);
    return r;
  };
  const ready = async expression => {
    for (let i = 0; i < 240; i++) { if (await ev(expression)) return; await page.sleep(250); }
    throw new Error('Lab/tài nguyên chưa sẵn sàng');
  };
  const restart = view => ev(`(() => {
    window.__lab.reset(); window.__lab.setHerd('march'); window.__lab.viewMode('top'); window.__lab.step(45);
    window.__lab.showcase('ult-metal-geng'); window.__lab.step(1, 0); window.__lab.viewMode(${JSON.stringify(view)});
    return window.__lab.metalUlt().last;
  })()`);
  const seek = time => ev(`(() => {
    let r = window.__lab.metalUlt().last;
    for (let i = 0; i < 1600 && r.clock < ${time} - 1e-8; i++) {
      window.__lab.step(1, Math.min(1 / 60, ${time} - r.clock)); r = window.__lab.metalUlt().last;
    }
    if (Math.abs(r.clock - ${time}) > 1e-7) throw new Error('Sai thời gian ' + r.clock);
    return r;
  })()`);
  const shots = [];
  // A concurrent editor's HMR reload must not change a frozen capture halfway through its probes.
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.WebSocket = class extends WebSocket {
      constructor(url, protocols) {
        super(url, protocols);
        if (protocols === 'vite-hmr') this.addEventListener('message', e => {
          try { if (['update', 'full-reload'].includes(JSON.parse(e.data).type)) e.stopImmediatePropagation(); } catch {}
        });
      }
    };` });
  if (process.env.CHECK_LOOKS === '1') {
    const comparisons = [];
    for (const look of ['aura', 'energy']) {
      await page.goto(`http://127.0.0.1:3148/stress.html?fixed=1&ui=0&dpr=1&herd=march&ground=%23353a40&ultCam=0&swordLook=${look}`, { settle: 1200 });
      await ready('window.__lab?.ready && window.__stress?.ready');
      await ev('window.__lab.metalUlt("layered"); true'); await ready('window.__lab.metalUlt().ready');
      await restart('top'); await seek(4); await restart('behind'); await seek(2.4);
      const meshes = await ev('window.__lab.fxNamed().filter(m => m.name.startsWith("fx-metal-rain-sword"))');
      if (!meshes.some(m => m.name === `fx-metal-rain-sword-${look}`)
        || meshes.some(m => m.name === 'fx-metal-rain-swords') !== (look === 'aura')) throw new Error('Tham số so sánh sai: ' + look);
      const file = join(raw, `${look}.png`); await page.shot(file); comparisons.push({ look, meshes, file });
    }
    const contact = join(topic, 'look-parameter-contact.jpg');
    execFileSync(magick, ['montage', '-font', font, '-pointsize', '24', '-fill', '#eee8db',
      ...comparisons.flatMap(c => ['-label', `swordLook=${c.look} · Alt+2 · 2.4 s`, c.file]),
      '-tile', '2x1', '-geometry', '1280x720+4+4', '-background', '#171b20', contact]);
    return { comparisons, contact, exceptions: page.exceptions };
  }
  for (const view of ['top', 'behind']) {
    const url = new URL('http://127.0.0.1:3148/stress.html');
    for (const [k, v] of Object.entries({ fixed: '1', ui: '0', dpr: String(page.dpr), herd: 'march', ground: '#353a40' })) url.searchParams.set(k, v);
    if (view === 'behind') url.searchParams.set('ultCam', '0');
    await page.goto(url.href, { settle: 1200 });
    await ready('window.__lab?.ready && window.__stress?.ready');
    await ev('window.__lab.metalUlt("layered"); true'); await ready('window.__lab.metalUlt().ready');
    await ev(`(async () => {
      const source = await (await fetch('/src/lab/metal-ult-rain.ts')).text();
      const path = source.match(/from "([^\"]*metal-sword-look[^\"]*)"/)[1];
      const m = await import(path); window.__swordMeasure = m.measureSwordLook;
      if (!window.__swordMeasure) throw new Error('Không tìm thấy hàm đo'); return true;
    })()`);
    await ev(`(() => { const s = document.createElement('style'); s.textContent = 'body *:not(canvas):not(:has(canvas)) { visibility:hidden!important; }'; document.head.append(s); return true; })()`);
    await restart('top'); await seek(4); await restart(view);
    const population = await ev(`({ targets: Array.from({ length: 87 }, (_, i) => window.__lab.beast(i)).filter(f => f.alive).length, walkers: window.__stress.report().walkers.instances })`);
    if (population.targets + population.walkers !== 100) throw new Error('Không đủ 100 quái');
    const frames = [];
    for (const time of times) {
      const state = await seek(time), file = join(raw, `${view}-${time.toFixed(1)}.png`);
      if (state.swordLoadError || !state.assetsReady) throw new Error('Tài nguyên kiếm bị lỗi');
      await page.shot(file); shots.push({ file, view, time });
      const row = { time, whitePercent: white(pixels(file)), active: state.rain.activeSwords, camera: await ev('window.__lab.captureCamera()') };
      row.brightness = await ev('window.__swordMeasure()');
      if (row.brightness === null) throw new Error('Probe chưa có renderer/camera');
      frames.push(row);
      console.log(JSON.stringify({ round, view, time, whitePercent: row.whitePercent, brightness: row.brightness }));
    }
    result.views[view] = { population, frames };
    if (view === 'top' && final) {
      await seek(4); await restart('top');
      const measured = await ev(`(() => {
        const rows = [];
        for (let i = 0; i < 1600; i++) {
          const p = window.__lab.perf(1), r = window.__lab.metalUlt().last;
          rows.push({ clock: r.clock, cpu: p.cpu[0], total: p.total[0], draws: p.drawCalls, triangles: p.triangles, gpu: p.gpu });
          if (r.clock >= 4) break;
        }
        return { rows, returned: window.__lab.metalUlt().last.rain.returned, active: window.__lab.metalUlt().active };
      })()`);
      const live = measured.rows.filter(r => r.clock >= 0.6 && r.clock < 4);
      if (live.length < 100 || measured.active || measured.returned !== 49) throw new Error('Thiếu mẫu hoặc kiếm chưa trả kho');
      result.perf = { samples: live.length, p95Ms: p95(live.map(r => r.total)), cpuP95Ms: p95(live.map(r => r.cpu)),
        maxDraws: Math.max(...live.map(r => r.draws)), maxTriangles: Math.max(...live.map(r => r.triangles)), gpu: live[0].gpu, returned: measured.returned };
      await restart('top');
      const clipWhite = [];
      for (let i = 0; i < 96; i++) {
        await seek(i / 24); const file = join(raw, `frame-${String(i).padStart(3, '0')}.png`);
        await page.shot(file); clipWhite.push(white(pixels(file)));
      }
      await seek(4);
      result.clipWhiteMaxPercent = Math.max(...clipWhite);
      execFileSync('/opt/homebrew/bin/ffmpeg', ['-y', '-v', 'error', '-framerate', '24', '-i', join(raw, 'frame-%03d.png'), '-frames:v', '96',
        '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(owner, 'metal-sword-mix.mp4')]);
    }
  }
  const sheet = join(topic, `round-${round}-sheet.jpg`);
  execFileSync(magick, ['montage', '-font', font, '-pointsize', '24', '-fill', '#eee8db',
    ...shots.flatMap(s => ['-label', `${s.view === 'top' ? 'Alt+1' : 'Alt+2'} · ${s.time.toFixed(1)} s · mix`, s.file]),
    '-tile', '3x2', '-geometry', '1280x720+4+4', '-background', '#171b20', sheet]);
  if (final) {
    const storyboard = `${root}/games/immortality-cultivation/art-src/concept/ult-storyboards/ult-storyboard-samples-431.jpg`;
    execFileSync(magick, ['(', storyboard, '-crop', '1536x1024+0+0', '+repage', '-resize', '1300x', ')',
      '(', `${owner}/metal-sword-look-AB.jpg`, '-resize', '1300x', ')', '-background', '#171b20', '-gravity', 'center', '-append',
      '-resize', '1300x1540', '-extent', '1300x1540', '(', sheet, '-resize', '3900x1540', '-extent', '3900x1540', ')', '+append',
      '-quality', '92', join(owner, 'metal-sword-mix.jpg')]);
    appendFileSync(join(owner, 'ABOUT.md'), `\nmetal-sword-mix: Phiếu 433e, vòng ${round}; kiếm nhỏ energy, kiếm lớn Tripo + aura; Alt+1/Alt+2 ở 1,2/2,4/3,0 s, nền #353a40; clip 4 giây/24 fps không âm. Báo cáo docs/codex-queue/433e-report.md.\n`);
  }
  result.raw = raw; result.sheet = sheet; result.logs = page.logs; result.exceptions = page.exceptions;
  if (page.exceptions.length || page.logs.some(s => /^error:|\[metal-rain\]/i.test(s))) throw new Error('Console/tài nguyên kiếm mưa lỗi');
  const frames = Object.values(result.views).flatMap(v => v.frames);
  if (frames.some(f => f.whitePercent > 6 || (f.time >= 2.4 && f.brightness.ratio < 1.5)
    || (f.time === 1.2 && f.brightness.giant !== 0))) throw new Error('Không đạt phân cấp sáng hoặc vùng trắng');
  if (final && (result.perf.p95Ms > 16.7 || result.clipWhiteMaxPercent > 6)) throw new Error('Không đạt p95/vùng trắng clip');
  return result;
}
