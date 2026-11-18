/** 439b: Rec.709 on normalized screenshot RGB, paired at identical camera/clock. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const magick='/opt/homebrew/bin/magick';
const W=1280,H=720;
const SPAN=180;
const luma=b=>{const y=new Float32Array(W*H);for(let i=0;i<y.length;i++)y[i]=(.2126*b[i*3]+.7152*b[i*3+1]+.0722*b[i*3+2])/255;return y;};
const pixels=p=>{
 const size=execFileSync(magick,[p,'-format','%w %h','info:'],{encoding:'utf8'}).trim();
 if(size!==`${W} ${H}`)throw new Error('Probe requires 1280x720: '+size);
 return execFileSync(magick,[p,'-alpha','off','-depth','8','rgb:-'],{maxBuffer:W*H*4});
};
const inside=(x,y,poly)=>{
 const sign=(a,b)=>(x-b[0])*(a[1]-b[1])-(a[0]-b[0])*(y-b[1]);
 const s=poly.map((p,i)=>sign(p,poly[(i+1)%3]));return s.every(n=>n>=0)||s.every(n=>n<=0);
};
const sample=(arr,x,y)=>{
 if(x<0||y<0||x>=W-1||y>=H-1)return 0;
 const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,k=iy*W+ix;
 return (arr[k]*(1-u)+arr[k+1]*u)*(1-v)+(arr[k+W]*(1-u)+arr[k+W+1]*u)*v;
};
function cross(on,off,ends,fraction=.5,centrePoint=null){
 const [a,b]=ends,mid=centrePoint??[a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
 if(len<1)return null;
 const normal=[-dy/len,dx/len],rows=[];
 for(let d=-SPAN;d<=SPAN;d++){
  const x=mid[0]+normal[0]*d,y=mid[1]+normal[1]*d;
  const Y=sample(on,x,y);rows.push({d,x,y,Y,delta:Y-sample(off,x,y)});
 }
 const band=fn=>{
  // The contiguous band through the beam axis excludes isolated sparks/other rays.
  let centre=SPAN;
  if(!fn(rows[centre])){if(fn(rows[SPAN-1]))centre=SPAN-1;else if(fn(rows[SPAN+1]))centre=SPAN+1;else return 0;}
  let lo=centre,hi=centre;while(lo>0&&fn(rows[lo-1]))lo--;while(hi<SPAN*2&&fn(rows[hi+1]))hi++;
  return hi-lo+1;
 };
 return {endpoints:ends,midpoint:mid,normal,profileRadiusPx:SPAN,glowPx:band(r=>r.delta>=.1),corePx:band(r=>r.Y>=.95),
  totalGlowSamples:rows.filter(r=>r.delta>=.1).length,totalCoreSamples:rows.filter(r=>r.Y>=.95).length,rows};
}
export function analyzePair(onPath,offPath,state){
 const rgb=pixels(onPath),off=luma(pixels(offPath)),on=luma(rgb);
 let x0=W,y0=H,x1=-1,y1=-1,litN=0;
 let white=0,wedgeN=0,wedgeLit=0,roiN=0,roiLit=0,impactN=0,impactLit=0,impactY=0,impactDelta=0;
 const impact=state.impactScreen??state.focusScreen[1];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  if(impact&&Math.hypot(x+.5-impact[0],y+.5-impact[1])<=120){impactN++;impactY+=on[y*W+x];impactDelta+=on[y*W+x]-off[y*W+x];if(on[y*W+x]-off[y*W+x]>=.15)impactLit++;}
  const k=y*W+x,lit=on[k]-off[k]>=.15;
  if(lit){litN++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  if(rgb[k*3]/255>=.95&&rgb[k*3+1]/255>=.95&&rgb[k*3+2]/255>=.95)white++;
  if(inside(x+.5,y+.5,state.fanScreen)){wedgeN++;if(lit)wedgeLit++;}
  if(x>=W*.2&&x<W*.8&&y>=H*.3&&y<H*.7){roiN++;if(lit)roiLit++;}
 }
 const [apex,left,right]=state.fanScreen;
 // Projected midpoint of world endpoints, not a screen-space invented fan axis.
 const midWorld=state.fanMidScreen??[(left[0]+right[0])/2,(left[1]+right[1])/2];
 return {bounds:{thresholdDeltaY:.15,rect:litN?[x0,y0,x1-x0+1,y1-y0+1]:[0,0,0,0],widthPct:litN?(x1-x0+1)/W*100:0,heightPct:litN?(y1-y0+1)/H*100:0,bboxAreaPx:litN?(x1-x0+1)*(y1-y0+1):0,litPixels:litN,coveragePct:litN/(W*H)*100},impact:{centre:impact,radiusPx:120,pixels:impactN,lit:impactLit,coveragePct:impactN?impactLit/impactN*100:0,meanY:impactN?impactY/impactN:0,meanDeltaY:impactN?impactDelta/impactN:0},
  taper:[.2,.5,.85].map((f,i)=>{const c=cross(on,off,state.rayScreen?.length?[apex,state.rayScreen[Math.floor(state.rayScreen.length/2)]]:state.focusScreen,f,state.beamSectionScreen?.[i]);return {fraction:f,glowPx:c?.glowPx??0,corePx:c?.corePx??0,midpoint:c?.midpoint};}),
  whitePct:white/(W*H)*100,wedge:{polygon:state.fanScreen,pixels:wedgeN,lit:wedgeLit,coveragePct:wedgeN?wedgeLit/wedgeN*100:0},
  behindROI:{rect:[256,216,768,288],pixels:roiN,lit:roiLit,coveragePct:roiLit/roiN*100},
  rays:(state.rayScreen??[]).map(end=>{const c=cross(on,off,[apex,end]);return c&&{glowPx:c.glowPx,corePx:c.corePx,endpoints:c.endpoints};}),
  fan:cross(on,off,[apex,midWorld]),focus:cross(on,off,state.focusScreen)};
}
/** Peak-only connected footprint; rejects isolated sparkle outliers. */
export function connectedFootprint(onPath,offPath){
 const a=luma(pixels(onPath)),b=luma(pixels(offPath)),mask=new Uint8Array(W*H),queue=new Int32Array(W*H);
 for(let i=0;i<mask.length;i++)mask[i]=a[i]-b[i]>=.15?1:0;
 let best={pixels:0,rect:[0,0,0,0]};
 for(let seed=0;seed<mask.length;seed++)if(mask[seed]){
  let head=0,tail=1,x0=W,y0=H,x1=-1,y1=-1;queue[0]=seed;mask[seed]=0;
  while(head<tail){
   const k=queue[head++],x=k%W,y=Math.floor(k/W);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;
    const n=ny*W+nx;if(mask[n]){mask[n]=0;queue[tail++]=n;}
   }
  }
  if(tail>best.pixels)best={pixels:tail,rect:[x0,y0,x1-x0+1,y1-y0+1]};
 }
 return {...best,widthPct:best.rect[2]/W*100,heightPct:best.rect[3]/H*100,coveragePct:best.pixels/(W*H)*100};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [on,off,statePath,out]=process.argv.slice(2);const state=JSON.parse(readFileSync(statePath,'utf8'));
 const r=analyzePair(on,off,state.last??state);if(out)writeFileSync(out,JSON.stringify(r,null,2));else console.log(JSON.stringify(r,null,2));
}
