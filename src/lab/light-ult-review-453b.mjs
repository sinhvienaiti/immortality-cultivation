/** Phiếu 453b: cùng máy quay/đàn quái của light-ult-review-g; không build hoặc chạy bộ test. */
import {mkdirSync,writeFileSync,appendFileSync,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const repo='/Volumes/SS990TPRO/htdocs/typing-game',review='/Volumes/SS990TPRO/htdocs/typing-game-review';
const out=join(review,'captures/tu-tien/light-ult-453b'),owner=join(review,'owner-review/2026-11-18/tu-tien');
const magick='/opt/homebrew/bin/magick',font='/System/Library/Fonts/Supplemental/Arial.ttf';
const preview=process.env.PREVIEW==='1';
const p95=values=>values.toSorted((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
const white=file=>Number(execFileSync(magick,[file,'-fx','r>=.95&&g>=.95&&b>=.95?1:0','-format','%[fx:mean*100]','info:'],{encoding:'utf8'}));
const about='purpose: Phiếu 453b, bảo kính lơ lửng trên đầu, lớn hơn và rõ ở Alt+1\nmade-by: Codex, Chrome headless trên Metal M4\ndoc: docs/codex-queue/453b-report.md\ndelete-when: Owner duyệt xong ba lớp Ánh Sáng\n';
function validate(result){
 const allFrames=result.frames;
 const live=allFrames.filter(p=>p.state.active),top=live.filter(p=>p.view==='top');
 const max=values=>Math.max(...values),min=values=>Math.min(...values);
 const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 const faceDeviation=p=>{const [x,y,z,w]=p.art.lens.quaternion,a=[-2*(x*z+y*w),-2*(y*z-x*w),-(1-2*(x*x+y*y))],b=p.state.last.axisWorld;return Math.acos(Math.max(-1,Math.min(1,a.reduce((s,v,i)=>s+v*b[i],0))))*180/Math.PI};
 result.validation={glassDiameterMinPx:min(top.map(p=>max([p.art.lens.glass.width,p.art.lens.glass.height]))),glassMinorMinPx:min(top.map(p=>min([p.art.lens.glass.width,p.art.lens.glass.height]))),modelWidthMinPx:min(top.map(p=>p.art.lens.geometry.width)),modelHeightMinPx:min(top.map(p=>p.art.lens.geometry.height)),headClearanceMinM:min(live.map(p=>p.art.lens.floorY-p.art.lens.headY)),faceAxisDeviationMaxDeg:max(live.map(faceDeviation)),beamSourceOffsetMaxM:max(live.filter(p=>p.state.last.beamCount>0).flatMap(p=>p.art.beams.map(b=>dist(b.position,p.state.last.source)))),sourceOffsetMaxM:max(live.map(p=>dist(p.state.last.source,p.art.lens.centre))),groundOffsetMaxM:max(live.map(p=>Math.hypot(p.art.ground.position[0]-p.state.last.source[0],p.art.ground.position[2]-p.state.last.source[2]))),secondaryChannelMax:max(live.flatMap(p=>[...p.art.beams.filter(b=>!b.focus).flatMap(b=>b.color),...p.art.ground.color])),uniformScaleError:max(live.map(p=>max(p.art.lens.scale)-min(p.art.lens.scale))),focusAxisDeviationMaxDeg:max(live.map(p=>p.state.last.focusAxisDeviationDeg)),lensInFrame:live.every(p=>p.state.last.lens.inside)};
 writeFileSync(join(out,'measure.json'),JSON.stringify(result,null,2));
 writeFileSync(join(out,'summary.json'),JSON.stringify({validation:result.validation,whiteMax:result.whiteMax,stress:{p95TotalMs:result.stress.p95TotalMs,p95CpuMs:result.stress.p95CpuMs,gpu:result.stress.gpu},exceptions:result.exceptions},null,2));
 if(result.validation.glassDiameterMinPx<40||result.validation.beamSourceOffsetMaxM>1e-6||result.validation.faceAxisDeviationMaxDeg>.001||!result.validation.lensInFrame||result.validation.headClearanceMinM<0||result.validation.sourceOffsetMaxM>1e-6||result.validation.groundOffsetMaxM>1e-6||result.validation.secondaryChannelMax>.9||result.validation.uniformScaleError>1e-6||result.validation.focusAxisDeviationMaxDeg>.001)throw new Error('453b: cổng hình học chưa đạt '+JSON.stringify(result.validation));
 if(result.whiteMax>6||result.stress.p95TotalMs>16.7||/swiftshader|llvmpipe|software|unknown/i.test(result.stress.gpu)||result.exceptions.length)throw new Error('Cổng đo chưa đạt: '+JSON.stringify({white:result.whiteMax,p95:result.stress.p95TotalMs,gpu:result.stress.gpu,exceptions:result.exceptions}));
 return {out,sheet:join(owner,'light-ult-453b.jpg'),clip:join(owner,'light-ult-453b.mp4'),whiteMax:result.whiteMax,stress:{p95:result.stress.p95TotalMs,gpu:result.stress.gpu},exceptions:result.exceptions};
}
export default async function(page){
 // 453b: recheck saved evidence without rerunning captures or GPU timing.
 if(process.env.RECHECK==='1')return validate(JSON.parse(readFileSync(join(out,'measure.json'),'utf8')));
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
   window.__art453b={};
   const patch=(prototype,method,key,report)=>{const old=prototype[method];prototype[method]=function(...args){const result=old.apply(this,args);window.__art453b[key]=report(this,args);return result;};};
   patch(space.FanBeams.prototype,'clear','beams',()=>[]);
   patch(space.FanBeams.prototype,'set','beams',(self)=>self.rows.filter(r=>r.mesh.visible).map(r=>({name:r.mesh.name,map:r.mesh.material.map?.image?.src,color:r.mesh.material.color.toArray(),opacity:r.mesh.material.opacity,scale:r.mesh.scale.toArray(),position:r.mesh.position.toArray(),quaternion:r.mesh.quaternion.toArray(),vertices:r.mesh.geometry.getAttribute('position').count,focus:r.hdr})));
   patch(ground.LightWedgeSpill.prototype,'set','ground',(self)=>({map:self.mesh.material.map?.image?.src,color:self.mesh.material.color.toArray(),opacity:self.mesh.material.opacity,scale:self.mesh.scale.toArray(),position:self.mesh.position.toArray(),quaternion:self.mesh.quaternion.toArray()}));
   patch(space.HeldLens.prototype,'bbox','lens',(self,args)=>{const camera=args[0],meshes=[],screen=[],glass=[];let floor=Infinity;self.root.updateWorldMatrix(true,true);self.root.traverse(o=>{if(o.isMesh){const positions=o.geometry.getAttribute('position'),indices=o.geometry.index,glassGroup=o.geometry.groups.find(g=>g.materialIndex===1),seen=new Set(),face=new Set();if(glassGroup)for(let i=glassGroup.start;i<glassGroup.start+glassGroup.count;i++)face.add(indices.getX(i));for(let i=0;i<indices.count;i++)seen.add(indices.getX(i));for(const i of seen){const v=self.temp.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);floor=Math.min(floor,v.y);const a=v.clone().project(camera),px=[(a.x*.5+.5)*innerWidth,(.5-a.y*.5)*innerHeight];screen.push(px);if(face.has(i))glass.push(px);}meshes.push({triangles:o.geometry.index.count/3,groups:o.geometry.groups,materials:(Array.isArray(o.material)?o.material:[o.material]).map(m=>({env:!!m.envMap,environment:m.envMap?.image?.width,envIntensity:m.envMapIntensity,emissive:m.emissive.toArray(),emissiveIntensity:m.emissiveIntensity,baseMap:!!m.map,normalMap:!!m.normalMap,roughnessMap:!!m.roughnessMap,metalnessMap:!!m.metalnessMap}))});}});const extent=points=>{const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return {width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}};return {meshes,box:self.bounds,centre:self.centre.toArray(),scale:self.root.scale.toArray(),quaternion:self.root.quaternion.toArray(),floorY:floor,headY:self.head.y,geometry:extent(screen),glass:extent(glass)};});
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
 const seek=t=>ev(`(()=>{const l=window.__lab;for(let i=0;i<600&&l.lightUlt().last.clock<${t}-1e-8;i++)l.step(1,Math.min(1/60,${t}-l.lightUlt().last.clock));return {state:l.lightUlt(),art:window.__art453b}})()`);
 await goto(false);await start('top');await seek(3.6);
 const phases=[];
 for(const view of ['top','behind']){
  const initial=await start(view);
  for(const t of [0,.3,.6,.9,1.6,1.85,1.95,1.95+1/60,2.05,2.6,3.5]){
   const state=await seek(t),file=join(out,`${view}-${t.toFixed(3)}.png`);await page.shot(file);
   phases.push({view,t,initial,file,...state,whitePct:white(file)});
  }
 }
 const sheet=join(out,'light-ult-453b.jpg');
 execFileSync(magick,['montage','-font',font,'-pointsize','17','-fill','#e7d7ab',...phases.filter(p=>[.3,.9,1.85,1.95+1/60,2.6].includes(p.t)).flatMap(p=>['-label',`${p.view==='top'?'Alt+1':'Alt+2'} / ${p.t.toFixed(3)} s`,p.file]),'-tile','5x2','-geometry','640x360+3+3','-background','#111720',sheet]);
 const result={phases,logs:page.logs,exceptions:page.exceptions};
 writeFileSync(join(out,preview?'preview.json':'measure.json'),JSON.stringify(result,null,2));
 if(preview)return {out,sheet,whiteMax:Math.max(...phases.map(p=>p.whitePct)),exceptions:page.exceptions};
 const clips=[];const whiteByFrame=[];const allFrames=[];
 for(const view of ['top','behind']){
  const raw=join(out,'frames-'+view);mkdirSync(raw,{recursive:true});writeFileSync(join(raw,'ABOUT.md'),about);
  await start(view);
  for(let f=0;f<120;f++){
   if(f)await ev('window.__lab.step(2);true');
   const file=join(raw,`frame-${String(f).padStart(4,'0')}.png`);await page.shot(file);
   whiteByFrame.push({view,f,whitePct:white(file)});allFrames.push({view,f,...await ev('({state:window.__lab.lightUlt(),art:window.__art453b})')});
  }
  const sound=join(out,'sound-'+view+'.json');writeFileSync(sound,JSON.stringify(await ev('window.__lab.soundTakes()'),null,2));
  const wav=join(out,'sound-'+view+'.wav');
  execFileSync(join(repo,'games/.wt-ic-lab-all/node_modules/.bin/tsx'),[join(repo,'games/.wt-ic-lab-all/scripts/visual/mix-lab-sound.mjs'),sound,wav,'--duration=4','--root='+join(repo,'games/.wt-ic-lab-all')],{env:process.env});
  const clip=join(out,view+'.mp4');
  execFileSync('/opt/homebrew/bin/ffmpeg',['-y','-v','error','-framerate','30','-i',join(raw,'frame-%04d.png'),'-i',wav,'-t','4','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k',clip]);clips.push(clip);
 }
 mkdirSync(owner,{recursive:true});
 execFileSync('/opt/homebrew/bin/ffmpeg',['-y','-v','error',...clips.flatMap(p=>['-i',p]),'-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v];[0:a][1:a]concat=n=2:v=0:a=1[a]','-map','[v]','-map','[a]','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k',join(owner,'light-ult-453b.mp4')]);
 execFileSync('/bin/cp',[sheet,join(owner,'light-ult-453b.jpg')]);
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
 result.frames=allFrames;result.whiteByFrame=whiteByFrame;result.whiteMax=Math.max(...[...phases,...whiteByFrame].map(p=>p.whitePct));
 result.logs=page.logs;result.exceptions=page.exceptions;
 writeFileSync(join(out,'measure.json'),JSON.stringify(result,null,2));
 if(!readFileSync(join(owner,'ABOUT.md'),'utf8').includes('light-ult-453b.jpg/.mp4:'))appendFileSync(join(owner,'ABOUT.md'),'\nlight-ult-453b.jpg/.mp4: Phiếu 453b, bảo kính Tripo phóng đều 3 lần, lơ lửng trên đầu, quạt tia/đất theo tâm kính; hai góc Alt+1/Alt+2, nền #353a40, giữ âm gốc; báo cáo docs/codex-queue/453b-report.md.\n');
 return validate(result);
}
