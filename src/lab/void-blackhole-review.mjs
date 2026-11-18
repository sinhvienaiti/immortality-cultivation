/** Ticket 447: localhost:3148, four prescribed phases, fixed camera modes, GPU readback p95. */
import {mkdirSync,mkdtempSync,writeFileSync,appendFileSync,unlinkSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
const repo='/Volumes/SS990TPRO/htdocs/typing-game',review='/Volumes/SS990TPRO/htdocs/typing-game-review';
const topic=review+'/captures/tu-tien/void-blackhole-447',owner=review+'/owner-review/2026-11-18/tu-tien';
const round=Number(process.env.ROUND||1),final=process.env.FINAL==='1';
const magick='/opt/homebrew/bin/magick',ffmpeg='/opt/homebrew/bin/ffmpeg',font='/System/Library/Fonts/Supplemental/Arial.ttf';
const about=purpose=>`purpose: ${purpose}\nmade-by: Codex, phiếu 447\ndoc: docs/codex-queue/447-report.md\ndelete-when: Sau khi owner duyệt hố đen Hư Không\n`;
const p95=xs=>xs.toSorted((a,b)=>a-b)[Math.ceil(xs.length*.95)-1];
function white(file){const rgb=execFileSync(magick,[file,'-alpha','off','-depth','8','rgb:-'],{maxBuffer:12*1024*1024});let n=0;for(let p=0;p<rgb.length;p+=3)if(Math.min(rgb[p],rgb[p+1],rgb[p+2])>=242)n++;return n/(rgb.length/3)*100;}
export default async function(page){
 if(round<1||round>4)throw new Error('Tối đa bốn vòng');
 mkdirSync(topic,{recursive:true});mkdirSync(owner,{recursive:true});
 writeFileSync(join(topic,'ABOUT.md'),about('Bốn pha, hai góc, đối chiếu phân cảnh và số đo 447'));
 const raw=mkdtempSync(join(topic,`round-${round}-`));writeFileSync(join(raw,'ABOUT.md'),about('Khung thô riêng lượt 447; prune sau khi ghép và mở ảnh'));
 const ev=async code=>{const r=await page.eval(code);if(r?.evalError)throw new Error(r.evalError);return r;};
 const ready=async code=>{for(let i=0;i<240;i++){if(await ev(code))return;await page.sleep(250);}throw new Error('Lab hoặc atlas chưa sẵn sàng');};
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.WebSocket=class extends WebSocket{constructor(url,protocols){super(url,protocols);if(protocols==='vite-hmr')this.addEventListener('message',e=>{try{if(['update','full-reload'].includes(JSON.parse(e.data).type))e.stopImmediatePropagation();}catch{}})}};`});
 const restart=view=>ev(`(async()=>{const l=window.__lab;l.reset();l.setHerd('march');l.viewMode('top');l.step(45);l.viewMode('${view}');l.step(30);await l.soundRecord();l.showcase('ult-void');l.step(1,0);return {state:l.blackhole(),population:{targets:Array.from({length:87},(_,i)=>l.beast(i)).filter(f=>f.alive).length,walkers:window.__stress.report().walkers.instances}};})()`);
 const seek=t=>ev(`(()=>{const l=window.__lab;let r=l.blackhole().last;for(let i=0;i<800&&r.clock<${Math.min(t,6)}-1e-8;i++){l.step(1,Math.min(1/60,${Math.min(t,6)}-r.clock));r=l.blackhole().last;}if(Math.abs(r.clock-${Math.min(t,6)})>1e-6)throw new Error('Sai thời gian '+r.clock);return r;})()`);
 const result={round,final,raw,viewport:[page.width,page.height],views:{},note:'p95 = CPU và chờ GPU qua readPixels 1 px, giống metal-ult-rain-review; không phải rAF. Vùng trắng = cả ba kênh >=242/255. World plane khóa góc; không billboard vành.'};
 const shots=[];
 for(const view of ['top','behind']){
  const url=new URL('http://localhost:3148/stress.html');
  for(const[k,v]of Object.entries({fixed:'1',ui:'0',dpr:String(page.dpr),herd:'march',ground:'#353a40',blackhole:'1',ultCam:'0'}))url.searchParams.set(k,v);
  await page.goto(url.href,{settle:1200});await ready('window.__lab?.ready && window.__stress?.ready && window.__lab.blackhole().ready');
  await ev(`(()=>{const s=document.createElement('style');s.textContent='body *:not(canvas):not(:has(canvas)){visibility:hidden!important}';document.head.append(s);return true;})()`);
  await restart(view);await seek(6);const start=await restart(view),frames=[];
  for(const t of [.5,1.8,3.2,5]){const state=await seek(t),file=join(raw,`${view}-${t.toFixed(1)}.png`);await page.shot(file);shots.push({view,t,file});frames.push({t,state,white:white(file),camera:await ev('window.__lab.captureCamera()')});}
  await seek(6);result.views[view]={start,frames,last:await ev('window.__lab.blackhole()')};
  if(view==='top'){
   await restart(view);
   const perf=await ev(`(()=>{const l=window.__lab,rows=[];for(let i=0;i<500;i++){const p=l.perf(1),r=l.blackhole().last;rows.push({t:r.clock,cpu:p.cpu[0],total:p.total[0],draws:p.drawCalls,triangles:p.triangles,gpu:p.gpu,blades:r.liveBlades});if(r.clock>=6)break;}return{rows,last:l.blackhole(),takes:l.soundTakes()};})()`);
   const live=perf.rows.filter(r=>r.t>=.8&&r.t<6),climax=live.filter(r=>r.t>=2.4&&r.t<=4.4);
   result.perf={...perf,p95:p95(live.map(r=>r.total)),cpuP95:p95(live.map(r=>r.cpu)),climaxP95:p95(climax.map(r=>r.total)),maxDraws:Math.max(...live.map(r=>r.draws)),maxTriangles:Math.max(...live.map(r=>r.triangles))};
   result.recasts=[];
   for(let k=0;k<3;k++){await restart(view);await seek(3.2);result.recasts.push(await ev('window.__lab.memory().gl'));await seek(6);}
   if(final){
    await restart(view);let maxWhite=0;
    for(let i=0;i<168;i++){if(i/24<=6)await seek(i/24);else await ev('window.__lab.step(1,1/24);true');const f=join(raw,`frame-${String(i).padStart(3,'0')}.png`);await page.shot(f);maxWhite=Math.max(maxWhite,white(f));}
    result.clipWhite=maxWhite;
    const takes=await ev('window.__lab.soundTakes()'),silent=join(raw,'silent.mp4'),wav=join(raw,'sound.wav');
    result.clipTakes=takes; result.audioOffsetS=.8-takes.find(t=>t.url?.includes('tt-sfx-ult-void/')).at;
    execFileSync(ffmpeg,['-y','-v','error','-framerate','24','-i',join(raw,'frame-%03d.png'),'-frames:v','168','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',silent]);
    execFileSync(join(repo,'games/.wt-ic-lab-all/node_modules/.bin/tsx'),[join(repo,'games/.wt-ic-lab-all/scripts/visual/mix-lab-sound.mjs'),'/dev/stdin',wav,'--duration=7','--offset='+String(result.audioOffsetS),'--root='+join(repo,'games/.wt-ic-lab-all')],{input:JSON.stringify(takes),env:{...process.env,PATH:'/opt/homebrew/bin:'+process.env.PATH},maxBuffer:4*1024*1024});
    execFileSync(ffmpeg,['-y','-v','error','-i',silent,'-i',wav,'-t','7','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',join(owner,'void-blackhole-lab.mp4')]);
    unlinkSync(silent);unlinkSync(wav);
    execFileSync(magick,['montage',...Array.from({length:14},(_,i)=>join(raw,`frame-${String(i*12).padStart(3,'0')}.png`)),'-tile','7x2','-geometry','640x360+3+3','-background','#171b20',join(topic,`round-${round}-motion.jpg`)]);
   }
  }
 }
 // Each row compares one storyboard panel directly with the two prescribed camera captures.
 const reference=join(repo,'games/.wt-ic-lab-all/art-src/concept/ult-void/blackhole/void-blackhole-storyboard.v1-try1.png');
 const panels=[];
 for(let i=0;i<4;i++){
  const f=join(raw,`story-${i}.png`);execFileSync(magick,[reference,'-crop',`768x512+${(i%2)*768}+${Math.floor(i/2)*512}`,'+repage',f]);panels.push(f);
 }
 const ordered=panels.flatMap((f,i)=>[{file:f,label:`Storyboard ${i+1}`},...['top','behind'].map(view=>{const s=shots.find(s=>s.view===view&&s.t===[.5,1.8,3.2,5][i]);return{...s,label:`${view==='top'?'Alt+1':'Alt+2'} · ${s.t.toFixed(1)} s`};})]);
 const sheet=join(topic,`round-${round}-compare.jpg`);
 execFileSync(magick,['montage','-font',font,'-pointsize','22','-fill','#eee8db',...ordered.flatMap(s=>['-label',s.label,s.file]),'-tile','3x4','-geometry','960x540+4+4','-background','#171b20','-quality','91',sheet]);
 result.white=Math.max(result.clipWhite||0,...Object.values(result.views).flatMap(v=>v.frames.map(f=>f.white)));
 result.console=page.logs;result.exceptions=page.exceptions;
 writeFileSync(join(topic,`round-${round}-measure.json`),JSON.stringify(result,null,2)+'\n');
 if(final){execFileSync(magick,[sheet,'-quality','92',join(owner,'void-blackhole-lab.jpg')]);if(!existsSync(join(owner,'ABOUT.md')))writeFileSync(join(owner,'ABOUT.md'),about('Review Tu Tiên 18/11'));appendFileSync(join(owner,'ABOUT.md'),`\nvoid-blackhole-lab: Phiếu 447, vòng ${round}; ?blackhole=1; vành 11 m nghiêng 25°, 8 lưỡi, lõi từ alpha video, 6 s hiệu ứng; clip 7 s có âm tt-sfx-ult-void; p95 ${result.perf.p95.toFixed(2)} ms; trắng ${result.white.toFixed(5)}%. Xem docs/codex-queue/447-report.md; còn cần owner đánh giá chiều sâu hình nguồn.\n`);}
 console.log(JSON.stringify({round,raw,sheet,views:Object.fromEntries(Object.entries(result.views).map(([v,r])=>[v,r.frames.map(f=>({t:f.t,diameterPx:f.state.screenDiameterPx,tilt:f.state.tiltDeg,blades:f.state.emittedBlades,live:f.state.liveBlades,white:f.white,swallowed:f.state.swallowed}))])),white:result.white,p95:result.perf.p95,cpuP95:result.perf.cpuP95,climaxP95:result.perf.climaxP95,exceptions:result.exceptions}));
 if(result.perf.p95>16.7||result.white>6||result.exceptions.length)throw new Error('Không đạt số đo; xem JSON');
 return{raw,sheet,p95:result.perf.p95,white:result.white};
}
