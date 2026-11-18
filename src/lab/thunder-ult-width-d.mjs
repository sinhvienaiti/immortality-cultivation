/** Ticket 434d: supplemental measurements of the unchanged round-four effect. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {sectionsWidth} from './thunder-ult-review-d.mjs';
const out='/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/thunder-ult-434d/width-check';
const pixels=file=>execFileSync('/opt/homebrew/bin/magick',[file,'-depth','8','rgba:-'],{maxBuffer:1280*720*4+1024});
export default async function(page){
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const Native=window.WebSocket;window.WebSocket=new Proxy(Native,{construct(Target,args){if(args[1]==='vite-hmr'){const socket=new EventTarget();Object.assign(socket,{url:String(args[0]),readyState:1,send(){},close(){}});queueMicrotask(()=>{const event=new Event('open');socket.dispatchEvent(event);socket.onopen?.(event);});return socket;}return Reflect.construct(Target,args);}});})()`});
 mkdirSync(out,{recursive:true});writeFileSync(out+'/ABOUT.md','purpose: Đo các bước sét ngắn bị khuất, không sửa hiệu ứng\nmade-by: Codex\ndoc: docs/codex-queue/434d-report.md\ndelete-when: Owner duyệt xong\n');
 const ev=async c=>{const r=await page.eval(c);if(r?.evalError)throw new Error(r.evalError);return r;};
 await page.goto('http://localhost:3148/skills-lab.html?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40',{settle:1000});
 for(let i=0;i<240;i++){if(await ev('window.__lab?.ready&&window.__lab.thunderUlt().ready'))break;await page.sleep(250);}
 await ev(`(()=>{const s=document.createElement('style');s.textContent='body *{visibility:hidden!important}canvas{visibility:visible!important}';document.head.append(s);const l=window.__lab;l.view('play');l.reset();l.setHerd('march');l.viewMode('top');l.camera('play');l.step(90);l.showcase('ult-thunder-nine-heavens-v2');l.step(1,0);return true;})()`);
 const results=[];
 for(const t of [1.25,1.35]){
  const state=await ev(`(()=>{const l=window.__lab;for(let i=0;i<200&&l.thunderUlt().last.clock<${t}-1e-8;i++)l.step(1,Math.min(1/60,${t}-l.thunderUlt().last.clock));return l.thunderUlt().last;})()`);
  const camera=await ev('window.__lab.captureCamera()'),on=out+'/'+t+'-on.png',off=out+'/'+t+'-off.png';await page.shot(on);
  await ev("window.__lab.fxShowNamed('thunder-chain-world-tubes',false)");await page.shot(off);await ev("window.__lab.fxShowNamed('thunder-chain-world-tubes',true)");
  results.push({t,state,camera,widths:sectionsWidth(pixels(on),pixels(off),state,camera,Array.from({length:18},(_,i)=>i))});
 }
 writeFileSync(out+'/measure.json',JSON.stringify({results,logs:page.logs,exceptions:page.exceptions},null,2));
 return results.map(r=>({t:r.t,widths:r.widths.filter(w=>w.born>=1.2).map(w=>({born:w.born,segment:w.segment,glowPx:w.glowPx,corePx:w.corePx,ratio:w.ratio}))}));
}
