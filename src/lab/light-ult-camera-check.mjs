/** Ticket 439: overhead framing at 90 degrees, 100 m, using the existing orbit hook. */
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const out='/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/light-ult-439/round-5';
export default async function(page){
 const ev=async c=>{const r=await page.eval(c);if(r?.evalError)throw new Error(r.evalError);return r;};
 await page.goto('http://localhost:3148/skills-lab.html?fixed=1&ui=0&dpr=1&q=high&herd=march',{settle:1000});
 for(let i=0;i<200;i++){if(await ev('window.__lab?.ready&&window.__lab.lightUlt().ready'))break;await page.sleep(300);}
 await ev(`(()=>{const s=document.createElement('style');s.textContent='body > :not(#ic-lab){display:none!important}';document.head.append(s);return true;})()`);
 const rows=[];
 for(const t of [1.2,1.9]){
  await ev(`(()=>{const l=window.__lab;l.view('play');l.reset();l.setHerd('march');l.viewMode('top');l.camera('play');l.step(90);l.showcase('ult-light');l.step(1,0);for(let i=0;i<600&&l.lightUlt().last.clock<${t}-1e-8;i++)l.step(1,Math.min(1/60,${t}-l.lightUlt().last.clock));l.setOrbit(0,90,false);l.view('orbit',100);return true;})()`);
  const state=await ev('window.__lab.lightUlt()'),file=join(out,`439-overhead-${t.toFixed(1)}s.png`);await page.shot(file);
  const whitePct=Number(execFileSync('/opt/homebrew/bin/magick',[file,'-fx','r>=0.95&&g>=0.95&&b>=0.95?1:0','-format','%[fx:mean*100]','info:'],{encoding:'utf8'}));
  rows.push({view:'overhead',t,state,whitePct,camera:await ev('window.__lab.captureCamera()'),file,distanceM:100,pitchDeg:90});
 }
 const p=join(out,'439-measure.json'),all=JSON.parse(readFileSync(p,'utf8'));all.phases=all.phases.filter(r=>r.view!=='overhead').concat(rows);writeFileSync(p,JSON.stringify(all,null,2));
 execFileSync('/opt/homebrew/bin/magick',['montage','-font','/System/Library/Fonts/Supplemental/Arial.ttf','-pointsize','20','-fill','#eddda8',...rows.flatMap(r=>['-label',`90 DEG / ${r.t} s`,r.file]),'-tile','2x1','-geometry','1280x720+4+4','-background','#10151b',join(out,'439-overhead-phases.jpg')]);
 return rows.map(r=>({t:r.t,hdr:r.state.last.hdrBeams,whitePct:r.whitePct}));
}
