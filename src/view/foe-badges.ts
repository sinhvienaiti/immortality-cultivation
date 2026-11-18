import * as THREE from "three";
import type { Presenter, Projector } from "../app/contracts";
import type { BeastState } from "../content/types";
import type { ActorsView, Point3 } from "./actors";

export type FoeBadgeKind = "elite" | "boss";
export type FoeBadgeArt = Readonly<Partial<Record<FoeBadgeKind, string>>>;
export const FOE_BADGE_ART: FoeBadgeArt = {
  elite: "/assets/immortality-cultivation/ui/icons/foe-elite-jade-shield.v1-try1-48.png",
  boss: "/assets/immortality-cultivation/ui/icons/foe-boss-imperial-crown.v1-try1-48.png",
};
export const FOE_BADGE_PX = { elite: 30, boss: 32 } as const;

export function foeBadgeKind(beast: Pick<BeastState, "alive" | "freed" | "boss" | "general" | "elite">): FoeBadgeKind | null {
  if (!beast.alive || beast.freed) return null;
  return beast.boss ? "boss" : beast.general || beast.elite !== null ? "elite" : null;
}

/** Two textures, one material and one draw. Clip-space offsets keep CSS size at every zoom/DPR. */
export function createFoeBadges(host: THREE.Group, options: {
  readonly project: Projector;
  readonly locate: ActorsView["locate"];
  readonly viewport: () => { width: number; height: number };
  readonly art?: FoeBadgeArt;
  readonly capacity?: number;
  readonly load?: (url: string, ready: () => void, fail: () => void) => THREE.Texture;
}): Presenter & { readonly mesh: THREE.InstancedMesh } {
  const capacity = options.capacity ?? 2048;
  const art = options.art ?? FOE_BADGE_ART;
  const loaded = { elite: false, boss: false };
  let disposed = false;
  const textures: THREE.Texture[] = [];
  const loader = options.load ?? ((url, ready, fail) => new THREE.TextureLoader().load(url, ready, undefined, fail));
  const texture = (kind: FoeBadgeKind): THREE.Texture => {
    const url = art[kind];
    const result = url ? loader(url, () => { if (!disposed) loaded[kind] = true; }, () => { loaded[kind] = false; }) : new THREE.Texture();
    result.colorSpace = THREE.SRGBColorSpace;
    result.minFilter = THREE.LinearFilter;
    result.generateMipmaps = false;
    textures.push(result);
    return result;
  };
  const geometry = new THREE.PlaneGeometry(1, 1);
  const roles = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("badgeRole", roles);
  const material = new THREE.ShaderMaterial({
    uniforms: { eliteArt: { value: texture("elite") }, bossArt: { value: texture("boss") }, viewport: { value: new THREE.Vector2(1, 1) } },
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: `
      attribute float badgeRole;
      uniform vec2 viewport;
      varying vec2 vUv;
      varying float vRole;
      void main() {
        vUv = uv;
        vRole = badgeRole;
        float size = mix(${FOE_BADGE_PX.elite}., ${FOE_BADGE_PX.boss}., badgeRole);
        vec4 center = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
        center.xy += (position.xy * size + vec2(0., 8. + size * .5)) * 2. / viewport * center.w;
        gl_Position = center;
      }
    `,
    fragmentShader: `
      uniform sampler2D eliteArt;
      uniform sampler2D bossArt;
      varying vec2 vUv;
      varying float vRole;
      void main() {
        gl_FragColor = vRole > .5 ? texture2D(bossArt, vUv) : texture2D(eliteArt, vUv);
        if (gl_FragColor.a < .01) discard;
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = "foe-badge-batch";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  mesh.renderOrder = 9;
  host.add(mesh);
  const matrix = new THREE.Matrix4();
  const at: Point3 = { x: 0, y: 0, z: 0 };
  const point = { x: 0, y: 0, visible: false };
  const occupied = Array.from({ length: capacity }, () => ({ x: 0, y: 0, size: 0 }));
  return {
    mesh,
    onEvents() {},
    frame(world) {
      const { width, height } = options.viewport();
      material.uniforms.viewport!.value.set(width, height);
      let count = 0;
      // Bosses retain priority in crowded groups; colliding secondary markers are suppressed.
      for (const kind of ["boss", "elite"] as const) for (const beast of world.beasts.list) {
        if (count >= capacity || !loaded[kind] || foeBadgeKind(beast) !== kind || !options.locate(beast.slot, beast.serial, "top", at)) continue;
        options.project(at.x, at.y, at.z, point);
        const size = FOE_BADGE_PX[kind];
        const x = point.x - size / 2, y = point.y - 8 - size;
        if (!point.visible || x < 0 || y < 0 || x + size > width || y + size > height) continue;
        let crowded = false;
        for (let i = 0; i < count; i += 1) {
          const other = occupied[i]!;
          if (x < other.x + other.size + 2 && x + size + 2 > other.x && y < other.y + other.size + 2 && y + size + 2 > other.y) { crowded = true; break; }
        }
        if (crowded) continue;
        Object.assign(occupied[count]!, { x, y, size });
        matrix.makeTranslation(at.x, at.y, at.z);
        mesh.setMatrixAt(count, matrix);
        roles.setX(count, kind === "boss" ? 1 : 0);
        count += 1;
      }
      mesh.count = count;
      mesh.visible = count > 0;
      if (count) { mesh.instanceMatrix.needsUpdate = true; roles.needsUpdate = true; }
    },
    dispose() {
      disposed = true;
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      for (const entry of textures) entry.dispose();
    },
  };
}
