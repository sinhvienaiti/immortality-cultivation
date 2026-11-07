// Renderer-free checks for R2-3; direct node probe, never the game's test suite.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import ts from 'typescript';
import { FivePhaseClip } from '../../src/lab/five-phase-clip.ts';
import { ThunderImpactR2, THUNDER_IMPACT_OFFSET_S, THUNDER_HIT_RGB, THUNDER_HIT_RIM_S } from '../../src/lab/thunder-impact-r2.ts';
import { FlipbookPool, parseFlipbookManifest } from '../../src/view/skills/flipbook.ts';

const ids = ['thunder-charge', 'thunder-release', 'thunder-ribbon-loop', 'thunder-impact', 'thunder-ground-impact',
  'thunder-sparkle', 'thunder-hit-affliction', 'thunder-caster-seal', 'thunder-ring-burst'];
const meta = (id) => parseFlipbookManifest({ flipbooks: { [id]: { file: id + '.png', mode: 'fire', role: 'sparkle',
  cols: 8, rows: 8, frames: 48, fps: 24, cell: [256, 256], timing: { peak: 13 }, loop: true } } }, '/v/').get(id);
const target = new THREE.Vector3(2, 0, -6);
function fixture(search = '') {
  const parent = new THREE.Group(), textures = new Map(ids.map((id) => [id, new THREE.Texture()]));
  const targets = { size: 1, alive: () => true, x: () => 2, z: () => -6, midY: () => 1, radius: () => 0.5, tier: () => 0 };
  const five = new FivePhaseClip(parent, '/v/', { targets, hand: (out) => out.set(0, 1.3, 3),
    pose: (out) => Object.assign(out, { x: 0, y: 0, z: 3 }), glow() {}, release() {} }, search);
  five.prepare = () => {};
  for (const id of ids) {
    five.adopt(meta(id), textures.get(id));
    five.casterR2?.adopt(meta(id), textures.get(id));
  }
  return { five, parent, textures };
}
const layer = (f, id) => f.five.impactR2.group.children.find((m) => m.name === 'flipbook-' + id);
const pool = (f, id) => f.five.player.pool('thunder', id);
const snapshot = (f) => [f.five.player.group, f.five.fill.player.group].map((g) => g.children.map((m) => ({
  visible: m.visible, count: m.geometry.instanceCount,
  attrs: Object.fromEntries(Object.entries(m.geometry.attributes).map(([k, a]) => [k, Array.from(a.array)])),
})));

const f = fixture('?tp2=1'), off = fixture('?tp2=0'), base = fixture();
assert.equal(off.five.impactR2, null);
assert.equal(fixture('?tp2=1&fivephase=0').five.impactR2, null);
const core = layer(f, 'thunder-ground-impact'), ring = layer(f, 'thunder-ring-burst');
assert.equal(layer(f, 'thunder-impact'), undefined);
assert.equal(core.material.uniforms.uMap.value, f.textures.get('thunder-ground-impact'));
assert.equal(ring.material.uniforms.uMap.value, f.textures.get('thunder-ring-burst'));
assert.equal(core.material.customProgramCacheKey(), 'element-ground-card');
const options = new Set(), vectors = new Set(), attrs = f.five.impactR2.group.children.map((m) => m.geometry.attributes);
const spawn = FlipbookPool.prototype.spawn;
FlipbookPool.prototype.spawn = function(at, size, o) {
  if (this.mesh.parent === f.five.impactR2.group) { options.add(o); vectors.add(at); }
  return spawn.call(this, at, size, o);
};
for (const x of [f, off, base]) { x.five.cast(target); x.five.strike(target); x.five.hit(0, false, 1); }
const data = core.geometry.getAttribute('iData');
assert.equal(core.visible, true); assert.equal(data.getW(0), 1); assert.equal(data.getZ(0), 13);
assert.ok(Math.abs(core.geometry.getAttribute('iPos').getY(0) - 0.12) < 1e-6);
assert.equal(pool(f, 'thunder-impact').live + pool(f, 'thunder-ground-impact').live, 0);
let maxDraws = 0;
for (let frame = 0; frame <= 180; frame++) {
  for (const x of [f, off, base]) x.five.update(1 / 60);
  assert.deepEqual(snapshot(off), snapshot(base));
  if (frame === 0) { assert.equal(data.getW(0), 1); assert.equal(data.getZ(0), 13); }
  assert.equal(ring.visible, frame >= 3 && frame < 24);
  // R2-4 replaces the large impact-tail sparkle; R0's four release sparkles and one target sparkle stay.
  if (frame < 2) assert.equal(pool(f, 'thunder-sparkle').live, 5);
  if (frame === 2) assert.equal(pool(f, 'thunder-sparkle').live, 5);
  if (frame >= 17) assert.equal(core.visible, false);
  const draws = [f.five.casterR2.group, f.five.travelR2.group, f.five.impactR2.group]
    .reduce((n, g) => n + g.children.filter((m) => m.visible && m.geometry.instanceCount > 0).length, 0);
  maxDraws = Math.max(maxDraws, draws); assert.ok(draws <= 8 && draws <= 12);
  for (const g of [f.five.casterR2.group, f.five.travelR2.group, f.five.impactR2.group]) for (const m of g.children) {
    const colour = m.geometry.getAttribute('iColor');
    for (let i = 0; i < m.geometry.instanceCount; i++) assert.ok(Math.max(colour.getX(i), colour.getY(i), colour.getZ(i)) <= 0.900001);
  }
}
FlipbookPool.prototype.spawn = spawn;
assert.equal(options.size, 1); assert.equal(vectors.size, 1);
f.five.impactR2.group.children.forEach((m, i) => assert.equal(m.geometry.attributes, attrs[i]));
assert.equal(pool(f, 'thunder-impact').live + pool(f, 'thunder-ground-impact').live, 0);
f.five.strike(target); f.five.clear();
assert.ok(f.five.impactR2.group.children.every((m) => !m.visible));

