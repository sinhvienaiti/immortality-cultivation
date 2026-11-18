/** Tickets 434 / 434b. VFX_STANDARD ultimate: existing cloud/impact/scorch art, world-space arcs, then a sky strike.
 * Reference: art-src/concept/ult-storyboards/ult-storyboard-samples-431.jpg, right half. Lab view only.
 */
import * as THREE from "three";
import { FlipbookPool, ONE_FRAME, loadClip, parseFlipbookManifest, type FlipbookMode } from "../view/skills/flipbook";
import type { TargetField } from "../view/skills/targets";
import type { ImpactRole } from "../view/screen-fx";
import { CloudVolume } from "./cloud-volume";
import { CLOUD_PRESETS } from "./cloud-volume-lab";
import { UltCameraPunch, type UltCameraReport } from "./ult-camera-punch";
import { ThunderNguLoi } from "./thunder-ult-nguloi";
import { thunderColumnSound } from "./thunder-ult-sound";
import { StormCloud, arcPixels, ease, noise, type StormEnvelope } from "./thunder-ult-chain-space";

export const THUNDER_ULT_ID = "ult-thunder-nine-heavens-v2";
export const THUNDER_CHAIN_TIMING = { charge: 0.6, every: 0.1, maxHops: 80, hold: 0.22, fade: 0.14, climax: 2.4, end: 7 } as const;
export const thunderUltChainDefault = (search: string): boolean => new URLSearchParams(search).get("thunderUlt") !== "old";
export type ThunderChainSound = "gather" | "jump" | "climax" | "tail";
export interface ThunderChainHost {
  readonly targets: TargetField;
  readonly camera?: THREE.PerspectiveCamera;
  caster(out: THREE.Vector3): void;
  hand(out: THREE.Vector3): void;
  release(at: THREE.Vector3, firstS: number): void;
  stun(i: number, seconds: number, dx: number, dz: number): void;
  blow(i: number, dx: number, dz: number, power: number, role: ImpactRole): boolean;
  strike(at: THREE.Vector3): void;
  sound?(event: ThunderChainSound, at: THREE.Vector3): void;
  upload?(texture: THREE.Texture): void;
}
export interface ThunderHop {
  at: number; from: number; target: number; tier: number; variant: number; bearingDeg: number;
  start: [number, number, number]; end: [number, number, number];
  widthM: number; widthPx: number | null; holdS: number; branches: number;
  turnDeg: number | null; turn: "left" | "right" | "initial";
}
export interface ThunderChainReport {
  clock: number; plannedHops: number; hops: ThunderHop[]; climaxAt: number; climaxTarget: number;
  fanouts: { at: number; source: number; tier: number; rays: number; anglesDeg: number[]; targets: number[] }[];
  peakRays: number; jolts: number; columnSounds: number[];
  columns: { at: number; target: number; point: number[]; life: number; width: number; density: number; final: boolean; rate: number; delay: number }[];
  kills: number; finalHits: number; residuals: number; cancelled: boolean;
  assetsReady: boolean; loadError: string | null; live: number; dropped: number;
  cameraPunch: UltCameraReport;
  cloud: StormEnvelope | null; cloudNow: StormEnvelope | null;
  climax: { start: number[]; end: number[]; widthM: number; widthPx: number | null; branches: number; branchLengthsM: number[]; flashFrames60Hz: number; groundHoldS: number; groundFadeS: number; scorchDelayS: number; scorchFadeS: number } | null;
  readonly cloudState: ReturnType<CloudVolume["probeState"]>;
  readonly sections: never[];
  readonly art: unknown;
  residualTargets: number[]; residualWindowS: [number, number];
}
// Each atlas is one reusable component. Cloud and mark are sampled on fixed world surfaces.
const SOURCES = [
  ["thunder-five-cloud-ink-wg", "smoke", 2], ["thunder-charge", "fire", 2],
  ["thunder-release", "fire", 8], ["thunder-impact-v3", "fire", 24],
  
  ["thunder-five-lingering-arcs-wg", "fire", 28], ["thunder-sparkle", "fire", 32],
] as const satisfies readonly (readonly [string, FlipbookMode, number])[];
type Clip = typeof SOURCES[number][0];
const CLOUD: Clip = "thunder-five-cloud-ink-wg", IMPACT: Clip = "thunder-impact-v3";
const PALE = new THREE.Color(0.7, 0.48, 0.9);
// Four spreading waves, then seven overlapping landings; all times are on the cast clock.
/** 434l probe: hides the in-cloud vein pools so captures can diff vein coverage. */
const veinMaterials = new Set<THREE.Material>();
export const thunderVeinProbe = {
  get hide(): boolean { return [...veinMaterials].some(m => !m.visible); },
  set hide(v: boolean) { for (const m of veinMaterials) m.visible = !v; },
};
export const THUNDER_COLUMN_STARTS = [2.4, 2.88, 3.36, 3.84, 4.32, 4.8, 5.14] as const;
const COLUMN_LIVES = [.86, .84, .88, .86, .9, .88, .86] as const;
type Event = { at: number; kind: "flash" | "vein" | "seed" | "fan" | "echo" | "climax" | "sustain" | "tail"; tier?: number };
const EVENTS: Event[] = ([
  ...[.18,.34,.5,.95,1.6,2.4,3.6,4.8,5.7].map(at=>({at,kind:"flash" as const})),
  ...Array.from({length:22},(_,i)=>({at:.62+i*.25+((i*7)%3)*.03,kind:"vein" as const})),
  {at:.6,kind:"seed"}, {at:.72,kind:"fan",tier:1}, {at:1.1,kind:"fan",tier:2},
  {at:1.54,kind:"fan",tier:3}, {at:1.98,kind:"fan",tier:4},
  ...THUNDER_COLUMN_STARTS.map((at,tier)=>({at,kind:"climax" as const,tier})),
  ...Array.from({length:22},(_,i)=>({at:2.4+(i+1)*.16,kind:"sustain" as const})),
  ...[6,6.2,6.4,6.6,6.8].map(at=>({at,kind:"tail" as const})),
] satisfies Event[]).sort((a,b)=>a.at-b.at);

