// Renderer-free R2-4 probe: node --import tsx tests/lab/thunder-aftermath-r2-probe.mjs (no game suite).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import ts from 'typescript';
import { FivePhaseClip } from '../../src/lab/five-phase-clip.ts';
import { ThunderAftermathR2, THUNDER_MARK_START_S, THUNDER_AFTERMATH_END_S } from '../../src/lab/thunder-aftermath-r2.ts';
import { FlipbookPlayer, FlipbookPool, parseFlipbookManifest } from '../../src/view/skills/flipbook.ts';
import { ClipSkillRunner } from '../../src/lab/clip-skills.ts';
import { Showcase, ULT_SHOWCASE } from '../../src/lab/showcase.ts';

const ids = ['thunder-charge', 'thunder-release', 'thunder-ribbon-loop', 'thunder-impact', 'thunder-ground-impact',
  'thunder-sparkle', 'thunder-hit-affliction', 'thunder-caster-seal', 'thunder-ring-burst'];
const meta = (id) => parseFlipbookManifest({ flipbooks: { [id]: { file: id + '.png', mode: 'fire', role: id === 'pillar-thunder-single' ? 'pillar' : 'sparkle',
  cols: 8, rows: 8, frames: 48, fps: 24, cell: [256, 256], loop: true } } }, '/v/').get(id);
const at = new THREE.Vector3(2, 0, -6);
function fixture(search = '?tp2=1', video = false) {
  const parent = new THREE.Group(), player = new FlipbookPlayer('/v/'), trace = [];
  const targets = { size: 1, alive: () => true, x: () => at.x, z: () => at.z, midY: () => 1, radius: () => 0.5,
    tier: () => 0, nearest: () => 0, hit: () => false, inCircle: (_x, _z, _r, out) => { out[0] = 0; return 1; },
    inCapsule: (_a, _b, _c, _d, _r, out) => { out[0] = 0; return 1; } };
  let now = 0, clock = -1;
  const five = new FivePhaseClip(parent, '/v/', { targets, hand: (out) => out.set(0, 1.3, 3),
    pose: (out) => Object.assign(out, { x: 0, y: 0, z: 3 }), glow() {}, release: () => trace.push(['overlay-release', now]) }, search);
  five.prepare = () => {};
  for (const id of ids) { const m = meta(id), tex = new THREE.Texture(); five.adopt(m, tex); five.casterR2?.adopt(m, tex); }
  const show = new Showcase(player, { camera: new THREE.PerspectiveCamera(), nearest: () => 0,
    at: (_i, out) => out.copy(at), caster: (out) => out.set(0, 0, 3), light() {}, accent() {}, shake() {}, captionHost: null }, ULT_SHOWCASE);
  player.library('ult').add(meta('pillar-thunder-single'), new THREE.Texture());
  if (video) { show.canVideo = () => true; show.play = (id) => { show.played = { time: () => clock }; return id; }; }
  const casts = new ClipSkillRunner(show, { targets, layer: parent, player, fivePhase: five,
    caster: (out) => out.set(0, 0, 3), release: () => trace.push(['release', now]), strike: () => trace.push(['strike', now]),
    blow: (skill) => { trace.push(['damage', now, skill.damage]); return false; }, status: (_i, kind, s) => trace.push(['status', now, kind, s]) });
  casts.adoptMark('thunder', meta('thunder-ground-mark'), new THREE.Texture());
  return { parent, player, five, casts, trace, step(dt, c = 0) { now += dt; clock = c; casts.update(dt); player.update(dt); five.aftermathR2?.present(); },
    mark: () => parent.children.find((g) => g.name === 'fx-clip-skill-marks').children[0] };
}
const snapshot = (f) => [f.five.player.group, f.five.fill.player.group, f.mark().parent].map((g) => g.children.map((m) => ({
  visible: m.visible, count: m.geometry.instanceCount, attrs: Object.fromEntries(Object.entries(m.geometry.attributes).map(([k, a]) => [k, Array.from(a.array)])) })));

