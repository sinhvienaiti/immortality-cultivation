/** Ticket 441b: package the owner's Firefly D take; no image generation.
 * ART_MAGICK=/opt/homebrew/bin/magick node src/lab/light-ult-cut.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const game=fileURLToPath(new URL('../../',import.meta.url));
const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const out=join(game,'art-src/lab/vfx/light'),id='light-prism-burst-hi';
const source=join(out,'firefly-raw/light-prism-burst.v1-try1.mp4');
const magick=process.env.ART_MAGICK||'/opt/homebrew/bin/magick';
const frames=32,cell=512,cols=8,rows=4,width=cell*cols,height=cell*rows;
const indices=Array.from({length:frames},(_,i)=>Math.round(i*72/frames));
const select=indices.map(i=>`eq(n\\,${i})`).join('+');
const decoded=execFileSync('/opt/homebrew/bin/ffmpeg',['-v','error','-i',source,'-vf',
  `select=${select},pad=1280:1280:100:125:black,scale=${cell}:${cell}:flags=lanczos`,
  '-frames:v','32','-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgba','-'],{maxBuffer:frames*cell*cell*4+1024});
if(decoded.length!==frames*cell*cell*4)throw new Error('Thiếu khung nguồn');
mkdirSync(out,{recursive:true});
const atlas=Buffer.alloc(width*height*4);
const margin={left:cell,right:cell,top:cell,bottom:cell};
const fades=[];
for(let f=0;f<frames;f++){
  // Exactly the last quarter; frame 31 is completely transparent.
  const q=Math.max(0,Math.min(1,(f-23)/8)),fade=1-q*q*(3-2*q);fades.push(fade);
  for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){
    const p=(f*cell*cell+y*cell+x)*4,hi=Math.max(decoded[p],decoded[p+1],decoded[p+2]);
    const a=Math.max(0,(hi-5)/250),k=((Math.floor(f/cols)*cell+y)*width+(f%cols)*cell+x)*4;
    for(let c=0;c<3;c++)atlas[k+c]=a>0&&fade>0?Math.round(decoded[p+c]/hi*255):0;
    atlas[k+3]=Math.round(a*fade*255);
    if(atlas[k+3]>12){margin.left=Math.min(margin.left,x);margin.right=Math.min(margin.right,cell-1-x);margin.top=Math.min(margin.top,y);margin.bottom=Math.min(margin.bottom,cell-1-y);}
  }
}
const raw=join(out,'.441-prism.rgba'),packed=join(out,'.441-prism-decoded.rgba');
try{
  execFileSync(magick,['-size',`${width}x${height}`,'-depth','8','rgba:-','-define','png:color-type=6',join(out,id+'.atlas.png')],{input:atlas});
  writeFileSync(raw,atlas);
  const encoder=JSON.parse(execFileSync('node',[join(repo,'tools/vfx-flipbook/ktx2/encode.mjs'),'--raw',raw,'--width',String(width),'--height',String(height),'--out',join(out,id+'.uastc.ktx2'),'--codec','uastc','--transfer','srgb','--uastc-level','2'],{encoding:'utf8'}).trim().split('\n').at(-1));
  const inspect=JSON.parse(execFileSync('node',[join(repo,'tools/vfx-flipbook/ktx2/inspect.mjs'),join(out,id+'.uastc.ktx2'),'--rgba',packed],{encoding:'utf8'}).trim());
  const compressed=readFileSync(packed),ktxMargin={left:cell,right:cell,top:cell,bottom:cell};
  let tailMaxAlpha=0;
  for(let f=0;f<frames;f++)for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){
    // The standard encoder Y-flips the full atlas, including its cell rows.
    const py=height-1-(Math.floor(f/cols)*cell+y),k=(py*width+(f%cols)*cell+x)*4,a=compressed[k+3];
    if(f===frames-1)tailMaxAlpha=Math.max(tailMaxAlpha,a);
    if(a>12){ktxMargin.left=Math.min(ktxMargin.left,x);ktxMargin.right=Math.min(ktxMargin.right,cell-1-x);ktxMargin.top=Math.min(ktxMargin.top,y);ktxMargin.bottom=Math.min(ktxMargin.bottom,cell-1-y);}
  }
  if(Math.min(...Object.values(margin),...Object.values(ktxMargin))<26||tailMaxAlpha!==0)throw new Error('Lề hoặc đuôi KTX2 không đạt');
  const manifest={id,game:'immortality-cultivation',version:'v1',image:id+'.atlas.png',atlas:[width,height],cols,rows,frames,
    order:'row-major from the top-left cell',fps:frames/3,loop:false,blend:'additive',channels:'rgba',premultiplied:false,
    cell:[cell,cell],pivot:[.5,(1080*.62+125)/1280],pivotOrigin:'top-left of the cell, 0..1',tileX:false,
    source:{file:'firefly-raw/light-prism-burst.v1-try1.mp4',model:'Adobe Firefly Video',width:1080,height:1080,fps:24,frames:121,
      sha256:createHash('sha256').update(readFileSync(source)).digest('hex'),reference:'stills-55/light-prism-burst.v1-try4.png',
      groundContactPx:[540,1080*.62],rotate:0,flipX:false,crop:[-100,-125,1280,1280],squashY:1},
    trim:{start:0,end:72,indices,tailFade:8,tailFadeFactors:fades},
    tool:'src/lab/light-ult-cut.mjs, ticket 441b',element:'light',role:'upright-impact',
    packageCheck:{thresholdAlpha:12,marginPx:margin,ktxMarginPx:ktxMargin,tailMaxAlpha,encoder,inspect}};
  writeFileSync(join(out,id+'.json'),JSON.stringify(manifest,null,2)+'\n');
  const sourcePrompt=readFileSync(source.replace('.mp4','.prompt.txt'),'utf8');
  const prompt=`Phiếu 441b. Chỉ đóng gói video owner chọn «Bản 1», không gọi AI.\nNguồn: art-src/lab/vfx/light/firefly-raw/light-prism-burst.v1-try1.mp4\nTham chiếu gốc: art-src/lab/vfx/light/stills-55/light-prism-burst.v1-try4.png\nLấy 32 khung trong 0–3 s: ${indices.join(', ')}. Crop [-100,-125,1280,1280] có đệm đen, thu đồng nhất về 512²; giữ lề, không che mép.\nĐen thành straight alpha: a=max(0,(maxRGB−5)/250), RGB=C/maxRGB; cộng sáng bằng RGB×alpha.\nTám khung cuối fade smoothstep 1→0; khung 31 trong suốt hoàn toàn. Pivot chạm đất nguồn [540,669.6], pivot ô ${JSON.stringify(manifest.pivot)}.\nAtlas 8×4, 4096×2048, UASTC mức 2, sRGB, Zstd, Y-flip, mipmap.\n\nPrompt video nguyên văn:\n${sourcePrompt}`;
  for(const name of [id+'.prompt.txt',id+'.atlas.prompt.txt'])writeFileSync(join(out,name),prompt);
  console.log(JSON.stringify(manifest.packageCheck));
}finally{rmSync(raw,{force:true});rmSync(packed,{force:true});}
