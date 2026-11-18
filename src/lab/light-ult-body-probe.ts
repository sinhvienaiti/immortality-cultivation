/** 441c: dev-only, reversible target-only capture; no clock advances here. */
import * as THREE from "three";
// Vite may serve this dev probe with and without ?t. Share the registry so
// a CDP import observes the same live targets/uniforms as the host's import.
const registry=globalThis as typeof globalThis & {__lightBody441c?:{
 group?:THREE.Object3D;capOn:{value:number};capAt:{value:THREE.Vector3};
}};
const state=registry.__lightBody441c??={capOn:{value:0},capAt:{value:new THREE.Vector3()}};
const {capOn,capAt}=state;
const installed=new WeakSet<THREE.Material>();
const worldVarying="varying vec3 vLightBodyWorld;\n";
const worldVertex=`#include <project_vertex>
 vec4 lightBodyWorld=vec4(transformed,1.);
 #ifdef USE_INSTANCING
 lightBodyWorld=instanceMatrix*lightBodyWorld;
 #endif
 vLightBodyWorld=(modelMatrix*lightBodyWorld).xyz;`;
/** The generic herd lighting can exceed HDR on a small body. Cap only the
 * struck region while this finisher runs; all other skills retain their shader. */
export function lightBodyCap(at:THREE.Vector3,on:boolean):void{
 capOn.value=on?1:0;capAt.value.copy(at);
 const group=state.group;if(!on||!group)return;
 group.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.geometry)return;
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
   if(installed.has(material))continue;installed.add(material);
   const compile=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material);
   material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);shader.uniforms.uLightBodyCap=capOn;shader.uniforms.uLightBodyAt=capAt;
    shader.vertexShader=worldVarying+shader.vertexShader.replace("#include <project_vertex>",worldVertex);
    shader.fragmentShader=worldVarying+"uniform float uLightBodyCap;uniform vec3 uLightBodyAt;\n"+shader.fragmentShader.replace("#include <opaque_fragment>",
      "outgoingLight=mix(outgoingLight,min(outgoingLight,vec3(.65)),uLightBodyCap*(1.-step(13.5,length(vLightBodyWorld.xz-uLightBodyAt.xz))));\n#include <opaque_fragment>");
   };
   material.customProgramCacheKey=()=>cache()+"/light-ult-body-cap-441c";material.needsUpdate=true;
  }
 });
}
let undo:(()=>void)|undefined;
export function attachLightBodyProbe(value:THREE.Object3D|undefined):void{state.group=value;}
export function lightBodyProbe(mode:"body"|"mask"|"restore"):number{
  undo?.();undo=undefined;
  const group=state.group;
  if(mode==="restore"||!group)return 0;
  let root:THREE.Object3D=group;while(root.parent)root=root.parent;
  const saved:{object:THREE.Object3D;visible:boolean}[]=[],materials:{mesh:THREE.Mesh;material:THREE.Material|THREE.Material[]}[]=[];
  const white=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
  white.onBeforeCompile=shader=>{
    shader.uniforms.uLightBodyAt=capAt;
    shader.vertexShader=worldVarying+shader.vertexShader.replace("#include <project_vertex>",worldVertex);
    shader.fragmentShader=worldVarying+"uniform vec3 uLightBodyAt;\n"+shader.fragmentShader
      .replace("#include <clipping_planes_fragment>","#include <clipping_planes_fragment>\nif(length(vLightBodyWorld.xz-uLightBodyAt.xz)>13.5)discard;")
      .replace("#include <color_fragment>","");
  };
  const scene=root as THREE.Scene,background=scene.background;
  const inGroup=(o:THREE.Object3D):boolean=>{for(let p:THREE.Object3D|null=o;p;p=p.parent)if(p===group)return true;return false;};
  let count=0;
  root.traverse(o=>{
    const mesh=o as THREE.Mesh;if(!mesh.geometry)return;
    saved.push({object:o,visible:o.visible});
    if(!inGroup(o)){o.visible=false;return;}
    count++;
    if(mode==="mask"){materials.push({mesh,material:mesh.material});mesh.material=white;}
  });
  if(mode==="mask")scene.background=new THREE.Color(0);
  undo=()=>{for(const s of saved)s.object.visible=s.visible;for(const s of materials)s.mesh.material=s.material;scene.background=background;white.dispose();};
  return count;
}
