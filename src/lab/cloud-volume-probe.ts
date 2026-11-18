/** Ticket 438: actual alpha footprint and draw count, isolated from the scene and post passes. */
import * as THREE from "three";
import { CloudVolume } from "./cloud-volume";

export function cloudEnvelope(cloud: CloudVolume, camera: THREE.PerspectiveCamera, width = 1280, height = 720) {
  camera.updateMatrixWorld(true);
  const o = cloud.parameters, p = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let j = 0; j <= 12; j++) for (let i = 0; i < 128; i++) {
    const a = i * Math.PI / 64, h = j / 12;
    const radius = o.radius * (1 - 0.075 * (h * 2 - 1) ** 2);
    p.set(o.centre.x + Math.cos(a) * radius, o.baseHeight + o.thickness * h,
      o.centre.z + Math.sin(a) * radius).project(camera);
    if (p.z < -1 || p.z > 1) continue;
    const x = (p.x + 1) * width / 2, y = (1 - p.y) * height / 2;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const visible = Number.isFinite(x0) && x1 >= 0 && x0 < width && y1 >= 0 && y0 < height;
  return {
    kind: "projected envelope, not alpha coverage", width, height, radiusM: o.radius,
    boundsPx: visible ? [x0, y0, x1, y1].map(x => Math.round(x * 100) / 100) : null,
    widthFraction: visible ? Math.max(0, Math.min(width, x1) - Math.max(0, x0)) / width : 0,
  };
}

export function probeCloudPixels(cloud: CloudVolume, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera,
  width = 1280, height = 720, beasts: { id: number; screen: number[] }[] = []) {
  if (!cloud.active) throw new Error("Show the cloud and let its appearance finish before probing.");
  const material = cloud.mesh.material.clone();
  material.uniforms.uProbe!.value = 1;
  material.toneMapped = false;
  const proxy = new THREE.Mesh(cloud.mesh.geometry, material);
  cloud.mesh.updateWorldMatrix(true, false);
  proxy.matrixAutoUpdate = false;
  proxy.matrix.copy(cloud.mesh.matrixWorld);
  const scene = new THREE.Scene(); scene.add(proxy);
  const probeCamera = camera.clone();
  camera.updateWorldMatrix(true, false);
  camera.matrixWorld.decompose(probeCamera.position, probeCamera.quaternion, probeCamera.scale);
  probeCamera.aspect = width / height; probeCamera.updateProjectionMatrix(); probeCamera.updateMatrixWorld(true);
  const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true });
  const previous = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha(), autoClear = renderer.autoClear, autoReset = renderer.info.autoReset;
  const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4());
  const scissorTest = renderer.getScissorTest(), info = { ...renderer.info.render };
  const pixels = new Uint8Array(width * height * 4);
  try {
    renderer.info.autoReset = false; renderer.autoClear = true;
    renderer.setRenderTarget(target); renderer.setScissorTest(false); renderer.setClearColor(0x000000, 0);
    const before = renderer.info.render.calls;
    renderer.render(scene, probeCamera);
    const cloudDrawCalls = renderer.info.render.calls - before;
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    let x0 = width, x1 = -1, y0 = height, y1 = -1, occupied = 0;
    let dx0 = width, dx1 = -1, dy0 = height, dy1 = -1, densePixels = 0;
    const denseRows = new Uint16Array(height);
    // Alpha >= 8/255 avoids counting nearly invisible noise at the silhouette.
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3]! < 8) continue;
      if (pixels[(y * width + x) * 4 + 3]! >= 128) {
        const sy = height - 1 - y; densePixels++; denseRows[sy]!++;
        dx0 = Math.min(dx0, x); dx1 = Math.max(dx1, x); dy0 = Math.min(dy0, sy); dy1 = Math.max(dy1, sy);
      }
      occupied++; x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, height - 1 - y); y1 = Math.max(y1, height - 1 - y);
    }
    const centres = beasts.map(beast => {
      const [x, y] = beast.screen as [number, number];
      const inFrame = x >= 0 && x < width && y >= 0 && y < height;
      return { id: beast.id, screen: [x, y], inFrame,
        alpha: inFrame ? pixels[((height - 1 - Math.floor(y)) * width + Math.floor(x)) * 4 + 3]! / 255 : 0 };
    });
    const widthFraction = occupied > 0 ? (x1 - x0 + 1) / width : 0;
    const heightFraction = occupied > 0 ? (y1 - y0 + 1) / height : 0;
    return { width, height, radiusM: cloud.parameters.radius,
      dense: { alphaThreshold: 128 / 255, boundsPx: densePixels ? [dx0, dy0, dx1, dy1] : null,
        bottomPct: densePixels ? (dy1 + 1) / height * 100 : 0,
        widthFraction: densePixels ? (dx1 - dx0 + 1) / width : 0,
        areaFraction: densePixels / (width * height),
        rowsAt60PctWidth: Array.from(denseRows).flatMap((n, y) => n >= width * 0.6 ? [y] : []) },
      alphaThreshold: 8 / 255, cloudDrawCalls,
      boundsPx: occupied > 0 ? [x0, y0, x1, y1] : null, widthFraction, heightFraction, areaFraction: occupied / (width * height),
      bottomPct: occupied > 0 ? (y1 + 1) / height * 100 : 0,
      denseAlphaThreshold: 0.5, coveredBeasts: centres.filter(b => b.inFrame && b.alpha >= 0.5).length, centres,
      widthGate: widthFraction >= 0.6, drawGate: cloudDrawCalls <= 2 && cloudDrawCalls > 0 };
  } finally {
    renderer.setRenderTarget(previous); renderer.setViewport(viewport); renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest); renderer.setClearColor(clear, clearAlpha); renderer.autoClear = autoClear;
    renderer.info.autoReset = autoReset; Object.assign(renderer.info.render, info);
    target.dispose(); material.dispose();
  }
}

export function cloudFrameStats(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number): number | null => sorted.length ? sorted[Math.ceil(p * sorted.length) - 1]! : null;
  return { samples: sorted.length, p50Ms: at(0.5), p95Ms: at(0.95), maxMs: sorted.at(-1) ?? null };
}

/** Reproduce the exact deck uniforms without changing the host clock, lights or camera. */
let snapshotRenderer: THREE.WebGLRenderer | undefined;
export function probeCloudSnapshot(state: ReturnType<CloudVolume["probeState"]>,
  camera: { position: number[]; quaternion: number[]; fov: number }, beasts: { id: number; screen: number[] }[]) {
  const renderer = snapshotRenderer ??= new THREE.WebGLRenderer({ antialias: false });
  const scene = new THREE.Scene();
  const cloud = new CloudVolume(scene, { ...state.parameters, appearSeconds: 0 });
  const c = new THREE.PerspectiveCamera(camera.fov, 1280 / 720, 0.01, 1000);
  c.position.fromArray(camera.position); c.quaternion.fromArray(camera.quaternion); c.updateMatrixWorld(true);
  try {
    cloud.show(); cloud.update(0);
    cloud.mesh.material.uniforms.uTime!.value = state.time;
    cloud.mesh.material.uniforms.uOpacity!.value = state.opacity;
    return probeCloudPixels(cloud, renderer, c, 1280, 720, beasts);
  } finally { cloud.dispose(); }
}
