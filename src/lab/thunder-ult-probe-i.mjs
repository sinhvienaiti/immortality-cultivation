/** 434i: schedule, cap, deterministic variants and owned-resource probe. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {ThunderUltChain} from './thunder-ult-chain.ts';
const root=new URL('../../',import.meta.url),base=new URL('art-src/lab/vfx/',root).href;
const local=u=>String(u).startsWith('/art-src/')?new URL(String(u).slice(1),root):new URL(String(u));
const oldFetch=globalThis.fetch,oldLoad=THREE.TextureLoader.prototype.loadAsync;
let textureCount=0,disposed=0;
globalThis.fetch=async u=>new Response(await readFile(local(u),'utf8'));
THREE.TextureLoader.prototype.loadAsync=async function(u){const b=await readFile(local(u)),t=new THREE.Texture();t.image={width:b.readUInt32BE(16),height:b.readUInt32BE(20)};textureCount++;t.addEventListener('dispose',()=>disposed++);return t;};
const camera=new THREE.PerspectiveCamera(30,1280/720,.01,1000);camera.position.set(0,25,30);camera.lookAt(0,0,-5);camera.updateMatrixWorld(true);
const parent=new THREE.Group(),targets={size:100,alive:()=>true,x:i=>(i%10-4.5)*2.6,z:i=>-17+Math.floor(i/10)*1.6,midY:()=>.85};
const fx=new ThunderUltChain(parent,base,{targets,camera,caster:p=>p.set(0,0,4),hand:p=>p.set(0,1.4,3.5),release(){},stun(){},blow(){return false;},strike(){},sound(){}});
const resources=()=>{const g=new Set(),m=new Set();parent.traverse(o=>{if(o.geometry)g.add(o.geometry);if(o.material)m.add(o.material);});return[g.size,m.size];};
try{
 await fx.prepare();assert(fx.ready);assert.equal(textureCount,20);const stable=resources(),cycles=[];let pattern;
 for(let cycle=0;cycle<5;cycle++){
  fx.cast();const samples=[];
  for(let frame=0;frame<420;frame++){
   const t=frame/60;if(frame)fx.update(1/60);const r=fx.last,links=r.art.links;
   assert(r.peakRays<=24);assert.equal(links.some(l=>l.primary),t>=2.4-1e-8&&t<6-1e-8);
   if(t>=2.4&&t<6-1e-8){assert.equal(links.filter(l=>l.primary).length,1);if(t>=2.4+2/120-1e-8)assert.equal(links.filter(l=>l.layer.startsWith('crawl')).length,8);}
   samples.push({t,rays:r.peakRays});
  }
  const r=fx.last;assert.equal(r.climaxAt,2.4);assert(r.fanouts.some(f=>f.tier===1&&f.rays>=3));assert(new Set(r.fanouts.map(f=>f.tier)).size>=2);
  for(const fan of r.fanouts){assert(fan.rays>=2&&fan.rays<=4);assert(fan.anglesDeg.every(a=>a>=40));const siblings=r.hops.filter(h=>h.tier===fan.tier&&h.from===fan.source);assert.equal(new Set(siblings.map(h=>h.variant)).size,siblings.length);}
  for(const h of r.hops.filter(h=>h.from>=0))assert(Math.hypot(h.end[0]-h.start[0],h.end[2]-h.start[2])<=6+1e-8);
  const current=JSON.stringify(r.hops.map(h=>({tier:h.tier,from:h.from,target:h.target,variant:h.variant,start:h.start,end:h.end})));
  if(pattern)assert.equal(current,pattern);else pattern=current;
  assert(r.jolts>0);assert(r.columnSounds.length>=4);assert.equal(fx.dropped,0);assert.deepEqual(resources(),stable);
  if(cycle%2)fx.clear();else fx.update(1/60);assert(!fx.active);assert.equal(fx.live,0);
  cycles.push({cycle,tiers:[1,2,3].map(t=>r.hops.filter(h=>h.tier===t).length),maxRays:r.peakRays,jolts:r.jolts,sounds:r.columnSounds,clean:true});
 }
 const frameRuns=[],pulseRuns=[];let lastFrame=-1,frameStart=0,pulseStart=-1;
 for(let ms=0;ms<=3600;ms++){
  const age=ms/1000,frame=fx.art.columnFrame(age),pulse=fx.art.columnPulse(age);
  if(frame!==lastFrame){if(ms)frameRuns.push({start:frameStart,end:ms,frame:lastFrame});frameStart=ms;lastFrame=frame;}
  if(pulse&&pulseStart<0)pulseStart=ms;if(!pulse&&pulseStart>=0){pulseRuns.push({start:pulseStart/1000,duration:(ms-pulseStart)/1000});pulseStart=-1;}
 }
 assert(frameRuns.every(r=>r.end-r.start>=60&&r.end-r.start<=120));assert.equal(pulseRuns.length,3);assert(pulseRuns.every(r=>Math.abs(r.duration-2/60)<=.001));
 fx.cast();fx.update(7);assert(!fx.active);assert.equal(fx.last.clock,7);assert.equal(fx.live,0);assert.deepEqual(resources(),stable);
 fx.cast();fx.update(2);fx.clear();assert(fx.last.cancelled);fx.cast();fx.update(.6);assert(!fx.last.cancelled);fx.clear();
 fx.dispose();fx.dispose();assert.equal(disposed,textureCount);assert.equal(parent.children.length,0);
 console.log(JSON.stringify({pass:true,cycles,resources:stable,textureCount,disposed,pulseRuns,frameCadenceMs:[Math.min(...frameRuns.map(r=>r.end-r.start)),Math.max(...frameRuns.map(r=>r.end-r.start))],distinctFrames:new Set(frameRuns.map(r=>r.frame)).size},null,2));
}finally{fx.dispose();globalThis.fetch=oldFetch;THREE.TextureLoader.prototype.loadAsync=oldLoad;}
