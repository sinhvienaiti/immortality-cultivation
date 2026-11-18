/** Intact A quads; original giant GLB with the owner's C painting behind it (433k). */
import * as THREE from "three";
import art from "../../art-src/lab/vfx/metal-ult/energy-sword-a.json";
import auraArt from "../../art-src/lab/vfx/metal-ult/giant-sword-aura-c.json";

let probe: EnergyASwordLayer | null = null;
/** 433l: seconds a small sword stays planted before its 0.5 s opacity fade. */
export const SMALL_PLANT_HOLD = 4.5; // 433p owner: +3 s planted.
export const energyASnapshot = () => probe?.snapshot() ?? null;
export const measureEnergyASwords = () => probe?.measure() ?? null;

export class EnergyASwordLayer {
  readonly group = new THREE.Group();
  private readonly small: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly frozen: boolean[] = [];
  private readonly giantRoot = new THREE.Group();
  private readonly giant: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly auraGeometry = new THREE.PlaneGeometry(auraArt.size[0]! / auraArt.slot.heightPixels, auraArt.size[1]! / auraArt.slot.heightPixels);
  private readonly aura = new THREE.Mesh(this.auraGeometry, new THREE.MeshBasicMaterial({
    color: new THREE.Color(3.2, 3.2, 3.2), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false }));
  private readonly giantCentre = new THREE.Vector3();
  private readonly viewRay = new THREE.Vector3();
  private readonly widthAxis = new THREE.Vector3();
  private readonly depthAxis = new THREE.Vector3();
  private auraScaleRatio = 1;
  private readonly geometry = new THREE.PlaneGeometry(art.size[0]! / art.lengthPixels, art.size[1]! / art.lengthPixels);
  private readonly matrix = new THREE.Matrix4();
  private readonly basis = new THREE.Matrix4();
  private readonly axis = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly cameraAt = new THREE.Vector3();
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private viewport = new THREE.Vector2();
  constructor(private readonly base: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>,
    private readonly time: THREE.IUniform<number>, private readonly capacity: number,
    private readonly timing: { birth: number; impact: number },
    giantSource?: { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }) {
    this.group.name = "fx-metal-rain-energy-a-swords"; base.parent?.add(this.group); base.visible = false;
    this.geometry.translate((art.size[0]! / 2 - art.tip.pixels[0]!) / art.lengthPixels,
      (art.tip.pixels[1]! - art.size[1]! / 2) / art.lengthPixels, 0);
    const capture = (r: THREE.WebGLRenderer, s: THREE.Scene) => { this.renderer = r; this.scene = s; };
    for (let i = 0; i < capacity - 1; i++) {
      const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.62, 0.62), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Mesh(this.geometry, material); mesh.name = "fx-metal-rain-energy-a-" + i;
      mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 9; mesh.onBeforeRender = capture;
      this.group.add(mesh); this.small.push(mesh);
    }
    // 433n: the giant uses the owner-approved no-rock-base GLB (its own geometry and material).
    const material = (giantSource?.material ?? base.material).clone();
    material.transparent = true; // Only opacity changes during the existing dissolve interval.
    this.giant = new THREE.Mesh(giantSource?.geometry ?? base.geometry, material); this.giant.name = "fx-metal-rain-giant-pbr";
    this.giant.frustumCulled = false; this.giant.renderOrder = 9; this.giant.onBeforeRender = capture;
    this.giantRoot.matrixAutoUpdate = false; this.giantRoot.visible = false; this.giantRoot.add(this.giant); this.group.add(this.giantRoot);
    this.auraGeometry.translate((auraArt.size[0]! / 2 - auraArt.slot.centerPixels[0]!) / auraArt.slot.heightPixels,
      (auraArt.slot.centerPixels[1]! - auraArt.size[1]! / 2) / auraArt.slot.heightPixels, 0);
    this.aura.name = "fx-metal-rain-giant-aura-c"; this.aura.visible = false; this.aura.frustumCulled = false;
    // Paint before the giant so its original material covers C; ground must not slice the glow.
    this.aura.renderOrder = 8; this.group.add(this.aura);
    probe = this;
  }
  attach(sword: THREE.Texture, aura: THREE.Texture): void {
    for (const mesh of this.small) { mesh.material.map = sword; mesh.material.needsUpdate = true; }
    this.aura.material.map = aura; this.aura.material.needsUpdate = true;
  }
  sync(count: number): void {
    const decay = this.base.geometry.getAttribute("iDissolve");
    for (let i = 0; i < this.capacity; i++) {
      this.base.getMatrixAt(i, this.matrix);
      const visible = i < count && Math.abs(this.matrix.determinant()) > 1e-9;
      const fade = 1 - THREE.MathUtils.smoothstep(this.time.value, decay.getX(i), decay.getY(i));
      if (i === this.capacity - 1) {
        this.giantRoot.visible = visible; this.giantRoot.matrix.copy(this.matrix); this.giantRoot.matrixWorldNeedsUpdate = true;
        this.giant.material.opacity = this.base.material.opacity * fade;
        const t = this.time.value, { birth, impact } = this.timing;
        const enter = THREE.MathUtils.smoothstep(t, birth, birth + 0.08);
        const rise = THREE.MathUtils.smoothstep(t, birth, impact);
        const pulse = t < impact ? 1 : 0.96 + 0.04 * Math.cos((t - impact) * Math.PI * 2 * 1.4);
        this.aura.material.opacity = enter * (0.72 + 0.18 * rise) * pulse * this.giant.material.opacity;
        this.aura.visible = visible && this.aura.material.map !== null && this.aura.material.opacity > 0.001;
      } else {
        const mesh = this.small[i]!; mesh.visible = visible;
        mesh.position.setFromMatrixPosition(this.matrix); mesh.scale.setScalar(this.axis.setFromMatrixColumn(this.matrix, 1).length());
        if (!visible || this.time.value < decay.getX(i) - SMALL_PLANT_HOLD) this.frozen[i] = false;
        if (!this.frozen[i]) mesh.quaternion.setFromRotationMatrix(this.basis.extractRotation(this.matrix));
        if (!visible || this.time.value < decay.getX(i) - SMALL_PLANT_HOLD) this.frozen[i] = false;
        mesh.material.opacity = 0.85 * fade;
      }
    }
  }
  face(camera: THREE.PerspectiveCamera, width: number, height: number): void {
    this.camera = camera; this.viewport.set(width, height); this.cameraAt.setFromMatrixPosition(camera.matrixWorld);
    for (let i = 0; i < this.small.length; i++) {
      const mesh = this.small[i]!; if (!mesh.visible) continue;
      // 433l: once planted, the quad stays fixed in world space at its planting angle.
      const planted = this.time.value >= this.base.geometry.getAttribute("iDissolve").getX(i) - SMALL_PLANT_HOLD;
      if (planted && this.frozen[i]) continue;
      if (planted) this.frozen[i] = true;
      this.base.getMatrixAt(i, this.matrix); this.axis.setFromMatrixColumn(this.matrix, 1).normalize();
      this.normal.subVectors(this.cameraAt, mesh.position); this.right.crossVectors(this.axis, this.normal);
      if (this.right.lengthSq() < 1e-10) this.right.setFromMatrixColumn(camera.matrixWorld, 0).projectOnPlane(this.axis);
      this.right.normalize(); this.normal.crossVectors(this.right, this.axis).normalize();
      mesh.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.right, this.axis, this.normal));
    }
    if (this.aura.visible) {
      this.base.getMatrixAt(this.capacity - 1, this.matrix);
      const length = this.axis.setFromMatrixColumn(this.matrix, 1).length(); this.axis.normalize();
      this.giantCentre.set(0, 0.5, 0).applyMatrix4(this.matrix);
      this.viewRay.subVectors(this.cameraAt, this.giantCentre);
      const distance = this.viewRay.length(); this.viewRay.normalize();
      this.right.crossVectors(this.axis, this.viewRay);
      if (this.right.lengthSq() < 1e-10) this.right.setFromMatrixColumn(camera.matrixWorld, 0).projectOnPlane(this.axis);
      this.right.normalize(); this.normal.crossVectors(this.right, this.axis).normalize();
      // Shift along the camera ray and scale uniformly: both slot anchors keep exact screen alignment.
      const bounds = this.giant.geometry.boundingBox!;
      this.widthAxis.setFromMatrixColumn(this.matrix, 0).normalize();
      this.depthAxis.setFromMatrixColumn(this.matrix, 2).normalize();
      const support = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) * Math.abs(this.normal.dot(this.widthAxis))
        + Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) * Math.abs(this.normal.dot(this.depthAxis));
      const back = length * (support + 0.015) / Math.max(1e-4, this.normal.dot(this.viewRay));
      this.auraScaleRatio = 1 + back / distance;
      this.aura.position.copy(this.giantCentre).addScaledVector(this.viewRay, -back);
      this.aura.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.right, this.axis, this.normal));
      this.aura.scale.setScalar(length * this.auraScaleRatio);
    }
  }
  snapshot() {
    const camera = this.camera; this.group.updateMatrixWorld(true);
    const p = new THREE.Vector3(), q = new THREE.Vector3(), m = new THREE.Matrix4();
    const project = (v: THREE.Vector3) => { v.project(camera!); return new THREE.Vector2((1+v.x)*this.viewport.x/2,(1-v.y)*this.viewport.y/2); };
    const rows = this.small.flatMap((mesh, id) => {
      if (!mesh.visible || !camera) return [];
      this.base.getMatrixAt(id, m); m.premultiply(this.base.matrixWorld);
      const tip = p.set(0,0,0).applyMatrix4(mesh.matrixWorld).clone(), hilt = q.set(0,1,0).applyMatrix4(mesh.matrixWorld).clone();
      const expectedTip = p.set(0,0,0).applyMatrix4(m).clone(), expectedHilt = q.set(0,1,0).applyMatrix4(m).clone();
      const realPx = project(tip.clone()).distanceTo(project(hilt.clone()));
      const exposedTip = tip.clone();
      if (tip.y < 0 && hilt.y > 0) exposedTip.lerp(hilt, -tip.y / (hilt.y - tip.y));
      const expectedPx = project(expectedTip.clone()).distanceTo(project(expectedHilt.clone()));
      const axis = hilt.clone().sub(tip).normalize(), toCamera = this.cameraAt.clone().sub(tip).projectOnPlane(axis).normalize();
      const normal = new THREE.Vector3(0,0,1).applyQuaternion(mesh.quaternion);
      const impact = this.base.geometry.getAttribute("iDissolve").getX(id) - SMALL_PLANT_HOLD;
      return [{id,opacity:mesh.material.opacity,planted:this.time.value>=impact,fullyPlanted:this.time.value>=impact+0.1,
        scale:mesh.scale.toArray(),heightPx:realPx,verticalPx:Math.abs(project(tip.clone()).y-project(hilt.clone()).y),exposedVerticalPx:Math.abs(project(exposedTip).y-project(hilt.clone()).y),tipPx:project(tip.clone()).toArray(),hiltPx:project(hilt.clone()).toArray(),heightRatio:realPx/expectedPx,
        tip:tip.toArray(),hilt:hilt.toArray(),anchorErrorM:Math.max(tip.distanceTo(expectedTip),hilt.distanceTo(expectedHilt)),
        facingDot:normal.dot(toCamera),buriedFraction:-tip.y/(hilt.y-tip.y),
        stockShader:mesh.material.onBeforeCompile===THREE.Material.prototype.onBeforeCompile}];
    });
    let smallModels = 0, qiStreaks = 0;
    this.group.parent?.traverse(o => { if (!(o instanceof THREE.Mesh) || !o.visible) return;
      if (o.name === "fx-metal-rain-small-pbr") smallModels++;
      if ((o.material as THREE.MeshBasicMaterial).map?.image?.src?.includes("qi-streak")) qiStreaks++;
    });
    return {source:art.source,texture:this.small[0]?.material.map?.image?.src,smallModels,qiStreaks,rows,
      giantModelVisible:this.giantRoot.visible,smallQuads:rows.length,mantle:null,giant:this.giantSnapshot(camera),aura:this.auraSnapshot(camera)};
  }
  private auraSnapshot(camera: THREE.PerspectiveCamera | null) {
    const project = (v: THREE.Vector3) => { v.project(camera!); return new THREE.Vector2((1+v.x)*this.viewport.x/2,(1-v.y)*this.viewport.y/2); };
    const a = project(new THREE.Vector3(0,-0.5,0).applyMatrix4(this.aura.matrixWorld));
    const b = project(new THREE.Vector3(0,0.5,0).applyMatrix4(this.aura.matrixWorld));
    const tip = project(new THREE.Vector3(0,0,0).applyMatrix4(this.giant.matrixWorld));
    const hilt = project(new THREE.Vector3(0,1,0).applyMatrix4(this.giant.matrixWorld));
    let behindMargin = Infinity;
    const vertices = this.giant.geometry.getAttribute("position");
    if (this.aura.visible) for(let i=0;i<vertices.count;i++) {
      const p = new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(this.giant.matrixWorld);
      behindMargin = Math.min(behindMargin, p.sub(this.aura.position).dot(this.normal));
    }
    return {source:auraArt.source,visible:this.aura.visible,opacity:this.aura.material.opacity,scale:this.aura.scale.toArray(),
      texture:this.aura.material.map?.image?.src,slotTipPx:a.toArray(),slotHiltPx:b.toArray(),
      anchorErrorPx:Math.max(a.distanceTo(tip),b.distanceTo(hilt)),slotHeightRatio:a.distanceTo(b)/tip.distanceTo(hilt),
      facingDot:this.normal.dot(this.cameraAt.clone().sub(this.aura.position).projectOnPlane(this.axis).normalize()),
      behindMarginM:Number.isFinite(behindMargin)?behindMargin:null,renderOrder:this.aura.renderOrder,modelRenderOrder:this.giant.renderOrder,
      stockShader:this.aura.material.onBeforeCompile===THREE.Material.prototype.onBeforeCompile};
  }
  private giantSnapshot(camera: THREE.PerspectiveCamera | null) {
    const material = (m: THREE.MeshStandardMaterial) => ({color:m.color.toArray(),metalness:m.metalness,roughness:m.roughness,
      emissive:m.emissive.toArray(),emissiveIntensity:m.emissiveIntensity,normalScale:m.normalScale.toArray(),
      toneMapped:m.toneMapped,vertexColors:m.vertexColors,side:m.side,
      maps:Object.fromEntries(["map","normalMap","roughnessMap","metalnessMap","emissiveMap"].map(k=>{
        const t=(m as unknown as Record<string,THREE.Texture|null>)[k];return [k,t?.uuid??null];})),
      stockShader:m.onBeforeCompile===THREE.Material.prototype.onBeforeCompile});
    const expected=material(this.base.material),actual=material(this.giant.material);
    const p=new THREE.Vector3(), q=new THREE.Vector3();
    const project=(v:THREE.Vector3)=>{v.project(camera!);return [(1+v.x)*this.viewport.x/2,(1-v.y)*this.viewport.y/2];};
    const tip=camera?project(p.set(0,0,0).applyMatrix4(this.giant.matrixWorld)):null;
    const hilt=camera?project(q.set(0,1,0).applyMatrix4(this.giant.matrixWorld)):null;
    return {visible:this.giantRoot.visible,actual,expected,originalMaterial:JSON.stringify(actual)===JSON.stringify(expected),
      tipPx:tip,hiltPx:hilt,heightPx:tip&&hilt?Math.hypot(hilt[0]!-tip[0]!,hilt[1]!-tip[1]!):null,
      verticalPx:tip&&hilt?Math.abs(hilt[1]!-tip[1]!):null};
  }
  measure() {
    const r=this.renderer, scene=this.scene, camera=this.camera; if (!r || !scene || !camera) return null;
    const size=r.getDrawingBufferSize(new THREE.Vector2());
    const target=new THREE.WebGLRenderTarget(size.x,size.y,{type:THREE.HalfFloatType,depthBuffer:true});
    const data=new Uint16Array(size.x*size.y*4),shown=new Map<THREE.Object3D,boolean>();
    const previous=r.getRenderTarget(),background=scene.background,clear=r.getClearColor(new THREE.Color()),alpha=r.getClearAlpha();
    const autoClear=r.autoClear,viewport=r.getViewport(new THREE.Vector4()),scissor=r.getScissor(new THREE.Vector4()),scissorTest=r.getScissorTest();
    const peaks:number[]=[];
    try {
      scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Sprite||o instanceof THREE.Points||o instanceof THREE.Line){shown.set(o,o.visible);o.visible=false;}});
      scene.background=null;r.setClearColor(0,1);r.autoClear=true;r.setScissorTest(false);
      for(const giant of [false,true]) {
        for(const mesh of this.small)mesh.visible=!giant && shown.get(mesh)===true;
        this.giant.visible=giant;
        this.aura.visible=giant && shown.get(this.aura)===true;
        r.setRenderTarget(target);r.clear();r.render(scene,camera);r.readRenderTargetPixels(target,0,0,size.x,size.y,data);
        let peak=0;for(let i=0;i<data.length;i+=4)peak=Math.max(peak,0.2126*THREE.DataUtils.fromHalfFloat(data[i]!)+0.7152*THREE.DataUtils.fromHalfFloat(data[i+1]!)+0.0722*THREE.DataUtils.fromHalfFloat(data[i+2]!));
        peaks.push(peak);
      }
      return {small:peaks[0]!,giant:peaks[1]!,ratio:peaks.every(p=>p>0&&Number.isFinite(p))?peaks[1]!/peaks[0]!:null,size:size.toArray()};
    } finally {
      for(const [o,v]of shown)o.visible=v;scene.background=background;r.setClearColor(clear,alpha);r.autoClear=autoClear;r.setRenderTarget(previous);
      r.setViewport(viewport);r.setScissor(scissor);r.setScissorTest(scissorTest);target.dispose();
    }
  }
  dispose(): void {
    if(probe===this)probe=null;this.geometry.dispose();for(const mesh of this.small)mesh.material.dispose();
    this.giant.material.dispose();if(this.giant.geometry!==this.base.geometry)this.giant.geometry.dispose();this.aura.material.dispose();this.auraGeometry.dispose();this.group.removeFromParent();
  }
}
