/**
 * Baked ground light (docs/games/tu-tien/PERF_BUDGET.md §9 item 2, round 3, 15/11/2026). The paved field and the rock
 * surround are MeshStandardMaterial (colour, normal, roughness and AO maps, tiled 6× and 24×) lit by the hemisphere, the
 * key and rim lights, the HDRI (IBL), the sun (with the beasts' shadows) and up to three point lights (blows). On a flat
 * plane the static light of a texel depends only on that texel (its normal-mapped normal, its AO), never on where the tile
 * lies, so it is baked once per tile:
 * - `static`: the diffuse light of the hemisphere, the key and rim lights and the IBL, with the normal map and the AO;
 * - `sun`: the sun's diffuse light, with the normal map, before its shadow.
 * Both are drawn by the ground's own material (a clone with the same maps, its tiling set to one), rendered in UV space
 * (the vertex shader puts each texel where its uv is), so the light is three's own maths, not a copy of it.
 * Two run-time materials:
 * - `baked` (the one to use): the ground's own MeshStandardMaterial with the baked static diffuse light in place of the
 *   hemisphere, the key and rim lights and the IBL's diffuse light; the sun (diffuse and specular, shadowed), the point
 *   lights and the IBL's specular light are still computed, with the normal and roughness maps. The specular light is
 *   ~40 % of this ground's light (the sky's sheen on the paving at the play camera's angle), so it stays.
 * - `lite`: a Lambert material, static + sun baked, × the live shadow, + the point lights: much cheaper, but it drops the
 *   specular light (measured: the frame changes), so it is only a candidate for the Low tier.
 * Dev only for now: wired in the stress scene (stress-opt.ts, bakeGround) for the measurement.
 */
import * as THREE from "three";

const MAPS = ["map", "normalMap", "roughnessMap", "aoMap", "metalnessMap"] as const;

export interface BakedGround {
  readonly mesh: THREE.Mesh;
  readonly original: THREE.Material;
  readonly baked: THREE.MeshStandardMaterial;
  readonly lite: THREE.MeshLambertMaterial;
  readonly staticTarget: THREE.WebGLRenderTarget;
  readonly sunTarget: THREE.WebGLRenderTarget;
  readonly tile: [number, number];
}

/** A clone of the ground material that writes its diffuse light only, drawn in UV space (one tile, tiling 1). */
function bakeMaterial(src: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const m = src.clone();
  for (const k of MAPS) {
    const t = m[k] as THREE.Texture | null;
    if (t === null) continue;
    const c = t.clone();
    c.repeat.set(1, 1);
    c.offset.set(0, 0);
    c.updateMatrix();
    m[k] = c;
  }
  m.side = THREE.DoubleSide;
  m.depthTest = false;
  m.depthWrite = false;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n\tgl_Position = vec4( vMapUv * 2.0 - 1.0, 0.0, 1.0 );");
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", "gl_FragColor = vec4( totalDiffuse, 1.0 );");
  };
  m.customProgramCacheKey = () => "ground-bake-uv";
  return m;
}

/**
 * The run-time ground keeping its look: the ground's own material, its static diffuse light read from the bake (after
 * the AO, which the bake already holds), the hemisphere light, the shadowless directional lights and the IBL's diffuse
 * term no longer computed; the sun, the point lights and the IBL's specular term as before.
 */
function runtimeStandard(src: THREE.MeshStandardMaterial, staticTex: THREE.Texture): THREE.MeshStandardMaterial {
  const m = src.clone();
  m.name = "ground-baked";
  const begin = THREE.ShaderChunk.lights_fragment_begin;
  const a = begin.indexOf("DirectionalLight directionalLight;");
  const b = begin.indexOf("#pragma unroll_loop_end", a);
  const call = "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );";
  if (a < 0 || b < 0 || begin.indexOf(call, a) < 0 || begin.indexOf(call, a) > b) throw new Error("[ground-bake] three's light chunk changed");
  // Only the shadow-casting directional lights (three sorts them first: the sun) are still drawn.
  const dir = begin.slice(a, b).replace(call, "#if UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS\n\t\t" + call + "\n\t\t#endif");
  const patched = begin.slice(0, a) + dir + begin.slice(b) + "\nirradiance = vec3( 0.0 );\n";
  const maps = THREE.ShaderChunk.lights_fragment_maps.replace("iblIrradiance += getIBLIrradiance( geometryNormal );", "");
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBakeStatic = { value: staticTex };
    shader.fragmentShader = "uniform sampler2D uBakeStatic;\n" + shader.fragmentShader
      .replace("#include <lights_fragment_begin>", patched)
      .replace("#include <lights_fragment_maps>", maps)
      .replace("#include <aomap_fragment>", "#include <aomap_fragment>\n\treflectedLight.indirectDiffuse += texture2D( uBakeStatic, vMapUv ).rgb;");
  };
  m.customProgramCacheKey = () => "ground-baked-std";
  return m;
}

