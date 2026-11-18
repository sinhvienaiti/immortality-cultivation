/** Ticket 439: headless-only, existing localhost host. No server/build/game suite. */
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const repo='/Volumes/SS990TPRO/htdocs/typing-game';
const review='/Volumes/SS990TPRO/htdocs/typing-game-review';
const root=join(review,'captures/tu-tien/light-ult-439');
const round=process.env.ROUND||'1',out=join(root,'round-'+round);
const final=process.env.FINAL==='1';
const magick='/opt/homebrew/bin/magick',font='/System/Library/Fonts/Supplemental/Arial.ttf';
const about='purpose: Phiếu 439, tự chụp và lặp tuyệt kỹ Quang từ thấu kính\nmade-by: Codex, Chrome headless\ndoc: docs/codex-queue/439-report.md\ndelete-when: Owner duyệt xong và không cần đối chiếu\n';
const p95=a=>a.toSorted((a,b)=>a-b)[Math.ceil(a.length*.95)-1];
export default async function(page){
 mkdirSync(root,{recursive:true});mkdirSync(out,{recursive:true});
 for(const dir of [root,out])if(!existsSync(join(dir,'ABOUT.md')))writeFileSync(join(dir,'ABOUT.md'),about);
 const ev=async code=>{const x=await page.eval(code);if(x?.evalError)throw new Error(x.evalError);return x;};
 const wait=async code=>{for(let i=0;i<200;i++){if(await ev(code))return;await page.sleep(300);}throw new Error('Chưa sẵn sàng: '+code);};
 await page.goto('http://localhost:3148/skills-lab.html?fixed=1&ui=0&dpr=1&q=high&herd=march',{settle:1000});
 await wait('window.__lab?.ready');await wait('window.__lab.lightUlt().ready');
 const hide=()=>ev(`(()=>{const style=document.createElement('style');style.textContent='body > :not(#ic-lab){display:none!important}';document.head.append(style);for(const e of document.querySelectorAll('body *'))if(e instanceof HTMLElement&&e.tagName!=='CANVAS'&&!e.querySelector('canvas'))e.style.visibility='hidden';return true;})()`);
 await hide();
 const start=async view=>ev(`(()=>{const l=window.__lab;l.view('play');l.reset();l.setHerd('march');l.viewMode('top');l.camera('play');l.step(45);l.viewMode(${JSON.stringify(view)});l.step(45);l.showcase('ult-light');l.step(1,0);return {caster:l.caster(),camera:l.captureCamera(),state:l.lightUlt()};})()`);
 const seek=t=>ev(`(()=>{const l=window.__lab;for(let i=0;i<600&&l.lightUlt().last.clock<${t}-1e-8;i++)l.step(1,Math.min(1/60,${t}-l.lightUlt().last.clock));if(Math.abs(l.lightUlt().last.clock-${t})>1e-6)throw new Error('Sai giờ '+l.lightUlt().last.clock);return l.lightUlt();})()`);
 await start('top');await seek(3.6);
 const phases=[];
 for(const view of ['top','behind']){
  const initial=await start(view);
  for(const t of [.3,.9,1.6,1.9,2.6]){
   const state=await seek(t),file=join(out,`439-${view}-${t.toFixed(1)}s.png`);
   await page.shot(file);
   const whitePct=Number(execFileSync(magick,[file,'-fx','r>=0.95&&g>=0.95&&b>=0.95?1:0','-format','%[fx:mean*100]','info:'],{encoding:'utf8'}));
   phases.push({view,t,state,whitePct,initial,camera:await ev('window.__lab.captureCamera()'),file});
  }
 }
 if(final)for(const t of [1.2,1.9]){
  await start('top');await seek(t);
  await ev("window.__lab.setOrbit(0,90,false);window.__lab.view('orbit',100);true");
  const state=await ev('window.__lab.lightUlt()'),file=join(out,`439-overhead-${t.toFixed(1)}s.png`);await page.shot(file);
  const whitePct=Number(execFileSync(magick,[file,'-fx','r>=0.95&&g>=0.95&&b>=0.95?1:0','-format','%[fx:mean*100]','info:'],{encoding:'utf8'}));
  phases.push({view:'overhead',t,state,whitePct,camera:await ev('window.__lab.captureCamera()'),file});
 }
 for(const view of ['top','behind']){
  const files=phases.filter(p=>p.view===view);
  execFileSync(magick,['montage','-font',font,'-pointsize','18','-fill','#e7d7ab',...files.flatMap(p=>['-label',`${view} ${p.t.toFixed(1)} s`,p.file]),'-tile','5x1','-geometry','640x360+3+3','-background','#111720',join(out,`439-${view}-phases.jpg`)]);
 }
 const ref=join(repo,'games/immortality-cultivation/art-src/concept/ult-storyboards/light-storyboard.v1-try1.png');
 for(const view of ['top','behind']){
  const files=phases.filter(p=>p.view===view&&p.t!==1.6);
  execFileSync(magick,['montage','-font',font,'-pointsize','20','-fill','#e7d7ab',...files.flatMap(p=>['-label',`${view} ${p.t.toFixed(1)} s`,p.file]),'-tile','2x2','-geometry','640x360+3+3','-background','#111720',join(out,`439-${view}-four.jpg`)]);
 }
 execFileSync(magick,['montage','-font',font,'-pointsize','25','-fill','#e7d7ab','-label','STORYBOARD',ref,'-label','PLAY / ALT+1',join(out,'439-top-four.jpg'),'-label','BEHIND / ALT+2',join(out,'439-behind-four.jpg'),'-tile','3x1','-geometry','1280x800+4+4','-background','#10151b',join(out,'439-comparison.jpg')]);
 writeFileSync(join(out,'439-measure.json'),JSON.stringify({round,phases,stress:null,logs:page.logs,exceptions:page.exceptions},null,2));
 let stress=null;
 if(final){
  // Record exactly f=0..119 at 30 fps. Frame zero is the cast pose, not one step later.
  await start('top');await ev('window.__lab.soundRecord()');await ev("window.__lab.showcase('ult-light');true");
  const raw=join(root,'frames-round-'+round);mkdirSync(raw,{recursive:true});writeFileSync(join(raw,'ABOUT.md'),about);
  for(let f=0;f<120;f++){
   if(f)await ev('window.__lab.step(2);true');
   await page.shot(join(raw,`frame-${String(f).padStart(4,'0')}.png`));
  }
  writeFileSync(join(out,'439-sound-takes.json'),JSON.stringify(await ev('window.__lab.soundTakes()'),null,2));
  const owner=join(review,'owner-review/2026-11-17/tu-tien');mkdirSync(owner,{recursive:true});
  execFileSync('/opt/homebrew/bin/ffmpeg',['-y','-v','error','-framerate','30','-i',join(raw,'frame-%04d.png'),'-frames:v','120','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',join(out,'439-silent.mp4')]);
  // Existing lab mixer preserves the actual runtime take offsets, gains, bus and reverb.
  execFileSync(join(repo,'games/.wt-ic-lab-all/node_modules/.bin/tsx'),[join(repo,'games/.wt-ic-lab-all/scripts/visual/mix-lab-sound.mjs'),join(out,'439-sound-takes.json'),join(out,'439-sound.wav'),'--duration=4','--root='+join(repo,'games/.wt-ic-lab-all')],{env:process.env});
  execFileSync('/opt/homebrew/bin/ffmpeg',['-y','-v','error','-i',join(out,'439-silent.mp4'),'-i',join(out,'439-sound.wav'),'-t','4','-c:v','copy','-c:a','aac','-b:a','192k',join(owner,'light-ult-codex.mp4')]);
  await page.goto('http://localhost:3148/stress.html?fixed=1&ui=0&dpr=1&q=high&herd=march',{settle:1000});
  await wait('window.__lab?.ready&&window.__stress?.ready');await wait('window.__lab.lightUlt().ready');await hide();
  const runs=[];
  for(let k=0;k<4;k++){
   const initial=await start('top');
   const population=await ev('({targets:Array.from({length:87},(_,i)=>window.__lab.beast(i)).filter(b=>b.alive).length,walkers:window.__stress.report().walkers.instances})');
   if(population.targets+population.walkers!==100)throw new Error('Không đủ 100 quái: '+JSON.stringify(population));
   const measured=await ev(`(()=>{const rows=[];for(let i=0;i<240;i++){const p=window.__lab.perf(1);rows.push({clock:window.__lab.lightUlt().last.clock,cpu:p.cpu[0],total:p.total[0],draws:p.drawCalls,triangles:p.triangles,gpu:p.gpu});}return {rows,state:window.__lab.lightUlt(),memory:window.__lab.memory()};})()`);
   runs.push({population,initial,...measured,p95TotalMs:p95(measured.rows.map(r=>r.total)),p95CpuMs:p95(measured.rows.map(r=>r.cpu))});
  }
  const rows=runs.slice(1).flatMap(r=>r.rows),gpu=rows[0].gpu;
  stress={warmupExcluded:1,runs,p95TotalMs:p95(rows.map(r=>r.total)),p95CpuMs:p95(rows.map(r=>r.cpu)),gpu,software:/swiftshader|llvmpipe|software|unknown/i.test(gpu),note:'Theo metal-ult-rain-review.mjs: total=CPU+GPU readPixels, 87 TargetField+13 walkers. 3 lượt lặp sau 1 lượt làm nóng.'};
 }
 const result={round,phases,stress,logs:page.logs,exceptions:page.exceptions};
 writeFileSync(join(out,'439-measure.json'),JSON.stringify(result,null,2));
 return {out,frames:phases.map(p=>({view:p.view,t:p.t,whitePct:p.whitePct,lens:p.state.last.lens,hdr:p.state.last.hdrBeams})),stress:stress&&{p95:stress.p95TotalMs,gpu:stress.gpu},logs:page.logs,exceptions:page.exceptions};
}
