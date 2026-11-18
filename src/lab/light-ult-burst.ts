/** Ticket 441c: broad D burst, lowered visual contact and an early ring-free tail. */
import * as THREE from "three";
import type { FlipbookMeta } from "../view/skills/flipbook";

const VERT=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const FRAG=`precision highp float;varying vec2 vUv;uniform sampler2D uMap;uniform vec2 uGrid;uniform float uFrame,uGain;
vec4 cell(float frame){vec2 tile=vec2(mod(frame,uGrid.x),uGrid.y-1.-floor(frame/uGrid.x));return texture2D(uMap,(tile+clamp(vUv,vec2(.004),vec2(.996)))/uGrid);}
// RGB is sRGB-decoded by the texture sampler; source brightness was packed in alpha.
vec3 sourceLight(vec4 s){return s.rgb*pow(s.a,2.2)*(1.2+1.4*smoothstep(.6,.95,s.a));}
void main(){vec4 a=cell(floor(uFrame)),b=cell(ceil(uFrame));vec3 light=mix(sourceLight(a),sourceLight(b),fract(uFrame));gl_FragColor=vec4(light*uGain,1.);}`;

export class LightPrismBurst {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  private meta: FlipbookMeta | null=null;
  private readonly direction=new THREE.Vector3();
  // Keep the broad 441b footprint; slightly more height gives headroom above 35%.
  readonly sizeM=28;
  readonly widthM=36.5;
  readonly durationS=.40;
  private readonly contact=new THREE.Vector3();
  constructor(parent:THREE.Object3D){
    this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({vertexShader:VERT,fragmentShader:FRAG,
      uniforms:{uMap:{value:null},uGrid:{value:new THREE.Vector2(1,1)},uFrame:{value:0},uGain:{value:1.35}},
      transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false}));
    this.mesh.name="light-ult-prism-burst";this.mesh.renderOrder=17;this.mesh.frustumCulled=false;this.mesh.visible=false;parent.add(this.mesh);
  }
  attach(meta:FlipbookMeta,texture:THREE.Texture):void{
    this.meta=meta;this.mesh.material.uniforms.uMap!.value=texture;
    this.mesh.material.uniforms.uGrid!.value.set(meta.cols,meta.rows);
    // Plane UVs are bottom-left; metadata's authored contact is measured from top-left.
    this.mesh.geometry.translate(.5-meta.pivot[0],meta.pivot[1]-.5,0);
    this.mesh.scale.set(this.widthM*meta.aspect,this.sizeM,1);
  }
  clear():void{this.mesh.visible=false;}
  set(at:THREE.Vector3,age:number,camera:THREE.Camera):void{
    const opening=!this.mesh.visible;
    this.mesh.visible=!!this.meta&&age>=-1e-8&&age<this.durationS;
    if(!this.mesh.visible)return;
    // Freeze contact once: the held lens keeps moving slightly after the shot.
    if(opening){
      this.contact.set(at.x,.025,at.z);
      // At the play camera the far contact is near the top of the frame. Lower
      // only the billboard's visual anchor along the ground; the beam/sim aim
      // stays on its existing axis and is swallowed by this broad burst.
      const elevation=Math.atan2(camera.position.y-this.contact.y,
        Math.hypot(camera.position.x-this.contact.x,camera.position.z-this.contact.z));
      const lower=6.5*THREE.MathUtils.smoothstep(elevation,20*Math.PI/180,50*Math.PI/180);
      this.direction.subVectors(camera.position,this.contact);this.direction.y=0;this.direction.normalize();
      this.mesh.position.copy(this.contact).addScaledVector(this.direction,lower);
    }
    this.direction.subVectors(camera.position,this.mesh.position);this.direction.y=0;
    this.mesh.rotation.set(0,Math.atan2(this.direction.x,this.direction.z),0);
    this.mesh.material.uniforms.uFrame!.value=Math.min(5,Math.max(0,age)/this.durationS*5);
    // Source frame 8 already resolves into a ring. Never sample it (including
    // interpolation); fade the first six burst frames before that shape exists.
    const q=THREE.MathUtils.smoothstep(age,.10,this.durationS);
    this.mesh.material.uniforms.uGain!.value=1.35*(1-q);
  }
  report():{sizeM:number;widthM:number;areaRatio441:number;durationS:number;pivot:readonly number[];anchor:number[];upright:boolean;visible:boolean;frame:number}{
    return {sizeM:this.sizeM,widthM:this.widthM,areaRatio441:this.widthM*this.sizeM/(7*7),durationS:this.durationS,pivot:this.meta?.pivot??[],anchor:this.mesh.position.toArray(),
      upright:this.mesh.rotation.x===0&&this.mesh.rotation.z===0,visible:this.mesh.visible,frame:this.mesh.material.uniforms.uFrame!.value};
  }
}
