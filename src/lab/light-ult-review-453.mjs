/** Phiếu 453: cùng máy quay/đàn quái của light-ult-review-g; không build hoặc chạy bộ test. */
import {mkdirSync,writeFileSync,appendFileSync,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const repo='/Volumes/SS990TPRO/htdocs/typing-game',review='/Volumes/SS990TPRO/htdocs/typing-game-review';
const out=join(review,'captures/tu-tien/light-ult-453'),owner=join(review,'owner-review/2026-11-18/tu-tien');
const magick='/opt/homebrew/bin/magick',font='/System/Library/Fonts/Supplemental/Arial.ttf';
const preview=process.env.PREVIEW==='1';
const p95=values=>values.toSorted((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
const white=file=>Number(execFileSync(magick,[file,'-fx','r>=.95&&g>=.95&&b>=.95?1:0','-format','%[fx:mean*100]','info:'],{encoding:'utf8'}));
const about='purpose: Phiếu 453, thay tia/quạt đất/bảo kính bằng tài nguyên đã duyệt\nmade-by: Codex, Chrome headless trên Metal M4\ndoc: docs/codex-queue/453-report.md\ndelete-when: Owner duyệt xong ba lớp Ánh Sáng\n';
export default async function(page){
 mkdirSync(out,{recursive:true});if(!existsSync(join(out,'ABOUT.md')))writeFileSync(join(out,'ABOUT.md'),about);
 const ev=async code=>{const x=await page.eval(code);if(x?.evalError)throw new Error(x.evalError);return x;};
 const wait=async code=>{for(let i=0;i<200;i++){if(await ev(code))return;await page.sleep(300);}throw new Error('Chưa sẵn sàng: '+code);};
 const goto=async stress=>{
  await page.goto('http://localhost:3148/'+(stress?'stress':'skills-lab')+'.html?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40',{settle:1000});
  await wait('window.__lab?.ready');await wait('window.__lab.lightUlt().ready');
  if(stress)await wait('window.__stress?.ready');
  await ev(`(()=>{const s=document.createElement('style');s.textContent='body > :not(#ic-lab){display:none!important}';document.head.append(s);return true})()`);
  if(stress)return;
  await ev(`Promise.all(['light-ult-fan-space.ts','light-ult-ground.ts'].map(file=>import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/lab/'+file)).name))).then(([space,ground])=>{
   window.__art453={};
   const patch=(prototype,method,key,report)=>{const old=prototype[method];prototype[method]=function(...args){const result=old.apply(this,args);window.__art453[key]=report(this,args);return result;};};
   patch(space.FanBeams.prototype,'set','beams',(self)=>self.rows.filter(r=>r.mesh.visible).map(r=>({name:r.mesh.name,map:r.mesh.material.map?.image?.src,color:r.mesh.material.color.toArray(),opacity:r.mesh.material.opacity,scale:r.mesh.scale.toArray(),position:r.mesh.position.toArray(),quaternion:r.mesh.quaternion.toArray(),vertices:r.mesh.geometry.getAttribute('position').count,focus:r.hdr})));
   patch(ground.LightWedgeSpill.prototype,'set','ground',(self)=>({map:self.mesh.material.map?.image?.src,color:self.mesh.material.color.toArray(),opacity:self.mesh.material.opacity,scale:self.mesh.scale.toArray(),position:self.mesh.position.toArray(),quaternion:self.mesh.quaternion.toArray()}));
   patch(space.HeldLens.prototype,'pose','lens',(self)=>{const meshes=[];self.root.traverse(o=>{if(o.isMesh)meshes.push({triangles:o.geometry.index.count/3,groups:o.geometry.groups,materials:(Array.isArray(o.material)?o.material:[o.material]).map(m=>({env:!!m.envMap,environment:m.envMap?.image?.width,envIntensity:m.envMapIntensity,emissive:m.emissive.toArray(),emissiveIntensity:m.emissiveIntensity,baseMap:!!m.map,normalMap:!!m.normalMap,roughnessMap:!!m.roughnessMap,metalnessMap:!!m.metalnessMap}))});});return {meshes,box:self.bounds,grips:self.grips.map(p=>p.toArray())};});
   return true;
  })`);
 };
 const start=async view=>{
  await ev(`(()=>{const l=window.__lab;l.view('play');l.reset();l.setHerd('march');l.viewMode('top');l.camera('play');l.step(45);return true})()`);
  const key=view==='top'?'1':'2';
  await page.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:'Digit'+key,modifiers:1});
  await page.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:'Digit'+key,modifiers:1});
  await ev(`window.__lab.step(45);window.__lab.showcase('ult-light');window.__lab.soundRecord();true`);
  await page.key('8',{code:'Digit8'});await ev('window.__lab.step(1,0);true');
  return ev('({mode:window.__lab.viewMode(),camera:window.__lab.captureCamera(),state:window.__lab.lightUlt()})');
 };
 const seek=t=>ev(`(()=>{const l=window.__lab;for(let i=0;i<600&&l.lightUlt().last.clock<${t}-1e-8;i++)l.step(1,Math.min(1/60,${t}-l.lightUlt().last.clock));return {state:l.lightUlt(),art:window.__art453}})()`);
 await goto(false);await start('top');await seek(3.6);
 const phases=[];
 for(const view of ['top','behind']){
  const initial=await start(view);
  for(const t of [.3,.9,1.6,1.85,1.95,1.95+1/60,2.05,2.6]){
   const state=await seek(t),file=join(out,`${view}-${t.toFixed(3)}.png`);await page.shot(file);
   phases.push({view,t,initial,file,...state,whitePct:white(file)});
  }
 }
 const sheet=join(out,'light-ult-453.jpg');
 execFileSync(magick,['montage','-font',font,'-pointsize','17','-fill','#e7d7ab',...phases.filter(p=>[.3,.9,1.85,1.95+1/60,2.6].includes(p.t)).flatMap(p=>['-label',`${p.view==='top'?'Alt+1':'Alt+2'} / ${p.t.toFixed(3)} s`,p.file]),'-tile','5x2','-geometry','640x360+3+3','-background','#111720',sheet]);
 const result={phases,logs:page.logs,exceptions:page.exceptions};
 writeFileSync(join(out,preview?'preview.json':'measure.json'),JSON.stringify(result,null,2));
 if(preview)return {out,sheet,whiteMax:Math.max(...phases.map(p=>p.whitePct)),exceptions:page.exceptions};
 const clips=[];const whiteByFrame=[];
 for(const view of ['top','behind']){
  const raw=join(out,'frames-'+view);mkdirSync(raw,{recursive:true});writeFileSync(join(raw,'ABOUT.md'),about);
  await start(view);
  for(let f=0;f<120;f++){
   if(f)await ev('window.__lab.step(2);true');
   const file=join(raw,`frame-${String(f).padStart(4,'0')}.png`);await page.shot(file);
   whiteByFrame.push({view,f,whitePct:white(file)});
  }
  const sound=join(out,'sound-'+view+'.json');writeFileSync(sound,JSON.stringify(await ev('window.__lab.soundTakes()'),null,2));
  const wav=join(out,'sound-'+view+'.wav');
  execFileSync(join(repo,'games/.wt-ic-lab-all/node_modules/.bin/tsx'),[join(repo,'games/.wt-ic-lab-all/scripts/visual/mix-lab-sound.mjs'),sound,wav,'--duration=4','--root='+join(repo,'games/.wt-ic-lab-all')],{env:process.env});
  const clip=join(out,view+'.mp4');
  execFileSync('/opt/homebrew/bin/ffmpeg',['-y','-v','error','-framerate','30','-i',join(raw,'frame-%04d.png'),'-i',wav,'-t','4','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k',clip]);clips.push(clip);
 }
 mkdirSync(owner,{recursive:true});
 execFileSync('/opt/homebrew/bin/ffmpeg',['-y','-v','error',...clips.flatMap(p=>['-i',p]),'-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v];[0:a][1:a]concat=n=2:v=0:a=1[a]','-map','[v]','-map','[a]','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k',join(owner,'light-ult-453.mp4')]);
 execFileSync('/bin/cp',[sheet,join(owner,'light-ult-453.jpg')]);
 await goto(true);const runs=[];
 for(let k=0;k<4;k++){
  await start('top');
  const population=await ev('({targets:Array.from({length:87},(_,i)=>window.__lab.beast(i)).filter(b=>b.alive).length,walkers:window.__stress.report().walkers.instances})');
  if(population.targets+population.walkers!==100)throw new Error('Không đủ 100 quái');
  const rows=await ev(`(()=>{const rows=[];for(let i=0;i<240;i++){const p=window.__lab.perf(1);rows.push({clock:window.__lab.lightUlt().last.clock,cpu:p.cpu[0],total:p.total[0],draws:p.drawCalls,triangles:p.triangles,gpu:p.gpu});}return rows})()`);
  runs.push({population,rows,p95:p95(rows.map(r=>r.total))});
 }
 const rows=runs.slice(1).flatMap(r=>r.rows);
 result.stress={warmupExcluded:1,runs,p95TotalMs:p95(rows.map(r=>r.total)),p95CpuMs:p95(rows.map(r=>r.cpu)),gpu:rows[0].gpu};
 result.whiteByFrame=whiteByFrame;result.whiteMax=Math.max(...[...phases,...whiteByFrame].map(p=>p.whitePct));
 result.logs=page.logs;result.exceptions=page.exceptions;
 writeFileSync(join(out,'measure.json'),JSON.stringify(result,null,2));
 if(!readFileSync(join(owner,'ABOUT.md'),'utf8').includes('light-ult-453.jpg/.mp4:'))appendFileSync(join(owner,'ABOUT.md'),'\nlight-ult-453.jpg/.mp4: Phiếu 453, tia B, vệt đất C và bảo kính Tripo; hai góc Alt+1/Alt+2, nền #353a40, giữ âm gốc; báo cáo docs/codex-queue/453-report.md.\n');
 if(result.whiteMax>6||result.stress.p95TotalMs>16.7||/swiftshader|llvmpipe|software|unknown/i.test(result.stress.gpu)||page.exceptions.length)throw new Error('Cổng đo chưa đạt: '+JSON.stringify({white:result.whiteMax,p95:result.stress.p95TotalMs,gpu:result.stress.gpu,exceptions:page.exceptions}));
 return {out,sheet:join(owner,'light-ult-453.jpg'),clip:join(owner,'light-ult-453.mp4'),whiteMax:result.whiteMax,stress:{p95:result.stress.p95TotalMs,gpu:result.stress.gpu},exceptions:page.exceptions};
}
