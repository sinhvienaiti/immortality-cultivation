/** 447b: project the existing atlas support, rather than measuring the empty quad. No image generation. */
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('../../art-src/lab/vfx/void-ult/',import.meta.url));
const meta=JSON.parse(readFileSync(dir+'void-blackhole-ring.json','utf8'));
const data=execFileSync('/opt/homebrew/bin/magick',[dir+meta.image,'-depth','8','rgba:-'],{maxBuffer:50*1024*1024});
const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
function hull(points){
 points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const low=[],high=[];
 for(const p of points){while(low.length>=2&&cross(low.at(-2),low.at(-1),p)<=0)low.pop();low.push(p);}
 for(const p of points.toReversed()){while(high.length>=2&&cross(high.at(-2),high.at(-1),p)<=0)high.pop();high.push(p);}
 return low.slice(0,-1).concat(high.slice(0,-1));
}
meta.support=Array.from({length:meta.frames},(_,k)=>{
 const points=[],n=meta.cell,width=meta.cols*n;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const p=((Math.floor(k/meta.cols)*n+y)*width+k%meta.cols*n+x)*4;
  if(Math.max(data[p],data[p+1],data[p+2])*data[p+3]/255>=12)points.push([x,y]);
 }
 return hull(points).map(([x,y])=>[+(x/(n-1)-.5).toFixed(6),+(.5-y/(n-1)).toFixed(6)]);
});
meta.measurement='Convex support hull of source premultiplied RGB >=12/255; measurements only; original atlas unchanged.';
writeFileSync(dir+'void-blackhole-ring-b.json',JSON.stringify(meta)+'\n');
console.log(JSON.stringify({frames:meta.frames,points:meta.support.map(p=>p.length)}));
