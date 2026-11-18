/** Tickets 412/415/415b: reference-411 hands, independent of the unchanged 403 combat families. */
import * as THREE from "three";
import standard from "./anim-r3-seals.json";
import type { Rig } from "./anim/rig";
import { segmentDistance } from "./anim-r3-geometry";
import { FINGERS } from "./anim-r2-poses";
import { R3FingerControls, type FingerSetting } from "./anim-r3-fingers";
export type { FingerSetting } from "./anim-r3-fingers";

type V3 = readonly [number, number, number];
export const R3_STANDARD = standard;
export const R3_SECONDS = standard.limits.transitionS;
export const R3_NAMES = standard.seals.map(s => s.name);
// Index/middle/ring/pinky, then the thumb: calibrated abduction degrees, S0–S9.
const ABDUCTION: readonly (readonly number[])[] = [
  [0,0,0,0,-12], [0,0,1,2,-26], [-3,2,1,2,-22], [0,0,0,0,-32], [0,0,1,2,-34],
  [0,0,0,0,-38], [0,0,1,2,-26], [0,0,0,0,-16], [0,0,1,2,-30], [0,0,1,2,-26],
];
interface HandPlan { wrist: V3; fingers: V3; palm: V3; pole?: V3 }
const hand = (wrist: V3, fingers: V3, palm: V3, pole?: V3): HandPlan => ({ wrist, fingers, palm, pole });
// Pole is a point in rig metres (right, height, forward), independent of the palm.
export const R3_DEFAULT_POLE = { r: [.12,.85,.06], l: [-.12,.85,.06] } as const;
// Anatomical right is +x, forward is -z. Values are metres on the real 1.65 m human.
export const R3_PLANS: readonly { r: HandPlan; l: HandPlan }[] = [
  { r: hand([.11,.94,.16],[-1,.05,0],[0,1,0]), l: hand([-.11,.90,.16],[1,.05,0],[0,1,0]) },
  { r: hand([.15,1.17,.22],[-.42,.907,0],[0,0,1]), l: hand([-.16,1.02,.18],[.4,.916,0],[1,0,.35]) },
  { r: hand([.12,1.10,.22],[-.18,.984,0],[-.6,0,.8]), l: hand([-.12,1.10,.22],[.18,.984,0],[.6,0,.8]) },
  { r: hand([.13,1.08,.23],[-1,.08,0],[0,1,0]), l: hand([-.12,.90,.24],[1,-.08,0],[0,-1,0]) },
  { r: hand([.13,1.12,.21],[-.12,.99,0],[0,0,1]), l: hand([-.10,.92,.23],[.92,.38,0],[0,1,0]) },
  { r: hand([.18,1.18,.20],[0,1,0],[0,0,1]), l: hand([-.06,.94,.23],[0,.12,.99],[0,1,0]) },
  { r: hand([.14,1.34,.21],[0,1,0],[-.7,0,.7]), l: hand([.035,1.17,.23],[.5,.866,0],[0,0,-1]) },
  { r: hand([.05,1.12,.22],[0,1,0],[-1,0,.12]), l: hand([-.05,1.12,.22],[0,1,0],[1,0,.12]) },
  { r: hand([.16,1.17,.24],[-1,-.04,0],[0,-1,0]), l: hand([-.12,.91,.23],[1,.06,0],[0,1,0]) },
  { r: hand([.12,1.335,.21],[-.3,.954,0],[0,0,1]), l: hand([-.04,1.195,.22],[.80,.60,0],[0,1,0]) },
];
const smooth = (v: number): number => { const t = THREE.MathUtils.clamp(v, 0, 1); return t*t*t*(t*(t*6-15)+10); };
const frame = (v: V3): THREE.Vector3 => new THREE.Vector3(v[0],v[1],-v[2]).normalize();
const specState = (id: number,side: "r"|"l"): string => standard.seals[id]![side].fingers.thumb;
const tipName = (finger: string, j: number, side: string): string => j===4 ? `${finger}_04_leaf_${side}` : `${finger}_0${j}_${side}`;
export function r3Finger(id: number, side: "r" | "l", finger: string): FingerSetting {
  const spec = standard.seals[id]![side].fingers;
  const state = spec[finger as keyof typeof spec];
  const curl = standard.seals[id]![side].curl[finger as keyof typeof spec];
  // Zero now means a parallel hand, after cancelling each finger's measured rest fan.
  const abduction = ABDUCTION[id]![FINGERS.indexOf(finger as typeof FINGERS[number])]!;
  const twist = finger === "thumb" && (id===2 || id===7) ? (id===7?30:20)
    : finger === "thumb" && state === "chạm ngón khác" && id!==0 ? 22 : 0;
  return { curl, abduction, twist };
}
interface BoneRest { q: THREE.Quaternion; world: THREE.Quaternion; parent: THREE.Quaternion; pos: THREE.Vector3 }
interface ArmCache {
  side: "r" | "l"; upper: THREE.Bone; fore: THREE.Bone; wrist: THREE.Bone;
  a: number; b: number; fromW: THREE.Vector3; toW: THREE.Vector3; fromQ: THREE.Quaternion; toQ: THREE.Quaternion;
  fromArmQ: THREE.Quaternion; toArmQ: THREE.Quaternion; lastPole: THREE.Vector3; f0: THREE.Vector3; n0: THREE.Vector3; startFinger: THREE.Quaternion[]; targetFinger: THREE.Quaternion[];
  bones: THREE.Bone[];
}

