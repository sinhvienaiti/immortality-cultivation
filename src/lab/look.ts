/**
 * Dev-only look shared by the lookdev and skills-lab pages: the paved field
 * in CC0 PBR materials (ambientCG), a Poly Haven HDRI (CC0) for image-based
 * light, one sun from the north-east with soft shadows (MAP1_CONCEPT §3),
 * exposure and bloom per LESSONS §5 (strength 0.4–0.5, radius ~0.12).
 * Assets live in art-src/lab/ (served by Vite in dev, never built or shipped;
 * licences in art-src/third-party/LICENCES.md).
 */
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import type { Renderer3D } from "../view/renderer";

export const LAB_ASSETS = "/art-src/lab/";
const LOOKDEV = LAB_ASSETS + "lookdev/";

export interface LookOptions {
  readonly hdri?: "misty" | "sky";
  readonly sun?: number;
  readonly env?: number;
  readonly exposure?: number;
  readonly bloom?: number;
  readonly shadows?: boolean;
}

export interface Look {
  readonly sun: THREE.DirectionalLight;
  /** Resolves when the HDRI is in place. */
  readonly ready: Promise<void>;
}

export interface MaterialDef {
  readonly id: string;
  readonly repeat: number;
  readonly ao?: boolean;
  readonly metal?: boolean;
  readonly roughness?: number;
  readonly tint?: string;
}

const loader = new THREE.TextureLoader();

function map(id: string, file: string, srgb: boolean, repeat: number): THREE.Texture {
  const tex = loader.load(LOOKDEV + id + "/" + file + ".jpg");
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A PBR material from an ambientCG set in art-src/lab/lookdev/<id>/. */
export function pbr(def: MaterialDef): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: map(def.id, "Color", true, def.repeat),
    normalMap: map(def.id, "NormalGL", false, def.repeat),
    roughnessMap: map(def.id, "Roughness", false, def.repeat),
    roughness: def.roughness ?? 1,
    metalness: def.metal === true ? 1 : 0,
  });
  if (def.ao === true) material.aoMap = map(def.id, "AmbientOcclusion", false, def.repeat);
  if (def.metal === true) material.metalnessMap = map(def.id, "Metalness", false, def.repeat);
  if (def.tint !== undefined) material.color.set(def.tint);
  return material;
}

/** Copies uv into uv1 (aoMap reads the second set). */
export function withUv1(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = geometry.getAttribute("uv");
  if (uv !== undefined) geometry.setAttribute("uv1", uv);
  return geometry;
}

/** Lights, exposure, bloom and the HDRI on `view`. */
export function applyLook(view: Renderer3D, options: LookOptions = {}): Look {
  const { scene, stage } = view;
  stage.renderer.toneMappingExposure = options.exposure ?? 0.72;
  stage.bloom.strength = options.bloom ?? 0.45;
  stage.bloom.radius = 0.12;
  stage.hemisphere.intensity = 0.45;
  stage.keyLight.intensity = 0.35;
  for (const rim of stage.rimLights) rim.intensity = 0.3;
  const sun = new THREE.DirectionalLight("#fff1dc", options.sun ?? 1.4);
  sun.position.set(26, 34, -18);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  if (options.shadows !== false) {
    stage.renderer.shadowMap.enabled = true;
    stage.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -24;
    cam.right = 24;
    cam.top = 20;
    cam.bottom = -20;
    cam.near = 5;
    cam.far = 120;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
  }
  const hdriName = options.hdri === "sky" ? "kloofendal_48d_partly_cloudy_puresky_2k.hdr" : "misty_pines_2k.hdr";
  const ready = new Promise<void>((resolve) => {
    new RGBELoader().load(LOOKDEV + hdriName, (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(stage.renderer);
      scene.environment = pmrem.fromEquirectangular(hdr).texture;
      scene.environmentIntensity = options.env ?? 0.45;
      hdr.dispose();
      pmrem.dispose();
      resolve();
    });
  });
  return { sun, ready };
}

/** The paved field 40 × 26 m (heart at the origin, far edge z −18) and the rock surround. */
export function buildField(view: Renderer3D, options: { tint?: string; repeat?: number } = {}): void {
  const field = new THREE.Mesh(withUv1(new THREE.PlaneGeometry(40, 26, 1, 1)), pbr({ id: "PavingStones128", repeat: options.repeat ?? 9, ao: true, ...(options.tint ? { tint: options.tint } : {}) }));
  field.rotation.x = -Math.PI / 2;
  field.position.set(0, 0, -5);
  field.receiveShadow = true;
  view.layers.ground.add(field);
  const surround = new THREE.Mesh(withUv1(new THREE.PlaneGeometry(160, 120, 1, 1)), pbr({ id: "Rock035", repeat: 24, ao: true, tint: "#9aa3a6" }));
  surround.rotation.x = -Math.PI / 2;
  surround.position.set(0, -0.05, -5);
  surround.receiveShadow = true;
  view.layers.ground.add(surround);
}
