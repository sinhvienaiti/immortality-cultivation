/** Tickets 433–433d: focused strict types, real GLB, deterministic rain and pool lifecycle. No game suite/build. */
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import ts from '../../node_modules/typescript/lib/typescript.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
assert.equal(config.error, undefined);
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd()).options;
const files = ['metal-ult-rain.ts', 'metal-ult-layered.ts', 'skills-main.ts'].map(f => fileURLToPath(new URL(f, import.meta.url)));
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options));
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics,
  { getCanonicalFileName: x => x, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }));
registerHooks({
  resolve(s, c, next) {
    try { return next(s, c); } catch (e) {
      if (s.startsWith('.') && c.parentURL) { const u = new URL(s + '.ts', c.parentURL); if (existsSync(u)) return { url: u.href, shortCircuit: true }; }
      throw e;
    }
  },
  load(u, c, next) {
    if (u.endsWith('.ts')) return { format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(u), 'utf8'), { compilerOptions: options }).outputText };
    return next(u, c);
  },
});
const { MetalUltLayered } = await import('./metal-ult-layered.ts');
const { MetalUltRain, METAL_RAIN, METAL_RAIN_CAPACITY } = await import('./metal-ult-rain.ts');
const { metalUltSound } = await import('./metal-ult-sound.ts');
const { fitCamera, placeCamera } = await import('../view/renderer.ts');
const source = new URL('../../art-src/lab/vfx/', import.meta.url);
const glb = readFileSync(new URL('metal-ult/models3d/tripo/ult-metal-sword.tripo.v1.glb', source));
assert.equal(glb.readUInt32LE(0), 0x46546c67); assert.equal(glb.readUInt32LE(8), glb.length);
const original = { glb: GLTFLoader.prototype.loadAsync, texture: THREE.TextureLoader.prototype.loadAsync, fetch: globalThis.fetch };
let loads = 0, imageLoads = 0, pendingModel = null;
const textures = [], releasedSource = [];
const texture = () => {
  const t = new THREE.Texture(); const record = { t, disposed: 0 };
  t.addEventListener('dispose', () => record.disposed++); textures.push(record); return t;
};
GLTFLoader.prototype.loadAsync = async function(url) {
  assert.ok(url.endsWith('/metal-ult/models3d/tripo/ult-metal-sword.tripo.v1.glb'));
  if (pendingModel !== null) await pendingModel;
  loads++;
  const loader = new GLTFLoader().register(parser => ({ name: 'ticket433-cpu-images', async loadTexture(i) {
    const image = parser.json.images[parser.json.textures[i].source];
    const bytes = await parser.getDependency('bufferView', image.bufferView);
    assert.ok(bytes.byteLength > 0); return texture();
  } }));
  const parsed = await loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  parsed.scene.traverse(o => {
    if (o.isMesh) for (const resource of [o.geometry, o.material]) {
      const record = { disposed: 0 }; resource.addEventListener('dispose', () => record.disposed++); releasedSource.push(record);
    }
  });
  return parsed;
};
THREE.TextureLoader.prototype.loadAsync = async function(url) {
  const local = new URL(url.replace('/art-src/lab/vfx/', ''), source);
  assert.ok(existsSync(local), url); imageLoads++; return texture();
};
globalThis.fetch = async url => {
  const local = new URL(String(url).replace('/art-src/lab/vfx/', ''), source);
  return new Response(readFileSync(local), { headers: { 'content-type': 'application/json' } });
};
const group = new THREE.Group(), dead = new Set(), calls = { damage: [], sounds: [], releases: [], strikes: [], binds: [] };
let now = 0;
const host = {
  targets: { size: 100, alive: i => !dead.has(i), x: i => (i % 10 - 4.5) * 2, z: i => -Math.floor(i / 10) * 2,
    midY: () => 0.7, radius: () => 0.4, tier: () => 1,
    nearest(x, z, radius) {
      let selected = -1, distance = radius;
      for (let i = 0; i < this.size; i++) {
        const d = Math.hypot(this.x(i) - x, this.z(i) - z);
        if (this.alive(i) && d <= distance) { selected = i; distance = d; }
      }
      return selected;
    },
  },
  caster: p => p.set(0, 0, 6), hand: p => p.set(0, 1.4, 6),
  release: (_at, firstS) => calls.releases.push({ now, firstS }), bind: (i, seconds) => calls.binds.push({ i, seconds }),
  blow: (i, dx, dz, power, role) => { assert.ok(Number.isFinite(dx + dz)); calls.damage.push({ i, now, power, role }); return false; },
  strike: (_at, role) => calls.strikes.push({ now, role }), sound: (event, _at, pitch) => calls.sounds.push({ event, now, pitch }),
};
try {
  const metal = new MetalUltLayered(group, '/art-src/lab/vfx/', host);
  assert.ok(metal.rain instanceof MetalUltRain); await metal.rain.prepare(); assert.equal(metal.ready, true);
  const rain = metal.rain, mesh = rain.mesh;
  assert.equal(loads, 1); assert.equal(imageLoads, 5); assert.equal(textures.length, 8);
  assert.ok(releasedSource.every(r => r.disposed === 1));
  assert.ok(mesh.isInstancedMesh); assert.ok(mesh.material.isMeshStandardMaterial);
  assert.equal(mesh.instanceMatrix.count, 49); assert.equal(METAL_RAIN_CAPACITY, 49);
  assert.equal((mesh.geometry.index?.count ?? 0) / 3, 5570);
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) assert.ok(mesh.material[key]);
  assert.equal(mesh.material.roughnessMap, mesh.material.metalnessMap);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  mesh.material.onBeforeCompile(shader, {});
  for (const part of ['vRainLocal = position', 'transformed.y += rainDecay * 0.08']) assert.ok(shader.vertexShader.includes(part));
  for (const part of ['if (vRainLocal.y < 0.0) discard', 'rainGrain < rainDecay', 'rainGoldColour', 'vxTagKeep()', 'vec3(0.9)']) assert.ok(shader.fragmentShader.includes(part));
  assert.ok(!shader.vertexShader.includes('rainHashUnused'));
  const resources = () => {
    const result = []; rain.group.traverse(o => { if (o.isMesh) result.push(o, o.geometry, o.material,
      ...(o.isInstancedMesh ? [o.instanceMatrix.array] : Object.values(o.geometry.attributes).map(a => a.array))); }); return result;
  };
  const reference = resources(), samples = [], plans = [], waveFrames = [], lastCounts = [0, 0, 0];
  const camera = new THREE.PerspectiveCamera(), fit = fitCamera(camera, 1280 / 720);
  const cameraStart = camera.position.clone(), cameraQ = camera.quaternion.clone();
  const cameraSamples = [], sealSamples = [], fallingSamples = [], cameraTimes = [0.1, 0.25, 0.4, 0.5, 1.2, 2.4, 2.6, 2.75, 2.9, 3.1, 3.2];
  // The live browser probe reads the real caption. This fixture reserves a 154 px title at 720p.
  const documentBefore = globalThis.document;
  globalThis.document = { querySelectorAll: () => [{ style: { position: 'fixed', top: '18px', zIndex: '20', textAlign: 'center' },
    getBoundingClientRect: () => ({ bottom: 154 }) }] };
  metal.cameraPunch.bindCamera(camera, 1280, 720);
  const start = performance.now(), r = metal.cast(), planMs = performance.now() - start;
  assert.equal(r.mode, 'rain'); assert.equal(r.rain.targeted, 36); assert.equal(r.rain.scatter, 12);
  assert.equal(r.rain.sealHeightM, 8); assert.equal(calls.sounds[0].event, 'gather');
  const savedPlan = rain.slots.map(s => ({ ...s }));
  const ordinary = savedPlan.filter(s => s.wave >= 0), giant = savedPlan.at(-1);
  assert.ok(ordinary.every(s => s.length >= 5 && s.length <= 6)); assert.equal(giant.length, 16.5);
  assert.ok(savedPlan.every(s => s.trail >= 5 && s.trail <= 8)); assert.equal(r.rain.sealDiameterM, 12);
  assert.deepEqual(r.rain.groundMarkM, [7.25, 22.5]); assert.deepEqual(r.rain.trailWidthM, [1.52, 3.4]);
  for (let frame = 1; frame <= 240; frame++) {
    now = frame / 60; const before = performance.now(); metal.update(1 / 60);
    // Reproduce the host overwriting camera position/quaternion after the recipe's update, twice per frame.
    placeCamera(camera, fit.tiltDeg, fit.distanceM, 0, fit.targetZ);
    camera.updateWorldMatrix(true, false); camera.updateMatrixWorld(true);
    samples.push(performance.now() - before);
    if (frame < 240) {
      assert.ok(r.rain.sealScreen.inside, 'Seal outside frame at ' + now + ': ' + JSON.stringify(r.rain.sealScreen));
      assert.ok(r.rain.raysScreen.inside, 'Rays outside frame at ' + now + ': ' + JSON.stringify(r.rain.raysScreen));
      if (now >= 0.8 && now <= 2.0) { fallingSamples.push(r.rain.fallingSwords); assert.ok(r.rain.fallingSwords >= 4, 'Too few GLB swords: ' + now); }
      assert.ok(r.rain.sealScreen.clearOfCaption, 'Seal overlaps caption at ' + now);
      assert.ok(r.rain.casterScreen.inside, 'Caster outside frame at ' + now + ': ' + JSON.stringify(r.rain.casterScreen));
      if (now >= 0.5 && now <= 2.6) {
        assert.ok(Math.abs(r.cameraPunch.distanceRatio - 0.75) < 1e-6);
        assert.ok(Math.abs(r.cameraPunch.angleDropDeg - 6) < 1e-6);
      }
    }
    if (cameraTimes.some(t => Math.abs(t - now) < 1e-8)) {
      cameraSamples.push({ t: now, ...r.cameraPunch }); sealSamples.push({ t: now, centre: { ...r.rain.sealCentre }, rays: { ...r.rain.raysScreen }, falling: r.rain.fallingSwords, ...r.rain.sealScreen });
    }
    if (frame === 192) {
      assert.ok(camera.position.distanceTo(cameraStart) < 0.01); assert.ok(camera.quaternion.angleTo(cameraQ) < 1e-6);
    }
    for (let wave = 0; wave < 3; wave++) if (!lastCounts[wave] && r.rain.waveCounts[wave]) {
      waveFrames.push(now); lastCounts[wave] = r.rain.waveCounts[wave];
    }
    for (const [k, s] of rain.slots.entries()) if (s.state === 1) {
      assert.ok(s.y >= 0 && s.y <= 8);
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(k, matrix);
      const tip = new THREE.Vector3(0, 0, 0).applyMatrix4(matrix), hilt = new THREE.Vector3(0, 1, 0).applyMatrix4(matrix);
      if (s.wave >= 0) assert.ok(hilt.y < 8, 'Whole ordinary blade below formation');
      assert.ok(hilt.y > tip.y, 'Mũi kiếm phải hướng xuống');
      assert.ok(new THREE.Vector3().subVectors(hilt, tip).normalize().distanceTo(new THREE.Vector3(s.dx, s.dy, s.dz)) < 1e-5, 'Blade follows its 3D trajectory');
      if (s.wave >= 0) assert.ok(Math.hypot(s.startX + s.dx * s.length - r.rain.sealCentre.x, s.startZ + s.dz * s.length - r.rain.sealCentre.z) <= 6 * 0.82 + 1e-5, 'Launch below formation');
    }
    if (frame === 72) {
      assert.ok(rain.slots.some(s => s.state === 1));
      assert.equal(r.rain.waveCounts[0], 16); assert.equal(r.rain.waveCounts[1], 6);
    }
    if (frame === 144) { assert.equal(r.rain.giantAt, 2.4); assert.equal(r.rain.impacts, 49); assert.equal(calls.strikes.length, 1); }
  }
  assert.deepEqual(r.rain.waveCounts, [16, 16, 16]); assert.deepEqual(r.rain.waveTimes, [0.6, 1.05, 1.5]);
  assert.deepEqual(waveFrames, [0.6, 1.05, 1.5]); assert.equal(calls.binds.length, 0);
  assert.equal(calls.releases.length, 1); assert.equal(calls.releases[0].now, 0.6);
  assert.equal(r.broken, 100); assert.ok(calls.damage.length >= 136);
  assert.ok(calls.damage.every(c => c.role === 'secondary')); assert.equal(r.soundEvents.break, 1); assert.equal(r.soundEvents.tail, 1);
  assert.equal(metal.active, false); assert.equal(r.clock, 4); assert.equal(mesh.count, 0);
  assert.equal(r.rain.activeSwords, 0); assert.equal(r.rain.returned, 49); assert.equal(r.swordTriangles, 0);
  assert.ok(rain.slots.every(s => s.state === 3));
  assert.ok(rain.group.children.filter(o => o.isMesh && !o.isInstancedMesh).every(o => o.geometry.instanceCount === 0));
  for (let cycle = 0; cycle < 5; cycle++) {
    now = 0; const next = metal.cast(); plans.push(rain.slots.map(s => ({ ...s })));
    assert.deepEqual(plans.at(-1), savedPlan); metal.update(1.25); metal.clear();
    assert.equal(mesh.count, 0); assert.equal(next.rain.returned, 49); assert.deepEqual(resources(), reference);
    const end = metal.cast(); for (let i = 0; i < 60; i++) metal.update(1 / 15);
    assert.equal(end.clock, 4); assert.equal(metal.active, false); assert.equal(end.rain.impacts, 49);
    assert.deepEqual(resources(), reference);
  }
  assert.equal(loads, 1); assert.equal(imageLoads, 5); assert.ok(textures.every(t => t.disposed === 0));
  // A dead launch target does not receive a ghost hit. The finale still uses the living host field.
  metal.cast(); dead.add(0); const damageFrom = calls.damage.length; metal.update(4);
  assert.ok(calls.damage.slice(damageFrom).every(c => c.i !== 0)); dead.clear();
  globalThis.document = documentBefore;
  metal.clear();
  const disabled = new MetalUltLayered(new THREE.Group(), '/art-src/lab/vfx/', host, '?ultCam=0');
  disabled.rain.prepare = async () => {}; disabled.cameraPunch.bindCamera(camera, 1280, 720);
  disabled.cast();
  for (let i = 0; i < 240; i++) {
    disabled.update(1 / 60); camera.updateMatrixWorld(true); camera.updateWorldMatrix(true, false);
    assert.deepEqual(camera.position.toArray(), cameraStart.toArray()); assert.deepEqual(camera.quaternion.toArray(), cameraQ.toArray());
    assert.equal(camera.fov, fit.fovDeg);
  }
  assert.equal(disabled.last.cameraPunch.enabled, false); disabled.rain.dispose(); disabled.cameraPunch.dispose();
  const ring = new MetalUltLayered(new THREE.Group(), '/art-src/lab/vfx/', host, '?metalUlt=ring');
  assert.equal(ring.rain, null); ring.prepare = () => {};
  const legacy = ring.cast(); assert.equal(legacy.mode, 'ring'); assert.equal(legacy.clusters, 204);
  ring.update(2.2); assert.equal(legacy.bound, 100); ring.update(5); assert.equal(legacy.broken, 100); ring.update(2); assert.equal(ring.active, false);
  const takes = [], plays = [];
  const sound = metalUltSound({ registerTakes: list => takes.push(...list), playTake: (take, opts) => plays.push({ take, opts }) });
  for (const event of ['gather', 'grow', 'crack', 'break', 'tail']) sound(event, new THREE.Vector3(), 1);
  assert.equal(takes.length, 10); assert.equal(plays.length, 5); assert.ok(plays.every(p => p.take.file.endsWith('.wav')));
  rain.dispose(); assert.ok(textures.every(t => t.disposed === 1)); assert.equal(rain.group.parent, null);
  let finish; pendingModel = new Promise(resolve => { finish = resolve; });
  const late = new MetalUltRain(new THREE.Group(), '/art-src/lab/vfx/', host); late.cast(); const loading = late.prepare(); late.clear();
  finish(); await loading; assert.equal(late.active, false); assert.equal(late.mesh.count, 0); assert.equal(late.group.visible, false); late.dispose();
  let finishDisposed; pendingModel = new Promise(resolve => { finishDisposed = resolve; });
  const disposed = new MetalUltRain(new THREE.Group(), '/art-src/lab/vfx/', host); disposed.cast(); const pending = disposed.prepare(); disposed.dispose();
  finishDisposed(); await pending; pendingModel = null;
  assert.equal(disposed.mesh, null); assert.equal(disposed.ready, false); assert.equal(disposed.group.parent, null);
  assert.ok(textures.every(t => t.disposed === 1)); assert.ok(releasedSource.every(r => r.disposed === 1));
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({ strictErrors: diagnostics.length, cameraSamples, sealSamples, disabledCamera: 'PASS',
    returnErrorM: r.cameraPunch.returnErrorM, minFalling08To20: Math.min(...fallingSamples),
    swordHeightM: [Math.min(...ordinary.map(s => s.length)), Math.max(...ordinary.map(s => s.length))],
    giantHeightM: giant.length, sealHeightM: r.rain.sealHeightM, sealDiameterM: r.rain.sealDiameterM,
    trailLengthM: [Math.min(...savedPlan.map(s => s.trail)), Math.max(...savedPlan.map(s => s.trail))],
    trailWidthM: r.rain.trailWidthM, groundMarkM: r.rain.groundMarkM, waveFrames, waveCounts: r.rain.waveCounts, targeted: 36, scatter: 12,
    impacts: r.rain.impacts, giantAt: r.rain.giantAt, targetsHit: r.broken, returnedAt4s: r.rain.returned,
    fiveClearRecasts: 'PASS', ring: 'PASS', pendingClearDispose: 'PASS', trianglesPerSword: 5570, maxSwordTriangles: 49 * 5570,
    planMs, recipeCpuP95Ms: samples[Math.ceil(samples.length * 0.95) - 1], note: 'CPU only; browser image decoding and GPU/GLSL are not measured.' }, null, 2));
} finally {
  GLTFLoader.prototype.loadAsync = original.glb; THREE.TextureLoader.prototype.loadAsync = original.texture; globalThis.fetch = original.fetch;
}
