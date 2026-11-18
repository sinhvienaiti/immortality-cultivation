/** 443b: three single-plane seals in the existing localhost:3148 host. No server/build/game suite. */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const review = '/Volumes/SS990TPRO/htdocs/typing-game-review';
const topic = `${review}/captures/tu-tien/sky-formation-443b`;
const owner = `${review}/owner-review/2026-11-17/tu-tien`;
const magick = process.env.ART_MAGICK || '/opt/homebrew/bin/magick';
const font = '/System/Library/Fonts/Supplemental/Arial.ttf';
const p95 = rows => rows.toSorted((a, b) => a - b)[Math.ceil(rows.length * 0.95) - 1];
const about = purpose => `purpose: ${purpose}\nmade-by: Codex, phiếu 443b\ndoc: docs/codex-queue/443b-report.md\ndelete-when: Sau khi owner chọn trận pháp một lớp và không còn cần đối chiếu\n`;
const artBounds = (pose, centre, diameter, width, height) => {
  const camera = new THREE.PerspectiveCamera(pose.fov, width / height, 0.1, 1000);
  camera.position.fromArray(pose.position); camera.quaternion.fromArray(pose.quaternion); camera.updateMatrixWorld(true);
  const point = new THREE.Vector3(), radius = diameter * 900 / 1024 / 2;
  const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (let i = 0; i < 1024; i++) {
    const a = i / 1024 * Math.PI * 2;
    point.set(centre.x + Math.cos(a) * radius, centre.y, centre.z + Math.sin(a) * radius).project(camera);
    const x = (1 + point.x) * width / 2, y = (1 - point.y) * height / 2;
    box.left = Math.min(box.left, x); box.right = Math.max(box.right, x);
    box.top = Math.min(box.top, y); box.bottom = Math.max(box.bottom, y);
  }
  return { ...box, widthFraction: (box.right - box.left) / width };
};

