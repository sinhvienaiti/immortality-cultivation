/** 434f: the approved Ngũ Lôi art, sampled unchanged. Code only places, stretches, tints and times it. */
import * as THREE from "three";
import { FlipbookPool, ONE_FRAME, type FlipbookMeta } from "../view/skills/flipbook";
import { layFlat } from "../view/skills/element-clips";
import { THUNDER_SOURCES, THUNDER_STILLS, THUNDER_FLIPBOOKS, stillMeta, decal, lumaCore, coreSplit } from "./five-thunder";
import { ease, noise } from "./thunder-ult-chain-space";
import { ThunderChainCards } from "./thunder-ult-chain-card";
import { THUNDER_BOLT_PROFILE } from "./thunder-ult-bolt-profile";
const IDS = ["columnA", "columnCoreA", "boltA", "boltB", "boltC", "boltD", "crawlA", "crawlB", "crawlC", "crawlD", "burst", "lichtenberg", "scarHot", "scarCold"] as const;
type Layer = typeof IDS[number];
const BOLTS = ["boltA", "boltB", "boltC", "boltD"] as const, CRAWLS = ["crawlA", "crawlB", "crawlC", "crawlD"] as const;
const VIOLET = new THREE.Color(0.66, 0.32, 0.9), CORE = new THREE.Color(0.88, 0.76, 1), CHAR = new THREE.Color(0.15, 0.13, 0.12);
/** Dev-only pixel probe: hide just the instance ending here; a distant default keeps every normal link visible. */
const probeKey = Symbol.for("thunder-434g-hop-hide-end");
const probeStore = globalThis as unknown as { [key: symbol]: { value: THREE.Vector3 } };
export const thunderHopHideEnd = probeStore[probeKey] ??= { value: new THREE.Vector3(1e6, 1e6, 1e6) };
const soloKey = Symbol.for("thunder-434g-hop-solo-end");
export const thunderHopSoloEnd = probeStore[soloKey] ??= { value: new THREE.Vector3(1e6, 1e6, 1e6) };
interface Link { layer: Layer; from: THREE.Vector3; to: THREE.Vector3; born: number; width: number; hold: number; fade: number; primary: boolean; column: number; ray: number }
/** A textured card stretched between two world endpoints; its silhouette is entirely the source image. */
function between(pool: FlipbookPool, fill: number, flat: boolean): void {
  const m = pool.mesh.material, before = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.customProgramCacheKey = () => key + "|434f-endpoints-" + fill + "-" + flat;
  m.onBeforeCompile = (s, r) => {
    before.call(m, s, r);
    const start = s.vertexShader.indexOf("  vec4 view = modelViewMatrix * vec4(iPos, 1.0);");
    if (start < 0) throw new Error("434f: missing placement anchor");
    s.vertexShader = s.vertexShader.slice(0, start) + `
  vec3 along = iDir.xyz;
  vec3 eye = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec3 side = ${flat ? "vec3(-along.z, 0.0, along.x)" : "cross(along, eye)"};
  side = normalize(side + vec3(1e-7));
  vec3 world = iPos + along * ((uv.y - uPivot.y) / ${fill.toFixed(3)}) + side * (uv.x - uPivot.x) * iData.x;
  vWorld = (modelMatrix * vec4(world, 1.0)).xyz;
  vec4 view = viewMatrix * vec4(vWorld, 1.0);
  gl_Position = projectionMatrix * view;
  if (iLift.x != 0.0) { vec4 nearView = projectionMatrix * vec4(view.xy, view.z + iLift.x, 1.0); gl_Position.z = nearView.z / nearView.w * gl_Position.w; }
}`;
  };
}
/** Fit the existing trunk independently of its empty margins and wide, wandering branches. */
function fitHop(pool: FlipbookPool): void {
  const m = pool.mesh.material, before = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.customProgramCacheKey = () => key + "|434g-source-trunk-fit";
  m.onBeforeCompile = (s, r) => {
    before.call(m, s, r);
    s.uniforms.uBoltProfile = { value: THUNDER_BOLT_PROFILE.map(p => new THREE.Vector2(...p)) };
    s.uniforms.uHopHideEnd = thunderHopHideEnd;
    s.uniforms.uHopSoloEnd = thunderHopSoloEnd;
    s.vertexShader = "uniform vec3 uHopHideEnd;\nuniform vec3 uHopSoloEnd;\nvarying float vBoltHidden;\nvarying float vBoltBend;\n" + s.vertexShader;
    s.vertexShader = s.vertexShader.replace("  vec3 world = iPos + along", "  vBoltHidden = (distance(iPos, uHopHideEnd) < 0.001 || (uHopSoloEnd.x < 1e5 && distance(iPos, uHopSoloEnd) > 0.001)) ? 1.0 : 0.0;\n  vBoltBend = min(1.15, length(along) / iData.x * 1.8);\n  vec3 world = iPos + along");
    s.vertexShader = s.vertexShader.replace("((uv.y - uPivot.y) / 0.630)", "((uv.y - 0.04) / 0.92)")
      .replace("(uv.x - uPivot.x) * iData.x", "(uv.x - 0.5) * iData.x");
    s.fragmentShader = "uniform vec2 uBoltProfile[128];\nvarying float vBoltHidden;\nvarying float vBoltBend;\n" + s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace("  if (vAlpha <= 0.0) discard;", "  if (vAlpha <= 0.0 || vBoltHidden > 0.5) discard;");
    s.fragmentShader = s.fragmentShader.replace("  vec2 uv = clamp(vUv, 0.004, 0.996);", `
  float sourceT = clamp((0.96 - vUv.y) / 0.92, 0.0, 1.0);
  float row = sourceT * 127.0;
  int i = int(floor(row));
  vec2 trunk = mix(uBoltProfile[i], uBoltProfile[min(i + 1, 127)], fract(row));
  float chord = mix(uBoltProfile[0].x, uBoltProfile[127].x, sourceT);
  float x = vUv.x - 0.5 - (trunk.x - chord) * vBoltBend;
  float ax = abs(x);
  // A 36% card body samples the measured luminous trunk; the outer wings still sample its real branches.
  float offset = ax <= 0.18 ? ax / 0.36 * trunk.y
    : mix(trunk.y * 0.5, 0.42, clamp((ax - 0.18) / 0.32, 0.0, 1.0));
  vec2 uv = clamp(vec2(trunk.x + sign(x) * offset, 1.0 - mix(0.23, 0.73, sourceT)), 0.004, 0.996);`);
  };
}
export class ThunderNguLoi {
  readonly group = new THREE.Group();
  readonly pools = new Map<Layer, FlipbookPool>();
  private readonly blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  private readonly textures = new Set<THREE.Texture>();
  private readonly links: Link[] = [];
  readonly chainCards: ThunderChainCards;
  private readonly columns: { from: THREE.Vector3; to: THREE.Vector3; born: number; life: number; width: number; final: boolean; seed: number }[] = [];
  private readonly dir = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly screenA = new THREE.Vector3();
  private readonly screenB = new THREE.Vector3();
  private loading: Promise<void> | null = null;
  private disposed = false;
  error: string | null = null;
  constructor(parent: THREE.Object3D, private readonly upload?: (t: THREE.Texture) => void, private readonly camera?: THREE.PerspectiveCamera) {
    this.group.name = "thunder-nguloi-art"; parent.add(this.group); this.blank.needsUpdate = true;
    this.chainCards = new ThunderChainCards(this.group, camera, thunderHopHideEnd, thunderHopSoloEnd, upload);
    for (const id of IDS) {
      const scar = id === "scarHot" || id === "scarCold" || id === "lichtenberg";
      const p = new FlipbookPool("thunder-nguloi-" + id, "fire", id.startsWith("bolt") ? 6 : id.startsWith("crawl") || id.startsWith("column") || id === "burst" ? 4 : 7, scar ? 11 : 15, this.blank);
      p.vignette = scar ? 0.25 : 0.05; p.softM = 0.06; p.bodyCap = 0.9;
      if (id.startsWith("column") || id.startsWith("bolt") || id.startsWith("crawl")) {
        if (id.startsWith("bolt")) {
          coreSplit(p, 3.8);
          const m = p.mesh.material, before = m.onBeforeCompile, key = m.customProgramCacheKey();
          m.customProgramCacheKey = () => key + "|434f-neutral-tint";
          m.onBeforeCompile = (s, r) => { before.call(m, s, r); s.fragmentShader = s.fragmentShader.replace("  vec4 t = mix(t0, t1, w);", "  vec4 t = mix(t0, t1, w); t.rgb = vec3(max(t.r, max(t.g, t.b)));"); };
        } else lumaCore(p);
        between(p, id.startsWith("column") ? 0.8 : id.endsWith("A") ? 0.63 : id.endsWith("C") ? 0.72 : 0.9, id.startsWith("crawl"));
        if (id === "boltA") {
          fitHop(p);
          // A chest-to-chest flash stays visible on its two beasts, even when the gap is shorter than a body.
          p.mesh.material.depthTest = false;
        }
      } else { layFlat(p); if (scar) decal(p); else lumaCore(p); }
      this.group.add(p.mesh); this.pools.set(id, p);
    }
  }
  get ready(): boolean { return !this.disposed && this.chainCards.ready && [...this.pools.values()].every(p => p.meta !== null); }
  get live(): number { let n = this.chainCards.live; for (const p of this.pools.values()) n += p.live; return n; }
  get dropped(): number { let n = 0; for (const p of this.pools.values()) n += p.dropped; return n; }
  prepare(): Promise<void> {
    if (this.loading || this.ready || this.disposed) return this.loading ?? Promise.resolve();
    this.loading = Promise.all([this.chainCards.prepare(), ...IDS.filter(id => !id.startsWith("crawl")).map(async id => {
      const src = THUNDER_SOURCES[id], book = src.flipbook;
      const raw = book ? await fetch(THUNDER_FLIPBOOKS + book.folder + "/" + book.id + ".json").then(r => { if (!r.ok) throw new Error(book.id + ": " + r.status); return r.json(); }) : null;
      const url = raw ? THUNDER_FLIPBOOKS + book!.folder + "/" + raw.image : THUNDER_STILLS + src.still;
      const texture = await new THREE.TextureLoader().loadAsync(url);
      if (this.disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; texture.generateMipmaps = !id.startsWith("bolt");
      texture.minFilter = texture.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter; texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.premultiplyAlpha = false; texture.needsUpdate = true;
      this.textures.add(texture);
      const img = texture.image as { width: number; height: number }, grid = src.grid;
      const meta: FlipbookMeta = raw ? { id: raw.id, url, cols: raw.cols, rows: raw.rows, frames: raw.frames, fps: raw.fps, loop: false, mode: "fire", aspect: raw.cell[0] / raw.cell[1], pivot: book!.pivot ?? raw.pivot, start: 0, heading: 0, role: "clip" }
        : { ...stillMeta(id, url, img.width, img.height, src.pivot), ...(grid ? { cols: grid[0], rows: grid[1], frames: grid[0] * grid[1], aspect: (img.width / grid[0]) / (img.height / grid[1]) } : {}) };
      // The atlas has extra padding at A/C's foot; put the visible source foot on the world endpoint.
      if (id === "boltA" || id === "boltC") Object.assign(meta, { pivot: [meta.pivot[0], id === "boltA" ? 0.82 : 0.91] });
      this.pools.get(id)!.attach(meta, texture);
      if (id.startsWith("bolt")) this.pools.get(CRAWLS[BOLTS.indexOf(id as typeof BOLTS[number])]!)!.attach(meta, texture);
      this.upload?.(texture);
    })]).then(() => { this.error = null; }).catch(e => { this.error = String(e); console.warn("[434f]", e); }).finally(() => { this.loading = null; });
    return this.loading;
  }
  hop(from: THREE.Vector3, to: THREE.Vector3, t: number, followFrom?: (out: THREE.Vector3) => void, followTo?: (out: THREE.Vector3) => void, variant?: number, seed?: number): number {
    return this.chainCards.hop(from, to, t, followFrom, followTo, variant, seed);
  }
  private hopWidth(from: THREE.Vector3, to: THREE.Vector3): number {
    if (!this.camera) return 3.2;
    this.camera.updateWorldMatrix(true, false);
    this.eye.setFromMatrixColumn(this.camera.matrixWorld, 2);
    this.dir.subVectors(from, to); this.side.crossVectors(this.dir, this.eye).normalize();
    this.screenA.addVectors(from, to).multiplyScalar(0.5);
    this.screenB.copy(this.screenA).add(this.side);
    this.screenA.project(this.camera); this.screenB.project(this.camera);
    const pixelsPerM = Math.hypot((this.screenB.x - this.screenA.x) * 640, (this.screenB.y - this.screenA.y) * 360);
    return 22 / (0.36 * Math.max(1, pixelsPerM));
  }
  strike(from: THREE.Vector3, to: THREE.Vector3, t: number, life=.86, width=3.4, final=false, seed=0): void {
    const column=this.columns.length;
    this.columns.push({from:from.clone(),to:to.clone(),born:t,life,width,final,seed});
    this.links.push({layer:"columnA",from:from.clone(),to:to.clone(),born:t,width,hold:life,fade:0,primary:true,column,ray:0});
    // Four reusable crawl components per landing leave room for three overlapping columns and cloud veins.
    for(let j=0;j<4;j++){
      const a=j*Math.PI/2+.23+noise(seed*53+j*5)*.4,length=(final?4.2:3.1)+noise(seed*19+j*47)*1.6;
      const end=new THREE.Vector3(to.x+Math.cos(a)*length,.08,to.z+Math.sin(a)*length);
      this.links.push({layer:CRAWLS[j]!,from:to.clone(),to:end,born:t,width:1.3,hold:life-.1,fade:.1,primary:false,column,ray:j});
    }
  }
  private columnFrame(age:number,seed=0):number{return (Math.floor(Math.max(0,age)/.09+1e-7)*17+seed*11)%72;}
  private columnPulse(age:number):boolean{return age>=-1e-8&&age<2/60-1e-8;}
  private linkGain(l:Link,t:number):number{
    const age=t-l.born;
    return l.primary?1-ease((age-l.hold+.12)/.12):1-ease((age-l.hold)/l.fade);
  }
  rayCountAt(t:number):number{return this.chainCards.countAt(t)+this.links.filter(l=>t>=l.born-1e-8&&t<l.born+l.hold+l.fade-1e-8).length;}
  snapshot(t:number):unknown{return {ready:this.ready,error:this.error,sources:IDS.map(id=>({id,...THUNDER_SOURCES[id]})),
    columns:this.columns.map((c,i)=>({id:i,point:c.to.toArray(),born:c.born,life:c.life,width:c.width,final:c.final,scarUntil:7})),
    links:[...this.chainCards.snapshot(t),...this.links.filter(l=>t>=l.born-1e-8&&t<l.born+l.hold+l.fade-1e-8).map(l=>({
      layer:l.layer,start:l.from.toArray(),end:l.to.toArray(),born:l.born,widthM:l.width,primary:l.primary,column:l.column,
      gain:this.linkGain(l,t),frame:this.columnFrame(t-l.born,this.columns[l.column]!.seed),pulse:this.columns[l.column]!.final&&this.columnPulse(t-l.born)}))]};}
  present(t:number):void{
    this.chainCards.present(t);for(const p of this.pools.values())p.clear();
    for(const l of this.links){
      const age=t-l.born;if(age < -1e-8||age>=l.hold+l.fade-1e-8)continue;
      const c=this.columns[l.column]!,fade=this.linkGain(l,t),column=l.primary,crawl=l.layer.startsWith("crawl");
      const p=this.pools.get(l.layer)!;if(p.meta===null)continue;
      const epoch=Math.floor(Math.max(0,age)/.09+1e-7),frame=column?this.columnFrame(age,c.seed):(epoch+c.seed+l.ray)%5;
      if(crawl){
        const a=l.ray*Math.PI/2+.23+(noise(epoch*71+c.seed*53+l.ray)-.5)*.4;
        const length=(c.final?4.2:3.1)+noise(epoch*19+c.seed*17+l.ray)*1.6;
        l.to.set(c.to.x+Math.cos(a)*length,.08,c.to.z+Math.sin(a)*length);l.width=1.1+noise(epoch+l.ray)*.35;
      }
      this.dir.subVectors(l.from,l.to);
      const pulse=c.final&&this.columnPulse(age);
      const opts={life:ONE_FRAME,frame,rate:0,dir:this.dir,tint:VIOLET,intensity:column?(pulse?1.15:c.final?.85:.67):.5,
        alpha:fade,fadeOut:0,cool:0,occlude:.08,ground:0,lift:.12};
      p.spawn(l.to,l.width,opts);
      if(column)this.pools.get("columnCoreA")!.spawn(l.to,l.width,{...opts,tint:CORE,intensity:c.final?2.6:1.8,occlude:0,alpha:fade*(pulse?1:.52+.18*noise(epoch*31+c.seed))});
    }
    for(const c of this.columns){
      const age=t-c.born;if(age < -1e-8||t>=7-1e-8)continue;
      const tail=1-ease((t-6)/1),hot=1-ease((age-c.life+.12)/.6),size=c.final?10:7.2;
      const common={life:ONE_FRAME,rate:0,fadeOut:0,ground:0,rot:.37+noise(c.seed*53)*Math.PI*2,occlude:.9,lift:.12};
      this.pools.get("scarCold")!.spawn(c.to,size,{...common,tint:CHAR,intensity:.55,alpha:(1-hot)*tail});
      this.pools.get("scarHot")!.spawn(c.to,size,{...common,tint:VIOLET,intensity:.6,alpha:hot*tail});
      this.pools.get("lichtenberg")!.spawn(c.to,size*1.15,{...common,tint:CHAR,intensity:.5,alpha:.65*tail});
      if(age<c.life){const burst=age<.25?1-ease(age/.25):.12+.12*noise(Math.floor(age/.09)+c.seed*31);
        this.pools.get("burst")!.spawn(c.to,c.final?7:4.8,{...common,tint:VIOLET,intensity:c.final?.8:.65,alpha:burst,occlude:.05});}
    }
    for(const p of this.pools.values())p.update(0);
  }
  clear():void{this.chainCards.clear();this.links.length=0;this.columns.length=0;for(const p of this.pools.values())p.clear();}
  dispose(): void { if (this.disposed) return; this.disposed = true; this.clear(); this.chainCards.dispose(); for (const p of this.pools.values()) p.dispose(); for (const t of this.textures) t.dispose(); this.textures.clear(); this.blank.dispose(); this.group.removeFromParent(); }
}