/** Analytic arm IK keeps wrists on the authored near-body path instead of a wide FK arc. */
export class R3Hands {
  private readonly rest = new Map<string,BoneRest>();
  private readonly arms: ArmCache[] = [];
  private readonly profiles = new Map<string,THREE.Quaternion[]>();
  private readonly fingerOverrides = new Map<string,Partial<FingerSetting>>();
  private readonly poleOverrides = new Map<string,V3>();
  private readonly inv = new THREE.Matrix4();
  private readonly rootQ = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly planeP = new THREE.Vector3();
  private readonly planeN = new THREE.Vector3();
  private readonly elbow = new THREE.Vector3();
  private readonly shoulder = new THREE.Vector3();
  private readonly handQ = new THREE.Quaternion();
  private readonly worldQ = new THREE.Quaternion();
  private readonly q = new THREE.Quaternion();
  private readonly t = new THREE.Quaternion();
  readonly fingers: R3FingerControls;
  age = 1;
  id = -1;
  constructor(readonly rig: Rig, readonly root: THREE.Object3D) {
    this.fingers = new R3FingerControls(rig, root);
    const q = new Float32Array(rig.count*4), p = new Float32Array(rig.count*3);
    rig.readPose(q,p); rig.writePose(rig.restQ,rig.restP); root.updateMatrixWorld(true);
    this.inv.copy(root.matrixWorld).invert();
    const rq = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    rig.bones.forEach(b=>this.rest.set(b.name,{q:b.quaternion.clone(),world:b.getWorldQuaternion(new THREE.Quaternion()).premultiply(rq),
      parent:b.parent!.getWorldQuaternion(new THREE.Quaternion()).premultiply(rq),pos:b.getWorldPosition(new THREE.Vector3()).applyMatrix4(this.inv)}));
    for(const side of ["r","l"] as const){
      const h=this.rest.get(`hand_${side}`)!, mid=this.rest.get(`middle_01_${side}`)!;
      const f0=mid.pos.clone().sub(h.pos).normalize();
      // Rest palms face down; choose the normal orthogonal to the actual finger axis.
      const n0=new THREE.Vector3(0,-1,0).addScaledVector(f0,f0.y).normalize();
      const bones=FINGERS.flatMap(f=>[1,2,3].map(j=>rig.bone(tipName(f,j,side))!));
      this.arms.push({side,upper:rig.bone(`upperarm_${side}`)!,fore:rig.bone(`lowerarm_${side}`)!,wrist:rig.bone(`hand_${side}`)!,
        a:this.rest.get(`upperarm_${side}`)!.pos.distanceTo(this.rest.get(`lowerarm_${side}`)!.pos),
        b:this.rest.get(`lowerarm_${side}`)!.pos.distanceTo(h.pos),fromW:new THREE.Vector3(),toW:new THREE.Vector3(),fromQ:new THREE.Quaternion(),toQ:new THREE.Quaternion(),
        fromArmQ:new THREE.Quaternion(),toArmQ:new THREE.Quaternion(),lastPole:new THREE.Vector3(),f0,n0,bones,startFinger:bones.map(()=>new THREE.Quaternion()),targetFinger:bones.map(()=>new THREE.Quaternion())});
    }
    rig.writePose(q,p); root.updateMatrixWorld(true);
  }
  private setting(id:number,side:'r'|'l',finger:string):FingerSetting {
    return {...r3Finger(id,side,finger),...this.fingerOverrides.get(`${id}_${side}_${finger}`)};
  }
  setFinger(side:'r'|'l',finger:typeof FINGERS[number],angles:Partial<FingerSetting>):void {
    if(this.id<0)throw new Error('Select a seal before adjusting a finger');
    if(!FINGERS.includes(finger)||!['r','l'].includes(side)||Object.values(angles).some(v=>!Number.isFinite(v)))throw new Error('Invalid finger controls');
    if(angles.curl!==undefined&&(angles.curl<0||angles.curl>1))throw new Error('Curl must be between 0 and 1');
    const key=`${this.id}_${side}_${finger}`;
    this.fingerOverrides.set(key,{...this.fingerOverrides.get(key),...angles});
    this.profiles.delete(`${this.id}_${side}`);this.select(this.id);
  }
  setPole(side:'r'|'l',point:V3):void {
    if(this.id<0)throw new Error('Select a seal before adjusting an elbow pole');
    if(!['r','l'].includes(side)||point.some(v=>!Number.isFinite(v)))throw new Error('Invalid elbow pole');
    this.poleOverrides.set(`${this.id}_${side}`,[...point]);this.select(this.id);
  }
  private orientation(a: ArmCache, plan: HandPlan): THREE.Quaternion {
    const f=frame(plan.fingers),n=frame(plan.palm); n.addScaledVector(f,-n.dot(f)).normalize();
    const old=new THREE.Matrix4().makeBasis(a.f0,a.n0,new THREE.Vector3().crossVectors(a.f0,a.n0));
    const next=new THREE.Matrix4().makeBasis(f,n,new THREE.Vector3().crossVectors(f,n));
    return new THREE.Quaternion().setFromRotationMatrix(next.multiply(old.transpose())).multiply(this.rest.get(a.wrist.name)!.world);
  }
  select(id: number): void {
    this.id=id; this.age=0; this.root.updateMatrixWorld(true);
    this.inv.copy(this.root.matrixWorld).invert(); const invQ=this.root.getWorldQuaternion(this.q).invert();
    for(const a of this.arms){
      a.wrist.getWorldPosition(a.fromW).applyMatrix4(this.inv);
      const plan=R3_PLANS[id]![a.side];a.toW.set(plan.wrist[0],plan.wrist[1],-plan.wrist[2]);
      a.wrist.getWorldQuaternion(a.fromQ).premultiply(invQ);a.toQ.copy(this.orientation(a,plan));
      a.upper.getWorldPosition(this.shoulder).applyMatrix4(this.inv);
      a.fore.getWorldPosition(this.elbow).applyMatrix4(this.inv);
      const basis=(aim:THREE.Vector3,pole:THREE.Vector3)=>{
        aim.normalize();pole.addScaledVector(aim,-pole.dot(aim));
        if(pole.lengthSq()<1e-8){pole.set(0,-1,0);pole.addScaledVector(aim,-pole.dot(aim));}
        if(pole.lengthSq()<1e-8){pole.set(0,0,1);pole.addScaledVector(aim,-pole.dot(aim));}
        pole.normalize();
        return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(aim,pole,new THREE.Vector3().crossVectors(aim,pole)));
      };
      a.fromArmQ.copy(basis(a.fromW.clone().sub(this.shoulder),this.elbow.clone().sub(this.shoulder)));
      const pole=this.poleOverrides.get(`${id}_${a.side}`) ?? plan.pole ?? R3_DEFAULT_POLE[a.side];
      const towardPole=new THREE.Vector3(pole[0],pole[1],-pole[2]).sub(this.shoulder);
      a.toArmQ.copy(basis(a.toW.clone().sub(this.shoulder),towardPole));
      a.lastPole.copy(this.elbow).sub(this.shoulder).normalize();
      const key=`${id}_${a.side}`;
      if(!this.profiles.has(key))this.profiles.set(key,this.profile(a,id));
      a.bones.forEach((b,i)=>{a.startFinger[i]!.copy(b.quaternion);a.targetFinger[i]!.copy(this.profiles.get(key)![i]!);});
    }
  }
  private profile(a: ArmCache,id: number): THREE.Quaternion[] {
    const result=a.bones.map((_,i)=>this.fingers.quaternion(a.side,FINGERS[Math.floor(i/3)]!,i%3,this.setting(id,a.side,FINGERS[Math.floor(i/3)]!)));
    if(specState(id,a.side)!=='chạm ngón khác'||this.fingerOverrides.has(`${id}_${a.side}_thumb`))return result;
    // Fit only the thumb to the already-authored folded fingertips, in a scratch hand hierarchy.
    // This is load/select-time data fitting; it never edits the rig, mesh, or any combat shape.
    const clone=a.wrist.clone(true);clone.position.set(0,0,0);clone.quaternion.identity();clone.scale.copy(a.wrist.getWorldScale(new THREE.Vector3()));
    const cb=a.bones.map(b=>clone.getObjectByName(b.name)!);
    cb.forEach((b,i)=>b.quaternion.copy(result[i]!));clone.updateMatrixWorld(true);
    const contacts=id===0?[]:(id===6 || (id===5&&a.side==='l'))?['index','middle']:['ring','pinky'];
    const target=new THREE.Vector3();contacts.forEach(f=>target.add(clone.getObjectByName(`${f}_04_leaf_${a.side}`)!.getWorldPosition(new THREE.Vector3())));target.multiplyScalar(.5);
    if(id===0)target.set(0,.99,-.22).sub(new THREE.Vector3(R3_PLANS[0]![a.side].wrist[0],R3_PLANS[0]![a.side].wrist[1],-R3_PLANS[0]![a.side].wrist[2])).applyQuaternion(this.orientation(a,R3_PLANS[0]![a.side]).invert());
    const thumb=clone.getObjectByName(`thumb_04_leaf_${a.side}`)!;
    const setting=this.setting(id,a.side,'thumb');
    const vars=[setting.twist,setting.abduction];
    const assign=()=>{
      for(let j=0;j<3;j++){
        cb[12+j]!.quaternion.copy(this.fingers.quaternion(a.side,'thumb',j,
          { twist:vars[0]!,abduction:vars[1]!,curl:setting.curl }));
      }
      clone.updateMatrixWorld(true);
    };
    const objective=()=>{
      assign();let loss=thumb.getWorldPosition(new THREE.Vector3()).distanceToSquared(target);
      const seg=(f:string,j:number)=>clone.getObjectByName(tipName(f,j,a.side))!.getWorldPosition(new THREE.Vector3());
      for(const f of FINGERS)if(f!=='thumb'&&!contacts.includes(f))for(let j=1;j<=3;j++)for(let k=1;k<=3;k++){
        const gap=segmentDistance(seg('thumb',j),seg('thumb',j+1),seg(f,k),seg(f,k+1));loss+=100*Math.max(0,.005-gap)**2;
      }
      return loss+vars.reduce((v,x)=>v+x*x,0)*1e-10;
    };
    let best=objective();
    for(const step of [30,15,7,3,1,.3])for(let pass=0;pass<12;pass++){
      let moved=false;
      for(let i=0;i<vars.length;i++){
        const old=vars[i]!;let chosen=old;
        for(const dir of [-1,1]){
          vars[i]=THREE.MathUtils.clamp(old+dir*step,-85,85);const value=objective();
          if(value<best){best=value;chosen=vars[i]!;moved=true;}
        }
        vars[i]=chosen;
      }
      if(!moved)break;
    }
    assign();for(let j=0;j<3;j++)result[12+j]!.copy(cb[12+j]!.quaternion);
    return result;
  }
  private setWorld(bone: THREE.Bone, orientation: THREE.Quaternion): void {
    bone.parent!.getWorldQuaternion(this.q).invert();bone.quaternion.copy(this.q).multiply(orientation);
    bone.updateWorldMatrix(false,false);
  }
  apply(dt: number): void {
    if(this.id<0)return;this.age+=Math.max(0,dt);
    this.inv.copy(this.root.matrixWorld).invert();this.root.getWorldQuaternion(this.rootQ);
    const chest=this.rig.bone('spine_03')!;
    chest.getWorldPosition(this.planeP).applyMatrix4(this.inv);
    chest.getWorldQuaternion(this.worldQ).premultiply(this.q.copy(this.rootQ).invert()).multiply(this.t.copy(this.rest.get(chest.name)!.world).invert());
    this.planeN.set(0,0,-1).applyQuaternion(this.worldQ).normalize();
    const u=smooth((this.age-.04)/.20);
    const lateral=.08*smooth((this.age-.04)/.04)*(1-smooth((this.age-.20)/.04));
    const depth=.04*smooth(this.age/.04)*(1-smooth((this.age-.24)/.04));
    for(const a of this.arms){
      // Separate depth, separate wrists, change height/shape, close wrists, then restore depth (280 ms).
      this.p.copy(a.fromW).lerp(a.toW,u);
      this.p.x=THREE.MathUtils.clamp(this.p.x+(a.side==='r'?1:-1)*lateral,-.35,.35);
      this.p.z+=(a.side==='r'?1:-1)*depth;
      const planeDepth=this.v.copy(this.p).sub(this.planeP).dot(this.planeN);
      this.p.addScaledVector(this.planeN,THREE.MathUtils.clamp(planeDepth,.055,.295)-planeDepth);
      this.handQ.copy(a.fromQ).slerp(a.toQ,u);
      this.v.copy(a.f0).applyQuaternion(this.t.copy(this.rest.get(a.wrist.name)!.world).invert()).applyQuaternion(this.handQ).normalize();
      a.upper.getWorldPosition(this.shoulder).applyMatrix4(this.inv);
      this.dir.copy(this.p).sub(this.shoulder);const d=this.dir.length();this.dir.normalize();
      const reach=THREE.MathUtils.clamp(d,Math.abs(a.a-a.b)+.001,a.a+a.b-.001);
      const along=(a.a*a.a-a.b*a.b+reach*reach)/(2*reach),height=Math.sqrt(Math.max(0,a.a*a.a-along*along));
      // Interpolate the elbow frame captured at selection; recomputing the shortest pole can flip at singularities.
      this.t.copy(a.fromArmQ).slerp(a.toArmQ,u);this.pole.set(0,1,0).applyQuaternion(this.t);
      this.pole.addScaledVector(this.dir,-this.pole.dot(this.dir));
      if(this.pole.lengthSq()<1e-6)this.pole.copy(a.lastPole).addScaledVector(this.dir,-a.lastPole.dot(this.dir));
      a.lastPole.copy(this.pole).normalize();
      this.pole.normalize();this.elbow.copy(this.shoulder).addScaledVector(this.dir,along).addScaledVector(this.pole,height);
      this.axis.copy(this.rest.get(a.fore.name)!.pos).sub(this.rest.get(a.upper.name)!.pos).normalize();
      this.dir.copy(this.elbow).sub(this.shoulder).normalize();
      this.worldQ.setFromUnitVectors(this.axis,this.dir).multiply(this.rest.get(a.upper.name)!.world).premultiply(this.rootQ);
      this.setWorld(a.upper,this.worldQ);
      this.dir.copy(this.p).sub(this.elbow).normalize();
      const flex=this.v.angleTo(this.dir),limit=68*Math.PI/180;
      if(flex>limit){
        this.t.setFromUnitVectors(this.v,this.dir);this.q.identity().slerp(this.t,(flex-limit)/flex);
        this.handQ.premultiply(this.q);this.v.applyQuaternion(this.q);
      }
      this.t.copy(this.handQ).multiply(this.q.copy(this.rest.get(a.wrist.name)!.world).invert());
      this.axis.copy(this.rest.get(a.wrist.name)!.pos).sub(this.rest.get(a.fore.name)!.pos).normalize().applyQuaternion(this.t);
      this.worldQ.setFromUnitVectors(this.axis,this.dir).multiply(this.t).multiply(this.rest.get(a.fore.name)!.world).premultiply(this.rootQ);
      this.setWorld(a.fore,this.worldQ);
      this.worldQ.copy(this.handQ).premultiply(this.rootQ);this.setWorld(a.wrist,this.worldQ);
      a.bones.forEach((b,i)=>b.quaternion.copy(a.startFinger[i]!).slerp(a.targetFinger[i]!,u));
    }
    this.root.updateMatrixWorld(true);
  }
  exit(): void { this.id=-1; }
  get settled(): boolean { return this.id>=0 && this.age>=R3_SECONDS; }
}