export class ThunderUltChain {
  readonly group = new THREE.Group();
  readonly cameraPunch: UltCameraPunch;
  readonly pools = new Map<Clip, FlipbookPool>();
  private readonly blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  private readonly textures = new Set<THREE.Texture>();
  private readonly visited = new Set<number>();
  private readonly casterAt = new THREE.Vector3();
  private readonly source = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly cloud: StormCloud;
  private readonly deck: CloudVolume;
  private readonly art: ThunderNguLoi;
  private readonly spill = [new THREE.PointLight(), new THREE.PointLight()];
  private readonly residualIds: number[] = [];
  private readonly probeCamera: THREE.PerspectiveCamera | undefined;
  private readonly temp = new THREE.Vector3();
  private readonly cloudCentre = new THREE.Vector3();
  private readonly flashAt = new THREE.Vector3();
  private t = -1;
  private cursor = 0;
  private previous = -1;
  private frontiers: number[][] = [];
  private columnPlan: { target: number; point: THREE.Vector3; density: number }[] = [];
  private headingX = 0;
  private headingZ = -1;
  private turnSign = 1;
  private loading: Promise<void> | null = null;
  private disposed = false;
  private error: string | null = null;
  last: ThunderChainReport | null = null;
  constructor(parent: THREE.Object3D, private readonly base: string, private readonly host: ThunderChainHost, search = "") {
    this.group.name = "fx-thunder-ult-chain"; this.group.visible = false; parent.add(this.group); this.blank.needsUpdate = true;
    for (const [id, mode, capacity] of SOURCES) {
      const pool = new FlipbookPool(id, mode, capacity, id === CLOUD ? 10 : 15, this.blank);
      pool.softM = 0.12; pool.vignette = 0.5; pool.bodyCap = 0.9;
      this.pools.set(id, pool); this.group.add(pool.mesh);
      if (id === "thunder-five-lingering-arcs-wg" || id === "thunder-release") {
        veinMaterials.add(pool.mesh.material);
        // 434l probe: ?veins=off renders the same deterministic cast without the vein art, for coverage diffs.
        if (new URLSearchParams(search).get("veins") === "off") pool.mesh.material.visible = false;
      }
    }
    for (const light of this.spill) {
      light.color.setRGB(0.36, 0.16, 0.9); light.intensity = 0; light.distance = 34; light.decay = 2;
      light.name = "thunder-cloud-spill"; this.group.add(light);
    }
    this.cloud = new StormCloud(this.group, this.blank);
    this.deck = new CloudVolume(this.group, { ...CLOUD_PRESETS.thunder, lightningIntensity: 0,
      appearSeconds: 0.55, dissolveSeconds: 1, seed: 431 }); this.art = new ThunderNguLoi(this.group, host.upload, host.camera);
    this.probeCamera = host.camera?.clone();
    this.cameraPunch = new UltCameraPunch(parent, search);
    if (host.camera !== undefined) this.cameraPunch.bindCamera(host.camera);
  }
  get active(): boolean { return this.t >= 0; }
  get ready(): boolean { return this.art.ready && !this.disposed && [...this.pools.values()].every(p => p.meta !== null); }
  get live(): number { let n = this.cloud.live + this.art.live + (this.deck.active ? 1 : 0); for (const p of this.pools.values()) n += p.live; return n; }
  get dropped(): number { let n = this.art.dropped; for (const p of this.pools.values()) n += p.dropped; return n; }
  /** Load only the existing component library; every attached texture is owned exactly once. */
  prepare(): Promise<void> {
    if (this.disposed || this.ready) return Promise.resolve();
    if (this.loading !== null) return this.loading;
    const folder = this.base + "thunder/";
    this.loading = Promise.allSettled([this.art.prepare(), ...SOURCES.map(async ([id, mode]) => {
      if (this.pools.get(id)!.meta !== null) return;
      const response = await fetch(folder + id + ".json");
      if (!response.ok) throw new Error(id + ": HTTP " + response.status);
      const raw = await response.json() as { image: string };
      const meta = parseFlipbookManifest({ clips: [{ ...raw, file: raw.image, mode }] }, folder).get(id)!;
      const compressed = { ...meta, ktx2: { uastc: { url: folder + id + ".uastc.ktx2", bytes: 0 } } };
      const loaded = await loadClip(compressed, 4, false, new THREE.TextureLoader());
      if (this.disposed) { loaded.texture.dispose(); return; }
      this.textures.add(loaded.texture); this.pools.get(id)!.attach(meta, loaded.texture);
      if (id === CLOUD) this.cloud.attach(meta, loaded.texture);
      this.host.upload?.(loaded.texture);
    })]).then(results => {
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed !== undefined) throw failed.reason;
      this.error = null;
    }).catch((e: unknown) => {
      this.error = String(e); console.warn("[thunder-ult-chain]", e);
    }).finally(() => { this.loading = null; if (this.last !== null) { this.last.assetsReady = this.ready; this.last.loadError = this.error; } });
    return this.loading;
  }
  cast(): ThunderChainReport {
    if (this.disposed) throw new Error("ThunderUltChain is disposed");
    this.clear(); void this.prepare(); this.t = 0; this.group.visible = true;
    this.host.caster(this.casterAt); this.host.hand(this.source);
    this.cloudCentre.set(0, 11.9, 0);
    let count = 0;
    for (let i = 0; i < this.host.targets.size; i++) if (this.host.targets.alive(i)) {
      this.cloudCentre.x += this.host.targets.x(i); this.cloudCentre.z += this.host.targets.z(i); count++;
    }
    if (count > 0) { this.cloudCentre.x /= count; this.cloudCentre.z /= count; }
    else { this.cloudCentre.x = this.casterAt.x; this.cloudCentre.z = this.casterAt.z - 10; }
    if (this.host.camera !== undefined && this.probeCamera !== undefined && this.host.camera.fov < 35) {
      const camera = this.host.camera;
      camera.updateWorldMatrix(true, false); camera.matrixWorld.decompose(this.probeCamera.position, this.probeCamera.quaternion, this.probeCamera.scale);
      this.probeCamera.aspect = 1280 / 720; this.probeCamera.updateProjectionMatrix(); this.probeCamera.updateMatrixWorld(true);
    }
    const envelope = this.cloud.configure(this.cloudCentre, this.probeCamera);
    this.cloudCentre.copy(this.cloud.centre); this.flashAt.copy(this.cloudCentre);
    this.deck.configure({ centre: { x: this.cloud.centre.x, z: this.cloud.centre.z }, radius: this.cloud.width * 0.5,
      aspect: this.cloud.depth / this.cloud.width, baseHeight: 10.2, thickness: 11 });
    this.deck.clear(true); this.deck.show();
    const effect = this;
    for (let i = 0; i < this.spill.length; i++) this.spill[i]!.position.set(this.cloudCentre.x + (i * 2 - 1) * 7, 6.5, this.cloudCentre.z + 12);
    this.last = { get cloudState() { return effect.deck.probeState(); }, get sections() { return []; }, get art() { return effect.art.snapshot(effect.t); }, clock: 0, plannedHops: Math.min(count, THUNDER_CHAIN_TIMING.maxHops), hops: [], climaxAt: -1, climaxTarget: -1,
      fanouts: [], peakRays: 0, jolts: 0, columnSounds: [], columns: [], kills: 0, finalHits: 0, residuals: 0, cancelled: false, assetsReady: this.ready, loadError: this.error, live: 0, dropped: 0, cameraPunch: this.cameraPunch.report,
      cloud: envelope, cloudNow: envelope, climax: null, residualTargets: [], residualWindowS: [6, 7] };
    this.host.sound?.("gather", this.source); this.present(); return this.last;
  }
  private position(i: number, out: THREE.Vector3): void { const f = this.host.targets; out.set(f.x(i), f.midY(i), f.z(i)); }
  private shot(id: Clip, at: THREE.Vector3, size: number, life: number, frame = 0, intensity = 0.85): void {
    const pool = this.pools.get(id)!, meta = pool.meta;
    if (meta === null) return;
    pool.spawn(at, size, { life, frame, rate: Math.max(0, meta.frames - 1 - frame) / (meta.fps * life),
      tint: PALE, intensity, fadeIn: 0, fadeOut: life * 0.3, cool: 0, occlude: 0.1 });
  }
  private ray(from: number, target: number, end: THREE.Vector3, tier: number, variant: number, seed: number): void {
    if(from<0)this.host.hand(this.source);else this.position(from,this.source);
    const width=this.art.hop(this.source,end,this.t,
      p=>{if(from<0)this.host.hand(p);else this.position(from,p);},
      target<0?((offset:THREE.Vector3)=>(p:THREE.Vector3)=>{this.position(from,p);p.add(offset);})(end.clone().sub(this.source)):p=>this.position(target,p),variant,seed);
    const dx=end.x-this.source.x,dz=end.z-this.source.z;
    this.last!.hops.push({at:this.t,from,target,tier,variant,bearingDeg:Math.atan2(dz,dx)*180/Math.PI,
      start:this.source.toArray(),end:end.toArray(),widthM:width,widthPx:arcPixels(this.source,end,width,this.probeCamera),
      holdS:.22,branches:0,turnDeg:null,turn:"initial"});
    if(target>=0){
      this.visited.add(target);this.host.stun(target,.32,dx/(Math.hypot(dx,dz)||1),dz/(Math.hypot(dx,dz)||1));
      this.shot(IMPACT,end,1.3,.28,1,.6);
    }
    this.shot("thunder-sparkle",end,target<0?.65:1,.24,0,.7);
  }
  private seed(): void {
    this.host.hand(this.source);let best=-1,distance=Infinity;
    for(let i=0;i<this.host.targets.size;i++)if(this.host.targets.alive(i)){
      const d=Math.hypot(this.host.targets.x(i)-this.casterAt.x,this.host.targets.z(i)-this.casterAt.z);
      if(d<distance){distance=d;best=i;}
    }
    if(best<0)return;
    this.host.release(this.source,0);this.shot("thunder-release",this.source,1.8,.28);
    this.position(best,this.at);this.ray(-1,best,this.at,0,0,noise(434));this.frontiers[0]=[best];
    this.host.sound?.("jump",this.at);
  }
  private fan(tier: number): void {
    const f=this.host.targets, r=this.last!, frontier=(this.frontiers[tier-1]??[]).filter(i=>f.alive(i));
    // Reserve four rays for the existing cloud veins. Under pressure reduce the entire next tier to two per source, then omit its farthest sources.
    // Expand from the outside of the previous wave, with sources spread across the herd.
    frontier.sort((a,b)=>Math.abs(f.x(b)-this.casterAt.x)-Math.abs(f.x(a)-this.casterAt.x)||a-b);
    const available=20-this.art.chainCards.countAt(this.t), reduced=frontier.length*4>available;
    const sources:number[]=[],next:number[]=[];
    for(const i of frontier)if(sources.length<Math.floor(available/2)&&sources.every(j=>Math.hypot(f.x(i)-f.x(j),f.z(i)-f.z(j))>=3))sources.push(i);
    let remaining=available;
    for(let k=0;k<sources.length;k++){
      const from=sources[k]!, wanted=Math.min(reduced?2:tier===1?4:3+(noise(from*71+tier*31)>.5?1:0),remaining-2*(sources.length-k-1));
      const origin=new THREE.Vector3();this.position(from,origin);
      const selected:{target:number;angle:number;length:number}[]=[], gap=(a:number,b:number)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
      const candidates:{target:number;angle:number;length:number}[]=[];
      for(let i=0;i<f.size;i++)if(f.alive(i)&&!this.visited.has(i)&&i!==from){
        const dx=f.x(i)-origin.x,dz=f.z(i)-origin.z,d=Math.hypot(dx,dz);
        if(d>=1.5&&d<=10.5)candidates.push({target:i,angle:Math.atan2(dz,dx),length:d});
      }
      const axis=noise(from*43+tier*937+434)*Math.PI*2;
      // Pick near foes in distinct directions, leaving a safety margin for animated chest movement.
      candidates.sort((a,b)=>a.length-b.length||a.target-b.target);
      for(let j=0;j<wanted;j++){
        const feasible=candidates.filter(c=>!selected.includes(c)&&selected.every(q=>gap(c.angle,q.angle)>=62*Math.PI/180));
        feasible.sort((a,b)=>{
          const score=(c:typeof a)=>c.length*.42 + Math.abs(f.x(c.target)-this.casterAt.x)*.12
            + (selected.length?Math.min(...selected.map(q=>gap(c.angle,q.angle)))*1.8:-gap(c.angle,axis)*.5);
          return score(b)-score(a)||a.target-b.target;
        });
        let pick=feasible[0];
        if(!pick){
          // Empty direction: a short C fragment ending in the existing sparkle component.
          let angle=axis,score=-1;
          for(let n=0;n<72;n++){
            const a=axis+n*Math.PI/36,g=selected.length?Math.min(...selected.map(q=>gap(a,q.angle))):Math.PI;
            if(g>score){score=g;angle=a;}
          }
          pick={target:-1,angle,length:3+noise(from*17+j*31+tier)*2};
        }
        pick.angle=Math.atan2(Math.sin(pick.angle),Math.cos(pick.angle));
        selected.push(pick);
        if(pick.target>=0)this.visited.add(pick.target);
      }
      const angles=selected.map(a=>a.angle).sort((a,b)=>a-b), gaps=angles.map((a,i)=>((angles[(i+1)%angles.length]!-a+Math.PI*2)%(Math.PI*2))*180/Math.PI);
      r.fanouts.push({at:this.t,source:from,tier,rays:selected.length,anglesDeg:gaps,targets:selected.map(q=>q.target)});
      const offset=Math.floor(noise(from*83+tier)*4);
      selected.forEach((q,j)=>{
        const to=new THREE.Vector3(origin.x+Math.cos(q.angle)*q.length,origin.y,origin.z+Math.sin(q.angle)*q.length);
        if(q.target>=0){this.position(q.target,to);next.push(q.target);}
        this.ray(from,q.target,to,tier,(j+offset)%4,noise(from*83+tier*919+j*47));
      });
      remaining-=selected.length;
    }
    this.frontiers[tier]=next;this.host.sound?.("jump",this.source);
  }
  private echo(tier: number): void {
    const rays=this.last!.hops.filter(h=>h.tier===tier && h.at< this.t-.25);
    for(const h of rays){
      if(this.art.chainCards.countAt(this.t)>=20)break;
      if(!this.host.targets.alive(h.from))continue;
      const origin=new THREE.Vector3();this.position(h.from,origin);
      const offset=new THREE.Vector3().fromArray(h.end).sub(new THREE.Vector3().fromArray(h.start));
      const to=origin.clone().add(offset);
      if(h.target>=0){this.position(h.target,to);this.host.stun(h.target,.32,0,-.2);}
      this.host.stun(h.from,.32,0,-.2);
      if(h.target<0)this.shot("thunder-sparkle",to,.65,.24,0,.7);
      this.art.hop(origin,to,this.t,
        p=>this.position(h.from,p),h.target<0?p=>{this.position(h.from,p);p.add(offset);}:p=>this.position(h.target,p),h.variant,noise(h.from*83+tier*919+h.variant*47));
    }
    this.host.sound?.("jump",this.source);
  }
  private hit(i: number, from: THREE.Vector3, power: number, role: ImpactRole, stun: number): void {
    const f = this.host.targets, dx = f.x(i) - from.x, dz = f.z(i) - from.z, len = Math.hypot(dx, dz) || 1;
    this.host.stun(i, stun, dx / len, dz / len);
    if (this.host.blow(i, dx / len, dz / len, power, role)) this.last!.kills++;
  }
  private planColumns(): void {
    const f=this.host.targets, candidates:{target:number;point:THREE.Vector3;density:number}[]=[];
    for(let i=0;i<f.size;i++)if(f.alive(i)&&Math.hypot(f.x(i)-this.casterAt.x,f.z(i)-this.casterAt.z)>8){
      let density=0;
      for(let j=0;j<f.size;j++)if(f.alive(j)&&Math.hypot(f.x(j)-f.x(i),f.z(j)-f.z(i))<=4.5)density++;
      candidates.push({target:i,point:new THREE.Vector3(f.x(i),.08,f.z(i)),density});
    }
    candidates.sort((a,b)=>b.density-a.density||a.target-b.target);
    const final=candidates[0];if(!final)return;
    const chosen=[final];
    for(let k=0;k<6;k++){
      const feasible=candidates.filter(c=>chosen.every(p=>c.point.distanceTo(p.point)>=5.4));
      const score=(c:typeof final)=>c.density + Math.min(...chosen.map(p=>c.point.distanceTo(p.point)))*1.1;
      feasible.sort((a,b)=>score(b)-score(a)||a.target-b.target);
      if(!feasible[0])break;chosen.push(feasible[0]);
    }
    // Reserve the globally densest pack for the only large final accent.
    this.columnPlan=[...chosen.slice(1),final];
  }
  private climax(index: number): void {
    if(index===0)this.planColumns();
    const c=this.columnPlan[index];if(!c)return;
    const r=this.last!, final=index===this.columnPlan.length-1, life=COLUMN_LIVES[index]!, width=final?5.6:3.4;
    this.at.copy(c.point);this.cloud.strikeOrigin(this.at,this.source);this.flashAt.copy(this.source);
    this.art.strike(this.source,this.at,this.t,life,width,final,index);
    const rate=final?.965:.97+noise(index*71+434)*.065,delay=noise(index*113+434)*.022;
    r.columns.push({at:this.t,target:c.target,point:c.point.toArray(),life,width,density:c.density,final,rate,delay});
    r.columnSounds.push(this.t+delay);
    thunderColumnSound(()=>this.host.sound?.("climax",this.at),rate,delay,final?1:.7);
    this.shot("thunder-sparkle",this.at,final?5:3.2,.4,0,final?.9:.6);
    if(final){
      r.climaxAt=this.t;r.climaxTarget=c.target;
      r.climax={start:this.source.toArray(),end:this.at.toArray(),widthM:width,widthPx:arcPixels(this.source,this.at,width,this.probeCamera),branches:4,branchLengthsM:[],flashFrames60Hz:2,groundHoldS:life,groundFadeS:.3,scorchDelayS:life,scorchFadeS:1};
      this.host.strike(this.at);
    }
    for(let i=0;i<this.host.targets.size;i++)if(this.host.targets.alive(i)&&Math.hypot(this.host.targets.x(i)-this.at.x,this.host.targets.z(i)-this.at.z)<=4){
      this.host.stun(i,.3,0,-1);r.jolts++;
    }
  }
  /** 434l: a vein on the cloud underside facing the play camera; art tiles at uniform scale plus a local glow patch. */
  private vein(k: number, size: number, intensity: number): void {
    const w = this.cloud.width, d = this.cloud.depth, c = this.cloud.centre;
    this.at.set(c.x + (noise(k + 1) - 0.5) * w * 0.75, c.y - 6.1 + noise(k) * 0.4, c.z + d * 0.42 + (noise(k + 2) - 0.5) * d * 0.15);
    this.temp.copy(this.at); this.temp.x += (noise(k + 3) < 0.5 ? -1 : 1) * size * 0.85; this.temp.z += (noise(k + 4) - 0.5) * 1.2;
    for (let j = 0; j < 2; j++) {
      this.flashAt.lerpVectors(this.at, this.temp, j * 0.85);
      this.shot("thunder-five-lingering-arcs-wg", this.flashAt, size, 0.17, (k + j * 5) % 12, intensity);
    }
    this.flashAt.lerpVectors(this.at, this.temp, 0.45);
    this.shot("thunder-release", this.flashAt, size * 1.15, 0.16, 0, 0.45);
  }
  /** 434l: a short bright horizontal branch across the cloud underside at each column strike. */
  private branch(): void {
    const c = this.cloud.centre, d = this.cloud.depth, dir = noise(this.t * 100) < 0.5 ? -1 : 1;
    for (let j = 0; j < 3; j++) {
      this.at.set(this.source.x + dir * j * 4.6, c.y - 6.15, c.z + d * 0.42);
      this.shot("thunder-five-lingering-arcs-wg", this.at, 6.2, 0.22, (j * 4 + Math.round(this.t * 10)) % 12, 1.1);
    }
  }
  private event(e: Event): void {
    if (e.kind === "seed") this.seed();
    else if(e.kind === "fan") this.fan(e.tier!);
    else if(e.kind === "echo") this.echo(e.tier!);
    else if(e.kind === "sustain") {
      const r=this.last!;
      for(const c of r.columns)if(this.t<c.at+c.life-1e-8){
        this.at.fromArray(c.point);
        for(let i=0;i<this.host.targets.size;i++)if(this.host.targets.alive(i)&&Math.hypot(this.host.targets.x(i)-this.at.x,this.host.targets.z(i)-this.at.z)<=4){
          this.host.stun(i,.22,Math.sin(i+this.t*43)*.35,-.3);r.jolts++;
        }
        this.shot("thunder-sparkle",this.at,c.final?3.3:2.2,.2,Math.floor(this.t*10)%8,.55);
      }
    }
    else if (e.kind === "vein") this.vein(Math.round(e.at * 100), 6.5, 0.95);
    else if (e.kind === "climax") { this.climax(e.tier!); this.branch(); }
    else if (e.kind === "flash") {
      // Veins inside the deck: a short branched arc at a different spot each time, lighting the puffs around it.
      const k = Math.round(e.at * 100), w = this.cloud.width, d = this.cloud.depth;
      this.at.copy(this.cloudCentre).setY(this.cloudCentre.y - 5.5 + noise(k));
      this.at.x += (noise(k + 1) - 0.5) * w * 0.7; this.at.z += d * 0.44 + (noise(k + 2) - 0.5) * d * 0.25;
      this.temp.copy(this.at); this.temp.x += (noise(k + 3) - 0.5) * w * 0.45; this.temp.z += (noise(k + 4) - 0.5) * d * 0.4;
      this.temp.y += (noise(k + 5) - 0.5) * 0.8;
      // 434k: veins are tiles of the lingering-arcs flipbook along the vein, uniform scale, no stretched ribbon.
      const tiles = Math.max(2, Math.min(4, Math.round(this.at.distanceTo(this.temp) / 2.6)));
      for (let j = 0; j < tiles; j++) {
        this.flashAt.lerpVectors(this.at, this.temp, (j + 0.5) / tiles);
        this.shot("thunder-five-lingering-arcs-wg", this.flashAt, 2.6, 0.19, (k + j * 5) % 12, 0.6);
      }
      this.flashAt.lerpVectors(this.at, this.temp, 0.5);
      this.shot("thunder-release", this.flashAt, 3.4, 0.18, 0, 0.35);
    } else {
      if (this.residualIds.length === 0) {
        // Prefer struck survivors, then fill from nearby live beasts if the finisher killed those survivors.
        for (const i of this.visited) if (this.host.targets.alive(i) && this.residualIds.length < 8) this.residualIds.push(i);
        for (let i = 0; i < this.host.targets.size && this.residualIds.length < 8; i++)
          if (this.host.targets.alive(i) && !this.residualIds.includes(i)) this.residualIds.push(i);
        this.last!.residualTargets = [...this.residualIds];
      }
      for (const i of this.residualIds) if (this.host.targets.alive(i)) {
        this.position(i, this.at);
        this.shot("thunder-five-lingering-arcs-wg", this.at, 1.8, 0.2, Math.round(this.t * 7) % 12, 0.85);
        this.shot("thunder-sparkle", this.at, 0.85, 0.2, 0, 0.6);
        // 434k: second residual arc is another flipbook tile, offset, instead of a code-drawn ribbon.
        this.at.x += 0.35; this.at.y += 0.3;
        this.shot("thunder-five-lingering-arcs-wg", this.at, 1.2, 0.2, (Math.round(this.t * 7) + 6 + i) % 12, 0.7);
        this.last!.residuals++;
      }
      if (e.at === 6) {
        const f=this.host.targets;
        for(let i=0;i<f.size;i++)if(f.alive(i)&&this.last!.columns.some(c=>Math.hypot(f.x(i)-c.point[0]!,f.z(i)-c.point[2]!)<=4)){
          this.hit(i,this.casterAt,1,"finisher",.45);this.last!.finalHits++;
        }
        this.deck.hide();this.host.sound?.("tail", this.source);}
    }
  }
  private advance(dt: number): void {
    for (const pool of this.pools.values()) { pool.update(dt); pool.update(0); }
    this.cameraPunch.update(dt);
    this.deck.update(dt);
    if (this.t >= 6 && this.deck.shown) this.deck.hide();
  }
  private present(): void {
    const charge = this.pools.get("thunder-charge")!;
    charge.clear();
    let pulse = 0;
    for (const event of EVENTS) if (event.kind === "flash" || event.kind === "vein" || event.kind === "climax") {
      const age = this.t - event.at;
      if (age >= 0 && age < 0.18) pulse = Math.max(pulse, 1 - ease(age / 0.18));
    }
    this.cloud.present(this.t, pulse); this.cloud.body.mesh.visible = false; this.cloud.wash.clear(); this.art.present(this.t);
    for (const light of this.spill) light.intensity = pulse * 100;
    if (this.t < 0.6 && charge.meta !== null) {
      this.host.hand(this.temp);
      charge.spawn(this.temp, 1.5, { life: ONE_FRAME, rate: 0, frame: this.t * charge.meta.fps * 2, tint: PALE,
        intensity: 0.75, alpha: ease(this.t / 0.15), fadeOut: 0 });
    }
    for (const p of this.pools.values()) p.update(0);
    if (this.last !== null) {
      const sections:{slot:number;segment:number}[]=[], cloudRays=new Map<number,number>();
      for(const section of sections)cloudRays.set(section.slot,Math.max(cloudRays.get(section.slot)??1,1+Math.ceil(Math.max(0,section.segment-17)/3)));
      const artRays=this.art.rayCountAt(this.t)+(this.t>=6&&this.t<6.32?8:0);
      this.last.peakRays=Math.max(this.last.peakRays,artRays+[...cloudRays.values()].reduce((a,b)=>a+b,0));
      this.last.clock = this.t; this.last.live = this.live; this.last.dropped = this.dropped;
      if (this.host.camera !== undefined) this.last.cloudNow = this.cloud.envelope(this.host.camera);
    }
  }
  update(dt: number): void {
    if (!this.active || !Number.isFinite(dt) || dt < 0) return;
    const end = Math.min(THUNDER_CHAIN_TIMING.end, this.t + dt);
    while (this.cursor < EVENTS.length && EVENTS[this.cursor]!.at <= end + 1e-9) {
      const event = EVENTS[this.cursor++]!; this.advance(Math.max(0, event.at - this.t)); this.t = event.at; this.event(event);
    }
    this.advance(Math.max(0, end - this.t)); this.t = end; this.present();
    if (end >= THUNDER_CHAIN_TIMING.end - 1e-9) this.finish();
  }
  private finish(): void {
    for (const pool of this.pools.values()) pool.clear(); this.cloud.clear(); this.deck.clear(); this.art.clear(); this.residualIds.length = 0; this.cameraPunch.clear();
    for (const light of this.spill) light.intensity = 0;
    this.group.visible = false; this.t = -1; this.cursor = 0; this.previous = -1; this.visited.clear();
    this.headingX = 0; this.headingZ = -1; this.turnSign = 1;this.frontiers=[];this.columnPlan=[];
    if (this.last !== null) this.last.live = 0;
  }
  clear(): void { if (this.active && this.last !== null) this.last.cancelled = true; this.finish(); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.clear(); this.cameraPunch.dispose(); this.cloud.dispose(); this.deck.dispose(); this.art.dispose();
    for (const light of this.spill) light.dispose();
    for (const pool of this.pools.values()) pool.dispose();
    for (const texture of this.textures) texture.dispose(); this.textures.clear(); this.blank.dispose(); this.group.removeFromParent();
  }
}
