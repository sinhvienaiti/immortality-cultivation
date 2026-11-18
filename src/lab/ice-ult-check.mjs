/** Kiểm riêng phiếu 389; không chạy build hoặc bộ test của game.
 * node games/.wt-ic-lab-all/src/lab/ice-ult-check.mjs
 */
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ts from '../../node_modules/typescript/lib/typescript.js';
import * as THREE from 'three';

const files = ['ice-ult-layered.ts', 'ice-ult-sprites.ts'].map(p => fileURLToPath(new URL(p, import.meta.url)));
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noUncheckedIndexedAccess: true, skipLibCheck: true, noEmit: true, types: [] };
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options)).filter(d => !d.file || files.includes(d.file.fileName));
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: x => x, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }));
registerHooks({
  resolve(s, c, next) {
    try { return next(s, c); } catch (e) {
      if (s.startsWith('.') && c.parentURL) { const u = new URL(s + '.ts', c.parentURL); if (existsSync(u)) return { url: u.href, shortCircuit: true }; }
      throw e;
    }
  },
  load(u, c, next) {
    if (u.endsWith('.ts')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(u), 'utf8'), { compilerOptions: options }).outputText };
    return next(u, c);
  },
});
const { IceUltLayered, iceUltLayeredDefault } = await import('./ice-ult-layered.ts');
const scene = new THREE.Group(), dead = new Set();
const calls = { freeze: [], blow: [], strike: [], sound: [] };
const host = {
  targets: { size: 100, alive: i => !dead.has(i), x: i => (i % 10 - 4.5) * 2, z: i => -Math.floor(i / 10) * 2, midY: i => i % 7 === 0 ? 2 : 0.7, radius: i => i % 7 === 0 ? 1.3 : 0.4 },
  hand: p => p.set(0, 1, 6), caster: p => p.set(0, 0, 6), release() {}, cold() {},
  freeze: (i, seconds) => calls.freeze.push([i, seconds]), blow: i => { calls.blow.push(i); return false; },
  strike: (_p, role) => calls.strike.push(role), sound: (event, _p, pitch) => calls.sound.push([event, pitch]),
};
const ice = new IceUltLayered(scene, '/art-src/lab/vfx/', host);
ice.prepare = () => {}; // CPU-only: no fake texture or renderer readiness claim.
const report = ice.cast();
dead.add(99);
for (let i = 0; i < 600; i++) ice.update(1 / 60);
assert.equal(report.version, 'v3'); assert.equal(report.clusters, 180);
assert.equal(calls.freeze.length, 99); assert.equal(calls.blow.length, 99);
assert.equal(new Set(calls.blow).size, 99); assert.ok(calls.freeze.every(([, seconds]) => seconds === 3));
assert.deepEqual(calls.strike, ['primary']); assert.equal(ice.active, false);
assert.ok(calls.sound.some(([e]) => e === 'crystal-grow')); assert.ok(calls.sound.some(([e]) => e === 'crystal-shatter'));
assert.ok(calls.sound.every(([, pitch]) => pitch >= 0.96 && pitch <= 1.04));
const field = scene.getObjectByName('fx-ice-ult-v3');
assert.ok(field && !field.visible); assert.equal(scene.getObjectByName('fx-ice-ult-3d'), undefined);
assert.equal(report.assetsReady, false); // A CPU check must not report PNGs as uploaded.
for (let i = 0; i < 8; i++) { ice.cast(); ice.update(0.9); ice.clear(); }
field.traverse(o => { if (o.geometry?.isInstancedBufferGeometry) assert.equal(o.geometry.instanceCount, 0); });
for (const version of ['v1', 'v2']) {
  globalThis.location = { search: '?iceVersion=' + version };
  const old = new IceUltLayered(new THREE.Group(), '/', host); old.prepare = () => {};
  assert.equal(old.cast().version, version); old.clear();
}
assert.equal(iceUltLayeredDefault('?ultIce=video'), false); assert.equal(iceUltLayeredDefault(''), true);
const art = new URL('../../art-src/lab/vfx/ice-ult/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', art), 'utf8'));
assert.equal(manifest.sprites.length, 12);
for (const sprite of manifest.sprites) { assert.ok(existsSync(new URL(sprite.file, art))); assert.ok(existsSync(new URL(sprite.name + '.prompt.txt', art))); }
console.log(JSON.stringify({ result: 'PASS', typeDiagnostics: 0, sprites: 12, version: report.version, clusters: report.clusters, draws: report.meshDraws, heightRangeM: report.clusterHeightM, frozen: report.frozen, shattered: report.shattered, soundRequests: report.soundEvents, rendererVerified: false }, null, 2));
