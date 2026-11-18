/** 434j: scoped, deterministic local-browser evidence; no game builds/tests. */
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const review='/Volumes/SS990TPRO/htdocs/typing-game-review',repo='/Volumes/SS990TPRO/htdocs/typing-game';
const root=join(review,'captures/tu-tien/thunder-ult-434j'),round=process.env.ROUND||'1',out=join(root,'round-'+round),final=process.env.FINAL==='1';
const magick='/opt/homebrew/bin/magick',font='/System/Library/Fonts/Supplemental/Arial.ttf';
const about='purpose: Phiếu 434j, sét C lan nhiều hướng và cột Ngũ Lôi 3,6 giây\nmade-by: Codex, Chrome headless\ndoc: docs/codex-queue/434j-report.md\ndelete-when: Owner duyệt xong và không cần đối chiếu\n';
const white=file=>{const p=execFileSync(magick,[file,'-depth','8','rgba:-'],{maxBuffer:1280*720*4+1024});let rgb=0,lum=0;for(let i=0;i<p.length;i+=4){if(p[i]>=243&&p[i+1]>=243&&p[i+2]>=243)rgb++;if((p[i]*.2126+p[i+1]*.7152+p[i+2]*.0722)/255>=.95)lum++;}return{whitePct:rgb/(1280*720)*100,nearWhitePct:lum/(1280*720)*100};};
const p95=a=>a.toSorted((a,b)=>a-b)[Math.ceil(a.length*.95)-1];
function audit(r){
 const links=r.art.links,groups=new Map();
 for(const l of links.filter(l=>l.layer==='boltC-card')){
  const key=l.born.toFixed(5)+':'+l.start.map(n=>n.toFixed(3)).join(',');
  const rows=groups.get(key)||[];rows.push(l);groups.set(key,rows);
 }
 let minAngle=360;const angles=[];
 for(const rows of groups.values())if(rows.length>=2){
  const a=rows.map(l=>Math.atan2(l.end[2]-l.start[2],l.end[0]-l.start[0])).sort((a,b)=>a-b);
  const gaps=a.map((x,i)=>(a[(i+1)%a.length]-x+Math.PI*2)%(Math.PI*2)*180/Math.PI);angles.push(gaps);minAngle=Math.min(minAngle,...gaps);
 }
 const slots=new Map();for(const s of r.sections||[])slots.set(s.slot,Math.max(slots.get(s.slot)||1,1+Math.ceil(Math.max(0,s.segment-17)/3)));const cloudRays=[...slots.values()].reduce((a,b)=>a+b,0);
 return {rays:links.filter(l=>l.layer==='boltC-card'||l.primary||l.layer.startsWith('crawl')).length+cloudRays,minAngle,angles,column:links.some(l=>l.primary),columnFrame:links.find(l=>l.primary)?.frame,pulse:links.find(l=>l.primary)?.pulse,cloudRays};
}
export default async function(page){
 for(const d of [root,out]){mkdirSync(d,{recursive:true});if(!existsSync(join(d,'ABOUT.md')))writeFileSync(join(d,'ABOUT.md'),about);}
 // Freeze this load against unrelated HMR edits from concurrent lanes.
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const N=window.WebSocket;window.WebSocket=new Proxy(N,{construct(T,a){if(a[1]==='vite-hmr'){const s=new EventTarget();Object.assign(s,{url:String(a[0]),readyState:1,send(){},close(){}});queueMicrotask(()=>{const e=new Event('open');s.dispatchEvent(e);s.onopen?.(e);});return s;}return Reflect.construct(T,a);}});})()`});
 const ev=async code=>{const r=await page.eval(code);if(r?.evalError)throw Error(r.evalError);return r;};
 const wait=async code=>{for(let i=0;i<240;i++){if(await ev(code))return;await page.sleep(250);}throw Error('Chưa sẵn sàng: '+code);};
 const load=async path=>{await page.goto('http://localhost:3148/'+path+'?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40',{settle:1000});await wait('window.__lab?.ready');await wait('window.__lab.thunderUlt().ready');await ev(`(()=>{const s=document.createElement('style');s.textContent='body *{visibility:hidden!important}canvas{visibility:visible!important}';document.head.append(s);return true;})()`);};
 const start=(view,record=false)=>ev(`(async()=>{const l=window.__lab;l.view('play');l.reset();l.setHerd('march');l.viewMode('top');l.camera('play');l.step(45);l.viewMode('${view}');l.step(45);${record?'await l.soundRecord();':''}l.showcase('ult-thunder-nine-heavens-v2');l.step(1,0);return l.captureCamera();})()`);
 const seek=t=>ev(`(()=>{const l=window.__lab;for(let i=0;i<2000&&l.thunderUlt().active&&l.thunderUlt().last.clock<${t}-1e-8;i++)l.step(1,Math.min(1/60,${t}-l.thunderUlt().last.clock));return l.thunderUlt().last;})()`);
 await load('skills-lab.html');await start('top');await seek(7);
 const phases=[],timeline=[];
 const rawPixels=file=>execFileSync(magick,[file,'-depth','8','rgba:-'],{maxBuffer:1280*720*4+1024});
 const spread=(a,b)=>{const p=rawPixels(a),q=rawPixels(b);let left=1280,right=-1,n=0;
  for(let y=0;y<720;y++)for(let x=0;x<1280;x++){const i=(y*1280+x)*4;
   if(Math.max(p[i]-q[i],p[i+1]-q[i+1],p[i+2]-q[i+2])>=24){left=Math.min(left,x);right=Math.max(right,x);n++;}}
  return {left,right,pixels:n,widthPct:right>=left?(right-left+1)/1280*100:0};};
 for(const view of ['top','behind']){
  const camera=await start(view);
  for(const t of [1.2,2,3,4.2,5.5,6.5]){
   const state=await seek(t),file=join(out,`${view}-${t.toFixed(1)}s.png`);await page.shot(file);
   let pixelSpread=null;
   if(t<2.4){
    const hidden=join(out,`${view}-${t.toFixed(1)}s-hidden.png`);
    await ev(`(async()=>{window.__jArt=await import('/src/lab/thunder-ult-nguloi.ts');window.__jArt.thunderHopSoloEnd.value.set(-999,0,0);window.__lab.step(1,0);return true;})()`);
    await page.shot(hidden);pixelSpread=spread(file,hidden);
    await ev('window.__jArt.thunderHopSoloEnd.value.set(1e6,1e6,1e6);window.__lab.step(1,0);true');
   }
   phases.push({view,t,file,camera,state,pixelSpread,...white(file),audit:audit(state)});
  }
  await seek(7);
  execFileSync(magick,['montage','-font',font,'-pointsize','20','-fill','#dddfff',...phases.filter(p=>p.view===view).flatMap(p=>['-label',`${view==='top'?'Alt+1':'Alt+2'} / ${p.t.toFixed(1)} s`,p.file]),'-tile','2x3','-geometry','640x360+3+3','-background','#10141b',join(out,view+'-sheet.jpg')]);
 }
 const source=join(repo,'games/immortality-cultivation/art-src/concept/ult-storyboards/ult-storyboard-samples-431.jpg');
 execFileSync(magick,[source,'-gravity','East','-crop','50%x100%+0+0','+repage',join(out,'storyboard-thunder.jpg')]);
 execFileSync(magick,['montage','-font',font,'-pointsize','24','-fill','#dddfff','-label','STORYBOARD / THUNDER',join(out,'storyboard-thunder.jpg'),'-label','PLAY / ALT+1',join(out,'top-sheet.jpg'),'-label','BEHIND / ALT+2',join(out,'behind-sheet.jpg'),'-tile','3x1','-geometry','1280x1200+4+4','-background','#10141b',join(out,'comparison-sheet.jpg')]);
 // Every 60 Hz frame: live angular and ray-cap audit, both inspection cameras.
 for(const view of ['top','behind']){
  await start(view);
  const rows=await ev(`(()=>{const a=[],l=window.__lab;for(let i=0;i<=420;i++){if(i)l.step(1);const r=l.thunderUlt().last;const xs=r.art.links.filter(x=>x.layer==='boltC-card').flatMap(x=>[l.project(...x.start).x,l.project(...x.end).x]);
    a.push({clock:r.clock,art:r.art,sections:r.sections,fanouts:r.fanouts,hops:r.hops,peakRays:r.peakRays,jolts:r.jolts,columnSounds:r.columnSounds,columns:r.columns,
     projectedWidthPct:xs.length?(Math.min(1280,Math.max(...xs))-Math.max(0,Math.min(...xs)))/1280*100:0,cloud:r.cloudNow,dropped:r.dropped});}return a;})()`);
  timeline.push(...rows.map(r=>({view,clock:r.clock,...audit(r),fanouts:r.fanouts,hops:r.hops,jolts:r.jolts,columnSounds:r.columnSounds,columns:r.columns,projectedWidthPct:r.projectedWidthPct,cloud:r.cloud,dropped:r.dropped})));
 }
 await load('stress.html');await wait('window.__stress?.ready');const runs=[];
 for(let k=0;k<4;k++)runs.push(await ev(`(()=>{const l=window.__lab;l.view('play');l.reset();l.setHerd('still');l.viewMode('top');l.camera('play');l.step(90);l.showcase('ult-thunder-nine-heavens-v2');l.step(144);const pop=()=>({targets:Array.from({length:87},(_,i)=>l.beast(i)).filter(b=>b.alive).length,walkers:window.__stress.report().walkers.instances});const population=pop(),rows=[];for(let j=0;j<210;j++){const p=l.perf(1);rows.push({clock:l.thunderUlt().last.clock,cpu:p.cpu[0],total:p.total[0],gpu:p.gpu,draws:p.drawCalls});}return {population,populationEnd:pop(),rows};})()`));
 const perf=runs.slice(1).flatMap(r=>r.rows),stress={runs,p95TotalMs:p95(perf.map(r=>r.total)),p95CpuMs:p95(perf.map(r=>r.cpu)),gpu:perf[0].gpu,warmupExcluded:1};
 const scan=[];
 if(final){
  await load('skills-lab.html');
  for(const view of ['top','behind']){
   const raw=join(out,'frames-'+view);mkdirSync(raw,{recursive:true});writeFileSync(join(raw,'ABOUT.md'),about);
   await start(view,view==='top');
   for(let f=0;f<420;f++){
    if(f)await ev('window.__lab.step(1);true');
    if(process.env.PATCH_TAIL==='1'&&f<360)continue;
    const file=join(raw,`f${String(f).padStart(4,'0')}.png`);await page.shot(file);
    scan.push({view,frame:f,time:f/60,...white(file)});
   }
   if(process.env.PATCH_TAIL==='1')for(let f=0;f<360;f++)scan.push({view,frame:f,time:f/60,...white(join(raw,`f${String(f).padStart(4,'0')}.png`))});
   if(view==='top')writeFileSync(join(out,'sound-takes.json'),JSON.stringify(await ev('window.__lab.soundTakes()'),null,2));
  }
 }
 const last=timeline.filter(p=>p.view==='top').at(-1),cols=last.columns;
 const distances=cols.flatMap((a,i)=>cols.slice(i+1).map(b=>Math.hypot(a.point[0]-b.point[0],a.point[2]-b.point[2])));
 const summary={round,tierCounts:[1,2,3,4].map(t=>last.hops.filter(h=>h.tier===t).length),fanouts:last.fanouts.map(f=>({tier:f.tier,source:f.source,rays:f.rays,angles:f.anglesDeg})),
  chainWidthPct:Math.max(...phases.filter(p=>p.view==='top').map(p=>p.pixelSpread?.widthPct||0)),
  chainWidths:phases.filter(p=>p.pixelSpread).map(p=>({view:p.view,t:p.t,...p.pixelSpread})),
  maxProjectedWidthPct:Math.max(...timeline.filter(p=>p.view==='top').map(p=>p.projectedWidthPct)),
  minLiveAngle:Math.min(...timeline.map(r=>r.minAngle)),maxRays:Math.max(...timeline.map(r=>r.rays),...timeline.map(r=>r.rays+(r.clock>=6&&r.clock<6.4?8:0))),
  columns:cols,columnCount:cols.length,maxColumnsAtOnce:Math.max(...timeline.map(r=>r.columns.filter(c=>r.clock>=c.at-1e-8&&r.clock<c.at+c.life-1e-8).length)),
  minLandingDistanceM:Math.min(...distances),jolts:last.jolts,columnSounds:last.columnSounds,
  maxWhitePct:Math.max(...phases.map(p=>p.whitePct),...scan.map(p=>p.whitePct)),maxNearWhitePct:Math.max(...phases.map(p=>p.nearWhitePct),...scan.map(p=>p.nearWhitePct)),
  p95:stress.p95TotalMs,gpu:stress.gpu,scanFrames:scan.length,maxDropped:Math.max(...timeline.map(r=>r.dropped)),exceptions:page.exceptions};
 writeFileSync(join(out,'measure.json'),JSON.stringify({summary,phases,timeline,stress,scan,logs:page.logs,exceptions:page.exceptions},null,2));
 return {out,...summary};
}
