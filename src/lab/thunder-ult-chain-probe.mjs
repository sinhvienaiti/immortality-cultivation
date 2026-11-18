/** Ticket 434b. CPU geometry/timeline probe; real atlas metadata, CPU texture upload substitute. No GPU claim. */
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import * as THREE from "three";
import { fitCamera } from "../view/renderer.ts";
import { ThunderUltChain } from "./thunder-ult-chain.ts";

const base = new URL("../../art-src/lab/vfx/", import.meta.url).href;
const realFetch = globalThis.fetch, realLoad = THREE.TextureLoader.prototype.loadAsync;
const textures = [];
let requests = 0, disposed = 0;
globalThis.fetch = async url => { requests++; return new Response(await readFile(new URL(String(url)), "utf8")); };
THREE.TextureLoader.prototype.loadAsync = async function(url) {
  await access(new URL(url));
  const t = new THREE.Texture(); textures.push(t); t.addEventListener("dispose", () => disposed++); return t;
};
const parent = new THREE.Group(), camera = new THREE.PerspectiveCamera();
const fit = fitCamera(camera, 1280 / 720);
const xs = Array.from({ length: 100 }, (_, i) => (i % 10 - 4.5) * 2.6);
const zs = Array.from({ length: 100 }, (_, i) => -17 + Math.floor(i / 10) * 1.6);
const alive = new Array(100).fill(true);
const targets = { size: 100, alive: i => alive[i] ?? false, x: i => xs[i], z: i => zs[i], midY: () => 0.85 };
const sounds = [], hits = [];
const chain = new ThunderUltChain(parent, base, { targets, camera,
  caster: p => p.set(0, 0, 4), hand: p => p.set(0, 1.4, 3.5),
  release() {}, stun() {}, blow(i) { hits.push(i); return false; }, strike() {}, sound: e => sounds.push(e),
});
const state = () => {
  const geometries = new Set(), materials = new Set(); let objects = 0;
  parent.traverse(o => { objects++; if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
  return { objects, geometries: geometries.size, materials: materials.size };
};
const seek = t => { const dt = t - chain.last.clock; assert(dt >= -1e-9); chain.update(Math.max(0, dt)); };
try {
  await chain.prepare(); assert(chain.ready); assert.equal(textures.length, 8);
  chain.cast();
  const stableResources = state(), phases = [];
  for (const t of [0.4, 1.2, 2, 2 + 1 / 60, 2 + 2 / 60, 2.2, 3, 3.45]) {
    seek(t);
    const r = chain.last, arcs = chain.group.getObjectByName("thunder-chain-world-tubes");
    const flash = Array.from({ length: arcs.geometry.instanceCount }, (_, i) => arcs.geometry.getAttribute("iLook").getZ(i)).some(x => x % 2 > 0);
    phases.push({ at: t, live: chain.live, hops: r.hops.length, flash });
    if (Math.abs(t - 2) < 1e-8 || Math.abs(t - (2 + 1 / 60)) < 1e-8) assert(flash);
    if (Math.abs(t - (2 + 2 / 60)) < 1e-8) assert(!flash);
    assert(r.cloud.centre[1] >= 13.2); assert(r.cloud.centre[2] <= r.cloud.targetCentre[2] - 9.5);
    if (t === 2.2) {
      const ground = r.sections.filter(s => !s.primary && Math.abs(s.born - 2) < 1e-8);
      assert.equal(ground.length, 8 * 18);
      assert(ground.every(s => Math.abs(s.start[1] - 0.08) < 1e-7 && s.start[1] === s.end[1]));
    }
    assert.equal(chain.dropped, 0);
  }
  const r = chain.last;
  assert(r.hops.length >= 2 && r.hops.length <= 14); assert.equal(new Set(r.hops.map(h => h.target)).size, r.hops.length);
  assert.equal(r.climaxAt, 2); assert.equal(r.climax.branches, 8);
  assert(r.climax.branchLengthsM.every(x => x >= 3.6 && x <= 5.8));
  assert(Math.abs(r.climax.start[1] - 7) < 1e-8); assert.equal(r.climax.end[1], 0.08);
  assert(r.hops.every(h => h.widthM === 1.04 && h.widthPx > 0 && h.holdS === 0.22 && h.branches === 3));
  const turns = r.hops.slice(1).map(h => h.turnDeg);
  for (let i = 0; i < turns.length; i++) {
    assert(Math.abs(turns[i]) >= 35 && Math.abs(turns[i]) <= 80);
    const previous = r.hops[i], current = r.hops[i + 1];
    const ax = previous.end[0] - previous.start[0], az = previous.end[2] - previous.start[2];
    const bx = current.end[0] - current.start[0], bz = current.end[2] - current.start[2];
    const measured = Math.atan2(ax * bz - az * bx, ax * bx + az * bz) * 180 / Math.PI;
    assert(Math.abs(measured - turns[i]) < 1e-8);
    if (i > 0) assert(turns[i] * turns[i - 1] < 0);
  }
  assert.equal(r.climax.groundHoldS + r.climax.groundFadeS, 0.5);
  assert.equal(r.climax.scorchFadeS, 1.5);
  assert(!chain.pools.has('thunder-ground-mark'));
  assert(chain.pools.has('thunder-scorch-crack-top'));
  const ground = r.sections.filter(s => !s.primary && Math.abs(s.born - 2) < 1e-8);
  assert(ground.every(s => s.start[1] === s.end[1]));
  assert.equal(r.residualTargets.length, 8); assert.equal(r.residuals, 40);
  // Changing the inspection camera cannot turn or refit any world cloud/decal surface.
  const cloud = chain.group.getObjectByName("thunder-cloud-world-slices");
  const matrices = Array.from(cloud.instanceMatrix.array), cloudBefore = JSON.stringify(r.cloud);
  camera.fov = 50; camera.position.set(0, 2.2, 11); camera.lookAt(0, 1.1, -18); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  chain.update(0); assert.deepEqual(Array.from(cloud.instanceMatrix.array), matrices); assert.equal(JSON.stringify(r.cloud), cloudBefore);
  fitCamera(camera, 1280 / 720);
  chain.update(1); assert.equal(chain.active, false); assert.equal(chain.live, 0);
  assert.deepEqual(state(), stableResources);
  const summary = { kind: "CPU probe; textures substituted, no rendered alpha/GPU timings", targets: 100, fit,
    cloud: r.cloud, widthsPx: r.hops.map(h => h.widthPx), hops: r.hops.length, holdS: r.hops[0].holdS,
    climax: r.climax, residualTargets: r.residualTargets, residualPulses: r.residuals, phases,
    liveAfter4S: chain.live, resources: stableResources, dropped: chain.dropped };
  // Coarse updates, cancellation and reuse must release the same bounded resources.
  const order = r.hops.map(h => h.target);
  for (let i = 0; i < 5; i++) {
    chain.cast(); chain.update(2.2); chain.clear(); assert.equal(chain.live, 0);
    chain.cast(); chain.update(4); assert.deepEqual(chain.last.hops.map(h => h.target), order);
    assert.equal(chain.live, 0); assert.equal(chain.dropped, 0); assert.deepEqual(state(), stableResources);
  }
  alive.fill(false); chain.cast(); chain.update(4); assert.equal(chain.last.hops.length, 0); assert.equal(chain.last.climax, null); assert.equal(chain.live, 0);
  alive[0] = alive[1] = alive[2] = true; chain.cast(); chain.update(4); assert(chain.last.hops.length >= 1 && chain.last.hops.length <= 3);
  assert.equal(requests, 8); chain.dispose(); chain.dispose(); assert.equal(disposed, textures.length); assert.equal(parent.children.length, 0);
  console.log(JSON.stringify({ ...summary, repeatCancel: "PASS ×5", emptyAndThreeTargets: "PASS", disposeTextures: disposed, verdict: "PASS" }, null, 2));
} finally {
  chain.dispose(); globalThis.fetch = realFetch; THREE.TextureLoader.prototype.loadAsync = realLoad;
}
