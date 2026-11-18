/** 433l: existing localhost:3148 only; no builds, server starts or game suites. Seven owner faults, two cameras. */
import { mkdirSync, mkdtempSync, writeFileSync, unlinkSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const repo = '/Volumes/SS990TPRO/htdocs/typing-game';
const review = '/Volumes/SS990TPRO/htdocs/typing-game-review';
const topic = `${review}/captures/tu-tien/metal-rain-433l`;
const owner = `${review}/owner-review/2026-11-18/tu-tien`;
const round = Number(process.env.ROUND || 1), final = process.env.FINAL === '1';
const magick = '/opt/homebrew/bin/magick', ffmpeg = '/opt/homebrew/bin/ffmpeg';
const about = purpose => `purpose: ${purpose}\nmade-by: Claude (thay Codex), phiếu 433l\ndoc: docs/codex-queue/433l-report.md\ndelete-when: Sau khi owner duyệt 7 sửa của mưa kiếm Kim\n`;
const p95 = xs => xs.toSorted((a, b) => a - b)[Math.ceil(xs.length * .95) - 1];
const median = xs => { const a = xs.toSorted((a, b) => a - b); return (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2; };
const stats = xs => { const a = xs.toSorted((a, b) => a - b); return { n: a.length, min: a[0], median: a[Math.floor(a.length / 2)], max: a.at(-1) }; };
const white = file => {
  const p = execFileSync(magick, [file, '-alpha', 'off', '-depth', '8', 'rgb:-'], { maxBuffer: 32 * 1024 * 1024 });
  let n = 0; for (let i = 0; i < p.length; i += 3) if (Math.min(p[i], p[i+1], p[i+2]) >= 242) n++;
  return n / (p.length / 3) * 100;
};
export default async function(page) {
  if (round < 1 || round > 4) throw new Error('Tối đa bốn vòng');
  mkdirSync(topic, { recursive: true }); mkdirSync(owner, { recursive: true });
  writeFileSync(join(topic, 'ABOUT.md'), about('Tấm xem 433l; giữ tấm ghép và số đo, prune khung thô'));
  const raw = mkdtempSync(join(topic, `round-${round}-`));
  writeFileSync(join(raw, 'ABOUT.md'), about('Khung thô riêng lượt 433l; prune sau khi xem/mã hóa'));
  const ev = async expression => { const r = await page.eval(expression); if (r?.evalError) throw new Error(r.evalError); return r; };
  const ready = async expression => { for (let i=0;i<240;i++) { if (await ev(expression)) return; await page.sleep(250); } throw new Error('Lab chưa sẵn sàng'); };
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.WebSocket = class extends WebSocket { constructor(url, protocols) {
      super(url, protocols); if (protocols === 'vite-hmr') this.addEventListener('message', e => {
        try { if (['update','full-reload'].includes(JSON.parse(e.data).type)) e.stopImmediatePropagation(); } catch {}
      });
    }};` });
  const result = { round, final, views: {} };
  let cfg, capacity;
  const restart = view => ev(`(async () => {
    const l=window.__lab; l.reset(); l.setHerd('march'); l.viewMode('top'); l.step(45);
    await l.soundRecord(); l.showcase('ult-metal-geng'); l.step(1,0); l.viewMode(${JSON.stringify(view)});
    return { population: Array.from({length:87},(_,i)=>l.beast(i)).filter(f=>f.alive).length + window.__stress.report().walkers.instances };
  })()`);
  const seek = t => ev(`(() => {
    const l=window.__lab; let r=l.metalUlt().last;
    for(let i=0;i<1600 && r.clock<${t}-1e-8;i++) { l.step(1,Math.min(1/60,${t}-r.clock)); r=l.metalUlt().last; }
    return r;
  })()`);
  const shots = [];
  for (const view of ['top', 'behind']) {
    const url = new URL('http://127.0.0.1:3148/stress.html');
    for (const [k, v] of Object.entries({ fixed:'1', ui:'0', dpr:String(page.dpr), herd:'march', ground:'#353a40' })) url.searchParams.set(k, v);
    if (view === 'behind') url.searchParams.set('ultCam', '0');
    await page.goto(url.href, { settle: 1200 }); await ready('window.__lab?.ready && window.__stress?.ready');
    await ev('window.__lab.metalUlt("layered"); true'); await ready('window.__lab.metalUlt().ready');
    const module = await ev(`(async()=>{
      const src=await(await fetch('/src/lab/metal-ult-layered.ts')).text();
      const path=src.match(/from "([^\"]*metal-ult-rain[^\"]*)"/)[1];
      const m=await import(path); const s=await(await fetch(path)).text();
      const a=await import(s.match(/from "([^"]*metal-ult-energy-a[^"]*)"/)[1]);
      window.__energyA=a.energyASnapshot; window.__metalRainSnapshot=m.metalRainSnapshot; return {cfg:m.METAL_RAIN,capacity:m.METAL_RAIN_CAPACITY};
    })()`);
    cfg = module.cfg; capacity = module.capacity;
    await ev(`(()=>{const s=document.createElement('style');s.textContent='body *:not(canvas):not(:has(canvas)){visibility:hidden!important}';document.head.append(s);return true})()`);
    await restart('top'); await seek(cfg.end); const start = await restart(view);
    if (start.population !== 100) throw new Error('Cảnh không đủ 100 quái');
    const frames = [];
    const marks = [['đợt 1', cfg.waves[0] + .5], ['giữa mưa', 2.0], ['mưa dày nhất', 3.0], ['kiếm lớn chạm', cfg.climax + 1/60], ['bụi nổ', cfg.climax + .3], ['+1,5 s', cfg.climax + 1.5]];
    for (const [label, t] of marks) {
      const state = await seek(t), file = join(raw, `${view}-${t.toFixed(2)}.png`);
      if (!state.assetsReady || state.swordLoadError) throw new Error('Lỗi tài nguyên ' + state.swordLoadError);
      await page.shot(file); shots.push({ file, view, t, label });
      frames.push({ t, label, white: white(file), rain: state.rain, art: await ev('window.__energyA()') });
    }
    result.views[view] = { frames };
    // Whole-cast probe at 60 Hz: tips, contact radius, angles, counts and the formation box.
    await restart(view);
    const probe = await ev(`(()=>{
      const l=window.__lab, samples=new Map(), screen=[];
      for(let i=0;i<500;i++) {
        l.step(1,1/60); const snap=window.__metalRainSnapshot(), rain=l.metalUlt().last.rain, art=window.__energyA();
        screen.push({t:snap.clock,sealOpacity:rain.sealOpacity,seal:{...rain.sealScreen},planted:rain.plantedSwords,falling:rain.fallingSwords,active:rain.activeSwords,shake:rain.shakeM,
          small:art.rows.filter(r=>r.opacity>=.5&&[r.tipPx,r.hiltPx].every(p=>p[0]>=0&&p[0]<=1280&&p[1]>=0&&p[1]<=720)).map(r=>({v:r.verticalPx,h:r.heightPx,e:r.exposedVerticalPx,planted:r.fullyPlanted,buried:r.buriedFraction,facing:r.facingDot})),
          giant:art.giant});
        for(const s of snap.tips) {
          let row=samples.get(s.id);
          if(!row){row={id:s.id,giant:s.giant,seconds:0,firstY:null,impactY:null,contactR:0,fallDeg:0,axisDot:1};samples.set(s.id,row)}
          if(s.state===1&&snap.clock<s.impact&&s.x>=0&&s.x<=1&&s.y>=0&&s.y<=1&&Math.abs(s.depth)<=1){row.seconds+=1/60;if(row.firstY===null)row.firstY=s.y;}
          if(row.impactY===null&&snap.clock>=s.impact)row.impactY=s.impactY;
          if(s.state>=1){row.contactR=s.contactR;row.fallDeg=s.fallDeg;}
          if(s.state===2)row.axisDot=Math.min(row.axisDot,s.axisDot);
        }
        if(snap.clock>=${cfg.end})break;
      }
      return {screen,rows:[...samples.values()].map(r=>({...r,travel:r.firstY===null||r.impactY===null?0:Math.abs(r.firstY-r.impactY)}))};
    })()`);
    const small = probe.rows.filter(r => !r.giant), sc = probe.screen;
    const live = sc.filter(f => f.t >= .6 && f.t < cfg.giantBirth);
    const smallPx = sc.filter(f => f.t >= cfg.waves[0] && f.t <= cfg.climax).flatMap(f => f.small);
    const giantPx = sc.filter(f => f.giant.visible && f.giant.tipPx && [f.giant.tipPx, f.giant.hiltPx].every(p => p[0]>=0&&p[0]<=1280&&p[1]>=0&&p[1]<=720)).map(f => f.giant.verticalPx);
    result.views[view].measure = {
      smallVerticalPx: stats(smallPx.map(s => s.v)), smallAxialPx: stats(smallPx.map(s => s.h)), giantVerticalPx: stats(giantPx),
      sizeRatio: giantPx.length ? Math.min(...giantPx) / median(smallPx.map(s => s.v)) : null,
      sealMinMargin: Math.min(...live.filter(f => f.sealOpacity > .001).map(f => Math.min(f.seal.left/1280, 1-f.seal.right/1280, f.seal.top/720, 1-f.seal.bottom/720))),
      maxContactR: Math.max(...small.map(r => r.contactR)), maxFallDeg: Math.max(...small.map(r => r.fallDeg)),
      minPlantAxisDot: Math.min(...small.map(r => r.axisDot)),
      buried: stats(smallPx.filter(s => s.planted).map(s => s.buried)), maxPlanted: Math.max(...sc.map(f => f.planted ?? 0)),
      maxFalling: Math.max(...sc.map(f => f.falling)), maxActive: Math.max(...sc.map(f => f.active)),
      plantedWhenDensest: (() => { const peak = sc.reduce((a, f) => f.active > a.active ? f : a); return { t: peak.t, falling: peak.falling, planted: peak.planted, active: peak.active }; })(),
      maxShake: Math.max(...sc.map(f => f.shake ?? 0)),
      fall: { count: small.length, medianSeconds: median(small.map(s => s.seconds)), medianTravel: median(small.map(s => s.travel)),
        bothFraction: small.filter(s => s.seconds >= .45 - 1e-8 && s.travel >= .18).length / small.length },
    };
    if (view === 'top') {
      await restart('top');
      const rows = await ev(`(()=>{ const rows=[],l=window.__lab;
        for(let i=0;i<1600;i++){ const p=l.perf(1),r=l.metalUlt().last; rows.push({t:r.clock,total:p.total[0],draws:p.drawCalls,active:r.rain.activeSwords,falling:r.rain.fallingSwords}); if(r.clock>=${cfg.end})break; }
        return rows; })()`);
      const peak = Math.max(...rows.map(r => r.active)), dense = rows.filter(r => r.active >= peak * .8 && r.falling > 0);
      result.perf = { samples: dense.length, p95: p95(dense.map(r => r.total)), allP95: p95(rows.filter(r => r.t >= .6).map(r => r.total)), maxDraws: Math.max(...rows.map(r => r.draws)) };
      if (final) {
        await restart('top'); const clipWhite = [];
        const clipFrames = Math.ceil(cfg.end * 24) + 1, clipDuration = clipFrames / 24;
        for (let i = 0; i < clipFrames; i++) {
          await seek(Math.min(cfg.end, i / 24)); const f = join(raw, `frame-${String(i).padStart(3, '0')}.png`);
          await page.shot(f); clipWhite.push(white(f));
        }
        result.clipWhite = Math.max(...clipWhite);
        const takes = await ev('window.__lab.soundTakes()');
        const silent = join(raw, 'silent.mp4'), wav = join(raw, 'sound.wav');
        execFileSync(ffmpeg, ['-y','-v','error','-framerate','24','-i',join(raw,'frame-%03d.png'),'-frames:v',String(clipFrames),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p',silent]);
        execFileSync(join(repo,'games/.wt-ic-lab-all/node_modules/.bin/tsx'), [join(repo,'games/.wt-ic-lab-all/scripts/visual/mix-lab-sound.mjs'),'/dev/stdin',wav,
          '--duration='+clipDuration,'--offset=0','--root='+join(repo,'games/.wt-ic-lab-all')],
          { input: JSON.stringify(takes), env: { ...process.env, PATH: '/opt/homebrew/bin:' + process.env.PATH }, maxBuffer: 4*1024*1024 });
        execFileSync(ffmpeg, ['-y','-v','error','-i',silent,'-i',wav,'-t',String(clipDuration),'-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',join(owner,'metal-rain-l.mp4')]);
        unlinkSync(silent); unlinkSync(wav);
        result.clip = { frames: clipFrames, seconds: clipDuration, metalTakes: takes.filter(t => t.url?.includes('metal')).length };
      }
    }
  }
  const sheet = join(topic, `round-${round}-l-sheet.jpg`);
  execFileSync(magick, ['montage','-font','/System/Library/Fonts/Supplemental/Arial.ttf','-pointsize','24','-fill','#eee8db',
    ...shots.flatMap(s => ['-label', `${s.view === 'top' ? 'Alt+1' : 'Alt+2'} · ${s.label} · ${s.t.toFixed(2)} s`, s.file]),
    '-tile','6x2','-geometry','1280x720+4+4','-background','#171b20', sheet]);
  if (final) execFileSync(magick, [sheet, '-quality', '92', join(owner, 'metal-rain-l.jpg')]);
  result.white = Math.max(result.clipWhite ?? 0, ...Object.values(result.views).flatMap(v => v.frames.map(f => f.white)));
  result.sheet = sheet; result.raw = raw; result.exceptions = page.exceptions;
  writeFileSync(join(topic, `round-${round}-metrics.json`), JSON.stringify(result, null, 2) + '\n');
  const compact = { round, sheet, raw, white: result.white, perf: result.perf, clip: result.clip,
    top: result.views.top.measure, behind: result.views.behind.measure, exceptions: page.exceptions.length };
  console.log('433L: ' + JSON.stringify(compact));
  return compact;
}
