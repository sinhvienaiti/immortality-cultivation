/** Ticket 395: deterministic crops of ticket 391, black to straight alpha; no generated artwork.
 * ART_MAGICK=/opt/homebrew/bin/magick node src/lab/wood-ult-cut.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const art = fileURLToPath(new URL('../../art-src/', import.meta.url));
const source = join(art, 'concept/ult-wood');
const out = join(art, 'lab/vfx/wood-ult');
const magick = process.env.ART_MAGICK || '/opt/homebrew/bin/magick';
const components = 'ult-wood-components.v1-try3.png';
const moment = 'ult-wood-moment-b.v1-try1.png';
const ground = 'ult-wood-root-ground.v1-try1.png';
const cells = [
  ['root-0', components, 0, 0, 512, 341],
  ['root-1', components, 512, 0, 512, 341],
  ['root-2', components, 1024, 0, 512, 341],
  ['root-3', components, 0, 341, 512, 342],
  ['leaf', components, 512, 341, 512, 342],
  ['spore', components, 1024, 341, 512, 342],
  ['wood-chip', components, 0, 683, 512, 341],
  ['foot-vine', components, 1024, 683, 512, 341],
  ['sprout-leaf', components, 512, 341, 512, 342],
  ['light-dust', components, 1024, 341, 512, 342],
];
const manifest = { ticket: 395, cols: 4, rows: 4, cell: 512, target: moment, sources: {}, sprites: [], ground: {} };
mkdirSync(out, { recursive: true });
for (const file of [components, moment, ground]) {
  manifest.sources[file] = createHash('sha256').update(readFileSync(join(source, file))).digest('hex');
}
function prompt(name, file, operation) {
  writeFileSync(join(out, name + '.prompt.txt'), `Nguồn riêng của repo: art-src/concept/ult-wood/${file}\n${operation}\nCông cụ: ImageMagick 7 và script src/lab/wood-ult-cut.mjs; không gọi AI, không vẽ thêm pixel.\n\nPrompt nguồn nguyên văn:\n${readFileSync(join(source, file.replace(/\.png$/, '.prompt.txt')), 'utf8')}`);
}
for (const [index, [name, file, x, y, w, h]] of cells.entries()) {
  const rgba = execFileSync(magick, [join(source, file), '-crop', `${w}x${h}+${x}+${y}`, '+repage', '-alpha', 'off', '-depth', '8', 'rgba:-'], { maxBuffer: 8 * 1024 * 1024 });
  for (let p = 0; p < rgba.length; p += 4) {
    const hi = Math.max(rgba[p], rgba[p + 1], rgba[p + 2]);
    const a = Math.pow(Math.max(0, (hi - 5) / 250), 0.72);
    rgba[p + 3] = Math.round(a * 255);
    for (let c = 0; c < 3; c++) rgba[p + c] = a > 0.008 ? Math.min(255, Math.round(rgba[p + c] / a)) : 0;
  }
  execFileSync(magick, ['-size', `${w}x${h}`, '-depth', '8', 'rgba:-', '-trim', '+repage', '-resize', '464x464', '-background', 'none', '-gravity', name.startsWith('root-') ? 'south' : 'center', '-extent', '512x512', '-define', 'png:color-type=6', join(out, name + '.png')], { input: rgba });
  prompt(name, file, `Cắt ${w}×${h} tại (${x}, ${y}); alpha = max(0,(maxRGB−5)/250)^0,72, chia RGB cho alpha để khử nền đen; trim theo alpha, giữ tỉ lệ trong 464×464 rồi đặt vào ô 512×512.`);
  manifest.sprites.push({ name, index, file: name + '.png', source: file, crop: [x, y, w, h] });
}
execFileSync(magick, ['montage', ...cells.map(([name]) => join(out, name + '.png')), '-tile', '4x4', '-geometry', '512x512+0+0', '-background', 'none', '-define', 'png:color-type=6', join(out, 'wood-ult.atlas.png')]);
prompt('wood-ult.atlas', components, 'Ghép 10 sprite theo thứ tự manifest.json vào atlas 4×4, ô 512 px; 6 ô cuối rỗng. Mầm tâm ghép ba lá và một cụm rễ bằng runtime; moment-b chỉ định bố cục, không cắt nền cảnh vào sprite. Từng sprite có prompt nguồn và phép cắt cạnh PNG.');
// Material crop chosen/measured in 391: retain its real paving and roots, never procedural roots.
execFileSync(magick, [join(source, ground), '-crop', '800x800+368+112', '+repage', '-resize', '1024x1024', '-alpha', 'on', '-define', 'png:color-type=6', join(out, 'root-ground.png')]);
prompt('root-ground', ground, 'Cắt ô vật liệu 800×800 tại (368,112), bỏ khung trình bày, đổi cỡ 1024×1024; alpha đầy. Runtime mở theo sóng, lặp đối xứng và tan, không vẽ rễ mới.');
manifest.ground = { file: 'root-ground.png', source: ground, crop: [368, 112, 800, 800], wrap: 'mirrored-repeat' };
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ sprites: cells.length, atlas: '2048x2048', out }));
