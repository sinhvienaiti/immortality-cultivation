/** 433i: preserve A's pixels and aspect; prepare straight alpha for linear additive blending. */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const root = '/Volumes/SS990TPRO/htdocs/typing-game';
const source = 'games/immortality-cultivation/art-src/lab/vfx/metal-ult/stills/energy-sword.v1-try1.png';
const dest = `${root}/games/.wt-ic-lab-all/art-src/lab/vfx/metal-ult/energy-sword-a`;
const magick = process.env.ART_MAGICK || '/opt/homebrew/bin/magick';
const rgb = execFileSync(magick, [`${root}/${source}`, '-alpha', 'off', '-depth', '8', 'rgb:-'], { maxBuffer: 8e6 });
const width = 224, height = 1024, left = 400;
const rgba = Buffer.alloc(width * height * 4);
const linear = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const srgb = v => v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055;
let maxError = 0, sumError = 0;
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = (y * 1024 + x + left) * 3, o = (y * width + x) * 4;
  const a = Math.max(rgb[i], rgb[i+1], rgb[i+2]);
  if (a > 2) {
    rgba[o+3] = a;
    for (let c = 0; c < 3; c++) rgba[o+c] = Math.round(255 * srgb(linear(rgb[i+c] / 255) / (a / 255)));
  }
  for (let c = 0; c < 3; c++) {
    const error = Math.abs(Math.round(255 * srgb(linear(rgba[o+c]/255) * rgba[o+3]/255)) - rgb[i+c]);
    maxError = Math.max(maxError, error); sumError += error;
  }
}
execFileSync(magick, ['-size', `${width}x${height}`, '-depth', '8', 'rgba:-', '-set', 'colorspace', 'sRGB', `${dest}.png`], { input: rgba });
writeFileSync(`${dest}.json`, JSON.stringify({ source, size: [width, height], crop: [left, 0, width, height],
  tip: { pixels: [111, 850], sourcePixels: [511, 850] },
  hilt: { pixels: [111, 200], sourcePixels: [511, 200] }, lengthPixels: 650,
  inkBounds: [29, 175, 194, 885],
  alpha: 'max(sRGB); RGB unpremultiplied in linear light; RGB<=2/255 removed',
  blending: 'THREE.AdditiveBlending; straight alpha; SRGBColorSpace',
  reconstruction: { maxError255: maxError, meanError255: sumError/(width*height*3) },
  note: 'Mũi local y=0, đầu chuôi local y=1; giữ nguyên tỉ lệ, chi tiết và màu ảnh A.'
}, null, 2)+'\n');
writeFileSync(`${dest}.prompt.txt`, `Phiếu 433i. Nguồn duy nhất: ${source}\nCắt lề ngang x=400, y=0, rộng=224, cao=1024; giữ nguyên điểm ảnh, hình, tỉ lệ và màu A. Chuyển nền đen thành alpha thẳng, bù RGB trong ánh sáng tuyến tính để phép cộng sáng tái tạo nguồn. Mũi (511,850), đầu chuôi (511,200) trên ảnh gốc; tương ứng (111,850) và (111,200) trên ảnh cắt. Xử lý ảnh owner đã chọn, không sinh ảnh AI.\n`);
console.log({ dest, maxError255: maxError, meanError255: sumError/(width*height*3) });
