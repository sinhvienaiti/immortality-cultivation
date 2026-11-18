/** Tickets 402/426: focused strict types, real Tripo GLB and 100-target CPU/lifecycle checks. */
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import ts from '../../node_modules/typescript/lib/typescript.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const files = ['metal-ult-3d.ts', 'metal-ult-layered.ts', 'metal-ult-sprites.ts', 'metal-ult-tint.ts', 'metal-ult-sound.ts', 'skills-main.ts'].map(f => fileURLToPath(new URL(f, import.meta.url)));
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
const { MetalUltLayered } = await import('./metal-ult-layered.ts');
const { MetalSpriteField, METAL_CLUSTERS, METAL_PERIMETER } = await import('./metal-ult-sprites.ts');
const { MetalUlt3D, METAL_3D_CAPACITY, METAL_3D_TIMING, METAL_3D_CASTER_GAP } = await import('./metal-ult-3d.ts');
const { metalUltSound } = await import('./metal-ult-sound.ts');
// GLTFLoader parses the actual GLB. Only browser image decoding/upload is substituted.
const glb = readFileSync(new URL('../../art-src/lab/vfx/metal-ult/models3d/tripo/ult-metal-sword.tripo.v1.glb', import.meta.url));
assert.equal(glb.readUInt32LE(0), 0x46546c67); assert.equal(glb.readUInt32LE(4), 2); assert.equal(glb.readUInt32LE(8), glb.length);
const imageMetadata = new Map(), sourceTextures = [], sourceDisposed = [], sourcesReleased = [];
let loads = 0;
const actualLoad = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function (url) {
  assert.ok(url.endsWith('/metal-ult/models3d/tripo/ult-metal-sword.tripo.v1.glb')); loads++;
  const loader = new GLTFLoader().register(parser => ({
    name: 'ticket426-cpu-images',
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
  const parsed = await loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  parsed.scene.traverse(o => { if (o.isMesh) for (const r of [o.geometry, o.material]) r.addEventListener('dispose', () => sourcesReleased.push(r)); });
  return parsed;
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
const metal = new MetalUltLayered(fx, '/art-src/lab/vfx/', host);
const uploads = [];
await metal.field.swords3d.prepare('/art-src/lab/vfx/', t => uploads.push(t));
assert.equal(metal.field.swords3d.ready, true); assert.equal(metal.field.swords3d.loadError, null);
assert.equal(loads, 1); assert.equal(uploads.length, 3); assert.equal(sourceDisposed.length, 0); assert.equal(sourcesReleased.length, 2);
metal.prepare = () => {}; // CPU only; no PNG upload or GLSL compilation claim.
const planStart = performance.now(), r = metal.cast(), planMs = performance.now() - planStart;
const advance = end => { while (now < end) { now += 1 / 60; const start = performance.now(); metal.update(1 / 60); samples.push(performance.now() - start); } };
advance(2.2);
assert.equal(calls.bind.length, 100); assert.equal(r.tintedFoes, 100); assert.equal(r.activeTints, 100);
assert.equal(r.assetsReady, false); assert.equal(r.meshDraws, 5); assert.equal(r.bindDraws, 3); assert.equal(r.clusters, 204);
assert.equal(r.truncatedBinds, 0); assert.equal(calls.release.length, 1); assert.ok(Math.abs(calls.release[0].at - 0.6) < 1 / 60 + 1e-8);
const forest = scene.getObjectByName('fx-metal-ult-swords-and-core'), ground = scene.getObjectByName('fx-metal-ult-ground-and-foot-rings');
const debris = scene.getObjectByName('fx-metal-ult-blades-and-fragments'), radiance = scene.getObjectByName('fx-metal-ult-rays-and-gold-dust');
const cards = [forest, ground, debris, radiance];
const submitted = cards.map(c => ({ name: c.name, instances: c.geometry.instanceCount }));
assert.deepEqual(submitted.map(c => c.instances), [61, 194, 1408, 1444]);
const swords = scene.getObjectByName('fx-metal-ult-3d-tripo-sword');
assert.equal(swords.isInstancedMesh, true); assert.equal(swords.material.isMeshStandardMaterial, true);
assert.equal(swords.instanceMatrix.count, METAL_3D_CAPACITY); assert.deepEqual(metal.field.swords3d.triangles, [5570]);
assert.equal(swords.geometry.boundingBox.min.y, 0); assert.equal(swords.geometry.boundingBox.max.y, 1);
assert.ok(swords.material.map && swords.material.roughnessMap && swords.material.metalnessMap && swords.material.normalMap);
assert.equal(swords.material.roughnessMap, swords.material.metalnessMap);
assert.ok(swords.material.metalness >= 0.88); assert.ok(swords.material.roughness >= 0.25 && swords.material.roughness <= 0.4);
const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
swords.material.onBeforeCompile(shader, {});
assert.ok(shader.vertexShader.includes('vMetalWorld = (modelMatrix * instanceMatrix'));
assert.ok(shader.fragmentShader.includes('roughnessFactor = mix(clamp(roughnessFactor, 0.25, 0.4)'));
assert.ok(shader.fragmentShader.includes('metalnessFactor = mix(mix(0.94, 0.88, metalGold)'));
assert.ok(shader.fragmentShader.includes('gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(0.9));'));
assert.ok(shader.fragmentShader.includes('gl_FragColor.rgb *= vxTagKeep();'));
assert.ok(shader.fragmentShader.includes('distance(vMetalWorld.xz, uCaster.xz) < 2.0'));
assert.ok(shader.fragmentShader.includes('#include <lights_physical_fragment>'));
const swordCount = swords.count, placements = structuredClone(metal.field.swords3d.placements);
assert.ok(swordCount >= METAL_PERIMETER && swordCount <= METAL_PERIMETER * 3);
const perCluster = Array.from({ length: METAL_PERIMETER }, () => 0), matrix = new THREE.Matrix4(), point = new THREE.Vector3();
let minVertexGap = Infinity;
for (const [slot, p] of placements.entries()) {
  perCluster[p.cluster]++;
  assert.ok(p.scale >= 0.7 && p.scale <= 1.3); assert.ok(p.tilt >= Math.PI / 36 - 1e-8 && p.tilt <= Math.PI * 25 / 180 + 1e-8);
  assert.equal(p.birth, metal.field.clusters[p.cluster].at);
  assert.ok(Math.hypot(p.x, p.z - 6) - p.footprint >= METAL_3D_CASTER_GAP);
  const clock = swords.geometry.getAttribute('iMetal');
  assert.ok(Math.abs(clock.getX(slot) - p.birth) < 1e-6);
  assert.ok(Math.abs(clock.getY(slot) - p.birth - METAL_3D_TIMING.breakAfter) < 1e-6);
  swords.getMatrixAt(slot, matrix);
  const positions = swords.geometry.getAttribute('position');
  // Independent transformed-vertex check for growth overshoot, hold and maximum shatter/sink.
  for (let v = 0; v < positions.count; v++) for (const [growth, dissolve] of [[1.04, 0], [1, 0], [1, 1]]) {
    point.fromBufferAttribute(positions, v); const norm = Math.hypot(point.x + 0.0001, point.z + 0.0001);
    point.x += (point.x + 0.0001) / norm * dissolve * 0.035; point.z += (point.z + 0.0001) / norm * dissolve * 0.035;
    point.y = point.y * growth - dissolve * 0.16; point.applyMatrix4(matrix);
    const gap = Math.hypot(point.x, point.z - 6); minVertexGap = Math.min(minVertexGap, gap);
    assert.ok(gap >= METAL_3D_CASTER_GAP - 1e-5);
  }
}
assert.ok(perCluster.every(n => n >= 1 && n <= 3)); assert.equal(new Set(perCluster).size, 3);
assert.equal(r.swordInstances, swordCount); assert.equal(r.swordTriangles, swordCount * 5570);
const fxMeshes = []; fx.traverse(o => { if (o.isMesh) fxMeshes.push(o); });
assert.equal(fxMeshes.length, 5); assert.equal(fxMeshes.filter(o => o.isInstancedMesh).length, 1);
const originalBuffers = [swords.geometry, swords.material, swords.instanceMatrix.array, swords.geometry.getAttribute('iMetal').array];
const peakEffectTriangles = swordCount * 5570 + submitted.reduce((sum, c) => sum + c.instances * 2, 0);
assert.equal(scene.getObjectByName('fx-metal-ult-shells'), undefined);
assert.deepEqual(r.bindInstancesPerFoe, { ring: 1, blades: 4, fragments: 6, sparks: 8 });
for (let i = 0; i < METAL_PERIMETER; i++) {
  const c = metal.field.clusters[i], next = metal.field.clusters[Math.floor(i / 48) * 48 + (i + 1) % 48];
  assert.ok(Math.hypot(c.x - next.x, c.z - next.z) < Math.min(c.width, next.width), 'Perimeter must overlap');
  const d = Math.hypot(c.x, c.z - 6); assert.ok(d <= 30);
  assert.ok(Math.abs(c.at - 0.6 - d / 26) < 1e-8);
}
assert.equal(forest.geometry.getAttribute('iClock').getZ(METAL_CLUSTERS - METAL_PERIMETER), 1);
assert.equal(Array.from({ length: forest.geometry.instanceCount }, (_, i) => forest.geometry.getAttribute('iClock').getZ(i)).filter(m => m === 1).length, 1);
const dg = debris.geometry, firstFoe = METAL_CLUSTERS * 2;
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
    metal.field.protectCaster(at); forest.onBeforeRender(null, scene, camera, forest.geometry, forest.material, null);
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
for (const aspect of [16 / 9, 9 / 16]) for (const distance of [0.15, 1, 7, 30, 90]) for (const mode of ['upright', 'floor', 'camera']) {
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
  camera.position.set(0, 2.2, distance); camera.lookAt(0, 1.1, -22); camera.updateMatrixWorld(true);
  const pv = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  for (const x of [-8, 0, 8]) for (const roll of [-1.25, 0, 0.65]) {
    const at = new THREE.Vector3(x, 0.075, 0), base = new THREE.Vector4(...at.toArray(), 1).applyMatrix4(pv);
    if (base.w <= 0.1) continue;
    const right = mode === 'floor' ? new THREE.Vector3(1, 0, 0) : mode === 'upright' ? new THREE.Vector3(camera.position.z, 0, x).normalize() : new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = mode === 'floor' ? new THREE.Vector3(0, 0, 1) : mode === 'upright' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const deltas = [];
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) {
      const px = sx * 8.5, py = (sy + (mode === 'upright' ? 0.5 : 0)) * 8.5;
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
  clone.onBeforeCompile(shader, {}); assert.ok(shader.vertexShader.includes('vMetalBind =')); assert.ok(shader.fragmentShader.includes('vec3 metalBody'));
  assert.equal(clone.customProgramCacheKey(), 'source-' + family + '-metal-bind-402');
}
assert.equal(chained, 4);
dead.add(0); advance(now + 1 / 60);
assert.equal(ground.geometry.getAttribute('iClock').getX(64), 1e6);
for (let j = 0; j < 10; j++) assert.equal(dg.getAttribute('iClock').getX(firstFoe + j), 1e6);
assert.equal(meshes[0].geometry.getAttribute('iMetalBindClock').getY(0), 0);
advance(10);
assert.equal(calls.blow.length, 99); assert.equal(new Set(calls.blow.map(b => b.i)).size, 99); assert.deepEqual(calls.strike, ['primary']);
assert.equal(r.cancelled, 1); assert.equal(metal.active, false); assert.equal(r.activeTints, 0);
for (const hit of calls.blow) {
  const bound = calls.bind.find(b => b.i === hit.i); assert.equal(bound.seconds, 3); assert.equal(hit.power, 1);
  assert.ok(Math.abs(hit.at - bound.at - 3) < 1 / 60 + 1e-8);
}
assert.equal(r.soundEvents.break, 1);
assert.ok(calls.sound.every(s => s.pitch >= 0.96 && s.pitch <= 1.04));
for (const event of ['gather', 'grow', 'crack', 'break', 'tail']) assert.ok(calls.sound.some(s => s.event === event));
let earlyDisposals = 0;
for (const resource of [swords.geometry, swords.material, swords, ...uploads]) resource.addEventListener('dispose', () => earlyDisposals++);
dead.clear();
for (let k = 0; k < 5; k++) {
  metal.cast(); metal.update(2);
  assert.equal(swords.count, swordCount); assert.deepEqual(metal.field.swords3d.placements, placements);
  assert.deepEqual([swords.geometry, swords.material, swords.instanceMatrix.array, swords.geometry.getAttribute('iMetal').array], originalBuffers);
  const after = []; fx.traverse(o => { if (o.isMesh) after.push(o); }); assert.deepEqual(after, fxMeshes);
  metal.clear(); assert.equal(swords.count, 0); assert.equal(metal.field.swords3d.placements.length, 0);
}
assert.equal(earlyDisposals, 0); assert.equal(loads, 1);
for (const c of cards) assert.equal(c.geometry.instanceCount, 0);
for (const [i, mesh] of meshes.entries()) {
  assert.equal(originals[i].color.getHex(), 0x998877);
  const a = mesh.geometry.getAttribute('iMetalBindClock'); for (let j = 0; j < a.count; j++) assert.equal(a.getY(j), 0);
}
const extra = new MetalUltLayered(new THREE.Group(), '/', { ...host, targets: { ...host.targets, group: undefined, size: 140, x: i => (i % 10) * 0.5, z: i => -Math.floor(i / 10) * 0.5 } });
extra.prepare = () => {}; const over = extra.cast(); extra.update(2); assert.equal(over.truncatedBinds, 12); extra.clear();
const empty = new MetalUltLayered(new THREE.Group(), '/', { ...host, targets: { ...host.targets, size: 0 } });
empty.prepare = () => {}; const er = empty.cast(); empty.update(10); assert.equal(er.bound, 0); assert.equal(empty.active, false);
const registered = [], audioCalls = [];
const adapter = metalUltSound({ registerTakes: t => registered.push(...t), playTake: (t, o) => audioCalls.push({ t, o }) });
for (const event of ['gather', 'grow', 'crack', 'break', 'tail']) for (let k = 0; k < 4; k++) adapter(event, new THREE.Vector3(4, 0, 0), 1);
for (const take of registered) { assert.ok(existsSync(new URL('../../art-src/lab/firefly-sprint-2026-11-05/sound/' + take.file, import.meta.url))); assert.ok(Number.isFinite(take.gain) && take.gain > 0); }
assert.ok(audioCalls.every(c => c.o.bus === 'world' && c.o.group && c.o.send > 0));
const art = new URL('../../art-src/lab/vfx/metal-ult/', import.meta.url), manifest = JSON.parse(readFileSync(new URL('manifest.json', art), 'utf8'));
assert.equal(manifest.sprites.length, 11);
for (const s of manifest.sprites) { assert.ok(existsSync(new URL(s.file, art))); assert.ok(existsSync(new URL(s.name + '.prompt.txt', art))); }
const integration = readFileSync(new URL('skills-main.ts', import.meta.url), 'utf8');
assert.ok(integration.includes('row.id === ICE_ULT_ID ? [row, ...metalRows]')); assert.ok(integration.includes('row.id === ICE_ULT_ID ? [row, ...woodRows]'));
assert.ok(integration.includes('e.key === "p" || e.key === "P"')); assert.ok(integration.includes('clipSkills.cast(METAL_ULT_ID)'));
const ordered = samples.toSorted((a, b) => a - b);
// Clear/load, recast/load and dispose/load races must never resurrect stale geometry.
const lateParent = new THREE.Group(), casterBox = { value: new THREE.Vector4(2, 2, 2, 2) };
const late = new MetalUlt3D(lateParent, casterBox, () => {}), near = new THREE.Vector3();
const nearList = [{ x: 0, z: 0, at: 0.6, width: 2, height: 2 }, { x: 2.1, z: 0, at: 0.6, width: 2, height: 2 }, { x: 6, z: 0, at: 0.7, width: 2, height: 2 }];
late.plan(nearList, near, near); const pending = late.prepare('/art-src/lab/vfx/');
assert.equal(late.prepare('/art-src/lab/vfx/'), pending); late.clear(); await pending;
assert.equal(late.ready, true); assert.equal(late.instanceCount, 0); late.plan(nearList, near, near);
assert.ok(late.placements.length > 0); assert.ok(late.placements.every(p => p.cluster > 0));
assert.ok(late.placements.some(p => p.cluster === 1));
assert.ok(late.placements.every(p => Math.hypot(p.x, p.z) - p.footprint >= METAL_3D_CASTER_GAP));
late.update(10); assert.equal(late.instanceCount, 0);
let disposalCount = 0;
for (const resource of [late.meshes[0], late.meshes[0].geometry, late.meshes[0].material, late.meshes[0].material.map,
  late.meshes[0].material.normalMap, late.meshes[0].material.roughnessMap]) resource.addEventListener('dispose', () => disposalCount++);
late.dispose(); late.dispose(); assert.equal(disposalCount, 6); assert.equal(lateParent.children.length, 0);
const disposedPending = new MetalUlt3D(new THREE.Group(), casterBox, () => {});
const beforeDispose = sourceDisposed.length;
const pendingDispose = disposedPending.prepare('/art-src/lab/vfx/'); disposedPending.dispose(); await pendingDispose;
assert.equal(disposedPending.meshes.length, 0); assert.equal(disposedPending.ready, false);
assert.equal(sourceDisposed.length - beforeDispose, 3);
const latest = new MetalUlt3D(new THREE.Group(), casterBox, () => {});
latest.plan(nearList, near, near); const latestLoad = latest.prepare('/art-src/lab/vfx/');
latest.plan([{ ...nearList[2], x: 12, at: 1.2 }], near, near); await latestLoad;
assert.ok(latest.placements.length > 0); assert.ok(latest.placements.every(p => p.x > 11 && p.birth === 1.2)); latest.dispose();
// A full field is ready only after both the PNG and the GLB complete.
const loadedField = new MetalSpriteField(new THREE.Group()), actualAtlasLoad = THREE.TextureLoader.prototype.loadAsync, fieldUploads = [];
THREE.TextureLoader.prototype.loadAsync = async url => { assert.ok(url.endsWith('/metal-ult/metal-ult.atlas.png')); return new THREE.Texture(); };
loadedField.plan(new THREE.Vector3(0, 0, 6), new THREE.Vector3(0, 1.4, 6), [], { ...host.targets, size: 0 });
const fieldLoad = loadedField.prepare('/art-src/lab/vfx/', t => fieldUploads.push(t));
assert.equal(loadedField.ready, false); assert.equal(loadedField.prepare('/art-src/lab/vfx/'), fieldLoad);
loadedField.clear(); await fieldLoad;
assert.equal(loadedField.ready, true); assert.equal(fieldUploads.length, 4); assert.equal(loadedField.swords3d.instanceCount, 0);
const fieldLoads = loads; await loadedField.prepare('/art-src/lab/vfx/'); assert.equal(loads, fieldLoads);
loadedField.swords3d.dispose(); THREE.TextureLoader.prototype.loadAsync = actualAtlasLoad;
metal.field.swords3d.dispose(); assert.equal(earlyDisposals, 6);
assert.equal(sourceDisposed.length, sourceTextures.length, 'all retained Tripo textures released at teardown');
GLTFLoader.prototype.loadAsync = actualLoad;
console.log(JSON.stringify({ result: 'PASS', typeDiagnostics: 0, targets: 100, bound: r.bound, tintedAtHold: 100, blows: r.broken,
  cancelled: r.cancelled, holdSeconds: 3, meshDraws: 5, bindDraws: 3, submittedAt100: submitted, planMs,
  swords3d: { instances: swordCount, capacity: METAL_3D_CAPACITY, trianglesPerInstance: 5570, peakSwordTriangles: swordCount * 5570,
    peakEffectSubmittedTriangles: peakEffectTriangles, clusterCounts: Object.fromEntries([1, 2, 3].map(n => [n, perCluster.filter(k => k === n).length])),
    minVertexGap, recasts: 5, meshes: 1, imageMetadata: Object.fromEntries(imageMetadata), gltfGeometryParsed: true,
    pbrShaderInjectionVerified: true, shaderAndUploadVerified: false },
  soundEvents: r.soundEvents, registeredSoundFiles: registered.length, cpuProbeP95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1],
  projectionMath: { protectedViews, projectedCards, maxProjectedArea, areaLimit: 0.14 },
  note: 'CPU recipe update only; not full-frame CPU/GPU. PNG upload, GLSL and rendered appearance unverified.', rendererVerified: false }, null, 2));
