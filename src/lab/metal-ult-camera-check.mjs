/** Ticket 433d: camera/projection probes only; no renderer, build, game suite or media writes. */
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from '../../node_modules/typescript/lib/typescript.js';
import * as THREE from 'three';

registerHooks({
  resolve(s, c, next) {
    try { return next(s, c); } catch (error) {
      if (s.startsWith('.') && c.parentURL) {
        const u = new URL(s + '.ts', c.parentURL);
        if (existsSync(u)) return { url: u.href, shortCircuit: true };
      }
      throw error;
    }
  },
  load(u, c, next) {
    return u.endsWith('.ts') ? { format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(u), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText } : next(u, c);
  },
});
const { UltCameraPunch } = await import('./ult-camera-punch.ts');
const { MetalUltLayered } = await import('./metal-ult-layered.ts');
const { fitCamera } = await import('../view/renderer.ts');
const shot = { centre: new THREE.Vector3(0, 3, 1.5), distanceRatio: 0.75, lowerAngleDeg: 6,
  inS: 0.5, holdUntilS: 2.6, outS: 0.6, fovDeg: 34 };
const methods = [THREE.Camera.prototype.updateWorldMatrix, THREE.Camera.prototype.updateMatrixWorld,
  THREE.Scene.prototype.onBeforeRender];
const result = { rates: [], framing: [], worldViews: [] };
for (const rate of [15, 60, 120]) for (const parented of [false, true]) {
  const camera = new THREE.PerspectiveCamera(); fitCamera(camera, 1280 / 720);
  const parent = new THREE.Group();
  if (parented) { parent.position.set(3, 2, -5); parent.rotation.y = 0.31; parent.add(camera); }
  camera.updateWorldMatrix(true, false);
  const local = camera.position.clone(), q = camera.quaternion.clone(), fov = camera.fov;
  const originalMatrix = camera.matrixWorld.clone();
  const original = [camera.updateMatrixWorld, camera.updateWorldMatrix];
  const punch = new UltCameraPunch(new THREE.Group(), ''); punch.bindCamera(camera); punch.startShot(shot);
  camera.updateMatrixWorld(true);
  assert.ok(camera.matrixWorld.elements.every((v, i) => Math.abs(v - originalMatrix.elements[i]) < 1e-10), 'First frame must not move');
  let minY = Infinity, previous = Infinity, peak = null;
  for (let frame = 1; frame <= Math.ceil(3.2 * rate); frame++) {
    const t = frame / rate; punch.update(1 / rate);
    camera.updateWorldMatrix(true, false); camera.updateMatrixWorld(true);
    const pose = camera.matrixWorld.clone();
    camera.updateMatrixWorld(true); camera.updateWorldMatrix(true, false);
    assert.deepEqual(camera.matrixWorld.elements, pose.elements, 'Multiple passes must not accumulate a shot');
    minY = Math.min(minY, camera.matrixWorld.elements[13]);
    if (t <= 0.5) { assert.ok(punch.report.distanceM <= previous + 1e-9); previous = punch.report.distanceM; }
    if (t >= 0.5 && t <= 2.6) {
      assert.ok(Math.abs(punch.report.distanceRatio - 0.75) < 1e-8);
      assert.ok(Math.abs(punch.report.angleDropDeg - 6) < 1e-8);
      if (peak === null) peak = pose; else assert.deepEqual(pose.elements, peak.elements, 'Hold must be steady');
    }
  }
  assert.ok(minY >= 0.5); assert.ok(camera.position.distanceTo(local) < 1e-9);
  assert.ok(camera.quaternion.angleTo(q) < 1e-7); assert.equal(camera.fov, fov);
  assert.ok(punch.report.returnErrorM < 0.01);
  punch.startShot(shot); punch.update(0.7); camera.updateMatrixWorld(); punch.clear();
  assert.ok(camera.position.distanceTo(local) < 1e-9); assert.equal(camera.fov, fov);
  punch.startShot(shot); punch.update(10); camera.updateMatrixWorld();
  assert.ok(camera.position.distanceTo(local) < 1e-9);
  punch.dispose(); assert.equal(camera.updateMatrixWorld, original[0]); assert.equal(camera.updateWorldMatrix, original[1]);
  result.rates.push({ rate, parented, minCameraY: minY, returnErrorM: punch.report.returnErrorM });
}

// The integration adapter must preserve the stress host's scene hook and detach cleanly.
const scene = new THREE.Scene(), layer = new THREE.Group(); scene.add(layer);
let beforeCalls = 0, projections = 0;
const before = () => { beforeCalls++; }; scene.onBeforeRender = before;
const adapter = new UltCameraPunch(layer, '', () => projections++);
const camera = new THREE.PerspectiveCamera(); fitCamera(camera, 1280 / 720);
const renderer = { domElement: { clientWidth: 1280, clientHeight: 720 } };
scene.onBeforeRender(renderer, scene, camera);
adapter.startShot(shot); adapter.update(1.2); scene.onBeforeRender(renderer, scene, camera);
assert.equal(beforeCalls, 2); assert.ok(projections >= 2); assert.equal(adapter.report.distanceRatio, 0.75);
adapter.dispose(); assert.equal(scene.onBeforeRender, before);
assert.deepEqual([THREE.Camera.prototype.updateWorldMatrix, THREE.Camera.prototype.updateMatrixWorld,
  THREE.Scene.prototype.onBeforeRender], methods);
result.sceneHook = 'PASS';

