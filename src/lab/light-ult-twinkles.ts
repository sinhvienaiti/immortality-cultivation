/** 439c: one isolated painted glint from light-sparkle, instanced into sparse clusters. */
import * as THREE from "three";

export class LightAfterglow {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly spots = new THREE.InstancedBufferAttribute(new Float32Array(60*4),4).setUsage(THREE.DynamicDrawUsage);
  private readonly alpha = new THREE.InstancedBufferAttribute(new Float32Array(60),1).setUsage(THREE.DynamicDrawUsage);
  constructor(parent:THREE.Object3D,blank:THREE.Texture) {
    const g=new THREE.InstancedBufferGeometry(),quad=new THREE.PlaneGeometry(1,1);
    g.index=quad.index;g.setAttribute("position",quad.getAttribute("position"));g.setAttribute("uv",quad.getAttribute("uv"));
    g.setAttribute("iSpot",this.spots);g.setAttribute("iAlpha",this.alpha);g.instanceCount=60;
    const material=new THREE.ShaderMaterial({
      uniforms:{uMap:{value:blank}},
      vertexShader:`attribute vec4 iSpot;attribute float iAlpha;varying vec2 vUv;varying float vAlpha;
        void main(){vUv=uv;vAlpha=iAlpha;vec4 p=modelViewMatrix*vec4(iSpot.xyz,1.);
        p.xy+=position.xy*iSpot.w;gl_Position=projectionMatrix*p;}`,
      fragmentShader:`uniform sampler2D uMap;varying vec2 vUv;varying float vAlpha;
        void main(){
          // Frame 8, isolated star centred at (43,56) in its 256 px cell. Same bottom-origin UV convention as FlipbookPool.
          vec2 p=(vec2(18.,287.)+vec2(vUv.x,1.-vUv.y)*50.)/2048.;
          p.y=1.-p.y;vec3 art=texture2D(uMap,p).rgb;
          float edge=smoothstep(0.,.12,min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y)));
          gl_FragColor=vec4(min(vec3(.9),art*vec3(2.2,2.0,1.25)),vAlpha*edge);
        }`,
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
    });
    this.mesh=new THREE.Mesh(g,material);this.mesh.name="light-ult-afterglow-spots";
    this.mesh.frustumCulled=false;this.mesh.renderOrder=17;parent.add(this.mesh);this.clear();
  }
  attach(texture:THREE.Texture):void {this.mesh.material.uniforms.uMap!.value=texture;}
  clear():void {this.mesh.visible=false;this.alpha.array.fill(0);}
  set(i:number,at:THREE.Vector3,size:number,alpha:number):void {
    this.spots.setXYZW(i,at.x,at.y,at.z,size);this.alpha.setX(i,alpha);this.mesh.visible=true;
  }
  flush():void {this.spots.needsUpdate=true;this.alpha.needsUpdate=true;}
}
