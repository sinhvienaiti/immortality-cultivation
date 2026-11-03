"""
Builds a weapon's textured LOD (the mid-distance skill swords: the rain, the river, the halo; owner 03/11/2026,
"rõ ràng chúng ta đã có hình ảnh kiếm r, sao hình bạn dùng trong skill lại như kiểu là tự style ra vậy") from its
full GLB, at build time, from files already on disk (no download):

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/models/blender/swarm_lod.py -- \\
      --input art-src/lab/models/weapons/clear-wind.glb --out art-src/lab/models/weapons/clear-wind-swarm.glb \\
      [--tris 3200] [--tex 1024] [--seam-factor 0] [--normal keep|bake] \\
      [--sheet tmp/shots/real-swords/lod/sheet.png] [--report tmp/shots/real-swords/lod/report.json]

What it keeps (MODEL_QUALITY §2 rule 3: the real material, never a flat tint): the mesh's UVs and their seams, the
base colour and ORM (occlusion, roughness, metalness) maps downsized to `--tex`, and a normal map: the original
one downsized (`keep`), or baked in Cycles from the full model's shading normal onto the LOD (`bake`, exported with
tangents so three reads the bake's tangent frame). Before 03/11 this LOD had no UVs, material or texture, so every
swarm sword drew as a flat tinted shape.

How: the Tripo mesh comes split along its UV seams; it is welded first (an edge collapse tears a split surface
open) and decimated by edge collapse to `--tris` (2,500–4,000 asked). Blender's collapse carries every loop's UV
across a collapse, so the islands and their seams stay where the textures expect them. `--seam-factor` can also
weight the seam vertices (the decimate modifier's inverted vertex group), but on Clear Wind any weight stalled the
collapse at ~4,400 triangles and the unweighted LOD already lands its texture right, so it is off by default. The
hollow ring's hole is a hole in the mesh, which an edge collapse does not close.

Clear Wind, 03/11/2026 (tmp/shots/real-swords/lod/report.json): 14,728 → 3,200 triangles (1,588 welded vertices,
2,067 UV-seam edges), base colour, ORM and normal 4096 → 1024, 1.37 MB. Full against LOD rendered and shrunk to a
sword length of 120 / 60 / 30 px: RMSE 1.5 / 0.9 / 0.6 % broadside, 1.3 / 0.9 / 0.6 % three-quarter; the blade, the
hollow jade ring, the cloud curls, the beads and the pommel read the same. A normal map baked from the full model
(`--normal bake`) looked the same at those sizes, so the original map is kept.

`--sheet` renders the full model and the LOD side by side in EEVEE under the lab's lookdev light (sun, hemisphere,
key and rim of src/lab/look.ts and src/view/renderer.ts, the misty_pines HDRI at 0.45, exposure 0.72, Khronos PBR
Neutral), broadside and three-quarter from above, and writes `<sheet>-full-*.png` / `<sheet>-lod-*.png` at a sword
length of 1,400 px; ImageMagick then shrinks them to 120, 60 and 30 px for the check. The output GLB is media
(art-src/ is ignored by Git; never commit it).
"""
import argparse
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

LOOKDEV_HDRI = "art-src/lab/lookdev/misty_pines_2k.hdr"


