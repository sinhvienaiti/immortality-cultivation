/** 433h: one intact D painting per sword; stock additive material, axial billboarding. */
import * as THREE from "three";
import art from "../../art-src/lab/vfx/metal-ult/sword-trail-d.json";
import energyArt from "../../art-src/lab/vfx/metal-ult/energy-sword-a.json";

export const METAL_TRAIL_D = { fadeSeconds: 0.2, peakLengthRatio: 1.4 } as const;
let probe: MetalTrailD | null = null;
export const metalTrailDSnapshot = () => probe?.snapshot() ?? null;

export class MetalTrailD {
  readonly group = new THREE.Group();
  readonly geometry = new THREE.PlaneGeometry(art.size[0]! / art.size[1]!, 1);
  private readonly meshes: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly axes: THREE.Vector3[] = [];
  private readonly ratios: number[] = [];
  private readonly at = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private readonly swordMatrix = new THREE.Matrix4();
  private readonly clip = new THREE.Matrix4();
  private readonly projectedHead = new THREE.Vector3();
  private readonly projectedTip = new THREE.Vector3();
  private readonly projectedTail = new THREE.Vector3();
  private camera: THREE.PerspectiveCamera | null = null;
  private body: THREE.InstancedMesh | null = null;
  private viewport = new THREE.Vector2();
  ready = false;
  constructor(parent: THREE.Object3D, capacity: number) {
    this.group.name = "fx-metal-rain-trail-d"; parent.add(this.group);
    // Original top-left image coordinates become a local origin at the painted head.
    this.geometry.translate((0.5 - art.anchor.uvTopLeft[0]!) * art.size[0]! / art.size[1]!, art.anchor.uvTopLeft[1]! - 0.5, 0);
    for (let i = 0; i < capacity; i++) {
      const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.8), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.name = "fx-metal-rain-trail-d-" + i; mesh.visible = false; mesh.renderOrder = 11;
      mesh.frustumCulled = false; this.group.add(mesh); this.meshes.push(mesh); this.axes.push(new THREE.Vector3(0, 1, 0)); this.ratios.push(1);
    }
    probe = this;
  }
  attach(texture: THREE.Texture): void {
    for (const mesh of this.meshes) { mesh.material.map = texture; mesh.material.needsUpdate = true; }
    this.ready = true;
  }
  put(id: number, hilt: THREE.Vector3, axis: THREE.Vector3, length: number, opacity: number, ratio: number): void {
    const mesh = this.meshes[id]!;
    mesh.visible = this.ready && opacity > 0.001 && length > 0;
    mesh.position.copy(hilt); this.axes[id]!.copy(axis);
    mesh.scale.setScalar(length * art.size[1]! / art.lengthPixels);
    mesh.material.opacity = opacity;
    this.ratios[id] = ratio;
  }
  face(camera: THREE.PerspectiveCamera, width: number, height: number, body: THREE.InstancedMesh | null): void {
    this.camera = camera; this.viewport.set(width, height); this.body = body;
    // present() runs inside the lab camera hook; never re-enter updateWorldMatrix().
    this.at.setFromMatrixPosition(camera.matrixWorld);
    this.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i]!; if (!mesh.visible) continue;
      const axis = this.axes[i]!;
      this.normal.subVectors(this.at, mesh.position);
      this.right.crossVectors(axis, this.normal);
      if (this.right.lengthSq() < 1e-10) this.right.set(1, 0, 0).applyQuaternion(camera.quaternion).projectOnPlane(axis);
      this.right.normalize(); this.normal.crossVectors(this.right, axis).normalize();
      mesh.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.right, axis, this.normal));
      if (body) {
        // Correct perspective foreshortening with one scalar, preserving the painted aspect ratio.
        body.getMatrixAt(i, this.swordMatrix); this.swordMatrix.premultiply(body.matrixWorld);
        this.projectedHead.copy(mesh.position).project(camera);
        this.projectedTip.set(0, 0, 0).applyMatrix4(this.swordMatrix).project(camera);
        this.projectedTail.copy(mesh.position).add(axis).project(camera);
        const hx = this.projectedHead.x, hy = this.projectedHead.y;
        const sx = (hx - this.projectedTip.x) * width / 2, sy = (hy - this.projectedTip.y) * height / 2;
        const swordPx = Math.hypot(sx, sy);
        if (swordPx > 1e-5) {
          const unitPx = Math.abs(((this.projectedTail.x - hx) * width / 2 * sx
            + (this.projectedTail.y - hy) * height / 2 * sy) / swordPx);
          const e = this.clip.elements, p = mesh.position;
          const w = e[3]! * p.x + e[7]! * p.y + e[11]! * p.z + e[15]!;
          const a = e[3]! * axis.x + e[7]! * axis.y + e[11]! * axis.z;
          const desiredPx = swordPx * this.ratios[i]!, denominator = unitPx * (w + a) - desiredPx * a;
          const length = desiredPx * w / denominator;
          if (length > 0 && Number.isFinite(length)) mesh.scale.setScalar(length * art.size[1]! / art.lengthPixels);
        }
      }
    }
  }
  clear(): void { for (const mesh of this.meshes) mesh.visible = false; }
  snapshot() {
    const camera = this.camera, body = this.body;
    if (!camera || !body) return null;
    this.group.updateMatrixWorld(true);
    const point = new THREE.Vector3(), matrix = new THREE.Matrix4(), hilt = new THREE.Vector3(), tip = new THREE.Vector3();
    const project = (p: THREE.Vector3) => {
      p.project(camera); return new THREE.Vector2((1 + p.x) * this.viewport.x / 2, (1 - p.y) * this.viewport.y / 2);
    };
    const rows = this.meshes.flatMap((mesh, id) => {
      if (!mesh.visible) return [];
      body.getMatrixAt(id, matrix); matrix.premultiply(body.matrixWorld);
      hilt.set(0, 1, 0).applyMatrix4(matrix); tip.set(0, 0, 0).applyMatrix4(matrix);
      const h = project(hilt.clone()), t = project(tip.clone()), along = h.clone().sub(t).normalize();
      const across = new THREE.Vector2(-along.y, along.x);
      const ink = (x: number, y: number) => project(point.set((x - art.anchor.pixels[0]!) / art.size[1]!,
        (art.anchor.pixels[1]! - y) / art.size[1]!, 0).applyMatrix4(mesh.matrixWorld));
      const tail = ink(art.anchor.pixels[0]!, art.inkBounds[1]!);
      const head = project(mesh.position.clone()), depth = mesh.position.clone().project(camera).z;
      const middle = (art.inkBounds[1]! + art.anchor.pixels[1]!) / 2;
      const trailWidth = Math.abs(ink(art.inkBounds[0]!, middle).sub(ink(art.inkBounds[2]!, middle)).dot(across));
      let min = Infinity, max = -Infinity;
      const energy = this.group.parent?.getObjectByName("fx-metal-rain-energy-a-" + id);
      const vertices = body.geometry.getAttribute("position");
      // Measure the intact blade/guard, excluding only the source model's pedestal below local y=0.
      if (energy) {
        // A's authored visible bounds, transformed by its actual axial billboard.
        for (const x of [energyArt.inkBounds[0]!, energyArt.inkBounds[2]!]) for (const y of [energyArt.hilt.pixels[1]!, energyArt.tip.pixels[1]!]) {
          const p = project(point.set((x - energyArt.tip.pixels[0]!) / energyArt.lengthPixels,
            (energyArt.tip.pixels[1]! - y) / energyArt.lengthPixels, 0).applyMatrix4(energy.matrixWorld)).dot(across);
          min = Math.min(min, p); max = Math.max(max, p);
        }
      } else for (let v = 0; v < vertices.count; v++) {
        if (vertices.getY(v) < 0 || vertices.getY(v) > 1) continue;
        const p = project(point.fromBufferAttribute(vertices, v).applyMatrix4(matrix)).dot(across);
        min = Math.min(min, p); max = Math.max(max, p);
      }
      return [{ id, giant: id === this.meshes.length - 1, opacity: mesh.material.opacity,
        x: h.x, y: h.y, inside: depth > -1 && depth < 1 && h.x >= 0 && h.x <= this.viewport.x && h.y >= 0 && h.y <= this.viewport.y,
        swordLengthPx: h.distanceTo(t), trailLengthPx: Math.abs(tail.clone().sub(head).dot(along)),
        trailWidthPx: trailWidth, swordWidthPx: max - min, widthRatio: trailWidth / (max - min),
        lengthRatio: Math.abs(tail.clone().sub(head).dot(along)) / h.distanceTo(t),
        anchorErrorM: mesh.position.distanceTo(hilt), scale: mesh.scale.toArray(),
        stockShader: mesh.material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile }];
    });
    const legacy = this.group.parent?.getObjectByName("fx-metal-rain-trails") as THREE.Mesh<THREE.InstancedBufferGeometry> | undefined;
    return { source: art.source, texture: this.meshes[0]?.material.map?.image?.src,
      anchor: art.anchor, fadeSeconds: METAL_TRAIL_D.fadeSeconds,
      legacyActive: legacy?.visible ? legacy.geometry.instanceCount : 0, rows };
  }
  dispose(): void {
    if (probe === this) probe = null;
    this.group.removeFromParent(); this.geometry.dispose(); for (const mesh of this.meshes) mesh.material.dispose();
  }
}