export default async function(page) {
  mkdirSync(topic, { recursive: true }); mkdirSync(owner, { recursive: true });
  writeFileSync(join(topic, 'ABOUT.md'), about('Ba trận pháp một lớp; tờ so sánh và số đo, chỉ xóa khung thô của phiếu này'));
  const raw = mkdtempSync(join(topic, 'frames-'));
  writeFileSync(join(raw, 'ABOUT.md'), about('Khung thô riêng của một lượt 443b; prune sau khi ghép và xem'));
  const result = { viewport: [page.width, page.height], raw, variants: {},
    method: 'Alt+1 top, Alt+2 behind; fixed step đúng 0,8/1,4 s, 100 quái, nền #353a40. p95 CPU + GPU readPixels ở 0,6–4 s sau một lượt làm nóng, cùng phương pháp phiếu 433d. Bounds bao mặt phẳng và bounds phần tranh (lề 6%).' };
  const ev = async expression => {
    const r = await page.eval(expression);
    if (r?.evalError) throw new Error(r.evalError);
    return r;
  };
  const ready = async expression => {
    for (let i = 0; i < 240; i++) { if (await ev(expression)) return; await page.sleep(250); }
    throw new Error('Lab hoặc tài nguyên chưa sẵn sàng');
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
  // Freeze this page against other workers' HMR; every navigation still loads current files.
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    performance.setResourceTimingBufferSize(5000);
    window.WebSocket = class extends WebSocket {
      constructor(url, protocols) { super(url, protocols); if (protocols === 'vite-hmr') this.addEventListener('message', e => {
        try { if (['update', 'full-reload'].includes(JSON.parse(e.data).type)) e.stopImmediatePropagation(); } catch {}
      }); }
    };` });
  const allTiles = [];
  for (const variant of (process.env.VARIANTS || 'a,b,c').split(',')) {
    if (!['a', 'b', 'c', 'default'].includes(variant)) throw new Error('Mẫu không hợp lệ');
    const frames = [], tiles = [], info = { frames, views: {} };
    for (const view of ['top', 'behind']) {
      const url = new URL('http://127.0.0.1:3148/stress.html');
      for (const [k, v] of Object.entries({ fixed: '1', ui: '0', dpr: String(page.dpr), herd: 'march', ground: '#353a40' })) url.searchParams.set(k, v);
      if (variant !== 'default') url.searchParams.set('formation', variant);
      if (view === 'behind') url.searchParams.set('ultCam', '0');
      await page.goto(url.href, { settle: 1200 });
      await ready('window.__lab?.ready && window.__stress?.ready');
      await ev('window.__lab.metalUlt("layered"); true'); await ready('window.__lab.metalUlt().ready');
      info.views[view] = { url: url.href };
      const loaded = await ev(`performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('/formation') && n.includes('.atlas.png'))`);
      const expected = variant === 'default' ? 'formation-topdown.atlas.png' : `formation-simple-${variant}.atlas.png`;
      if (!loaded.some(n => n.endsWith(expected))) throw new Error('Texture không đúng lựa chọn: ' + JSON.stringify(loaded));
      info.views[view].loadedFormation = loaded;
      await ev(`(() => { const s = document.createElement('style'); s.textContent = 'body *:not(canvas):not(:has(canvas)) { visibility:hidden!important; }'; document.head.append(s); return true; })()`);
      await restart('top'); await seek(4); await restart(view);
      const population = await ev(`({ targets: Array.from({ length: 87 }, (_, i) => window.__lab.beast(i)).filter(f => f.alive).length, walkers: window.__stress.report().walkers.instances })`);
      if (population.targets + population.walkers !== 100) throw new Error('Không đủ 100 quái');
      info.population = population;
      for (const time of [0.8, 1.4]) {
        const state = await seek(time), box = state.rain.sealScreen;
        if (state.swordLoadError || !state.assetsReady) throw new Error('Tài nguyên lỗi');
        const file = join(raw, `${variant}-${view}-${time.toFixed(1)}s.png`);
        await page.shot(file);
        const camera = await ev('window.__lab.captureCamera()');
        const art = artBounds(camera, state.rain.sealCentre, state.rain.sealDiameterM, page.width, page.height);
        frames.push({ view, time, bounds: box, widthFraction: (box.right - box.left) / box.width,
          rays: state.rain.raysScreen, centre: state.rain.sealCentre, geometry: state.rain.worldGeometry,
          diameterM: state.rain.sealDiameterM, artBounds: art, camera });
        tiles.push({ file, label: `${variant.toUpperCase()} | ${view === 'top' ? 'Alt+1' : 'Alt+2'} | ${time.toFixed(1)} s` });
      }
      if (view === 'top' && process.env.PROBE !== '1') {
        await seek(4); await restart('top');
        const measured = await ev(`(() => { const rows = []; let gpu = '';
          for (let i = 0; i < 1600; i++) {
            const p = window.__lab.perf(1), r = window.__lab.metalUlt().last; gpu = p.gpu;
            rows.push({ clock: r.clock, cpu: p.cpu[0], total: p.total[0], draws: p.drawCalls, triangles: p.triangles });
            if (r.clock >= 4) break;
          }
          return { rows, gpu, active: window.__lab.metalUlt().active, last: window.__lab.metalUlt().last };
        })()`);
        const live = measured.rows.filter(r => r.clock >= 0.6 && r.clock < 4);
        if (live.length < 100 || /SwiftShader|llvmpipe/i.test(measured.gpu)) throw new Error('Thiếu mẫu hoặc GPU phần mềm');
        if (measured.active || measured.last.rain.returned !== 49) throw new Error('Kho kiếm chưa sạch');
        info.perf = { gpu: measured.gpu, samples: live.length, cpuP95Ms: p95(live.map(r => r.cpu)),
          frameP95Ms: p95(live.map(r => r.total)), rows: measured.rows };
      }
    }
    const source = variant === 'default'
      ? join(root, 'games/.wt-ic-lab-all/art-src/lab/vfx/metal-ult/formation-topdown.atlas.png')
      : join(root, `games/immortality-cultivation/art-src/concept/ult-metal/sky-formation/sky-formation-simple-${variant}.v1-try1.png`);
    const sourceTile = join(raw, `${variant}-source.png`);
    execFileSync(magick, [source, '-resize', '360x360', '-background', '#101418', '-gravity', 'center', '-extent', '640x360', sourceTile]);
    allTiles.push({ file: sourceTile, label: `${variant.toUpperCase()} | ${variant === 'a' ? 'Radial swords' : variant === 'b' ? 'Bagua' : variant === 'c' ? 'Lotus' : 'Original texture'}` }, ...tiles);
    result.variants[variant] = info;
  }
  if (page.exceptions.length || page.logs.some(s => /^error:|\[metal-rain\]/i.test(s))) throw new Error('Console hoặc tài nguyên trận pháp lỗi');
  if (process.env.FINAL === '1') for (const [variant, info] of Object.entries(result.variants)) {
    if (!Number.isFinite(info.perf?.frameP95Ms) || info.perf.frameP95Ms > 16.7) throw new Error('p95 vượt ngưỡng: ' + variant);
    for (const frame of info.frames) {
      const b = frame.artBounds;
      if (variant !== 'default' && (b.left < 0 || b.right > page.width || b.top <= 0 || b.bottom > page.height)) throw new Error('Ảnh trận vượt khung: ' + variant + '/' + frame.view);
      if (variant !== 'default' && frame.view === 'top' && (b.widthFraction < 0.35 || b.widthFraction > 0.5)) throw new Error('Đường kính ngoài 35–50%: ' + variant);
      if (frame.geometry.sealNormalY !== -1 || !frame.geometry.fixedAnchor) throw new Error('Mặt phẳng không nằm ngang hoặc đổi neo');
    }
  }
  const sheet = process.env.FINAL === '1' ? join(owner, 'sky-formation-443b.jpg') : join(topic, 'sky-formation-probe.jpg');
  execFileSync(magick, ['montage', '-font', font, '-pointsize', '20', '-fill', '#eee8db',
    ...allTiles.flatMap(t => ['-label', t.label, t.file]), '-tile', '5x', '-geometry', '640x360+5+5', '-background', '#101418', '-quality', '94', sheet]);
  result.sheet = sheet; result.console = page.logs; result.exceptions = page.exceptions;
  writeFileSync(join(topic, process.env.FINAL === '1' ? 'measure.json' : 'probe.json'), JSON.stringify(result, null, 2) + '\n');
  if (process.env.FINAL === '1' && !readFileSync(join(owner, 'ABOUT.md'), 'utf8').includes('sky-formation-443b.jpg:')) appendFileSync(join(owner, 'ABOUT.md'), '\nsky-formation-443b.jpg: Phiếu 443b, A kiếm hướng tâm / B bát quái / C sen; mỗi hàng ảnh thẳng trên và Alt+1/Alt+2 ở 0,8/1,4 s, nền #353a40; mặc định giữ trận cũ. Số đo và báo cáo: docs/codex-queue/443b-report.md.\n');
  return { raw, sheet, variants: Object.fromEntries(Object.entries(result.variants).map(([k, v]) => [k,
    { frames: v.frames.map(f => ({ view: f.view, time: f.time, width: f.widthFraction, top: f.bounds.top, inside: f.bounds.inside })), p95: v.perf?.frameP95Ms, gpu: v.perf?.gpu }])), exceptions: result.exceptions };
}