def parse():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--tris", type=int, default=3200)
    parser.add_argument("--tex", type=int, default=1024)
    parser.add_argument("--seam-factor", type=float, default=0.0, help="extra collapse cost on UV-seam vertices (0: none)")
    parser.add_argument("--normal", default="keep", choices=["keep", "bake"])
    parser.add_argument("--bake-samples", type=int, default=8)
    parser.add_argument("--sheet", default="")
    parser.add_argument("--report", default="")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def joined_mesh():
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit("no mesh in the input")
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    # Bake the node transform: the LOD must sit exactly where the full mesh does.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def weld_and_mark_seams(obj):
    """Welds the seam-split mesh and puts every vertex on a UV seam (or an open edge) in the group "seams"."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    uv = bm.loops.layers.uv.active
    seam_edges = 0
    for e in bm.edges:
        if len(e.link_loops) != 2 or uv is None:
            continue
        l1, l2 = e.link_loops
        # Two faces share the edge's UVs on both sides, or the edge is a seam.
        a1 = l1[uv].uv
        b1 = l1.link_loop_next[uv].uv
        a2 = l2.link_loop_next[uv].uv
        b2 = l2[uv].uv
        if (a1 - a2).length > 1e-5 or (b1 - b2).length > 1e-5:
            e.seam = True
            seam_edges += 1
    bm.verts.index_update()
    on_seam = {v.index for v in bm.verts if any(e.seam or len(e.link_loops) != 2 for e in v.link_edges)}
    bm.to_mesh(me)
    bm.free()
    group = obj.vertex_groups.new(name="seams")
    group.add([i for i in range(len(me.vertices)) if i in on_seam], 1.0, "REPLACE")
    return seam_edges, len(on_seam)


def decimate(obj, target, seam_factor):
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris()
    bpy.ops.object.mode_set(mode="OBJECT")
    before = triangles(obj)
    passes = []
    # One collapse pass stops short of its ratio on this mesh (its UV-split loops refuse some collapses): a few
    # passes, each asked for what is left, until within 3 % of the target.
    for _ in range(6):
        now = triangles(obj)
        if now <= target * 1.03:
            break
        mod = obj.modifiers.new("lod", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = max(0.001, target / now)
        mod.use_collapse_triangulate = True
        if seam_factor > 0:
            # Blender adds length × (2 − w1 − w2) × factor to an edge's cost: inverted, the seam vertices (weight 1)
            # cost more to collapse, so UV islands keep their outlines.
            mod.vertex_group = "seams"
            mod.invert_vertex_group = True
            mod.vertex_group_factor = seam_factor
        bpy.ops.object.modifier_apply(modifier=mod.name)
        passes.append(triangles(obj))
        if passes[-1] >= now:
            break
    print("DECIMATE_PASSES", passes)
    # Fresh normals: smooth by angle, so the blade's flats stay flat and its edges sharp.
    if obj.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    return before, triangles(obj)


def tex_node(material, kind):
    """The image node feeding the principled BSDF's base colour, the ORM (through Separate Color) or the normal map."""
    nt = material.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")

    def upstream_image(socket):
        stack = [socket]
        while stack:
            s = stack.pop()
            for link in s.links:
                n = link.from_node
                if n.type == "TEX_IMAGE":
                    return n
                stack.extend(i for i in n.inputs if i.is_linked)
        return None

    if kind == "color":
        return upstream_image(bsdf.inputs["Base Color"])
    if kind == "orm":
        return upstream_image(bsdf.inputs["Roughness"])
    return upstream_image(bsdf.inputs["Normal"])


def downsize_textures(material, size):
    out = {}
    for kind in ("color", "orm", "normal"):
        node = tex_node(material, kind)
        if node is None or node.image is None:
            continue
        img = node.image.copy()
        img.name = f"{kind}-{size}"
        img.scale(size, size)
        node.image = img
        out[kind] = list(img.size)
    return out


