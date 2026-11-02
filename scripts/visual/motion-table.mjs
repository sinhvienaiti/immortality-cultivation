// Before/after table of the motion probe (MOTION_PLAN step 4): reads the lab-motion.mjs runs of one demo
// folder and writes <dir>/metrics-table.md (Vietnamese, the plan's thresholds) and <dir>/compare.json.
//   node scripts/visual/motion-table.mjs tmp/shots/motion/final
// Expected runs under <dir>: before-step1, before-lam, before-step1-120hz, before-lam-120hz (frozen step 1 lab
// + facing fix), after-step1, after-step1-120hz, after-lam-120hz (metrics only), and the captured demo at Lam's
// speeds: <dir>/metrics.json (1920×1080) and <dir>/720/metrics.json (1280×720).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? "tmp/shots/motion/final");
const load = (p) => {
  const f = join(dir, p);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
};
const demo1080 = load("metrics.json");
const demo720 = load("720/metrics.json");
const demo = demo1080 ?? demo720;
const runs = {
  b1: load("before-step1/metrics.json"),
  a1: load("after-step1/metrics.json"),
  bl: load("before-lam/metrics.json"),
  al: demo,
  b1h: load("before-step1-120hz/metrics.json"),
  a1h: load("after-step1-120hz/metrics.json"),
  blh: load("before-lam-120hz/metrics.json"),
  alh: load("after-lam-120hz/metrics.json"),
};
for (const [k, v] of Object.entries(runs)) if (!v) throw new Error("missing run " + k);

const num = (v, d = 2) => {
  if (v == null || Number.isNaN(v)) return "–";
  const s = Number(v).toFixed(d);
  return (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s).replace(".", ",");
};
const S = (m) => m.summary;
const loops = (m) => {
  const s = S(m).loopSeamsCm;
  return Object.entries(s)
    .map(([k, v]) => `${k} ${num(v)}`)
    .join(" · ");
};
const loopMax = (m) => Math.max(0, ...Object.entries(S(m).loopSeamsCm).filter(([k]) => k !== "dash").map(([, v]) => v));
const dashS = (m) => {
  const clips = m.events.filter((e) => e.kind === "clip");
  const i = clips.findIndex((e) => e.detail === "dash");
  return i >= 0 && clips[i + 1] ? (clips[i + 1].f - clips[i].f) / m.run.hz : NaN;
};
const strike = (m) => m.releases.filter((r) => r.strikePct >= 0).map((r) => `${r.slot} ${num(r.strikePct, 1)}`).join(" · ");
const fair = (m) => S(m).vfx.fair ?? { layerPopsOn: NaN, layerPopsOff: NaN, flashOn: NaN };
const blades = (m) => {
  const b = S(m).vfx.blades;
  return `${b.on}/${b.off}/${b.size}/${b.snap}/${b.jump}`;
};
const bladeSum = (m) => {
  const b = S(m).vfx.blades;
  return b.on + b.off + b.size + b.snap + b.jump;
};

