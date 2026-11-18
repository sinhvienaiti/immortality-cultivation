/** Ticket 439. VFX_STANDARD ultimate, approved four-panel light storyboard.
 * Recipe: hovering glass + 11 world rays, existing charge/release/sparkle/dust/impact atlases.
 * No ground formation or sky component. All secondary material channels <= .9.
 */
import * as THREE from "three";
import { FlipbookPool, ONE_FRAME, loadClip, parseFlipbookManifest } from "../view/skills/flipbook";
import type { TargetField } from "../view/skills/targets";
import type { LabCaster } from "./caster";
import { FanBeams, HeldLens, ease, noise } from "./light-ult-fan-space";
import { LightAfterglow } from "./light-ult-twinkles";
import { UltCameraPunch } from "./ult-camera-punch";
import { LightImpactSparks } from "./light-ult-impact";
import { attachLightBodyProbe, lightBodyCap } from "./light-ult-body-probe";
import { LightPrismBurst } from "./light-ult-burst";
import { LightWedgeSpill } from "./light-ult-ground";
export const LIGHT_ULT_ID = "ult-light";
export type LightSound = "gather" | "release" | "focus";
export interface LightUltHost {
  readonly camera: THREE.PerspectiveCamera;
  readonly targets: TargetField & { shove?(i:number,dx:number,dz:number,metres:number):void; holdBeast?(i:number,seconds:number):void };
  caster(): LabCaster;
  release(at: THREE.Vector3): void;
  hit(i: number, dx: number, dz: number, final: boolean): void;
  focus(at: THREE.Vector3): void;
  sound(event: LightSound, at: THREE.Vector3, delay: number): void;
  upload(texture: THREE.Texture): void;
}
export interface LightUltReport {
  clock: number; assetsReady: boolean; loadError: string | null; phase: string;
  source: number[]; fanDegrees: number; beamCount: number; hdrBeams: number;
  lens: ReturnType<HeldLens["bbox"]>; lensDiameterM: number; grip: ReturnType<HeldLens["grip"]>; target: number; end: number[];
  sweepHits: number; focusHits: number; soundEvents: { at: number; kind: LightSound }[];
  fanWorld: number[][]; fanScreen: number[][]; fanMidScreen: number[]; focusWorld: number[][]; focusScreen: number[][];
  particlesPerRay: number;
  seed: number; rayLengths: number[]; rayLengthCV: number; rayPeakBrightness: number[]; rayAnglesDeg: number[];
  beamSectionScreen: number[][]; mainRays: number[]; rayWorld: number[][]; rayScreen: number[][];
  axisWorld: number[]; focusAxisDeviationDeg: number; targetAxisDeviationDeg: number | null;
  impactTimeS: number; impactAgeS: number; impactScreen: number[]; prismSparks: number; flashFrames: number; growS: number;
  cameraPunch: UltCameraPunch["report"]; impactVictims: {i:number; x:number; z:number; distanceM:number; movedM:number}[];
  prismBurst: ReturnType<LightPrismBurst["report"]>;
  collapse: number; collapseDurationS: number; afterglowSpots: number; afterglowDurationS: number;
}
const PARTS = ["light-charge", "light-release", "light-sparkle", "gold-dust-motes-loop-w2", "light-impact", "light-prism-burst-hi"] as const;
type Part = typeof PARTS[number];
const GOLD = new THREE.Color(.9,.65,.27), WHITE = new THREE.Color(.9,.85,.67);
const DEG = Math.PI / 180;
const SEED = 439.31, RANGE = 20, COUNT = 11, COLLAPSE_START = 1.45, COLLAPSE_S = .35, FOCUS_START = 1.8;
const GROW_S=.15, IMPACT_START=FOCUS_START+GROW_S;
const MAIN = [2,5,9];
const RAYS = Array.from({length:COUNT},(_,i)=>({
  angle: (i===0?-29.2:i===COUNT-1?29.2:i===5?0:-30+i*6+(noise(SEED+i*7)-.5)*5.2)*DEG,
  length: RANGE*(i===5?1:.65+.35*noise(SEED+(i===COUNT-1?0:i)*3.1)),
  peak: i===5?1:i===2?.94:i===9?.98:.55+.23*noise(SEED+i*5),
}));
const MEAN_LENGTH=RAYS.reduce((n,r)=>n+r.length,0)/COUNT;
const LENGTH_CV=Math.sqrt(RAYS.reduce((n,r)=>n+(r.length-MEAN_LENGTH)**2,0)/COUNT)/MEAN_LENGTH;
export class LightUltFan {
  readonly group = new THREE.Group();
  readonly beams: FanBeams;
  readonly lens: HeldLens;
  readonly spill: LightWedgeSpill;
  readonly afterglow: LightAfterglow;
  readonly sparks: LightImpactSparks;
  readonly prismBurst: LightPrismBurst;
  readonly punch: UltCameraPunch;
  private readonly pools = new Map<Part, FlipbookPool>();
  private readonly blank = new THREE.DataTexture(new Uint8Array(4),1,1);
  private readonly owned = new Set<THREE.Texture>();
  private readonly source = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly left = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly rayEnd = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private readonly hits = new Set<number>();
  private readonly impactAt: { at: number; point: THREE.Vector3 }[] = [];
  private t = -1;
  private loading: Promise<void> | null = null;
  private error: string | null = null;
  private target = -1;
  private focusDone = false;
  private impactDone = false;
  private focusReach = RANGE;
  private presence: THREE.Object3D | undefined;
  private presenceWasVisible = true;
  private prop: THREE.Object3D | undefined;
  private propWasVisible = true;
  private readonly propMasks: { object: THREE.Object3D; mask: number }[] = [];
  last: LightUltReport | null = null;
  constructor(parent: THREE.Object3D, private readonly base: string, private readonly host: LightUltHost) {
    attachLightBodyProbe((host.targets as TargetField & {group?:THREE.Group}).group);
    this.group.name = "light-ult-fan"; parent.add(this.group); this.group.visible = false;
    this.blank.needsUpdate = true;
    for (const id of PARTS) {
      const pool = new FlipbookPool(id, "fire", id==="light-sparkle"?512:id==="gold-dust-motes-loop-w2"?128:64, 15, this.blank);
      pool.bodyCap = .9; pool.softM = .12; pool.vignette = .5;
      this.pools.set(id, pool); this.group.add(pool.mesh);
    }
    this.beams = new FanBeams(this.group, host.camera); this.lens = new HeldLens(this.group, () => host.caster());
    this.spill = new LightWedgeSpill(this.group);
    this.afterglow = new LightAfterglow(this.group,this.blank);
    this.sparks = new LightImpactSparks(this.group,this.blank);
    this.prismBurst = new LightPrismBurst(this.group);
    this.punch = new UltCameraPunch(this.group,location.search);
    this.punch.bindCamera(host.camera);
  }
  get ready(): boolean { return this.beams.ready && this.lens.ready && this.spill.ready && PARTS.every(id => this.pools.get(id)!.meta !== null); }
  get active(): boolean { return this.t >= 0; }
  get live(): number { let n = this.beams.live + Number(this.lens.root.visible) + Number(this.prismBurst.mesh.visible) + (this.afterglow.mesh.visible?60:0); for (const p of this.pools.values()) n += p.live; return this.active ? n : 0; }
  prepare(): Promise<void> {
    if (this.ready) return Promise.resolve(); if (this.loading) return this.loading;
    const folder = this.base + "light/";
    this.loading = Promise.all([this.beams.prepare(this.base, t => this.host.upload(t)),
      this.lens.prepare(this.base, t => this.host.upload(t)), this.spill.prepare(this.base, t => this.host.upload(t)),
      ...PARTS.map(async id => {
      if (this.pools.get(id)!.meta !== null) return;
      const response = await fetch(folder + id + ".json"); if (!response.ok) throw new Error(id + ": HTTP " + response.status);
      const raw = await response.json() as { image: string };
      const meta = parseFlipbookManifest({ clips: [{ ...raw, file: raw.image, mode: "fire" }] }, folder).get(id)!;
      const asset = await loadClip({ ...meta, ktx2: { uastc: { url: folder + id + ".uastc.ktx2", bytes: 0 } } }, 4, false, new THREE.TextureLoader());
      this.owned.add(asset.texture); this.pools.get(id)!.attach(meta, asset.texture); this.host.upload(asset.texture);
      if(id==="light-sparkle"){this.afterglow.attach(asset.texture);this.sparks.attach(asset.texture);}
      if(id==="light-prism-burst-hi")this.prismBurst.attach(meta,asset.texture);
    })]).then(() => { this.error = null; }).catch((e: unknown) => { this.error = String(e); console.warn("[light-ult]", e); })
      .finally(() => { this.loading = null; });
    return this.loading;
  }
  private sound(kind: LightSound, delay=0): void { this.host.sound(kind,this.source,delay); this.last!.soundEvents.push({at:this.t,kind}); }
  cast(): LightUltReport {
    this.clear(); void this.prepare(); this.t=0; this.group.visible=true;
    this.presence=this.group.parent?.getObjectByName("fx-hero-presence");
    if(this.presence){this.presenceWasVisible=this.presence.visible;this.presence.visible=false;}
    this.prop=this.host.caster().model?.getObjectByName("handSword");
    if(this.prop){this.propWasVisible=this.prop.visible;this.prop.visible=false;
      this.prop.traverse(object=>{this.propMasks.push({object,mask:object.layers.mask});object.layers.disableAll();});} this.lens.pose(0); this.source.copy(this.lens.centre);
    this.fanBounds();this.lens.face(this.axis); // 453b: emit from the floating glass along the fan axis.
    this.end.copy(this.source).addScaledVector(this.axis,RANGE);
    this.last={clock:0, assetsReady:this.ready, loadError:this.error, phase:"charge",source:this.source.toArray(),fanDegrees:60,
      beamCount:0,hdrBeams:0,lens:this.lens.bbox(this.host.camera),lensDiameterM:this.lens.radius*2*this.lens.root.scale.x,grip:this.lens.grip(),target:this.target,end:this.end.toArray(),
      sweepHits:0,focusHits:0,soundEvents:[],fanWorld:[],fanScreen:[],fanMidScreen:[],focusWorld:[],focusScreen:[],particlesPerRay:28,
      seed:SEED,rayLengths:RAYS.map(r=>r.length),rayLengthCV:LENGTH_CV,rayPeakBrightness:RAYS.map(r=>r.peak),
      rayAnglesDeg:RAYS.map(r=>r.angle/DEG),beamSectionScreen:[],mainRays:MAIN,rayWorld:[],rayScreen:[],axisWorld:this.axis.toArray(),
      focusAxisDeviationDeg:0,targetAxisDeviationDeg:null,impactTimeS:IMPACT_START,impactAgeS:-1,impactScreen:[],prismSparks:0,flashFrames:2,growS:GROW_S,cameraPunch:this.punch.report,impactVictims:[],prismBurst:this.prismBurst.report(),collapse:0,collapseDurationS:COLLAPSE_S,afterglowSpots:0,afterglowDurationS:1.3};
    this.sound("gather"); this.present(); return this.last;
  }
  clear(): void {
    if(this.presence){this.presence.visible=this.presenceWasVisible;this.presence=undefined;}
    if(this.prop){this.prop.visible=this.propWasVisible;this.prop=undefined;}
    for(const p of this.propMasks)p.object.layers.mask=p.mask;this.propMasks.length=0;
    lightBodyCap(this.end,false);
    this.t=-1;this.target=-1;this.focusDone=false;this.impactDone=false;this.punch.clear();this.sparks.clear();this.hits.clear();this.impactAt.length=0;
    this.beams.clear();this.lens.root.visible=false;for(const p of this.pools.values())p.clear();this.group.visible=false;
    this.spill.mesh.visible=false;this.afterglow.clear();this.prismBurst.clear();
  }
  private shot(id: Part, pos: THREE.Vector3, size: number, alpha: number, offset=0, tint?: THREE.Color): void {
    const p=this.pools.get(id)!; if(!p.meta || alpha<=.003) return;
    p.spawn(pos,size,{life:ONE_FRAME,rate:0,frame:(this.t*20+offset)%p.meta.frames,fadeOut:0,
      alpha, tint:tint??(id==="light-impact"?WHITE:GOLD),intensity:.85,occlude:0});
  }
  private present(): void {
    const t=this.t, r=this.last!;
    lightBodyCap(this.end,t>=IMPACT_START-1e-8&&t<2.7);
    for(const p of this.pools.values())p.clear(); this.beams.clear();
    this.lens.pose(t);this.source.copy(this.lens.centre);
    const sweep=ease((t-.6)), angle=(-30+60*sweep)*DEG;
    const collapse=ease((t-COLLAPSE_START)/COLLAPSE_S);
    const fanIn=ease((t-.6)/.12),fanOut=1-ease((t-1.72)/.08);
    this.fanBounds();this.lens.face(this.axis); // 453b: rays and ground share the moving glass centre.
    if(!this.focusDone)this.end.copy(this.source).addScaledVector(this.axis,RANGE);
    else this.end.copy(this.source).addScaledVector(this.axis,this.focusReach);
    this.spill.set(this.source,this.left,this.right,fanIn*fanOut*.18,t);
    this.sparks.clear();this.sparks.gather(this.source,t);
    r.rayWorld=[];r.rayScreen=[];
    if(t>=.6 && t<FOCUS_START) for(let i=0;i<COUNT;i++) {
      const ray=RAYS[i]!,a=ray.angle*(1-collapse),lag=(angle-ray.angle)/DEG;
      const strength=ray.peak*(lag< -8 ? .6 : lag<8 ? 1 : .88+.06*Math.sin(t*8+i));
      this.rayPoint(a,ray.length,this.at);
      const grow=ease((t-.6)/(.18+noise(i+9)*.05));
      this.beams.set(i,this.source,this.at,MAIN.includes(i)?1.55:1.35,fanIn*fanOut*strength,t,false,grow);
      r.rayWorld.push(this.at.toArray());
      this.rayEnd.copy(this.at);
      for(let j=0;j<28;j++) {
        const n=i*31+j,along=.06+.92*((j/28+t*(.14+noise(n)*.06))%1);
        this.at.lerpVectors(this.source,this.rayEnd,along);
        this.at.x+=(noise(n+17)-.5)*.55;this.at.y+=(noise(n+54)-.5)*.65;
        const twinkle=.45+.55*Math.pow(.5+.5*Math.sin(t*(7+noise(n)*8)+n*3),3);
        this.shot("light-sparkle",this.at,.6+noise(n+9)*.6,fanIn*fanOut*twinkle*.9,n*7,WHITE);
      }
    }
    const focus=ease((t-FOCUS_START)/.035)*(1-ease((t-2.05)/.25));
    if(focus>0) this.beams.set(15,this.source,this.end,2.2,focus,t,true,ease((t-FOCUS_START)/GROW_S));
    // Small art-based source glow preserves the gold rim and glass aperture.
    this.shot("light-charge",this.source,1.25,t<.6?ease(t/.18)*.85:t<2.3?.6:.2*(1-ease((t-2.3)/1.3)));
    if(t>=.48 && t<.6)this.shot("light-release",this.source,1.5,Math.sin((t-.48)/.12*Math.PI)*.9);
    if(t>=.6 && t<.87)this.shot("light-release",this.source,1.0,1-ease((t-.6)/.27));
    for(let i=0;i<5;i++) {
      const a=i*Math.PI*.4+t*.7;
      this.at.copy(this.source);this.at.x+=Math.cos(a)*.46;this.at.y+=Math.sin(a)*.45;
      this.shot("light-sparkle",this.at,.72,(1-ease((t-3)/.6))*.48,i*9);
    }
    for(const p of this.impactAt) {
      const age=t-p.at;if(age>=0 && age<.6)this.shot("light-impact",p.point,.95,(1-ease(age/.6))*.65,p.at*17);
    }
    const impactAge=t-IMPACT_START;
    this.prismBurst.set(this.end,impactAge,this.host.camera);
    if(impactAge>=-1e-8 && impactAge<.85){
      const age=Math.max(0,impactAge),burst=1-ease((age-.08)/.65);
      const frame=5+age*34;
      // The upright D take replaces big-burst; keep 439d's contact flash and sparks.
      this.shot("light-impact",this.end,7.6,burst*.2,frame-t*20,WHITE);
      if(age<2/60-1e-8)this.shot("light-impact",this.end,14.0,.55,10-t*20,WHITE);
      this.sparks.impact(this.prismBurst.mesh.position,age);
    }
    this.sparks.flush();
    for(const v of r.impactVictims)v.movedM=Math.hypot(this.host.targets.x(v.i)-v.x,this.host.targets.z(v.i)-v.z);
    r.impactAgeS=impactAge;r.prismSparks=impactAge>=0&&impactAge<.85?120:0;r.cameraPunch=this.punch.report;r.prismBurst=this.prismBurst.report();
    // Keep the sweep material, then hand over to separated single art glints.
    const dustIn=ease((t-.72)/1.15),dustOut=1-ease((t-2.12)/.18);
    if(t<2.3)for(let i=0;i<96;i++) {
      const a=(-30+noise(i+7)*60)*DEG,dist=2+Math.sqrt(noise(i+72))*18;
      this.at.set(this.source.x+Math.sin(a)*dist,.6+noise(i+93)*1.5+Math.sin(t+i)*.12,this.source.z-Math.cos(a)*dist);
      this.shot("gold-dust-motes-loop-w2",this.at,2.6+noise(i)*1.8,dustIn*dustOut*.9,i*11,WHITE);
    }
    this.afterglow.clear();
    if(t>=2.25 && t<3.6)for(let i=0;i<60;i++) {
      // Two thirds hug three main rays, with distinct islands and empty lanes between them.
      const lane=MAIN[i%MAIN.length]!,ray=RAYS[lane]!;
      const cluster=Math.floor(i/3)%4;
      const a=i<42?ray.angle+(noise(i+SEED)-.5)*3.6*DEG:(-28+noise(i+17)*56)*DEG;
      const dist=i<42?(4+cluster*3.7+(noise(i+32)-.5)*1.4):3+noise(i+82)*15;
      this.rayPoint(a,dist,this.at);this.at.y+=(noise(i+93)-.35)*.7+(t-2.3)*.12;
      const twinkle=.3+.7*Math.pow(.5+.5*Math.sin(t*(6+noise(i)*5)+i*2.4),4);
      const life=ease((t-2.25)/.12)*(1-ease((t-2.3)/1.3));
      this.afterglow.set(i,this.at,.8+noise(i+19)*.65,life*(.5+.5*twinkle)*.95);
    }
    this.afterglow.flush();
    r.afterglowSpots=t>=2.3&&t<3.6?60:0;r.collapse=collapse;
    for(const p of this.pools.values())p.update(0);
    Object.assign(r,{clock:t,assetsReady:this.ready,loadError:this.error,phase:t<.6?"charge":t<COLLAPSE_START?"sweep":t<FOCUS_START?"collapse":t<2.3?"focus":"afterglow",
      source:this.source.toArray(),beamCount:this.beams.live,hdrBeams:this.beams.hdrCount,grip:this.lens.grip(),lens:this.lens.bbox(this.host.camera)});
    this.delta.subVectors(this.end,this.source).normalize();
    r.axisWorld=this.axis.toArray();
    r.focusAxisDeviationDeg=Math.acos(THREE.MathUtils.clamp(this.delta.dot(this.axis),-1,1))/DEG;
    this.projection();
  }
  private rayPoint(angle:number,length:number,out:THREE.Vector3):void {
    const dz=Math.cos(angle)*length;
    out.set(this.source.x+Math.sin(angle)*length,
      this.source.y+(1.05-this.source.y)*dz/(RANGE*Math.cos(30*DEG)),this.source.z-dz);
  }
  private fanBounds():void {
    this.rayPoint(RAYS[0]!.angle,RAYS[0]!.length,this.left);
    this.rayPoint(RAYS[COUNT-1]!.angle,RAYS[COUNT-1]!.length,this.right);
    this.axis.addVectors(this.left,this.right).multiplyScalar(.5).sub(this.source).normalize();
  }
  private aimFocus():void {
    const f=this.host.targets;let best=Infinity,reach=RANGE;
    this.target=-1;
    for(let i=0;i<f.size;i++)if(f.alive(i)) {
      this.delta.set(f.x(i),f.midY(i),f.z(i)).sub(this.source);
      const along=this.delta.dot(this.axis),deviation=this.delta.angleTo(this.axis)/DEG;
      if(along<3||along>RANGE||deviation>5||deviation>=best)continue;
      best=deviation;reach=along;this.target=i;
    }
    // The contact stays on the fan axis even when a nearby foe is slightly off it.
    this.focusReach=reach;this.end.copy(this.source).addScaledVector(this.axis,reach);
    if(this.last){this.last.target=this.target;this.last.targetAxisDeviationDeg=this.target<0?null:best;}
  }
  private projection():void {
    if(!this.last)return;
    const project=(v:THREE.Vector3):number[]=>{this.projected.copy(v).project(this.host.camera);return [(this.projected.x*.5+.5)*innerWidth,(.5-this.projected.y*.5)*innerHeight];};
    this.last.fanWorld=[this.source.toArray(),this.left.toArray(),this.right.toArray()];
    this.last.fanScreen=[project(this.source),project(this.left),project(this.right)];
    this.at.addVectors(this.left,this.right).multiplyScalar(.5);this.last.fanMidScreen=project(this.at);
    this.last.focusWorld=[this.source.toArray(),this.end.toArray()];
    this.last.focusScreen=[project(this.source),project(this.end)];
    this.last.impactScreen=project(this.impactDone?this.prismBurst.mesh.position:this.at.set(this.end.x,.025,this.end.z));
    const middle=this.last.rayWorld[Math.floor(this.last.rayWorld.length/2)];
    this.rayEnd.copy(middle?this.at.fromArray(middle):this.end);
    this.last.beamSectionScreen=[.2,.5,.85].map(f=>project(this.at.lerpVectors(this.source,this.rayEnd,f)));
    this.last.rayScreen=this.last.rayWorld.map(v=>project(this.rayEnd.fromArray(v)));
  }
  update(dt: number): void {
    if(!this.active)return; const before=this.t;this.t=Math.min(3.6,this.t+dt);this.punch.update(dt);
    this.lens.pose(this.t);this.source.copy(this.lens.centre);
    if(before<.6-1e-8 && this.t>=.6-1e-8){this.host.release(this.source);this.sound("release",dt);}
    const f=this.host.targets;
    if(this.t>=.6 && this.t<=1.7) for(let i=0;i<f.size;i++) if(f.alive(i)&&!this.hits.has(i)) {
      const dx=f.x(i)-this.source.x,dz=this.source.z-f.z(i),a=Math.atan2(dx,dz)/DEG;
      if(dz<2 || Math.hypot(dx,dz)>26 || a< -30 || a>30 || a> -30+60*ease(this.t-.6))continue;
      this.hits.add(i);this.last!.sweepHits++;
      const len=Math.hypot(dx,dz);this.host.hit(i,dx/len,-dz/len,false);
      f.status?.(i,"shocked",.16,0x49320e);
      if(this.impactAt.length<18)this.impactAt.push({at:this.t,point:new THREE.Vector3(f.x(i),f.midY(i),f.z(i))});
    }
    if(!this.focusDone && this.t>=FOCUS_START-1e-8){
      this.fanBounds();this.aimFocus();this.focusDone=true;
      this.last!.end=this.end.toArray();
    }
    if(!this.impactDone && this.t>=IMPACT_START-1e-8){
      this.impactDone=true;
      for(let i=0;i<f.size;i++)if(f.alive(i)){
        const dx=f.x(i)-this.end.x,dz=f.z(i)-this.end.z,d=Math.hypot(dx,dz);
        if(d>13.5)continue;
        this.last!.impactVictims.push({i,x:f.x(i),z:f.z(i),distanceM:d,movedM:0});
        const n=Math.max(.01,Math.hypot(f.x(i)-this.source.x,f.z(i)-this.source.z));
        const ux=(f.x(i)-this.source.x)/n,uz=(f.z(i)-this.source.z)/n;
        // Keep the wide recoil. The generic hit adds an HDR rim and a full-body
        // brighten; this lab finisher needs only the subdued gold status rim.
        f.shove?.(i,ux,uz,1.65);f.holdBeast?.(i,.16);f.status?.(i,"shocked",.24,0x49320e);
        this.last!.focusHits++;
      }
      this.host.focus(this.end);this.sound("focus",dt);
      this.host.camera.getWorldDirection(this.delta);
      this.at.copy(this.host.camera.position).addScaledVector(this.delta,this.host.camera.position.distanceTo(this.end));
      this.punch.startShot({centre:this.at,distanceRatio:.88,lowerAngleDeg:0,inS:.025,holdUntilS:.07,outS:.25});
    }
    this.present();
    if(this.t>=3.6){this.last!.clock=3.6;this.clear();}
  }
  report(): { ready: boolean; active: boolean; live: number; last: LightUltReport | null } {
    if(!this.ready)void this.prepare();
    if(this.last && this.active)this.last.lens=this.lens.bbox(this.host.camera);
    this.projection();
    return {ready:this.ready,active:this.active,live:this.live,last:this.last};
  }
}
