/** Ticket 447: narrow artifact/integration checks; does not invoke any game test suite. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('../../art-src/lab/vfx/void-ult/',import.meta.url)),magick='/opt/homebrew/bin/magick';
const meta=id=>JSON.parse(readFileSync(dir+id+'.json','utf8'));
const core=meta('void-blackhole-core'),ring=meta('void-blackhole-ring'),blade=meta('void-blackhole-crescent');
assert.equal(core.frames,60);assert.equal(ring.frames,60);assert.equal(ring.duration,2.5);assert.equal(blade.frames,53);assert.equal(blade.duration,2.2);
assert.equal(core.blend,'normal');assert.ok(Math.abs(blade.fadeStart-blade.duration*.75)<1e-12);
const raw=id=>execFileSync(magick,[dir+id+'.atlas.png','-depth','8','rgba:-'],{maxBuffer:50*1024*1024});
const pixels=raw('void-blackhole-core'),areas=[],n=core.cell,w=core.cols*n;
for(let k=0;k<60;k++){
 let count=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const p=((Math.floor(k/core.cols)*n+y)*w+(k%core.cols)*n+x)*4;
  assert.equal(pixels[p]+pixels[p+1]+pixels[p+2],0);
  assert.ok(pixels[p+3]===0||pixels[p+3]===255);
  if(x<8||y<8||x>=n-8||y>=n-8)assert.equal(pixels[p+3],0);
  if(pixels[p+3])count++;
 }
 assert.ok(count>4000&&count<8000);areas.push(count);
}
const rgb=raw('void-blackhole-ring');
function distance(a,b){let sum=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++){
 const pa=((Math.floor(a/ring.cols)*n+y)*w+a%ring.cols*n+x)*4;
 const pb=((Math.floor(b/ring.cols)*n+y)*w+b%ring.cols*n+x)*4;
 for(let c=0;c<3;c++)sum+=Math.abs(rgb[pa+c]*rgb[pa+3]/255-rgb[pb+c]*rgb[pb+3]/255);
}return sum/(n*n*3);}
const neighbors=Array.from({length:59},(_,i)=>distance(i,i+1)).sort((a,b)=>a-b),seam=distance(59,0);
assert.ok(seam<=neighbors[Math.floor(neighbors.length*.95)]*1.5,'Seam exceeds neighboring motion');
const integration=readFileSync(new URL('skills-main.ts',import.meta.url),'utf8');
const dispatch=integration.slice(integration.indexOf('function castKey8('),integration.indexOf('function castKey8(')+2100);
assert.ok(dispatch.indexOf('if (blackhole !== null)')>dispatch.indexOf('if (pick === VOID_ULT_ID)'));
assert.ok(dispatch.indexOf('if (blackhole !== null)')<dispatch.indexOf('if (!voidUlt.layered) return castClip8(pick)'));
assert.ok(integration.includes('params.get("blackhole") === "1"'));
assert.ok(integration.includes('params.get("ultVoid") !== "video"'));
assert.ok(integration.includes('voidUlt.update(world)'));
assert.ok(readFileSync(new URL('void-ult-check.mjs',import.meta.url),'utf8').split('\n')[248].includes('if (!voidUlt.layered) return castClip8(pick)'));
const implementation=readFileSync(new URL('void-blackhole-ult.ts',import.meta.url),'utf8');
assert.ok(!/ShaderMaterial|CircleGeometry|SphereGeometry|TorusGeometry|createElement\(.canvas|PointLight/.test(implementation));
assert.ok(implementation.includes('mesh.scale.setScalar'));
assert.ok(implementation.includes('this.host.pull(this.centre.x,this.centre.z,8,3.6)'));
console.log(JSON.stringify({passed:true,frames:{ring:ring.frames,core:core.frames,blade:blade.frames},opaqueCorePixels:[Math.min(...areas),Math.max(...areas)],seamMeanAbsoluteRgb:seam,neighbor95MeanAbsoluteRgb:neighbors[Math.floor(neighbors.length*.95)],oldVoidCheckLine249:'preserved'}));