// Isolate each authored layer; mutually exclusive cores, fixed delays in seconds at multiple frame rates.
for (const mode of ['ground', 'impact', 'off']) {
  const x = fixture('?tp2=1&tp2core=' + mode + '&tp2ring=0&tp2sparkles=0');
  x.five.strike(target); x.five.hit(0, true, 1); x.five.update(1 / 60);
  assert.equal(x.five.impactR2.group.children.length, mode === 'off' ? 0 : 1);
  assert.equal(pool(x, 'thunder-sparkle').live, 0);
  assert.equal(pool(x, 'thunder-hit-affliction').live, 0);
  assert.equal(pool(x, 'thunder-ground-impact').live + pool(x, 'thunder-impact').live, 0);
  if (mode !== 'off') assert.equal(layer(x, mode === 'ground' ? 'thunder-ground-impact' : 'thunder-impact').visible, true);
}
for (const hz of [30, 60, 120]) {
  const x = fixture('?tp2=1&tp2core=off&tp2sparkles=0');
  x.five.strike(target); x.five.update(1 / hz);
  let elapsed = 0;
  while (elapsed < 0.2) {
    assert.equal(layer(x, 'thunder-ring-burst').visible, elapsed >= THUNDER_IMPACT_OFFSET_S - 1e-8);
    elapsed += 1 / hz; x.five.update(1 / hz);
  }
}

// Parse the actual integration hook: exactly one damage call, then one sound/event call on the same stack.
const main = readFileSync(new URL('../../src/lab/skills-main.ts', import.meta.url), 'utf8');
const hook = main.slice(main.indexOf('function clipHost('), main.indexOf('const clipSkills ='));
for (const enabled of [false, true]) for (const slot of ['k8', 'k9']) for (const id of ['pillar-thunder-single', 'pillar-fire-meteor']) {
  const calls = [];
  const dependencies = { thunderFive: { impactR2: enabled ? {} : null }, THUNDER_HIT_RGB, THUNDER_HIT_RIM_S,
    herd: { hit(...args) { calls.push(['hit', ...args]); return true; } },
    emitImpact(...args) { calls.push(['impact', ...args]); },
    tmpColour: { set() { return { getHex() { return 0x123456; } }; } },
    view: { layers: { fx: null } }, stage: { flipbooks: null } };
  const js = ts.transpileModule('const { ' + Object.keys(dependencies).join(',') + ' } = deps; let clipSkillNow, clipRgb, clipDeath; ' + hook +
    '; return clipHost(slot, { item() { return { light: "#ffffff" }; } });', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const host = new Function('deps', 'slot', 'THREE', js)(dependencies, slot, THREE);
  assert.equal(host.blow({ id }, 2, 0.6, -0.8, 0.9, 'primary'), true);
  const on = enabled && slot === 'k8' && id === 'pillar-thunder-single';
  assert.deepEqual(calls, [
    ['hit', 2, 0.6, -0.8, 0.9, on ? THUNDER_HIT_RGB : 0x123456, on ? THUNDER_HIT_RIM_S : undefined],
    ['impact', slot, 2, 0.6, -0.8, 0.9, 'primary', true, on ? THUNDER_HIT_RGB : 0x123456],
  ]);
}
const source = readFileSync(new URL('../../src/lab/thunder-impact-r2.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('thunder-impact-r2.ts', source, ts.ScriptTarget.Latest, true), allocations = [];
function check(n) {
  if (ts.isNewExpression(n) || ts.isObjectLiteralExpression(n) || ts.isArrayLiteralExpression(n) || ts.isArrowFunction(n)) allocations.push(n.getText(tree));
  ts.forEachChild(n, check);
}
function visit(n) {
  if (ts.isMethodDeclaration(n) && ['strike', 'update', 'render', 'clear'].includes(n.name.getText(tree))) check(n.body);
  else ts.forEachChild(n, visit);
}
visit(tree); assert.deepEqual(allocations, []);
const manifest = JSON.parse(readFileSync(new URL('../../art-src/lab/vfx/thunder/manifest.json', import.meta.url)));
const bytes = ['thunder-caster-seal', 'thunder-ring-burst'].reduce((n, id) => {
  const m = manifest.flipbooks[id]; return n + m.width * m.height * 4 * 4 / 3;
}, 0);
assert.ok(bytes <= 64_000_000);
console.log(`PASS R2-3: H0 peak; single core; ring H0+3; R2-4 replaces the large sparkle tail; toggles; off buffers; warm reuse/AST; <=8 impact/caster/travel draws (observed ${maxDraws}); shared textures, R2 total ${bytes} bytes; synchronous damage/event hook.`);
// The existing direct R2-2 probe also checks real runner clocks, atlas/video fallback and stalled video.
await import('./thunder-travel-r2-probe.mjs');
