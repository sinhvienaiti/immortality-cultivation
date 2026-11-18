/** Ticket 434c: a frozen cloud flash, with the exact same camera and world time. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import * as THREE from 'three';
const out='/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/thunder-ult-434c/locality';
const magick='/opt/homebrew/bin/magick';
export default async function(page){
 mkdirSync(out,{recursive:true});writeFileSync(join(out,'ABOUT.md'),'purpose: Phiếu 434c, đo lóe mây cục bộ trong bán kính 4 m\nmade-by: Codex, Chrome headless\ndoc: docs/codex-queue/434c-report.md\ndelete-when: Owner duyệt xong\n');
 const ev=async code=>{const r=await page.eval(code);if(r?.evalError)throw new Error(r.evalError);return r;};
 await page.goto('http://localhost:3148/skills-lab.html?fixed=1&ui=0&dpr=1&q=high&herd=march&ground=%23353a40&cloud=thunder',{settle:1000});
 for(let i=0;i<200;i++){if(await ev('window.__lab?.ready&&!!window.__cloud438'))break;await page.sleep(250);}
 await ev(`(()=>{const s=document.createElement('style');s.textContent='body *{visibility:hidden!important}canvas{visibility:visible!important}';document.head.append(s);window.__cloud438.configure({lightningIntensity:0});window.__cloud438.show();window.__lab.step(90);return true;})()`);
 const results=[];
 for(const view of ['top','behind']){
  await ev(`window.__lab.viewMode('${view}');window.__lab.step(45);window.__cloud438.cloud.flash(0,9,0,0);window.__lab.fxShowNamed('fx-cloud-volume',true);true`);
  const off=join(out,`${view}-off.png`);await page.shot(off);
  const camera=await ev('window.__lab.captureCamera()');
  const radius=await ev("window.__cloud438.cloud.flash(0,9,0,1);window.__lab.fxShowNamed('fx-cloud-volume',true);window.__cloud438.cloud.mesh.material.uniforms.uFlashRadius.value");
  const on=join(out,`${view}-on.png`);await page.shot(on);
  const c=new THREE.PerspectiveCamera(camera.fov,1280/720,.01,1000);c.position.fromArray(camera.position);c.quaternion.fromArray(camera.quaternion);c.updateMatrixWorld(true);
  const xs=[],ys=[];for(const x of [-radius,radius])for(const y of [9-radius,9+radius])for(const z of [-radius,radius]){const v=new THREE.Vector3(x,y,z).project(c);xs.push((v.x+1)*640);ys.push((1-v.y)*360);}
  const bounds=[Math.floor(Math.min(...xs))-2,Math.floor(Math.min(...ys))-2,Math.ceil(Math.max(...xs))+2,Math.ceil(Math.max(...ys))+2];
  const read=f=>execFileSync(magick,[f,'-depth','8','rgba:-'],{maxBuffer:1280*720*4+1024});
  const a=read(on),b=read(off);let changed=0,outside=0,delta=0,maxDelta=0;
  for(let y=0;y<720;y++)for(let x=0;x<1280;x++){const i=(y*1280+x)*4,d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));if(d<3)continue;changed++;delta+=d/255;maxDelta=Math.max(maxDelta,d/255);if(x<bounds[0]||x>bounds[2]||y<bounds[1]||y>bounds[3])outside++;}
  const r={view,flashWorld:[0,9,0],radiusM:radius,projectedCubePx:bounds,changedPixels:changed,changedFramePct:changed/(1280*720)*100,outsideRadiusProjectionPixels:outside,meanChangedChannelDelta:delta/Math.max(1,changed),maxChangedChannelDelta:maxDelta,pass:radius>=3&&radius<=5&&changed>0&&outside===0};results.push(r);
  execFileSync(magick,['montage','-font','/System/Library/Fonts/Supplemental/Arial.ttf','-pointsize','20','-fill','#dddfff','-label',`${view} / flash off`,off,'-label',`${view} / flash on / r=4 m`,on,'-tile','2x1','-geometry','1280x720+3+3','-background','#10141b',join(out,`${view}-locality-sheet.jpg`)]);
 }
 writeFileSync(join(out,'measure.json'),JSON.stringify({results,exceptions:page.exceptions},null,2));return {results,exceptions:page.exceptions};
}
