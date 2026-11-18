/** Ticket 390: focused instance, material and event probes; never runs the game's test suite. */
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ts from '../../node_modules/typescript/lib/typescript.js';
import * as THREE from 'three';

const files = ['ice-ult-layered.ts', 'ice-ult-sprites.ts', 'ice-ult-frost.ts'].map(p => fileURLToPath(new URL(p, import.meta.url)));
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
const { IceUltLayered } = await import('./ice-ult-layered.ts');
const scene = new THREE.Group(), actors = new THREE.Group(), fx = new THREE.Group();
scene.add(actors, fx);
const original = [], meshes = [], dead = new Set(), calls = { freeze: [], blow: [], strike: [] };
let chained = 0;
for (let species = 0; species < 4; species++) {
  const geometry = new THREE.BoxGeometry();
  geometry.setAttribute('iRim', new THREE.InstancedBufferAttribute(new Float32Array(25 * 3), 3));
  const material = new THREE.MeshStandardMaterial({ color: 0x998877 });
  material.onBeforeCompile = () => { chained++; };
  material.customProgramCacheKey = () => 'source-' + species;
  const mesh = new THREE.InstancedMesh(geometry, material, 25);
  for (let index = 0; index < 25; index++) {
    const i = species * 25 + index;
    mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation((i % 10 - 4.5) * 2, 0, -Math.floor(i / 10) * 2));
  }
  original.push(material); meshes.push(mesh); actors.add(mesh);
}
const host = {
  targets: { group: actors, size: 100, alive: i => !dead.has(i), x: i => (i % 10 - 4.5) * 2, z: i => -Math.floor(i / 10) * 2,
    midY: i => i % 7 === 0 ? 2 : 0.7, radius: i => i % 7 === 0 ? 1.3 : 0.4 },
  hand: p => p.set(0, 1, 6), caster: p => p.set(0, 0, 6), release() {}, cold() {},
  freeze: (i, seconds) => calls.freeze.push({ i, seconds, at: now }),
  blow: (i, dx, dz, power, role) => { calls.blow.push({ i, at: now, power, role }); return false; },
  strike: (_p, role) => calls.strike.push(role),
};
let now = 0;
const ice = new IceUltLayered(fx, '/art-src/lab/vfx/', host);
ice.prepare = () => {}; // No texture readiness or GPU claim from a CPU probe.
const report = ice.cast();
while (now < 2.2) { now += 1 / 60; ice.update(1 / 60); }
assert.equal(calls.freeze.length, 100);
assert.equal(report.tintedFoes, 100);
assert.equal(report.bindDraws, 3); assert.equal(report.meshDraws, 6);
assert.equal(scene.getObjectByName('fx-ice-ult-v3-round-shells'), undefined);
assert.deepEqual(report.bindInstancesPerFoe, { mist: 1, shards: 6, flakes: 8, dust: 6 });
const field = scene.getObjectByName('fx-ice-ult-v3');
const cards = {};
field.traverse(o => { if (o.geometry?.isInstancedBufferGeometry) cards[o.name] = o; });
const submittedAtHold = Object.fromEntries(Object.entries(cards).map(([name, card]) => [name, card.geometry.instanceCount]));
const foot = scene.getObjectByName('fx-ice-ult-v3-foot-mist');
const shards = scene.getObjectByName('fx-ice-ult-v3-shards');
const glitter = scene.getObjectByName('fx-ice-ult-v3-glitter');
assert.equal(foot.geometry.instanceCount, 100);
assert.equal(shards.geometry.instanceCount, 960);
assert.equal(glitter.geometry.instanceCount, 1760);
for (let i = 0; i < 100; i++) {
  const index = 360 + i * 6, g = shards.geometry;
  assert.equal(g.getAttribute('iClock').getZ(index), 6);
  assert.ok(g.getAttribute('iMove').getX(index) > host.targets.radius(i) + g.getAttribute('iSize').getY(index) / 2);
  assert.equal(g.getAttribute('iStyle').getX(index), 4);
  assert.ok(g.getAttribute('iStyle').getW(index) < 0.5);
}
for (let species = 0; species < 4; species++) {
  const material = meshes[species].material;
  assert.notEqual(material, original[species]);
  assert.equal(material.opacity, original[species].opacity);
  assert.equal(material.transparent, original[species].transparent);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {});
  assert.ok(shader.vertexShader.includes('vIceBind ='));
  assert.ok(shader.fragmentShader.includes('vec3 iceBody = outgoingLight'));
  assert.equal(shader.uniforms.uIceBindTime.value, now);
  assert.equal(material.customProgramCacheKey(), 'source-' + species + '-ice-bind-390');
  for (let index = 0; index < 25; index++) assert.equal(meshes[species].geometry.getAttribute('iIceBindClock').getY(index), 1);
}
assert.equal(chained, 4);
dead.add(0); now += 1 / 60; ice.update(1 / 60);
assert.equal(foot.geometry.getAttribute('iClock').getX(0), 1e6);
assert.equal(meshes[0].geometry.getAttribute('iIceBindClock').getY(0), 0);
for (let j = 0; j < 6; j++) assert.equal(shards.geometry.getAttribute('iClock').getX(360 + j), 1e6);
while (now < 10) { now += 1 / 60; ice.update(1 / 60); }
assert.equal(calls.blow.length, 99); assert.deepEqual(calls.strike, ['primary']);
for (const hit of calls.blow) {
  const frozen = calls.freeze.find(f => f.i === hit.i);
  assert.ok(Math.abs(hit.at - frozen.at - 3) < 1 / 60 + 1e-8);
  assert.equal(hit.power, 1);
}
assert.equal(ice.active, false);
for (const mesh of meshes) {
  const clock = mesh.geometry.getAttribute('iIceBindClock');
  for (let i = 0; i < clock.count; i++) assert.equal(clock.getY(i), 0);
}
for (let i = 0; i < 5; i++) { ice.cast(); ice.update(2); ice.clear(); }
for (const card of Object.values(cards)) assert.equal(card.geometry.instanceCount, 0);
assert.ok(meshes.every((mesh, i) => original[i].color.getHex() === 0x998877 && mesh.material !== original[i]));
console.log(JSON.stringify({ result: 'PASS', typeDiagnostics: 0, targets: 100, tintedAtHold: 100, frozen: calls.freeze.slice(0, 100).length,
  blowsBeforeRecasts: 99, holdSeconds: 3, bindDraws: 3, wholeV3Draws: 6,
  submittedCardsAt100: submittedAtHold,
  sourceMaterialsIntact: true, clonedMaterialHooksChained: chained, rendererVerified: false }, null, 2));
