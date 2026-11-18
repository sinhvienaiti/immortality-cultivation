import * as THREE from "three";
import type { BeastState, World } from "../content/types";
import type { ActorsView, Point3 } from "./actors";

/** Full, dead, freed and recycled beasts never occupy a health-bar instance. */
export function damagedHealth(beast: Pick<BeastState, "alive" | "freed" | "hp" | "hpMax">): number | null {
  return beast.alive && !beast.freed && beast.hp > 0 && beast.hp < beast.hpMax ? beast.hp / beast.hpMax : null;
}

/** One camera-facing quad per damaged beast; fill and background share one draw. */
export function createHealthBars(host: THREE.Group, capacity = 2048) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const fractions = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  fractions.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("health", fractions);
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      attribute float health;
      varying float vHealth;
      varying vec2 vUv;
      void main() {
        vHealth = health;
        vUv = uv;
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
        center.xy += position.xy * vec2(1.5, .13);
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: `
      varying float vHealth;
      varying vec2 vUv;
      void main() {
        float inside = step(.018, vUv.x) * step(vUv.x, .982) * step(.16, vUv.y) * step(vUv.y, .84);
        vec3 fill = mix(vec3(.12, .04, .04), vec3(.88, .22, .18), step(vUv.x, vHealth));
        gl_FragColor = vec4(mix(vec3(.025), fill, inside), 1.);
      }
    `,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = "damaged-beast-health";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  mesh.renderOrder = 8;
  host.add(mesh);
  const matrix = new THREE.Matrix4();
  const at: Point3 = { x: 0, y: 0, z: 0 };
  return {
    mesh,
    update(world: World, locate: ActorsView["locate"]): void {
      let count = 0;
      for (const beast of world.beasts.list) {
        const health = damagedHealth(beast);
        if (health === null || count >= capacity || !locate(beast.slot, beast.serial, "top", at)) continue;
        matrix.makeTranslation(at.x, at.y + .18, at.z);
        mesh.setMatrixAt(count, matrix);
        fractions.setX(count, health);
        count += 1;
      }
      mesh.count = count;
      mesh.visible = count > 0;
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        fractions.needsUpdate = true;
      }
    },
    dispose(): void {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