// Independently project the shader's circular envelope, including an orbit and an absent caption.
const point = new THREE.Vector3();
for (const yaw of [0, 0.35]) for (const captionBottom of [0, 154]) {
  const camera = new THREE.PerspectiveCamera(), fit = fitCamera(camera, 1280 / 720);
  const aim = new THREE.Vector3(0, 0, fit.targetZ);
  camera.position.sub(aim).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(aim);
  camera.lookAt(aim); camera.updateMatrixWorld(true);
  globalThis.document = { querySelectorAll: () => captionBottom ? [{ style: { position: 'fixed', top: '18px',
    zIndex: '20', textAlign: 'center' }, getBoundingClientRect: () => ({ bottom: captionBottom }) }] : [] };
  const host = { targets: { size: 100, alive: () => true, x: i => (i % 10 - 4.5) * 2,
    z: i => -Math.floor(i / 10) * 2, nearest: () => -1 }, caster: p => p.set(0, 0, 6), hand: p => p.set(0, 1.4, 6),
    release() {}, bind() {}, blow() { return false; }, strike() {} };
  const metal = new MetalUltLayered(new THREE.Group(), '', host); metal.rain.prepare = async () => {};
  metal.cameraPunch.bindCamera(camera); const report = metal.cast(); let minTop = Infinity;
  for (let frame = 0; frame < 240; frame++) {
    if (frame) metal.update(1 / 60); camera.updateMatrixWorld(true);
    const { sealScreen: box, sealCentre: centre, casterScreen } = report.rain;
    assert.ok(box.inside && box.clearOfCaption && report.rain.raysScreen.inside && casterScreen.inside, JSON.stringify({ frame, yaw, captionBottom, box, casterScreen }));
    minTop = Math.min(minTop, box.top);
    if (frame % 15 === 0) for (let i = 0; i < 360; i++) {
      const theta = i * Math.PI / 180;
      point.set(centre.x + 6 * Math.cos(theta), 8, centre.z + 6 * Math.sin(theta)).project(camera);
      const x = (point.x + 1) * 640, y = (1 - point.y) * 360;
      assert.ok(x >= box.left - 1e-6 && x <= box.right + 1e-6 && y >= box.top - 1e-6 && y <= box.bottom + 1e-6);
    }
  }
  result.framing.push({ yaw, captionBottom, minTopPx: minTop, minTopFraction: minTop / 720 });
  metal.cameraPunch.dispose(); metal.rain.dispose();
}
// A camera change projects the same world geometry; it cannot reposition or tilt the formation.
const inspectCamera = new THREE.PerspectiveCamera(); fitCamera(inspectCamera, 1280 / 720);
const inspectHost = { targets: { size: 1, alive: () => true, x: () => 0, z: () => -9, nearest: () => -1 },
  caster: p => p.set(0, 0, 6), hand: p => p.set(0, 1.4, 6), release() {}, bind() {}, blow() { return false; }, strike() {} };
const inspect = new MetalUltLayered(new THREE.Group(), '', inspectHost, '?ultCam=0');
inspect.rain.prepare = async () => {}; inspect.cameraPunch.bindCamera(inspectCamera);
inspectCamera.updateMatrixWorld(true); inspect.cast(); inspect.update(1.2); inspectCamera.updateMatrixWorld(true);
const fixed = ['sky-seal', 'seal-rays', 'trails', 'ground-marks'].map(name => inspect.rain.group.getObjectByName('fx-metal-rain-' + name));
const seal = fixed[0], positions = seal.geometry.getAttribute('position');
const va = new THREE.Vector3().fromBufferAttribute(positions, 0), vb = new THREE.Vector3().fromBufferAttribute(positions, 2), vc = new THREE.Vector3().fromBufferAttribute(positions, 1);
assert.ok(new THREE.Vector3().crossVectors(vb.sub(va), vc.sub(va)).normalize().y < -0.9999, 'Seal normal must face down');
assert.ok(Array.from({ length: positions.count }, (_, i) => positions.getY(i)).every(y => Math.abs(y) < 1e-7));
for (const mesh of fixed.slice(1, 3)) {
  const p = mesh.geometry.getAttribute('position');
  assert.equal(p.count, 8); assert.equal(mesh.geometry.index.count, 12);
  assert.ok(Array.from({ length: p.count }, (_, i) => Math.abs(p.getZ(i))).some(z => z > 0.49), 'Crossed ribbon must have Z extent');
}
const anchor = { ...inspect.last.rain.sealCentre };
const buffers = () => fixed.map(m => Object.fromEntries(Object.entries(m.geometry.attributes).map(([name, a]) => [name, Array.from(a.array)])));
const originalBuffers = buffers();
for (const [view, position, aim] of [
  ['play55', [0, 35, 25], [0, 0, 0]], ['overhead90', [0, 35, -0.23], [0, 0, -0.23]], ['behind', [0, 2.2, 13], [0, 1.1, -16]],
]) {
  const c = new THREE.PerspectiveCamera(view === 'behind' ? 50 : 28, 1280 / 720, 0.1, 300);
  c.position.fromArray(position); c.lookAt(new THREE.Vector3().fromArray(aim)); c.updateMatrixWorld(true);
  inspect.rain.present(c, 1280, 720);
  assert.deepEqual(inspect.last.rain.sealCentre, anchor); assert.deepEqual(buffers(), originalBuffers);
  result.worldViews.push({ view, anchor: { ...anchor }, normalY: -1, fixedGeometry: 'PASS' });
}
inspect.cameraPunch.dispose(); inspect.rain.dispose();
delete globalThis.document;
console.log(JSON.stringify(result, null, 2));