/** The Low-tier candidate: baked static light + baked sun × the live sun shadow + the point lights (no specular light). */
function liteMaterial(src: THREE.MeshStandardMaterial, staticTex: THREE.Texture, sunTex: THREE.Texture): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map: src.map, color: src.color.clone() });
  m.name = "ground-baked-lite";
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBakeStatic = { value: staticTex };
    shader.uniforms.uBakeSun = { value: sunTex };
    shader.fragmentShader = "uniform sampler2D uBakeStatic;\nuniform sampler2D uBakeSun;\n" + shader.fragmentShader
      .replace("#include <lights_fragment_begin>", `
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
IncidentLight directLight;
float sunShadow = 1.0;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 )
	DirectionalLightShadow sunLightShadow = directionalLightShadows[ 0 ];
	sunShadow = receiveShadow ? getShadow( directionalShadowMap[ 0 ], sunLightShadow.shadowMapSize, sunLightShadow.shadowIntensity, sunLightShadow.shadowBias, sunLightShadow.shadowRadius, vDirectionalShadowCoord[ 0 ] ) : 1.0;
#endif
vec3 irradiance = vec3( 0.0 );
vec3 iblIrradiance = vec3( 0.0 );
vec3 radiance = vec3( 0.0 );
vec3 clearcoatRadiance = vec3( 0.0 );
`)
      .replace("#include <lights_fragment_maps>", "")
      .replace("#include <aomap_fragment>", "")
      .replace("vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
        "vec3 outgoingLight = reflectedLight.directDiffuse + texture2D( uBakeStatic, vMapUv ).rgb + texture2D( uBakeSun, vMapUv ).rgb * sunShadow + totalEmissiveRadiance;");
  };
  m.customProgramCacheKey = () => "ground-baked-lite";
  return m;
}

/**
 * A bake target. 8-bit sRGB like the ground's own maps (4 bytes a texel): measured, a half-float bake (8 bytes) costs
 * 0.9 ms a frame to read over the whole ground at 1080p, more than the light it saves.
 */
function target(size: number, like: THREE.Texture | null): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  rt.texture.wrapS = rt.texture.wrapT = THREE.RepeatWrapping;
  rt.texture.anisotropy = like?.anisotropy ?? 1;
  return rt;
}

/**
 * Bakes `meshes` (planes lying flat, tiled maps) with the lights of `scene` as they are now: `sun` is the shadow-casting
 * directional light, `points` the blow lights (off while baking). Returns each mesh's baked material; nothing is swapped.
 */
export function bakeGround(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, meshes: readonly THREE.Mesh[]): BakedGround[] {
  const lights: THREE.Light[] = [];
  scene.traverse((o) => { if ((o as THREE.Light).isLight) lights.push(o as THREE.Light); });
  const sun = lights.find((l) => (l as THREE.DirectionalLight).isDirectionalLight && l.castShadow) as THREE.DirectionalLight | undefined;
  const intensity = new Map(lights.map((l) => [l, l.intensity]));
  const hidden: THREE.Object3D[] = [];
  for (const c of scene.children) if (!(c as THREE.Light).isLight && c.visible) { hidden.push(c); c.visible = false; }
  const env = scene.environment;
  const was = renderer.getRenderTarget();
  const clear = renderer.getClearColor(new THREE.Color());
  const alpha = renderer.getClearAlpha();
  const autoShadow = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);
  const out: BakedGround[] = [];
  try {
    for (const mesh of meshes) {
      const src = mesh.material as THREE.MeshStandardMaterial;
      const map = src.map;
      const size = (map?.image as { width?: number } | undefined)?.width ?? 1024;
      const geo = (mesh.geometry as THREE.PlaneGeometry).parameters;
      const rep = map?.repeat ?? new THREE.Vector2(1, 1);
      const tile: [number, number] = [geo.width / rep.x, geo.height / rep.y];
      const plane = new THREE.PlaneGeometry(tile[0], tile[1]);
      plane.setAttribute("uv1", plane.getAttribute("uv"));
      const bake = new THREE.Mesh(plane, bakeMaterial(src));
      bake.rotation.copy(mesh.rotation);
      bake.position.copy(mesh.position);
      bake.frustumCulled = false;
      scene.add(bake);
      const staticTarget = target(size, map);
      const sunTarget = target(size, map);
      // Static: everything but the sun and the blow lights.
      for (const l of lights) l.intensity = l === sun || (l as THREE.PointLight).isPointLight ? 0 : intensity.get(l)!;
      renderer.setRenderTarget(staticTarget);
      renderer.clear();
      renderer.render(scene, camera);
      // Sun: the sun alone (no IBL), no shadow (the live one multiplies it).
      for (const l of lights) l.intensity = l === sun ? intensity.get(l)! : 0;
      scene.environment = null;
      const sunBake = bakeMaterial(src);
      bake.material = sunBake;
      renderer.setRenderTarget(sunTarget);
      renderer.clear();
      renderer.render(scene, camera);
      scene.environment = env;
      scene.remove(bake);
      plane.dispose();
      (bake.material as THREE.Material).dispose();
      out.push({ mesh, original: src, baked: runtimeStandard(src, staticTarget.texture), lite: liteMaterial(src, staticTarget.texture, sunTarget.texture), staticTarget, sunTarget, tile });
    }
  } finally {
    for (const l of lights) l.intensity = intensity.get(l)!;
    scene.environment = env;
    for (const c of hidden) c.visible = true;
    renderer.setRenderTarget(was);
    renderer.setClearColor(clear, alpha);
    renderer.shadowMap.autoUpdate = autoShadow;
  }
  return out;
}
