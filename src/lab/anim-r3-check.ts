/** Tickets 412/415/415b: isolated real-rig check; no game build/suite, browser or output media. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Animator } from "./anim/animator";
import { resampleClip } from "./anim/resample";
import { AnimR1 } from "./anim-r1-controller";
import { FAMILIES, FAMILY_WORD, FINGERS } from "./anim-r2-poses";
import { FrontHandsView } from "./anim-r2-camera";
import { FingerProbe, segmentDistance } from "./anim-r2-hands";
import { R3_STANDARD as spec, R3_SECONDS } from "./anim-r3-poses";
import { r3CurlAngles } from "./anim-r3-fingers";

const files=["anim-r1-lab.ts","anim-r2-check.ts","anim-r3-fingers.ts","anim-r3-poses.ts","anim-r3-check.ts","anim-r3-review.ts"]
  .map(f=>fileURLToPath(new URL(f,import.meta.url)));
const options: ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,
  strict:true,noUncheckedIndexedAccess:true,resolveJsonModule:true,skipLibCheck:true,noEmit:true,types:["vite/client","node"]};
const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram(files,options));
assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>process.cwd(),getNewLine:()=>"\n"}));

async function setup(hz:number){
  const data=readFileSync(new URL("../../art-src/lab/anim/human-base-animations.glb",import.meta.url));
  const g=await new GLTFLoader().register(()=>({name:"R3_CPU_PLAIN",loadMaterial:async()=>new THREE.MeshStandardMaterial()}))
    .parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),"");
  const root=new THREE.Group(),model=new THREE.Group();root.add(model);model.add(g.scene);g.scene.rotation.y=Math.PI;root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model);model.scale.setScalar(1.65/(box.max.y-box.min.y));model.position.y=-box.min.y*model.scale.x;root.updateMatrixWorld(true);
  assert.ok(Math.abs(box.setFromObject(model).getSize(new THREE.Vector3()).y-1.65)<1e-6,'Real human must be 1.65 world metres');
  const clip=(name:string)=>g.animations.find(c=>c.name===name)!;
  const anim=new Animator(model,root,[{key:"idle",clip:resampleClip(clip("Idle_A"),true),loop:true},
    {key:"attack",clip:resampleClip(clip("Sword_Regular_A"),false),loop:false,release:.3},{key:"hit",clip:resampleClip(clip("Hit_Chest"),false),loop:false}]);
  anim.place(0,3,0,-1);let now=0,releases=0;
  const r1=new AnimR1(anim,{now:()=>now,available:()=>true,cutStop:()=>{},release:()=>{releases++;},charge:()=>{},prop:()=>{},note:()=>{}});
  const step=(dt=1/hz)=>{now+=dt*1000;anim.update(dt);r1.afterBody(dt>0);root.updateMatrixWorld(true);r1.afterDraw();};
  const advance=(seconds:number)=>{for(let i=0;i<Math.ceil(seconds*hz);i++)step();};
  advance(1);return{root,anim,r1,step,advance,now:()=>now,releases:()=>releases};
}
type Setup=Awaited<ReturnType<typeof setup>>;
const errors:string[]=[];
function check(ok:boolean,message:string){if(!ok&&errors.length<80)errors.push(message);}
const round=(v:number)=>Math.round(v*10000)/10000;
class Probe{
  private readonly curlFrames=new Map<string,THREE.Quaternion>();
  private readonly restFan=new Map<string,THREE.Quaternion>();
  readonly curlRows:object[]=[];
  private readonly rest=new Map<string,{q:THREE.Quaternion;parent:THREE.Quaternion;f:THREE.Vector3;n:THREE.Vector3;front:THREE.Vector3;right:THREE.Vector3}>();
  readonly segments:{a:THREE.Bone;b:THREE.Bone;finger:string;name:string}[]=[];
  maxStepDeg=0; worstStepBone=""; worstStepLabel="";
  private lastQ:THREE.Quaternion[]=[];
  resetMotion():void{this.lastQ=this.s.anim.rig.bones.map(b=>b.quaternion.clone());}
  motion(label:string):void{this.s.anim.rig.bones.forEach((b,i)=>{const prev=this.lastQ[i];if(!prev)return;const angle=THREE.MathUtils.radToDeg(prev.angleTo(b.quaternion));if(angle>this.maxStepDeg){this.maxStepDeg=angle;this.worstStepBone=b.name;this.worstStepLabel=label;}prev.copy(b.quaternion);});}
  readonly points=new Map<THREE.Bone,THREE.Vector3>();
  constructor(readonly s:Setup){
    const{anim,root}=s,rig=anim.rig,q=new Float32Array(rig.count*4),p=new Float32Array(rig.count*3);
    rig.readPose(q,p);rig.writePose(rig.restQ,rig.restP);root.updateMatrixWorld(true);
    const inv=root.getWorldQuaternion(new THREE.Quaternion()).invert();
    for(const b of rig.bones){
      const f=new THREE.Vector3(1,0,0),n=new THREE.Vector3(0,-1,0);
      if(b.name.startsWith('hand_')){f.subVectors(rig.bone(`middle_01_${b.name.at(-1)}`)!.getWorldPosition(new THREE.Vector3()),b.getWorldPosition(new THREE.Vector3())).normalize();n.addScaledVector(f,-n.dot(f)).normalize();}
      const w=b.getWorldQuaternion(new THREE.Quaternion());f.applyQuaternion(w.clone().invert());n.applyQuaternion(w.clone().invert());
      this.rest.set(b.name,{front:new THREE.Vector3(0,0,-1).applyQuaternion(w.clone().invert()),right:new THREE.Vector3(1,0,0).applyQuaternion(w.clone().invert()),q:b.quaternion.clone(),parent:b.parent!.getWorldQuaternion(new THREE.Quaternion()).premultiply(inv),f,n});
    }
    for(const side of ['r','l'])for(const f of FINGERS)for(let j=1;j<=3;j++){
      const a=rig.bone(`${f}_0${j}_${side}`)!,b=rig.bone(j===3?`${f}_04_leaf_${side}`:`${f}_0${j+1}_${side}`)!;
      this.segments.push({a,b,finger:`${f}_${side}`,name:`${f}_${j}_${side}`});this.points.set(a,new THREE.Vector3());this.points.set(b,new THREE.Vector3());
    }
    const pos=(name:string)=>rig.bone(name)!.getWorldPosition(new THREE.Vector3()).applyQuaternion(inv);
    for(const side of ['r','l']){
      const forward=pos(`middle_01_${side}`).sub(pos(`hand_${side}`)).normalize();
      const normal=new THREE.Vector3(0,-1,0).addScaledVector(forward,forward.y).normalize();
      this.curlFrames.set(side,new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(forward,normal),forward,normal)));
      for(const finger of FINGERS)this.restFan.set(`${finger}_${side}`,new THREE.Quaternion().setFromUnitVectors(pos(`${finger}_04_leaf_${side}`).sub(pos(`${finger}_01_${side}`)).normalize(),forward));
    }
    rig.writePose(q,p);root.updateMatrixWorld(true);
  }
  // Read actual local bone rotations, remove measured rest fan, then decompose Z(abduction) Y(twist) X(bend).
  bends(side:'r'|'l',finger:string):number[]{
    const basis=this.curlFrames.get(side)!;
    return [1,2,3].map(j=>{
      const b=this.s.anim.rig.bone(`${finger}_0${j}_${side}`)!,r=this.rest.get(b.name)!;
      const delta=r.parent.clone().multiply(b.quaternion.clone().multiply(r.q.clone().invert())).multiply(r.parent.clone().invert());
      if(j===1)delta.multiply(this.restFan.get(`${finger}_${side}`)!.clone().invert());
      delta.premultiply(basis.clone().invert()).multiply(basis).normalize();
      return THREE.MathUtils.radToDeg(new THREE.Euler().setFromQuaternion(delta,'ZYX').x);
    });
  }
  gap(ids:number[]){
    const exemptions=new Set(ids.flatMap(id=>spec.seals[id]!.exceptions.flatMap(e=>e.pairs)));
    this.points.forEach((p,b)=>b.getWorldPosition(p));let min=Infinity,raw=Infinity,worst='';let exempt=0;
    for(let i=0;i<this.segments.length;i++)for(let j=i+1;j<this.segments.length;j++){
      const a=this.segments[i]!,b=this.segments[j]!;if(a.finger===b.finger)continue;
      const d=segmentDistance(this.points.get(a.a)!,this.points.get(a.b)!,this.points.get(b.a)!,this.points.get(b.b)!);raw=Math.min(raw,d);
      if(exemptions.has(`${a.finger}:${b.finger}`)||exemptions.has(`${b.finger}:${a.finger}`)){if(d<.004)exempt++;continue;}
      if(d<min){min=d;worst=`${a.name}/${b.name}`;}
    }
    return{min,raw,worst,exempt};
  }
  moving(){
    const {root,anim}=this.s,inv=root.matrixWorld.clone().invert(),rq=root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const chest=anim.rig.bone('spine_03')!,spine=chest.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const normal=this.rest.get('spine_03')!.front.clone().applyQuaternion(chest.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(rq);
    return ['r','l'].map(side=>{
      const h=anim.rig.bone(`hand_${side}`)!,w=h.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv),el=anim.rig.bone(`lowerarm_${side}`)!.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      const f=this.rest.get(h.name)!.f.clone().applyQuaternion(h.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(rq);
      return {depth:w.clone().sub(spine).dot(normal),flex:THREE.MathUtils.radToDeg(f.angleTo(w.clone().sub(el))),height:w.y};
    });
  }
  pose(id:number){
    const{root,anim}=this.s,rig=anim.rig,inv=root.matrixWorld.clone().invert(),data=spec.seals[id]!;
    const chest=rig.bone('spine_03')!,spine=chest.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const normal=this.rest.get('spine_03')!.front.clone().applyQuaternion(chest.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert());
    const out:Record<string,unknown>={};
    for(const side of ['r','l'] as const){
      const hand=rig.bone(`hand_${side}`)!,w=hand.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv),el=rig.bone(`lowerarm_${side}`)!.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      const wristQ=hand.getWorldQuaternion(new THREE.Quaternion()),rq=root.getWorldQuaternion(new THREE.Quaternion()).invert();
      const f=this.rest.get(hand.name)!.f.clone().applyQuaternion(wristQ).applyQuaternion(rq).normalize();
      const n=this.rest.get(hand.name)!.n.clone().applyQuaternion(wristQ).applyQuaternion(rq).normalize();
      const fore=w.clone().sub(el).normalize(),flex=THREE.MathUtils.radToDeg(f.angleTo(fore)),zone=spec.zonesM[data[side].zone as keyof typeof spec.zonesM]!;
      const depth=w.clone().sub(spine).dot(normal);
      const shoulder=rig.bone(`upperarm_${side}`)!.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      const torsoRight=this.rest.get(chest.name)!.right.clone().applyQuaternion(chest.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(rq).normalize();
      const elbowLateral=Math.abs(el.clone().sub(spine).dot(torsoRight));
      check(el.y<shoulder.y,`S${id} ${side} elbow above shoulder ${el.y}/${shoulder.y}`);
      check(elbowLateral<=spec.limits.maxElbowLateralM,`S${id} ${side} elbow lateral ${elbowLateral}`);
      if(id===5&&side==='l'){
        const belly=spec.zonesM['bụng'];
        check(w.y>=belly[0]!-spec.limits.wristZoneToleranceM&&w.y<=belly[1]!+spec.limits.wristZoneToleranceM&&depth>=.05&&depth<=.30,`S5 left fist outside belly ${w.toArray()}`);
      }
      const label=data[side].palm;
      const alignment=label==='lên'?n.y:label==='xuống'?-n.y:label==='trước'?-n.z:Math.max(side==='r'?-n.x:n.x,n.z);
      check(w.y>=zone[0]!-spec.limits.wristZoneToleranceM&&w.y<=zone[1]!+spec.limits.wristZoneToleranceM,`S${id} ${side} zone ${w.y}`);
      check(depth>=.05&&depth<=.30,`S${id} ${side} depth ${depth}`);
      check(flex<=70.001,`S${id} ${side} wrist flex ${flex}`);
      check(alignment>.5,`S${id} ${side} palm disagrees with standard: ${label}`);
      const fingers:Record<string,unknown>={};
      for(const finger of FINGERS){
        const angles=this.bends(side,finger);
        const ratio=finger==='thumb'?[1,1.2,1.4]:[1,1.1,.8],max=finger==='thumb'?[50,60,70]:[85,100,75];
        const curl=data[side].curl[finger],measuredCurl=angles[0]!/max[0]!;
        const ratioError=curl===0?0:Math.max(...angles.map((angle,j)=>Math.abs(angle/(angles[0]!*ratio[j]!)-1)));
        check(curl>=0&&curl<=1,`S${id} ${side} ${finger} invalid curl ${curl}`);
        check(Math.abs(measuredCurl-curl)<.0001,`S${id} ${side} ${finger} curl ${measuredCurl} != JSON ${curl}`);
        check(angles.every((angle,j)=>angle>=-.001&&angle<=max[j]!+.001),`S${id} ${side} ${finger} joint limit ${angles}`);
        check(curl===0?angles.every(a=>Math.abs(a)<.001):ratioError<=.15,`S${id} ${side} ${finger} ratio ${ratioError}`);
        const sum=angles.reduce((a,b)=>a+b,0),state=data[side].fingers[finger];
        check(state==='duỗi'?sum<40:state==='gập'?sum>120:true,`S${id} ${side} ${finger} ${state} total ${sum}`);
        const statePass=state==='duỗi'?curl<=.15&&sum<40:state==='gập'?curl>=.75&&sum>120:true;
        check(statePass,`S${id} ${side} ${finger} ${state} curl ${curl}`);
        this.curlRows.push({seal:`S${id}`,side,finger,state,curl,measuredCurl:round(measuredCurl),baseDeg:round(angles[0]!),middleDeg:round(angles[1]!),tipDeg:round(angles[2]!),ratioErrorPct:round(ratioError*100),statePass,pass:statePass&&Math.abs(measuredCurl-curl)<.0001&&ratioError<=.15&&angles.every((a,j)=>a>=-.001&&a<=max[j]!+.001)});
        fingers[finger]={state,curl,measuredCurl:round(measuredCurl),ratioErrorPct:round(ratioError*100),jointsDeg:angles.map(round),sumDeg:round(sum),tipM:rig.bone(`${finger}_04_leaf_${side}`)!.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).toArray().map(round)};
      }
      const jointAngles=Object.fromEntries(['clavicle','upperarm','lowerarm','hand'].map(name=>{
        const b=rig.bone(`${name}_${side}`)!,q=b.quaternion.clone().multiply(this.rest.get(b.name)!.q.clone().invert());
        const e=new THREE.Euler().setFromQuaternion(q,'YZX');return[name,[e.x,e.y,e.z].map(x=>round(x*180/Math.PI))];
      }));
      out[side]={elbowM:el.toArray().map(round),shoulderM:shoulder.toArray().map(round),elbowLateralM:round(elbowLateral),elbowBelowShoulderM:round(shoulder.y-el.y),wristM:w.toArray().map(round),depthM:round(depth),wristFlexDeg:round(flex),palm:n.toArray().map(round),jointAngles,fingers};
    }
    const contacts:Record<string,number>={};
    const tip=(name:string)=>{const [finger,side]=name.split('_');return rig.bone(`${finger}_04_leaf_${side}`)!.getWorldPosition(new THREE.Vector3());};
    for(const exemption of data.exceptions)for(const pair of exemption.pairs){
      const [a,b]=pair.split(':');const distance=tip(a!).distanceTo(tip(b!));contacts[pair]=round(distance*1000);
      check(distance<.025,`S${id} contact ${pair} gap ${distance}`);
    }
    if(id===6||id===9){
      const wrist=rig.bone('hand_r')!.getWorldPosition(new THREE.Vector3());
      const distance=Math.min(...FINGERS.map(f=>tip(`${f}_l`).distanceTo(wrist)));contacts.supportWristMm=round(distance*1000);
      check(distance<.025,`S${id} support hand misses wrist ${distance}`);
    }
    out.contactsMm=contacts;return out;
  }
}
function curlSweep(s:Setup){
  const {rig}=s.anim,q=new Float32Array(rig.count*4),p=new Float32Array(rig.count*3),probe=new Probe(s),rows=[];
  rig.readPose(q,p);
  for(const side of ['r','l'] as const)for(const finger of FINGERS)for(const curl of [0,.15,.75,1]){
    const expected=(finger==='thumb'?[50,60,70]:[85,93.5,68]).map(a=>a*curl);
    for(let j=0;j<3;j++)rig.bone(`${finger}_0${j+1}_${side}`)!.quaternion.copy(s.r1.seals.reference.fingers.quaternion(side,finger,j,{curl,abduction:10,twist:20}));
    const actual=probe.bends(side,finger),maxError=Math.max(...actual.map((a,j)=>Math.abs(a-expected[j]!)));
    check(maxError<.001,`${side} ${finger} actual rig curl=${curl}: ${actual} != ${expected}`);
    rows.push({side,finger,curl,jointsDeg:actual.map(round),maxErrorDeg:round(maxError)});
  }
  rig.writePose(q,p);s.root.updateMatrixWorld(true);
  return rows;
}
function zeroFan(s:Setup){
  const {rig}=s.anim,q=new Float32Array(rig.count*4),p=new Float32Array(rig.count*3);
  rig.readPose(q,p);rig.writePose(rig.restQ,rig.restP);s.root.updateMatrixWorld(true);
  const meshes:THREE.SkinnedMesh[]=[];s.root.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)meshes.push(o as THREE.SkinnedMesh);});
  check(meshes.length>0,'Zero-fan skin fixture must contain the real human mesh');
  const zero={curl:0,abduction:0,twist:0};
  for(const side of ['r','l'] as const)for(const finger of FINGERS)for(let j=0;j<3;j++)
    rig.bone(`${finger}_0${j+1}_${side}`)!.quaternion.copy(s.r1.seals.reference.fingers.quaternion(side,finger,j,zero));
  s.root.updateMatrixWorld(true);meshes.forEach(m=>m.skeleton.update());
  const controls=rig.bones.map(b=>b.quaternion.clone()),rows=[];
  const pos=(name:string)=>rig.bone(name)!.getWorldPosition(new THREE.Vector3());
  for(const side of ['r','l'] as const){
    const digits=['index','middle','ring','pinky'];
    const axis=pos(`index_04_leaf_${side}`).sub(pos(`index_01_${side}`)).normalize();
    const across=pos(`pinky_01_${side}`).sub(pos(`index_01_${side}`));across.addScaledVector(axis,-across.dot(axis)).normalize();
    const patches=digits.map(f=>{
      const base=pos(`${f}_01_${side}`),tip=pos(`${f}_04_leaf_${side}`),chord=tip.clone().sub(base);
      let lo=Infinity,hi=-Infinity,vertices=0,tipLo=Infinity,tipHi=-Infinity,tipVertices=0;
      for(const mesh of meshes){
        const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
        for(let v=0;v<position!.count;v++){
          let weight=0;
          for(let k=0;k<4;k++)if(mesh.skeleton.bones[skinIndex!.getComponent(v,k)]!.name.startsWith(`${f}_`)&&mesh.skeleton.bones[skinIndex!.getComponent(v,k)]!.name.endsWith(`_${side}`))weight+=skinWeight!.getComponent(v,k);
          if(weight<.5)continue;
          const point=mesh.getVertexPosition(v,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
          const longitudinal=point.clone().sub(base).dot(axis)/chord.length();
          if(longitudinal<.65)continue;
          const lateral=point.dot(across);lo=Math.min(lo,lateral);hi=Math.max(hi,lateral);vertices++;
          // Gate the terminal 10%, not the wider base of the distal phalanx.
          if(longitudinal>=.90){tipLo=Math.min(tipLo,lateral);tipHi=Math.max(tipHi,lateral);tipVertices++;}
        }
      }
      check(vertices>0&&tipVertices>0,`Zero-fan ${side} ${f}: empty distal/tip skin patch`);
      check(THREE.MathUtils.radToDeg(axis.angleTo(chord))<spec.limits.zeroFanParallelMaxDeg,`Zero-fan ${side} ${f} not parallel`);
      return{finger:f,tip,lo,hi,vertices,tipLo,tipHi,tipVertices,axis:chord.normalize()};
    });
    for(let i=1;i<patches.length;i++){
      const a=patches[i-1]!,b=patches[i]!,gap=b.tipLo-a.tipHi;
      const angle=THREE.MathUtils.radToDeg(a.axis.angleTo(b.axis));
      check(gap>=0&&gap<=spec.limits.zeroFanMaxSkinGapM,`Zero-fan ${side} ${a.finger}/${b.finger}: skin gap ${gap} m`);
      rows.push({side,pair:`${a.finger}/${b.finger}`,skinGapMm:round(gap*1000),parallelDeg:round(angle),
        centrelineLateralMm:round(Math.abs(b.tip.clone().sub(a.tip).dot(across))*1000),distalSkinGapMm:round((b.lo-a.hi)*1000),
        distalVertices:[a.vertices,b.vertices],tipBandVertices:[a.tipVertices,b.tipVertices]});
    }
  }
  // Every digit, including the thumb, responds to independent base abduction and twist.
  const responses=[];
  for(const side of ['r','l'] as const)for(const finger of FINGERS){
    const bone=rig.bone(`${finger}_01_${side}`)!;
    const neutral=bone.quaternion.clone();
    const angles=[],chordAngles=[];
    s.root.updateMatrixWorld(true);
    const beforeAxis=pos(`${finger}_04_leaf_${side}`).sub(pos(bone.name)).normalize();
    for(const control of ['abduction','twist'] as const){
      const changed=s.r1.seals.reference.fingers.quaternion(side,finger,0,{...zero,[control]:10});
      const angle=THREE.MathUtils.radToDeg(neutral.clone().normalize().angleTo(changed.clone().normalize()));angles.push(round(angle));
      check(Math.abs(angle-10)<.001,`${side} ${finger} ${control} response ${angle}`);
      bone.quaternion.copy(changed);s.root.updateMatrixWorld(true);
      const afterAxis=pos(`${finger}_04_leaf_${side}`).sub(pos(bone.name)).normalize();
      const chordAngle=THREE.MathUtils.radToDeg(beforeAxis.angleTo(afterAxis));chordAngles.push(round(chordAngle));
      check(Math.abs(chordAngle-(control==='abduction'?10:0))<.01,`${side} ${finger} ${control} rotated the wrong axis: ${chordAngle}`);
      rig.bones.forEach((b,i)=>{if(b!==bone)check(b.quaternion.equals(controls[i]!),`${control} changed another joint ${b.name}`);});
      bone.quaternion.copy(neutral);
    }
    responses.push({side,finger,abductionResponseDeg:angles[0],twistResponseDeg:angles[1],abductionChordResponseDeg:chordAngles[0],twistChordResponseDeg:chordAngles[1]});
  }
  rig.writePose(q,p);s.root.updateMatrixWorld(true);meshes.forEach(m=>m.skeleton.update());
  return{rows,responses,method:'Terminal 10% real skinned vertices with >=0.5 digit weight, projected on the lateral palm axis; distal 35% also reported for comparison. Long fingers index/middle/ring/pinky; thumb tested independently as an opposable digit. Bone chords must be parallel within 0.01 degrees. This is the lateral tip-silhouette opening, not Euclidean tip-centre distance or a per-slice maximum on rounded caps. No assumed skin radii; no change to the 412 centreline gate.'};
}
function exerciseControls(s:Setup){
  const rig=s.anim.rig,ref=s.r1.seals.reference,probe=new Probe(s);
  s.r1.inspect(3);s.advance(.32);
  const index=rig.bone('index_01_r')!,middle=rig.bone('middle_01_r')!,thumb=rig.bone('thumb_01_l')!;
  const before=index.quaternion.clone(),other=[middle.quaternion.clone(),thumb.quaternion.clone()];
  ref.setFinger('r','index',{abduction:10,twist:10});s.advance(.32);
  const fingerChange=THREE.MathUtils.radToDeg(before.normalize().angleTo(index.quaternion.clone().normalize()));
  check(fingerChange>10,'Live finger override was hidden by a cached profile');
  check(middle.quaternion.equals(other[0]!)&&thumb.quaternion.equals(other[1]!), 'Live override changed another digit');
  const wrist=rig.bone('hand_r')!,elbow=rig.bone('lowerarm_r')!;
  const w=wrist.getWorldPosition(new THREE.Vector3()),e=elbow.getWorldPosition(new THREE.Vector3());
  ref.setPole('r',[.04,.80,.08]);s.advance(.32);
  const wristShift=w.distanceTo(wrist.getWorldPosition(new THREE.Vector3()));
  const elbowShift=e.distanceTo(elbow.getWorldPosition(new THREE.Vector3()));
  check(elbowShift>.01&&wristShift<1e-5,`Live pole failed two-bone constraint: elbow ${elbowShift}, wrist ${wristShift}`);
  s.r1.inspect(4);s.advance(.32);s.r1.inspect(3);s.advance(.32);
  check(index.quaternion.clone().normalize().angleTo(before)>10*Math.PI/180,'Per-seal override was not retained');
  ref.setFinger('r','index',{curl:.12});s.advance(.32);
  const curlAngles=probe.bends('r','index');
  check(curlAngles.every((a,j)=>Math.abs(a-[10.2,11.22,8.16][j]!)<.001),'Live scalar curl did not reach all three joints');
  check(middle.quaternion.equals(other[0]!)&&thumb.quaternion.equals(other[1]!), 'Live curl override changed another digit');
  for(const curl of [-.1,1.1,NaN])assert.throws(()=>ref.setFinger('r','index',{curl}));
  s.r1.stop();
  return{fingerChangeDeg:round(fingerChange),elbowShiftM:round(elbowShift),wristShiftM:round(wristShift),perSealOverrideRetained:true,curlOverrideJointsDeg:curlAngles.map(round),invalidCurlRejected:true};
}
const results:object[]=[];
const tables:{hz:number;rows:object[];zero:object[];families:object[];curls:object[]}[]=[];
// Independent numeric contract, including full thumb curl even though authored thumbs are open/contact.
assert.deepEqual(spec.curlProfiles,{long:{ratio:[1,1.1,.8],maxDeg:[85,100,75]},thumb:{ratio:[1,1.2,1.4],maxDeg:[50,60,70]}});
for(const finger of FINGERS)for(const curl of [0,.08,.12,.15,.75,.82,1]){
  const expected=(finger==='thumb'?[50,60,70]:[85,93.5,68]).map(a=>a*curl);
  r3CurlAngles(finger,curl).forEach((angle,j)=>check(Math.abs(angle-expected[j]!)<1e-8,`${finger} curl=${curl} joint ${j} mapping`));
}
for(const hz of [60,120]){
  const s=await setup(hz),probe=new Probe(s),seals:object[]=[];assert.equal(s.anim.rig.count,66);
  const curlEndpoints=curlSweep(s);
  const zeroAbduction=zeroFan(s);
  let minDepth=Infinity,maxDepth=-Infinity,maxFlex=0;
  let minGap=Infinity,worst='',rawMin=Infinity,frames=0,exemptSamples=0,maxTransitionS=0;
  const sample=(ids:number[],label:string)=>{const g=probe.gap(ids);probe.motion(label+" t="+round(s.r1.seals.reference.age));frames++;rawMin=Math.min(rawMin,g.raw);exemptSamples+=g.exempt;if(g.min<minGap){minGap=g.min;worst=label+' t='+round(s.r1.seals.reference.age)+' '+g.worst;}return g;};
  for(let id=0;id<10;id++){
    s.r1.inspect(id);s.advance(.32);check(s.r1.seals.settled,`S${id} not settled`);
    const gap=sample([id],`S${id}`);check(gap.min>=.004,`S${id} gap ${gap.min} ${gap.worst}`);
    for(const mode of ['front','hands'] as const){
      const camera=new THREE.PerspectiveCamera(28,16/9,.01,100),fx=new THREE.Group();camera.position.set(3,5,8);camera.lookAt(0,1,3);camera.updateMatrixWorld(true);
      const p=camera.position.clone(),q=camera.quaternion.clone(),view=new FrontHandsView(camera,s.root,fx);view.enabled=true;view.compare=mode;view.beforeDraw();
      const width=mode==='front'?1080/1920:810/1920;
      for(const side of ['r','l'])for(const finger of FINGERS){
        const tip=s.anim.rig.bone(`${finger}_04_leaf_${side}`)!.getWorldPosition(new THREE.Vector3()).project(camera);
        check(Math.abs(tip.x)<width-.01&&Math.abs(tip.y)<.98&&Math.abs(tip.z)<1,`S${id} ${mode} fingertip cropped`);
      }
      check(!fx.visible,'Comparison FX isolation');view.afterDraw();check(camera.position.distanceTo(p)<1e-8&&camera.quaternion.angleTo(q)<1e-7&&fx.visible,'Comparison state restoration');
    }
    seals.push({id:`S${id}`,gapMm:round(gap.min*1000),rawGapMm:round(gap.raw*1000),...probe.pose(id)});
  }
  for(let a=0;a<10;a++)for(let b=0;b<10;b++)if(a!==b){
    s.r1.inspect(a);s.advance(.32);s.r1.inspect(b);probe.resetMotion();
    let duration=0;
    while(duration<R3_SECONDS+1/hz){s.step();duration+=1/hz;sample([a,b],`S${a}->S${b}`);for(const m of probe.moving()){minDepth=Math.min(minDepth,m.depth);maxDepth=Math.max(maxDepth,m.depth);maxFlex=Math.max(maxFlex,m.flex);}}
    maxTransitionS=Math.max(maxTransitionS,duration-1/hz);
    const gap=probe.gap([b]);check(gap.min>=.004,`S${b} final gap after S${a}: ${gap.min}`);
    // Retarget from the actual rendered pose while the preceding transition is still moving.
    for(const at of [.05,.125,.20]){
      s.r1.inspect(a);s.advance(at);s.r1.inspect(b);probe.resetMotion();
      for(let f=0;f<Math.ceil(.30*hz);f++){s.step();sample([a,b],`interrupt ${at}s S${a}->S${b}`);for(const m of probe.moving()){minDepth=Math.min(minDepth,m.depth);maxDepth=Math.max(maxDepth,m.depth);maxFlex=Math.max(maxFlex,m.flex);}}
    }
  }
  check(minGap>=.004,`${hz}Hz all-transition gap ${minGap} ${worst}`);
  check(minDepth>=.05&&maxDepth<=.30,`${hz}Hz moving depth ${minDepth}..${maxDepth}`);
  check(maxFlex<=70.001,`${hz}Hz moving wrist flex ${maxFlex}`);
  s.r1.stop();s.advance(1);
  const families:object[]=[];
  for(const family of FAMILIES){
    s.r1.select(family);s.advance(.5);const fp=new FingerProbe(s.anim),start=s.r1.releases.length;
    for(const wpm of [15,45,90])for(const word of ['art',FAMILY_WORD[family],'cultivar']){
      s.r1.begin(word);for(const ch of word){s.r1.text(ch,s.now()+.01);for(let f=0;f<Math.ceil(60/(wpm*5)*hz);f++){s.step();fp.sample();}}s.advance(1);
    }
    s.r1.begin('art');for(const ch of 'art')s.r1.text(ch,s.now()+.01);s.step();s.advance(1);
    const releases=s.r1.releases.slice(start),latency=Math.max(...releases.map(r=>r.bodyMs-r.keyMs)),motion=Math.max(...releases.map(r=>r.motionMs===null?Infinity:r.motionMs-r.keyMs));
    check(releases.length===10&&releases.every(r=>r.poseApplied&&r.motionMs!==null&&r.fxFrame===r.bodyFrame&&r.drawFrame===r.bodyFrame),`${family} release contract`);
    check(latency<=50&&motion<=50,`${family} latency ${latency}/${motion}`);check(fp.minM>=.004,`${family} phalange regression`);
    families.push({family,releases:releases.length,keyToBodyMaxMs:round(latency),keyToMotionMaxMs:round(motion),minGapMm:round(fp.minM*1000)});
  }
  const exitStart=s.r1.releases.length,exitTimings:{id:string;family:string;bodyMs:number;motionMs:number}[]=[];
  for(let id=0;id<10;id++)for(const family of FAMILIES){
    s.r1.inspect(id);s.advance(.32);s.r1.select(family);
    for(const ch of FAMILY_WORD[family])s.r1.text(ch,s.now()+.01);
    s.step();const r=s.r1.releases.at(-1)!;
    check(r.family===family&&r.poseApplied&&r.motionMs!==null&&r.motionMs-r.keyMs<=50&&r.bodyMs-r.keyMs<=50&&r.fxFrame===r.bodyFrame&&r.drawFrame===r.bodyFrame,`S${id}->${family} immediate release`);
    exitTimings.push({id:`S${id}`,family,bodyMs:round(r.bodyMs-r.keyMs),motionMs:round(r.motionMs===null?Infinity:r.motionMs-r.keyMs)});
    s.advance(1);
  }
  check(s.r1.releases.length-exitStart===30,'Seal-to-action releases must be exactly once');
  const table=seals.map(raw=>{
    const seal=raw as Record<string,unknown>,r=seal.r as Record<string,unknown>,l=seal.l as Record<string,unknown>;
    const timing=exitTimings.filter(t=>t.id===seal.id);
    return{seal:seal.id,gapMm:seal.gapMm,zeroFanSkinMaxMm:Math.max(...zeroAbduction.rows.map(g=>g.skinGapMm)),
      elbowLateralRightM:r.elbowLateralM,elbowLateralLeftM:l.elbowLateralM,
      elbowBelowShoulderRightM:r.elbowBelowShoulderM,elbowBelowShoulderLeftM:l.elbowBelowShoulderM,
      wristRightYM:(r.wristM as number[])[1],wristLeftYM:(l.wristM as number[])[1],
      keyToBodyMaxMs:Math.max(...timing.map(t=>t.bodyMs)),keyToMotionMaxMs:Math.max(...timing.map(t=>t.motionMs))};
  });
  tables.push({hz,rows:table,zero:zeroAbduction.rows,families,curls:probe.curlRows});
  const controlOverrides=exerciseControls(s);
  results.push({hz,table,curls:probe.curlRows,curlEndpoints,exitTimings,zeroAbduction,controlOverrides,rigJoints:s.anim.rig.count,seals,transitionFrames:frames,segmentPairsPerFrame:405,orderedPairs:90,interruptedPairs:270,minDepthM:round(minDepth),maxDepthM:round(maxDepth),maxWristFlexDeg:round(maxFlex),minGapMm:round(minGap*1000),rawMinGapMm:round(rawMin*1000),worst,exemptSamples,maxTransitionS:round(maxTransitionS),maxJointStepDeg:round(probe.maxStepDeg),worstStepBone:probe.worstStepBone,worstStepLabel:probe.worstStepLabel,sealToActionReleases:exitTimings.length,families});
}
const report={ticket:'415b',baseTicket:415,typeDiagnostics:diagnostics.length,pass:errors.length===0,errors,results,
  limits:'Fixed-step CPU. The 412 gate measures centreline segments, not skin surfaces. Zero-abduction measures the lateral opening in real distal skin silhouettes, separately from the bone gate. Contact exceptions are only named pairs in anim-r3-seals.json. Zone/finger state/elbow gates are endpoint constraints; transitions change zone and curl continuously. Browser and visual acceptance remain with Claude.'};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else{
  console.log(`415b: ${report.pass?'PASS':'FAIL'}; strict + noUncheckedIndexedAccess: ${diagnostics.length} diagnostics`);
  for(const table of tables){
    console.log(`${table.hz} Hz — S0–S9; metres, mm and milliseconds as named in columns`);console.table(table.rows);
    console.log('Zero abduction/curl/twist — real distal skin opening, parallel bone chords');console.table(table.zero);
    console.log('415b — actual bend angles after removing rest fan, abduction and twist; every digit of S0–S9');console.table(table.curls);
    console.log('412 release contract');console.table(table.families);
  }
  if(errors.length)console.error(errors.join('\n'));
}
if(errors.length)process.exitCode=1;
