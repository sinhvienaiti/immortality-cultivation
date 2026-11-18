/** Ticket 434c: existing localhost host, headless capture, pixel and GPU measurements. */
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import * as THREE from 'three';
const repo='/Volumes/SS990TPRO/htdocs/typing-game',review='/Volumes/SS990TPRO/htdocs/typing-game-review';
const root=join(review,'captures/tu-tien/thunder-ult-434c'),round=process.env.ROUND||'1',out=join(root,'round-'+round);
const final=process.env.FINAL==='1',magick='/opt/homebrew/bin/magick',font='/System/Library/Fonts/Supplemental/Arial.ttf';
const about='purpose: Phiếu 434c, sét dây chuyền zíc zắc và mây bão\nmade-by: Codex, Chrome headless\ndoc: docs/codex-queue/434c-report.md\ndelete-when: Owner duyệt xong và không cần đối chiếu\n';
const pixels=file=>execFileSync(magick,[file,'-depth','8','rgba:-'],{maxBuffer:1280*720*4+1024});
const luminance=(p,i)=>(p[i]*.2126+p[i+1]*.7152+p[i+2]*.0722)/255;
function white(p){let rgb=0,lum=0;for(let i=0;i<p.length;i+=4){if(p[i]>=243&&p[i+1]>=243&&p[i+2]>=243)rgb++;if(luminance(p,i)>=.95)lum++;}return {whitePct:rgb/(1280*720)*100,nearWhitePct:lum/(1280*720)*100};}
function footprint(on,off){let x0=1280,y0=720,x1=-1,y1=-1,n=0;const rows=new Uint16Array(720);for(let y=0;y<720;y++)for(let x=0;x<1280;x++){const i=(y*1280+x)*4;if(Math.max(...[0,1,2].map(c=>Math.abs(on[i+c]-off[i+c])))<8)continue;n++;rows[y]++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return {thresholdChannel:8/255,boundsPx:[x0,y0,x1,y1],heightPct:n?(y1-y0+1)/720*100:0,areaPct:n/(1280*720)*100,rowsWith30PctWidth:rows.filter(x=>x>=384).length};}
function coreWidth(p,r,camera){if(!r.climax)return null;const c=new THREE.PerspectiveCamera(camera.fov,1280/720,.01,1000);c.position.fromArray(camera.position);c.quaternion.fromArray(camera.quaternion);c.updateMatrixWorld(true);const project=a=>{const v=new THREE.Vector3().fromArray(a).project(c);return [(v.x+1)*640,(1-v.y)*360];};const a=project(r.climax.start),b=project(r.climax.end),dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;const cuts=[];for(const t of [.25,.35,.45,.55,.65]){let run=0,longest=0;for(let s=-64;s<=64;s++){const x=Math.round(a[0]+dx*t+nx*s),y=Math.round(a[1]+dy*t+ny*s);if(x>=0&&x<1280&&y>=0&&y<720&&luminance(p,(y*1280+x)*4)>=.95){run++;longest=Math.max(run,longest);}else run=0;}cuts.push({fraction:t,px:longest});}return {cuts,maxPx:Math.max(...cuts.map(x=>x.px)),maxWidthPct:Math.max(...cuts.map(x=>x.px))/1280*100};}
const p95=a=>a.toSorted((a,b)=>a-b)[Math.ceil(a.length*.95)-1];
export default async function(page){
 if(page.width!==1280||page.height!==720||page.dpr!==1)throw new Error('Cần 1280×720 DPR 1');
 for(const dir of [root,out]){mkdirSync(dir,{recursive:true});if(!existsSync(join(dir,'ABOUT.md')))writeFileSync(join(dir,'ABOUT.md'),about);}
 const ev=async code=>{const x=await page.eval(code);if(x?.evalError)throw new Error(x.evalError);return x;};
 const wait=async code=>{for(let i=0;i<200;i++){if(await ev(code))return;await page.sleep(250);}throw new Error('Chưa sẵn sàng: '+code);};
 const hide=()=>ev(`(()=>{const style=document.createElement('style');style.textContent='body *{visibility:hidden!important}canvas{visibility:visible!important}';document.head.append(style);return true;})()`);
 const load=async path=>{await page.goto('http://localhost:3148/'+path,{settle:1000});await wait('window.__lab?.ready');await hide();};
 const start=view=>ev(`(()=>{const l=window.__lab;l.view('play');l.reset();l.setHerd('march');l.viewMode('top');l.camera('play');l.step(45);l.viewMode(${JSON.stringify(view)});l.step(45);l.showcase('ult-thunder-nine-heavens-v2');l.step(1,0);return {camera:l.captureCamera(),state:l.thunderUlt()};})()`);
 const seek=t=>ev(`(()=>{const l=window.__lab;for(let i=0;i<1000&&l.thunderUlt().last.clock<${t}-1e-8&&l.thunderUlt().active;i++)l.step(1,Math.min(1/60,${t}-l.thunderUlt().last.clock));return l.thunderUlt().last;})()`);
 await load('skills-lab.html?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40');
 await wait('window.__lab.thunderUlt().ready');await start('top');await seek(3.5);
 const phases=[];
 for(const view of ['top','behind']){
  const initial=await start(view);
  for(const t of [.4,1.2,2,2+1/60,2.2,3]){
   const state=await seek(t),camera=await ev('window.__lab.captureCamera()'),file=join(out,`${view}-${t.toFixed(3)}s.png`);await page.shot(file);
   const p=pixels(file);await ev("window.__lab.fxShowNamed('fx-cloud-volume',false)");
   const off=join(out,`${view}-${t.toFixed(3)}s-cloud-off.png`);await page.shot(off);await ev("window.__lab.fxShowNamed('fx-cloud-volume',true)");
   phases.push({view,t,state,camera,initial,file,...white(p),core:coreWidth(p,state,camera),cloud:footprint(p,pixels(off))});
  }
 }
 const hops=phases.find(p=>p.view==='top'&&p.t===2.2).state.hops;
 const turns=hops.slice(1).map(h=>h.turnDeg),turnGate=hops.length>=2&&turns.every((a,i)=>Math.abs(a)>=35&&Math.abs(a)<=80&&(i===0||a*turns[i-1]<0));
 const clouds=[];
 await load('skills-lab.html?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40&cloud=thunder');
 await wait('!!window.__cloud438');await ev('window.__cloud438.show();window.__lab.step(90);true');
 for(const view of ['top','behind']){await ev(`window.__lab.viewMode('${view}');window.__lab.step(45);true`);const file=join(out,`cloud-${view}.png`);await page.shot(file);const probe=await ev('window.__cloud438.probe(30)');clouds.push({view,file,probe});}
 for(const view of ['top','behind']){
  const selected=phases.filter(p=>p.view===view&&[.4,1.2,2.2,3].includes(p.t));
  execFileSync(magick,['montage','-font',font,'-pointsize','18','-fill','#dddfff',...selected.flatMap(p=>['-label',`${view} / ${p.t.toFixed(1)} s`,p.file]),'-tile','2x2','-geometry','640x360+3+3','-background','#10141b',join(out,`${view}-sheet.jpg`)]);
 }
 const ref=join(repo,'games/immortality-cultivation/art-src/concept/ult-storyboards/ult-storyboard-samples-431.jpg');
 const cropped=join(out,'storyboard-thunder.jpg');execFileSync(magick,[ref,'-gravity','East','-crop','50%x100%+0+0','+repage',cropped]);
 execFileSync(magick,['montage','-font',font,'-pointsize','23','-fill','#dddfff','-label','STORYBOARD / THUNDER',cropped,'-label','PLAY / ALT+1',join(out,'top-sheet.jpg'),'-label','BEHIND / ALT+2',join(out,'behind-sheet.jpg'),'-tile','3x1','-geometry','1280x800+4+4','-background','#10141b',join(out,'comparison.jpg')]);
 execFileSync(magick,['montage','-font',font,'-pointsize','20','-fill','#dddfff',...clouds.flatMap(c=>['-label',`THUNDER CLOUD / ${c.view}`,c.file]),'-tile','2x1','-geometry','1280x720+3+3','-background','#10141b',join(out,'clouds-sheet.jpg')]);
 let stress=null,scan=[];
 if(final){
  await load('stress.html?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40');await wait('window.__stress?.ready');await wait('window.__lab.thunderUlt().ready');
  const runs=[];
  for(let k=0;k<4;k++){await start('top');const population=await ev('({targets:Array.from({length:87},(_,i)=>window.__lab.beast(i)).filter(b=>b.alive).length,walkers:window.__stress.report().walkers.instances})');if(population.targets+population.walkers!==100)throw new Error('Không đủ 100 quái');const measured=await ev(`(()=>{const rows=[];for(let i=0;i<240;i++){const p=window.__lab.perf(1);rows.push({clock:window.__lab.thunderUlt().last.clock,cpu:p.cpu[0],total:p.total[0],gpu:p.gpu,draws:p.drawCalls});}return {rows,state:window.__lab.thunderUlt(),memory:window.__lab.memory()};})()`);runs.push({population,...measured});}
  const rows=runs.slice(1).flatMap(r=>r.rows);stress={runs,p95TotalMs:p95(rows.map(r=>r.total)),p95CpuMs:p95(rows.map(r=>r.cpu)),gpu:rows[0].gpu,warmupExcluded:1};
  // 60 Hz screenshots audit every simulated frame in both cameras; even frames form the 30 fps clip.
  await load('skills-lab.html?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40');await wait('window.__lab.thunderUlt().ready');
  for(const view of ['top','behind']){
   const raw=join(out,'frames-'+view);mkdirSync(raw,{recursive:true});writeFileSync(join(raw,'ABOUT.md'),about);
   await start(view);if(view==='top'){await ev("window.__lab.soundRecord();window.__lab.showcase('ult-thunder-nine-heavens-v2');true");}
   for(let f=0;f<240;f++){if(f)await ev('window.__lab.step(1);true');const file=join(raw,`f${String(f).padStart(4,'0')}.png`);await page.shot(file);const p=pixels(file),state=await ev('window.__lab.thunderUlt().last');scan.push({view,frame:f,time:f/60,...white(p),core:coreWidth(p,state,await ev('window.__lab.captureCamera()'))});}
   if(view==='top')writeFileSync(join(out,'sound-takes.json'),JSON.stringify(await ev('window.__lab.soundTakes()'),null,2));
  }
 }
 const result={round,turnGate,hops,phases,clouds,stress,scan,logs:page.logs,exceptions:page.exceptions};writeFileSync(join(out,'measure.json'),JSON.stringify(result,null,2));
 return {out,turnGate,turns,phases:phases.map(p=>({view:p.view,t:p.t,white:p.whitePct,nearWhite:p.nearWhitePct,corePx:p.core?.maxPx,cloudHeightPct:p.cloud.heightPct})),clouds:clouds.map(c=>({view:c.view,footprint:c.probe.footprint})),stress:stress&&{p95:stress.p95TotalMs,gpu:stress.gpu},scan:scan.length,exceptions:page.exceptions};
}
