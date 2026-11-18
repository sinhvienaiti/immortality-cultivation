/** 454w: measure the diamond bloom's on-screen width by diffing frames with and without the diamond layer. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const magick='/opt/homebrew/bin/magick', S=Number(process.env.DSCALE||'1');
const tmp=mkdtempSync('/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/star-ult-454v/measure-');
export default async function(page){
  const ev=async s=>{const r=await page.eval(s);if(r?.evalError)throw new Error(r.evalError);return r;};
  const ready=async s=>{for(let i=0;i<240;i++){if(await ev(s))return;await page.sleep(250);}throw new Error(s);};
  const out={};
  for(const view of ['top','behind']){
    const url=new URL('http://127.0.0.1:3148/stress.html');
    for(const [k,v] of Object.entries({fixed:'1',ui:'0',dpr:'1',herd:'march',ground:'#353a40'}))url.searchParams.set(k,v);
    await page.goto(url.href,{settle:1000});await ready('window.__lab?.ready&&window.__stress?.ready');
    await ev('window.__lab.starUlt();true');await ready('window.__lab.starUlt().ready');
    await ev(`(()=>{const s=document.createElement('style');s.textContent='body *:not(canvas):not(:has(canvas)){visibility:hidden!important}';document.head.append(s);return true;})()`);
    const restart=`(async()=>{const l=window.__lab;l.reset();l.setHerd('march');l.viewMode(${JSON.stringify(view)});l.step(45);l.showcase('ult-star');l.step(1,0);return true;})()`;
    await ev(restart);
    out[view]=[];
    for(const t of [6.0,6.05,6.15,6.2,6.3,6.4,6.5]){
      await ev(`(()=>{const l=window.__lab;let r=l.starUlt().last;for(let i=0;i<1600&&r.clock<${t}-1e-8;i++){l.step(1,Math.min(1/60,${t}-r.clock));r=l.starUlt().last;}return true;})()`);
      const a=join(tmp,`${view}-${t}-on.png`),b=join(tmp,`${view}-${t}-off.png`);
      await page.shot(a);
      await ev(`(()=>{window.__lab.starUlt().hide('diamond',true);window.__lab.step(1,0);return true;})()`);
      await page.shot(b);
      await ev(`(()=>{window.__lab.starUlt().hide('diamond',false);return true;})()`);
      const info=execFileSync(magick,[a,b,'-compose','difference','-composite','-colorspace','gray','-threshold','12%','-morphology','Open','Disk:2','-format','%@ %w','info:']).toString().trim();
      const m=info.match(/(\d+)x(\d+)\+(\d+)\+(\d+) (\d+)/); out[view].push({t,bbox:info,widthPct:m?+(m[1]/m[5]*100).toFixed(1):0,file:a});
    }
  }
  return out;
}