/** [label, gate text, value(m) → string, pass(m) → boolean | null] */
const ROWS = [
  ["Chuyển clip vượt 1,5 × đỉnh clip", "0", (m) => `${S(m).transitions.over}/${S(m).transitions.count}`, (m) => S(m).transitions.over === 0],
  ["Tỉ số chuyển clip lớn nhất", "≤ 1,5", (m) => num(S(m).transitions.maxRatio), (m) => S(m).transitions.maxRatio <= 1.5],
  ["Khung gần tư thế bind", "0", (m) => `${S(m).bind.nearBindFrames} (RMS nhỏ nhất ${num(S(m).bind.minRmsDeg, 1)}°)`, (m) => S(m).bind.nearBindFrames === 0],
  ["Trượt chân trụ p95 (m/s)", "≤ 0,05", (m) => num(S(m).feet.stanceP95Mps, 3), (m) => S(m).feet.stanceP95Mps <= 0.05],
  ["Khung chân trụ trượt > 0,05 m/s", "0", (m) => String(S(m).feet.stanceOverGate), (m) => S(m).feet.stanceOverGate === 0],
  ["Trượt chân, cả hai chân, p95 (m/s)", "≤ 0,05", (m) => num(S(m).feet.p95SlideMps, 3), (m) => S(m).feet.p95SlideMps <= 0.05],
  ["Xuyên đất lớn nhất (% chiều cao)", "≤ 2", (m) => num(S(m).feet.maxPenetrationPct), (m) => S(m).feet.maxPenetrationPct <= 2],
  ["Mối nối vòng lặp lớn nhất, trừ dash (cm)", "≤ 1", (m) => num(loopMax(m)), (m) => loopMax(m) <= 1],
  ["Sự kiện lệch: phím cuối → VFX (ms)", "≤ 16,7 (1 khung)", (m) => num(S(m).releases.keyToVfxMsMax, 0), (m) => S(m).releases.keyToVfxMsMax <= 16.7],
  ["Phím cuối → thân nhả, lớn nhất (ms)", "≤ 50", (m) => `${num(S(m).releases.keyToBodyMsMax, 0)} (${S(m).releases.overGate} chiêu vượt)`, (m) => S(m).releases.keyToBodyMsMax <= 50],
  ["Dáng gồng khác dáng nhả < 15 %, đo ở khung nhả", "0 chiêu", (m) => `${S(m).releases.silhouetteUnderGate}/6`, (m) => S(m).releases.silhouetteUnderGate === 0],
  ["Dáng gồng khác đỉnh đòn < 15 % (strikePct)", "0 chiêu", (m) => `${S(m).releases.strikeUnderGate}/6`, (m) => S(m).releases.strikeUnderGate === 0],
  ["Xoay gốc lớn nhất (°/s)", "khung > 1 800 °/s: 0", (m) => `${num(S(m).root.maxTurnDegS, 0)} (${S(m).root.snapFrames} khung giật)`, (m) => S(m).root.snapFrames === 0],
  ["Khung gốc dịch chuyển tức thời (> 15 m/s)", "0", (m) => `${S(m).root.teleportFrames} (tốc lớn nhất ${num(S(m).root.maxSpeedMps, 1)} m/s)`, (m) => S(m).root.teleportFrames === 0],
  ["VFX: lớp bật > 30 %/khung, ngoài lóe", "0", (m) => String(fair(m).layerPopsOn), (m) => fair(m).layerPopsOn === 0],
  ["VFX: lớp tắt phụt > 30 %/khung", "0", (m) => String(fair(m).layerPopsOff), (m) => fair(m).layerPopsOff === 0],
  ["Kiếm: hiện / tắt / đổi cỡ / giật hướng / nhảy", "0/0/0/0/0", blades, (m) => bladeSum(m) === 0],
  ["Lóe đã khai báo (được phép)", "–", (m) => String(fair(m).flashOn), () => null],
];

