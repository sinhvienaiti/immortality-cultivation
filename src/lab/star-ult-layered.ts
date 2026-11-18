/** 454: VFX_STANDARD ultimate, owner's A/A/A/B stills, five phases; lab authority only. */
import * as THREE from "three";
import nodes from "../../art-src/lab/vfx/star-ult/constellation.nodes.json";
import type { MetalUltHost } from "./metal-ult-layered";
import { StarCards, type StarAtlas } from "./star-ult-cards";
import { StarUltCamera } from "./star-ult-camera";
export const STAR_ULT_ID = "ult-star";
export type StarSound = "gather" | "release" | "draw" | "node" | "launch" | "hit" | "climax" | "tail";
export interface StarUltHost extends Omit<MetalUltHost, "sound"> {
  camera: THREE.PerspectiveCamera;
  sound(event: StarSound, at: THREE.Vector3, pitch: number): void;
  anticipate(progress: number): void;
}
export const STAR_TIMING = { end: 8.4, launch: [2.6, 2.98, 3.36, 3.74, 4.12, 4.5, 5.4], fall: .42, climax: 5.82,
  skyHeight: 14, skyWidth: 22, skyBehind: 8, skyLeft: 6, skyTurnDegS: 1.5 } as const;
export const STAR_FRAME = { ndcY: .6, widthFrac: .58, opacity: .85 } as const;
export const STAR_SOURCES = {
  constellation: "star-ult/stills/star-constellation.v1-try1.png",
  head: "star-ult/stills/star-meteor-head.v1-try1.png",
  trail: "star-ult/stills/star-meteor-trail.v1-try1.png",
  // 454v: Firefly image-to-video flipbooks replace the two still placeholders (stills stay as the held end frame).
  diamond: "star-ult/video/star-diamond-bloom",
  drawn: "star-ult/video/star-constellation-draw",
  nodes: "aura/glint-starburst-set", charge: "star/star-charge", sparkle: "star/star-sparkle",
  release: "star/star-release", impact: "star/star-impact", burst: "star/star-big-burst",
  affliction: "star/star-hit-affliction", crack: "../firefly-sprint-2026-11-05/stills/skills/star-crack-star.v1-try1.png",
  twinkle: "aura/glint-gold-twinkle-set",
} as const;
type Part = keyof typeof STAR_SOURCES;
interface Meteor { target: number; birth: number; impact: number; aimed: boolean; launched: boolean; hit: boolean; from: THREE.Vector3; to: THREE.Vector3; angleDeg: number; }
export interface StarReport {
  clock: number; assetsReady: boolean; loadError: string | null; phase: string; impacts: number; kills: number;
  soundEvents: { event: StarSound; t: number; pitch: number }[]; meteors: { target: number; birth: number; impact: number; from: number[]; to: number[]; angleDeg: number }[];
  sky: { centre: number[]; widthM: number; heightM: number; opacity: number; turnDegS: number; screen: number[][]; widthFraction: number; inside: boolean };
  secondaryMax: number; hdrLayers: string[]; live: number; cameraPunch: StarUltCamera["report"];
}
const smooth = (a: number, b: number, t: number): number => THREE.MathUtils.smoothstep(t, a, b);
const hash = (i: number): number => { const x = Math.sin(i * 127.1 + 454) * 43758.5453; return x - Math.floor(x); };
export class StarUltLayered {
  readonly group = new THREE.Group();
  readonly punch: StarUltCamera;
  private readonly pools = new Map<Part, StarCards>();
  private readonly textures: THREE.Texture[] = [];
  private loading: Promise<void> | null = null;
  private error: string | null = null;
  private t = -1;
  private loaded = false;
  private released = false;
  private drawn = false;
  private tailed = false;
  private nodeDone = 0;
  private readonly origin = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly sky = new THREE.Vector3();
  private readonly hand = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  // 454t: the sky card is a camera-facing billboard framed in the upper field, so it reads in Alt+1 and Alt+2.
  private readonly skyRight = new THREE.Vector3();
  private readonly skyUp = new THREE.Vector3();
  private skyW = 22;
  private scale = 1;
  private skyAt(t: number): void {
    const c = this.host.camera; c.updateMatrixWorld(true);
    const dist = c.position.distanceTo(this.centre);
    this.projected.set(0, STAR_FRAME.ndcY, .5).unproject(c).sub(c.position).normalize();
    this.sky.copy(c.position).addScaledVector(this.projected, dist);
    this.skyW = 2 * dist * Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * c.aspect * STAR_FRAME.widthFrac;
    this.scale = THREE.MathUtils.clamp(this.skyW / 22, 1, 3);
    const turn = THREE.MathUtils.degToRad(STAR_TIMING.skyTurnDegS) * Math.max(0, t - 1.2), co = Math.cos(turn), si = Math.sin(turn);
    this.right.setFromMatrixColumn(c.matrixWorld, 0); this.up.setFromMatrixColumn(c.matrixWorld, 1);
    this.skyRight.copy(this.right).multiplyScalar(co).addScaledVector(this.up, si);
    this.skyUp.copy(this.up).multiplyScalar(co).addScaledVector(this.right, -si);
  }
  private meteors: Meteor[] = [];
  last: StarReport | null = null;
  constructor(parent: THREE.Object3D, private readonly base: string, private readonly host: StarUltHost) {
    this.group.name = "star-ult-layered"; parent.add(this.group); this.group.visible = false;
    this.punch = new StarUltCamera(host.camera);
    for (const part of Object.keys(STAR_SOURCES) as Part[]) {
      const n = part === "nodes" ? 14 : part === "sparkle" || part === "twinkle" ? 20 : part === "affliction" ? host.targets.size
        : ["head", "trail", "impact", "crack"].includes(part) ? 7 : 1;
      this.pools.set(part, new StarCards(this.group, part, n, part === "diamond" ? [1.65, 1.45, 1.1] : [.9, .86, .78]));
      // 454w: the climax glint was half buried in the ground at the beast's mid height; draw it over the field.
      if (part === "diamond") for (const m of this.pools.get(part)!.meshes) { m.material.depthTest = false; m.renderOrder = 12; }
    }
  }
  get active(): boolean { return this.t >= 0; }
  get ready(): boolean { return this.loaded; }
  prepare(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = Promise.all((Object.entries(STAR_SOURCES) as [Part, string][]).map(async ([part, path]) => {
      const still = path.endsWith(".png");
      const meta: StarAtlas = still ? { cols: 1, rows: 1, frames: 1, fps: 0 } : await (async () => {
        const r = await fetch(this.base + path + ".json"); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json();
      })();
      const t = await new THREE.TextureLoader().loadAsync(this.base + path + (still ? "" : ".atlas.png"));
      t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter;
      this.textures.push(t); this.host.upload?.(t);
      this.pools.get(part)!.attach(t, meta, (t.image.width / meta.cols) / (t.image.height / meta.rows));
    })).then(() => { this.loaded = true; }).catch(e => { this.error = String(e); });
    return this.loading;
  }
  cast(): StarReport {
    this.clear(); void this.prepare(); this.t = 0; this.group.visible = true;
    this.host.caster(this.origin); this.host.hand(this.hand); const targets = this.host.targets;
    this.centre.set(0, 0, 0); let count = 0;
    for (let i = 0; i < targets.size; i++) if (targets.alive(i)) { this.centre.x += targets.x(i); this.centre.z += targets.z(i); count++; }
    if (count) this.centre.divideScalar(count); else this.centre.copy(this.origin).add(new THREE.Vector3(0, 0, -10));
    this.skyAt(0);
    this.meteors = STAR_TIMING.launch.map(birth => ({ target: -1, birth, impact: birth + .42, aimed: false, launched: false, hit: false,
      from: new THREE.Vector3(), to: new THREE.Vector3(), angleDeg: 0 }));
    this.last = { clock: 0, assetsReady: this.ready, loadError: this.error, phase: "charge", impacts: 0, kills: 0,
      soundEvents: [], meteors: [], sky: { centre: this.sky.toArray(), widthM: 22, heightM: 14, opacity: 0,
        turnDegS: 1.5, screen: [], widthFraction: 0, inside: false }, secondaryMax: .9, hdrLayers: ["diamond"], live: 0, cameraPunch: this.punch.report };
    this.punch.startShot(this.sky); this.host.anticipate(0); this.sound("gather", this.hand); this.draw(); return this.last;
  }
  private sound(event: StarSound, at: THREE.Vector3, pitch = .96 + hash(this.last!.soundEvents.length) * .08): void {
    this.last!.soundEvents.push({ event, t: this.t, pitch }); this.host.sound(event, at, pitch);
  }
  private node(index: number, t: number, out: THREE.Vector3): THREE.Vector3 {
    this.skyAt(t); const uv = nodes.nodes[index]!.uv;
    return out.copy(this.sky).addScaledVector(this.skyRight, (uv[0]! - .5) * this.skyW).addScaledVector(this.skyUp, (.5 - uv[1]!) * this.skyW / 1.5);
  }
  private launch(m: Meteor, index: number): void {
    this.node(index, m.birth, m.from); const f = this.host.targets;
    // Reserve one living target per shot. Prefer the approved diagonal and the final dense/elite group.
    let best = Infinity, chosen = -1; const cam = this.host.camera;
    this.projected.copy(m.from).project(cam); const fx = this.projected.x * cam.aspect, fy = this.projected.y;
    for (let i = 0; i < f.size; i++) {
      if (!f.alive(i) || this.meteors.some(o => o !== m && o.target === i)) continue;
      this.point.set(f.x(i), f.midY(i), f.z(i)).project(cam);
      if (index !== 6 && (Math.abs(this.point.x) > .85 || this.point.y < -.8 || this.point.y > .6)) continue;
      // Screen-space diagonal: down and to the right of the node, angle from vertical.
      const dx = this.point.x * cam.aspect - fx, dz = fy - this.point.y;
      const angle = Math.atan2(dx, dz) * 180 / Math.PI;
      let density = 0; if (index === 6) for (let j = 0; j < f.size; j++) if (f.alive(j) && Math.hypot(f.x(j)-f.x(i), f.z(j)-f.z(i)) < 5) density++;
      const valid = angle >= 30 && angle <= 50 && dz > 0;
      // 454w: the 7th (climax) meteor lands on a beast near the middle of the beast field (world space), >= 8 m ahead of the hero.
      const ahead = Math.hypot(f.x(i) - this.origin.x, f.z(i) - this.origin.z);
      const score = index === 6 ? (ahead < 8 ? 10000 : 0) + Math.hypot(f.x(i) - this.centre.x, f.z(i) - this.centre.z) * 10 - density * 2
        : (valid ? 0 : 10000) + Math.abs(angle-40);
      if (score < best) { best = score; chosen = i; }
    }
    m.target = chosen;
    if (chosen >= 0) this.host.bind(chosen, .66);
    if (chosen >= 0) m.to.set(f.x(chosen), f.midY(chosen), f.z(chosen)); else m.to.copy(this.centre).setY(.8);
    this.projected.copy(m.from).project(cam); this.point.copy(m.to).project(cam);
    m.angleDeg = Math.atan2((this.point.x-this.projected.x)*cam.aspect,this.projected.y-this.point.y)*180/Math.PI;
    m.aimed = true;
  }
  update(dt: number): void {
    if (!this.active || !Number.isFinite(dt) || dt < 0) return;
    this.t = Math.min(8.4, this.t + dt); this.punch.update(this.t); const r = this.last!, f = this.host.targets;
    if (this.t < 1.1) this.host.anticipate(this.t / 1.1);
    if (!this.released && this.t >= 1.1 - 1e-8) { this.released = true; this.host.hand(this.hand); this.host.release(this.hand, 4.72); this.sound("release", this.hand); }
    if (!this.drawn && this.t >= 1.2 - 1e-8) { this.drawn = true; this.sound("draw", this.sky); }
    while (this.nodeDone < 7 && this.t >= 1.3 + this.nodeDone * .16 - 1e-8) {
      this.node(this.nodeDone, this.t, this.at); this.sound("node", this.at, .94 + this.nodeDone * .16 / 6); this.nodeDone++;
    }
    for (let i = 0; i < 7; i++) {
      const m = this.meteors[i]!;
      if (!m.aimed && this.t >= m.birth - .2 - 1e-8) {
        // Choose prey before the visible 200 ms warning; the source remains the node at the scheduled launch.
        this.launch(m, i);
      }
      if (!m.launched && this.t >= m.birth - 1e-8) { m.launched = true; this.sound("launch", m.from); }
      if (!m.hit && this.t >= m.impact - 1e-8) {
        m.hit = true; r.impacts++; if (m.target >= 0 && f.alive(m.target)) {
          const dx = m.to.x-m.from.x, dz = m.to.z-m.from.z, len = Math.hypot(dx,dz)||1;
          if (this.host.blow(m.target, dx/len, dz/len, i === 6 ? .7 : .18, "secondary")) r.kills++;
        }
        if (i === 6) {
          this.host.strike(m.to, "primary"); this.sound("climax", m.to);
        } else this.sound("hit", m.to);
      }
    }
    if (!this.tailed && this.t >= 6.3 - 1e-8) { this.tailed = true; this.sound("tail", this.centre); }
    r.clock = this.t; r.assetsReady = this.ready; r.loadError = this.error;
    r.phase = this.t < 1.1 ? "charge" : this.t < 2.6 ? "release" : this.t < 5.82 ? "travel / impact" : this.t < 6.3 ? "climax" : "aftermath";
    this.draw(); if (this.t >= 8.4) { this.t = -1; this.group.visible = false; this.punch.clear(); }
  }
  /** 454w measurement only: parts skipped by put(), so a capture can diff a layer out. */
  readonly hidden = new Set<string>();
  redraw(): void { this.draw(); }
  private put(part: Part, i: number, at: THREE.Vector3, size: number, opacity: number, age = 0, life = 0, turn = 0, variant = 0): void {
    if (this.hidden.has(part)) return;
    const pool = this.pools.get(part)!, meta = pool.meta;
    const frame = life > 0 ? age / life * (meta.frames - 1) : (age * meta.fps) % meta.frames;
    pool.put(i, at, size, opacity, frame, variant, part === "crack" ? undefined : this.host.camera, turn);
  }
  private draw(): void {
    for (const p of this.pools.values()) p.clear(); if (!this.ready || !this.last) return;
    const t = this.t, camera = this.host.camera, f = this.host.targets, r = this.last;
    camera.updateMatrixWorld(true);
    this.host.hand(this.hand);
    this.skyAt(t); const S = this.scale;
    const skyFade = STAR_FRAME.opacity * smooth(1.2, 2.4, t) * (1-smooth(6.3,7.3,t)); r.sky.opacity = skyFade;
    const skyTurn=THREE.MathUtils.degToRad(STAR_TIMING.skyTurnDegS)*Math.max(0,t-1.2);
    // 454v: the constellation draws itself (flipbook 1.2-2.4 s, cell = 1.08x the still), then the still holds.
    const drawAge=t-1.2, held=smooth(2.3,2.5,t);
    if(drawAge>=0 && t<2.5) this.put("drawn",0,this.sky,this.skyW*1.08,STAR_FRAME.opacity*(1-held),drawAge,1.2,skyTurn);
    this.put("constellation",0,this.sky,this.skyW,skyFade*held,0,0,skyTurn);
    if (t <= 1.2) this.put("charge",0,this.hand,1.4*S,smooth(0,.1,t)*(1-smooth(1.05,1.2,t)),t,1.2);
    if (t >= 1.1 && t < 1.4) this.put("release",0,this.hand,1.2*S,1-smooth(1.25,1.4,t),t-1.1,.3);
    for(let i=0;i<7;i++) {
      const age=t-(1.3+i*.16); this.node(i,t,this.at);
      if(age>=0 && age<.5) this.put("nodes",i,this.at,this.skyW*.09,1-smooth(.28,.5,age),age,.5,0,i%8);
      const m=this.meteors[i]!;
      if(m.target>=0 && t>=m.impact-.2 && t<m.impact-.025) {
        this.at.set(m.to.x,m.to.y+1.2,m.to.z); this.put("nodes",7+i,this.at,.9*S,.65,t-(m.impact-.2),.2,0,(i+3)%8);
      }
      if(m.launched && t>=m.birth && t<m.impact) {
        const age=t-m.birth, u=THREE.MathUtils.clamp(age/.42,0,1); this.at.lerpVectors(m.from,m.to,u);
        this.dir.subVectors(m.to,m.from).normalize(); this.right.setFromMatrixColumn(camera.matrixWorld,0); this.up.setFromMatrixColumn(camera.matrixWorld,1);
        const turn=Math.atan2(this.dir.dot(this.up),this.dir.dot(this.right));
        // Entire 3:2 trail remains intact, with the painted right-hand head anchored behind the meteor.
        const size=(i===6?10:7)*S*1.7*(.65+.35*u), opacity=.85*smooth(0,.08,age)*(1-smooth(.38,.42,age));
        this.point.copy(this.at).addScaledVector(this.right,-Math.cos(turn)*size*.425 + Math.sin(turn)*size*.0085)
          .addScaledVector(this.up,-Math.sin(turn)*size*.425 - Math.cos(turn)*size*.0085);
        this.put("trail",i,this.point,size,opacity,0,0,turn);
        this.put("head",i,this.at,(i===6?2.6:1.6)*S*1.7*(.9+.1*u),.9,0,0,turn);
      }
      const hitAge=t-m.impact;
      if(m.hit && hitAge>=0 && hitAge<1.5) {
        if(i<6 && hitAge<.65) this.put("impact",i,m.to,1.8*S*1.4,1-smooth(.3,.65,hitAge),hitAge,.65);
        this.at.set(m.to.x,.04,m.to.z); this.put("crack",i,this.at,(i===6?3:1.4)*S,.6*(1-smooth(.25,1.5,hitAge)),0,0,i*.47);
      }
    }
    const finale=this.meteors[6]!, a=t-5.82;
    if(a>=0 && a<.75) {
      // 454w: diamond bloom flipbook over 0.75 s, scaled 1.3x after measuring (visible peak ~19-20 % of frame width).
      const frameW=2*camera.position.distanceTo(finale.to)*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*camera.aspect;
      this.put("diamond",0,finale.to,frameW*.18/.78*1.3,1-smooth(.62,.75,a),a,.75);
      if(a>.06) this.put("burst",0,finale.to,5*S*1.5,.65*(1-smooth(.22,.48,a)),a-.06,.42);
    }
    // Small, phase-staggered authored sparkle cards avoid a third bright layer over a main shape.
    for(let i=0;i<20;i++) {
      if(t<1.15) {
        const u=(t*.9+hash(i))%1, angle=hash(i+20)*Math.PI*2, radius=(1-u)*2.2;
        this.at.copy(this.hand).add(new THREE.Vector3(Math.cos(angle)*radius,Math.sin(angle)*radius,(hash(i+40)-.5)*radius));
        this.put("sparkle",i,this.at,.16,.45*Math.sin(u*Math.PI)*(1-smooth(1,1.15,t)),t+hash(i));
      } else if(t>=6.3) {
        const u=t-6.3, angle=hash(i)*Math.PI*2, radius=2+hash(i+30)*5;
        this.at.set(finale.to.x+Math.cos(angle)*radius,Math.max(.15,2.4+hash(i+60)*2-u*1.3),finale.to.z+Math.sin(angle)*radius);
        const alpha=.45*smooth(6.3,6.45,t)*(1-smooth(7.4,8.4,t));
        this.put(i%2?"sparkle":"twinkle",i,this.at,(i%2?.24:.4)*S,alpha,u+hash(i),0,i*.3,i%2?0:i%8);
      }
    }
    if(t>=6.3 && t<7.8) for(let i=0;i<f.size;i++) if(f.alive(i)) {
      this.at.set(f.x(i),f.midY(i),f.z(i));
      this.put("affliction",i,this.at,1.1*S,.45*smooth(6.3,6.45,t)*(1-smooth(7.4,7.8,t)),t-6.3);
    }
    r.meteors=this.meteors.map(m=>({target:m.target,birth:m.birth,impact:m.impact,from:m.from.toArray(),to:m.to.toArray(),angleDeg:m.angleDeg}));
    r.live=0; for(const p of this.pools.values()) r.live+=p.meshes.filter(m=>m.visible).length;
    r.sky.screen=[];
    r.sky.widthM=this.skyW; r.sky.centre=this.sky.toArray();
    for(const x of [-.5,.5]) for(const z of [-.5,.5]) {
      this.projected.copy(this.sky).addScaledVector(this.skyRight,x*this.skyW).addScaledVector(this.skyUp,z*this.skyW/1.5).project(camera);
      r.sky.screen.push([(this.projected.x+1)/2,(1-this.projected.y)/2]);
    }
    const xs=r.sky.screen.map(p=>p[0]!); r.sky.widthFraction=Math.max(...xs)-Math.min(...xs);
    r.sky.inside=r.sky.screen.every(p=>p[0]!>=0&&p[0]!<=1&&p[1]!>=0&&p[1]!<=1);
  }
  clear(): void { this.t=-1; this.group.visible=false; this.released=false;this.drawn=false;this.tailed=false;this.nodeDone=0; for(const p of this.pools.values())p.clear();this.punch.clear(); }
  dispose(): void {this.clear();for(const p of this.pools.values())p.dispose();for(const t of this.textures)t.dispose();this.punch.dispose();this.group.removeFromParent();}
}
