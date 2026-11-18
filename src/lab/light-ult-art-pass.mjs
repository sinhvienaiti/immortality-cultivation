/** 18/11 art-only pass: impact-spark frames from play (Alt+1) and behind (Alt+2) views. */
import {mkdirSync} from 'node:fs';import {join} from 'node:path';
const out=process.env.OUT;
export default async function(page){
 mkdirSync(out,{recursive:true});
 const ev=async c=>{const x=await page.eval(c);if(x?.evalError)throw new Error(x.evalError);return x;};
 const wait=async c=>{for(let i=0;i<200;i++){if(await ev(c))return;await page.sleep(300);}throw new Error('not ready '+c);};
 await page.goto('http://localhost:3148/skills-lab.html?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40',{settle:1000});
 await wait('window.__lab?.ready');await wait('window.__lab.lightUlt().ready');
 for(const view of ['top','behind']){
  await ev(`(()=>{const l=window.__lab;l.view('play');l.reset();l.setHerd('march');l.viewMode('top');l.camera('play');l.step(45);l.viewMode(${JSON.stringify(view)});l.step(45);l.showcase('ult-light');l.step(1,0);return 1})()`);
  for(const t of [0.4,1.2,2.05,2.25,2.5]){
   await ev(`(()=>{const l=window.__lab;for(let i=0;i<600&&l.lightUlt().last.clock<${t}-1e-8;i++)l.step(1,Math.min(1/60,${t}-l.lightUlt().last.clock));return 1})()`);
   await page.shot(join(out,`${view}-${t.toFixed(2)}.png`));
  }
 }
 console.log('errors',JSON.stringify(page.exceptions?.()??[]).slice(0,400));
}
