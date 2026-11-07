// Renderer-free checks for lane R2-2; run directly with node --import tsx (no game suite).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import ts from 'typescript';
import { FivePhaseClip } from '../../src/lab/five-phase-clip.ts';
import { ThunderTravelR2, THUNDER_TRAVEL_TAIL_S, THUNDER_PILLAR_TAIL_S, THUNDER_PILLAR_SIZE } from '../../src/lab/thunder-travel-r2.ts';
import { ClipSkillRunner } from '../../src/lab/clip-skills.ts';
import { Showcase, ULT_SHOWCASE } from '../../src/lab/showcase.ts';
import { FlipbookPlayer, FlipbookPool, parseFlipbookManifest } from '../../src/view/skills/flipbook.ts';

const ids = ['thunder-charge', 'thunder-release', 'thunder-ribbon-loop', 'thunder-impact', 'thunder-ground-impact',
  'thunder-sparkle', 'thunder-hit-affliction', 'thunder-caster-seal', 'thunder-ring-burst'];
const meta = (id) => parseFlipbookManifest({ flipbooks: { [id]: { file: id + '.png', mode: 'fire', role: id === 'pillar-thunder-single' ? 'pillar' : 'sparkle',
  cols: 8, rows: 8, frames: 48, fps: 24, cell: [256, 256], loop: true } } }, '/v/').get(id);
