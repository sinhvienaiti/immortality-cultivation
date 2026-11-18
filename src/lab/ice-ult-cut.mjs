/** Phiếu 389: chỉ cắt ảnh 386, khử nền đen và đóng atlas; không sinh hình mới.
 * Chạy từ repo gốc: ART_MAGICK=/opt/homebrew/bin/magick node games/.wt-ic-lab-all/src/lab/ice-ult-cut.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../art-src/', import.meta.url));
const source = join(root, 'concept/ult-ice');
const out = join(root, 'lab/vfx/ice-ult');
const magick = process.env.ART_MAGICK || '/opt/homebrew/bin/magick';
mkdirSync(out, { recursive: true });
const images = {
  clusters: 'ult-ice-crystal-clusters.v1-try1.png',
  shards: 'ult-ice-shards-sparkle.v1-try1.png',
  shell: 'ult-ice-round-shell.v1-try1.png',
  ground: 'ult-ice-cracked-surface.v1-try1.png',
};
const cells = [
  ['cluster-0', 'clusters', 0, 0, 660, 510],
  ['cluster-1', 'clusters', 660, 0, 876, 490],
  ['cluster-2', 'clusters', 0, 510, 680, 514],
  ['cluster-3', 'clusters', 680, 490, 856, 534],
  ['shard-0', 'shards', 0, 0, 512, 580],
  ['shard-1', 'shards', 512, 0, 512, 580],
  ['shard-2', 'shards', 1024, 0, 512, 580],
  ['dust', 'shards', 0, 580, 512, 444],
  ['sparkles', 'shards', 512, 580, 512, 444],
  ['glint', 'shards', 1024, 580, 512, 444],
  ['shell-0', 'shell', 0, 0, 768, 1024],
  ['shell-1', 'shell', 768, 0, 768, 1024],
];
const manifest = { version: 3, cols: 4, rows: 4, cell: 512, target: 'ult-ice-moment-a.v1-try1.png', sources: {}, sprites: [] };
for (const file of Object.values(images)) {
  manifest.sources[file] = createHash('sha256').update(readFileSync(join(source, file))).digest('hex');
}
for (const [index, [name, key, x, y, w, h]] of cells.entries()) {
  const rgba = execFileSync(magick, [join(source, images[key]), '-crop', `${w}x${h}+${x}+${y}`, '+repage', '-alpha', 'off', '-depth', '8', 'rgba:-'], { maxBuffer: 16 * 1024 * 1024 });
  // Straight alpha: unmatte against black so soft borders never leave a black rectangle.
  for (let p = 0; p < rgba.length; p += 4) {
    const hi = Math.max(rgba[p], rgba[p + 1], rgba[p + 2]);
    let a = Math.pow(Math.max(0, (hi - 5) / 250), 0.72);
    // Remove the neutral grey backing inside the shell, retaining its painted coloured rim and bright cracks.
    if (key === 'shell') a *= Math.max(0.08, Math.min(1, (hi - 170) / 70));
    rgba[p + 3] = Math.round(a * 255);
    for (let c = 0; c < 3; c++) rgba[p + c] = a > 0.008 ? Math.min(255, Math.round(rgba[p + c] / Math.max(a, hi / 255))) : 0;
  }
  const file = `${name}.png`;
  // Trim using alpha without thresholding the actual output; keep every soft source pixel.
  execFileSync(magick, ['-size', `${w}x${h}`, '-depth', '8', 'rgba:-', '-trim', '+repage', '-resize', '480x480', '-background', 'none', '-gravity', name.startsWith('cluster') ? 'south' : 'center', '-extent', '512x512', '-define', 'png:color-type=6', join(out, file)], { input: rgba });
  const originalPrompt = join(source, images[key].replace(/\.png$/, '.prompt.txt'));
  writeFileSync(join(out, `${name}.prompt.txt`), `Nguồn: art-src/concept/ult-ice/${images[key]}\nXử lý xác định, không gọi AI: cắt ${w}×${h} tại (${x}, ${y}); khử nền đen thành straight alpha; giữ tỉ lệ, ô 512×512.\n\nPrompt nguồn nguyên văn:\n${readFileSync(originalPrompt, 'utf8')}`);
  manifest.sprites.push({ name, index, file, source: images[key], crop: [x, y, w, h] });
}
execFileSync(magick, ['montage', ...cells.map(([name]) => join(out, `${name}.png`)), '-tile', '4x4', '-geometry', '512x512+0+0', '-background', 'none', '-define', 'png:color-type=6', join(out, 'ice-ult-v3.atlas.png')]);
// The source tile's black surround is presentation only, never part of the decal.
execFileSync(magick, [join(source, images.ground), '-crop', '866x866+335+66', '+repage', '-resize', '1024x1024', '-alpha', 'on', join(out, 'cracked-surface.png')]);
writeFileSync(join(out, 'cracked-surface.prompt.txt'), `Nguồn: art-src/concept/ult-ice/${images.ground}\nCắt ô vật liệu 866×866 tại (335, 66), bỏ nền trình bày, đổi cỡ 1024×1024.\n\nPrompt nguồn nguyên văn:\n${readFileSync(join(source, images.ground.replace(/\.png$/, '.prompt.txt')), 'utf8')}`);
writeFileSync(join(out, 'ice-ult-v3.atlas.prompt.txt'), 'Atlas xác định từ 12 sprite trong manifest.json; giữ nguyên hình từ ảnh 386. Prompt nguồn và phép cắt nằm cạnh từng PNG.\n');
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Đã xuất ${cells.length} sprite, atlas 2048×2048 và mặt băng 1024×1024 vào ${out}`);
