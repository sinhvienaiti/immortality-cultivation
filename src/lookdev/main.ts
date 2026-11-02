/**
 * Lookdev page (/lookdev.html, dev-only, not built): the material standard of
 * Thanh Thạch Ải rendered by the game's own renderer (camera 55°, fog, tone
 * mapping, bloom of the tier), so every later concept or source image is
 * judged against what the game can really show (plan §0.1, JUDGING.md "kết
 * luận sau ba vòng"; owner approved 02/11). Eight CC0 PBR materials
 * (ambientCG) on spheres and flat tiles over the paved field, an 18 % grey
 * ball, a chrome ball and a colour chart of the reserved signal colours, lit
 * by a Poly Haven HDRI (CC0) plus one sun from the north-east (lab/look.ts).
 * Flags: ?q=low|medium|high|ultra (tier), ?hdri=misty|sky, ?sun=0..4,
 * ?env=0..2, ?exposure=0.3..1.5, ?bloom=0..1, ?shadow=0|1.
 */
import * as THREE from "three";
import { COLOURS } from "../content/rules";
import type { Quality } from "../content/types";
import { applyLook, buildField, pbr, withUv1, type MaterialDef } from "../lab/look";
import { createRenderer } from "../view/renderer";

const params = new URLSearchParams(location.search);
const quality = (["low", "medium", "high", "ultra"].includes(params.get("q") ?? "") ? params.get("q") : "high") as Quality;

const host = document.getElementById("ic-lookdev");
if (host === null) throw new Error("lookdev host missing");
const view = createRenderer(host, quality);
const look = applyLook(view, {
  hdri: params.get("hdri") === "sky" ? "sky" : "misty",
  sun: Number(params.get("sun") ?? "1.4"),
  env: Number(params.get("env") ?? "0.45"),
  exposure: Number(params.get("exposure") ?? "0.72"),
  bloom: Number(params.get("bloom") ?? "0.45"),
  shadows: params.get("shadow") !== "0",
});
buildField(view);

/** The eight materials of the standard (MAP1_CONCEPT §5), by ambientCG set. */
const MATERIALS: readonly (MaterialDef & { readonly key: string })[] = [
  { key: "lat-da", id: "PavingStones128", repeat: 2, ao: true },
  { key: "da-voi", id: "Rock030", repeat: 1.5, ao: true },
  { key: "reu", id: "Moss001", repeat: 2, ao: true },
  { key: "go-lim", id: "Wood051", repeat: 1.5, tint: "#8a6b4a" },
  { key: "ngoi", id: "RoofingTiles002", repeat: 2, tint: "#6b7484" },
  { key: "ngoc", id: "Marble022", repeat: 1, roughness: 0.25, tint: "#f1e9d8" },
  { key: "thep", id: "Metal007", repeat: 1.5, metal: true, roughness: 0.45, tint: "#c9d3dc" },
  { key: "lua", id: "Fabric030", repeat: 2, tint: "#efe6d4" },
];

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

void look.ready.then(() => {
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
