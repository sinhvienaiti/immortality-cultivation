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
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import basisWasmUrl from "three/examples/jsm/libs/basis/basis_transcoder.wasm?url";
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

/**
 * The ground's maps (perf stress rounds 3–4, docs/games/tu-tien/PERF_BUDGET.md §10–11): the same pictures, drawn cheaper.
 * - "orm": AO and roughness in one texture (lookdev/<id>/ORM.png: R = AO, G = roughness), the frame equal to the bit
 *   (three reads AO from R and roughness from G);
 * - "ktx2": colour, normal and that packed map compressed (UASTC, ASTC 4×4 on Apple), the frame within 56–58 dB, a
 *   quarter of the memory and 0.5–0.7 ms less a frame at 1080p on the M4;
 * - "jpg": the four JPGs as before.
 * ?groundTex=jpg|orm|ktx2 picks one (ktx2 by default: the field starts on "orm" and switches when the KTX2 maps are in;
 * if they fail it stays on "orm"). useGroundTextures switches at run time (A/B captures).
 */
export type GroundTexMode = "jpg" | "orm" | "ktx2";
interface GroundMaps { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture; aoMap: THREE.Texture | null }
interface GroundSet { readonly material: THREE.MeshStandardMaterial; readonly def: MaterialDef; maps: Partial<Record<GroundTexMode, GroundMaps>> }
export const groundTextures: { mode: GroundTexMode; readonly sets: GroundSet[]; ready: Promise<GroundTexMode> } = { mode: "jpg", sets: [], ready: Promise.resolve("jpg") };
let groundKtx2: KTX2Loader | null = null;

function tile(t: THREE.Texture, repeat: number, srgb: boolean): THREE.Texture {
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

async function groundMaps(set: GroundSet, mode: GroundTexMode, renderer: THREE.WebGLRenderer): Promise<GroundMaps> {
  const have = set.maps[mode];
  if (have !== undefined) return have;
  const { id, repeat } = set.def;
  let maps: GroundMaps;
  // Loaded before they are used: a switch never shows a frame with a map still empty.
  const jpg = (file: string, srgb: boolean): Promise<THREE.Texture> => loader.loadAsync(LOOKDEV + id + "/" + file + ".jpg").then((t) => tile(t, repeat, srgb));
  if (mode === "jpg") {
    const [colour, normal, rough, ao] = await Promise.all([jpg("Color", true), jpg("NormalGL", false), jpg("Roughness", false), set.def.ao === true ? jpg("AmbientOcclusion", false) : Promise.resolve(null)]);
    maps = { map: colour, normalMap: normal, roughnessMap: rough, aoMap: ao };
  } else if (mode === "orm") {
    const base = set.maps.jpg;
    const [colour, normal, orm] = await Promise.all([base ? Promise.resolve(base.map) : jpg("Color", true), base ? Promise.resolve(base.normalMap) : jpg("NormalGL", false), loader.loadAsync(LOOKDEV + id + "/ORM.png").then((t) => tile(t, repeat, false))]);
    maps = { map: colour, normalMap: normal, roughnessMap: orm, aoMap: set.def.ao === true ? orm : null };
  } else {
    groundKtx2 ??= new KTX2Loader().setTranscoderPath(basisWasmUrl.slice(0, basisWasmUrl.lastIndexOf("/") + 1)).detectSupport(renderer);
    const load = (file: string, srgb: boolean): Promise<THREE.Texture> => groundKtx2!.loadAsync(LOOKDEV + id + "/" + file + ".uastc.ktx2").then((t) => tile(t, repeat, srgb));
    const [colour, normal, orm] = await Promise.all([load("Color", true), load("NormalGL", false), load("ORM", false)]);
    maps = { map: colour, normalMap: normal, roughnessMap: orm, aoMap: set.def.ao === true ? orm : null };
  }
  set.maps[mode] = maps;
  return maps;
}

/** The field's maps switched to `mode` (loaded once); resolves to the mode in use. */
export async function useGroundTextures(mode: GroundTexMode, renderer: THREE.WebGLRenderer): Promise<GroundTexMode> {
  const all = await Promise.all(groundTextures.sets.map((set) => groundMaps(set, mode, renderer)));
  groundTextures.sets.forEach((set, i) => {
    Object.assign(set.material, all[i]);
    set.material.needsUpdate = true;
  });
  groundTextures.mode = mode;
  return mode;
}

/** A field material: the PBR set's colour and normal maps with AO and roughness packed (useGroundTextures sets the rest). */
function fieldMaterial(def: MaterialDef): GroundSet {
  const material = new THREE.MeshStandardMaterial({ roughness: def.roughness ?? 1, metalness: 0 });
  if (def.tint !== undefined) material.color.set(def.tint);
  const set: GroundSet = { material, def, maps: {} };
  groundTextures.sets.push(set);
  return set;
}

/** The paved field 40 × 26 m (heart at the origin, far edge z −18) and the rock surround. */
export function buildField(view: Renderer3D, options: { tint?: string; repeat?: number } = {}): void {
  const paving = fieldMaterial({ id: "PavingStones128", repeat: options.repeat ?? 9, ao: true, ...(options.tint ? { tint: options.tint } : {}) });
  const rock = fieldMaterial({ id: "Rock035", repeat: 24, ao: true, tint: "#9aa3a6" });
  const field = new THREE.Mesh(withUv1(new THREE.PlaneGeometry(40, 26, 1, 1)), paving.material);
  field.rotation.x = -Math.PI / 2;
  field.position.set(0, 0, -5);
  field.receiveShadow = true;
  view.layers.ground.add(field);
  const surround = new THREE.Mesh(withUv1(new THREE.PlaneGeometry(160, 120, 1, 1)), rock.material);
  surround.rotation.x = -Math.PI / 2;
  surround.position.set(0, -0.05, -5);
  surround.receiveShadow = true;
  view.layers.ground.add(surround);
  const asked = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("groundTex");
  const want: GroundTexMode = asked === "jpg" || asked === "orm" ? asked : "ktx2";
  const renderer = view.stage.renderer;
  // The packed JPG set first (no frame without maps), then the KTX2 one when it is in.
  void useGroundTextures(want === "jpg" ? "jpg" : "orm", renderer);
  groundTextures.ready = want !== "ktx2" ? Promise.resolve(want)
    : useGroundTextures("ktx2", renderer).catch((error: unknown) => {
      console.warn("[look] KTX2 ground maps did not load; the packed JPGs stay", error);
      return groundTextures.mode;
    });
}
