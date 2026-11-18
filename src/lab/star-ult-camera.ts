/** 454: reversible lab framing with room for the 14 m sky plane and one 1.2 s climax push. */
import * as THREE from "three";
export class StarUltCamera {
  readonly report = { active: false, clock: 0, frameWeight: 0, climaxWeight: 0, returnErrorM: 0 };
  private t = -1;
  private readonly start = new THREE.Vector3();
  private readonly startQ = new THREE.Quaternion();
  private readonly end = new THREE.Vector3();
  private readonly endQ = new THREE.Quaternion();
  private readonly aim = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly look = new THREE.Matrix4();
  private fov = 28;
  private endFov = 36;
  private readonly originalWorldUpdate: THREE.PerspectiveCamera["updateMatrixWorld"];
  private readonly parents: THREE.PerspectiveCamera["updateWorldMatrix"];
  private readonly wrapped: THREE.PerspectiveCamera["updateMatrixWorld"];
  private readonly wrappedParents: THREE.PerspectiveCamera["updateWorldMatrix"];
  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.originalWorldUpdate = camera.updateMatrixWorld; this.parents = camera.updateWorldMatrix;
    const self=this;
    this.wrapped=function(force){self.apply();self.originalWorldUpdate.call(this,force);};
    this.wrappedParents=function(up,down){self.apply();self.parents.call(this,up,down);};
    camera.updateMatrixWorld=this.wrapped;camera.updateWorldMatrix=this.wrappedParents;
  }
  startShot(centre: THREE.Vector3): void {
    this.clear(); const c=this.camera;this.start.copy(c.position);this.startQ.copy(c.quaternion);this.fov=c.fov;
    const behind=c.position.y<10;
    this.end.copy(this.start); if(behind){this.end.y=5.5;this.end.z+=8;}
    this.aim.set(centre.x*.5,behind?5.5:6.7,centre.z+9);
    this.endQ.setFromRotationMatrix(this.look.lookAt(this.end,this.aim,c.up));
    this.endFov=behind?56:this.fov;
    if(!behind){this.end.copy(this.start);this.endQ.copy(this.startQ);} // Alt+1 keeps the play framethis.t=0;this.report.active=true;this.report.returnErrorM=0;
  }
  update(t: number): void {if(this.t<0)return;this.t=t;this.report.clock=t;if(t>=8.4)this.clear();}
  private apply(): void {
    if(this.t<0)return;
    const t=this.t,c=this.camera;
    const w=THREE.MathUtils.smoothstep(t,.25,1.2)*(1-THREE.MathUtils.smoothstep(t,7.3,8.4));
    const peak=THREE.MathUtils.smoothstep(t,5.82,6.0)*(1-THREE.MathUtils.smoothstep(t,6.57,7.02));
    this.at.lerpVectors(this.start,this.end,w);this.q.slerpQuaternions(this.startQ,this.endQ,w);
    this.at.lerp(this.aim,peak*.1); c.position.copy(this.at);c.quaternion.copy(this.q);
    const f=THREE.MathUtils.lerp(this.fov,this.endFov,w);if(c.fov!==f){c.fov=f;c.updateProjectionMatrix();}
    this.report.frameWeight=w;this.report.climaxWeight=peak;
  }
  clear(): void {
    if(this.t>=0){this.camera.position.copy(this.start);this.camera.quaternion.copy(this.startQ);this.camera.fov=this.fov;this.camera.updateProjectionMatrix();this.report.returnErrorM=this.camera.position.distanceTo(this.start);}
    this.t=-1;this.report.active=false;this.report.frameWeight=0;this.report.climaxWeight=0;
  }
  dispose(): void {this.clear();if(this.camera.updateMatrixWorld===this.wrapped)this.camera.updateMatrixWorld=this.originalWorldUpdate;if(this.camera.updateWorldMatrix===this.wrappedParents)this.camera.updateWorldMatrix=this.parents;}
}