// Exact event-relative boundaries at three frame rates; present modifies a borrowed card, not its texture/material.
for (const hz of [30, 60, 120]) {
  const parent = new THREE.Group(), source = new THREE.Group(), texture = new THREE.Texture();
  source.name = 'fx-clip-skill-marks'; parent.add(source);
  const mark = new FlipbookPool('thunder-ground-mark', 'fire', 24, 4, texture);
  mark.attach(meta('thunder-ground-mark'), texture); source.add(mark.mesh);
  const fx = new ThunderAftermathR2(parent); fx.adopt(meta('thunder-sparkle'), texture);
  const other = new THREE.Vector3(8, 0, 8);
  mark.spawn(other, 4, { life: 4, rate: 0, alpha: 0.7 }); mark.update(0);
  fx.cast(at); mark.spawn(at, 4, { life: 4, rate: 0 }); fx.strike(); fx.update(1 / hz);
  const buffers = fx.group.children[0].geometry.attributes;
  let previousCount = 6, tailCount = 0;
  for (let frame = 0; frame <= hz * 3; frame++) {
    if (frame > 0) fx.update(1 / hz);
    mark.update(1 / hz); fx.present();
    const age = frame / hz, data = mark.mesh.geometry.getAttribute('iData');
    assert.equal(data.getW(0), Math.fround(0.7)); // unrelated spell in the same pool
    if (age < THUNDER_MARK_START_S - 1e-6 || age >= THUNDER_AFTERMATH_END_S - 1e-6) assert.ok(data.getW(1) < 1e-6);
    if (age > 0.7 && age < 0.75) assert.ok(data.getW(1) > 0.8);
    if (age > 0.8 && age < 1.5) assert.ok(mark.mesh.geometry.getAttribute('iAge').getX(1) > 0);
    const sparks = fx.group.children[0];
    assert.ok(sparks.geometry.instanceCount <= 6);
    if (age > 0.2) { assert.ok(sparks.geometry.instanceCount <= previousCount); previousCount = sparks.geometry.instanceCount; }
    if (age >= 2) { assert.equal(sparks.visible, false); tailCount++; }
    for (let i = 0; i < sparks.geometry.instanceCount; i++) assert.ok(sparks.geometry.getAttribute('iData').getX(i) <= 0.211);
    assert.equal(sparks.geometry.attributes, buffers);
    assert.equal(mark.mesh.material.uniforms.uMap.value, texture);
  }
  assert.ok(tailCount > 0);
  // Recast retires the previous owned mark, then reset hides the new one too.
  const next = new THREE.Vector3(-2, 0, -6);
  fx.cast(next); mark.spawn(next, 4, { life: 3, rate: 0 }); mark.update(0); fx.present();
  assert.equal(mark.mesh.geometry.getAttribute('iData').getW(1), 0);
  fx.strike(); fx.update(0); fx.update(0.75); mark.update(0.75); fx.present();
  assert.ok(mark.mesh.geometry.getAttribute('iData').getW(2) > 0);
  fx.clear(); mark.update(0); fx.present();
  assert.equal(mark.mesh.geometry.getAttribute('iData').getW(2), 0);
}

let maxDraws = 0;
for (const video of [false, true]) {
  const on = fixture('?tp2=1', video), off = fixture('?tp2=0', video), base = fixture('', video);
  for (const f of [on, off, base]) f.casts.cast('pillar-thunder-single');
  assert.equal(off.five.aftermathR2, null);
  assert.equal(fixture('?tp2=1&fivephase=0').five.aftermathR2, null);
  for (let frame = 0; frame < 240; frame++) {
    for (const f of [on, off, base]) f.step(1 / 60, frame < 45 ? -1 : 0);
    assert.deepEqual(snapshot(off), snapshot(base));
    assert.deepEqual(on.trace, off.trace);
    const groups = [on.five.casterR2.group, on.five.travelR2.group, on.five.impactR2.group, on.five.aftermathR2.group];
    const draws = groups.reduce((n, g) => n + g.children.filter((m) => m.visible && m.geometry.instanceCount > 0).length, 0);
    maxDraws = Math.max(maxDraws, draws); assert.ok(draws <= 9 && draws <= 12);
    if (video && frame < 45) { assert.equal(on.trace.some(([s]) => s === 'damage'), false); assert.equal(on.mark().geometry.getAttribute('iData').getW(0), 0); }
  }
  assert.equal(on.trace.filter(([s]) => s === 'damage').length, 1, JSON.stringify({ video, trace: on.trace, report: on.casts.last }));
  assert.equal(on.mark().visible, false);
  assert.equal(on.five.aftermathR2.group.children[0].visible, false);
  const shared = on.five.player.pool('thunder', 'thunder-sparkle').mesh.material.uniforms.uMap.value;
  assert.equal(on.five.aftermathR2.group.children[0].material.uniforms.uMap.value, shared);
}
const quiet = fixture('?tp2=1&tp2sparkles=0');
assert.equal(quiet.five.aftermathR2.group.children.length, 0);
const code = readFileSync(new URL('../../src/lab/thunder-aftermath-r2.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('thunder-aftermath-r2.ts', code, ts.ScriptTarget.Latest, true), allocations = [];
function check(n) {
  if (ts.isNewExpression(n) || ts.isObjectLiteralExpression(n) || ts.isArrayLiteralExpression(n) || ts.isArrowFunction(n)) allocations.push(n.getText(tree));
  ts.forEachChild(n, check);
}
function visit(n) {
  if (ts.isMethodDeclaration(n) && ['markMesh', 'cast', 'strike', 'update', 'render', 'present', 'clear'].includes(n.name.getText(tree))) check(n.body);
  else ts.forEachChild(n, visit);
}
visit(tree); assert.deepEqual(allocations, []);
const manifest = JSON.parse(readFileSync(new URL('../../art-src/lab/vfx/thunder/manifest.json', import.meta.url)));
const bytes = ['thunder-caster-seal', 'thunder-ring-burst'].reduce((n, id) => { const m = manifest.flipbooks[id]; return n + m.width * m.height * 4 * 4 / 3; }, 0);
assert.ok(bytes <= 64_000_000);
console.log(`PASS R2-4: 30/60/120 Hz boundaries; borrowed mark, cooling/erosion; thinning small sparks; recast/reset; other marks preserved; B8 off identical; atlas/stalled-video event parity; warm buffers/AST; ${maxDraws} observed extra draws (bound 9); ${bytes} extra texture bytes total.`);
