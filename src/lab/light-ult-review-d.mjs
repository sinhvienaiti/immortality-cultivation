/** Ticket 439d: headless-only, existing localhost host. No server/build/game suite. */
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {analyzePair} from './light-ult-glow-probe.mjs';
const repo='/Volumes/SS990TPRO/htdocs/typing-game';
const review='/Volumes/SS990TPRO/htdocs/typing-game-review';
const root=join(review,'captures/tu-tien/light-ult-439');
const round=process.env.ROUND||'1',out=join(root,'round-d-'+round);
const final=process.env.FINAL==='1';
const magick='/opt/homebrew/bin/magick',font='/System/Library/Fonts/Supplemental/Arial.ttf';
const about='purpose: Phiếu 439d, tự chụp và lặp tuyệt kỹ Quang từ thấu kính\nmade-by: Codex, Chrome headless\ndoc: docs/codex-queue/439d-report.md\ndelete-when: Owner duyệt xong và không cần đối chiếu\n';
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
  for(const t of [.3,.9,1.6,1.9,1.95,1.9666666667,1.9833333333,2.0,2.05,2.6]){
   const state=await seek(t),file=join(out,`439d-${view}-${t.toFixed(3)}s.png`);
   await page.shot(file);
   const whitePct=Number(execFileSync(magick,[file,'-fx','r>=0.95&&g>=0.95&&b>=0.95?1:0','-format','%[fx:mean*100]','info:'],{encoding:'utf8'}));
   const camera=await ev('window.__lab.captureCamera()');
   await ev("window.__lab.lightUlt('hideLight')");
   const baseline=join(out,`439d-${view}-${t.toFixed(3)}s-off.png`);await page.shot(baseline);
   const offClock=await ev('window.__lab.lightUlt().last.clock'),offCamera=await ev('window.__lab.captureCamera()');
   if(offClock!==state.last.clock||JSON.stringify(camera)!==JSON.stringify(offCamera))throw new Error('Khung nền lệch thời gian/camera');
   await ev("window.__lab.lightUlt('showLight')");
   const measured=analyzePair(file,baseline,state.last);
   let isolated=null;
   if(view==='top'&&t===.9){
    await ev("window.__lab.fxSolo('light-ult-ray-5')");
    const on=join(out,'439d-middle-isolated-on.png'),off=join(out,'439d-middle-isolated-off.png');
    await page.shot(on);await ev("window.__lab.fxShowNamed('light-ult-ray-5',false)");await page.shot(off);
    isolated=analyzePair(on,off,state.last);await ev('window.__lab.fxSolo(null)');
   }
   await ev("window.__lab.lightUlt('hideLens')");
   const withoutLens=join(out,`439d-${view}-${t.toFixed(3)}s-lens-off.png`);await page.shot(withoutLens);
   const visibleLens=execFileSync(magick,[file,withoutLens,'-compose','difference','-composite','-colorspace','gray','-threshold','3%','-trim','-format','%w %h %X %Y','info:'],{encoding:'utf8'}).trim().split(/\s+/).map(Number);
   await ev("window.__lab.lightUlt('showLens')");
   phases.push({view,t,state,whitePct,measured,isolated,visibleLens,initial,camera,file,baseline});
  }
 }
 if(final)for(const t of [1.2,1.9]){
  await start('top');await seek(t);
  await ev("window.__lab.setOrbit(0,90,false);window.__lab.view('orbit',100);true");
  const state=await ev('window.__lab.lightUlt()'),file=join(out,`439d-overhead-${t.toFixed(3)}s.png`);await page.shot(file);
  const whitePct=Number(execFileSync(magick,[file,'-fx','r>=0.95&&g>=0.95&&b>=0.95?1:0','-format','%[fx:mean*100]','info:'],{encoding:'utf8'}));
  await ev("window.__lab.lightUlt('hideLight')");
  const baseline=join(out,`439d-overhead-${t.toFixed(3)}s-off.png`);await page.shot(baseline);
  await ev("window.__lab.lightUlt('showLight')");
  phases.push({view:'overhead',t,state,whitePct,measured:analyzePair(file,baseline,state.last),camera:await ev('window.__lab.captureCamera()'),file,baseline});
 }
 const contraction=[];
 await start('top');
 for(const t of [.6,.7,.8,1.45,1.6,1.8,1.9,1.95,1.9666666667,2.05,2.2,2.6,3.0,3.3,3.55]){
  const state=await seek(t),file=join(out,`439d-transition-${t.toFixed(2)}s.png`);await page.shot(file);
  contraction.push({t,state,file});
 }
 execFileSync(magick,['montage','-font',font,'-pointsize','18','-fill','#e7d7ab',...contraction.flatMap(p=>['-label',`${p.t.toFixed(2)} s / ${p.state.last.phase}`,p.file]),'-tile','4x4','-geometry','640x360+3+3','-background','#111720',join(out,'439d-transition-sheet.jpg')]);
 for(const view of ['top','behind']){
  const files=phases.filter(p=>p.view===view&&[.3,.9,1.6,1.9,2.05,2.6].includes(p.t));
  execFileSync(magick,['montage','-font',font,'-pointsize','18','-fill','#e7d7ab',...files.flatMap(p=>['-label',`${view} ${p.t.toFixed(3)} s`,p.file]),'-tile','5x1','-geometry','640x360+3+3','-background','#111720',join(out,`439d-${view}-phases.jpg`)]);
 }
 const ref=join(repo,'games/immortality-cultivation/art-src/concept/ult-storyboards/light-storyboard.v1-try1.png');
 for(const view of ['top','behind']){
  const files=phases.filter(p=>p.view===view&&[.3,.9,2.05,2.6].includes(p.t));
  execFileSync(magick,['montage','-font',font,'-pointsize','20','-fill','#e7d7ab',...files.flatMap(p=>['-label',`${view} ${p.t.toFixed(3)} s`,p.file]),'-tile','2x2','-geometry','640x360+3+3','-background','#111720',join(out,`439d-${view}-four.jpg`)]);
 }
 execFileSync(magick,['montage','-font',font,'-pointsize','25','-fill','#e7d7ab','-label','STORYBOARD',ref,'-label','PLAY / ALT+1',join(out,'439d-top-four.jpg'),'-label','BEHIND / ALT+2',join(out,'439d-behind-four.jpg'),'-tile','3x1','-geometry','1280x800+4+4','-background','#10151b',join(out,'439d-comparison.jpg')]);
 writeFileSync(join(out,'439d-measure.json'),JSON.stringify({round,phases,contraction,stress:null,logs:page.logs,exceptions:page.exceptions},null,2));
 if(final){
  const fan=phases.find(p=>p.view==='top'&&p.t===.9).measured;
  const focus=phases.find(p=>p.view==='top'&&p.t===1.9).measured;
  const back=phases.find(p=>p.view==='behind'&&p.t===.9).measured;
  const r=phases.find(p=>p.view==='top'&&p.t===1.9).state.last;
  const peak=phases.filter(p=>p.view==='top'&&p.t>=1.95&&p.t<=2.05).toSorted((a,b)=>b.measured.impact.coveragePct-a.measured.impact.coveragePct)[0];
  if(peak.measured.impact.coveragePct<45||fan.taper[2].glowPx>fan.taper[1].glowPx*.6)throw new Error('Chưa đạt bùng nổ/thuôn: '+JSON.stringify({peak:peak.t,coverage:peak.measured.impact.coveragePct,taper:fan.taper}));
  if(r.focusAxisDeviationDeg>5||r.rayLengthCV<.1||r.rayLengths.length<9||r.rayLengths.length>13||r.rayPeakBrightness.some(p=>p<.55||p>1)||phases.filter(p=>p.view==='top').some(p=>Math.min(p.state.last.lens.width,p.state.last.lens.height)<18))throw new Error('Chưa đạt cổng trục/quạt/kính');
  if(fan.rays.some(r=>!r||r.glowPx<8)||fan.wedge.coveragePct<25||fan.fan.glowPx<8||focus.focus.glowPx<24||focus.focus.corePx<4||back.behindROI.coveragePct<8||phases.some(p=>p.whitePct>6))throw new Error('Chưa đạt cổng hình, xem 439d-measure.json');
 }

 let stress=null;
 if(final){
  // Record exactly f=0..119 at 30 fps. Frame zero is the cast pose, not one step later.
  await start('top');await ev('window.__lab.soundRecord()');await ev("window.__lab.showcase('ult-light');true");
  const raw=join(root,'frames-d-round-'+round);mkdirSync(raw,{recursive:true});writeFileSync(join(raw,'ABOUT.md'),about);
  for(let f=0;f<120;f++){
   if(f)await ev('window.__lab.step(2);true');
   await page.shot(join(raw,`frame-${String(f).padStart(4,'0')}.png`));
  }
  writeFileSync(join(out,'439d-sound-takes.json'),JSON.stringify(await ev('window.__lab.soundTakes()'),null,2));
  const owner=join(review,'owner-review/2026-11-17/tu-tien');mkdirSync(owner,{recursive:true});
  execFileSync('/opt/homebrew/bin/ffmpeg',['-y','-v','error','-framerate','30','-i',join(raw,'frame-%04d.png'),'-frames:v','120','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',join(out,'439d-silent.mp4')]);
  // Existing lab mixer preserves the actual runtime take offsets, gains, bus and reverb.
  execFileSync(join(repo,'games/.wt-ic-lab-all/node_modules/.bin/tsx'),[join(repo,'games/.wt-ic-lab-all/scripts/visual/mix-lab-sound.mjs'),join(out,'439d-sound-takes.json'),join(out,'439d-sound.wav'),'--duration=4','--root='+join(repo,'games/.wt-ic-lab-all')],{env:process.env});
  execFileSync('/opt/homebrew/bin/ffmpeg',['-y','-v','error','-i',join(out,'439d-silent.mp4'),'-i',join(out,'439d-sound.wav'),'-t','4','-c:v','copy','-c:a','aac','-b:a','192k',join(owner,'light-ult-codex-d.mp4')]);
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
 const result={round,phases,contraction,stress,logs:page.logs,exceptions:page.exceptions};
 writeFileSync(join(out,'439d-measure.json'),JSON.stringify(result,null,2));
 if(final&&(stress.p95TotalMs>16.7||stress.software||page.exceptions.length))throw new Error('Chưa đạt cổng GPU/exception');
 return {out,frames:phases.map(p=>({view:p.view,t:p.t,whitePct:p.whitePct,measured:{white:p.measured.whitePct,coverage:p.measured.wedge.coveragePct,behind:p.measured.behindROI.coveragePct,fanPx:p.measured.fan?.glowPx,focusPx:p.measured.focus?.glowPx,corePx:p.measured.focus?.corePx,impact:p.measured.impact.coveragePct,taper:p.measured.taper.map(r=>r.glowPx)},lens:p.state.last.lens,visibleLens:p.visibleLens,hdr:p.state.last.hdrBeams,axisDeg:p.state.last.focusAxisDeviationDeg,cv:p.state.last.rayLengthCV})),stress:stress&&{p95:stress.p95TotalMs,gpu:stress.gpu},logs:page.logs,exceptions:page.exceptions};
}
