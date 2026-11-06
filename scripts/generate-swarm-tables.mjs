/** Offline only. Run from this worktree; sim contains literals, never runtime trig. */
import { readFileSync, writeFileSync } from 'node:fs';
const url = new URL('../src/sim/swarm-geometry.ts', import.meta.url);
const scale = 1_048_576;
const sin = Array.from({ length: 4096 }, (_, i) => Math.round(Math.sin(i * 2 * Math.PI / 4096) * scale) + 0);
const directions = sin.flatMap((s, i) => [sin[(i + 1024) & 4095], s]);
const literal = (values) => Array.from({ length: Math.ceil(values.length / 16) }, (_, i) => '  ' + values.slice(i * 16, i * 16 + 16).join(', ') + ',').join('\n');
const section = `// TABLES-BEGIN (generated offline by scripts/generate-swarm-tables.mjs)\nexport const SWARM_TABLE_VERSION = 1;\nexport const TABLE_SCALE = ${scale};\nexport const SIN: readonly number[] = [\n${literal(sin)}\n];\nexport const DIRECTIONS: readonly number[] = [\n${literal(directions)}\n];\n// TABLES-END`;
writeFileSync(url, readFileSync(url, 'utf8').replace(/\/\/ TABLES-BEGIN[\s\S]*?\/\/ TABLES-END/, section));
