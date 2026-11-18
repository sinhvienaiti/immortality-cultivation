/** 454: existing lab host only, fixed-step two-camera captures, GPU readback timing and recorded audio. */
import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const repo='/Volumes/SS990TPRO/htdocs/typing-game', root=join(repo,'games/.wt-ic-lab-all');
const review='/Volumes/SS990TPRO/htdocs/typing-game-review';
const topic=join(review,'captures/tu-tien/star-ult-454t'), owner=join(review,'owner-review/2026-11-18/tu-tien');
const final=process.env.FINAL==='1', round=process.env.ROUND||'1', smoke=process.env.SMOKE==='1';
const magick='/opt/homebrew/bin/magick', ffmpeg='/opt/homebrew/bin/ffmpeg';
const about='purpose: Khung lab Tinh Tú phiếu 454, ảnh kiểm nút và số đo\nmade-by: Claude Opus (454t tune)\ndoc: docs/codex-queue/454t-report.md\ndelete-when: Sau khi owner duyệt và thay hai ảnh tĩnh bằng video\n';
const p95=xs=>xs.toSorted((a,b)=>a-b)[Math.ceil(xs.length*.95)-1];
const white=file=>{const p=execFileSync(magick,[file,'-alpha','off','-depth','8','rgb:-'],{maxBuffer:8*1024*1024});let n=0;for(let i=0;i<p.length;i+=3)if(Math.min(p[i],p[i+1],p[i+2])>=242)n++;return n/(p.length/3)*100;};
export default async function(page) {
  mkdirSync(topic,{recursive:true});mkdirSync(owner,{recursive:true});writeFileSync(join(topic,'ABOUT.md'),about);
  const raw=mkdtempSync(join(topic,`round-${round}-`));writeFileSync(join(raw,'ABOUT.md'),about);
  const ev=async s=>{const r=await page.eval(s);if(r?.evalError)throw new Error(r.evalError);return r;};
  const ready=async s=>{for(let i=0;i<240;i++){if(await ev(s))return;await page.sleep(250);}throw new Error('Lab chưa sẵn sàng: '+s);};
  const restart=view=>ev(`(async()=>{const l=window.__lab;l.reset();l.setHerd('march');l.viewMode(${JSON.stringify(view)});l.step(45);await l.soundRecord();l.showcase('ult-star');l.step(1,0);return {population:Array.from({length:87},(_,i)=>l.beast(i)).filter(f=>f.alive).length+window.__stress.report().walkers.instances,camera:l.captureCamera()};})()`);
  const seek=t=>ev(`(()=>{const l=window.__lab;let r=l.starUlt().last;for(let i=0;i<1600&&r.clock<${t}-1e-8;i++){l.step(1,Math.min(1/60,${t}-r.clock));r=l.starUlt().last;}return r;})()`);
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.WebSocket=class extends WebSocket{constructor(url,protocols){super(url,protocols);if(protocols==='vite-hmr')this.addEventListener('message',e=>{try{if(['update','full-reload'].includes(JSON.parse(e.data).type))e.stopImmediatePropagation();}catch{}});}};`});
  const result={round,final,raw,views:{},frames:[],maxWhite:0};
  let frameIndex=0;const sounds=[];
  for(const view of ['top','behind']) {
    const url=new URL('http://127.0.0.1:3148/stress.html');
    for(const [k,v] of Object.entries({fixed:'1',ui:'0',dpr:'1',herd:'march',ground:'#353a40'}))url.searchParams.set(k,v);
    await page.goto(url.href,{settle:1000});await ready('window.__lab?.ready&&window.__stress?.ready');
    await ev('window.__lab.starUlt();true');await ready('window.__lab.starUlt().ready');
    if(smoke) {
      await page.key('f',{code:'KeyF'});
      const fired=await ev('window.__lab.starUlt()');
      if(!fired.active)throw new Error('Phím F không gọi được Tinh Tú');
      await ev('window.__lab.step(520);true');
      const cleared=await ev('window.__lab.starUlt()');
      if(cleared.active)throw new Error('Chiêu không dọn sau 8,4 s');
      const camera=await ev('window.__lab.captureCamera()');
      await page.key('8',{code:'Digit8'});
      const key8=await ev('window.__lab.starUlt()');
      if(!key8.active)throw new Error('Hàng ult-star không gọi được bằng phím 8');
      const info=await ev('window.__lab.perf(1,0)');
      await ev('window.__lab.reset();true');
      const output={fired:fired.active,finished:!cleared.active,key8:key8.active,camera,gpu:info.gpu,exceptions:page.exceptions};
      writeFileSync(join(topic,'smoke.json'),JSON.stringify(output,null,2)+'\n');return output;
    }
    await ev(`(()=>{const s=document.createElement('style');s.textContent='body *:not(canvas):not(:has(canvas)){visibility:hidden!important}';document.head.append(s);return true;})()`);
    await restart(view);await seek(8.4);const start=await restart(view);
    if(start.population!==100)throw new Error('Cảnh không đủ 100 quái: '+start.population);
    const marks=[];
    for(const t of [1,2.2,3.4,4,5.9,7]) {
      const state=await seek(t);if(!state.assetsReady||state.loadError)throw new Error('Tài nguyên: '+state.loadError);
      const file=join(raw,`${view}-${t.toFixed(1)}.png`);await page.shot(file);
      const w=white(file);result.maxWhite=Math.max(result.maxWhite,w);result.frames.push({file,view,t,white:w});marks.push({t,state});
    }
    result.views[view]={start,marks};
    if(final) {
      await restart(view);
      const rows=await ev(`(()=>{const l=window.__lab,rows=[];for(let i=0;i<600;i++){const p=l.perf(1),r=l.starUlt().last;rows.push({t:r.clock,total:p.total[0],cpu:p.cpu[0],draws:p.drawCalls,live:r.live});if(r.clock>=8.4)break;}return rows;})()`);
      result.views[view].perf={samples:rows.length,p95:p95(rows.map(r=>r.total)),cpuP95:p95(rows.map(r=>r.cpu)),maxDraws:Math.max(...rows.map(r=>r.draws)),rows};
      await restart(view);
      const n=203;
      for(let i=0;i<n;i++) {
        await seek(Math.min(8.4,i/24));const file=join(raw,`frame-${String(frameIndex++).padStart(4,'0')}.png`);await page.shot(file);
        result.maxWhite=Math.max(result.maxWhite,white(file));
      }
      const takes=await ev('window.__lab.soundTakes()');writeFileSync(join(topic,`sound-takes-${view}.json`),JSON.stringify(takes,null,2)+'\n');
      const wav=join(raw,`sound-${view}.wav`);
      execFileSync(join(root,'node_modules/.bin/tsx'),[join(root,'scripts/visual/mix-lab-sound.mjs'),'/dev/stdin',wav,'--duration='+n/24,'--offset=0','--root='+root],
        {input:JSON.stringify(takes),env:{...process.env,PATH:'/opt/homebrew/bin:'+process.env.PATH},maxBuffer:4*1024*1024});
      sounds.push(wav);result.views[view].audioTakes=takes.filter(t=>t.url?.includes('/tt-sfx-star-')||t.url?.includes('/tt-sfx-el-star-')||t.url?.includes('/tt-sfx-twin-glint')).length;
      result.views[view].end=await ev('window.__lab.starUlt().last');
    }
  }
  const sheet=join(topic,`round-${round}-sheet.jpg`);
  execFileSync(magick,['montage','-font','/System/Library/Fonts/Supplemental/Arial.ttf','-pointsize','26','-fill','#eee8db',
    ...result.frames.flatMap(s=>['-label',`${s.view==='top'?'Alt+1':'Alt+2'} - ${s.t.toFixed(1)} s`,s.file]),'-tile','6x2','-geometry','640x360+4+4','-background','#171b20',sheet]);
  result.sheet=sheet;result.exceptions=page.exceptions;result.logs=page.logs;
  if(final) {
    execFileSync(magick,[sheet,'-quality','94',join(owner,'star-ult-454t.jpg')]);
    execFileSync(ffmpeg,['-y','-v','error','-framerate','24','-i',join(raw,'frame-%04d.png'),'-i',sounds[0],'-i',sounds[1],
      '-filter_complex','[1:a][2:a]concat=n=2:v=0:a=1[a]','-map','0:v','-map','[a]','-frames:v',String(frameIndex),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',join(owner,'star-ult-454t.mp4')]);
    for(const w of sounds)unlinkSync(w);
    const line='star-ult-454t.jpg/.mp4: 454t Claude tune — chòm sao billboard ~60% khung, sao băng/kim cương phóng to; Alt+1 rồi Alt+2; báo cáo docs/codex-queue/454t-report.md.\n';
    const {readFileSync}=await import('node:fs');if(!existsSync(join(owner,'ABOUT.md')))writeFileSync(join(owner,'ABOUT.md'),about);
    if(!readFileSync(join(owner,'ABOUT.md'),'utf8').includes('star-ult-454t.jpg'))appendFileSync(join(owner,'ABOUT.md'),'\n'+line);
  }
  writeFileSync(join(topic,`round-${round}-metrics.json`),JSON.stringify(result,null,2)+'\n');
  return {raw,sheet,maxWhite:result.maxWhite,views:Object.fromEntries(Object.entries(result.views).map(([v,r])=>[v,{start:r.start,perf:r.perf?{p95:r.perf.p95,samples:r.perf.samples,maxDraws:r.perf.maxDraws}:null,sky:r.marks[1].state.sky,end:r.end,audioTakes:r.audioTakes}])),exceptions:page.exceptions};
}
