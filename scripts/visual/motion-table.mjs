// Before/after table of the motion probe (MOTION_PLAN step 4): reads the lab-motion.mjs runs of one demo
// folder and writes <dir>/metrics-table.md (Vietnamese, the plan's thresholds) and <dir>/compare.json.
//   node scripts/visual/motion-table.mjs tmp/shots/motion/final
// Expected runs under <dir>: before-step1, before-lam, before-step1-120hz, before-lam-120hz (frozen step 1 lab
// + facing fix), after-step1, after-step1-120hz, after-lam-120hz (metrics only), and the captured demo at Lam's
// speeds: <dir>/metrics.json (1920×1080) and <dir>/720/metrics.json (1280×720).
// Round 2 and later: --round1=<dir of the round-1 demo> adds the round-1 runs as a middle column (frozen
// baseline → round 1 → this round); the before-* runs are read from <dir> when present, else from the round-1
// folder. --round1-arms=<metrics.json> gives the arm check for the round-1 Lam 60 Hz column when the round-1
// demo predates it (a rerun of the round-1 code with the check). Optional extras of this mode: <dir>/stress and
// <round1>/stress (lab-stress.mjs), and white-out per frame in wo-play.tsv / wo-follow.tsv (<dir> and <dir>/720).
//   node scripts/visual/motion-table.mjs tmp/shots/motion/final2 --round1=tmp/shots/motion/final
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (name) => {
  const a = args.find((s) => s.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};
const dir = resolve(args.find((s) => !s.startsWith("--")) ?? "tmp/shots/motion/final");
const r1dir = opt("round1") ? resolve(opt("round1")) : null;
const readJson = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
const load = (p) => readJson(join(dir, p));
const loadR1 = (p) => (r1dir ? readJson(join(r1dir, p)) : null);
const loadBase = (p) => load(p) ?? loadR1(p);
const demo1080 = load("metrics.json");
const demo720 = load("720/metrics.json");
const demo = demo1080 ?? demo720;
const runs = {
  b1: loadBase("before-step1/metrics.json"),
  a1: load("after-step1/metrics.json"),
  bl: loadBase("before-lam/metrics.json"),
  al: demo,
  b1h: loadBase("before-step1-120hz/metrics.json"),
  a1h: load("after-step1-120hz/metrics.json"),
  blh: loadBase("before-lam-120hz/metrics.json"),
  alh: load("after-lam-120hz/metrics.json"),
};
if (r1dir) {
  Object.assign(runs, {
    r1: loadR1("after-step1/metrics.json"),
    rl: loadR1("metrics.json") ?? loadR1("720/metrics.json"),
    r1h: loadR1("after-step1-120hz/metrics.json"),
    rlh: loadR1("after-lam-120hz/metrics.json"),
  });
}
for (const [k, v] of Object.entries(runs)) if (!v) throw new Error("missing run " + k);
// Arm check of the round-1 demo, measured later on the same code (it predates the check).
const r1Arms = r1dir && !runs.rl.arms && opt("round1-arms") ? readJson(resolve(opt("round1-arms")))?.arms ?? null : null;

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
const armsOf = (m) => m.arms ?? (m === runs.rl ? r1Arms : null);

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
// The arm check (round 2, arm-check.ts): flagged frames / failed runs / failed frames.
const ARMS = [
  "Tay dang > 70°: khung có cờ / chuỗi hỏng / khung hỏng",
  "chuỗi hỏng 0",
  (m) => {
    const a = armsOf(m);
    return a ? `${a.flaggedFrames}/${a.failRuns}/${a.failFrames}${m.arms ? "" : " *"}` : "–";
  },
  (m) => {
    const a = armsOf(m);
    return a ? a.failRuns === 0 : null;
  },
];

const mark = (p) => (p === null ? "–" : p ? "đạt" : "**chưa**");
const lines = [];
const meta = (m) => `${m.run.frames} khung, ${m.run.hz} Hz, đi ${num(m.run.speeds.walk)} / chạy ${num(m.run.speeds.run)} / ngang ${num(m.run.speeds.strafe)} m/s`;
const same720 = () => {
  if (!(demo720 && demo1080)) return;
  const same = JSON.stringify(demo720.summary) === JSON.stringify(demo1080.summary) && JSON.stringify(demo720.phases) === JSON.stringify(demo1080.phases);
  lines.push(`- Lượt 1280×720 và lượt 1920×1080 ${same ? "cho số đo giống hệt nhau" : "cho số đo **khác nhau**"} (đồng hồ cố định).`);
};
const ph = (m, name) => m.phases.find((p) => p.phase === name);
const H = [ROWS[0], ROWS[1], ROWS[2], ROWS[3], ROWS[6], ROWS[9], ROWS[12], ROWS[13], ROWS[14], ROWS[15], ROWS[16]];
const out = { rows: [], phases: [], hz120: [] };

if (!r1dir) {
  lines.push("# Bảng số đo trước và sau: demo di chuyển (MOTION_PLAN bước 4)");
  lines.push("");
  lines.push("Ngưỡng theo MOTION_PLAN bước 1 (CHARACTER_ANIMATION §5.11, VFX_STANDARD §3.1 luật 5). Cùng chuỗi `lab-motion.mjs`, 45 WPM, đồng hồ cố định.");
  lines.push("");
  lines.push("- **Trước** = lab bước 1 cộng một dòng sửa hướng mặt (bản đóng băng `tmp/motion-s2/baseline-facing-m`, cùng bộ đo hiện tại). Số chuyển động giống hệt mốc `baseline` gốc.");
  lines.push("- **Sau** = mã hiện tại (bước 2, bước 3 và hai lượt rà soát).");
  lines.push(`- Tốc bước 1: ${meta(runs.a1)}. Tốc hợp chân Lam (demo): ${meta(runs.al)}.`);
  same720();
  lines.push("");
  lines.push("## 60 Hz");
  lines.push("");
  lines.push("| Chỉ số | Ngưỡng | Trước · tốc bước 1 | Sau · tốc bước 1 | Trước · tốc Lam | Sau · tốc Lam (demo) | Demo |");
  lines.push("|---|---|---|---|---|---|---|");
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
  for (const [label, gate, val] of H) {
    const v = [runs.b1h, runs.a1h, runs.blh, runs.alh].map(val);
    lines.push(`| ${label} | ${gate} | ${v.join(" | ")} |`);
    out.hz120.push({ label, gate, before1: v[0], after1: v[1], beforeLam: v[2], afterLam: v[3] });
  }
  lines.push("");
} else {
  // Frozen baseline → round 1 → this round, at step 1's speeds and at Lam's (the demo).
  const C60 = [
    ["base1", "Mốc · tốc bước 1", runs.b1],
    ["r1s1", "Vòng 1 · tốc bước 1", runs.r1],
    ["r2s1", "Vòng 2 · tốc bước 1", runs.a1],
    ["baseLam", "Mốc · tốc Lam", runs.bl],
    ["r1Lam", "Vòng 1 · tốc Lam (demo)", runs.rl],
    ["r2Lam", "Vòng 2 · tốc Lam (demo)", runs.al],
  ];
  const C120 = [
    ["base1", "Mốc · tốc bước 1", runs.b1h],
    ["r1s1", "Vòng 1 · tốc bước 1", runs.r1h],
    ["r2s1", "Vòng 2 · tốc bước 1", runs.a1h],
    ["baseLam", "Mốc · tốc Lam", runs.blh],
    ["r1Lam", "Vòng 1 · tốc Lam", runs.rlh],
    ["r2Lam", "Vòng 2 · tốc Lam", runs.alh],
  ];
  const head = (cols, extra) => {
    lines.push(`| Chỉ số | Ngưỡng | ${cols.map((c) => c[1]).join(" | ")}${extra ? ` | ${extra}` : ""} |`);
    lines.push(`|---|---|${cols.map(() => "---|").join("")}${extra ? "---|" : ""}`);
  };
  const rel = (p) => relative(resolve("."), p) || ".";
  const releaseMs = (m, slot, k) => {
    const r = m.releases.filter((x) => x.slot === slot)[k];
    return r == null ? "–" : r.keyToBodyMs < 0 ? "–" : num(r.keyToBodyMs, 0);
  };
  lines.push("# Bảng số đo: demo di chuyển vòng 2 so với mốc và vòng 1 (MOTION_PLAN bước 4)");
  lines.push("");
  lines.push("Ngưỡng theo MOTION_PLAN bước 1 (CHARACTER_ANIMATION §5.11, VFX_STANDARD §3.1 luật 5). Cùng chuỗi `lab-motion.mjs`, 45 WPM, đồng hồ cố định.");
  lines.push("");
  lines.push(`- **Mốc** = lab bước 1 cộng một dòng sửa hướng mặt (bản đóng băng \`tmp/motion-s2/baseline-facing-m\`); số của lần chạy vòng 1 (\`${rel(r1dir)}/before-*\`).`);
  lines.push(`- **Vòng 1** = demo cuối vòng 1 (\`${rel(r1dir)}\`).`);
  lines.push("- **Vòng 2** = mã hiện tại: làn diễn xuất, làn va chạm và hai lượt rà soát (thư mục này).");
  lines.push(`- Tốc bước 1: ${meta(runs.a1)}. Tốc hợp chân Lam (demo vòng 2): ${meta(runs.al)}; demo vòng 1: ${meta(runs.rl)}.`);
  same720();
  lines.push("");
  lines.push("## 60 Hz");
  lines.push("");
  head(C60, "Demo vòng 2");
  for (const [label, gate, val, pass] of [...ROWS, ARMS]) {
    const v = C60.map((c) => val(c[2]));
    const p = pass(runs.al);
    lines.push(`| ${label} | ${gate} | ${v.join(" | ")} | ${mark(p)} |`);
    out.rows.push({ label, gate, ...Object.fromEntries(C60.map((c, i) => [c[0], v[i]])), pass: p });
  }
  lines.push("");
  if (r1Arms) lines.push(`\\* Vòng 1 chưa có bộ kiểm tra tay dang; số đo trên chính mã vòng 1 chạy lại có bộ kiểm tra (\`${rel(resolve(opt("round1-arms")))}\`).`);
  if (r1Arms) lines.push("");
  const over = (m) => m.transitions.filter((t) => !t.pass).map((t) => `#${t.f} ${t.from || "–"} → ${t.detail} (${t.kind}): ${num(t.ratio)}, ${t.bone} ${num(t.maxBoneDegS, 0)} °/s so với đỉnh ${num(t.refPeakDegS, 0)} °/s`).join("; ") || "không có";
  lines.push(`Chuyển clip còn vượt 1,5 × trong demo vòng 2: ${over(runs.al)}.`);
  lines.push("");
  lines.push(`Vòng 1: ${over(runs.rl)}.`);
  lines.push("");
  lines.push(`Mối nối vòng lặp (cm), vòng 2: ${loops(runs.al)}. Clip dash dài 0,708 s; trong demo nó chạy ${num(dashS(runs.al))} s nên không qua mối nối.`);
  lines.push("");
  lines.push(`Dáng gồng khác đỉnh đòn (strikePct, %). Vòng 2: ${strike(runs.al)}. Vòng 1: ${strike(runs.rl)}. Mốc: ${strike(runs.bl)}.`);
  lines.push("");
  const seen = new Map();
  lines.push(
    "Phím cuối → thân nhả theo chiêu (ms), mốc → vòng 1 → vòng 2: " +
      runs.al.releases
        .map((r) => {
          const k = seen.get(r.slot) ?? 0;
          seen.set(r.slot, k + 1);
          return `${r.slot} ${releaseMs(runs.bl, r.slot, k)} → ${releaseMs(runs.rl, r.slot, k)} → ${releaseMs(runs.al, r.slot, k)}`;
        })
        .join(" · ") +
      ".",
  );
  lines.push("");
  lines.push("## Trượt chân trụ p95 theo pha (m/s, ngưỡng 0,05)");
  lines.push("");
  lines.push(`| Pha | ${C60.map((c) => c[1]).join(" | ")} | Tỉ số khung lớn nhất trong pha so với đỉnh clip, demo vòng 1 → vòng 2 |`);
  lines.push(`|---|${C60.map(() => "---|").join("")}---|`);
  for (const p of runs.al.phases) {
    const v = C60.map((c) => num(ph(c[2], p.phase)?.stanceP95, 3));
    lines.push(`| ${p.phase} | ${v.join(" | ")} | ${num(ph(runs.rl, p.phase)?.maxRatio)} → ${num(p.maxRatio)} |`);
    out.phases.push({ phase: p.phase, stanceP95: Object.fromEntries(C60.map((c, i) => [c[0], v[i]])), maxRatioR1: ph(runs.rl, p.phase)?.maxRatio ?? null, maxRatio: p.maxRatio });
  }
  lines.push("");
  lines.push("Tỉ số trong pha đo mọi khung so với đỉnh clip (sàn 90 °/s mỗi xương), không chỉ cửa sổ chuyển clip, nên lớn hơn tỉ số chuyển clip; dùng để tìm chỗ, không phải ngưỡng.");
  lines.push("");
  lines.push("## 120 Hz (bước 1/120 s, chỉ số đo)");
  lines.push("");
  head(C120);
  for (const [label, gate, val] of [...H, ARMS]) {
    const v = C120.map((c) => val(c[2]));
    lines.push(`| ${label} | ${gate} | ${v.join(" | ")} |`);
    out.hz120.push({ label, gate, ...Object.fromEntries(C120.map((c, i) => [c[0], v[i]])) });
  }
  lines.push("");
  // lab-stress.mjs: the re-cast and overlap paths the demo never takes.
  const st2 = load("stress/metrics.json");
  const st1 = loadR1("stress/metrics.json");
  if (st2) {
    const CS = [
      ["r1", "Vòng 1", st1],
      ["r2", "Vòng 2", st2],
    ].filter((c) => c[2]);
    lines.push("## lab-stress (gieo lại và chồng chiêu, 60 Hz, chỉ số đo)");
    lines.push("");
    head(CS);
    out.stress = [];
    for (const [label, gate, val] of [ROWS[0], ROWS[1], ROWS[2], ROWS[9], ROWS[12], ROWS[14], ROWS[15], ROWS[16], ARMS]) {
      const v = CS.map((c) => val(c[2]));
      lines.push(`| ${label} | ${gate} | ${v.join(" | ")} |`);
      out.stress.push({ label, gate, ...Object.fromEntries(CS.map((c, i) => [c[0], v[i]])) });
    }
    lines.push("");
    lines.push(`Kiếm trong lab-stress: ${CS.map((c) => `${c[1].toLowerCase()} ${S(c[2]).vfx.blades.lives} đời`).join(", ")}.`);
    lines.push("");
  }
  // White-out: % of pixels with R, G and B all ≥ 250, per raw frame (wo-<view>.tsv: name \t percent).
  const wo = (sub, view) => {
    const f = join(dir, sub, `wo-${view}.tsv`);
    if (!existsSync(f)) return null;
    const v = readFileSync(f, "utf8").trim().split("\n").map((l) => Number(l.split("\t")[1])).filter((x) => !Number.isNaN(x));
    return v.length ? { n: v.length, max: Math.max(...v), over: v.filter((x) => x > 6).length } : null;
  };
  const woRows = [
    ["", "1920×1080"],
    ["720", "1280×720"],
  ].flatMap(([sub, res]) => [
    [`Camera chơi, ${res}`, wo(sub, "play")],
    [`Cận cảnh 55°, 6 m, ${res}`, wo(sub, "follow")],
  ]).filter((r) => r[1]);
  if (woRows.length) {
    lines.push("## Trắng xóa, demo vòng 2 (pixel có R, G, B ≥ 250, mọi khung thô)");
    lines.push("");
    lines.push("| Góc nhìn | Ngưỡng | Số khung | Khung lớn nhất (%) | Khung quá 6 % |");
    lines.push("|---|---|---|---|---|");
    out.whiteout = [];
    for (const [label, w] of woRows) {
      lines.push(`| ${label} | ≤ 6 % | ${w.n} | ${num(w.max, 3)} | ${w.over} |`);
      out.whiteout.push({ view: label, frames: w.n, maxPct: w.max, over6: w.over });
    }
    lines.push("");
  }
}
writeFileSync(join(dir, "metrics-table.md"), lines.join("\n"));
writeFileSync(join(dir, "compare.json"), JSON.stringify(out, null, 1));
console.log(lines.join("\n"));
