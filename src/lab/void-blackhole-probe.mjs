/** Ticket 447: runtime flag precedence and cancellation, only on the existing localhost:3148 host. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const out='/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/void-blackhole-447/route-probe.json';
export default async function(page){
 const ev=async code=>{const r=await page.eval(code);if(r?.evalError)throw new Error(r.evalError);return r;};
 const ready=async code=>{for(let i=0;i<240;i++){if(await ev(code))return;await page.sleep(250);}throw new Error('Lab/assets not ready');};
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.WebSocket=class extends WebSocket{constructor(url,protocols){super(url,protocols);if(protocols==='vite-hmr')this.addEventListener('message',e=>{try{if(['update','full-reload'].includes(JSON.parse(e.data).type))e.stopImmediatePropagation();}catch{}})}};`});
 const rows=[];
 for(const mode of ['default','video','blackhole-layered','blackhole-video']){
  const url=new URL('http://localhost:3148/stress.html');
  url.searchParams.set('fixed','1');url.searchParams.set('ui','0');url.searchParams.set('dpr','1');
  if(mode.includes('blackhole'))url.searchParams.set('blackhole','1');
  if(mode.includes('video'))url.searchParams.set('ultVoid','video');
  await page.goto(url.href,{settle:1000});await ready('window.__lab?.ready');
  const prep=await ev('window.__lab.voidUlt();window.__lab.blackhole()');
  if(prep.enabled)await ready('window.__lab.blackhole().ready');
  const state=await ev(`(()=>{const l=window.__lab;l.reset();l.step(1,0);l.showcase('ult-void');l.step(1,0);return{blackhole:l.blackhole(),old:l.voidUlt(),clip:l.clipSkill(8),quality:l.auraInfo().quality};})()`);
  assert.equal(state.blackhole.enabled,mode.includes('blackhole'));
  assert.equal(state.blackhole.active,mode.includes('blackhole'));
  assert.equal(state.old.active,mode==='default');
  if(mode==='video'){assert.ok(state.clip!==null);assert.equal(state.old.layered,false);}
  if(mode.includes('blackhole')){
   assert.equal(state.clip?.active??0,0);
   const clear=await ev(`(()=>{const l=window.__lab;l.step(180);l.showcase('ult-light');l.step(1,0);return l.blackhole();})()`);
   assert.equal(clear.active,false);
   state.cancelledByOtherUltimate=clear.active===false;
   const reset=await ev(`(()=>{const l=window.__lab;l.reset();l.showcase('ult-void');l.step(30);l.reset();return l.blackhole();})()`);
   assert.equal(reset.active,false);state.resetClears=true;
  }
  rows.push({mode,url:url.href,state});
 }
 const result={rows,exceptions:page.exceptions,console:page.logs};
 writeFileSync(out,JSON.stringify(result,null,2)+'\n');assert.equal(page.exceptions.length,0);
 return {out,rows:rows.map(r=>({mode:r.mode,blackhole:r.state.blackhole.active,old:r.state.old.active,clip:r.state.clip?.active,quality:r.state.quality}))};
}