def bake_normal(full, lod, size, samples):
    """Cycles: the full model's shading normal (its own normal map included) onto the LOD's UVs, in tangent space."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    material = lod.data.materials[0]
    nt = material.node_tree
    target = bpy.data.images.new("normal-baked", size, size, alpha=False, float_buffer=False)
    target.colorspace_settings.name = "Non-Color"
    node = nt.nodes.new("ShaderNodeTexImage")
    node.image = target
    nt.nodes.active = node
    # The LOD must not read its own (old) normal map while it is the bake target.
    normal_tex = tex_node(material, "normal")
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    for link in list(bsdf.inputs["Normal"].links):
        nt.links.remove(link)
    bpy.ops.object.select_all(action="DESELECT")
    full.select_set(True)
    lod.select_set(True)
    bpy.context.view_layer.objects.active = lod
    span = max(full.dimensions)
    bake = scene.render.bake
    bake.use_selected_to_active = True
    bake.cage_extrusion = span * 0.004
    bake.max_ray_distance = span * 0.012
    bake.margin = 8
    bake.normal_space = "TANGENT"
    bpy.ops.object.bake(type="NORMAL")
    # Wire the baked map back in place of the old one.
    if normal_tex is not None:
        normal_tex.image = target
        nmap = next((n for n in nt.nodes if n.type == "NORMAL_MAP"), None)
        if nmap is not None:
            nt.links.new(normal_tex.outputs["Color"], nmap.inputs["Color"])
            nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    nt.nodes.remove(node)
    target.pack()
    return [size, size]


# ── Sheet ────────────────────────────────────────────────────────────────────


def blade_axis(obj):
    """Long axis index, the sign toward the tip (the end farther from the widest slice: the ring guard)."""
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    ext = [max(v[i] for v in vs) - min(v[i] for v in vs) for i in range(3)]
    a = ext.index(max(ext))
    lo = min(v[a] for v in vs)
    n = 48
    width = [0.0] * n
    o1, o2 = (a + 1) % 3, (a + 2) % 3
    mins = [[math.inf, math.inf] for _ in range(n)]
    maxs = [[-math.inf, -math.inf] for _ in range(n)]
    for v in vs:
        s = min(n - 1, int((v[a] - lo) / ext[a] * n))
        for k, o in enumerate((o1, o2)):
            mins[s][k] = min(mins[s][k], v[o])
            maxs[s][k] = max(maxs[s][k], v[o])
    for s in range(n):
        if maxs[s][0] >= mins[s][0]:
            width[s] = max(maxs[s][0] - mins[s][0], maxs[s][1] - mins[s][1])
    guard = width.index(max(width))
    return a, (1 if guard < n / 2 else -1)


def lay_flat(obj):
    """Turns the sword so its tip points +X and its flat faces −Y (the sheet camera), centred at the origin."""
    a, sign = blade_axis(obj)
    if a != 2:
        raise SystemExit("expected the blade along Blender Z (glTF Y)")
    # The glTF importer leaves objects in quaternion mode, where rotation_euler does nothing.
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = (0.0, math.radians(90 * sign), 0.0)
    bpy.context.view_layer.update()
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mid = sum(bb, Vector()) / 8
    obj.location -= mid
    bpy.context.view_layer.update()


def lookdev_world(scene, hdri, env):
    """The lab's image-based light (misty_pines × env) plus IC_LIGHTS' hemisphere (0.45, sky ivory over ink indigo) as a sky gradient."""
    world = bpy.data.worlds.new("lookdev")
    world.use_nodes = True
    nt = world.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    env_tex = nt.nodes.new("ShaderNodeTexEnvironment")
    env_tex.image = bpy.data.images.load(os.path.abspath(hdri))
    bg_env = nt.nodes.new("ShaderNodeBackground")
    bg_env.inputs["Strength"].default_value = env
    nt.links.new(env_tex.outputs["Color"], bg_env.inputs["Color"])
    # Hemisphere: radiance = mix(ground, sky, 0.5 + 0.5·up) × intensity / π (three's hemisphere irradiance into a Lambert BRDF).
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = -1
    ramp.inputs["From Max"].default_value = 1
    nt.links.new(sep.outputs["Z"], ramp.inputs["Value"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (0.0203, 0.0513, 0.0782, 1)  # #39414f in linear
    mix.inputs[7].default_value = (0.8388, 0.807, 0.7157, 1)  # #ece8dc in linear
    nt.links.new(ramp.outputs["Result"], mix.inputs["Factor"])
    bg_hemi = nt.nodes.new("ShaderNodeBackground")
    bg_hemi.inputs["Strength"].default_value = 0.45 / math.pi
    nt.links.new(mix.outputs[2], bg_hemi.inputs["Color"])
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(bg_env.outputs["Background"], add.inputs[0])
    nt.links.new(bg_hemi.outputs["Background"], add.inputs[1])
    nt.links.new(add.outputs["Shader"], out.inputs["Surface"])
    scene.world = world


def lookdev_lights(scene, cam_rot):
    """Sun, key and rim of the lab (look.ts applyLook, renderer.ts IC_LIGHTS) as the play camera sees them, turned onto the sheet camera."""
    tilt = math.radians(55)
    # The play camera (three, y up) looks north and 55° down: its right, forward and up in the world.
    right = Vector((1, 0, 0))
    fwd = Vector((0, -math.sin(tilt), -math.cos(tilt)))
    up = Vector((0, math.cos(tilt), -math.sin(tilt)))
    lights = (
        ("Sun", (1.0, 0.945, 0.863), 1.4, Vector((26, 34, -18))),
        ("Key", (1.0, 0.957, 0.886), 0.35, Vector((-18, 34, 22))),
        ("Rim", (0.725, 0.78, 0.863), 0.3, Vector((6, 14, -30))),
    )
    for name, colour, energy, towards in lights:
        d = towards.normalized()
        # In the play camera's view: x right, y up, z toward the viewer.
        v = Vector((d.dot(right), d.dot(up), -d.dot(fwd)))
        data = bpy.data.lights.new(name, "SUN")
        data.color = colour
        data.energy = energy
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        # Onto the sheet camera (Blender: camera looks down its −Z, +Y up, +X right).
        w = cam_rot @ Vector((v.x, v.y, v.z))
        obj.rotation_euler = w.normalized().to_track_quat("Z", "Y").to_euler()


def render_views(obj, base, length_px, views):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    try:
        scene.view_settings.view_transform = "Khronos PBR Neutral"
    except TypeError:
        scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = math.log2(0.72)
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    length = max(v.x for v in bb) - min(v.x for v in bb)
    margin = 1.06
    scene.render.resolution_x = int(length_px * margin)
    scene.render.resolution_y = int(length_px * margin * 0.34)
    cam_data = bpy.data.cameras.new("sheet")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = length * margin
    cam = bpy.data.objects.new("sheet", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    out = {}
    for name, roll_deg in views:
        # The camera turns round the sword's long axis (X): 0 broadside from −Y, 45 three-quarter from above.
        r = math.radians(roll_deg)
        cam.location = Vector((0, -math.cos(r) * length * 2, math.sin(r) * length * 2))
        cam.rotation_euler = (math.radians(90) - r, 0, 0)
        bpy.context.view_layer.update()
        scene.render.filepath = f"{base}-{name}.png"
        bpy.ops.render.render(write_still=True)
        out[name] = scene.render.filepath
    return out, cam


def render_sheet(full, lod, path, lookdev_root):
    scene = bpy.context.scene
    base, _ = os.path.splitext(path)
    lookdev_world(scene, os.path.join(lookdev_root, LOOKDEV_HDRI), 0.45)
    cam_rot = Matrix.Rotation(math.radians(90), 3, "X")
    lookdev_lights(scene, cam_rot)
    out = {}
    for tag, obj, other in (("full", full, lod), ("lod", lod, full)):
        other.hide_render = True
        obj.hide_render = False
        lay_flat(obj)
        views, cam = render_views(obj, f"{base}-{tag}", 1400, (("broadside", 0), ("threeq", 45)))
        out[tag] = views
        bpy.data.objects.remove(cam)
    full.hide_render = False
    return out


def main():
    args = parse()
    root = os.getcwd()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.input))
    full = joined_mesh()
    full.name = "full"
    full_tris = triangles(full)
    lod = full.copy()
    lod.data = full.data.copy()
    lod.name = "lod"
    bpy.context.scene.collection.objects.link(lod)
    # The LOD's own material (its textures are swapped for smaller copies; the full model keeps its own).
    lod.data.materials[0] = full.data.materials[0].copy()
    seam_edges, seam_verts = weld_and_mark_seams(lod)
    welded, after = decimate(lod, args.tris, args.seam_factor)
    lod.vertex_groups.clear()
    tex = downsize_textures(lod.data.materials[0], args.tex)
    baked = None
    if args.normal == "bake":
        baked = bake_normal(full, lod, args.tex, args.bake_samples)
    select_only(lod)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(args.out),
        export_format="GLB",
        use_selection=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=args.normal == "bake",
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_apply=True,
        export_yup=True,
    )
    report = {
        "input": args.input,
        "out": args.out,
        "trianglesFull": full_tris,
        "trianglesWelded": welded,
        "trianglesLod": after,
        "uvSeamEdges": seam_edges,
        "seamVertices": seam_verts,
        "seamFactor": args.seam_factor,
        "textures": tex,
        "normal": args.normal,
        "bakedNormal": baked,
        "vertsLod": len(lod.data.vertices),
        "bytes": os.path.getsize(args.out),
    }
    if args.sheet:
        os.makedirs(os.path.dirname(os.path.abspath(args.sheet)), exist_ok=True)
        report["sheet"] = render_sheet(full, lod, os.path.abspath(args.sheet), root)
    if args.report:
        os.makedirs(os.path.dirname(os.path.abspath(args.report)), exist_ok=True)
        with open(args.report, "w") as f:
            json.dump(report, f, indent=1)
    print("SWARM_LOD", json.dumps(report))


main()
