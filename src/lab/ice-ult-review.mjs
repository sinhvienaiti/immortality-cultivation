/** Kịch bản chụp/đo phiếu 389 cho runner CDP sẵn có, chỉ chạy khi host và thư mục review được mở quyền.
 * Từ games/.wt-ic-lab-all:
 * BASE=http://127.0.0.1:3019/stress.html node src/kit/tools/cdp-run.mjs src/lab/ice-ult-review.mjs --width=1920 --height=1080
 * Không khởi động server, không build game. Bản này đo frame CPU/tổng có readback, không thay cho phép đo rAF thật.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const out = '/Volumes/SS990TPRO/htdocs/typing-game-review/owner-review/2026-11-16/tu-tien/ult-ice-v3';
const target = resolve(root, 'games/immortality-cultivation/art-src/concept/ult-ice/ult-ice-moment-a.v1-try1.png');
const magick = process.env.ART_MAGICK || '/opt/homebrew/bin/magick';
const p95 = a => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.ceil(a.length * 0.95) - 1)] ?? null;

export default async function (page) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'ABOUT.md'), 'purpose: Đối chiếu ult băng v3 với ảnh 386, góc trên và sau lưng; đo stress 100 hình quái\nmade-by: Codex, phiếu 389\ndoc: /Volumes/SS990TPRO/htdocs/typing-game/docs/codex-queue/389-report.md\ndelete-when: Sau khi owner duyệt và không còn cần đối chiếu\n');
  const url = new URL(process.env.BASE || 'http://127.0.0.1:3019/stress.html');
  for (const [k, v] of Object.entries({ fixed: '1', ui: '0', dpr: '1', herd: 'march' })) url.searchParams.set(k, v);
  url.searchParams.delete('iceVersion'); url.searchParams.delete('auto'); url.searchParams.delete('ultIce');
  await page.goto(url.href, { settle: 1500 });
  const evaluate = async expression => {
    const value = await page.eval(expression);
    if (value?.evalError) throw new Error(value.evalError);
    return value;
  };
  let ready = false;
  for (let i = 0; i < 180; i++) {
    if (await evaluate('!!(window.__lab?.ready && window.__stress?.ready)')) { ready = true; break; }
    await page.sleep(250);
  }
  if (!ready) throw new Error('Lab/stress chưa sẵn sàng');
  await evaluate('window.__lab.showcase("ult-ice-cold-silence"); true');
  ready = false;
  for (let i = 0; i < 180; i++) {
    if (await evaluate('window.__lab.iceUlt().last?.assetsReady === true')) { ready = true; break; }
    await page.sleep(250);
  }
  if (!ready) throw new Error('Bộ ảnh băng chưa tải xong');
  const result = { url: url.href, workload: '87 quái TargetField + 13 walker trang trí; 100 hình quái, 87 nhận hiệu ứng', views: {} };
  for (const view of ['top', 'behind']) {
    await evaluate(`window.__lab.reset(); window.__lab.setHerd('march'); window.__lab.viewMode(${JSON.stringify(view)}); window.__lab.step(45); window.__lab.showcase('ult-ice-cold-silence'); window.__lab.step(150); true`);
    const shot = join(out, `${view}-v3.png`);
    await page.shot(shot);
    // A real lab frame, beside the untouched target; never a synthetic substitute for a screenshot.
    execFileSync(magick, ['montage', target, shot, '-tile', '2x1', '-geometry', '960x640+8+8', '-background', '#111822', join(out, `compare-${view}.png`)]);
    const total = [], cpu = [];
    for (let run = 0; run < 3; run++) {
      await evaluate("window.__lab.reset(); window.__lab.setHerd('march'); window.__lab.showcase('ult-ice-cold-silence'); true");
      const perf = await evaluate('window.__lab.perf(420)');
      if (!Array.isArray(perf?.total) || !Array.isArray(perf?.cpu) || perf.total.length === 0) throw new Error('Thiếu số đo perf');
      total.push(...perf.total); cpu.push(...perf.cpu);
    }
    result.views[view] = { totalP95Ms: p95(total), cpuP95Ms: p95(cpu), passes16_7: p95(total) <= 16.7, frames: total.length, last: await evaluate('window.__lab.iceUlt().last'), stress: await evaluate('window.__stress.report()') };
  }
  writeFileSync(join(out, 'measure.json'), JSON.stringify(result, null, 2) + '\n');
  execFileSync(process.execPath, [join(root, 'scripts/review-index.mjs')], { cwd: root });
  return result;
}
