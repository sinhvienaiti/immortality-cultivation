/** 433t: cut the soft inner-glow half of owner pick C (dust-lightning.v1-try3) into an additive flipbook.
 * Image processing of our own Firefly clip only; no generation, no drawn shapes.
 * node src/lab/metal-ult-dust-glow-cut.mjs
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../../art-src/lab/vfx/metal-ult/', import.meta.url));
const src = 'art-src/lab/vfx/metal-ult/dust-lightning/dust-lightning.v1-try3.mp4';
const magick = '/opt/homebrew/bin/magick', name = 'dust-glow-c';
// Frames 8..58 every 2nd: the glow before branches; plus 3 later frames (76, 82, 88) with a faint branch, kept as the last cells.
const picks = [...Array.from({ length: 26 }, (_, i) => 8 + 2 * i), 76, 82, 88];
const C = 256, cols = 8, rows = 4, crop = 420, off = (1080 - crop) / 2;
const tmp = mkdtempSync(join(tmpdir(), 'dgc-'));
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', fileURLToPath(new URL('../../' + src, import.meta.url)),
  '-vf', `crop=${crop}:${crop}:${off}:${off},scale=${C}:${C}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 256 * 1024 * 1024 });
const fs = C * C * 3, atlas = Buffer.alloc(cols * C * rows * C * 4);
picks.forEach((f, i) => {
  const tx = (i % cols) * C, ty = Math.floor(i / cols) * C;
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
    const p = f * fs + (y * C + x) * 3, r = raw[p], g = raw[p + 1], b = raw[p + 2];
    // The charcoal cloud is near-neutral grey; the lightning glow is cyan. Keep only the blue excess.
    const glow = Math.max(0, Math.min(1, (b - r - 14) / 150));
    const edge = Math.min(1, Math.min(x, y, C - 1 - x, C - 1 - y) / 24);
    const a = Math.pow(glow, 0.9) * edge, q = ((ty + y) * cols * C + tx + x) * 4;
    const hi = Math.max(r, g, b, 1);
    atlas[q] = Math.round(r / hi * 255); atlas[q + 1] = Math.round(g / hi * 255); atlas[q + 2] = 255; atlas[q + 3] = Math.round(a * 255);
  }
});
execFileSync(magick, ['-size', `${cols * C}x${rows * C}`, '-depth', '8', 'rgba:-', '-define', 'png:color-type=6', join(out, name + '.atlas.png')], { input: atlas, maxBuffer: 64 * 1024 * 1024 });
rmSync(tmp, { recursive: true, force: true });
writeFileSync(join(out, name + '.json'), JSON.stringify({ cols, rows, frames: picks.length, fps: 12, glowFrames: 26, branchFrames: [26, 27, 28], sourceFrames: picks, source: src }) + '\n');
writeFileSync(join(out, name + '.prompt.txt'), `Phiếu 433t. Nguồn duy nhất: games/immortality-cultivation/${src} (owner chọn C, 18/11/2026; prompt gốc ở dust-lightning.v1-try3.prompt.txt).\nCắt giữa ${crop}x${crop}, thu ${C}px; ô 0-25 = khung 8..58 (bước 2, ánh sáng mềm trước khi tia nhánh hiện), ô 26-28 = khung 76, 82, 88 (một nhánh mờ). Nền mây xám trung tính bị loại bằng phần dư xanh (B-R), giữ màu gốc dạng alpha thẳng, mép ô mờ 24px. Cộng sáng (additive). Không sinh ảnh AI, không vẽ hình. Script: src/lab/metal-ult-dust-glow-cut.mjs.\n`);
console.log('ok', picks.length, 'frames');
