/** Ticket 439: actual visible lens bbox from paired renders; no timeline or camera changes between the pair. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const out='/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/light-ult-439';
export default async function(page){
 const ev=async c=>{const r=await page.eval(c);if(r?.evalError)throw new Error(r.evalError);return r;};
 await page.goto('http://localhost:3148/skills-lab.html?fixed=1&ui=0&dpr=1&q=high&herd=march',{settle:1000});
 for(let i=0;i<200;i++){if(await ev('window.__lab?.ready&&window.__lab.lightUlt().ready'))break;await page.sleep(300);}
 await ev(`(()=>{const s=document.createElement('style');s.textContent='body > :not(#ic-lab){display:none!important}';document.head.append(s);return true;})()`);
 const raw=join(out,'frames-lens');mkdirSync(raw,{recursive:true});
 writeFileSync(join(raw,'ABOUT.md'),'purpose: Cặp ảnh chênh lệch để đo bbox thấu kính thực sự nhìn thấy\nmade-by: Codex, Chrome headless\ndoc: docs/codex-queue/439-report.md\ndelete-when: Sau khi giữ số đo và ghép sheet\n');
 const rows=[];
 for(const view of ['top','behind']){
  await ev(`(()=>{const l=window.__lab;l.view('play');l.reset();l.setHerd('march');l.viewMode('top');l.camera('play');l.step(45);l.viewMode('${view}');l.step(45);l.showcase('ult-light');l.step(1,0);return true;})()`);
  for(const t of [.3,.9,1.6,1.9,2.6]){
   await ev(`(()=>{const l=window.__lab;for(let i=0;i<600&&l.lightUlt().last.clock<${t}-1e-8;i++)l.step(1,Math.min(1/60,${t}-l.lightUlt().last.clock));return true;})()`);
   const normal=join(raw,`${view}-${t}-on.png`),without=join(raw,`${view}-${t}-off.png`);
   await ev("window.__lab.lightUlt('showLens')");await page.shot(normal);
   const state=await ev("window.__lab.lightUlt('hideLens')");await page.shot(without);
   const bbox=execFileSync('/opt/homebrew/bin/magick',[normal,without,'-compose','difference','-composite','-colorspace','gray','-threshold','3%','-trim','-format','%w %h %X %Y','info:'],{encoding:'utf8'}).trim().split(/\s+/).map(Number);
   rows.push({view,t,visibleDifferenceBBox:{width:bbox[0],height:bbox[1],x:bbox[2],y:bbox[3]},projectedGlassBBox:state.last.lens});
   await ev("window.__lab.lightUlt('showLens')");
  }
 }
 writeFileSync(join(out,'439-lens-visibility.json'),JSON.stringify({method:'Cặp render cùng thời điểm/camera, chỉ ẩn kính và khung cầm; |RGB chênh lệch| chuyển gray >3%, trim bbox. Bao gồm vành/kính/tay cầm và bloom do chúng tạo, không gồm quầng charge/sparkle tách rời.',rows},null,2));
 return rows;
}
