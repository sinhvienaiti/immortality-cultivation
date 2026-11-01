/**
 * Lookdev page (/lookdev.html): the material standard of Thanh Thạch Ải
 * rendered by the game's own renderer (camera 55°, fog, tone mapping, bloom
 * of the tier), so every later concept or source image is judged against
 * what the game can really show (plan §0.1, JUDGING.md "kết luận sau ba
 * vòng"). Eight CC0 PBR materials (ambientCG, art-src/third-party/LICENCES.md)
 * on spheres and flat tiles over the paved field, an 18 % grey ball, a chrome
 * ball and a colour chart of the reserved signal colours, lit by a Poly Haven
 * HDRI (CC0) plus one sun from the north-east (MAP1_CONCEPT §3).
 * Flags: ?q=low|medium|high|ultra (tier), ?hdri=misty|sky, ?sun=0..4,
 * ?env=0..2, ?exposure=0.3..1.5, ?bloom=0..1 (strength; radius 0.12 per LESSONS §5),
 * ?shadow=0|1. Nothing here touches the sim or the world.
 */
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { COLOURS } from "../content/rules";
import type { Quality } from "../content/types";
import { createRenderer } from "../view/renderer";

const ASSETS = "/assets/immortality-cultivation/lookdev/";
const params = new URLSearchParams(location.search);
const quality = (["low", "medium", "high", "ultra"].includes(params.get("q") ?? "") ? params.get("q") : "high") as Quality;
const hdriName = params.get("hdri") === "sky" ? "kloofendal_48d_partly_cloudy_puresky_2k.hdr" : "misty_pines_2k.hdr";
const sunIntensity = Number(params.get("sun") ?? "1.4");
const envIntensity = Number(params.get("env") ?? "0.45");
const exposure = Number(params.get("exposure") ?? "0.72");
const bloomStrength = Number(params.get("bloom") ?? "0.45");
const shadows = params.get("shadow") !== "0";

const host = document.getElementById("ic-lookdev");
if (host === null) throw new Error("lookdev host missing");
const view = createRenderer(host, quality);
const { scene, stage } = view;

// The game's key/rim lights stay but step back: the HDRI and one sun carry the look here.
stage.renderer.toneMappingExposure = exposure;
stage.bloom.strength = bloomStrength;
stage.bloom.radius = 0.12;
stage.hemisphere.intensity = 0.45;
stage.keyLight.intensity = 0.35;
for (const rim of stage.rimLights) rim.intensity = 0.3;
const sun = new THREE.DirectionalLight("#fff1dc", sunIntensity);
sun.position.set(26, 34, -18); // north-east, above (x east, z north-negative)
sun.target.position.set(0, 0, 0);
scene.add(sun, sun.target);
if (shadows) {
  stage.renderer.shadowMap.enabled = true;
  stage.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
}

const loader = new THREE.TextureLoader();
function map(id: string, file: string, srgb: boolean, repeat: number): THREE.Texture {
  const tex = loader.load(ASSETS + id + "/" + file + ".jpg");
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface MaterialDef {
  readonly key: string;
  readonly id: string;
  readonly repeat: number;
  readonly ao?: boolean;
  readonly metal?: boolean;
  readonly roughness?: number;
  readonly tint?: string;
}

/** The eight materials of the standard (MAP1_CONCEPT §5), by ambientCG set. */
const MATERIALS: readonly MaterialDef[] = [
  { key: "lat-da", id: "PavingStones128", repeat: 2, ao: true },
  { key: "da-voi", id: "Rock030", repeat: 1.5, ao: true },
  { key: "reu", id: "Moss001", repeat: 2, ao: true },
  { key: "go-lim", id: "Wood051", repeat: 1.5, tint: "#8a6b4a" },
  { key: "ngoi", id: "RoofingTiles002", repeat: 2, tint: "#6b7484" },
  { key: "ngoc", id: "Marble022", repeat: 1, roughness: 0.25, tint: "#f1e9d8" },
  { key: "thep", id: "Metal007", repeat: 1.5, metal: true, roughness: 0.45, tint: "#c9d3dc" },
  { key: "lua", id: "Fabric030", repeat: 2, tint: "#efe6d4" },
];

function pbr(def: MaterialDef): THREE.MeshStandardMaterial {
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

function withUv1(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = geometry.getAttribute("uv");
  if (uv !== undefined) geometry.setAttribute("uv1", uv);
  return geometry;
}

// Field: paved limestone 40 × 26 m, the surround in mountain ground.
const field = new THREE.Mesh(withUv1(new THREE.PlaneGeometry(40, 26, 1, 1)), pbr({ key: "field", id: "PavingStones128", repeat: 9, ao: true }));
field.rotation.x = -Math.PI / 2;
field.position.set(0, 0, -5);
field.receiveShadow = true;
view.layers.ground.add(field);
const surround = new THREE.Mesh(withUv1(new THREE.PlaneGeometry(160, 120, 1, 1)), pbr({ key: "surround", id: "Rock035", repeat: 24, ao: true, tint: "#9aa3a6" }));
surround.rotation.x = -Math.PI / 2;
surround.position.set(0, -0.05, -5);
surround.receiveShadow = true;
view.layers.ground.add(surround);

// Back row: eight spheres (r 1.6 m) at z −9; tiles 3 × 3 m at z −3 under each.
const sphereGeometry = withUv1(new THREE.SphereGeometry(1.6, 64, 48));
const tileGeometry = withUv1(new THREE.BoxGeometry(3, 0.25, 3));
MATERIALS.forEach((def, i) => {
  const x = -14 + i * 4;
  const material = pbr(def);
  const sphere = new THREE.Mesh(sphereGeometry, material);
  sphere.position.set(x, 1.6, -9);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  sphere.name = "sphere-" + def.key;
  const tile = new THREE.Mesh(tileGeometry, material);
  tile.position.set(x, 0.125, -3);
  tile.castShadow = true;
  tile.receiveShadow = true;
  tile.name = "tile-" + def.key;
  view.layers.actors.add(sphere, tile);
});

// Front row: 18 % grey ball, chrome ball, and the colour chart of the reserved signals (canon §21.1) with the stone palette.
const grey = new THREE.Mesh(sphereGeometry, new THREE.MeshStandardMaterial({ color: "#7f7f7f", roughness: 0.6, metalness: 0 }));
grey.position.set(-12, 1.6, 3);
grey.castShadow = true;
const chrome = new THREE.Mesh(sphereGeometry, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.05, metalness: 1 }));
chrome.position.set(-8, 1.6, 3);
chrome.castShadow = true;
view.layers.actors.add(grey, chrome);
const CHART = [COLOURS.danger, COLOURS.urgent, COLOURS.money, COLOURS.typing, "#5f6a72", "#7a8a7a", "#3b2f27", "#f1e9d8"];
const chipGeometry = new THREE.BoxGeometry(1.6, 0.2, 1.6);
CHART.forEach((hex, i) => {
  const chip = new THREE.Mesh(chipGeometry, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0 }));
  chip.position.set(-4 + i * 2, 0.1, 3);
  chip.castShadow = true;
  chip.receiveShadow = true;
  view.layers.actors.add(chip);
});

// Environment: the HDRI for image-based light and reflections (the kit's RoomEnvironment is off, environment: 0).
new RGBELoader().load(ASSETS + hdriName, (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(stage.renderer);
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = envIntensity;
  hdr.dispose();
  pmrem.dispose();
  (window as unknown as { __icLookdevReady?: boolean }).__icLookdevReady = true;
});

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  view.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
