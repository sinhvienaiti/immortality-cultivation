/** 453: approved top-down fan art, projected below the relic without a procedural mask. */
import * as THREE from "three";

export class LightWedgeSpill {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  ready = false;
  private readonly axis = new THREE.Vector3();
  constructor(parent: THREE.Object3D) {
    // 453 light-ground-wedge.v1-try3.png: square card; the painted apex is (u=.505, v=.14).
    const geometry = new THREE.PlaneGeometry(1, 1); geometry.translate(.5-.505,.5-.14,0);
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(.9,.9,.9),
      transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false });
    this.mesh=new THREE.Mesh(geometry,material);this.mesh.name="light-ult-wedge-spill";
    this.mesh.frustumCulled=false;this.mesh.renderOrder=4;this.mesh.visible=false;parent.add(this.mesh);
  }
  async prepare(base: string, upload: (t: THREE.Texture) => void): Promise<void> {
    if (this.ready) return;
    const texture = await new THREE.TextureLoader().loadAsync(base + "light/stills/light-ground-wedge.v1-try3.png");
    texture.colorSpace = THREE.SRGBColorSpace; this.mesh.material.map=texture; this.mesh.material.needsUpdate=true;
    upload(texture);this.ready=true;
  }
  set(source:THREE.Vector3,left:THREE.Vector3,right:THREE.Vector3,alpha:number,_time:number):void {
    this.axis.addVectors(left,right).multiplyScalar(.5).sub(source); this.axis.y=0;
    const length=this.axis.length();
    // 453b: project the floating glass centre onto the ground; keep the approved wedge flat.
    this.mesh.position.set(source.x,.055,source.z);
    this.mesh.quaternion.setFromEuler(new THREE.Euler(-Math.PI/2,0,Math.atan2(-this.axis.x,-this.axis.z)));
    this.mesh.scale.setScalar(length/(.86-.14));
    this.mesh.visible=this.ready&&alpha>.001;this.mesh.material.opacity=THREE.MathUtils.clamp(alpha,0,1);
  }
}
