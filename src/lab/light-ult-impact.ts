/** 439d, art-only pass 18/11: isolated Firefly light-sparkle glint, placed at uniform
 * scale (never stretched or masked) as moving prism sparks and short burst glints. Placement/colour/motion only; no drawn star.
 * Own reference: art-src/concept/ult-storyboards/light-storyboard.v1-try1.png. */
import * as THREE from "three";
import { ease, noise } from "./light-ult-fan-space";

export class LightImpactSparks {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly light = new THREE.PointLight(new THREE.Color(.9,.65,.3), 0, 28, 1.25);
  private readonly spots = new THREE.InstancedBufferAttribute(new Float32Array(192*4),4).setUsage(THREE.DynamicDrawUsage);
  private readonly dirs = new THREE.InstancedBufferAttribute(new Float32Array(192*4),4).setUsage(THREE.DynamicDrawUsage);
  private readonly colours = new THREE.InstancedBufferAttribute(new Float32Array(192*4),4).setUsage(THREE.DynamicDrawUsage);
  private count=0;
  private readonly at=new THREE.Vector3();
  private readonly dir=new THREE.Vector3();
  constructor(parent:THREE.Object3D, blank:THREE.Texture) {
    const g=new THREE.InstancedBufferGeometry(),quad=new THREE.PlaneGeometry(1,1);
    g.index=quad.index;g.setAttribute("position",quad.getAttribute("position"));g.setAttribute("uv",quad.getAttribute("uv"));
    g.setAttribute("iSpot",this.spots);g.setAttribute("iDir",this.dirs);g.setAttribute("iColour",this.colours);g.instanceCount=0;
    const m=new THREE.ShaderMaterial({uniforms:{uMap:{value:blank}},
      vertexShader:`attribute vec4 iSpot,iDir,iColour;varying vec2 vUv;varying vec4 vColour;
        void main(){vUv=uv;vColour=iColour;vec4 p=modelViewMatrix*vec4(iSpot.xyz,1.);
        vec2 d=(modelViewMatrix*vec4(iDir.xyz,0.)).xy;d=length(d)<.001?vec2(1.,0.):normalize(d);
        float k=iSpot.w*1.5;p.xy+=d*position.x*k+vec2(-d.y,d.x)*position.y*k;
        gl_Position=projectionMatrix*p;}`,
      fragmentShader:`uniform sampler2D uMap;varying vec2 vUv;varying vec4 vColour;
        void main(){vec2 p=(vec2(18.,287.)+vec2(vUv.x,1.-vUv.y)*50.)/2048.;p.y=1.-p.y;
        vec3 art=texture2D(uMap,p).rgb;
        gl_FragColor=vec4(min(vec3(.9),art*vColour.rgb*3.),vColour.a);}`,
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    this.mesh=new THREE.Mesh(g,m);this.mesh.name="light-ult-prism-trails";this.mesh.frustumCulled=false;this.mesh.renderOrder=18;
    this.light.name="light-ult-impact-light";parent.add(this.mesh,this.light);this.clear();
  }
  attach(t:THREE.Texture):void {this.mesh.material.uniforms.uMap!.value=t;}
  clear():void {this.count=0;this.mesh.visible=false;this.light.intensity=0;}
  private add(at:THREE.Vector3,dir:THREE.Vector3,width:number,length:number,alpha:number,prism:number):void {
    const i=this.count++;if(i>=192)return;
    this.spots.setXYZW(i,at.x,at.y,at.z,width);this.dirs.setXYZW(i,dir.x,dir.y,dir.z,length);
    const c=prism===1?[.38,.72,.9]:prism===2?[.9,.42,.62]:[.9,.72,.32];
    this.colours.setXYZW(i,c[0]!,c[1]!,c[2]!,alpha);
  }
  gather(source:THREE.Vector3,t:number):void {
    if(t<0||t>.65)return;
    for(let i=0;i<28;i++) {
      const phase=(t*1.45+noise(i+71))%1,a=i*2.4+t*.6;
      const r=(1-phase)*(1.1+noise(i+3)*1.2)+.1;
      this.dir.set(Math.cos(a),Math.sin(a)*.75,Math.sin(a*1.7)*.5).normalize();
      this.at.copy(source).addScaledVector(this.dir,r);
      this.add(this.at,this.dir,.13+noise(i+1)*.08,.35+phase*.2,Math.sin(phase*Math.PI)*ease(t/.12)*.85,0);
    }
  }
  impact(end:THREE.Vector3,age:number):void {
    if(age<0||age>.85)return;
    const fade=1-ease((age-.08)/.77);
    // 120 ballistic prism sparks, each a single textured moving trail.
    for(let i=0;i<120;i++) {
      const a=i*2.399963,up=.18+noise(i+12)*1.1;
      this.dir.set(Math.cos(a),up,Math.sin(a)).normalize();
      const d=(1-Math.exp(-age*5))*(4.0+noise(i+44)*11.0);
      this.at.copy(end).addScaledVector(this.dir,d);this.at.y-=age*age*2.5;
      this.add(this.at,this.dir,.15+noise(i+5)*.16,(.8+noise(i+8)*1.25)*(1-age*.55),fade*(.7+.3*noise(i)),i%7===0?1:i%11===0?2:0);
    }
    if(age<.3)for(let i=0;i<14;i++) {
      const a=i*2.4;this.dir.set(Math.cos(a),.1+noise(i+19),Math.sin(a)).normalize();
      this.at.copy(end).addScaledVector(this.dir,.5+age*2.8);
      this.add(this.at,this.dir,.24,2.3+noise(i+35)*1.8,(1-ease(age/.3))*.85,0);
    }
    // Actual surface/foe illumination, never a disc or ring. One preallocated light.
    this.light.position.copy(end);this.light.position.y=5.8;
    this.light.intensity=age<.42?4*(1-ease(age/.42)):0;
  }
  flush():void {
    this.mesh.geometry.instanceCount=Math.min(192,this.count);this.mesh.visible=this.count>0;
    this.spots.needsUpdate=true;this.dirs.needsUpdate=true;this.colours.needsUpdate=true;
  }
}
