// Tĩnh Tu bots and gates HC4, HC4b, HC5, HC6, HC6b, HC7 (canon §18.4,
// M0A_PLAN §6.8.6, §8): pnpm tt:bots [--seeds=20]. Prints the Markdown
// report, writes tmp/tinh-tu/report.{md,json}; exit code 1 when a gate fails.
// Owner: Lane 8.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { GATES } from "../../src/content/rules";
import { reportMarkdown, runTinhTuGates } from "./gates";

const flag = (name: string, fallback: number): number => {
  const hit = process.argv.find((arg) => arg.startsWith("--" + name + "="));
  const value = hit === undefined ? fallback : Number(hit.slice(name.length + 3));
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const started = Date.now();
const report = runTinhTuGates(flag("seeds", GATES.seeds));
const markdown = reportMarkdown(report);
const out = resolve(import.meta.dirname, "..", "..", "tmp", "tinh-tu");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "report.md"), markdown);
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 1));
console.log(markdown);
console.log("(" + ((Date.now() - started) / 1000).toFixed(1) + " s; tmp/tinh-tu/report.md, report.json)");
if (report.gates.some((gate) => !gate.pass)) process.exitCode = 1;
