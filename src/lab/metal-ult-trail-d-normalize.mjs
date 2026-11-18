/** 433h: deterministic black-to-alpha preparation of the owner's D painting. */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const root = '/Volumes/SS990TPRO/htdocs/typing-game';
const source = 'games/immortality-cultivation/art-src/lab/vfx/metal-ult/stills/sword-trail.v1-try4.png';
const dest = `${root}/games/.wt-ic-lab-all/art-src/lab/vfx/metal-ult/sword-trail-d`;
const magick = '/opt/homebrew/bin/magick';
const rgb = execFileSync(magick, [`${root}/${source}`, '-alpha', 'off', '-depth', '8', 'rgb:-'], { maxBuffer: 8e6 });
const width = 128, height = 1024, left = 448;
const rgba = Buffer.alloc(width * height * 4);
const linear = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const srgb = v => v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055;
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = (y * 1024 + x + left) * 3, o = (y * width + x) * 4;
  const a = Math.max(rgb[i], rgb[i+1], rgb[i+2]);
  if (a <= 2) continue;
  rgba[o+3] = a;
  for (let c = 0; c < 3; c++) rgba[o+c] = Math.round(255 * srgb(linear(rgb[i+c] / 255) / (a / 255)));
}
execFileSync(magick, ['-size', `${width}x${height}`, '-depth', '8', 'rgba:-', '-set', 'colorspace', 'sRGB', `${dest}.png`], { input: rgba });
writeFileSync(`${dest}.json`, JSON.stringify({
  source, size: [width, height], crop: [left, 0, width, height],
  anchor: { pixels: [63, 850], uvTopLeft: [63 / width, 850 / height] },
  inkBounds: [11, 100, 108, 889], lengthPixels: 750,
  alpha: 'max(sRGB); RGB unpremultiplied in linear light; RGB<=2/255 removed',
  blending: 'THREE.AdditiveBlending; straight alpha; SRGBColorSpace',
  note: 'Giữ nguyên điểm ảnh và tỉ lệ D; chỉ bỏ lề ngang trống. Đầu sáng ở 83,01% chiều cao ảnh.'
}, null, 2) + '\n');
writeFileSync(`${dest}.prompt.txt`, `Phiếu 433h. Nguồn duy nhất: ${source}\nCắt nguyên khung x=448, y=0, rộng=128, cao=1024. Giữ nguyên hình, màu và chi tiết hạt sáng của mẫu D. Chuyển nền đen thành alpha thẳng; bù RGB trong ánh sáng tuyến tính để phép cộng sáng tái tạo nguồn. Điểm neo đầu sáng: (511,850) trên ảnh gốc, (63,850) trên ảnh cắt. Đây là xử lý ảnh có sẵn, không sinh ảnh AI.\n`);
console.log(dest);
