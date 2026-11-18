/** 434f: ownership and cast/cancel/recast with real manifests; no GPU claim. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {ThunderUltChain} from './thunder-ult-chain.ts';
const root=new URL('../../',import.meta.url),base=new URL('art-src/lab/vfx/',root).href;
const local=url=>String(url).startsWith('/art-src/')?new URL(String(url).slice(1),root):new URL(String(url));
const originalFetch=globalThis.fetch,originalLoad=THREE.TextureLoader.prototype.loadAsync,originalInfo=console.info;
console.info=()=>{};
let requests=[],textures=[],disposed=0;
globalThis.fetch=async url=>{requests.push(String(url));return new Response(await readFile(local(url),'utf8'));};
THREE.TextureLoader.prototype.loadAsync=async function(url){const bytes=await readFile(local(url)),t=new THREE.Texture();t.image={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};t.addEventListener('dispose',()=>disposed++);textures.push(t);return t;};
const parent=new THREE.Group(),camera=new THREE.PerspectiveCamera(30,1280/720,.01,1000);camera.position.set(0,25,30);camera.lookAt(0,0,-5);camera.updateMatrixWorld(true);
const targets={size:100,alive:()=>true,x:i=>(i%10-4.5)*2.6,z:i=>-17+Math.floor(i/10)*1.6,midY:()=>.85};
const fx=new ThunderUltChain(parent,base,{targets,camera,caster:p=>p.set(0,0,4),hand:p=>p.set(0,1.4,3.5),release(){},stun(){},blow(){return false;},strike(){}});
const resources=()=>{const g=new Set(),m=new Set();parent.traverse(o=>{if(o.geometry)g.add(o.geometry);if(o.material)m.add(o.material);});return [g.size,m.size];};
try{
 await fx.prepare();assert(fx.ready);assert.equal(textures.length,16);
 assert(!requests.some(x=>x.includes('thunder-ground-mark')||x.includes('thunder-scorch-crack-top')));
 const stable=resources(),cycles=[];
 for(let k=0;k<5;k++){
  fx.cast();fx.update(1.35);assert(fx.last.art.links.some(l=>l.layer.startsWith('bolt')));
  fx.update(.85);const r=fx.last,links=r.art.links;
  assert.equal(links.filter(l=>l.layer==='columnA').length,1);assert.equal(links.filter(l=>l.layer.startsWith('crawl')).length,8);
  assert(links.filter(l=>l.layer.startsWith('crawl')).every(l=>l.start[1]===.08&&l.end[1]===.08));
  assert(!r.sections.some(s=>s.primary||Math.abs(s.born-2)<1e-8));assert.equal(fx.dropped,0);
  const turns=r.hops.slice(1).map(h=>h.turnDeg);assert(turns.every((a,i)=>Math.abs(a)>=35&&Math.abs(a)<=80&&(i===0||a*turns[i-1]<0)));
  assert.deepEqual(resources(),stable);const n=textures.length;await fx.prepare();assert.equal(textures.length,n);
  if(k%2===0)fx.clear();else fx.update(1.8);
  assert(!fx.active);assert.equal(fx.live,0);cycles.push({k,hops:r.hops.length,ground:8,live:fx.live});
 }
 const sources=fx.last.art.sources.map(x=>({id:x.id,still:x.still,flipbook:x.flipbook}));
 fx.dispose();fx.dispose();assert.equal(disposed,16);assert.equal(parent.children.length,0);
 console.log(JSON.stringify({pass:true,cycles,resources:stable,textures:textures.length,disposed,sources},null,2));
}finally{fx.dispose();globalThis.fetch=originalFetch;THREE.TextureLoader.prototype.loadAsync=originalLoad;console.info=originalInfo;}
