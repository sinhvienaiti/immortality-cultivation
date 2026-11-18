/** Ticket 441b: headless-only, existing localhost host. No server/build/game suite. */
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {analyzePair,connectedFootprint} from './light-ult-glow-probe.mjs';
const repo='/Volumes/SS990TPRO/htdocs/typing-game';
const review='/Volumes/SS990TPRO/htdocs/typing-game-review';
const root=join(review,'captures/tu-tien/light-ult-439');
const round=process.env.ROUND||'1',out=join(root,(process.env.BASELINE==='1'?'baseline-f':'round-f-'+round));
const final=process.env.FINAL==='1';
const magick='/opt/homebrew/bin/magick',font='/System/Library/Fonts/Supplemental/Arial.ttf';
const about='purpose: Phiếu 441b, đóng gói và tự xem video D tại điểm trúng\nmade-by: Codex, Chrome headless\ndoc: docs/codex-queue/441b-report.md\ndelete-when: Owner duyệt xong và không cần đối chiếu\n';
const p95=a=>a.toSorted((a,b)=>a-b)[Math.ceil(a.length*.95)-1];
export default async function(page){
 mkdirSync(root,{recursive:true});mkdirSync(out,{recursive:true});
 for(const dir of [root,out])if(!existsSync(join(dir,'ABOUT.md')))writeFileSync(join(dir,'ABOUT.md'),about);
 const ev=async code=>{const x=await page.eval(code);if(x?.evalError)throw new Error(x.evalError);return x;};
 const wait=async code=>{for(let i=0;i<200;i++){if(await ev(code))return;await page.sleep(300);}throw new Error('Chưa sẵn sàng: '+code);};
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`{const NativeSocket=window.WebSocket;function StableSocket(url,protocols){if(String(url).includes(':3148')){const socket=new EventTarget();Object.assign(socket,{readyState:0,send(){},close(){}});return socket;}return new NativeSocket(url,protocols);}Object.assign(StableSocket,{CONNECTING:0,OPEN:1,CLOSING:2,CLOSED:3});StableSocket.prototype=NativeSocket.prototype;window.WebSocket=StableSocket;}`});
 await page.goto('http://localhost:3148/skills-lab.html?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40',{settle:1000});
 await wait('window.__lab?.ready');await wait('window.__lab.lightUlt().ready');
 const hide=()=>ev(`(()=>{const style=document.createElement('style');style.textContent='body > :not(#ic-lab){display:none!important}';document.head.append(style);for(const e of document.querySelectorAll('body *'))if(e instanceof HTMLElement&&e.tagName!=='CANVAS'&&!e.querySelector('canvas'))e.style.visibility='hidden';return true;})()`);
 await hide();
 const start=async view=>ev(`(()=>{const l=window.__lab;l.view('play');l.reset();l.setHerd('march');l.viewMode('top');l.camera('play');l.step(45);l.viewMode(${JSON.stringify(view)});l.step(45);l.showcase('ult-light');l.step(1,0);return {caster:l.caster(),camera:l.captureCamera(),state:l.lightUlt()};})()`);
 const seek=t=>ev(`(()=>{const l=window.__lab;for(let i=0;i<600&&l.lightUlt().last.clock<${t}-1e-8;i++)l.step(1,Math.min(1/60,${t}-l.lightUlt().last.clock));if(Math.abs(l.lightUlt().last.clock-${t})>1e-6)throw new Error('Sai giờ '+l.lightUlt().last.clock);return l.lightUlt();})()`);

 if(process.env.BASELINE==='1'){
  const rows=[];
  for(const view of ['top','behind']){
   await start(view);const state=await seek(1.95+1/60);
   const file=join(out,`441b-before-${view}.png`),off=join(out,`441b-before-${view}-off.png`);
   await page.shot(file);await ev("window.__lab.fxShowNamed('light-ult-prism-burst',false)");await page.shot(off);
   rows.push({view,t:1.95+1/60,state,file,off,measured:analyzePair(file,off,state.last)});
  }
  writeFileSync(join(out,'441b-baseline.json'),JSON.stringify(rows,null,2));
  return rows.map(p=>({view:p.view,bounds:p.measured.bounds}));
 }
 await start('top');await seek(3.6);
 const phases=[],burstScan=[];
 for(const view of ['top','behind']){
  await start(view);
  for(let f=0;f<=30;f++){
   const t=1.95+f/60,state=await seek(t);
   const file=join(out,`441b-scan-${view}-${f}.png`),baseline=join(out,`441b-scan-${view}-${f}-off.png`);
   const camera=await ev('window.__lab.captureCamera()');
   await page.shot(file);await ev("window.__lab.lightUlt('hideLight')");await page.shot(baseline);
   const offClock=await ev('window.__lab.lightUlt().last.clock'),offCamera=await ev('window.__lab.captureCamera()');
   if(offClock!==state.last.clock||JSON.stringify(camera)!==JSON.stringify(offCamera))throw new Error('Khung nền scan lệch');
   await ev("window.__lab.lightUlt('showLight')");
   burstScan.push({view,t,measured:analyzePair(file,baseline,state.last),file,baseline});
  }
 }
 const peaks=Object.fromEntries(['top','behind'].map(view=>[view,burstScan.filter(p=>p.view===view).toSorted((a,b)=>b.measured.impact.meanY-a.measured.impact.meanY)[0]]));
 const burstBounds={},explosionBounds={};
 for(const view of ['top','behind']){
  await start(view);const state=await seek(peaks[view].t);
  const on=join(out,`441b-D-${view}-on.png`),off=join(out,`441b-D-${view}-off.png`);
  await page.shot(on);await ev("window.__lab.fxShowNamed('light-ult-prism-burst',false)");await page.shot(off);
  burstBounds[view]={t:peaks[view].t,state,on,off,measured:analyzePair(on,off,state.last)};
  await ev("window.__lab.fxShowNamed('light-ult-prism-burst',true)");
  await ev("window.__lab.fxSolo('light-ult-prism')");
  const whole=join(out,`441b-explosion-${view}-on.png`),none=join(out,`441b-explosion-${view}-off.png`);
  await page.shot(whole);await ev("window.__lab.lightUlt('hideLight')");await page.shot(none);
  explosionBounds[view]={t:peaks[view].t,on:whole,off:none,measured:analyzePair(whole,none,state.last),connected:connectedFootprint(whole,none)};
  await ev("window.__lab.lightUlt('showLight')");await ev('window.__lab.fxSolo(null)');

 }
 console.log('BBox vụ nổ: '+JSON.stringify(Object.fromEntries(Object.entries(explosionBounds).map(([v,p])=>[v,{bounds:p.measured.bounds,connected:p.connected}]))));
 console.log('BBox D: '+JSON.stringify(Object.fromEntries(Object.entries(burstBounds).map(([v,p])=>[v,p.measured.bounds]))));
 console.log('Khung nổ: '+JSON.stringify(Object.fromEntries(Object.entries(peaks).map(([v,p])=>[v,{t:p.t,...p.measured.impact}]))));
 for(const view of ['top','behind']){
  const initial=await start(view);
  for(const t of [...new Set([.3,.9,1.6,1.9,1.95,1.9666666667,1.9833333333,2.0,2.05,2.6,peaks[view].t].map(t=>Math.round(t*1e8)/1e8))].sort((a,b)=>a-b)){
   const state=await seek(t),file=join(out,`441b-${view}-${t.toFixed(3)}s.png`);
   await page.shot(file);
   const whitePct=Number(execFileSync(magick,[file,'-fx','r>=0.95&&g>=0.95&&b>=0.95?1:0','-format','%[fx:mean*100]','info:'],{encoding:'utf8'}));
   const camera=await ev('window.__lab.captureCamera()');
   await ev("window.__lab.lightUlt('hideLight')");
   const baseline=join(out,`441b-${view}-${t.toFixed(3)}s-off.png`);await page.shot(baseline);
   const offClock=await ev('window.__lab.lightUlt().last.clock'),offCamera=await ev('window.__lab.captureCamera()');
   if(offClock!==state.last.clock||JSON.stringify(camera)!==JSON.stringify(offCamera))throw new Error('Khung nền lệch thời gian/camera');
   await ev("window.__lab.lightUlt('showLight')");
   const measured=analyzePair(file,baseline,state.last);
   let isolated=null;
   if(view==='top'&&t===.9){
    await ev("window.__lab.fxSolo('light-ult-ray-5')");
    const on=join(out,'441b-middle-isolated-on.png'),off=join(out,'441b-middle-isolated-off.png');
    await page.shot(on);await ev("window.__lab.fxShowNamed('light-ult-ray-5',false)");await page.shot(off);
    isolated=analyzePair(on,off,state.last);await ev('window.__lab.fxSolo(null)');
   }
   if(final&&t===2.05){
    await ev("window.__lab.fxSolo('light-ult-prism-burst')");
    await page.shot(join(out,`441b-prism-isolated-${view}.png`));
    await ev('window.__lab.fxSolo(null)');
   }
   await ev("window.__lab.lightUlt('hideLens')");
   const withoutLens=join(out,`441b-${view}-${t.toFixed(3)}s-lens-off.png`);await page.shot(withoutLens);
   const visibleLens=execFileSync(magick,[file,withoutLens,'-compose','difference','-composite','-colorspace','gray','-threshold','3%','-trim','-format','%w %h %X %Y','info:'],{encoding:'utf8'}).trim().split(/\s+/).map(Number);
   await ev("window.__lab.lightUlt('showLens')");
   phases.push({view,t,state,whitePct,measured,isolated,visibleLens,initial,camera,file,baseline});
  }
 }
 if(final)for(const t of [1.2,1.9]){
  await start('top');await seek(t);
  await ev("window.__lab.setOrbit(0,90,false);window.__lab.view('orbit',100);true");
  const state=await ev('window.__lab.lightUlt()'),file=join(out,`441b-overhead-${t.toFixed(3)}s.png`);await page.shot(file);
  const whitePct=Number(execFileSync(magick,[file,'-fx','r>=0.95&&g>=0.95&&b>=0.95?1:0','-format','%[fx:mean*100]','info:'],{encoding:'utf8'}));
  await ev("window.__lab.lightUlt('hideLight')");
  const baseline=join(out,`441b-overhead-${t.toFixed(3)}s-off.png`);await page.shot(baseline);
  await ev("window.__lab.lightUlt('showLight')");
  phases.push({view:'overhead',t,state,whitePct,measured:analyzePair(file,baseline,state.last),camera:await ev('window.__lab.captureCamera()'),file,baseline});
 }
 const contraction=[];
 await start('top');
 for(const t of [.6,.7,.8,1.45,1.6,1.8,1.9,1.95,1.9666666667,2.05,2.2,2.6,3.0,3.3,3.55]){
  const state=await seek(t),file=join(out,`441b-transition-${t.toFixed(2)}s.png`);await page.shot(file);
  contraction.push({t,state,file});
 }
 execFileSync(magick,['montage','-font',font,'-pointsize','18','-fill','#e7d7ab',...contraction.flatMap(p=>['-label',`${p.t.toFixed(2)} s / ${p.state.last.phase}`,p.file]),'-tile','4x4','-geometry','640x360+3+3','-background','#111720',join(out,'441b-transition-sheet.jpg')]);
 for(const view of ['top','behind']){
  const files=phases.filter(p=>p.view===view&&[.3,.9,1.6,1.9,2.05,2.6].includes(p.t));
  execFileSync(magick,['montage','-font',font,'-pointsize','18','-fill','#e7d7ab',...files.flatMap(p=>['-label',`${view} ${p.t.toFixed(3)} s`,p.file]),'-tile','5x1','-geometry','640x360+3+3','-background','#111720',join(out,`441b-${view}-phases.jpg`)]);
 }
 const ref=join(repo,'games/immortality-cultivation/art-src/concept/ult-storyboards/light-storyboard.v1-try1.png');
 for(const view of ['top','behind']){
  const files=phases.filter(p=>p.view===view&&[.3,.9,Math.round(peaks[view].t*1e8)/1e8,2.6].includes(p.t));
  execFileSync(magick,['montage','-font',font,'-pointsize','20','-fill','#e7d7ab',...files.flatMap(p=>['-label',`${view} ${p.t.toFixed(3)} s`,p.file]),'-tile','2x2','-geometry','640x360+3+3','-background','#111720',join(out,`441b-${view}-four.jpg`)]);
 }
 execFileSync(magick,['montage','-font',font,'-pointsize','25','-fill','#e7d7ab','-label','STORYBOARD',ref,'-label','PLAY / ALT+1',join(out,'441b-top-four.jpg'),'-label','BEHIND / ALT+2',join(out,'441b-behind-four.jpg'),'-tile','3x1','-geometry','1280x800+4+4','-background','#10151b',join(out,'441b-comparison.jpg')]);
 writeFileSync(join(out,'441b-measure.json'),JSON.stringify({round,phases,burstScan,peaks,burstBounds,explosionBounds,contraction,stress:null,logs:page.logs,exceptions:page.exceptions},null,2));
 if(final){
  if(explosionBounds.top.connected.widthPct<45||explosionBounds.top.connected.heightPct<35)throw new Error('BBox cụm nổ liền mạch chưa đạt');
  const fan=phases.find(p=>p.view==='top'&&p.t===.9).measured;
  const focus=phases.find(p=>p.view==='top'&&p.t===1.9).measured;
  const back=phases.find(p=>p.view==='behind'&&p.t===.9).measured;
  const r=phases.find(p=>p.view==='top'&&p.t===1.9).state.last;
  const peak=peaks.top;
  if(peak.measured.impact.coveragePct<55||fan.taper[2].glowPx>fan.taper[1].glowPx*.6)throw new Error('Chưa đạt bùng nổ/thuôn: '+JSON.stringify({peak:peak.t,coverage:peak.measured.impact.coveragePct,taper:fan.taper}));
  if(r.focusAxisDeviationDeg>5||r.rayLengthCV<.1||r.rayLengths.length<9||r.rayLengths.length>13||r.rayPeakBrightness.some(p=>p<.55||p>1)||phases.filter(p=>p.view==='top').some(p=>Math.min(p.state.last.lens.width,p.state.last.lens.height)<18))throw new Error('Chưa đạt cổng trục/quạt/kính');
  if(fan.rays.some(r=>!r||r.glowPx<8)||fan.wedge.coveragePct<25||fan.fan.glowPx<8||focus.focus.glowPx<24||focus.focus.corePx<4||back.behindROI.coveragePct<8||phases.some(p=>p.whitePct>6))throw new Error('Chưa đạt cổng hình, xem 441b-measure.json');
 }

 let stress=null;
 if(final){
  // Record exactly f=0..119 at 30 fps. Frame zero is the cast pose, not one step later.
  await start('top');await ev('window.__lab.soundRecord()');await ev("window.__lab.showcase('ult-light');true");
  const raw=join(root,'frames-f-round-'+round);mkdirSync(raw,{recursive:true});writeFileSync(join(raw,'ABOUT.md'),about);
  for(let f=0;f<120;f++){
   if(f)await ev('window.__lab.step(2);true');
   await page.shot(join(raw,`frame-${String(f).padStart(4,'0')}.png`));
  }
  writeFileSync(join(out,'441b-sound-takes.json'),JSON.stringify(await ev('window.__lab.soundTakes()'),null,2));
  const behindRaw=join(root,'frames-f-behind-round-'+round);mkdirSync(behindRaw,{recursive:true});writeFileSync(join(behindRaw,'ABOUT.md'),about);
  await start('behind');
  for(let f=0;f<120;f++){if(f)await ev('window.__lab.step(2);true');await page.shot(join(behindRaw,`frame-${String(f).padStart(4,'0')}.png`));}
  const owner=join(review,'owner-review/2026-11-17/tu-tien');mkdirSync(owner,{recursive:true});
  for(const [framesDir,filename] of [[raw,'441b-silent.mp4'],[behindRaw,'441b-behind-silent.mp4']])execFileSync('/opt/homebrew/bin/ffmpeg',['-y','-v','error','-framerate','30','-i',join(framesDir,'frame-%04d.png'),'-frames:v','120','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',join(out,filename)]);
  // Existing lab mixer preserves the actual runtime take offsets, gains, bus and reverb.
  execFileSync(join(repo,'games/.wt-ic-lab-all/node_modules/.bin/tsx'),[join(repo,'games/.wt-ic-lab-all/scripts/visual/mix-lab-sound.mjs'),join(out,'441b-sound-takes.json'),join(out,'441b-sound.wav'),'--duration=4','--root='+join(repo,'games/.wt-ic-lab-all')],{env:process.env});
  execFileSync('/opt/homebrew/bin/ffmpeg',['-y','-v','error','-i',join(out,'441b-silent.mp4'),'-i',join(out,'441b-sound.wav'),'-t','4','-c:v','copy','-c:a','aac','-b:a','192k',join(owner,'light-ult-codex-f.mp4')]);
  execFileSync('/opt/homebrew/bin/ffmpeg',['-y','-v','error','-i',join(out,'441b-behind-silent.mp4'),'-i',join(out,'441b-sound.wav'),'-t','4','-c:v','copy','-c:a','aac','-b:a','192k',join(owner,'light-ult-codex-f-behind.mp4')]);
  await page.goto('http://localhost:3148/stress.html?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40',{settle:1000});
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
 const result={round,phases,burstScan,peaks,burstBounds,explosionBounds,contraction,stress,logs:page.logs,exceptions:page.exceptions};
 writeFileSync(join(out,'441b-measure.json'),JSON.stringify(result,null,2));
 if(final&&(stress.p95TotalMs>16.7||stress.software||page.exceptions.length))throw new Error('Chưa đạt cổng GPU/exception');
 return {out,explosionBounds:Object.fromEntries(Object.entries(explosionBounds).map(([v,p])=>[v,{bounds:p.measured.bounds,connected:p.connected}])),burstBounds:Object.fromEntries(Object.entries(burstBounds).map(([v,p])=>[v,{t:p.t,bounds:p.measured.bounds}])),stress:stress&&{p95:stress.p95TotalMs,gpu:stress.gpu},exceptions:page.exceptions};
}
