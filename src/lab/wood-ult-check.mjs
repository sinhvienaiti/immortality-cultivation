/** Tickets 395/395b: focused type/material/layout/100-target CPU probe, not the game's build or suite. */
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import ts from '../../node_modules/typescript/lib/typescript.js';
import * as THREE from 'three';

const names = ['wood-ult-layered.ts', 'wood-ult-sprites.ts', 'wood-ult-roots3d.ts', 'wood-ult-tint.ts', 'wood-ult-sound.ts', 'skills-main.ts'];
const files = names.map(f => fileURLToPath(new URL(f, import.meta.url)));
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true, noUncheckedIndexedAccess: true, skipLibCheck: true, noEmit: true, types: ['vite/client'] };
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options));
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
const { WoodUltLayered } = await import('./wood-ult-layered.ts');
const { WOOD_LAYOUT, WOOD_CARD_LIMITS, WOOD_ROOTS } = await import('./wood-ult-sprites.ts');
const { woodUltSound } = await import('./wood-ult-sound.ts');
const scene = new THREE.Group(), actors = new THREE.Group(), fx = new THREE.Group(); scene.add(actors, fx);
const dead = new Set(), originals = [], meshes = [], samples = [];
const calls = { bind: [], blow: [], strike: [], sound: [], release: [] }; let now = 0, chained = 0;
for (let family = 0; family < 4; family++) {
  const geo = new THREE.BoxGeometry(); geo.setAttribute('iRim', new THREE.InstancedBufferAttribute(new Float32Array(75), 3));
  const mat = new THREE.MeshStandardMaterial({ color: 0x998877 }); mat.onBeforeCompile = () => { chained++; };
  mat.customProgramCacheKey = () => 'source-' + family;
  const mesh = new THREE.InstancedMesh(geo, mat, 25);
  for (let slot = 0; slot < 25; slot++) {
    const i = family * 25 + slot; mesh.setMatrixAt(slot, new THREE.Matrix4().makeTranslation((i % 10 - 4.5) * 2, 0, -Math.floor(i / 10) * 2));
  }
  actors.add(mesh); originals.push(mat); meshes.push(mesh);
}
const host = {
  targets: { group: actors, size: 100, alive: i => !dead.has(i), x: i => (i % 10 - 4.5) * 2, z: i => -Math.floor(i / 10) * 2,
    midY: i => i % 7 === 0 ? 2 : 0.7, radius: i => i % 7 === 0 ? 1.3 : 0.4 },
  caster: p => p.set(0, 0, 6), hand: p => p.set(0, 1.4, 6),
  release: (_p, firstS) => calls.release.push({ at: now, firstS }),
  bind: (i, seconds) => calls.bind.push({ i, seconds, at: now }),
  blow: (i, dx, dz, power, role) => { calls.blow.push({ i, power, role, at: now }); return false; },
  strike: (_p, role) => calls.strike.push(role), sound: (event, _p, pitch) => calls.sound.push({ event, at: now, pitch }),
};
const wood = new WoodUltLayered(fx, '/art-src/lab/vfx/', host);
wood.prepare = () => {}; // CPU-only: no texture/GPU readiness claim.
const r = wood.cast();
const advance = end => { while (now < end) { now += 1 / 60; const start = performance.now(); wood.update(1 / 60); samples.push(performance.now() - start); } };
advance(2.2);
assert.equal(calls.bind.length, 100); assert.equal(r.tintedFoes, 100); assert.equal(r.activeTints, 100);
assert.equal(r.assetsReady, false); assert.equal(r.meshDraws, 10); assert.equal(r.bindDraws, 2); assert.equal(r.clusters, 180);
assert.equal(r.truncatedBinds, 0); assert.equal(calls.release.length, 1); assert.ok(Math.abs(calls.release[0].at - 0.6) < 1 / 60 + 1e-8);
const root = scene.getObjectByName('fx-wood-ult-roots-and-sprout'), vine = scene.getObjectByName('fx-wood-ult-foot-vines');
const particles = scene.getObjectByName('fx-wood-ult-leaves-spores-chips-dust');
const submitted = { roots: root.geometry.instanceCount, vines: vine.geometry.instanceCount, particles: particles.geometry.instanceCount, ground: 1 };
assert.deepEqual(submitted, { roots: 190, vines: 130, particles: 3112, ground: 1 });
const C = wood.field.centre, R = wood.field.radius;
assert.ok(Math.abs(C.x) < 1e-6 && Math.abs(C.y + 9) < 1e-6, 'Ring centres on the foes');
assert.ok(R >= WOOD_LAYOUT.minRadius && R <= WOOD_LAYOUT.maxRadius);
assert.ok(wood.field.clusters.every(c => c.at >= 0.6 && c.at <= 0.8 && Math.hypot(c.x - C.x, c.z - C.y) <= R + 1));
// 3D roots (owner 16/11): claws on the two upright rows, arches on the floor band, none on the caster.
const solid = wood.field.roots3d.placements;
assert.ok(solid.filter(p => p.variant < 4).length >= 80 && solid.filter(p => p.variant >= 4).length >= 40);
assert.ok(solid.every(p => p.birth >= 0.6 && p.birth <= 0.8 && p.scale > 0.3 && Math.hypot(p.x, p.z - 6) > 2.4));
assert.ok(solid.every(p => Math.abs(Math.hypot(p.x - C.x, p.z - C.y) - R) < 2.5), 'Roots stay on the ring');
const walls = wood.field.clusters.filter(c => c.role === 'wall'), branches = wood.field.clusters.filter(c => c.role === 'branch');
assert.equal(walls.length, 144); assert.equal(branches.length, 36);
const row = WOOD_LAYOUT.perimeter / 3;
for (let i = 0; i < walls.length; i++) {
  const c = walls[i], next = walls[Math.floor(i / row) * row + (i + 1) % row];
  if (i < row) assert.ok(Math.hypot(c.x - next.x, c.z - next.z) < Math.min(c.height, next.height) * 0.5, 'Gap in ring band');
  else assert.ok(Math.hypot(c.x - next.x, c.z - next.z) < Math.min(c.width, next.width), 'Gap in claw row');
}
const rg = root.geometry, anchors = rg.getAttribute('iAnchor'), clocks = rg.getAttribute('iClock');
for (let i = WOOD_LAYOUT.perimeter; i < WOOD_ROOTS; i++) {
  assert.equal(clocks.getZ(i), 10); assert.ok(anchors.getY(i) < 0.1);
  const roll = rg.getAttribute('iStyle').getZ(i), c = wood.field.clusters[i];
  const radial = new THREE.Vector2(c.x - C.x, c.z - C.y).normalize();
  assert.ok(new THREE.Vector2(Math.sin(roll), Math.cos(roll)).dot(radial) > 0.95, 'Branch points away from the wall');
}
assert.ok(Math.abs(anchors.getX(WOOD_ROOTS) - C.x) < 1e-5 && Math.abs(anchors.getZ(WOOD_ROOTS) - C.y) < 1e-5);
for (let i = WOOD_ROOTS + 1; i < WOOD_ROOTS + 4; i++) {
  assert.equal(clocks.getZ(i), 1); assert.ok(rg.getAttribute('iSize').getY(i) >= 1.6);
  assert.ok(Math.abs(anchors.getZ(i) - C.y) < 1e-5);
}
assert.ok(Math.abs([1, 2, 3].reduce((sum, k) => sum + anchors.getX(WOOD_ROOTS + k), 0) - 3 * C.x) < 1e-5);
// Project the body volume in both requested views, with portrait and landscape cameras.
let protectedViews = 0;
for (const aspect of [16 / 9, 4 / 3, 9 / 16]) for (const behind of [false, true]) {
  const camera = new THREE.PerspectiveCamera(behind ? 50 : 28, aspect, 0.1, 1000);
  camera.position.set(0, behind ? 2.2 : 60, behind ? 13 : 55);
  camera.lookAt(0, behind ? 1.1 : 0, behind ? -16 : -8); camera.updateMatrixWorld(true);
  for (const at of [new THREE.Vector3(0, 0, 6), new THREE.Vector3(4, 0, -5)]) {
    wood.field.protectCaster(at); root.onBeforeRender(null, scene, camera, rg, root.material, null);
    const box = root.material.uniforms.uCasterBox.value;
    for (const dx of [-0.8, 0.8]) for (const y of [0.02, 1.75, 2.2]) for (const dz of [-0.8, 0.8]) {
      const p = new THREE.Vector3(at.x + dx, y, at.z + dz).project(camera);
      assert.ok(p.x * 0.5 + 0.5 >= box.x && p.x * 0.5 + 0.5 <= box.z);
      assert.ok(p.y * 0.5 + 0.5 >= box.y && p.y * 0.5 + 0.5 <= box.w);
    }
    protectedViews++;
  }
}
wood.field.protectCaster(new THREE.Vector3(0, 0, 6));
// Independent corner projection checks the conservative size bound used by the shader.
let projectedCards = 0, maxProjectedArea = 0;
for (const aspect of [16 / 9, 9 / 16]) for (const distance of [0.15, 1, 7, 30, 90]) for (const upright of [false, true]) {
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
  camera.position.set(0, 2.2, distance); camera.lookAt(0, 1.1, -22); camera.updateMatrixWorld(true);
  const pv = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  for (const x of [-8, 0, 8]) for (const roll of [-1.25, 0, 0.65]) {
    const at = new THREE.Vector3(x, 2.2, 0), base = new THREE.Vector4(...at.toArray(), 1).applyMatrix4(pv);
    if (base.w <= 0.1) continue;
    const right = upright ? new THREE.Vector3(camera.position.z, 0, x).normalize() : new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = upright ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const deltas = [];
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) {
      const px = sx * (upright ? 20 : 4.8), py = (sy + (upright ? 0.5 : 0)) * (upright ? 14 : 4.8);
      const lx = Math.cos(roll) * px + Math.sin(roll) * py, ly = -Math.sin(roll) * px + Math.cos(roll) * py;
      const world = right.clone().multiplyScalar(lx).addScaledVector(up, ly);
      deltas.push(new THREE.Vector4(...world.toArray(), 0).applyMatrix4(pv));
    }
    const near = Math.max(0.001, base.w + Math.min(0, ...deltas.map(d => d.w)));
    const bx = Math.max(...deltas.map(d => Math.abs(d.x - base.x / base.w * d.w))) / near;
    const by = Math.max(...deltas.map(d => Math.abs(d.y - base.y / base.w * d.w))) / near;
    const side = upright ? WOOD_CARD_LIMITS.rootSide : WOOD_CARD_LIMITS.leafSide;
    const k = Math.min(1, side / Math.max(0.0001, bx, by), Math.sqrt(WOOD_CARD_LIMITS.area / Math.max(0.0001, bx * by)));
    const points = deltas.map(d => d.clone().multiplyScalar(k).add(base));
    assert.ok(points.every(p => p.w > 0));
    const nx = points.map(p => p.x / p.w), ny = points.map(p => p.y / p.w);
    const width = (Math.max(...nx) - Math.min(...nx)) / 2, height = (Math.max(...ny) - Math.min(...ny)) / 2;
    assert.ok(width <= side + 1e-8 && height <= side + 1e-8);
    assert.ok(width * height <= WOOD_CARD_LIMITS.area + 1e-8);
    maxProjectedArea = Math.max(maxProjectedArea, width * height); projectedCards++;
  }
}
assert.equal(vine.material.depthWrite, false);
const ig = particles.geometry, per = 20, firstFoe = 180 * 6 + 32;
for (let slot = 0; slot < 100; slot++) {
  assert.equal(vine.geometry.getAttribute('iClock').getZ(slot), 2); // Flat ground card only.
  assert.equal(vine.geometry.getAttribute('iAnchor').getY(slot), Math.fround(0.065));
  for (let j = 0; j < 8; j++) {
    const index = firstFoe + slot * per + j;
    assert.ok(ig.getAttribute('iMove').getX(index) > host.targets.radius(slot) + ig.getAttribute('iSize').getY(index) / 2);
    assert.ok(ig.getAttribute('iStyle').getW(index) <= 0.4 + 1e-7);
  }
  for (let j = 8; j < 20; j++) {
    const index = firstFoe + slot * per + j;
    const bound = calls.bind.find(f => f.i === slot);
    assert.ok(Math.abs(ig.getAttribute('iClock').getX(index) - bound.at - 3) <= 1 / 60 + 1e-6);
  }
}
for (let family = 0; family < 4; family++) {
  const clone = meshes[family].material;
  assert.notEqual(clone, originals[family]); assert.equal(clone.opacity, originals[family].opacity); assert.equal(clone.transparent, originals[family].transparent);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  clone.onBeforeCompile(shader, {});
  assert.ok(shader.vertexShader.includes('vWoodBind =')); assert.ok(shader.fragmentShader.includes('vec3 woodBody'));
  assert.equal(clone.customProgramCacheKey(), 'source-' + family + '-wood-bind-395');
}
assert.equal(chained, 4);
dead.add(0); advance(now + 1 / 60);
assert.equal(vine.geometry.getAttribute('iClock').getX(0), 1e6);
for (let j = 0; j < 20; j++) assert.equal(ig.getAttribute('iClock').getX(firstFoe + j), 1e6);
assert.equal(meshes[0].geometry.getAttribute('iWoodBindClock').getY(0), 0);
advance(10);
assert.equal(calls.blow.length, 99); assert.equal(new Set(calls.blow.map(b => b.i)).size, 99); assert.deepEqual(calls.strike, ['primary']);
assert.equal(r.cancelled, 1); assert.equal(wood.active, false); assert.equal(r.activeTints, 0);
for (const hit of calls.blow) {
  const bound = calls.bind.find(b => b.i === hit.i);
  assert.equal(bound.seconds, 3); assert.equal(hit.power, 1); assert.ok(Math.abs(hit.at - bound.at - 3) < 1 / 60 + 1e-8);
}
assert.ok(calls.sound.every(s => s.pitch >= 0.96 && s.pitch <= 1.04));
for (const event of ['gather', 'grow', 'crack', 'break', 'tail']) assert.ok(calls.sound.some(s => s.event === event));
for (const event of ['grow', 'break']) {
  const rows = calls.sound.filter(s => s.event === event);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].at - rows[i - 1].at >= 0.24 - 1e-8);
}
for (let k = 0; k < 5; k++) { wood.cast(); wood.update(2); wood.clear(); }
for (const cards of [root, vine, particles]) assert.equal(cards.geometry.instanceCount, 0);
for (const [i, mesh] of meshes.entries()) {
  assert.equal(originals[i].color.getHex(), 0x998877);
  const a = mesh.geometry.getAttribute('iWoodBindClock');
  for (let j = 0; j < a.count; j++) assert.equal(a.getY(j), 0);
}
// Empty cast and an over-cap cast still end cleanly; the cap affects art, never holds or damage.
const extra = new WoodUltLayered(new THREE.Group(), '/', { ...host, targets: { ...host.targets, group: undefined, size: 140, x: i => (i % 10) * 0.5, z: i => -Math.floor(i / 10) * 0.5 } });
extra.prepare = () => {}; const over = extra.cast(); extra.update(2); assert.equal(over.truncatedBinds, 11); extra.clear();
const empty = new WoodUltLayered(new THREE.Group(), '/', { ...host, targets: { ...host.targets, size: 0 } });
empty.prepare = () => {}; const er = empty.cast(); empty.update(10); assert.equal(er.bound, 0); assert.equal(empty.active, false);
// Existing bus adapter: preload actual files, bounded variation, and no second AudioContext.
const audioCalls = [], registered = [];
const adapter = woodUltSound({ registerTakes: t => registered.push(...t), playTake: (t, o) => audioCalls.push({ t, o }) });
for (const event of ['gather', 'grow', 'crack', 'break', 'tail']) for (let k = 0; k < 4; k++) adapter(event, new THREE.Vector3(4, 0, 0), 1);
for (const take of registered) {
  assert.ok(existsSync(new URL('../../art-src/lab/firefly-sprint-2026-11-05/sound/' + take.file, import.meta.url)));
  assert.ok(Number.isFinite(take.gain) && take.gain > 0);
}
assert.ok(audioCalls.every(c => c.o.bus === 'world' && c.o.group && c.o.send > 0));
const art = new URL('../../art-src/lab/vfx/wood-ult/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', art), 'utf8'));
assert.equal(manifest.sprites.length, 10);
for (const s of manifest.sprites) { assert.ok(existsSync(new URL(s.file, art))); assert.ok(existsSync(new URL(s.name + '.prompt.txt', art))); }
const integration = readFileSync(new URL('skills-main.ts', import.meta.url), 'utf8');
assert.ok(integration.includes('row.id === ICE_ULT_ID ? [row, ...woodRows]'));
assert.ok(integration.includes('e.key === "u" || e.key === "U"'));
assert.ok(integration.includes('animR1 = installAnimR1(caster'));
const ordered = samples.toSorted((a, b) => a - b);
console.log(JSON.stringify({ result: 'PASS', typeDiagnostics: 0, targets: 100, bound: r.bound, tintedAtHold: 100, blows: r.broken,
  cancelled: r.cancelled, holdSeconds: 3, meshDraws: 4, bindDraws: 2, submittedAt100: submitted,
  soundEvents: r.soundEvents, registeredSoundFiles: registered.length, cpuProbeP95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1],
  layout: { perimeter: walls.length, interior: branches.length, wallHeightM: [Math.min(...walls.map(c => c.height)), Math.max(...walls.map(c => c.height))] },
  projectionMath: { protectedViews, projectedCards, maxProjectedArea, limits: WOOD_CARD_LIMITS },
  note: 'CPU recipe update only; not full-frame CPU or GPU. PNG upload, GLSL and rendered appearance unverified.', rendererVerified: false }, null, 2));
