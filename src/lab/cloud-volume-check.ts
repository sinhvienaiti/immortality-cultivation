/** Focused CPU checks for 438. No browser, build, game suite, captures or writes. */
import assert from "node:assert/strict";
import * as THREE from "three";
import { CloudVolume } from "./cloud-volume";
import { CLOUD_PRESETS, installCloudVolumeLab } from "./cloud-volume-lab";
import { cloudEnvelope, cloudFrameStats } from "./cloud-volume-probe";
import { fitCamera } from "../view/renderer";

const parent = new THREE.Group(), camera = new THREE.PerspectiveCamera();
fitCamera(camera, 1280 / 720);
const result: Record<string, unknown> = { presets: {}, rates: [] };
for (const [kind, preset] of Object.entries(CLOUD_PRESETS)) {
  const cloud = new CloudVolume(parent, preset); cloud.show(); cloud.update(1);
  assert.equal(cloud.mesh.geometry.index!.count / 3, 2);
  assert.equal(cloud.mesh.material.side, THREE.DoubleSide);
  assert.equal(cloud.mesh.material.forceSinglePass, true);
  assert.equal(cloud.mesh.material.depthWrite, false);
  for (const key of ["uBottom", "uTop", "uGlow"]) {
    assert.ok((cloud.mesh.material.uniforms[key]!.value as THREE.Color).toArray().every(v => v >= 0 && v <= 0.9));
  }
  const envelope = cloudEnvelope(cloud, camera); assert.ok(envelope.widthFraction >= 0.6);
  (result.presets as Record<string, unknown>)[kind] = { envelope, triangles: 12, proxyDraws: 1 };
  cloud.dispose();
}
for (const rate of [15, 30, 60, 120]) {
  const cloud = new CloudVolume(parent); cloud.show();
  for (let i = 0; i < rate * 2; i++) cloud.update(1 / rate);
  assert.equal(cloud.mesh.material.uniforms.uOpacity!.value, 1);
  cloud.hide(); for (let i = 0; i < Math.ceil(rate * 0.7); i++) cloud.update(1 / rate);
  const halfway = cloud.mesh.material.uniforms.uOpacity!.value as number;
  assert.ok(Math.abs(halfway - 0.5) < 0.04);
  cloud.show(); assert.equal(cloud.mesh.material.uniforms.uOpacity!.value, halfway);
  for (let i = 0; i < rate; i++) cloud.update(1 / rate);
  cloud.hide(); for (let i = 0; i < rate * 2; i++) cloud.update(1 / rate);
  assert.equal(cloud.active, false); assert.equal(cloud.mesh.visible, false);
  (result.rates as unknown[]).push({ rate, midDissolve: halfway, endHidden: !cloud.active }); cloud.dispose();
}
const cloud = new CloudVolume(parent, { radius: -1, thickness: NaN, coverage: 3, glowIntensity: 4,
  lightningIntensity: -1, scrollSpeed: NaN, centre: { x: Infinity, z: NaN } });
assert.equal(cloud.parameters.radius, 0.1); assert.equal(cloud.parameters.coverage, 1);
assert.equal(cloud.parameters.lightningIntensity, 0); assert.equal(cloud.parameters.centre.x, 0);
cloud.show(); cloud.update(NaN); assert.ok(Number.isFinite(cloud.mesh.material.uniforms.uOpacity!.value));
cloud.clear(); cloud.dispose(); cloud.dispose(); assert.equal(parent.children.length, 0);

// The adapter must coexist with stress.ts and avoid ageing twice on repeated renders of one host frame.
const listeners = new Map<string, unknown>();
globalThis.window = { addEventListener: (name: string, fn: unknown) => listeners.set(name, fn),
  removeEventListener: (name: string) => listeners.delete(name) } as unknown as Window & typeof globalThis;
const scene = new THREE.Scene(); let prior = 0, now = 0, view = "top";
const before = (): void => { prior++; }; scene.onBeforeRender = before;
const renderer = {} as THREE.WebGLRenderer;
const host = { scene, parent, renderer, camera, time: () => now, view: (mode: string) => { view = mode; }, foes: () => 87 };
assert.equal(installCloudVolumeLab(host, new URLSearchParams()), null); assert.equal(scene.onBeforeRender, before);
const lab = installCloudVolumeLab(host, new URLSearchParams("cloud=thunder")); assert.ok(lab);
const key = (value: string, extra = {}) => ({ key: value, code: value === "q" ? "KeyQ" : "Digit" + value,
  repeat: false, preventDefault() {}, ...extra }) as unknown as KeyboardEvent;
assert.equal(lab.key(key("q")), true);
now = window.__cloud438!.cloud.parameters.appearSeconds / 2; Reflect.apply(scene.onBeforeRender, scene, [renderer, scene, camera, null]);
const opacity = window.__cloud438!.cloud.mesh.material.uniforms.uOpacity!.value as number;
assert.ok(Math.abs(opacity - 0.5) < 1e-9);
Reflect.apply(scene.onBeforeRender, scene, [renderer, scene, camera, null]);
assert.equal(window.__cloud438!.cloud.mesh.material.uniforms.uOpacity!.value, opacity); assert.equal(prior, 2);
assert.equal(lab.key(key("2")), true); assert.equal(view, "behind");
assert.equal(lab.key(key("q", { ctrlKey: true })), false);
lab.dispose(); assert.equal(scene.onBeforeRender, before); assert.equal(window.__cloud438, undefined);
assert.equal(parent.children.length, 0); assert.equal(listeners.size, 0);
assert.equal(cloudFrameStats([1, 3, 2, 4, 5]).p95Ms, 5);
result.lifecycle = "PASS: invalid numbers, interrupted fade, clear, idempotent disposal";
result.adapter = "PASS: URL gate, keys, preserved scene hook, host clock, teardown";
console.info(JSON.stringify(result, null, 2));
