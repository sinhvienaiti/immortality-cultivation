/** Phiếu 402: cắt ảnh 396 và khử đen; không sinh hoặc vẽ lại hình.
 * ART_MAGICK=/opt/homebrew/bin/magick node src/lab/metal-ult-cut.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../art-src/', import.meta.url));
const source = join(root, 'concept/ult-metal');
const out = join(root, 'lab/vfx/metal-ult');
const magick = process.env.ART_MAGICK || '/opt/homebrew/bin/magick';
const name = 'ult-metal-components.v1-try2';
const file = join(source, name + '.png');
const prompt = readFileSync(join(source, name + '.prompt.txt'), 'utf8');
const cells = [
  ['cluster-0', 100, 100, 240, 295], ['cluster-1', 470, 100, 235, 295],
  ['cluster-2', 855, 100, 245, 295], ['cluster-3', 1200, 170, 270, 225],
  ['shards', 110, 620, 220, 225], ['rays', 465, 625, 240, 220],
  ['slash-ground', 840, 615, 240, 230], ['sword-ring', 1205, 610, 255, 250],
  ['blade', 206, 120, 20, 170], ['glint', 561, 654, 22, 30],
  ['gold-dust', 465, 625, 240, 220],
];
mkdirSync(out, { recursive: true });
const manifest = { ticket: 402, cols: 4, rows: 4, cell: 512,
  target: 'art-src/concept/ult-metal/ult-metal-moment-b.v1-try1.png',
  source: 'art-src/concept/ult-metal/' + name + '.png',
  sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), sprites: [] };
for (const [index, [part, x, y, w, h]] of cells.entries()) {
  const rgba = execFileSync(magick, [file, '-crop', `${w}x${h}+${x}+${y}`, '+repage', '-alpha', 'off', '-depth', '8', 'rgba:-'], { maxBuffer: 8 * 1024 * 1024 });
  for (let p = 0; p < rgba.length; p += 4) {
    const hi = Math.max(rgba[p], rgba[p + 1], rgba[p + 2]);
    const a = Math.pow(Math.max(0, (hi - 5) / 250), 0.8);
    // Feather only crops that isolate a small part, preserving the source silhouette.
    const edge = part === 'glint' || part === 'blade' ? Math.min(1, (p / 4 % w) / 3, (w - 1 - p / 4 % w) / 3, Math.floor(p / 4 / w) / 3, (h - 1 - Math.floor(p / 4 / w)) / 3) : 1;
    rgba[p + 3] = Math.round(a * Math.max(0, edge) * 255);
    for (let c = 0; c < 3; c++) rgba[p + c] = a > 0.008 ? Math.min(255, Math.round(rgba[p + c] / Math.max(a, hi / 255))) : 0;
  }
  execFileSync(magick, ['-size', `${w}x${h}`, '-depth', '8', 'rgba:-', '-trim', '+repage', '-resize', '480x480',
    '-background', 'none', '-gravity', part.startsWith('cluster') || part === 'blade' ? 'south' : 'center',
    '-extent', '512x512', '-define', 'png:color-type=6', join(out, part + '.png')], { input: rgba });
  writeFileSync(join(out, part + '.prompt.txt'), `Nguồn: ${manifest.source}\nCắt ${w}×${h} tại (${x}, ${y}); khử nền đen thành straight alpha, giữ tỉ lệ trong ô 512 px. Làm mềm mép 3 px cho glint/blade bị tách khỏi cụm gốc. Không gọi AI.\n\nPrompt nguồn nguyên văn:\n${prompt}`);
  manifest.sprites.push({ index, name: part, file: part + '.png', crop: [x, y, w, h] });
}
// A fixed 4×4 atlas needs explicit empty cells; montage otherwise chooses fewer rows.
const atlas = ['-size', '2048x2048', 'canvas:none'];
for (const [i, [part]] of cells.entries()) atlas.push(join(out, part + '.png'), '-geometry', `+${i % 4 * 512}+${Math.floor(i / 4) * 512}`, '-compose', 'Over', '-composite');
execFileSync(magick, [...atlas, '-define', 'png:color-type=6', join(out, 'metal-ult.atlas.png')]);
writeFileSync(join(out, 'metal-ult.atlas.prompt.txt'), 'Atlas xác định 4×4 từ 11 thành phần trong manifest.json; chỉ cắt ảnh 396. Prompt nguồn nguyên văn và phép cắt nằm cạnh từng PNG.\n');
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Đã cắt ${cells.length} thành phần và atlas 2048 px: ${out}`);
