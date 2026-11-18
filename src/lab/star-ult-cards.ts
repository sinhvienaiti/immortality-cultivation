/** 454: intact source art on stock materials; UV changes only select atlas frames. */
import * as THREE from "three";
export interface StarAtlas { cols: number; rows: number; frames: number; fps: number; variants?: number; cell?: number[]; }
export class StarCards {
  readonly meshes: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  meta: StarAtlas = { cols: 1, rows: 1, frames: 1, fps: 0 };
  private readonly geometry = new THREE.PlaneGeometry();
  private readonly maps: THREE.Texture[] = [];
  private aspect = 1;
  constructor(parent: THREE.Object3D, readonly name: string, count: number, readonly tint: readonly [number, number, number] = [.9, .9, .9]) {
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(...tint), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Mesh(this.geometry, material); mesh.name = `star-ult-${name}-${i}`;
      mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 11;
      parent.add(mesh); this.meshes.push(mesh);
    }
  }
  attach(texture: THREE.Texture, meta: StarAtlas, aspect: number): void {
    this.meta = meta; this.aspect = aspect;
    this.geometry.scale(aspect, 1, 1);
    for (const mesh of this.meshes) {
      const map = texture.clone(); map.needsUpdate = true; map.generateMipmaps = false;
      map.minFilter = map.magFilter = THREE.LinearFilter; map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
      map.repeat.set(1 / meta.cols, 1 / meta.rows); this.maps.push(map);
      mesh.material.map = map; mesh.material.needsUpdate = true;
    }
  }
  put(i: number, at: THREE.Vector3, width: number, opacity: number, frame = 0, variant = 0,
    camera?: THREE.PerspectiveCamera, turn = 0): void {
    const mesh = this.meshes[i]; if (!mesh || !mesh.material.map) return;
    mesh.visible = opacity > .001 && width > 0; if (!mesh.visible) return;
    mesh.position.copy(at); mesh.scale.setScalar(width / this.aspect); mesh.material.opacity = Math.min(1, opacity);
    if (camera) { mesh.quaternion.copy(camera.quaternion); mesh.rotateZ(turn); }
    else { mesh.rotation.set(-Math.PI / 2, 0, turn); }
    const f = Math.min(this.meta.frames - 1, Math.max(0, Math.floor(frame))) + variant * this.meta.frames;
    mesh.material.map.offset.set((f % this.meta.cols) / this.meta.cols, 1 - (Math.floor(f / this.meta.cols) + 1) / this.meta.rows);
  }
  clear(): void { for (const m of this.meshes) m.visible = false; }
  dispose(): void { for (const m of this.meshes) { m.removeFromParent(); m.material.dispose(); } for (const t of this.maps) t.dispose(); this.geometry.dispose(); }
}
