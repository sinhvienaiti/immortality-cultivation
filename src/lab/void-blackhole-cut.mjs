/** Ticket 447: deterministic video cuts and a source-pixel core matte; no generated silhouettes. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const out=fileURLToPath(new URL('../../art-src/lab/vfx/void-ult/',import.meta.url));
const magick=process.env.ART_MAGICK||'/opt/homebrew/bin/magick';
const ffmpeg='/opt/homebrew/bin/ffmpeg', cell=384, cols=8, fps=24;
mkdirSync(out,{recursive:true});
const sourceRoot='games/immortality-cultivation/art-src/lab/vfx/void-ult/firefly-raw/';
const reference='games/immortality-cultivation/art-src/concept/ult-void/blackhole/void-blackhole-storyboard.v1-try1.png';
function decode(name,start,duration){
 return execFileSync(ffmpeg,['-v','error','-ss',String(start),'-i',join(out,'firefly-raw',name+'.mp4'),'-t',String(duration),'-vf',`fps=${fps},scale=${cell}:${cell}:flags=lanczos`,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:80*1024*1024});
}
const pixels=cell*cell;
function coreMask(rgb){
 // The connected dark region enclosed by video light. A 5px max-filter seals compression pinholes.
 const bright=new Uint8Array(pixels),barrier=new Uint8Array(pixels),seen=new Uint8Array(pixels),queue=new Int32Array(pixels);
 for(let p=0;p<pixels;p++)bright[p]=Math.max(rgb[p*3],rgb[p*3+1],rgb[p*3+2])>=23?1:0;
 for(let y=2;y<cell-2;y++)for(let x=2;x<cell-2;x++){
  let on=0;for(let dy=-2;dy<=2&&!on;dy++)for(let dx=-2;dx<=2;dx++)if(bright[(y+dy)*cell+x+dx]){on=1;break;}
  barrier[y*cell+x]=on;
 }
 const seed=Math.floor(cell*.46)*cell+Math.floor(cell*.48);
 if(barrier[seed])throw new Error('Core seed is on source light');
 let head=0,tail=1;queue[0]=seed;seen[seed]=1;
 while(head<tail){const p=queue[head++],x=p%cell,y=Math.floor(p/cell);
  if(x===0||y===0||x===cell-1||y===cell-1)throw new Error('Source core contour is open');
  for(const n of [p-1,p+1,p-cell,p+cell])if(!barrier[n]&&!seen[n]){seen[n]=1;queue[tail++]=n;}
 }
 if(tail<pixels*.015||tail>pixels*.25)throw new Error('Unexpected source core area '+tail);
 // Expand the enclosed region back to the inner light boundary (same square filter radius).
 const alpha=new Uint8Array(pixels);
 for(let y=2;y<cell-2;y++)for(let x=2;x<cell-2;x++){
  let on=0;for(let dy=-2;dy<=2&&!on;dy++)for(let dx=-2;dx<=2;dx++)if(seen[(y+dy)*cell+x+dx]){on=1;break;}
  alpha[y*cell+x]=on?255:0;
 }
 return {alpha,area:tail};
}
function pack(id,frames,meta,prompt){
 const rows=Math.ceil(frames.length/cols),w=cell*cols,h=cell*rows,atlas=Buffer.alloc(w*h*4);
 frames.forEach((rgba,k)=>{for(let y=0;y<cell;y++)rgba.copy(atlas,((Math.floor(k/cols)*cell+y)*w+k%cols*cell)*4,y*cell*4,(y+1)*cell*4);});
 execFileSync(magick,['-size',`${w}x${h}`,'-depth','8','rgba:-','-define','png:color-type=6',join(out,id+'.atlas.png')],{input:atlas,maxBuffer:1024*1024});
 writeFileSync(join(out,id+'.atlas.prompt.txt'),prompt+'\nTham chiếu phân cảnh: '+reference+'\n');
 writeFileSync(join(out,id+'.json'),JSON.stringify({id,image:id+'.atlas.png',cols,rows,cell,frames:frames.length,fps,...meta},null,2)+'\n');
}
const raw=decode('void-accretion-ring.v1-try1',.5,3),ring=[],core=[],areas=[];
// 72 source frames -> 60-frame 2.5s loop. Start at frame 12; the tail blends into frames 0–11, immediately preceding frame 12.
for(let k=0;k<60;k++){
 const rgb=Buffer.from(raw.subarray((k+12)*pixels*3,(k+13)*pixels*3));
 if(k>=48){const f=(k-48+1)/13,other=raw.subarray((k-60+12)*pixels*3,(k-60+13)*pixels*3);for(let n=0;n<rgb.length;n++)rgb[n]=Math.round(rgb[n]*(1-f)+other[n]*f);}
 const matte=coreMask(rgb);areas.push(matte.area);
 const a=Buffer.alloc(pixels*4),b=Buffer.alloc(pixels*4);
 for(let p=0;p<pixels;p++){
  const hi=Math.max(rgb[p*3],rgb[p*3+1],rgb[p*3+2]),alpha=Math.max(0,(hi-5)/250);
  const x=p%cell,y=Math.floor(p/cell),edge=Math.min(1,x/8,y/8,(cell-1-x)/8,(cell-1-y)/8);
  a[p*4+3]=Math.round(alpha*edge*255);
  for(let c=0;c<3;c++)a[p*4+c]=alpha>0?Math.min(255,Math.round(rgb[p*3+c]/alpha)):0;
  b[p*4+3]=matte.alpha[p];
 }
 ring.push(a);core.push(b);
}
const sourcePrompt=readFileSync(join(out,'firefly-raw/void-accretion-ring.v1-try1.prompt.txt'),'utf8');
const common={duration:2.5,loop:true,source:sourceRoot+'void-accretion-ring.v1-try1.mp4',sourceStart:1,sourceEnd:3.5,decodeStart:.5,loopCrossfadeFrames:12,reference,sourceSha256:createHash('sha256').update(readFileSync(join(out,'firefly-raw/void-accretion-ring.v1-try1.mp4'))).digest('hex')};
pack('void-blackhole-ring',ring,{...common,blend:'additive'},'Cắt video 1,0–3,5 s (đọc thêm 0,5–1,0 s để hòa đoạn nối), 60 khung/24 fps; hòa 12 khung cuối với đoạn trước điểm bắt đầu để nối lặp. Khử nền đen thành alpha, giữ tỷ lệ nguồn.\nPrompt nguồn nguyên văn:\n'+sourcePrompt);
pack('void-blackhole-core',core,{...common,blend:'normal',matte:'Connected dark video region enclosed by bright pixels; source threshold 23/255, 5px square max filter, expand 2px',areas},'Mặt nạ lấy từ từng khung video vành: flood-fill vùng tối bên trong viền sáng, đóng khe nén bằng max-filter vuông 5 px rồi mở lại 2 px. RGB đen, alpha 255 bên trong; không tạo hình tròn, không vẽ đĩa. Cùng thời gian và ô với atlas vành.\nPrompt nguồn nguyên văn:\n'+sourcePrompt);
const bladeRaw=decode('void-crescent-blade.v1-try1',0,2.2),blades=[];
for(let k=0;k<Math.floor(bladeRaw.length/(pixels*3));k++){
 const rgba=Buffer.alloc(pixels*4),rgb=bladeRaw.subarray(k*pixels*3,(k+1)*pixels*3);
 for(let p=0;p<pixels;p++){
  const hi=Math.max(rgb[p*3],rgb[p*3+1],rgb[p*3+2]),alpha=Math.max(0,(hi-5)/250),x=p%cell,y=Math.floor(p/cell),edge=Math.max(0,Math.min(1,x/8,y/8,(cell-1-x)/8,(cell-1-y)/8));
  rgba[p*4+3]=Math.round(alpha*edge*255);for(let c=0;c<3;c++)rgba[p*4+c]=alpha>0?Math.min(255,Math.round(rgb[p*3+c]/alpha)):0;
 }blades.push(rgba);
}
pack('void-blackhole-crescent',blades,{duration:2.2,loop:false,source:sourceRoot+'void-crescent-blade.v1-try1.mp4',fadeStart:1.65,fadeEnd:2.2,fade:'runtime opacity; final 25%',reference},'Cắt video 0–2,2 s, 24 fps; nền đen thành alpha, không sửa hình lưỡi. Runtime điều chỉnh độ mờ trong 25% cuối; không kéo dài tới 4,9 s.\nPrompt nguồn nguyên văn:\n'+readFileSync(join(out,'firefly-raw/void-crescent-blade.v1-try1.prompt.txt'),'utf8'));
console.log(JSON.stringify({ring:ring.length,core:core.length,blade:blades.length,coreArea:[Math.min(...areas),Math.max(...areas)],out}));
