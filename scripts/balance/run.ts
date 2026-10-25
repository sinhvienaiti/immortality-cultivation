// Source: games/dragon-hold/scripts/balance/run.ts @06cd4e6 (adapted: canon §18's matrix of this game (bots × presets × seeds, Đứng yên by default), forked workers sending compact runs, the report of report.ts in Markdown and JSON)
/**
 * pnpm ic:balance: headless bots on the M0a stage (canon §18, M0A_PLAN §6.7,
 * §7): the 9 first bots (Đứng yên) × Thư giãn, Cân bằng, Thử thách; Chuẩn
 * Tốt and Kém (B6) at Cân bằng and Thử thách; Chuẩn with the director off
 * (B7) and Chuẩn Cơ động (CB4) at Cân bằng; 20 seeds each. Prints the
 * Markdown report (B1–B9 on the shared bands first), writes JSON on --json,
 * Markdown on --md. Never fails unless --strict.
 *   tsx scripts/balance/run.ts [--seeds=20] [--base-seed=1] [--jobs=4]
 *     [--bots=standard,fast] [--presets=balanced] [--json=out.json] [--md=out.md] [--strict]
 *   tsx scripts/balance/run.ts --trace=standard:balanced:7   (one run as JSON)
 * Owner: Lane 7.
 */
import { fork } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GATES } from "../../src/content/rules";
import type { Preset } from "../../src/content/types";
import { runBot } from "./bot";
import { ALL_BOTS, FIRST_BOTS, botById } from "./bots";
import { buildReport, lite, type RunLite } from "./report";
import { botDeckSource } from "./vocab";

interface Task {
  readonly bot: string;
  readonly preset: Preset;
  readonly seed: number;
}

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => args.find((a) => a.startsWith("--" + name + "="))?.slice(name.length + 3);
const num = (name: string, fallback: number): number => {
  const value = Number(arg(name) ?? fallback);
  return Number.isFinite(value) ? value : fallback;
};

/** The default matrix (canon §18.1, §18.4). */
export function matrix(seeds: number, base: number, only?: { bots?: readonly string[]; presets?: readonly Preset[] }): Task[] {
  const cells: { bot: string; preset: Preset }[] = [];
  for (const preset of ["relax", "balanced", "challenge"] as const) for (const bot of FIRST_BOTS) cells.push({ bot: bot.id, preset });
  for (const preset of ["balanced", "challenge"] as const) for (const bot of ["standard@good", "standard@poor"]) cells.push({ bot, preset });
  cells.push({ bot: "standard@off", preset: "balanced" });
  cells.push({ bot: "standard@mobile", preset: "balanced" });
  return cells
    .filter((cell) => (only?.bots ? only.bots.includes(cell.bot) : true) && (only?.presets ? only.presets.includes(cell.preset) : true))
    .flatMap((cell) => Array.from({ length: seeds }, (_, k) => ({ ...cell, seed: base + k })));
}

async function runTask(task: Task): Promise<RunLite> {
  const source = await botDeckSource();
  return lite(runBot(botById(task.bot), { seed: task.seed, preset: task.preset, source, timeSteps: task.bot === "standard" }));
}

if (args.includes("--worker")) {
  process.once("message", async (tasks: Task[]) => {
    // Each result waits for its send to flush (dragon-hold: a disconnect with sends queued crashes the channel).
    for (const task of tasks) {
      const run = await runTask(task);
      await new Promise<void>((done, fail) => process.send!(run, (error: Error | null) => (error ? fail(error) : done())));
    }
    process.disconnect();
  });
} else if (arg("trace")) {
  const [bot, preset, seed] = arg("trace")!.split(":");
  const source = await botDeckSource();
  const run = runBot(botById(bot ?? "standard"), { seed: Number(seed ?? 1), preset: (preset ?? "balanced") as Preset, source, timeSteps: true });
  console.log(JSON.stringify(lite(run), null, 1));
} else {
  await main();
}

async function main(): Promise<void> {
  const started = performance.now();
  const seeds = num("seeds", GATES.seeds);
  const base = num("base-seed", 1);
  const bots = arg("bots")?.split(",");
  for (const id of bots ?? []) botById(id);
  const presets = arg("presets")?.split(",") as Preset[] | undefined;
  const tasks = matrix(seeds, base, { bots, presets });
  const jobs = Math.max(1, Math.min(num("jobs", 4), tasks.length));
  const runs: RunLite[] = [];
  const progress = (run: RunLite): void => {
    runs.push(run);
    process.stderr.write("\r" + runs.length + "/" + tasks.length + " lượt");
  };
  if (jobs === 1) for (const task of tasks) progress(await runTask(task));
  else {
    const chunks: Task[][] = Array.from({ length: jobs }, () => []);
    tasks.forEach((task, k) => chunks[k % jobs]!.push(task));
    const script = fileURLToPath(import.meta.url);
    await Promise.all(
      chunks.map(
        (chunk) =>
          new Promise<void>((resolve, reject) => {
            const child = fork(script, ["--worker"], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
            child.on("message", (run) => progress(run as RunLite));
            child.on("error", reject);
            child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("bot worker exited with " + code))));
            child.send(chunk);
          }),
      ),
    );
  }
  process.stderr.write("\n");
  runs.sort((a, b) => a.bot.localeCompare(b.bot) || a.preset.localeCompare(b.preset) || a.seed - b.seed);
  const wallS = (performance.now() - started) / 1000;
  const report = buildReport({ runs, seeds, base, wallS, jobs, notes: ["Bot: " + [...new Set(runs.map((run) => run.bot))].join(", ") + ".", "Định nghĩa P, I, O: canon §18.2 (scripts/balance/meter.ts); chữ sống = ready + đang gõ."] });
  console.log(report.markdown);
  const json = arg("json");
  if (json) writeFileSync(json, JSON.stringify({ seeds, base, wallS, jobs, bGates: report.bGates, gates: report.gates, summaries: report.summaries, runs }, null, 1) + "\n");
  const md = arg("md");
  if (md) writeFileSync(md, report.markdown + "\n");
  if (args.includes("--strict") && (report.bGates.some((g) => g.status === "fail") || report.gates.some((g) => g.status === "fail"))) process.exitCode = 1;
}

export { ALL_BOTS };
