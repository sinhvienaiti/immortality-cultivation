import * as THREE from "three";
import type { TargetField } from "../view/skills/targets";

interface Batch {
  mesh: THREE.InstancedMesh;
  clock: THREE.InstancedBufferAttribute;
}

/** Tint the existing instanced bodies; never add a hull or change a shared source material. */
export class IceFrostTint {
  private readonly batches: Batch[] = [];
  private readonly bound = new Map<number, { batch: Batch; index: number }>();
  private readonly time = { value: -1 };
  private readonly matrix = new THREE.Matrix4();
  private readonly point = new THREE.Vector3();
  matched = 0;

  prepare(targets: TargetField): void {
    // LabHerd exposes its render group publicly; TargetField's simulation-only implementations need no tint.
    const group = (targets as TargetField & { readonly group?: THREE.Group }).group;
    if (group === undefined) return;
    group.traverse((object) => {
      const mesh = object as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh || !mesh.geometry.hasAttribute("iRim") || this.batches.some(b => b.mesh === mesh)) return;
      const clock = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 2), 2).setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < clock.count; i++) clock.setXY(i, 1e6, 0);
      mesh.geometry.setAttribute("iIceBindClock", clock);
      const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clones = sources.map((source) => {
        const clone = source.clone();
        const compile = source.onBeforeCompile, key = source.customProgramCacheKey();
        clone.onBeforeCompile = (shader, renderer) => {
          compile.call(clone, shader, renderer);
          shader.uniforms.uIceBindTime = this.time;
          shader.vertexShader = "attribute vec2 iIceBindClock;\nuniform float uIceBindTime;\nvarying float vIceBind;\n" + shader.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nfloat iceAge = uIceBindTime - iIceBindClock.x;\nvIceBind = iIceBindClock.y * step(0.0, iceAge) * smoothstep(0.0, 0.12, iceAge) * (1.0 - smoothstep(2.9, 3.0, iceAge));",
          );
          shader.fragmentShader = "varying float vIceBind;\n" + shader.fragmentShader
            .replace("totalEmissiveRadiance += vRim *", "totalEmissiveRadiance += (1.0 - vIceBind) * vRim *")
            .replace("#include <opaque_fragment>", `
              float iceFresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
              vec3 iceBody = outgoingLight * vec3(0.87, 0.96, 1.03);
              iceBody += vec3(0.035, 0.065, 0.09) * iceFresnel;
              outgoingLight = mix(outgoingLight, min(iceBody, vec3(0.9)), vIceBind * 0.55);
              #include <opaque_fragment>
            `);
        };
        clone.customProgramCacheKey = () => key + "-ice-bind-390";
        return clone;
      });
      mesh.material = Array.isArray(mesh.material) ? clones : clones[0]!;
      this.batches.push({ mesh, clock });
    });
  }

  freeze(slot: number, i: number, at: number, targets: TargetField): void {
    this.prepare(targets);
    let best: { batch: Batch; index: number } | undefined;
    let distance = 0.25 * 0.25;
    // Match public render transforms once at freeze; do not depend on LabHerd's private species/slot arrays.
    for (const batch of this.batches) {
      batch.mesh.updateWorldMatrix(true, false);
      for (let index = 0; index < batch.mesh.count; index++) {
        if (batch.clock.getY(index) > 0) continue;
        batch.mesh.getMatrixAt(index, this.matrix);
        if (this.matrix.elements[0] === 0 && this.matrix.elements[5] === 0 && this.matrix.elements[10] === 0) continue;
        this.point.setFromMatrixPosition(this.matrix).applyMatrix4(batch.mesh.matrixWorld);
        const d = (this.point.x - targets.x(i)) ** 2 + (this.point.z - targets.z(i)) ** 2;
        if (d < distance) { distance = d; best = { batch, index }; }
      }
    }
    if (best === undefined) return;
    best.batch.clock.setXY(best.index, at, 1); best.batch.clock.needsUpdate = true;
    this.bound.set(slot, best); this.matched++;
  }

  hide(slot: number): void {
    const bound = this.bound.get(slot);
    if (bound === undefined) return;
    bound.batch.clock.setXY(bound.index, 1e6, 0); bound.batch.clock.needsUpdate = true;
    this.bound.delete(slot);
  }
  update(time: number): void { this.time.value = time; }
  clear(): void {
    for (const slot of this.bound.keys()) this.hide(slot);
    this.time.value = -1; this.matched = 0;
  }
}