const mark = (p) => (p === null ? "–" : p ? "đạt" : "**chưa**");
const lines = [];
const meta = (m) => `${m.run.frames} khung, ${m.run.hz} Hz, đi ${num(m.run.speeds.walk)} / chạy ${num(m.run.speeds.run)} / ngang ${num(m.run.speeds.strafe)} m/s`;
lines.push("# Bảng số đo trước và sau: demo di chuyển (MOTION_PLAN bước 4)");
lines.push("");
lines.push("Ngưỡng theo MOTION_PLAN bước 1 (CHARACTER_ANIMATION §5.11, VFX_STANDARD §3.1 luật 5). Cùng chuỗi `lab-motion.mjs`, 45 WPM, đồng hồ cố định.");
lines.push("");
lines.push("- **Trước** = lab bước 1 cộng một dòng sửa hướng mặt (bản đóng băng `tmp/motion-s2/baseline-facing-m`, cùng bộ đo hiện tại). Số chuyển động giống hệt mốc `baseline` gốc.");
lines.push("- **Sau** = mã hiện tại (bước 2, bước 3 và hai lượt rà soát).");
lines.push(`- Tốc bước 1: ${meta(runs.a1)}. Tốc hợp chân Lam (demo): ${meta(runs.al)}.`);
if (demo720 && demo1080) {
  const same = JSON.stringify(demo720.summary) === JSON.stringify(demo1080.summary) && JSON.stringify(demo720.phases) === JSON.stringify(demo1080.phases);
  lines.push(`- Lượt 1280×720 và lượt 1920×1080 ${same ? "cho số đo giống hệt nhau" : "cho số đo **khác nhau**"} (đồng hồ cố định).`);
}
lines.push("");
lines.push("## 60 Hz");
lines.push("");
lines.push("| Chỉ số | Ngưỡng | Trước · tốc bước 1 | Sau · tốc bước 1 | Trước · tốc Lam | Sau · tốc Lam (demo) | Demo |");
lines.push("|---|---|---|---|---|---|---|");
const out = { rows: [], phases: [], hz120: [] };
for (const [label, gate, val, pass] of ROWS) {
  const v = [runs.b1, runs.a1, runs.bl, runs.al].map(val);
  const p = pass(runs.al);
  lines.push(`| ${label} | ${gate} | ${v.join(" | ")} | ${mark(p)} |`);
  out.rows.push({ label, gate, before1: v[0], after1: v[1], beforeLam: v[2], afterLam: v[3], pass: p });
}
lines.push("");
lines.push("Chuyển clip còn vượt 1,5 × trong demo: " + (runs.al.transitions.filter((t) => !t.pass).map((t) => `#${t.f} ${t.from || "–"} → ${t.detail} (${t.kind}): ${num(t.ratio)}, ${t.bone} ${num(t.maxBoneDegS, 0)} °/s so với đỉnh ${num(t.refPeakDegS, 0)} °/s`).join("; ") || "không có") + ".");
lines.push("");
lines.push(`Mối nối vòng lặp (cm), sau: ${loops(runs.al)}. Clip dash dài 0,708 s; trong demo nó chạy ${num(dashS(runs.al))} s nên không qua mối nối.`);
lines.push("");
lines.push(`Dáng gồng khác đỉnh đòn (strikePct, %), sau: ${strike(runs.al)}. Trước: ${strike(runs.bl)}.`);
lines.push("");
lines.push("Phím cuối → thân nhả theo chiêu (ms), trước → sau: " + runs.bl.releases.map((r, i) => `${r.slot} ${r.keyToBodyMs < 0 ? "–" : num(r.keyToBodyMs, 0)} → ${runs.al.releases[i]?.keyToBodyMs < 0 ? "–" : num(runs.al.releases[i]?.keyToBodyMs, 0)}`).join(" · ") + ".");
lines.push("");
lines.push("## Trượt chân trụ p95 theo pha (m/s, ngưỡng 0,05)");
lines.push("");
lines.push("| Pha | Trước · tốc bước 1 | Sau · tốc bước 1 | Trước · tốc Lam | Sau · tốc Lam (demo) | Tỉ số khung lớn nhất trong pha so với đỉnh clip, demo |");
lines.push("|---|---|---|---|---|---|");
const ph = (m, name) => m.phases.find((p) => p.phase === name);
for (const p of runs.al.phases) {
  const v = [runs.b1, runs.a1, runs.bl, runs.al].map((m) => num(ph(m, p.phase)?.stanceP95, 3));
  lines.push(`| ${p.phase} | ${v.join(" | ")} | ${num(p.maxRatio)} |`);
  out.phases.push({ phase: p.phase, stanceP95: v, maxRatio: p.maxRatio });
}
lines.push("");
lines.push("Tỉ số trong pha đo mọi khung so với đỉnh clip (sàn 90 °/s mỗi xương), không chỉ cửa sổ chuyển clip, nên lớn hơn tỉ số chuyển clip; dùng để tìm chỗ, không phải ngưỡng.");
lines.push("");
lines.push("## 120 Hz (bước 1/120 s, chỉ số đo)");
lines.push("");
lines.push("| Chỉ số | Ngưỡng | Trước · tốc bước 1 | Sau · tốc bước 1 | Trước · tốc Lam | Sau · tốc Lam |");
lines.push("|---|---|---|---|---|---|");
const H = [
  ROWS[0],
  ROWS[1],
  ROWS[2],
  ROWS[3],
  ROWS[6],
  ROWS[9],
  ROWS[12],
  ROWS[13],
  ROWS[14],
  ROWS[15],
  ROWS[16],
];
for (const [label, gate, val] of H) {
  const v = [runs.b1h, runs.a1h, runs.blh, runs.alh].map(val);
  lines.push(`| ${label} | ${gate} | ${v.join(" | ")} |`);
  out.hz120.push({ label, gate, before1: v[0], after1: v[1], beforeLam: v[2], afterLam: v[3] });
}
lines.push("");
writeFileSync(join(dir, "metrics-table.md"), lines.join("\n"));
writeFileSync(join(dir, "compare.json"), JSON.stringify(out, null, 1));
console.log(lines.join("\n"));
