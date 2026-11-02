"""
Builds a weapon's swarm LOD (Thiên Hà Kiếm Vũ's 150–500 flying copies) from
its full GLB, at build time, from files already on disk (no download):

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/models/blender/swarm_lod.py -- \\
      --input art-src/lab/models/weapons/clear-wind.glb --out art-src/lab/models/weapons/clear-wind-swarm.glb \\
      [--tris 2000] [--sheet tmp/shots/clearwind/lod/sheet.png] [--report tmp/shots/clearwind/lod/report.json]

Why (MODEL_QUALITY §3, cut in order, stop once the budget holds): the swarm
already draws as one instanced mesh; the next step is an LOD for the far
copies. Measured 02/11 (lab-k5-perf.mjs, Apple M4, High 1080p, 300 swords):
the full 14,728-triangle Clear Wind put the K5 peak at p95 15.5 ms (frame
budget 12) and its share at +6.9 ms (swords and VFX sub-budget 3.5). The
hero copies, the hand prop and every close view keep the full GLB and maps.

What it keeps: the swarm draws position and normal only (the shared steel and
its blade light, kiem.ts), so the LOD has no UVs, materials or textures. A
collapse decimation to `--tris` (2,000 by default: the 2,000-triangle floor of
MODEL_QUALITY §2 although the swarm is never seen up close) keeps the outline
of the blade, the hollow ring (its hole is a hole in the mesh, which an edge
collapse does not close) and the pommel; `--sheet` renders the full mesh and
the LOD side by side, large and at 25–60 px, to check the ring still reads.
The output is media (art-src/ is ignored by Git; never commit it).
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector


def parse():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--tris", type=int, default=2000)
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


def strip(obj):
    me = obj.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    while len(me.color_attributes):
        me.color_attributes.remove(me.color_attributes[0])
    me.materials.clear()


def decimate(obj, target):
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # Tripo meshes come split along UV seams: weld them first, or the collapse tears the surface open there.
    bpy.ops.mesh.remove_doubles(threshold=1e-5)
    bpy.ops.mesh.quads_convert_to_tris()
    bpy.ops.object.mode_set(mode="OBJECT")
    before = triangles(obj)
    if before > target:
        mod = obj.modifiers.new("lod", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = max(0.001, target / before)
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # Normals: smooth by angle, so the blade's flats stay flat and its edges stay sharp.
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    return before, triangles(obj)


def holes_along_y(obj, slices=48):
    """Per slice of the long axis (Y up in Blender after the glTF import is −Y… use the longest side), the count
    of separate x-runs of vertices: the ring's slices show two runs (its two sides) when the hole is still open."""
    me = obj.data
    vs = [obj.matrix_world @ v.co for v in me.vertices]
    ext = [max(v[i] for v in vs) - min(v[i] for v in vs) for i in range(3)]
    a = ext.index(max(ext))
    lo = min(v[a] for v in vs)
    hi = max(v[a] for v in vs)
    return {"axis": "xyz"[a], "length": hi - lo, "extent": ext}


def render_sheet(full, lod, path):
    """Front and three-quarter views of the full mesh (left) and the LOD (right), Workbench, then the same
    picture shrunk so a sword is ~60 and ~25 px long (the swarm at the play camera)."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "SINGLE"
    scene.display.shading.single_color = (0.82, 0.85, 0.9)
    scene.display.shading.show_cavity = True
    scene.render.film_transparent = False
    scene.world = scene.world or bpy.data.worlds.new("w")
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1600
    scene.render.image_settings.file_format = "PNG"
    dims = full.dimensions
    length = max(dims)
    # Side by side (the glTF's +Y is Blender's +Z: the swords stand up, their flats face the camera): the LOD
    # moved right by 0.35 of the length.
    lod.location.x += length * 0.35
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = length * 1.1
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    bbox = [full.matrix_world @ Vector(c) for c in full.bound_box]
    mid = sum(bbox, Vector()) / 8
    cam.location = Vector((mid.x + length * 0.175, mid.y - length * 2, mid.z))
    cam.rotation_euler = (math.radians(90), 0, 0)
    base, ext = os.path.splitext(path)
    out = {}
    scene.render.filepath = base + "-front" + ext
    bpy.ops.render.render(write_still=True)
    out["front"] = scene.render.filepath
    return out


def main():
    args = parse()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.input))
    obj = joined_mesh()
    full_tris = triangles(obj)
    lod = obj
    if args.sheet:
        full = obj.copy()
        full.data = obj.data.copy()
        bpy.context.scene.collection.objects.link(full)
    strip(lod)
    before, after = decimate(lod, args.tris)
    info = holes_along_y(lod)
    bpy.ops.object.select_all(action="DESELECT")
    lod.select_set(True)
    bpy.context.view_layer.objects.active = lod
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(args.out),
        export_format="GLB",
        use_selection=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="NONE",
        export_apply=True,
        export_yup=True,
    )
    report = {"input": args.input, "out": args.out, "trianglesFull": full_tris, "trianglesWelded": before, "trianglesLod": after, "shape": info, "bytes": os.path.getsize(args.out)}
    if args.sheet:
        report["sheet"] = render_sheet(full, lod, os.path.abspath(args.sheet))
    if args.report:
        os.makedirs(os.path.dirname(os.path.abspath(args.report)), exist_ok=True)
        with open(args.report, "w") as f:
            json.dump(report, f, indent=1)
    print("SWARM_LOD", json.dumps(report))


main()
