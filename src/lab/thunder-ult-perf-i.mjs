/** 434i: rerun the column-only benchmark with all 100 foe models retained. */
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
const root='/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/thunder-ult-434i',file=root+'/round-3/measure.json';
export default async function(page){
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const N=window.WebSocket;window.WebSocket=new Proxy(N,{construct(T,a){if(a[1]==='vite-hmr'){const s=new EventTarget();Object.assign(s,{readyState:1,send(){},close(){}});queueMicrotask(()=>{const e=new Event('open');s.dispatchEvent(e);s.onopen?.(e);});return s;}return Reflect.construct(T,a);}});})()`});
 const ev=async c=>{const r=await page.eval(c);if(r?.evalError)throw Error(r.evalError);return r;};
 await page.goto('http://localhost:3148/stress.html?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40',{settle:1000});
 for(let i=0;i<200;i++){if(await ev('window.__lab?.ready&&window.__stress?.ready&&window.__lab.thunderUlt().ready'))break;await page.sleep(250);}
 const runs=[];
 for(let k=0;k<4;k++)runs.push(await ev(`(()=>{const l=window.__lab;l.view('play');l.reset();l.setHerd('still');l.viewMode('top');l.camera('play');l.step(90);l.showcase('ult-thunder-nine-heavens-v2');l.step(144);const pop=()=>({targets:Array.from({length:87},(_,i)=>l.beast(i)).filter(b=>b.alive).length,walkers:window.__stress.report().walkers.instances});const population=pop(),rows=[];for(let j=0;j<210;j++){const p=l.perf(1);rows.push({clock:l.thunderUlt().last.clock,cpu:p.cpu[0],total:p.total[0],gpu:p.gpu,draws:p.drawCalls});}return {population,populationEnd:pop(),rows};})()`));
 const rows=runs.slice(1).flatMap(r=>r.rows),p95=a=>a.toSorted((a,b)=>a-b)[Math.ceil(a.length*.95)-1];
 const stress={runs,p95TotalMs:p95(rows.map(r=>r.total)),p95CpuMs:p95(rows.map(r=>r.cpu)),gpu:rows[0].gpu,warmupExcluded:1,note:'87 quái giữ vị trí để không rời sân; 13 walker vẫn bước. Thân quái vẫn giật qua hook và tất cả VFX vẫn chạy; chỉ lấy mẫu 2,4–5,9 s.'};
 if(!runs.every(r=>r.population.targets+r.population.walkers===100&&r.populationEnd.targets+r.populationEnd.walkers===100))throw Error('Chưa giữ đủ 100 quái');
 if(page.exceptions.length)throw Error(JSON.stringify(page.exceptions));
 const m=JSON.parse(readFileSync(file,'utf8'));writeFileSync(root+'/march-stress.json',JSON.stringify(m.stress,null,2));m.stress=stress;m.summary.p95=stress.p95TotalMs;writeFileSync(file,JSON.stringify(m,null,2));writeFileSync(root+'/column-100-stress.json',JSON.stringify(stress,null,2));
 return {p95:stress.p95TotalMs,gpu:stress.gpu,populations:runs.map(r=>[r.population,r.populationEnd]),samples:rows.length,exceptions:page.exceptions};
}
