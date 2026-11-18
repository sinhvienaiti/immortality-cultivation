/** 433f: existing localhost:3148 only; no builds, server starts or game suites. */
import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const repo = '/Volumes/SS990TPRO/htdocs/typing-game';
const review = '/Volumes/SS990TPRO/htdocs/typing-game-review';
const topic = `${review}/captures/tu-tien/metal-rain-433f`;
const owner = `${review}/owner-review/2026-11-17/tu-tien`;
const round = Number(process.env.ROUND || 1), final = process.env.FINAL === '1';
const magick = '/opt/homebrew/bin/magick', ffmpeg = '/opt/homebrew/bin/ffmpeg';
const about = purpose => `purpose: ${purpose}\nmade-by: Codex, phiếu 433f\ndoc: docs/codex-queue/433f-report.md\ndelete-when: Sau khi owner duyệt mưa kiếm Kim cao, rộng và lâu hơn\n`;
const p95 = xs => xs.toSorted((a, b) => a - b)[Math.ceil(xs.length * .95) - 1];
const white = file => {
  const p = execFileSync(magick, [file, '-alpha', 'off', '-depth', '8', 'rgb:-'], { maxBuffer: 32 * 1024 * 1024 });
  let n = 0; for (let i = 0; i < p.length; i += 3) if (Math.min(p[i], p[i+1], p[i+2]) >= 242) n++;
  return n / (p.length / 3) * 100;
};
export default async function(page) {
  if (round < 1 || round > 3) throw new Error('Tối đa ba vòng');
  mkdirSync(topic, { recursive: true });
  writeFileSync(join(topic, 'ABOUT.md'), about('Tấm xem 433f; giữ tấm ghép, prune khung thô của mỗi lượt'));
  const raw = mkdtempSync(join(topic, `round-${round}-`));
  writeFileSync(join(raw, 'ABOUT.md'), about('Khung thô riêng lượt 433f này; prune sau khi xem/mã hóa'));
  const ev = async expression => {
    const r = await page.eval(expression); if (r?.evalError) throw new Error(r.evalError); return r;
  };
  const ready = async expression => {
    for (let i=0; i<240; i++) { if (await ev(expression)) return; await page.sleep(250); }
    throw new Error('Lab/tài nguyên chưa sẵn sàng');
  };
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.WebSocket = class extends WebSocket { constructor(url, protocols) {
      super(url, protocols); if (protocols === 'vite-hmr') this.addEventListener('message', e => {
        try { if (['update','full-reload'].includes(JSON.parse(e.data).type)) e.stopImmediatePropagation(); } catch {}
      });
    }};` });
  const result = { round, final, raw, viewport: [page.width, page.height], views: {} };
  let cfg, capacity;
  const restart = view => ev(`(async () => {
    const l=window.__lab; l.reset(); l.setHerd('march'); l.viewMode('top'); l.step(45);
    await l.soundRecord(); l.showcase('ult-metal-geng'); l.step(1,0); l.viewMode(${JSON.stringify(view)});
    return { population: { targets: Array.from({length:87},(_,i)=>l.beast(i)).filter(f=>f.alive).length,
      walkers: window.__stress.report().walkers.instances }, state:l.metalUlt().last };
  })()`);
  const seek = t => ev(`(() => {
    const l=window.__lab; let r=l.metalUlt().last;
    for(let i=0;i<1600 && r.clock<${t}-1e-8;i++) { l.step(1,Math.min(1/60,${t}-r.clock)); r=l.metalUlt().last; }
    if(Math.abs(r.clock-${t})>1e-7) throw new Error('Sai thời gian '+r.clock); return r;
  })()`);
  const shots=[];
  for (const view of ['top','behind']) {
    const url=new URL('http://127.0.0.1:3148/stress.html');
    for(const [k,v] of Object.entries({fixed:'1',ui:'0',dpr:String(page.dpr),herd:'march',ground:'#353a40'})) url.searchParams.set(k,v);
    if(view==='behind') url.searchParams.set('ultCam','0');
    await page.goto(url.href,{settle:1200}); await ready('window.__lab?.ready && window.__stress?.ready');
    await ev('window.__lab.metalUlt("layered"); true'); await ready('window.__lab.metalUlt().ready');
    const module=await ev(`(async()=>{
      const src=await(await fetch('/src/lab/metal-ult-layered.ts')).text();
      const path=src.match(/from "([^\"]*metal-ult-rain[^\"]*)"/)[1];
      const m=await import(path); const s=await(await fetch(path)).text();
      const look=await import(s.match(/from "([^\"]*metal-sword-look[^\"]*)"/)[1]);
      window.__swordMeasure=look.measureSwordLook; window.__metalRainSnapshot=m.metalRainSnapshot; return {cfg:m.METAL_RAIN,capacity:m.METAL_RAIN_CAPACITY};
    })()`);
    cfg=module.cfg; capacity=module.capacity;
    await ev(`(()=>{const s=document.createElement('style');s.textContent='body *:not(canvas):not(:has(canvas)){visibility:hidden!important}';document.head.append(s);return true})()`);
    await restart('top'); await seek(cfg.end); const start=await restart(view);
    if(start.population.targets+start.population.walkers!==100) throw new Error('Cảnh không đủ 100 quái');
    const frames=[];
    for(const t of [cfg.waves[0]+0.45, (cfg.waves[0]+cfg.giantBirth)/2, cfg.waves.at(-1)+0.5, cfg.climax+1/60, cfg.climax+1]) {
      const state=await seek(t), file=join(raw,`${view}-${t.toFixed(2)}.png`);
      if(!state.assetsReady||state.swordLoadError) throw new Error('Lỗi tài nguyên');
      await page.shot(file); shots.push({file,view,t});
      frames.push({t,white: white(file),brightness:await ev('window.__swordMeasure()'),rain:state.rain,soundEvents:state.soundEvents});
    }
    result.views[view]={start,frames};
    await restart(view); const hierarchy=[];
    for(const t of [cfg.giantBirth+.1,cfg.giantBirth+.3,cfg.giantBirth+.5,cfg.climax+1/60]) {
      await seek(t); hierarchy.push({t,brightness:await ev('window.__swordMeasure()')});
    }
    result.views[view].hierarchy=hierarchy;
    if(view==='top') {
      await restart('top');
      result.fall=await ev(`(()=>{
        const l=window.__lab, samples=new Map();
        for(let i=0;i<500;i++) {
          l.step(1,1/60); const snap=window.__metalRainSnapshot();
          for(const s of snap.tips) {
            let row=samples.get(s.id);
            if(!row) {row={id:s.id,giant:s.giant,seconds:0,firstY:null,impactY:null,birth:s.birth,impact:s.impact};samples.set(s.id,row)}
            if(s.state===1 && snap.clock<s.impact && s.alpha>=.5 && s.x>=0 && s.x<=1 && s.y>=0 && s.y<=1 && Math.abs(s.depth)<=1) {
              row.seconds+=1/60; if(row.firstY===null)row.firstY=s.y;
            }
            if(row.impactY===null && snap.clock>=s.impact)row.impactY=s.impactY;
          }
          if(snap.clock>=${cfg.end})break;
        }
        return [...samples.values()].map(r=>({...r,travel:r.firstY===null||r.impactY===null?0:Math.abs(r.firstY-r.impactY)}));
      })()`);
      const small=result.fall, median=xs=>{const a=xs.toSorted((a,b)=>a-b);return (a[(a.length-1)>>1]+a[a.length>>1])/2};
      result.fallSummary={count:small.length,medianSeconds:median(small.map(s=>s.seconds)),minSeconds:Math.min(...small.map(s=>s.seconds)),
        medianTravel:median(small.map(s=>s.travel)),minTravel:Math.min(...small.map(s=>s.travel)),
        bothFraction:small.filter(s=>s.seconds>=.45-1e-8 && s.travel>=.18).length/small.length, giant:result.fall.find(s=>s.giant), smallCount:result.fall.filter(s=>!s.giant).length};
      await restart('top');
      const measured=await ev(`(()=>{
        const rows=[],l=window.__lab;
        for(let i=0;i<1600;i++) {
          const p=l.perf(1),r=l.metalUlt().last;
          rows.push({t:r.clock,cpu:p.cpu[0],total:p.total[0],draws:p.drawCalls,triangles:p.triangles,gpu:p.gpu,
            active:r.rain.activeSwords,falling:r.rain.fallingSwords,planted:r.rain.landingScreen.plantedWidthFraction,
            span:r.rain.landingScreen.widthFraction,margin:r.rain.sealScreen.topFraction,sealInside:r.rain.sealScreen.inside});
          if(r.clock>=${cfg.end}) break;
        }
        return {rows,last:l.metalUlt().last,active:l.metalUlt().active,takes:l.soundTakes()};
      })()`);
      const peak=Math.max(...measured.rows.map(r=>r.active));
      const dense=measured.rows.filter(r=>r.active>=peak*.8 && r.falling>0);
      const live=measured.rows.filter(r=>r.t>=cfg.waves[0] && r.t<cfg.end);
      const fall=measured.rows.filter(r=>r.t>=cfg.waves[0] && r.t<=cfg.climax);
      result.perf={samples:dense.length,p95:p95(dense.map(r=>r.total)),cpuP95:p95(dense.map(r=>r.cpu)),
        allP95:p95(live.map(r=>r.total)),maxLive:peak,maxPlantedWidth:Math.max(...fall.map(r=>r.planted)),
        plannedWidth:Math.max(...fall.map(r=>r.span)),minMargin:Math.min(...live.filter(r=>r.t<cfg.giantBirth).map(r=>r.margin)),
        sealInside:live.filter(r=>r.t<cfg.giantBirth).every(r=>r.sealInside),maxDraws:Math.max(...live.map(r=>r.draws)),maxTriangles:Math.max(...live.map(r=>r.triangles)),gpu:live[0].gpu,
        returned:measured.last.rain.returned,active:measured.active,finalRain:measured.last.rain,
        soundEvents:measured.last.soundEvents,metalTakes:measured.takes.filter(t=>t.url?.includes('metal')).map(t=>({at:t.at,url:t.url}))};
      if(final) {
        await restart('top'); const clipWhite=[];
        const clipFrames=Math.ceil(cfg.end*24)+1, clipDuration=clipFrames/24;
        for(let i=0;i<clipFrames;i++) {
          await seek(Math.min(cfg.end,i/24)); const f=join(raw,`frame-${String(i).padStart(3,'0')}.png`);
          await page.shot(f); clipWhite.push(white(f));
        }
        result.clipWhite=Math.max(...clipWhite);
        const takes=await ev('window.__lab.soundTakes()');
        const silent=join(raw,'silent.mp4'),wav=join(raw,'sound.wav');
        execFileSync(ffmpeg,['-y','-v','error','-framerate','24','-i',join(raw,'frame-%03d.png'),'-frames:v',String(clipFrames),
          '-c:v','libx264','-crf','18','-pix_fmt','yuv420p',silent]);
        execFileSync(join(repo,'games/.wt-ic-lab-all/node_modules/.bin/tsx'),[
          join(repo,'games/.wt-ic-lab-all/scripts/visual/mix-lab-sound.mjs'),'/dev/stdin',wav,
          '--duration='+clipDuration,'--offset=0','--root='+join(repo,'games/.wt-ic-lab-all')],
          {input:JSON.stringify(takes),env:{...process.env,PATH:'/opt/homebrew/bin:'+process.env.PATH},maxBuffer:4*1024*1024});
        execFileSync(ffmpeg,['-y','-v','error','-i',silent,'-i',wav,'-t',String(clipDuration),'-c:v','copy','-c:a','aac','-b:a','192k',
          '-movflags','+faststart',join(owner,'metal-rain-f.mp4')]);
        unlinkSync(silent); unlinkSync(wav);
        execFileSync(magick,['montage',...Array.from({length:14},(_,i)=>join(raw,`frame-${String(Math.min(clipFrames-1,i*12)).padStart(3,'0')}.png`)),
          '-tile','7x2','-geometry','640x360+3+3','-background','#171b20',join(topic,'motion-contact.jpg')]);
      }
    }
  }
  const sheet=join(topic,`round-${round}-sheet.jpg`);
  execFileSync(magick,['montage','-font','/System/Library/Fonts/Supplemental/Arial.ttf','-pointsize','24','-fill','#eee8db',
    ...shots.flatMap(s=>['-label',`${s.view==='top'?'Alt+1':'Alt+2'} · ${s.t.toFixed(2)} s`,s.file]),
    '-tile','5x2','-geometry','1280x720+4+4','-background','#171b20',sheet]);
  if(final) {
    execFileSync(magick,['(',join(repo,'games/immortality-cultivation/art-src/concept/ult-storyboards/ult-storyboard-samples-431.jpg'),
      '-crop','1536x1024+0+0','+repage','-resize','1280x',')','(',sheet,'-resize','6400x',')',
      '-background','#171b20','-gravity','center','+append','-quality','92',join(owner,'metal-rain-f.jpg')]);
    appendFileSync(join(owner,'ABOUT.md'),`\nmetal-rain-f: Phiếu 433f, vòng ${round}; trận A ${cfg.height} m / ${cfg.sealDiameter} m; ${cfg.perWave.join('/')} kiếm, mưa ${result.perf.finalRain.rainDurationS.toFixed(3)} s; p95 ${result.perf.p95.toFixed(2)} ms; ảnh Alt+1/Alt+2, clip dưới 7 giây có âm Kim sẵn có. Báo cáo docs/codex-queue/433f-report.md.\n`);
  }
  const allFrames=Object.values(result.views).flatMap(v=>v.frames), hierarchy=Object.values(result.views).flatMap(v=>v.hierarchy);
  result.summary={height:cfg.height,diameter:cfg.sealDiameter,widthPercent:result.perf.maxPlantedWidth*100,
    rainDuration:result.perf.finalRain.rainDurationS,waves:cfg.waves.length,small:capacity-1,total:capacity,
    maxLive:result.perf.maxLive,white:Math.max(result.clipWhite??0,...allFrames.map(f=>f.white)),p95:result.perf.p95,
    minGiantRatio:Math.min(...hierarchy.filter(f=>f.brightness?.small>0 && f.brightness?.giant>0).map(f=>f.brightness.ratio)),fall:result.fallSummary};
  result.sheet=sheet;
  result.soundTiming={first:result.perf.metalTakes[0]?.at,last:result.perf.metalTakes.at(-1)?.at,count:result.perf.metalTakes.length};
  delete result.perf.metalTakes; // Full sound events are already recorded by the lab; keep this report compact. result.logs=page.logs; result.exceptions=page.exceptions;
  console.log('VÒNG '+round+': '+JSON.stringify(result.summary));
  result.passed=result.summary.widthPercent>=55 && result.perf.minMargin>=.04 && result.perf.sealInside && result.summary.maxLive<=60
    && result.summary.p95<=16.7 && result.summary.white<=6 && result.summary.minGiantRatio>=1.5
    && result.fallSummary.medianSeconds>=.45 && result.fallSummary.medianTravel>=.18 && result.fallSummary.bothFraction>=.8
    && result.perf.returned===capacity && !result.perf.active && !page.exceptions.length;
  writeFileSync(join(repo,'docs/codex-queue/433f-report.md'), '# Phiếu 433f — số đo vòng '+round+'\n\n```json\n'+JSON.stringify(result,null,2)+'\n```\n');
  return {round,raw,sheet,summary:result.summary,passed:result.passed,perf:result.perf,exceptions:result.exceptions};
}
