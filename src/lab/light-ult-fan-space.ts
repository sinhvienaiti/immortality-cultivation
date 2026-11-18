/** 453: approved image cards and the authored relic; timing stays in light-ult-fan.ts. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import type { LabCaster } from "./caster";

export const ease = (n: number): number => { const x = THREE.MathUtils.clamp(n, 0, 1); return x * x * (3 - 2 * x); };
export const noise = (n: number): number => { const x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
export class FanBeams {
  readonly rows: { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; hdr: boolean }[] = [];
  ready = false;
  private readonly dir = new THREE.Vector3();
  private readonly across = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly towardCamera = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  constructor(parent: THREE.Object3D, private readonly camera: THREE.Camera, count = 16) {
    // 453 light-ray-a2.v1-try2.png: original 4:1 card; source at u=.075, authored tail at u=.925.
    const geo = new THREE.PlaneGeometry(4, 1); geo.translate(4 * (.5 - .075), 0, 0);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.9,.9,.9),
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat); mesh.name = "light-ult-ray-" + i;
      mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 16;
      parent.add(mesh); this.rows.push({ mesh, hdr: false });
    }
  }
  async prepare(base: string, upload: (t: THREE.Texture) => void): Promise<void> {
    if (this.ready) return;
    const texture = await new THREE.TextureLoader().loadAsync(base + "light/stills/light-ray-a2.v1-try2.png");
    texture.colorSpace = THREE.SRGBColorSpace;
    for (const { mesh } of this.rows) { mesh.material.map = texture; mesh.material.needsUpdate = true; }
    upload(texture); this.ready = true;
  }
  clear(): void { for (const r of this.rows) { r.mesh.visible = false; r.hdr = false; } }
  set(i: number, start: THREE.Vector3, end: THREE.Vector3, _width: number, alpha: number, time: number, hdr = false, growth = 1): void {
    const r = this.rows[i]!; r.mesh.visible = this.ready && alpha > .002 && growth > .001;
    // The focus remains the primary ray; secondary cards never exceed .9 in any linear RGB channel.
    r.hdr = hdr && r.mesh.visible;
    r.mesh.material.color.setScalar(hdr ? (time >= 1.95 ? 3.5 : 6) : .9); r.mesh.material.opacity = THREE.MathUtils.clamp(alpha, 0, 1);
    this.dir.subVectors(end, start); const length = this.dir.length(); this.dir.normalize();
    this.camera.getWorldPosition(this.towardCamera).sub(start);
    this.across.crossVectors(this.towardCamera, this.dir).normalize();
    if (this.across.lengthSq() < .001) this.across.set(0, 1, 0);
    this.normal.crossVectors(this.dir, this.across).normalize();
    r.mesh.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.dir, this.across, this.normal));
    r.mesh.position.copy(start);
    r.mesh.scale.setScalar(length / (4 * (.925 - .075)) * THREE.MathUtils.clamp(growth, 0, 1));
  }
  get hdrCount(): number { return this.rows.filter(r => r.mesh.visible && r.hdr).length; }
  get live(): number { return this.rows.filter(r => r.mesh.visible).length; }
}

export class HeldLens {
  readonly root = new THREE.Group();
  readonly centre = new THREE.Vector3();
  readonly radius = .48;
  ready = false;
  private readonly glassMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly bounds = new THREE.Box3();
  private readonly grips = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly head = new THREE.Vector3();
  private readonly temp = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly front = new THREE.Vector3(0, 0, -1);
  private readonly target = new THREE.Vector3();
  constructor(parent: THREE.Object3D, private readonly caster: () => LabCaster) {
    // 453c: retain about 60% of 453b uniformly, including the close camera punch.
    this.root.name = "light-ult-floating-lens"; this.root.scale.setScalar(1.76);
    parent.add(this.root); this.root.visible = false;
  }
  async prepare(base: string, upload: (t: THREE.Texture) => void): Promise<void> {
    if (this.ready) return;
    // 453 light-relic-mirror.tripo.v1.glb, from light-relic-mirror-a.v2-try2.png; keep original geometry and PBR maps.
    // 453 misty_pines_2k.hdr: existing lab environment; three r170 prefilters this equirectangular map through PMREM.
    const [gltf, environment] = await Promise.all([
      new GLTFLoader().loadAsync(base + "light/models3d/tripo/light-relic-mirror.tripo.v1.glb"),
      new RGBELoader().loadAsync(base + "../lookdev/misty_pines_2k.hdr"),
    ]);
    environment.mapping = THREE.EquirectangularReflectionMapping; upload(environment);
    const model = gltf.scene; model.rotation.y = Math.PI / 2; model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model);
    const scale = (this.radius + .036) * 2 / box.getSize(new THREE.Vector3()).y;
    // 453b: the source sits at the authored glass centre, rather than the decorative bounds centre.
    model.scale.setScalar(scale); model.position.set(0, .055 * scale, 0); model.updateWorldMatrix(true, true);
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = (Array.isArray(object.material) ? object.material[0] : object.material) as THREE.MeshStandardMaterial;
      material.envMap = environment; material.envMapIntensity = .85;
      const glass = material.clone(); glass.emissive.setRGB(.9,.72,.4); glass.emissiveMap = material.map;
      glass.emissiveIntensity = 0; this.glassMaterials.push(glass);
      // Assign existing central surface triangles to a luminous material; no new surface or painted mask.
      const geometry = object.geometry as THREE.BufferGeometry, indices = geometry.index!;
      const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
      geometry.clearGroups(); let groupStart = 0, previous = -1;
      for (let i = 0; i < indices.count; i += 3) {
        this.a.set(0,0,0); let nx = 0;
        for (let j = 0; j < 3; j++) { const index = indices.getX(i+j); this.a.add(this.b.fromBufferAttribute(positions,index)); nx += normals.getX(index); }
        this.a.multiplyScalar(1/3);
        const slot = Math.hypot(this.a.y + .055, this.a.z) < .285 && Math.abs(nx/3) > .65 ? 1 : 0;
        if (slot !== previous) { if (previous >= 0) geometry.addGroup(groupStart,i-groupStart,previous); groupStart=i; previous=slot; }
      }
      geometry.addGroup(groupStart,indices.count-groupStart,previous); object.material = [material,glass];
      for (const texture of [material.map,material.normalMap,material.metalnessMap,material.roughnessMap]) if (texture) upload(texture);
    });
    // Merge adjacent material runs into two index ranges; all authored triangles and vertices stay intact.
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry as THREE.BufferGeometry, index = geometry.index!;
      const byMaterial: number[][] = [[],[]];
      for (const group of geometry.groups) for (let i=group.start;i<group.start+group.count;i++) byMaterial[group.materialIndex!]!.push(index.getX(i));
      geometry.setIndex([...byMaterial[0]!,...byMaterial[1]!]); geometry.clearGroups();
      geometry.addGroup(0,byMaterial[0]!.length,0); geometry.addGroup(byMaterial[0]!.length,byMaterial[1]!.length,1);
    });
    this.bounds.setFromObject(model);
    for (const [i, sign] of [-1,1].entries()) {
      const desired = new THREE.Vector3(sign * this.radius * .5, -this.radius * .866 - .22, 0); let nearest = Infinity;
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const position = object.geometry.getAttribute("position");
        for (let v=0;v<position.count;v++) {
          this.temp.fromBufferAttribute(position,v).applyMatrix4(object.matrixWorld);
          const distance = this.temp.distanceToSquared(desired);
          if (distance < nearest) { nearest=distance; this.grips[i]!.copy(this.temp); }
        }
      });
    }
    this.root.add(model); this.ready = true;
  }
  // 453b: local -Z is the emitting face; preserve an upright mirror while following the fan axis.
  face(direction: THREE.Vector3): void {
    this.root.quaternion.setFromUnitVectors(this.front, direction);
    this.root.updateWorldMatrix(true, true);
  }
  pose(t: number): void {
    const c = this.caster(), rig = c.anim?.rig, head = rig?.bone("head");
    c.root.updateWorldMatrix(true, true);
    if (head) head.getWorldPosition(this.head); else this.head.set(c.x, c.heightM * .9, c.z);
    // 453c: lower the hover with the smaller mirror; keep its source above the head through aftermath.
    const lift = ease(t / .36), hover = .021 * Math.sin(t * 2.4) * lift;
    this.centre.copy(this.head); this.centre.y += .90 + .06 * lift + hover;
    this.centre.z -= 2.40 + .15 * lift; // 453c: a small forward offset also keeps Alt+2 below 15% width.
    this.root.position.copy(this.centre);
    this.root.visible = this.ready && t >= 0 && t < 3.6;
    this.root.updateWorldMatrix(true, true);
    // 453b: only the existing glass material charges; the metal retains its PBR environment.
    const k = t < .6 ? .06 + .30 * ease(t / .6) : t < 2.3 ? .32 : .32 * (1 - ease((t - 2.3) / 1.3));
    for (const material of this.glassMaterials) material.emissiveIntensity = k;
  }
  grip(): { leftErrorM: number | null; rightErrorM: number | null; bones: string[]; positions: Record<string, number[]> } {
    const rig = this.caster().anim?.rig;
    const error = (side: string): number | null => {
      const hand = rig?.bone("hand_" + side); if (!hand) return null;
      hand.getWorldPosition(this.temp); this.target.copy(this.grips[side === "r" ? 1 : 0]!).applyMatrix4(this.root.matrixWorld);
      return this.temp.distanceTo(this.target);
    };
    const positions: Record<string, number[]> = {};
    for (const n of ["head","upperarm_l","lowerarm_l","hand_l","upperarm_r","lowerarm_r","hand_r"]) { const b=rig?.bone(n); if(b)positions[n]=b.getWorldPosition(this.temp).toArray(); }
    return { positions, leftErrorM: error("l"), rightErrorM: error("r"), bones: rig?.names ?? [] };
  }
  bbox(camera: THREE.Camera): { width: number; height: number; x: number; y: number; inside: boolean } {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    this.root.updateWorldMatrix(true, true);
    if (!this.ready) return { width: 0, height: 0, x: 0, y: 0, inside: false };
    for (let i = 0; i < 8; i++) {
      this.temp.set(i & 1 ? this.bounds.max.x : this.bounds.min.x,
        i & 2 ? this.bounds.max.y : this.bounds.min.y, i & 4 ? this.bounds.max.z : this.bounds.min.z);
      this.temp.applyMatrix4(this.root.matrixWorld).project(camera);
      const x = (this.temp.x * .5 + .5) * innerWidth, y = (.5 - this.temp.y * .5) * innerHeight;
      x0 = Math.min(x0,x); x1 = Math.max(x1,x); y0 = Math.min(y0,y); y1 = Math.max(y1,y);
    }
    return { width: x1-x0, height: y1-y0, x: x0, y: y0, inside: x0>=0 && y0>=0 && x1<innerWidth && y1<innerHeight };
  }
}
