/** Tickets 447/447b. Approved Firefly components around the supplied Blender sphere. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { TargetField } from "../view/skills/targets";
import type { LabSound, FireflyTake } from "./sound";
import { fireflyGain } from "./sound-tiers";

export const BLACKHOLE = { charge: .8, open: 2.4, climaxEnd: 4.4, end: 6, diameter: 18.7395, enlargement: 1.5, ringCoreRatio: 2.2, sourceDiameter: .806, tiltDeg: 22, radius: 8, blades: 8, bladeLife: .64, coreShrink: .8, rimHollow: .243, ringTint: [1.55, 1.3, 1.05], ringEchoScale: .9, ringEchoOpacity: .7 } as const;
interface Clip { image: string; cols: number; rows: number; frames: number; fps: number; support?: [number,number][][] }
interface Art { meta: Clip; texture: THREE.Texture }
interface Host {
  targets: TargetField; camera: THREE.PerspectiveCamera; sound: LabSound;
  release(at: THREE.Vector3): void;
  pull(x: number, z: number, radius: number, seconds: number): void;
  consume(i: number): void;
  upload(t: THREE.Texture): void;
}
interface Victim { i: number; at: number; swallowed: boolean; mesh?: THREE.InstancedMesh; slot?: number }
const ease = (a: number, b: number, t: number): number => { const k = THREE.MathUtils.clamp((t-a)/(b-a), 0, 1); return k*k*(3-2*k); };
const plane = new THREE.PlaneGeometry(1, 1);
/** Standard material only: the atlas supplies all silhouettes, opacity supplies envelopes. */
class Card {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly texture: THREE.Texture;
  constructor(parent: THREE.Object3D, readonly art: Art, additive = true, order = 12) {
    this.texture = art.texture.clone(); this.texture.needsUpdate = true;
    this.texture.repeat.set(1/art.meta.cols, 1/art.meta.rows);
    const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false,
      depthTest: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide, toneMapped: false, opacity: 0 });
    this.mesh = new THREE.Mesh(plane, material); this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order; this.mesh.visible = false; parent.add(this.mesh);
  }
  frame(frame: number, opacity: number): void {
    const k = Math.max(0, Math.min(this.art.meta.cols*this.art.meta.rows-1, Math.floor(frame)));
    this.texture.offset.set(k%this.art.meta.cols/this.art.meta.cols, 1-(Math.floor(k/this.art.meta.cols)+1)/this.art.meta.rows);
    this.mesh.material.opacity = Math.max(0, opacity); this.mesh.visible = opacity > .0001;
  }
  clear(): void { this.mesh.visible = false; this.mesh.material.opacity = 0; }
}
export class VoidBlackhole {
  readonly group = new THREE.Group();
  private readonly world = new THREE.Group();
  private readonly cards: Card[] = [];
  private ring: Card[] = [];
  /** 447c: inner echo of the same ring flipbook (scale + tint only) thickens the band inward. */
  private ringEcho: Card[] = [];
  /** 447c: owner pick C, additive rim behind the GLB core, camera-facing. */
  private rim: Card | null = null;
  private core: Card | null = null;
  private coreModel: THREE.Group | null = null;
  private coreMesh: THREE.Mesh | null = null;
  private readonly sweepWorld = new THREE.Group();
  private sweeps: Card[][] = [];
  private blades: Card[][] = [];
  private motes: Card[] = [];
  private spill: Card | null = null;
  private shadow: Card | null = null;
  private flash: Card | null = null;
  private readonly centre = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly scalar = new THREE.Vector3();
  private readonly victims: Victim[] = [];
  private t = -1;
  private loading: Promise<void> | null = null;
  private loaded = false;
  private error: string | null = null;
  private released = false;
  private climax = false;
  private sounds: { event: string; at: number; played: boolean }[] = [];
  private readonly takes: Record<"open"|"climax", FireflyTake>;
  private _last: Record<string, unknown> | null = null;
  private lastDiameter = 0;
  private lastScale = 0;
  private bladeCount = 0;
  private bladeLive = 0;
  private sweepLive = 0;
  private coreRadius = 0;
  constructor(parent: THREE.Object3D, private readonly base: string, private readonly host: Host) {
    this.group.name = "fx-void-blackhole-447"; this.group.visible = false; parent.add(this.group);
    this.world.name = "void-blackhole-fixed-world-plane";
    // Fixed above the ground for every camera; never copy a camera quaternion to the ring.
    this.world.rotation.set(-(90-BLACKHOLE.tiltDeg)*Math.PI/180, 0, 0);
    this.group.add(this.world);
    this.sweepWorld.name = "void-blackhole-horizontal-crescent-chain";
    this.group.add(this.sweepWorld);
    const file = "tt-sfx-ult-void/take1.wav";
    this.takes = {
      open: { file, gain: fireflyGain(file,-23,"world"), onset: 0, fade: [1.3,.35] },
      climax: { file, gain: fireflyGain(file,-17,"world"), onset: 1.3, fade: [3.5,.7] },
    };
    host.sound.registerTakes(Object.values(this.takes));
  }
  get ready(): boolean { return this.loaded; }
  get active(): boolean { return this.t >= 0; }
  get last(): Record<string, unknown> | null { return this._last; }
  prepare(): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.loading !== null) return this.loading;
    const load = async (folder: string, id: string): Promise<Art> => {
      const response = await fetch(this.base+folder+id+".json");
      if (!response.ok) throw new Error(id+": HTTP "+response.status);
      const meta = await response.json() as Clip;
      const texture = await new THREE.TextureLoader().loadAsync(this.base+folder+meta.image);
      texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
      return { meta, texture };
    };
    this.loading = Promise.all([
      load("void-ult/","void-blackhole-ring-b"), new GLTFLoader().loadAsync(this.base+"void-ult/models3d/void-blackhole-core.v2.glb"),
      load("void-ult/","void-blackhole-crescent"), load("aura/","glint-gold-twinkle-set"),
      new THREE.TextureLoader().loadAsync(this.base+"void-ult/inward-spray.png"), load("void-ult/","void-core-rim-c"),
    ]).then(([ring,core,blade,mote,spill,rim]) => {
      const make = (parent: THREE.Object3D, art: Art, additive = true, order = 12): Card => {
        const card = new Card(parent,art,additive,order); this.cards.push(card); this.host.upload(card.texture); return card;
      };
      // Opaque GLB renders before transparent cards and writes depth with its original material.
      this.coreModel = core.scene;
      this.coreModel.traverse(o=>{if(o instanceof THREE.Mesh){o.renderOrder=8;this.coreMesh=o;}});
      if(this.coreMesh===null)throw new Error("GLB has no core mesh");
      this.world.add(this.coreModel);
      this.ring = [make(this.world,ring),make(this.world,ring)];
      this.ringEcho = [make(this.world,ring),make(this.world,ring)];
      for (const c of [...this.ring,...this.ringEcho]) c.mesh.material.color.setRGB(...BLACKHOLE.ringTint);
      this.rim = make(this.group,rim,true,7); this.rim.mesh.material.color.setRGB(1.7,1.55,1.35); // 447d: rim stays depth-tested behind the black core; its hollow sits just outside the silhouette so the glow shows round it from every view
      this.blades = Array.from({length: BLACKHOLE.blades},()=>[make(this.world,blade,true,14),make(this.world,blade,true,14)]);
      this.sweeps = Array.from({length:3},()=>[make(this.sweepWorld,blade,true,14),make(this.sweepWorld,blade,true,14)]);
      this.motes = Array.from({length: 24},()=>make(this.group,mote,true,16));
      this.flash = make(this.world,mote,true,16);
      spill.colorSpace = THREE.SRGBColorSpace; spill.generateMipmaps = false; spill.minFilter = THREE.LinearFilter;
      const spillArt: Art = {texture:spill,meta:{image:"inward-spray.png",cols:1,rows:1,frames:1,fps:1}};
      this.spill = make(this.group,spillArt,true,4); this.shadow = make(this.group,spillArt,false,3);
      for (const c of [this.spill,this.shadow]) {c.mesh.rotation.x=-Math.PI/2;c.mesh.scale.setScalar(12);}
      this.shadow.mesh.material.color.setRGB(0,0,0); this.spill.mesh.material.color.setRGB(.9,.55,.13);
      for (const art of [ring,blade,mote,rim]) art.texture.dispose(); spill.dispose();
      this.loaded = true; this.error = null;
    }).catch((error: unknown)=>{this.error=String(error);console.warn("[void-blackhole]",error);})
      .finally(()=>{this.loading=null;});
    return this.loading;
  }
  /** Retained 447 matte path for reference; 447b never calls or loads it. */
  private flatCore447(core: Art): void {
    this.core = new Card(this.world,core,false,10);this.cards.push(this.core);
  }
  private updateFlatCore447(size: number, t: number): void {
    this.core!.mesh.scale.setScalar(size);this.core!.frame(t*24%60,t<5.15?1:0);
  }
  cast(): void {
    this.clear(); void this.prepare(); this.t=0; this.group.visible=true;
    const targets=this.host.targets;
    // Anchor the sole focus on the densest living group, rather than the caster or an empty field centroid.
    let best=-1,bestN=-1;
    for(let i=0;i<targets.size;i++)if(targets.alive(i)){
      let n=0;for(let j=0;j<targets.size;j++)if(targets.alive(j)&&Math.hypot(targets.x(j)-targets.x(i),targets.z(j)-targets.z(i))<=BLACKHOLE.radius)n++;
      if(n>bestN){best=i;bestN=n;}
    }
    this.centre.set(best<0?0:targets.x(best),best<0?.8:targets.midY(best),best<0?-8:targets.z(best));
    for(let i=0;i<targets.size;i++)if(targets.alive(i)&&targets.tier(i)<4&&Math.hypot(targets.x(i)-this.centre.x,targets.z(i)-this.centre.z)<=BLACKHOLE.radius)
      this.victims.push({i,at:2.65+(this.victims.length%12)*.105,swallowed:false});
    this.matchBodies(); this.update(0);
  }
  private matchBodies(): void {
    const group=(this.host.targets as TargetField&{group?:THREE.Group}).group;
    if(group===undefined)return;
    const meshes:THREE.InstancedMesh[]=[];
    group.traverse(o=>{if(o instanceof THREE.InstancedMesh&&o.geometry.hasAttribute("iDissolve"))meshes.push(o);});
    const used=new Set<string>();
    for(const v of this.victims){
      let best=.3*.3;
      for(let m=0;m<meshes.length;m++){
        const mesh=meshes[m]!;
        for(let k=0;k<mesh.count;k++){
          if(used.has(m+":"+k))continue;mesh.getMatrixAt(k,this.matrix);
          if(this.matrix.elements[0]===0&&this.matrix.elements[5]===0&&this.matrix.elements[10]===0)continue;
          this.point.setFromMatrixPosition(this.matrix);
          const d=(this.point.x-this.host.targets.x(v.i))**2+(this.point.z-this.host.targets.z(v.i))**2;
          if(d<best){best=d;v.mesh=mesh;v.slot=k;}
        }
      }
      if(v.mesh!==undefined)used.add(meshes.indexOf(v.mesh)+":"+v.slot);
    }
  }
  private sound(event:"open"|"climax"): void {
    const played=this.host.sound.playTake(this.takes[event],{bus:"world",group:"big",send:.3,pan:THREE.MathUtils.clamp(this.centre.x/22,-1,1)});
    this.sounds.push({event,at:this.t,played});
  }
  update(dt:number): void {
    if(!this.active)return;
    this.t=Math.min(BLACKHOLE.end,this.t+dt); if (BLACKHOLE.end-this.t<1e-8) this.t=BLACKHOLE.end; const t=this.t;
    if(!this.released&&t>=.8-1e-8){this.released=true;this.host.release(this.centre);this.host.pull(this.centre.x,this.centre.z,8,3.6);this.sound("open");}
    if(!this.climax&&t>=2.4-1e-8){this.climax=true;this.sound("climax");}
    const opening=ease(.8,2.1,t),collapse=1-ease(4.4,5.15,t);
    const size=(1.4+(15.5-1.4)*opening)*collapse*BLACKHOLE.enlargement;
    this.lastScale=size;this.lastDiameter=size*BLACKHOLE.sourceDiameter;
    this.coreRadius=this.lastDiameter/(2*BLACKHOLE.ringCoreRatio)*BLACKHOLE.coreShrink;
    this.world.position.copy(this.centre);this.world.position.y=Math.max(this.centre.y+4.1*opening*collapse,this.coreRadius+.15);
    if(this.ready){
      this.coreModel!.scale.setScalar(this.coreRadius);this.coreModel!.visible=t<5.15;
      for(let j=0;j<2;j++){
        const c=this.ring[j]!,f=t*24%60,frac=f-Math.floor(f);
        c.mesh.scale.setScalar(size);c.mesh.position.z=.006;
        c.frame((Math.floor(f)+j)%60,(j?frac:1-frac)*(t<.8?.22:1)*collapse);
        const e=this.ringEcho[j]!;e.mesh.scale.setScalar(size*BLACKHOLE.ringEchoScale);e.mesh.position.z=.004;
        e.frame((Math.floor(f)+j+30)%60,(j?frac:1-frac)*(t<.8?.22:1)*collapse*BLACKHOLE.ringEchoOpacity);
      }
      this.placeRim(t<5.15?collapse*ease(.5,1.2,t):0);
      this.spill!.mesh.position.set(this.centre.x,.025,this.centre.z);
      this.shadow!.mesh.position.set(this.centre.x,.018,this.centre.z);
      this.spill!.frame(0,.36*opening*collapse);this.shadow!.frame(0,.65*opening*collapse);
      this.bladeLive=0;this.bladeCount=0;
      for(let i=0;i<BLACKHOLE.blades;i++){
        const age=t-(2.4+i*.19),u=age/BLACKHOLE.bladeLife;
        if(age>=0)this.bladeCount++;
        const theta=(i*.69-.9),opacity=u>=0&&u<1?(1-ease(.75,1,u))*ease(0,.06,u):0;
        if(opacity>.001)this.bladeLive++;
        const frame=THREE.MathUtils.clamp(u,0,1)*(this.blades[i]![0]!.art.meta.frames-1),fraction=frame%1;
        for(let j=0;j<2;j++){
          const card=this.blades[i]![j]!;
          card.mesh.rotation.z=theta;card.mesh.scale.setScalar((10.5+(i%3)*.5)*BLACKHOLE.enlargement);
          card.mesh.position.set(Math.cos(theta)*(u-.5)*8*BLACKHOLE.enlargement,Math.sin(theta)*(u-.5)*8*BLACKHOLE.enlargement,.05+i*.002);
          card.frame(Math.floor(frame)+j,opacity*(j?fraction:1-fraction)*.95);
        }
      }
      // Three authored crescents join across the front hemisphere; each keeps uniform scale.
      this.placeSweep();
      const sweepU=(t-2.82)/.84,sweepOpacity=sweepU>=0&&sweepU<1?ease(0,.08,sweepU)*(1-ease(.75,1,sweepU)):0;
      this.sweepLive=sweepOpacity>.001?3:0;
      const sweepFrame=THREE.MathUtils.clamp(sweepU,0,1)*(this.sweeps[0]![0]!.art.meta.frames-1),sweepFraction=sweepFrame%1;
      for(let i=0;i<3;i++)for(let j=0;j<2;j++){
        const card=this.sweeps[i]![j]!;
        card.mesh.rotation.z=-Math.PI/3;card.mesh.scale.setScalar(13.5);
        card.mesh.position.set((i-1)*6+(sweepU-.5)*2,2.4,0);
        card.frame(Math.floor(sweepFrame)+j,sweepOpacity*(j?sweepFraction:1-sweepFraction)*.95);
      }
      for(let i=0;i<this.motes.length;i++){
        const c=this.motes[i]!,seed=i*.61803398875%1,angle=i*2.399963,tail=t>=4.4;
        const u=tail?((t-4.4)*.42+seed)%1:(t*(t<.8?1.15:.65)+seed)%1;
        const r=tail?1+u*5:5.8*(1-u),y=tail?.7+u*.65:1.1+(1-u)*.6;
        c.mesh.position.set(this.centre.x+Math.cos(angle)*r,this.centre.y+y,this.centre.z+Math.sin(angle)*r);
        c.mesh.quaternion.copy(this.host.camera.quaternion);c.mesh.scale.setScalar(.45+(i%4)*.10);
        c.mesh.material.color.setRGB(.9,.65,.25);
        c.frame((Math.floor(u*15)+(i%8)*16),.8*Math.sin(u*Math.PI)*(tail?1-ease(5.1,6,t):1));
      }
      // One small authored glint at collapse. No screen flash or extra climax.
      this.flash!.mesh.scale.setScalar(1.2);this.flash!.mesh.position.z=.025;
      this.flash!.frame(THREE.MathUtils.clamp((t-5.05)/.35,0,1)*15,t>=5.05&&t<=5.4?Math.sin((t-5.05)/.35*Math.PI)*.9:0);
    }
    for(const v of this.victims){
      const u=ease(v.at,v.at+.55,t);
      if(u>0&&v.mesh!==undefined&&v.slot!==undefined){
        v.mesh.getMatrixAt(v.slot,this.matrix);this.scalar.setScalar(Math.max(.001,1-u));this.matrix.scale(this.scalar);
        const e=this.matrix.elements;e[12]=e[12]!+(this.centre.x-e[12]!)*u;e[13]=e[13]!+(this.world.position.y-e[13]!)*u;e[14]=e[14]!+(this.centre.z-e[14]!)*u;
        v.mesh.setMatrixAt(v.slot,this.matrix);v.mesh.instanceMatrix.needsUpdate=true;
        const dis=v.mesh.geometry.getAttribute("iDissolve");dis.setX(v.slot,Math.max(dis.getX(v.slot),ease(.55,1,u)));dis.needsUpdate=true;
      }
      if(u>=1&&!v.swallowed){v.swallowed=true;this.host.consume(v.i);}
    }
    this._last=this.snapshot();
    if(t>=BLACKHOLE.end){this.t=-1;this.group.visible=false;for(const card of this.cards)card.clear();}
  }
  private snapshot():Record<string,unknown>{
    this.group.updateWorldMatrix(true,true);
    const f=Math.floor(this.t*24)%60,support=this.ring[0]?.art.meta.support;
    const outline=support===undefined?[[-.36,0],[.36,0],[0,-.36],[0,.36]]:[...support[f]!,...support[(f+1)%60]!];
    const points=outline.map(([x,y])=>new THREE.Vector3(x!,y!,0).multiplyScalar(this.lastScale).applyMatrix4(this.world.matrixWorld).project(this.host.camera));
    const xs=points.map(p=>(p.x*.5+.5)*innerWidth),ys=points.map(p=>(-.5*p.y+.5)*innerHeight);
    const coreScreen=this.coreScreen();
    const material=Array.isArray(this.coreMesh?.material)?this.coreMesh.material[0]:this.coreMesh?.material;
    return {clock:this.t,phase:this.t<.8?"charge":this.t<2.4?"open":this.t<4.4?"climax":"aftermath",
      assetsReady:this.ready,loadError:this.error,centre:this.world.position.toArray(),diameterM:this.lastDiameter,tiltDeg:BLACKHOLE.tiltDeg,
      screenDiameterPx:Math.max(...xs)-Math.min(...xs),screenHeightPx:Math.max(...ys)-Math.min(...ys),
      screenBounds:{left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)},
      coreScreen,coreRadiusM:this.coreRadius,ringCoreDiameterRatio:BLACKHOLE.ringCoreRatio,enlargement:BLACKHOLE.enlargement,
      coreDepth:{opaque:material?.transparent===false,write:material?.depthWrite,test:material?.depthTest,renderOrder:this.coreMesh?.renderOrder},ringDepthTest:this.ring.every(c=>c.mesh.material.depthTest),
      liveSweepBlades:this.sweepLive,plannedSweepBlades:3,
      plannedBlades:8,emittedBlades:this.bladeCount,liveBlades:this.bladeLive,
      pullRadiusM:8,targets:this.victims.length,matchedBodies:this.victims.filter(v=>v.mesh!==undefined).length,
      swallowed:this.victims.filter(v=>v.swallowed).length,soundEvents:[...this.sounds],
      worldQuaternion:this.world.quaternion.toArray(),cameraFacing:false,sweepCameraFacing:true,geometry:"opaque Blender sphere + depth-tested fixed inclined ring plane",core:"void-blackhole-core.v1.glb; original material; opaque depth write",flatCoreCalled:false,uniformScale:true};
  }
  /** Rim quad just behind the sphere; uniform scale so its hollow matches the sphere's projected silhouette. */
  private placeRim(opacity:number):void{
    if(this.rim===null)return;
    const cam=this.host.camera.position,c=this.world.position,d=cam.distanceTo(c),R=this.coreRadius;
    this.point.subVectors(c,cam).normalize();
    const back=R*1.05;
    this.rim.mesh.position.copy(c).addScaledVector(this.point,back);
    this.rim.mesh.quaternion.copy(this.host.camera.quaternion);
    const silhouette=R/Math.sqrt(Math.max(1e-6,d*d-R*R));
    this.rim.mesh.scale.setScalar(1.14*silhouette*(d+back)/BLACKHOLE.rimHollow); // 447d: hollow just outside the silhouette
    this.rim.frame(0,opacity);
  }
  private placeSweep():void{
    this.point.subVectors(this.host.camera.position,this.world.position).normalize();
    this.sweepWorld.position.copy(this.world.position).addScaledVector(this.point,this.coreRadius*1.02);
    this.sweepWorld.quaternion.copy(this.host.camera.quaternion);
  }
  /** Project the actual supplied mesh vertices, independent of the effect cards or their glow. */
  private coreScreen():Record<string,number>|null{
    if(this.coreMesh===null)return null;
    const positions=this.coreMesh.geometry.getAttribute("position");let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(let i=0;i<positions.count;i++){
      this.point.fromBufferAttribute(positions,i).applyMatrix4(this.coreMesh.matrixWorld).project(this.host.camera);
      const x=(this.point.x*.5+.5)*innerWidth,y=(-this.point.y*.5+.5)*innerHeight;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    return{left,right,top,bottom,width:right-left,height:bottom-top,heightWidth:(bottom-top)/(right-left)};
  }
  /** One review-only 90 degree view, called after seeking; no change to the normal lab camera. */
  captureOverhead():void{
    const camera=this.host.camera;
    camera.position.set(this.world.position.x,this.world.position.y+42,this.world.position.z);
    camera.up.set(0,0,-1);camera.lookAt(this.world.position);camera.updateMatrixWorld(true);
    this.placeSweep();this.placeRim(this.rim?.mesh.material.opacity??0);
    this._last=this.snapshot();
  }
  clear():void{
    this.t=-1;this.group.visible=false;for(const card of this.cards)card.clear();
    this.victims.length=0;this.released=false;this.climax=false;this.sounds=[];this.bladeCount=0;this.bladeLive=0;this.sweepLive=0;
  }
}
