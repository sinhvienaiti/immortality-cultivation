/** Ticket 415b. Claude runs on a host serving THIS worktree; no server/build is started here.
 * BASE=http://127.0.0.1:3146/skills-lab.html ART_MAGICK=/opt/homebrew/bin/magick
 * node --import tsx src/kit/tools/cdp-run.mjs src/lab/anim-r3-review.ts --width=1920 --height=1080 --dpr=1
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, linkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, basename } from "node:path";
import { R3_NAMES } from "./anim-r3-poses";
interface ReviewPage {
  logs?: unknown; exceptions?: unknown;
  goto(url:string,options:{settle:number}):Promise<unknown>;
  eval(expression:string):Promise<unknown>;
  shot(path:string):Promise<unknown>;
  sleep(ms:number):Promise<unknown>;
}
export default async function review(page:ReviewPage):Promise<unknown>{
  const repo=fileURLToPath(new URL('../../../../',import.meta.url));
  const topic='/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/hero-anim-r3-415b';
  const ownerBase='/Volumes/SS990TPRO/htdocs/typing-game-review/owner-review/2026-11-16/tu-tien/hero-anim-r3-415b';
  const about='purpose: Phiếu 415b: đối chiếu từng ấn S0–S9 với ảnh 411, nửa thân và cận tay\nmade-by: Kịch bản Codex 415b; Claude chạy và xem\ndoc: /Volumes/SS990TPRO/htdocs/typing-game/docs/codex-queue/415b-report.md\ndelete-when: Sau khi owner duyệt và không cần so lại\n';
  const evaluate=async(expression:string):Promise<unknown>=>{
    const r=await page.eval(expression);if(r&&typeof r==='object'&&'evalError'in r)throw new Error(String(r.evalError));return r;
  };
  const url=new URL(process.env.BASE||'http://127.0.0.1:3146/skills-lab.html');
  for(const[k,v]of Object.entries({hero:'human',fixed:'1',ui:'0',herd:'still',dpr:'1'}))url.searchParams.set(k,v);
  await page.goto(url.href,{settle:1500});let ready=false;
  for(let i=0;i<120;i++){if(await evaluate("!!(window.__lab?.ready && window.__labAnimR3?.version===415 && window.__labAnimR3?.curlVersion==='415b')")){ready=true;break;}await page.sleep(250);}
  assert.ok(ready,'Host chưa phục vụ đúng worktree 415b/human');
  // Delay filesystem creation until the host is proven correct.
  mkdirSync(topic,{recursive:true});const out=mkdtempSync(join(topic,'run-'));writeFileSync(join(out,'ABOUT.md'),about);
  const magick=process.env.ART_MAGICK||'/opt/homebrew/bin/magick';
  const run=(args:string[])=>execFileSync(magick,args,{stdio:'inherit'});
  const source=join(repo,'games/immortality-cultivation/art-src/concept/hand-seals');
  const frontRefs=['seals-front-s0-s4.v1-try3.png','seals-front-s5-s9.v1-try2.png'];
  const sheets:string[]=[],reports:unknown[]=[];
  await evaluate("window.__lab.reset();window.__lab.view('play');window.__lab.step(60);window.__labAnimR3.begin();true");
  for(const mode of ['front','hands'] as const){
    const pairs:string[]=[];
    for(let id=0;id<10;id++){
      await evaluate(`window.__labAnimR3.seal(${id});window.__labAnimR3.compare('${mode}');window.__lab.step(48);true`);
      const state=await evaluate('window.__labAnimR3.report()');reports.push({id,mode,state});
      const raw=join(out,`415b-${mode}-S${id}-raw.png`),live=join(out,`415b-${mode}-S${id}-live.png`),ref=join(out,`415b-${mode}-S${id}-reference.png`),pair=join(out,`415b-${mode}-S${id}-pair-compare.jpg`);
      await page.shot(raw);
      // Human comparison is square; hand comparison matches a 3:4 source crop. Both retain aspect ratio.
      run([raw,'-gravity','center','-crop',mode==='front'?'1080x1080+0+0':'810x1080+0+0','+repage','-resize',mode==='front'?'480x480':'360x480',live]);
      if(mode==='hands'){
        run([join(source,'seals-hands-s0-s9.v1-try3.png'),'-crop',`307x437+${(id%5)*307}+${Math.floor(id/5)*512}`,'+repage','-resize','360x480','-background','#555760','-gravity','center','-extent','360x480',ref]);
      }else{
        const n=id%5,x=n<3?n*512:(n===3?192:768),y=n<3?0:512,w=n<3?512:576;
        run([join(source,frontRefs[Math.floor(id/5)]!),'-crop',`${w}x458+${x}+${y}`,'+repage','-resize','480x480','-background','#555760','-gravity','center','-extent','480x480',ref]);
      }
      run(['montage',ref,live,'-tile','2x1','-geometry','+3+3','-background','#141c24','-fill','#eee4ce','-font','/System/Library/Fonts/Supplemental/Arial.ttf','-pointsize','18','-title',`S${id} ${R3_NAMES[id]} | reference 411 / human 415b`,pair]);
      pairs.push(pair);
    }
    const sheet=join(out,`415b-seals-${mode}-10-compare-sheet.jpg`);
    run(['montage',...pairs,'-tile','5x2','-geometry','+4+4','-background','#141c24',sheet]);sheets.push(sheet);
  }
  await evaluate('window.__labAnimR3.stop();window.__lab.step(60);true');
  const json=join(out,'415b-browser.json');writeFileSync(json,JSON.stringify({url:url.href,reports,logs:page.logs,exceptions:page.exceptions,
    limits:'Scripted fixed-step captures. No visual PASS, real-key latency, audio-onset or skin collision claim. Full-body reference determines wrist region; hand reference determines digits. Inspect all individual pairs at full resolution.'},null,2)+'\n');
  const published=join(ownerBase,basename(out));mkdirSync(published,{recursive:true});
  // Retain the 20 individual pairs so judges can inspect the actual digits, plus both overview sheets.
  const retained=[...sheets,json,join(out,'ABOUT.md'),...['front','hands'].flatMap(mode=>R3_NAMES.map((_,id)=>join(out,`415b-${mode}-S${id}-pair-compare.jpg`)))];
  for(const file of retained)linkSync(file,join(published,basename(file)));
  for(const folder of [topic,ownerBase])writeFileSync(join(folder,'ABOUT.md'),about);
  const prune=[join(repo,'tools/capture-prune/prune.mjs'),out,'--min-age-min','0','--docs',join(repo,'docs/codex-queue/415b-report.md')];
  execFileSync(process.execPath,prune,{cwd:repo,stdio:'inherit'});
  execFileSync(process.execPath,[...prune,'--apply'],{cwd:repo,stdio:'inherit'});
  execFileSync(process.execPath,[join(repo,'scripts/review-index.mjs')],{cwd:repo,stdio:'inherit'});
  return{out,published,sheets,capturedFrames:20};
}
