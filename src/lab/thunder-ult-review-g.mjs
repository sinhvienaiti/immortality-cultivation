/** Ticket 434g: existing localhost host, headless capture, pixel and GPU measurements. */
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import * as THREE from 'three';
const repo='/Volumes/SS990TPRO/htdocs/typing-game',review='/Volumes/SS990TPRO/htdocs/typing-game-review';
const root=join(review,'captures/tu-tien/thunder-ult-434g'),round=process.env.ROUND||'1',out=join(root,'round-'+round);
const final=process.env.FINAL==='1',magick='/opt/homebrew/bin/magick',font='/System/Library/Fonts/Supplemental/Arial.ttf';
const about='purpose: Phiếu 434g, dùng lại sét dày của Ngũ Lôi\nmade-by: Codex, Chrome headless\ndoc: docs/codex-queue/434g-report.md\ndelete-when: Owner duyệt xong và không cần đối chiếu\n';
const pixels=file=>execFileSync(magick,[file,'-depth','8','rgba:-'],{maxBuffer:1280*720*4+1024});
const luminance=(p,i)=>(p[i]*.2126+p[i+1]*.7152+p[i+2]*.0722)/255;
function white(p){let rgb=0,lum=0;for(let i=0;i<p.length;i+=4){if(p[i]>=243&&p[i+1]>=243&&p[i+2]>=243)rgb++;if(luminance(p,i)>=.95)lum++;}return {whitePct:rgb/(1280*720)*100,nearWhitePct:lum/(1280*720)*100};}
function footprint(on,off){let x0=1280,y0=720,x1=-1,y1=-1,n=0;const rows=new Uint16Array(720);for(let y=0;y<720;y++)for(let x=0;x<1280;x++){const i=(y*1280+x)*4;if(Math.max(...[0,1,2].map(c=>Math.abs(on[i+c]-off[i+c])))<8)continue;n++;rows[y]++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return {thresholdChannel:8/255,boundsPx:[x0,y0,x1,y1],heightPct:n?(y1-y0+1)/720*100:0,areaPct:n/(1280*720)*100,rowsWith30PctWidth:rows.filter(x=>x>=384).length};}
function coreWidth(p,r,camera){if(!r.climax)return null;const c=new THREE.PerspectiveCamera(camera.fov,1280/720,.01,1000);c.position.fromArray(camera.position);c.quaternion.fromArray(camera.quaternion);c.updateMatrixWorld(true);const project=a=>{const v=new THREE.Vector3().fromArray(a).project(c);return [(v.x+1)*640,(1-v.y)*360];};const a=project(r.climax.start),b=project(r.climax.end),dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;const cuts=[];for(const t of [.25,.35,.45,.55,.65]){let run=0,longest=0;for(let s=-64;s<=64;s++){const x=Math.round(a[0]+dx*t+nx*s),y=Math.round(a[1]+dy*t+ny*s);if(x>=0&&x<1280&&y>=0&&y<720&&luminance(p,(y*1280+x)*4)>=.95){run++;longest=Math.max(run,longest);}else run=0;}cuts.push({fraction:t,px:longest});}return {cuts,maxPx:Math.max(...cuts.map(x=>x.px)),maxWidthPct:Math.max(...cuts.map(x=>x.px))/1280*100};}

export function sectionsWidth(on,off,r,camera,cutSegments=[4,8,13]){
 const c=new THREE.PerspectiveCamera(camera.fov,1280/720,.01,1000);c.position.fromArray(camera.position);c.quaternion.fromArray(camera.quaternion);c.updateMatrixWorld(true);
 const project=a=>{const v=new THREE.Vector3().fromArray(a).project(c);return [(v.x+1)*640,(1-v.y)*360];};
 const sample=(p,x,y)=>{if(x<0||y<0||x>=1279||y>=719)return 0;const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy;return (luminance(p,(iy*1280+ix)*4)*(1-u)+luminance(p,(iy*1280+ix+1)*4)*u)*(1-v)+(luminance(p,((iy+1)*1280+ix)*4)*(1-u)+luminance(p,((iy+1)*1280+ix+1)*4)*u)*v;};
 return (r.sections??[]).filter(s=>s.gain>=.99&&cutSegments.includes(s.segment)&&(s.primary||r.hops.some(h=>Math.abs(h.at-s.born)<1e-6))).map(s=>{
  const a=project(s.start),b=project(s.end),dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],rows=[];
  for(let d=-90;d<=90;d++){const x=mid[0]-dy/len*d,y=mid[1]+dx/len*d,Y=sample(on,x,y);rows.push({d,Y,delta:Y-sample(off,x,y)});}
  const band=fn=>{let k=90;if(!fn(rows[k])){if(fn(rows[89]))k=89;else if(fn(rows[91]))k=91;else return 0;}let lo=k,hi=k;while(lo>0&&fn(rows[lo-1]))lo--;while(hi<180&&fn(rows[hi+1]))hi++;return hi-lo+1;};
  const glowPx=band(v=>v.delta>=.1),corePx=band(v=>v.Y>=.8&&v.delta>=.1),nearWhitePx=band(v=>v.Y>=.95&&v.delta>=.1);
  return {born:s.born,slot:s.slot,segment:s.segment,primary:s.primary,endpoints:[a,b],midpoint:mid,glowPx,corePx,nearWhitePx,ratio:corePx?glowPx/corePx:null,rows};
 });
}
function artWidths(on,off,r,camera){
 const c=new THREE.PerspectiveCamera(camera.fov,1280/720,.01,1000);c.position.fromArray(camera.position);c.quaternion.fromArray(camera.quaternion);c.updateMatrixWorld(true);
 const project=a=>{const v=new THREE.Vector3().fromArray(a).project(c);return [(v.x+1)*640,(1-v.y)*360];};
 return (r.art?.links??[]).filter(l=>l.gain>.9&&!l.layer.startsWith('crawl')).map(l=>{
  const a=project(l.start),b=project(l.end),dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),cuts=[];
  for(const f of [.35,.5,.65]){let longest=0,run=0,n=0,lo=999,hi=-999;const rows=[];
   for(let d=-180;d<=180;d++){const x=Math.round(a[0]+dx*f-dy/len*d),y=Math.round(a[1]+dy*f+dx/len*d);let delta=0,Y=0;
    if(x>=0&&x<1280&&y>=0&&y<720){const i=(y*1280+x)*4;Y=luminance(on,i);delta=Y-luminance(off,i);}
    if(delta>=.1){n++;run++;longest=Math.max(longest,run);lo=Math.min(lo,d);hi=Math.max(hi,d);}else run=0;rows.push({d,Y,delta});}
   cuts.push({fraction:f,longestBodyPx:longest,litPixels:n,spanPx:n?hi-lo+1:0,rows});
  }
  const coverage=[];
  const steps=Math.max(100,Math.ceil(len));
  for(let j=0;j<=steps;j++){
   const f=j/steps;let run=0,longest=0;
   for(let d=-90;d<=90;d++){
    const x=Math.round(a[0]+dx*f-dy/len*d),y=Math.round(a[1]+dy*f+dx/len*d);
    const delta=x>=0&&x<1280&&y>=0&&y<720?luminance(on,(y*1280+x)*4)-luminance(off,(y*1280+x)*4):0;
    if(delta>=.1){run++;longest=Math.max(longest,run);}else run=0;
   }
   coverage.push({fraction:f,bodyPx:longest});
  }
  const lit=coverage.filter(x=>x.bodyPx>=3);
  return {layer:l.layer,born:l.born,primary:l.primary,endpoints:[a,b],lengthPx:len,cuts,
   coveragePct:lit.length/coverage.length*100,startGapPx:lit.length?lit[0].fraction*len:len,
   endGapPx:lit.length?(1-lit.at(-1).fraction)*len:len,coverage};
 });
}
const p95=a=>a.toSorted((a,b)=>a-b)[Math.ceil(a.length*.95)-1];
export default async function(page){
 // Ignore Vite's development notifications while other lanes edit the shared host.
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
  const Native=window.WebSocket;
  window.WebSocket=new Proxy(Native,{construct(Target,args){
   if(args[1]==='vite-hmr'){
    const socket=new EventTarget();Object.assign(socket,{url:String(args[0]),readyState:1,send(){},close(){}});
    queueMicrotask(()=>{const event=new Event('open');socket.dispatchEvent(event);socket.onopen?.(event);});
    return socket;
   }
   return Reflect.construct(Target,args);
  }});
 })()`});
 if(page.width!==1280||page.height!==720||page.dpr!==1)throw new Error('Cần 1280×720 DPR 1');
 for(const dir of [root,out]){mkdirSync(dir,{recursive:true});if(!existsSync(join(dir,'ABOUT.md')))writeFileSync(join(dir,'ABOUT.md'),about);}
 const ev=async code=>{const x=await page.eval(code);if(x?.evalError)throw new Error(x.evalError);return x;};
 const wait=async code=>{for(let i=0;i<200;i++){if(await ev(code))return;await page.sleep(250);}throw new Error('Chưa sẵn sàng: '+code);};
 const hide=()=>ev(`(()=>{const style=document.createElement('style');style.textContent='body *{visibility:hidden!important}canvas{visibility:visible!important}';document.head.append(style);return true;})()`);
 const load=async path=>{await page.goto('http://localhost:3148/'+path,{settle:1000});await wait('window.__lab?.ready');await hide();};
 const setLink=(link,on)=>ev(`(async()=>{
   const m=await import('/src/lab/thunder-ult-nguloi.ts');
   if(!${link.primary})m.thunderHopHideEnd.value.fromArray(${JSON.stringify(on?[1e6,1e6,1e6]:link.end)});
   window.__lab.fxShowNamed('flipbook-thunder-nguloi-${link.layer}',${link.primary?on:true});
   if(${link.primary})window.__lab.fxShowNamed('flipbook-thunder-nguloi-columnCoreA',${on});
   return true;
 })()`);
 const soloLink=(link,on)=>ev(`(async()=>{
   const m=await import('/src/lab/thunder-ult-nguloi.ts');
   m.thunderHopSoloEnd.value.fromArray(${JSON.stringify(on?link.end:[1e6,1e6,1e6])});
   window.__lab.fxShowNamed('flipbook-thunder-nguloi-boltA',true);return true;
 })()`);
 const start=view=>ev(`(()=>{const l=window.__lab;l.view('play');l.reset();l.setHerd('march');l.viewMode('top');l.camera('play');l.step(45);l.viewMode(${JSON.stringify(view)});l.step(45);l.showcase('ult-thunder-nine-heavens-v2');l.step(1,0);return {camera:l.captureCamera(),state:l.thunderUlt()};})()`);
 const seek=t=>ev(`(()=>{const l=window.__lab;for(let i=0;i<1000&&l.thunderUlt().last.clock<${t}-1e-8&&l.thunderUlt().active;i++)l.step(1,Math.min(1/60,${t}-l.thunderUlt().last.clock));return l.thunderUlt().last;})()`);
 await load('skills-lab.html?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40');
 await wait('window.__lab.thunderUlt().ready');await start('top');await seek(4);
 const phases=[];
 for(const view of ['top','behind']){
  const initial=await start(view);
  for(const t of [.4,1.2,1.35,2,2+1/60,2.2,2.5,3]){
   const state=await seek(t),camera=await ev('window.__lab.captureCamera()'),file=join(out,`${view}-${t.toFixed(3)}s.png`);await page.shot(file);
   const p=pixels(file);await ev("window.__lab.fxShowNamed('fx-cloud-volume',false)");
   const off=join(out,`${view}-${t.toFixed(3)}s-cloud-off.png`);await page.shot(off);await ev("window.__lab.fxShowNamed('fx-cloud-volume',true)");
   const cloud=await ev(`(async()=>{
     const m=await import('/src/lab/cloud-volume-probe.ts'),l=window.__lab,r=l.thunderUlt().last;
     const beasts=Array.from({length:87},(_,id)=>({id,...l.beast(id)})).filter(b=>b.alive&&!b.hero)
       .map(b=>({id:b.id,screen:[b.x,b.y]}));
     const probe=m.probeCloudSnapshot(r.cloudState,l.captureCamera(),beasts);
     if(r.climax){const v=await import('/node_modules/.vite/deps/three.js'),c=new v.PerspectiveCamera(l.captureCamera().fov,1280/720,.01,1000);c.position.fromArray(l.captureCamera().position);c.quaternion.fromArray(l.captureCamera().quaternion);c.updateMatrixWorld(true);const p=new v.Vector3().fromArray(r.climax.start).project(c),screen=[(p.x+1)*640,(1-p.y)*360];const origin=m.probeCloudSnapshot(r.cloudState,l.captureCamera(),[{id:-1,screen}]);probe.trunkOrigin=origin.centres[0];}
     return probe;
   })()`);
   await ev("window.__lab.fxShowNamed('flipbook-thunder-nguloi-',false)");
   const arcsOff=join(out,`${view}-${t.toFixed(3)}s-arcs-off.png`);await page.shot(arcsOff);
   await ev("window.__lab.fxShowNamed('flipbook-thunder-nguloi-',true)");
   
   const widths=[];
   for(const link of (state.art?.links??[]).filter(l=>l.gain>.9&&!l.layer.startsWith('crawl'))){
    const prefix='flipbook-thunder-nguloi-'+link.layer;
    await setLink(link, false);
    const separate=join(out,`${view}-${t.toFixed(3)}s-${link.layer}-off.png`);await page.shot(separate);
    widths.push(...artWidths(p,pixels(separate),{art:{links:[link]}},camera));
    await setLink(link, true);
   }
   phases.push({view,t,state,camera,initial,file,...white(p),core:coreWidth(p,state,camera),cloud,widths});
  }
 }
 const denseGate=phases.filter(p=>[.4,1.2,2.2,3].includes(p.t)).every(p=>p.cloud.coveredBeasts===0&&(p.view!=='top'||(p.cloud.dense.bottomPct>=15&&p.cloud.dense.bottomPct<=25&&p.cloud.dense.widthFraction>=.6&&p.cloud.dense.boundsPx?.[1]===0)));
 const hops=phases.find(p=>p.view==='top'&&p.t===2.2).state.hops;
 const turns=hops.slice(1).map(h=>h.turnDeg),turnGate=hops.length>=2&&turns.every((a,i)=>Math.abs(a)>=35&&Math.abs(a)<=80&&(i===0||a*turns[i-1]<0));
 const clouds=[];
 for(const view of ['top','behind']){
  const selected=phases.filter(p=>p.view===view&&[.4,1.2,2.2,3].includes(p.t));
  execFileSync(magick,['montage','-font',font,'-pointsize','18','-fill','#dddfff',...selected.flatMap(p=>['-label',`${view} / ${p.t.toFixed(1)} s`,p.file]),'-tile','2x2','-geometry','640x360+3+3','-background','#10141b',join(out,`${view}-sheet.jpg`)]);
 }
 const ref=join(repo,'games/immortality-cultivation/art-src/concept/ult-storyboards/ult-storyboard-samples-431.jpg');
 const cropped=join(out,'storyboard-thunder.jpg');execFileSync(magick,[ref,'-gravity','East','-crop','50%x100%+0+0','+repage',cropped]);
 execFileSync(magick,['montage','-font',font,'-pointsize','23','-fill','#dddfff','-label','STORYBOARD / THUNDER',cropped,'-label','PLAY / ALT+1',join(out,'top-sheet.jpg'),'-label','BEHIND / ALT+2',join(out,'behind-sheet.jpg'),'-tile','3x1','-geometry','1280x800+4+4','-background','#10141b',join(out,'comparison.jpg')]);
 writeFileSync(join(out,'phase-measure.json'),JSON.stringify({round,denseGate,turnGate,hops,phases,logs:page.logs,exceptions:page.exceptions},null,2));
 if(!denseGate)throw new Error("Dải mây alpha 0,5 chưa đạt; xem phase-measure.json");
 const hopChecks=[];
 await start('top');
 for(let j=0;j<hops.length;j++){
  const t=.65+j*.1,state=await seek(t),camera=await ev('window.__lab.captureCamera()');
  const links=(state.art?.links??[]).filter(l=>l.layer.startsWith('bolt')),link=links.at(-1);
  if(!link)continue;
  const file=join(out,`hop-${j+1}-on.png`),off=join(out,`hop-${j+1}-off.png`);await page.shot(file);
  await soloLink(link,true);const isolated=join(out,`hop-${j+1}-isolated.png`);await page.shot(isolated);
  await setLink(link,false);await page.shot(off);
  await setLink(link,true);await soloLink(link,false);
  hopChecks.push({hop:j+1,t,layer:link.layer,widths:artWidths(pixels(isolated),pixels(off),{art:{links:[link]}},camera)});
 }
 writeFileSync(join(out,'hop-checks.json'),JSON.stringify(hopChecks,null,2));
 execFileSync(magick,['montage','-font',font,'-pointsize','18','-fill','#dddfff',...hopChecks.flatMap(h=>['-label',`Bước ${h.hop}`,join(out,`hop-${h.hop}-on.png`)]),'-tile','2x4','-geometry','640x360+3+3','-background','#10141b',join(out,'hop-check-sheet.jpg')]);
 let stress=null,scan=[];
 {
  await load('stress.html?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40');await wait('window.__stress?.ready');await wait('window.__lab.thunderUlt().ready');
  const runs=[];
  for(let k=0;k<4;k++){await start('top');const population=await ev('({targets:Array.from({length:87},(_,i)=>window.__lab.beast(i)).filter(b=>b.alive).length,walkers:window.__stress.report().walkers.instances})');if(population.targets+population.walkers!==100)throw new Error('Không đủ 100 quái');const measured=await ev(`(()=>{const rows=[];for(let i=0;i<240;i++){const p=window.__lab.perf(1);rows.push({clock:window.__lab.thunderUlt().last.clock,cpu:p.cpu[0],total:p.total[0],gpu:p.gpu,draws:p.drawCalls});}return {rows,state:window.__lab.thunderUlt(),memory:window.__lab.memory()};})()`);runs.push({population,...measured});}
  const rows=runs.slice(1).flatMap(r=>r.rows);stress={runs,p95TotalMs:p95(rows.map(r=>r.total)),p95CpuMs:p95(rows.map(r=>r.cpu)),gpu:rows[0].gpu,warmupExcluded:1};
  writeFileSync(join(out,'stress.json'),JSON.stringify(stress,null,2));
 }
 if(final){
  // 60 Hz screenshots audit every simulated frame in both cameras; even frames form the 30 fps clip.
  await load('skills-lab.html?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40');await wait('window.__lab.thunderUlt().ready');
  for(const view of ['top','behind']){
   const raw=join(out,'frames-'+view);mkdirSync(raw,{recursive:true});writeFileSync(join(raw,'ABOUT.md'),about);
   await start(view);if(view==='top'){await ev("window.__lab.soundRecord();window.__lab.showcase('ult-thunder-nine-heavens-v2');true");}
   for(let f=0;f<240;f++){if(f)await ev('window.__lab.step(1);true');const file=join(raw,`f${String(f).padStart(4,'0')}.png`);await page.shot(file);const p=pixels(file),state=await ev('window.__lab.thunderUlt().last');scan.push({view,frame:f,time:f/60,...white(p),core:coreWidth(p,state,await ev('window.__lab.captureCamera()'))});}
   if(view==='top')writeFileSync(join(out,'sound-takes.json'),JSON.stringify(await ev('window.__lab.soundTakes()'),null,2));
  }
 }
 if(process.env.FIVE==='1'){
  await start('top'); await seek(4); await ev('window.__lab.reset();window.__lab.thunder();true'); await wait('window.__lab.thunder().ready');
  for(const view of ['top','behind']){await ev(`window.__lab.reset();window.__lab.viewMode('${view}');window.__lab.step(90);window.__lab.thunderFinisher('eightRuns');window.__lab.thunder(true);window.__lab.step(300);true`);await page.shot(join(out,'nguloi-'+view+'.png'));}
 }
 const hopSummary=hopChecks.map(h=>({hop:h.hop,bodyPx:Math.min(...h.widths[0].cuts.map(c=>c.longestBodyPx)),coveragePct:h.widths[0].coveragePct,startGapPx:h.widths[0].startGapPx,endGapPx:h.widths[0].endGapPx}));
 const result={round,hopSummary,hopChecks,denseGate,turnGate,hops,phases,clouds,stress,scan,logs:page.logs,exceptions:page.exceptions};writeFileSync(join(out,'measure.json'),JSON.stringify(result,null,2));
 return {out,hopSummary,maxWhitePct:Math.max(...phases.map(p=>p.whitePct),...scan.map(p=>p.whitePct)),denseGate,turnGate,turns,phases:phases.map(p=>({view:p.view,t:p.t,white:p.whitePct,nearWhite:p.nearWhitePct,corePx:p.core?.maxPx,cloudBottomPct:p.cloud.bottomPct,denseCloud:{bottomPct:p.cloud.dense.bottomPct,widthFraction:p.cloud.dense.widthFraction},trunkOrigin:p.cloud.trunkOrigin,covered:p.cloud.coveredBeasts,cloudHeightPct:p.cloud.heightFraction*100,widths:p.widths.map(w=>({born:w.born,layer:w.layer,cuts:w.cuts.map(({rows,...c})=>c)}))})),clouds:[],stress:stress&&{p95:stress.p95TotalMs,gpu:stress.gpu},scan:scan.length,exceptions:page.exceptions};
}

