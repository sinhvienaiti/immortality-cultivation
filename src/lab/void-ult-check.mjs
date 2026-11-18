/** Tickets 408/427: focused strict types, actual GLB geometry and 100-target CPU/lifecycle checks. */
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import ts from '../../node_modules/typescript/lib/typescript.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const files = ['void-ult-layered.ts', 'void-ult-sprites.ts', 'void-ult-tint.ts', 'void-ult-sound.ts', 'skills-main.ts'].map(f => fileURLToPath(new URL(f, import.meta.url)));
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
const { VoidUltLayered } = await import('./void-ult-layered.ts');
const { VoidSpriteField, VOID_CLUSTERS, VOID_PERIMETER } = await import('./void-ult-sprites.ts');
const { VoidCrystals3D, VOID_CRYSTAL_CAPACITY, VOID_CRYSTAL_CLEARANCE, VOID_CRYSTAL_TIMING } = await import('./void-ult-3d.ts');
const { voidUltSound } = await import('./void-ult-sound.ts');
// Parse the actual GLB buffers with GLTFLoader. Only image upload is substituted in this browserless probe.
const glb = readFileSync(new URL('../../art-src/lab/vfx/void-ult/models3d/tripo/ult-void-clean.tripo.v1.glb', import.meta.url));
assert.equal(glb.readUInt32LE(0), 0x46546c67); assert.equal(glb.readUInt32LE(4), 2); assert.equal(glb.readUInt32LE(8), glb.length);
const imageMetadata = new Map(), sourceTextures = [], sourceDisposed = [];
let loads = 0;
const actualLoad = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function (url) {
  assert.ok(url.endsWith('/void-ult/models3d/tripo/ult-void-clean.tripo.v1.glb')); loads++;
  const loader = new GLTFLoader().register(parser => ({
    name: 'ticket427-cpu-images',
    async loadTexture(index) {
      const image = parser.json.images[parser.json.textures[index].source];
      const data = await parser.getDependency('bufferView', image.bufferView);
      if (!imageMetadata.has(image.name)) {
        const dimensions = execFileSync(process.env.ART_MAGICK || '/opt/homebrew/bin/magick', ['identify', '-format', '%m %w %h', '-'], { input: Buffer.from(data) }).toString().trim();
        imageMetadata.set(image.name, { mime: image.mimeType, bytes: data.byteLength, dimensions });
      }
      const texture = new THREE.Texture(); texture.name = image.name;
      texture.addEventListener('dispose', () => sourceDisposed.push(texture)); sourceTextures.push(texture);
      return texture;
    },
  }));
  return loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
};
const scene = new THREE.Group(), actors = new THREE.Group(), fx = new THREE.Group(); scene.add(actors, fx);
const dead = new Set(), originals = [], meshes = [], samples = [];
const calls = { bind: [], blow: [], strike: [], sound: [], release: [] }; let now = 0, chained = 0;
for (let family = 0; family < 4; family++) {
  const geo = new THREE.BoxGeometry(); geo.setAttribute('iRim', new THREE.InstancedBufferAttribute(new Float32Array(75), 3));
  const material = new THREE.MeshStandardMaterial({ color: 0x998877 }); material.onBeforeCompile = () => { chained++; };
  material.customProgramCacheKey = () => 'source-' + family;
  const mesh = new THREE.InstancedMesh(geo, material, 25);
  for (let slot = 0; slot < 25; slot++) {
    const i = family * 25 + slot; mesh.setMatrixAt(slot, new THREE.Matrix4().makeTranslation((i % 10 - 4.5) * 2, 0, -Math.floor(i / 10) * 2));
  }
  actors.add(mesh); originals.push(material); meshes.push(mesh);
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
const effect = new VoidUltLayered(fx, '/art-src/lab/vfx/', host);
await effect.field.crystals3d.prepare('/art-src/lab/vfx/');
assert.equal(effect.field.crystals3d.ready, true); assert.equal(effect.field.crystals3d.triangles, 5930);
assert.equal(imageMetadata.size, 3); assert.equal(sourceTextures.length, 3); assert.equal(sourceDisposed.length, 2);
effect.prepare = () => {}; // CPU only; no PNG upload or GLSL compilation claim.
const planStart = performance.now(), r = effect.cast(), planMs = performance.now() - planStart;
const advance = end => { while (now < end) { now += 1 / 60; const start = performance.now(); effect.update(1 / 60); samples.push(performance.now() - start); } };
advance(2.2);
assert.equal(calls.bind.length, 100); assert.equal(r.tintedFoes, 100); assert.equal(r.activeTints, 100);
assert.equal(r.assetsReady, false); assert.equal(r.meshDraws, 5); assert.equal(r.bindDraws, 3); assert.equal(r.clusters, 252);
assert.equal(r.truncatedBinds, 0); assert.equal(calls.release.length, 1); assert.ok(Math.abs(calls.release[0].at - 0.6) < 1 / 60 + 1e-8);
const forest = scene.getObjectByName('fx-void-ult-rifts-glass-and-core'), ground = scene.getObjectByName('fx-void-ult-ground-and-foot-rings');
const debris = scene.getObjectByName('fx-void-ult-shards-and-fragments'), radiance = scene.getObjectByName('fx-void-ult-inward-motes');
const cards = [forest, ground, debris, radiance];
const crystals = scene.getObjectByName('fx-void-ult-crystal3d-tripo');
assert.equal(crystals, effect.field.crystals3d.meshes[0]); assert.ok(crystals.isInstancedMesh);
assert.equal(crystals.instanceMatrix.count, VOID_CRYSTAL_CAPACITY); assert.equal(crystals.count, 192);
assert.equal(r.crystalInstances, 192); assert.equal(r.crystalTriangles, 192 * 5930);
const crystalCount = crystals.count, fxMeshes = [];
fx.traverse(o => { if (o.isMesh) fxMeshes.push(o); });
assert.equal(fxMeshes.length, 5); assert.equal(effect.field.crystals3d.meshes.length, 1);
assert.equal(crystals.material.side, THREE.FrontSide); assert.equal(crystals.material.transparent, true);
assert.equal(crystals.material.depthWrite, false); assert.equal(crystals.material.toneMapped, false);
assert.ok(crystals.material.fragmentShader.includes('min(color, vec3(0.9))'));
assert.ok(crystals.material.fragmentShader.includes('uCasterBox')); assert.ok(crystals.material.fragmentShader.includes('vxTagKeep()'));
assert.equal(VOID_CRYSTAL_TIMING.breakAfter, 3.2); assert.equal(VOID_CRYSTAL_TIMING.dissolve, 2.5);
const originalBuffers = [crystals.geometry, crystals.material, crystals.instanceMatrix.array, crystals.geometry.getAttribute('iCrystal').array];
const submitted = cards.map(c => ({ name: c.name, instances: c.geometry.instanceCount }));
assert.deepEqual(submitted.map(c => c.instances), [121, 194, 1504, 1588]);
const peakEffectTriangles = crystals.count * 5930 + submitted.reduce((n, c) => n + c.instances * 2, 0);
assert.equal(scene.getObjectByName('fx-void-ult-shells'), undefined);
assert.deepEqual(r.fieldCenter, [0, -9]); assert.ok(r.fieldRadiusM >= 7 && r.fieldRadiusM <= 14);
assert.ok(radiance.material.vertexShader.includes('anchor = uFocus + offset * (1.0 - q)'));
assert.ok(forest.material.fragmentShader.includes('min(art.rgb * vec3(0.98, 0.94, 1.04), vec3(0.9))'));
assert.deepEqual(r.bindInstancesPerFoe, { ring: 1, shards: 4, fragments: 6, sparks: 8 });
for (let i = 0; i < VOID_PERIMETER; i++) {
  const c = effect.field.clusters[i], next = effect.field.clusters[Math.floor(i / 64) * 64 + (i + 1) % 64];
  assert.ok(Math.hypot(c.x - next.x, c.z - next.z) < Math.min(c.width, next.width), 'Perimeter must overlap');
  const d = Math.hypot(c.x, c.z - 6); assert.ok(d <= 30);
  assert.ok(Math.abs(c.at - 0.6 - d / 26) < 1e-8);
  assert.ok(d - effect.field.crystals3d.footprintRadius * c.height >= VOID_CRYSTAL_CLEARANCE);
  const m = new THREE.Matrix4(); crystals.getMatrixAt(i, m);
  assert.ok(Math.abs(m.elements[12] - c.x) < 1e-5 && Math.abs(m.elements[14] - c.z) < 1e-5);
  assert.ok(Math.abs(crystals.geometry.getAttribute('iCrystal').getX(i) - c.at) < 1e-6);
}
for (let i = 0; i < VOID_CLUSTERS - VOID_PERIMETER; i++) {
  const c = effect.field.clusters[VOID_PERIMETER + i], g = forest.geometry;
  assert.equal(g.getAttribute('iClock').getZ(i * 2), 0); assert.equal(g.getAttribute('iClock').getZ(i * 2 + 1), 11);
  assert.ok(Math.abs(g.getAttribute('iAnchor').getX(i * 2) - c.x) < 1e-5);
}
assert.equal(forest.geometry.getAttribute('iClock').getZ((VOID_CLUSTERS - VOID_PERIMETER) * 2), 1);
assert.equal(Array.from({ length: forest.geometry.instanceCount }, (_, i) => forest.geometry.getAttribute('iClock').getZ(i)).filter(m => m === 1).length, 1);
const dg = debris.geometry, firstFoe = VOID_CLUSTERS * 2;
for (let slot = 0; slot < 100; slot++) {
  assert.equal(ground.geometry.getAttribute('iClock').getZ(64 + slot), 2);
  assert.ok(ground.geometry.getAttribute('iAnchor').getY(64 + slot) < 0.1);
  for (let j = 0; j < 4; j++) {
    const index = firstFoe + slot * 10 + j;
    assert.equal(dg.getAttribute('iClock').getZ(index), 3);
    assert.ok(dg.getAttribute('iMove').getX(index) > host.targets.radius(slot) + dg.getAttribute('iSize').getY(index) / 2);
    assert.ok(dg.getAttribute('iStyle').getW(index) < 0.5);
  }
  for (let j = 4; j < 10; j++) {
    const index = firstFoe + slot * 10 + j, bound = calls.bind.find(f => f.i === slot);
    assert.equal(dg.getAttribute('iClock').getZ(index), 5);
    assert.ok(Math.abs(dg.getAttribute('iClock').getX(index) - bound.at - 3) < 1 / 60 + 1e-6);
  }
}
let protectedViews = 0;
for (const aspect of [16 / 9, 9 / 16]) for (const behind of [false, true]) {
  const camera = new THREE.PerspectiveCamera(behind ? 50 : 28, aspect, 0.1, 1000);
  camera.position.set(0, behind ? 2.2 : 60, behind ? 13 : 55); camera.lookAt(0, behind ? 1.1 : 0, behind ? -16 : -8); camera.updateMatrixWorld(true);
  for (const at of [new THREE.Vector3(0, 0, 6), new THREE.Vector3(4, 0, -5)]) {
    effect.field.protectCaster(at); forest.onBeforeRender(null, scene, camera, forest.geometry, forest.material, null);
    const b = forest.material.uniforms.uCasterBox.value;
    for (const dx of [-0.8, 0.8]) for (const y of [0.02, 1.75, 2.2]) for (const dz of [-0.8, 0.8]) {
      const p = new THREE.Vector3(at.x + dx, y, at.z + dz).project(camera);
      assert.ok(p.x * 0.5 + 0.5 >= b.x && p.x * 0.5 + 0.5 <= b.z);
      assert.ok(p.y * 0.5 + 0.5 >= b.y && p.y * 0.5 + 0.5 <= b.w);
    }
    protectedViews++;
  }
}
// Independent corner projection checks the conservative bound, including floor cards and near cameras.
let projectedCards = 0, maxProjectedArea = 0;
for (const aspect of [16 / 9, 9 / 16]) for (const distance of [0.15, 1, 7, 30, 90]) for (const mode of ['upright', 'crossed', 'floor', 'camera']) {
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
  camera.position.set(0, 2.2, distance); camera.lookAt(0, 1.1, -22); camera.updateMatrixWorld(true);
  const pv = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  for (const x of [-8, 0, 8]) for (const roll of [-1.25, 0, 0.65]) {
    const at = new THREE.Vector3(x, 0.075, 0), base = new THREE.Vector4(...at.toArray(), 1).applyMatrix4(pv);
    if (base.w <= 0.1) continue;
    const right = mode === 'floor' ? new THREE.Vector3(1, 0, 0) : (mode === 'upright' || mode === 'crossed') ? new THREE.Vector3(camera.position.z, 0, x).normalize() : new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = mode === 'floor' ? new THREE.Vector3(0, 0, 1) : (mode === 'upright' || mode === 'crossed') ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    if (mode === 'crossed') right.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 3);
    const deltas = [];
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) {
      const px = sx * 8.5, py = (sy + ((mode === 'upright' || mode === 'crossed') ? 0.5 : 0)) * 8.5;
      const lx = Math.cos(roll) * px + Math.sin(roll) * py, ly = -Math.sin(roll) * px + Math.cos(roll) * py;
      const world = right.clone().multiplyScalar(lx).addScaledVector(up, ly);
      deltas.push(new THREE.Vector4(...world.toArray(), 0).applyMatrix4(pv));
    }
    const near = Math.max(0.001, base.w + Math.min(0, ...deltas.map(d => d.w)));
    const bx = Math.max(...deltas.map(d => Math.abs(d.x - base.x / base.w * d.w))) / near;
    const by = Math.max(...deltas.map(d => Math.abs(d.y - base.y / base.w * d.w))) / near;
    const k = Math.min(1, 0.48 / Math.max(0.0001, bx, by), Math.sqrt(0.14 / Math.max(0.0001, bx * by)));
    const points = deltas.map(d => d.clone().multiplyScalar(k).add(base)); assert.ok(points.every(p => p.w > 0));
    const nx = points.map(p => p.x / p.w), ny = points.map(p => p.y / p.w);
    const width = (Math.max(...nx) - Math.min(...nx)) / 2, height = (Math.max(...ny) - Math.min(...ny)) / 2;
    assert.ok(width * height <= 0.14 + 1e-8); maxProjectedArea = Math.max(maxProjectedArea, width * height); projectedCards++;
  }
}
for (let family = 0; family < 4; family++) {
  const clone = meshes[family].material;
  assert.notEqual(clone, originals[family]); assert.equal(clone.opacity, originals[family].opacity); assert.equal(clone.transparent, originals[family].transparent);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  clone.onBeforeCompile(shader, {}); assert.ok(shader.vertexShader.includes('vVoidBind =')); assert.ok(shader.fragmentShader.includes('vec3 voidBody'));
  assert.equal(clone.customProgramCacheKey(), 'source-' + family + '-void-bind-408');
}
assert.equal(chained, 4);
dead.add(0); advance(now + 1 / 60);
assert.equal(ground.geometry.getAttribute('iClock').getX(64), 1e6);
for (let j = 0; j < 10; j++) assert.equal(dg.getAttribute('iClock').getX(firstFoe + j), 1e6);
assert.equal(meshes[0].geometry.getAttribute('iVoidBindClock').getY(0), 0);
advance(10);
assert.equal(calls.blow.length, 99); assert.equal(new Set(calls.blow.map(b => b.i)).size, 99); assert.deepEqual(calls.strike, ['primary']);
assert.equal(r.cancelled, 1); assert.equal(effect.active, false); assert.equal(r.activeTints, 0);
for (const hit of calls.blow) {
  const bound = calls.bind.find(b => b.i === hit.i); assert.equal(bound.seconds, 3); assert.equal(hit.power, 1);
  assert.ok(Math.abs(hit.at - bound.at - 3) < 1 / 60 + 1e-8);
}
assert.equal(r.soundEvents.break, 1); assert.equal(r.soundEvents.grow, 1);
assert.ok(calls.sound.every(s => s.pitch >= 0.96 && s.pitch <= 1.04));
for (const event of ['gather', 'grow', 'crack', 'break', 'tail']) assert.ok(calls.sound.some(s => s.event === event));
let earlyDisposals = 0;
for (const resource of [crystals.geometry, crystals.material, crystals]) resource.addEventListener('dispose', () => earlyDisposals++);
for (let k = 0; k < 5; k++) {
  effect.cast(); effect.update(2);
  assert.equal(crystals.count, crystalCount); assert.equal(crystals.material.uniforms.uTime.value, 2);
  assert.deepEqual([crystals.geometry, crystals.material, crystals.instanceMatrix.array, crystals.geometry.getAttribute('iCrystal').array], originalBuffers);
  const after = []; fx.traverse(o => { if (o.isMesh) after.push(o); }); assert.deepEqual(after, fxMeshes);
  effect.clear(); assert.equal(crystals.count, 0); assert.equal(effect.field.crystals3d.placements.length, 0);
}
assert.equal(earlyDisposals, 0); assert.equal(loads, 1);
for (const c of cards) assert.equal(c.geometry.instanceCount, 0);
for (const [i, mesh] of meshes.entries()) {
  assert.equal(originals[i].color.getHex(), 0x998877);
  const a = mesh.geometry.getAttribute('iVoidBindClock'); for (let j = 0; j < a.count; j++) assert.equal(a.getY(j), 0);
}
const extra = new VoidUltLayered(new THREE.Group(), '/', { ...host, targets: { ...host.targets, group: undefined, size: 140, x: i => (i % 10) * 0.5, z: i => -Math.floor(i / 10) * 0.5 } });
extra.prepare = () => {}; const over = extra.cast(); extra.update(2); assert.equal(over.truncatedBinds, 11); extra.clear();
const empty = new VoidUltLayered(new THREE.Group(), '/', { ...host, targets: { ...host.targets, size: 0 } });
empty.prepare = () => {}; const er = empty.cast(); empty.update(10); assert.equal(er.bound, 0); assert.equal(empty.active, false);
dead.clear(); now = 0;
const shatterDeath = new VoidUltLayered(new THREE.Group(), '/', host); shatterDeath.prepare = () => {};
const sd = shatterDeath.cast();
while (now < sd.firstBreakAt + 0.08) { now += 1 / 60; shatterDeath.update(1 / 60); }
const firstHit = calls.blow.at(-1).i; dead.add(firstHit); now += 1 / 60; shatterDeath.update(1 / 60);
assert.equal(shatterDeath.field.activeTints, sd.bound - sd.broken);
shatterDeath.clear(); dead.clear();
const registered = [], audioCalls = [];
const adapter = voidUltSound({ registerTakes: t => registered.push(...t), playTake: (t, o) => audioCalls.push({ t, o }) });
for (const event of ['gather', 'grow', 'crack', 'break', 'tail']) for (let k = 0; k < 4; k++) adapter(event, new THREE.Vector3(4, 0, 0), 1);
for (const take of registered) { assert.ok(existsSync(new URL('../../art-src/lab/firefly-sprint-2026-11-05/sound/' + take.file, import.meta.url))); assert.ok(Number.isFinite(take.gain) && take.gain > 0); }
assert.ok(audioCalls.every(c => c.o.bus === 'world' && c.o.group && c.o.send > 0));
const art = new URL('../../art-src/lab/vfx/void-ult/', import.meta.url), manifest = JSON.parse(readFileSync(new URL('manifest.json', art), 'utf8'));
assert.equal(manifest.sprites.length, 13);
for (const s of manifest.sprites) { assert.ok(existsSync(new URL(s.file, art))); assert.ok(existsSync(new URL(s.name + '.prompt.txt', art))); }
const integration = readFileSync(new URL('skills-main.ts', import.meta.url), 'utf8');
assert.ok(integration.includes('row.id === ICE_ULT_ID ? [row, ...voidRows]')); assert.ok(integration.includes('pick === VOID_ULT_ID')); assert.ok(integration.includes('voidUlt.update(world)'));
assert.ok(integration.includes('if (!voidUlt.layered) return castClip8(pick)')); assert.ok(integration.includes('params.get("ultVoid") !== "video"'));
const ordered = samples.toSorted((a, b) => a - b);
// Exclude the whole model footprint for close casters, including when plan/clear races initial loading.
const lateParent = new THREE.Group(), late = new VoidCrystals3D(lateParent), near = new THREE.Vector3();
const nearList = [{ x: 0, z: 0, at: 0.6, height: 2 }, { x: 2.1, z: 0, at: 0.6, height: 2 }, { x: 4, z: 0, at: 0.7, height: 2 }];
late.plan(nearList, near); const pending = late.prepare('/art-src/lab/vfx/'); late.clear(); await pending;
assert.equal(late.meshes[0].count, 0); late.plan(nearList, near);
assert.equal(late.meshes[0].count, 1); assert.equal(late.placements[0].x, 4);
let disposalCount = 0;
for (const resource of [late.meshes[0], late.meshes[0].geometry, late.meshes[0].material, late.meshes[0].material.uniforms.uMap.value]) {
  resource.addEventListener('dispose', () => disposalCount++);
}
late.dispose(); assert.equal(disposalCount, 4); assert.equal(lateParent.children.length, 0);
const disposedPending = new VoidCrystals3D(new THREE.Group());
const pendingDispose = disposedPending.prepare('/art-src/lab/vfx/'); disposedPending.dispose(); await pendingDispose;
assert.equal(disposedPending.meshes.length, 0); assert.equal(disposedPending.ready, false);
// The field's ready gate waits for both assets; a late completion must preserve a cleared cast.
const loadedField = new VoidSpriteField(new THREE.Group()), actualAtlasLoad = THREE.TextureLoader.prototype.loadAsync;
const uploads = [];
THREE.TextureLoader.prototype.loadAsync = async url => { assert.ok(url.endsWith('/void-ult/void-ult.atlas.png')); return new THREE.Texture(); };
loadedField.plan(new THREE.Vector3(0, 0, 6), new THREE.Vector3(0, 1.4, 6), [], { ...host.targets, size: 0 });
const fieldLoad = loadedField.prepare('/art-src/lab/vfx/', t => uploads.push(t));
assert.equal(loadedField.ready, false); assert.equal(loadedField.prepare('/art-src/lab/vfx/'), fieldLoad);
loadedField.clear(); await fieldLoad;
assert.equal(loadedField.ready, true); assert.equal(uploads.length, 2); assert.equal(loadedField.crystals3d.meshes[0].count, 0);
const fieldLoads = loads; await loadedField.prepare('/art-src/lab/vfx/'); assert.equal(loads, fieldLoads);
loadedField.crystals3d.dispose();
THREE.TextureLoader.prototype.loadAsync = actualAtlasLoad;
GLTFLoader.prototype.loadAsync = actualLoad;
console.log(JSON.stringify({ result: 'PASS', typeDiagnostics: 0, targets: 100, bound: r.bound, tintedAtHold: 100, blows: r.broken,
  cancelled: r.cancelled, holdSeconds: 3, meshDraws: 5, bindDraws: 3, submittedAt100: submitted, planMs,
  crystals3d: { instances: crystalCount, trianglesPerInstance: 5930, peakCrystalTriangles: crystalCount * 5930, peakEffectSubmittedTriangles: peakEffectTriangles,
    recasts: 5, meshes: 1, imageMetadata: Object.fromEntries(imageMetadata), gltfGeometryParsed: true, shaderAndUploadVerified: false },
  soundEvents: r.soundEvents, registeredSoundFiles: registered.length, cpuProbeP95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1],
  projectionMath: { protectedViews, projectedCards, maxProjectedArea, areaLimit: 0.14 },
  note: 'CPU recipe update only; not full-frame CPU/GPU. PNG upload, GLSL and rendered appearance unverified.', rendererVerified: false }, null, 2));