const hand = new THREE.Vector3(1, 1.3, 3), target = new THREE.Vector3(2, 0, -6);
function fixture(search = '') {
  const parent = new THREE.Group(), releases = [];
  const host = { hand: (out) => out.copy(hand), pose: (out) => Object.assign(out, { x: hand.x, y: 0, z: hand.z }),
    targets: { size: 1, alive: () => true, x: () => target.x, z: () => target.z, midY: () => 1, radius: () => 0.5,
      tier: () => 0, nearest: () => 0, hit: () => false,
      inCircle: (_x, _z, _r, out) => { out[0] = 0; return 1; },
      inCapsule: (_ax, _az, _bx, _bz, _r, out) => { out[0] = 0; return 1; } }, glow() {}, release: () => releases.push(0) };
  const five = new FivePhaseClip(parent, '/v/', host, search);
  // Prevent network warmup, as the real pools are supplied below.
  five.prepare = () => {};
  const textures = new Map(ids.map((id) => [id, new THREE.Texture()]));
  for (const id of ids) {
    five.adopt(meta(id), textures.get(id));
    five.casterR2?.adopt(meta(id), textures.get(id));
  }
  return { parent, five, releases, textures };
}
const layer = (group, id) => group.children.find((m) => m.name === 'flipbook-' + id);
const on = fixture('?tp2=1'), off = fixture('?tp2=0'), base = fixture();
assert.equal(off.five.travelR2, null);
assert.equal(fixture('?tp2=1&fivephase=0').five.travelR2, null);
for (const f of [on, off, base]) f.five.cast(target);
assert.deepEqual(on.releases, base.releases);
const travel = on.five.travelR2, ribbon = layer(travel.group, 'thunder-ribbon-loop');
const sparkle = layer(travel.group, 'thunder-sparkle'), halo = layer(travel.group, 'thunder-charge');
assert.equal(ribbon.geometry.instanceCount, 2);
assert.equal(halo.visible, false);
// Each textured segment spans exactly its two socket positions, not a velocity-driven detached card.
for (const [i, a, b] of [[0, hand, new THREE.Vector3(1, 8, 3)], [1, new THREE.Vector3(1, 8, 3), new THREE.Vector3(2, 8, -6)]]) {
  const p = ribbon.geometry.getAttribute('iPos'), d = ribbon.geometry.getAttribute('iDir'), lift = ribbon.geometry.getAttribute('iLift');
  const centre = new THREE.Vector3().fromBufferAttribute(p, i), dir = new THREE.Vector3().fromBufferAttribute(d, i);
  assert.ok(centre.distanceTo(a.clone().lerp(b, 0.5)) < 1e-5);
  assert.ok(dir.distanceTo(b.clone().sub(a)) < 1e-5);
  assert.ok(Math.abs(lift.getY(i) - a.distanceTo(b)) < 1e-5);
}
for (const id of ['thunder-ribbon-loop', 'thunder-sparkle', 'thunder-charge']) {
  assert.equal(layer(travel.group, id).material.uniforms.uMap.value, on.textures.get(id));
}
const attrs = travel.group.children.map((m) => m.geometry.attributes);
const options = new Set(), vectors = new Set();
const spawn = FlipbookPool.prototype.spawn;
FlipbookPool.prototype.spawn = function(at, size, opts) {
  if (this.mesh.parent === travel.group) { options.add(opts); vectors.add(at); }
  return spawn.call(this, at, size, opts);
};
const source = new THREE.Group(), blank = new THREE.Texture();
const pillar = new FlipbookPool('pillar-thunder-single', 'fire', 2, 15, blank);
pillar.attach(meta('pillar-thunder-single'), blank); source.add(pillar.mesh);
const videoTexture = new THREE.Texture({ currentSrc: 'https://local/v/ult/pillar-thunder-single.mp4' });
const video = new FlipbookPool('video', 'fire', 1, 15, blank);
video.attach(meta('video'), videoTexture); source.add(video.mesh);
pillar.spawn(target, 40, { life: 4 }); pillar.update(0);
travel.present(source); assert.equal(pillar.mesh.visible, false); // no invented early hit
// A stalled clock sustains the path; only the real strike releases its body and tail.
for (let i = 0; i < 60; i++) on.five.update(1 / 60);
assert.equal(ribbon.visible, true); assert.equal(halo.visible, false);
on.five.strike(target); pillar.update(0); travel.present(source);
const bodyData = pillar.mesh.geometry.getAttribute('iData');
assert.equal(pillar.mesh.visible, true); assert.equal(bodyData.getW(0), 1);
assert.equal(bodyData.getX(0), THUNDER_PILLAR_SIZE);
assert.equal(pillar.mesh.material.uniforms.uPivot.value.y, 0.2);
// An active video's authored frame is retained, and two old/new bodies never draw together.
video.spawn(target, 40, { life: 5, frame: 0, rate: 0 });
pillar.update(0.1); pillar.update(0); video.update(0); travel.present(source);
assert.equal(pillar.mesh.visible, false); assert.equal(video.mesh.visible, true);
assert.equal(video.mesh.geometry.getAttribute('iData').getZ(0), 0);
for (let tick = 1; tick <= 180; tick++) {
  on.five.update(1 / 60); off.five.update(1 / 60); base.five.update(1 / 60);
  pillar.update(1 / 60); video.update(1 / 60); travel.present(source);
  assert.ok(source.children.filter((m) => m.visible).length <= 1);
  if (tick >= Math.ceil(THUNDER_TRAVEL_TAIL_S * 60)) assert.equal(ribbon.visible, false);
  if (tick >= Math.ceil(THUNDER_PILLAR_TAIL_S * 60)) {
    assert.equal(travel.group.children.some((m) => m.visible), false);
    assert.equal(source.children.some((m) => m.visible), false);
  }
  const draws = [on.five.casterR2.group, travel.group].reduce((n, g) => n + g.children.filter((m) => m.visible).length, 0);
  assert.ok(draws <= 6 && draws <= 12);
  assert.equal(sparkle.geometry.instanceCount <= 16, true);
  // Flag-off remains byte-for-byte B8 on every frame.
  for (let m = 0; m < off.five.player.group.children.length; m++) {
    const a = off.five.player.group.children[m], b = base.five.player.group.children[m];
    assert.equal(a.visible, b.visible);
    for (const key of Object.keys(a.geometry.attributes)) assert.deepEqual(a.geometry.attributes[key].array, b.geometry.attributes[key].array);
  }
}
FlipbookPool.prototype.spawn = spawn;
assert.equal(options.size, 1); assert.equal(vectors.size, 1);
travel.group.children.forEach((m, i) => assert.equal(m.geometry.attributes, attrs[i]));
const code = readFileSync(new URL('../../src/lab/thunder-travel-r2.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('thunder-travel-r2.ts', code, ts.ScriptTarget.Latest, true);
const allocations = [];
function check(node) {
  if (ts.isNewExpression(node) || ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node) || ts.isArrowFunction(node)) allocations.push(node.getText(tree));
  ts.forEachChild(node, check);
}
function find(node) {
  if (ts.isMethodDeclaration(node) && ['cast', 'strike', 'update', 'segment', 'render', 'isPillar', 'present', 'clear'].includes(node.name.getText(tree))) check(node.body);
  else ts.forEachChild(node, find);
}
find(tree); assert.deepEqual(allocations, []);
const manifest = JSON.parse(readFileSync(new URL('../../art-src/lab/vfx/thunder/manifest.json', import.meta.url)));
const textureBytes = ['thunder-caster-seal', 'thunder-ring-burst'].reduce((n, id) => {
  const m = manifest.flipbooks[id]; return n + m.width * m.height * 4 * 4 / 3;
}, 0);
assert.ok(textureBytes <= 64_000_000);
console.log(`PASS: endpoints, shared textures, event-gated body/tails, video/atlas single body, flag-off buffers, allocation AST; <=6 extra draws; ${textureBytes} extra PNG+mipmap bytes.`);

// Real runner comparison: release, hit, damage and status traces stay identical for atlas and stalled video.
for (const videoMode of [false, true]) {
  function run(search) {
    const f = fixture(search), player = new FlipbookPlayer('/v/'), camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
    camera.position.set(0, 26, 14); camera.lookAt(0, 0, -6); camera.updateMatrixWorld(true);
    const show = new Showcase(player, { camera, nearest: () => 0, at: (_i, out) => out.copy(target),
      caster: (out) => out.copy(hand), light() {}, accent() {}, shake() {}, captionHost: null }, ULT_SHOWCASE);
    player.library('ult').add(meta('pillar-thunder-single'), new THREE.Texture());
    let now = 0, videoClock = -1;
    if (videoMode) {
      show.canVideo = () => true;
      show.play = (id) => { show.played = { time: () => videoClock }; return id; };
    }
    const trace = [];
    const casts = new ClipSkillRunner(show, { targets: f.five.host.targets, layer: f.parent, player, fivePhase: f.five,
      caster: (out) => out.copy(hand), release: () => trace.push(['release', now]), strike: () => trace.push(['strike', now]),
      blow: (skill) => { trace.push(['damage', now, skill.damage]); return false; },
      status: (_i, kind, seconds) => trace.push(['status', now, kind, seconds]) });
    casts.adoptMark('thunder', meta('thunder-ground-mark'), new THREE.Texture());
    casts.cast('pillar-thunder-single');
    for (let tick = 0; tick < 120; tick++) {
      now += 1 / 60; videoClock = tick < 45 ? -1 : 0;
      casts.update(1 / 60); player.update(1 / 60);
      if (videoMode && tick < 45) assert.equal(trace.some(([kind]) => kind === 'damage'), false);
    }
    assert.equal(trace.filter(([kind]) => kind === 'damage').length, 1);
    return { trace, report: casts.last };
  }
  assert.deepEqual(run('?tp2=1'), run('?tp2=0'));
}
console.log('PASS: unchanged real runner release/strike/damage/status clocks with atlas and stalled video.');

// Perspective sockets: the shader's strip endpoints project to the actual hand/sky endpoints, even after a camera move.
const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
camera.position.set(0, 26, 14); camera.lookAt(0, 0, -6); camera.updateMatrixWorld(true);
const projected = new ThunderTravelR2(new THREE.Group(), { hand: (out) => out.copy(hand), camera });
projected.adopt(meta('thunder-ribbon-loop'), new THREE.Texture()); projected.cast(target);
camera.position.x += 4; camera.lookAt(0, 0, -6); camera.updateMatrixWorld(true);
projected.present(new THREE.Group());
const strip = layer(projected.group, 'thunder-ribbon-loop');
for (const [i, from, to] of [[0, hand, new THREE.Vector3(1, 8, 3)], [1, new THREE.Vector3(1, 8, 3), new THREE.Vector3(2, 8, -6)]]) {
  const centre = new THREE.Vector3().fromBufferAttribute(strip.geometry.getAttribute('iPos'), i);
  const dir = new THREE.Vector3().fromBufferAttribute(strip.geometry.getAttribute('iDir'), i);
  for (const [sign, endpoint] of [[-0.5, from], [0.5, to]]) {
    const actual = centre.clone().addScaledVector(dir, sign).project(camera), expected = endpoint.clone().project(camera);
    assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-5);
  }
}
console.log('PASS: perspective strip endpoints remain on the sockets after camera movement.');
