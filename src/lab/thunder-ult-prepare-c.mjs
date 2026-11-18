/** 434h: deterministic crop/straight-alpha conversion of the owner's exact C source. */
import {execFileSync} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root='/Volumes/SS990TPRO/htdocs/typing-game',dir=join(root,'games/.wt-ic-lab-all/art-src/lab/vfx/thunder');
const source=join(root,'games/immortality-cultivation/art-src/lab/vfx/thunder/stills-55/thunder-bolt-ff.v1-try3.png');
const magick='/opt/homebrew/bin/magick',size=1024,p=execFileSync(magick,[source,'-depth','8','rgba:-'],{maxBuffer:8e6});
const crop=[48,280,930,470], [cx,cy,w,h]=crop;
function anchor(x0,y0){let sx=0,sy=0,n=0;for(let y=y0-12;y<=y0+12;y++)for(let x=x0-12;x<=x0+12;x++){const i=(y*size+x)*4;if(Math.min(p[i],p[i+1],p[i+2])>=230){sx+=x;sy+=y;n++;}}return [sx/n-cx,sy/n-cy];}
const a=anchor(122,493),b=anchor(899,532),linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4,srgb=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
const names=['thunder-chain-c','thunder-chain-c-flip-y','thunder-chain-c-flip-x','thunder-chain-c-flip-xy'],variants=[];
for(let v=0;v<4;v++){
 const out=Buffer.alloc(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const sx=v>=2?w-1-x:x,sy=v%2===1?h-1-y:y,i=((sy+cy)*size+sx+cx)*4,j=(y*w+x)*4;
  const rgb=[0,1,2].map(c=>linear(p[i+c]/255)),alpha=Math.sqrt(Math.max(...rgb));
  for(let c=0;c<3;c++)out[j+c]=Math.round(255*srgb(alpha?rgb[c]/alpha:0));
  out[j+3]=Math.round(255*alpha);
 }
 const file=names[v]+'.png';execFileSync(magick,['-size',`${w}x${h}`,'-depth','8','rgba:-','-set','colorspace','sRGB',join(dir,file)],{input:out});
 const flip=p=>[v>=2?w-1-p[0]:p[0],v%2===1?h-1-p[1]:p[1]],start=flip(a),end=flip(b);
 const prompt=`Xử lý cơ học ảnh C owner đã chọn: ${source}\nCắt vùng [${crop.join(', ')}] pixel; giữ nguyên nét và màu; đổi đen thành alpha thẳng bằng alpha = sqrt(max(R,G,B tuyến tính)), RGB thẳng = RGB tuyến tính / alpha. ${v===3?'Lật cả ngang và dọc.':v===1?'Lật dọc.':v===2?'Lật ngang.':'Giữ hướng gốc.'} Hai neo là tâm các pixel RGB ≥230 trong ô 25×25 quanh hai chấm sáng. Không tạo hình mới.\n`;
 writeFileSync(join(dir,names[v]+'.prompt.txt'),prompt);
 variants.push({id:names[v],file,size:[w,h],anchorsPx:{start,end},anchorsUv:{start:[start[0]/w,1-start[1]/h],end:[end[0]/w,1-end[1]/h]},transform:v===3?'flip-xy':v===1?'flip-y':v===2?'flip-x':'original'});
}
const manifest={version:1,source,sourceSha256:createHash('sha256').update(readFileSync(source)).digest('hex'),crop,coordinates:'pixel từ góc trên trái; UV từ góc dưới trái',alpha:'straight; additive sample RGB tuyến tính × alpha khôi phục nguồn',variants};
writeFileSync(join(dir,'thunder-chain-c.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest,null,2));
