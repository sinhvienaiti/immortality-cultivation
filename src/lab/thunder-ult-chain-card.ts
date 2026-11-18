/** 434h: one untouched, endpoint-anchored C quad per hop. No trunk remapping. */
import * as THREE from "three";
import { ease, noise } from "./thunder-ult-chain-space";
const BASE = "/art-src/lab/vfx/thunder/";
interface Variant { file: string; size: [number, number]; anchorsPx: { start: [number, number]; end: [number, number] } }
interface Card { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; from: THREE.Vector3; to: THREE.Vector3; born: number; variant: number; seed: number; width: number; duration: number; followFrom?: (out: THREE.Vector3) => void; followTo?: (out: THREE.Vector3) => void }
export class ThunderChainCards {
  readonly group = new THREE.Group();
  readonly textures = new Set<THREE.Texture>();
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly cards: Card[] = [];
  private variants: Variant[] = [];
  private disposed = false;
  private readonly along = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private t = -10;
  private serial = 0;
  ready = false;
  error: string | null = null;
  constructor(parent: THREE.Object3D, private readonly camera: THREE.PerspectiveCamera | undefined,
    private readonly hide: { value: THREE.Vector3 }, private readonly solo: { value: THREE.Vector3 },
    private readonly upload?: (t: THREE.Texture) => void) {
    this.group.name = "thunder-chain-c-art"; parent.add(this.group);
    for (let i = 0; i < 24; i++) {
      const material = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: null }, uSize: { value: new THREE.Vector2() }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() },
          uFrom: { value: new THREE.Vector3() }, uTo: { value: new THREE.Vector3() }, uSide: { value: new THREE.Vector3() }, uScale: { value: 0 },
          uGain: { value: 0 }, uHopHideEnd: hide, uHopSoloEnd: solo },
        vertexShader: `uniform vec2 uSize, uA, uB;
          uniform vec3 uFrom, uTo, uSide;
          uniform float uScale;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec2 p = vec2(uv.x, 1.0-uv.y) * uSize;
            vec2 axis = normalize(uB-uA), perp = vec2(-axis.y,axis.x);
            float f = dot(p-uA,axis)/length(uB-uA);
            vec3 world = mix(uFrom,uTo,f) + uSide*dot(p-uA,perp)*uScale;
            gl_Position = projectionMatrix * viewMatrix * vec4(world,1.0);
          }`,
        fragmentShader: `uniform sampler2D uMap;
          uniform float uGain;
          uniform vec3 uTo, uHopHideEnd, uHopSoloEnd;
          varying vec2 vUv;
          void main() {
            if(distance(uTo,uHopHideEnd)<0.001 || (uHopSoloEnd.x<1e5 && distance(uTo,uHopSoloEnd)>0.001)) discard;
            vec4 t=texture2D(uMap,vUv);
            vec3 light=t.rgb*t.a;
            float hot=smoothstep(0.6,0.98,max(light.r,max(light.g,light.b)));
            gl_FragColor=vec4((light*0.9 + vec3(0.82,0.76,1.0)*hot*2.6)*uGain,0.0);
          }`,
        transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.name = "flipbook-thunder-nguloi-boltC-card-" + i;
      mesh.frustumCulled = false; mesh.renderOrder = 15; mesh.visible = false;
      this.group.add(mesh);
      this.cards.push({ mesh, from: new THREE.Vector3(), to: new THREE.Vector3(), born: -10, variant: 0, seed: i, width: 0, duration: 0.22 });
    }
  }
  async prepare(): Promise<void> {
    try {
      const response = await fetch(BASE + "thunder-chain-c.json");
      if (!response.ok) throw new Error("C anchors: " + response.status);
      const manifest = await response.json() as { variants: Variant[] };
      this.variants = manifest.variants;
      const maps = await Promise.all(this.variants.map(async v => {
        const t = await new THREE.TextureLoader().loadAsync(BASE + v.file);
        if (this.disposed) { t.dispose(); return t; }
        t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
        t.anisotropy = 8; t.premultiplyAlpha = false;
        this.textures.add(t); this.upload?.(t); return t;
      }));
      if (this.disposed) return;
      for (const c of this.cards) {
        c.mesh.material.userData.maps = maps;
      }
      this.ready = true; this.error = null;
    } catch (e) { this.error = String(e); throw e; }
  }
  hop(from: THREE.Vector3, to: THREE.Vector3, born: number, followFrom?: (out: THREE.Vector3) => void, followTo?: (out: THREE.Vector3) => void, variant?: number, seed?: number): number {
    const i = this.cards.findIndex(c => c.born < 0 || born - c.born >= c.duration - 1e-8);
    if (i < 0) throw new Error("434i: C ray cap exceeded");
    const c = this.cards[i]!;
    c.from.copy(from); c.to.copy(to); c.born = born; c.followFrom=followFrom; c.followTo=followTo;
    const serial = this.serial++;
    c.variant = (variant ?? serial) % Math.max(1, this.variants.length); c.seed = seed ?? noise(serial * 47 + 434); c.duration = .22 + c.seed * .02;
    return this.place(c);
  }
  private place(c: Card): number {
    const v = this.variants[c.variant]; if (!v) return 0;
    this.along.subVectors(c.to, c.from);
    this.a.addVectors(c.from,c.to).multiplyScalar(.5);
    if (this.camera) this.eye.subVectors(this.camera.position,this.a).normalize(); else this.eye.set(0,1,1).normalize();
    this.side.crossVectors(this.along,this.eye).normalize();
    if (this.side.lengthSq()<1e-8) this.side.set(1,0,0);
    let pxPerM = 40;
    if (this.camera) {
      this.camera.updateWorldMatrix(true,false);
      this.b.copy(this.a).add(this.side); this.a.project(this.camera); this.b.project(this.camera);
      pxPerM=Math.hypot((this.b.x-this.a.x)*640,(this.b.y-this.a.y)*360);
    }
    // One affine card: independently stretch its length, preserve a readable source body at every depth.
    const sourceBodyPx = 80;
    const scale = (22 + c.seed * 1.5) / (sourceBodyPx * Math.max(1,pxPerM));
    c.width = scale*v.size[1];
    const u=c.mesh.material.uniforms;
    u.uMap!.value=(c.mesh.material.userData.maps as THREE.Texture[])[c.variant];
    (u.uSize!.value as THREE.Vector2).fromArray(v.size);
    (u.uA!.value as THREE.Vector2).fromArray(v.anchorsPx.start); (u.uB!.value as THREE.Vector2).fromArray(v.anchorsPx.end);
    (u.uFrom!.value as THREE.Vector3).copy(c.from); (u.uTo!.value as THREE.Vector3).copy(c.to);
    (u.uSide!.value as THREE.Vector3).copy(this.side); u.uScale!.value=scale;
    return c.width;
  }
  private gain(c: Card, t: number): number {
    const age = t-c.born; if(c.born<0 || age < -1e-8 || age >= c.duration) return 0;
    const dip1=.073+c.seed*.007, dip2=.132+c.seed*.009;
    const flicker=1-.82*Math.exp(-(((age-dip1)/.007)**2))-.76*Math.exp(-(((age-dip2)/.008)**2));
    return Math.max(0,flicker)*(1-ease((age-.145)/(c.duration-.145)));
  }
  present(t: number): void {
    this.t=t;
    for(const c of this.cards) {
      const gain=this.gain(c,t); c.mesh.visible=gain>0; c.mesh.material.uniforms.uGain!.value=gain;
      if(gain>0){c.followFrom?.(c.from); c.followTo?.(c.to); this.place(c);c.mesh.material.uniforms.uGain!.value=gain;}
    }
  }
  countAt(t: number): number { return this.cards.filter(c => this.gain(c,t)>0).length; }
  get live(): number { return this.cards.filter(c=>this.gain(c,this.t)>0).length; }
  snapshot(t: number): unknown[] { return this.cards.filter(c=>this.gain(c,t)>0).map(c=>({layer:"boltC-card",start:c.from.toArray(),end:c.to.toArray(),born:c.born,widthM:c.width,primary:false,gain:this.gain(c,t),variant:c.variant,seed:c.seed,durationS:c.duration,ageS:t-c.born,anchors:this.variants[c.variant]?.anchorsPx,source:this.variants[c.variant]?.file})); }
  clear(): void { this.t=-10;this.serial=0;for(const c of this.cards){c.born=-10;c.mesh.visible=false;} }
  dispose(): void {
    if(this.disposed)return;this.disposed=true;this.clear();
    for(const c of this.cards)c.mesh.material.dispose();
    this.geometry.dispose();for(const t of this.textures)t.dispose();this.textures.clear();this.group.removeFromParent();this.ready=false;
  }
}
