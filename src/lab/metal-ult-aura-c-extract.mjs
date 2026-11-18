/** 433k: lossless-size extraction of the owner's C painting, never image generation. */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const root='/Volumes/SS990TPRO/htdocs/typing-game';
const source='games/immortality-cultivation/art-src/lab/vfx/metal-ult/stills/giant-sword-aura.v1-try3.png';
const output=root+'/games/.wt-ic-lab-all/art-src/lab/vfx/metal-ult/giant-sword-aura-c';
const magick='/opt/homebrew/bin/magick';
const pixels=execFileSync(magick,[root+'/'+source,'-alpha','off','-depth','8','rgb:-'],{maxBuffer:8*1024*1024});
const linear=x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4;
const srgb=x=>x<=0.0031308?12.92*x:1.055*x**(1/2.4)-0.055;
const rgba=Buffer.alloc(1024*1024*8);
for(let i=0,j=0;i<pixels.length;i+=3,j+=8) {
  const a=Math.max(pixels[i],pixels[i+1],pixels[i+2])/255;
  for(let c=0;c<3;c++) rgba.writeUInt16BE(Math.round(65535*(a?srgb(linear(pixels[i+c]/255)/a):0)),j+c*2);
  rgba.writeUInt16BE(Math.round(a*65535),j+6);
}
execFileSync(magick,['-size','1024x1024','-depth','16','-endian','MSB','rgba:-','-set','colorspace','sRGB',output+'.png'],{input:rgba});
const check=execFileSync(magick,[output+'.png','-depth','16','-endian','MSB','rgba:-'],{maxBuffer:10*1024*1024});
let maxError=0,totalError=0;
for(let i=0,j=0;i<pixels.length;i+=3,j+=8) for(let c=0;c<3;c++) {
  const reconstructed=Math.round(srgb(linear(check.readUInt16BE(j+c*2)/65535)*check.readUInt16BE(j+6)/65535)*255);
  const e=Math.abs(reconstructed-pixels[i+c]);maxError=Math.max(maxError,e);totalError+=e;
}
const meta={source,size:[1024,1024],crop:[0,0,1024,1024],
  slot:{centerPixels:[512,500],topPixels:[512,240],bottomPixels:[512,760],heightPixels:520},
  stars:{topPixels:[512,180],bottomPixels:[512,808]},
  alpha:'max(sRGB); RGB unpremultiplied in linear light; no threshold, mask, blur or resampling',
  blending:'THREE.AdditiveBlending; straight alpha; SRGBColorSpace',
  reconstruction:{maxError255:maxError,meanError255:totalError/pixels.length},
  note:'Khe đen y=240…760 khớp mũi–chuôi kiếm; tâm (512,500). Hai sao nằm ngoài hai đầu thân. Giữ toàn bộ ảnh, kể cả lề.'};
writeFileSync(output+'.json',JSON.stringify(meta,null,2)+'\n');
writeFileSync(output+'.prompt.txt',`Phiếu 433k. Nguồn duy nhất: ${source}\nGiữ nguyên 1024×1024, toàn bộ hình và lề ảnh C owner chọn. Chuyển nền đen thành alpha thẳng bằng max RGB sRGB, bù RGB trong ánh sáng tuyến tính để cộng sáng tái tạo nguồn. Không cắt chi tiết, không làm mờ, không mask hoặc kéo méo. Khe kiếm: tâm (512,500), đầu trên (512,240), đầu dưới (512,760), cao 520 px; sao (512,180) và (512,808). Đây là xử lý ảnh đã có, không sinh ảnh AI. Script: games/.wt-ic-lab-all/src/lab/metal-ult-aura-c-extract.mjs.\n`);
console.log(meta);
