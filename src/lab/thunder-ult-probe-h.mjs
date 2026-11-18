/** 434h: ownership and cast/cancel/recast with real manifests; no GPU claim. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {ThunderChainCards} from './thunder-ult-chain-card.ts';
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
 await fx.prepare();assert(fx.ready);assert.equal(textures.length,19);
 assert(requests.some(x=>x.endsWith('thunder-chain-c.json')));
 assert(!requests.some(x=>x.includes('thunder-ground-mark')||x.includes('thunder-scorch-crack-top')));
 const stable=resources(),cycles=[];
 fx.cast();fx.update(.6);
 const first=fx.last.art.links.find(l=>l.layer==='boltC-card');
 assert(first && first.gain>.99, 'First hop is fully lit on its birth frame');
 fx.clear();

 for(let k=0;k<5;k++){
  fx.cast();fx.update(1.35);
  const bolts=fx.last.art.links.filter(l=>l.layer.startsWith('bolt'));
  assert(bolts.length>0);assert(bolts.every(l=>l.layer==='boltC-card'&&Number.isFinite(l.widthM)&&l.widthM>0&&l.source.startsWith('thunder-chain-c')&&l.durationS>=.22&&l.durationS<=.24));
  assert(fx.last.hops.every(h=>h.holdS===.22));
  fx.update(.85);const r=fx.last,links=r.art.links;
  assert.equal(links.filter(l=>l.layer==='columnA').length,1);assert.equal(links.filter(l=>l.layer.startsWith('crawl')).length,8);
  assert(links.filter(l=>l.layer.startsWith('crawl')).every(l=>l.start[1]===.08&&l.end[1]===.08));
  assert(!r.sections.some(s=>s.primary||Math.abs(s.born-2)<1e-8));assert.equal(fx.dropped,0);
  const turns=r.hops.slice(1).map(h=>h.turnDeg);assert(turns.every((a,i)=>Math.abs(a)>=35&&Math.abs(a)<=80&&(i===0||a*turns[i-1]<0)));
  assert.deepEqual(resources(),stable);const n=textures.length;await fx.prepare();assert.equal(textures.length,n);
  if(k%2===0)fx.clear();else fx.update(1.8);
  assert(!fx.active);assert.equal(fx.live,0);cycles.push({k,hops:r.hops.length,ground:8,live:fx.live});
 }
 // Exercise all three affine anchor transforms, moving chests and the two seeded flicker dips.
 const isolated=new THREE.Group(),hide={value:new THREE.Vector3(1e6,1e6,1e6)},solo={value:hide.value.clone()};
 const cards=new ThunderChainCards(isolated,camera,hide,solo);await cards.prepare();
 let movement=0;const anchors=[],timings=[];
 for(let i=0;i<3;i++){
  cards.hop(new THREE.Vector3(i,1,0),new THREE.Vector3(i+3,1,-2),1+i*.1,
   p=>p.set(i+movement,1,0),p=>p.set(i+3+movement,1,-2));
 }
 movement=.3;cards.present(1.25);
 for(const card of cards.cards.slice(0,3)){
  // Restore a time inside this individual card; exact geometry maths from its four-corner shader.
  cards.present(card.born+.05);const u=card.mesh.material.uniforms,A=u.uA.value,B=u.uB.value;
  const axis=B.clone().sub(A),len=axis.length();axis.normalize();const perp=new THREE.Vector2(-axis.y,axis.x);
  const world=P=>{const v=P.clone().sub(A);return u.uFrom.value.clone().lerp(u.uTo.value,v.dot(axis)/len).addScaledVector(u.uSide.value,v.dot(perp)*u.uScale.value);};
  const startError=world(A).distanceTo(u.uFrom.value),endError=world(B).distanceTo(u.uTo.value);
  assert(startError<1e-10&&endError<1e-10);assert(Math.abs(card.from.x-cards.cards.indexOf(card)-.3)<1e-8);
  anchors.push({variant:card.variant,startErrorM:startError,endErrorM:endError,movementM:movement});
  const samples=Array.from({length:Math.ceil(card.duration*1000)+1},(_,j)=>({age:j/1000,gain:cards.gain(card,card.born+j/1000)}));
  const dips=samples.filter((x,j)=>j>0&&j<samples.length-1&&x.gain<.3&&x.gain<samples[j-1].gain&&x.gain<samples[j+1].gain);
  assert.equal(dips.length,2);assert.equal(cards.gain(card,card.born),1);assert.equal(cards.gain(card,card.born+card.duration+1e-8),0);
  timings.push({variant:card.variant,durationS:card.duration,firstGain:cards.gain(card,card.born),dips,samples});
 }
 cards.dispose();
 const sources=fx.last.art.sources.map(x=>({id:x.id,still:x.still,flipbook:x.flipbook}));
 fx.dispose();fx.dispose();assert.equal(disposed,22);assert.equal(parent.children.length,0);
 console.log(JSON.stringify({pass:true,cycles,resources:stable,textures:textures.length,disposed,sources,anchors,timings},null,2));
}finally{fx.dispose();globalThis.fetch=originalFetch;THREE.TextureLoader.prototype.loadAsync=originalLoad;console.info=originalInfo;}
