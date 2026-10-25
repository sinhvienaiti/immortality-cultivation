"""
Bakes a rigged GLB into a vertex animation texture for the crowd (canon §20.3,
PB-34; the format "ic-vat-1" that src/view/vat.ts reads):

  * positions and normals as half floats, RGBA, one texel per vertex per
    frame: texel = frame × vertices + vertex, wrapped row by row in a texture
    1 024 or 2 048 wide (never "column = vertex": a 3 000-triangle mesh can pass
    2 048 vertices once its UV seams are split);
  * the clip table (first frame, frames, fps, loop) in the JSON;
  * the rest mesh: uint32 triangle indices and float32 UVs in the .bin, its
    positions are frame 0 of the first clip.

  ~/.local/blender/blender-5.2.3-linux-x64/blender -b --factory-startup -P scripts/models/blender/bake_vat.py -- \\
      --input art-src/models/beasts/phong-lang.glb --out public/assets/immortality-cultivation/vat \\
      --id phong-lang-high --clips Idle,Move,Attack,Death [--loop Idle,Move] [--fps 30] \\
      [--lod-tris 3000] [--width 1024|2048]

`--clips` lists the model contract's clip names in order (canon §21.2: Idle,
Move, Attack, Death); `Name=Action` maps one to an action of another name
(e.g. Move=Hero_Fly). `--lod-tris` decimates the skinned mesh first (canon
§20.2: 1 000 / 1 800 / 3 000 by tier). Output in glTF axes (+Y up, the model's
nose +Z), metres. The baked files belong in public/assets/ or tmp/, never in
Git (AGENTS.md).
"""
import argparse
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix

MAX_ROWS = 2048


def parse():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--clips", required=True, help="Idle,Move,Attack,Death or Name=Action pairs, in order")
    parser.add_argument("--loop", default="Idle,Move", help="clips that loop (the others hold their last frame)")
    parser.add_argument("--fps", type=float, default=30.0)
    parser.add_argument("--lod-tris", type=int, default=0, help="decimate the skinned mesh to at most this many triangles (0: keep)")
    parser.add_argument("--width", type=int, default=0, choices=[0, 1024, 2048], help="texture width (0: the narrower that fits)")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def clip_list(text):
    out = []
    for item in text.split(","):
        item = item.strip()
        if not item:
            continue
        name, _, action = item.partition("=")
        out.append((name.strip(), (action or name).strip()))
    return out


def find_action(name):
    action = bpy.data.actions.get(name)
    if action is not None:
        return action
    # A substring match lets "_V2" suffixes and importer prefixes pass (as the model contract does).
    for candidate in bpy.data.actions:
        if name in candidate.name:
            return candidate
    raise SystemExit("no action named %r (have: %s)" % (name, ", ".join(a.name for a in bpy.data.actions)))


def skinned_mesh(scene):
    meshes = [obj for obj in scene.objects if obj.type == "MESH" and any(m.type == "ARMATURE" for m in obj.modifiers)]
    if not meshes:
        raise SystemExit("no skinned mesh (a mesh with an Armature modifier) in the file")
    others = [obj.name for obj in scene.objects if obj.type == "MESH" and obj not in meshes]
    if others:
        print("ignored unskinned meshes:", ", ".join(others))
    if len(meshes) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active if len(meshes) > 1 else meshes[0]
    armature = next(m.object for m in mesh.modifiers if m.type == "ARMATURE")
    return mesh, armature


def triangles_of(mesh):
    mesh.data.calc_loop_triangles()
    return len(mesh.data.loop_triangles)


def decimate(mesh, target):
    """Collapse the rest mesh (before the armature) to at most `target` triangles; weights are kept."""
    tris = triangles_of(mesh)
    if target <= 0 or tris <= target:
        return tris
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    if mesh.data.shape_keys is not None:
        # A modifier cannot be applied over shape keys; the crowd's VAT has no use for them.
        print("removed shape keys:", ", ".join(k.name for k in mesh.data.shape_keys.key_blocks))
        bpy.ops.object.shape_key_remove(all=True)
    ratio = target / tris
    for _ in range(6):
        modifier = mesh.modifiers.new("Lod", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_move_to_index(modifier="Lod", index=0)
        bpy.ops.object.modifier_apply(modifier="Lod")
        tris = triangles_of(mesh)
        if tris <= target:
            break
        ratio = target / tris * 0.98
    return tris


# Blender (+Z up, nose −Y in a glTF import) → glTF (+Y up, nose +Z): (x, y, z) → (x, z, −y).
TO_GLTF = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))


def split_vertices(mesh):
    """One output vertex per (vertex, UV) pair of the triangles, in first-seen order: the VAT's vertex order."""
    data = mesh.data
    data.calc_loop_triangles()
    uv_layer = data.uv_layers.active
    keys = {}
    source = []
    uvs = []
    index = []
    for tri in data.loop_triangles:
        for loop in tri.loops:
            vertex = data.loops[loop].vertex_index
            if uv_layer is not None:
                u, v = uv_layer.data[loop].uv
                key = (vertex, round(u, 6), round(v, 6))
            else:
                u, v = 0.0, 0.0
                key = (vertex, 0.0, 0.0)
            at = keys.get(key)
            if at is None:
                at = len(source)
                keys[key] = at
                source.append(vertex)
                # glTF's v runs down the image.
                uvs.append((u, 1.0 - v))
            index.append(at)
    return np.array(source, dtype=np.int64), np.array(uvs, dtype=np.float32), np.array(index, dtype=np.uint32)


def sample_pose(mesh, depsgraph, source):
    """Positions and normals of the evaluated (skinned) mesh in glTF axes, per output vertex."""
    evaluated = mesh.evaluated_get(depsgraph)
    data = evaluated.to_mesh()
    count = len(data.vertices)
    co = np.empty(count * 3, dtype=np.float64)
    nrm = np.empty(count * 3, dtype=np.float64)
    data.vertices.foreach_get("co", co)
    try:
        data.vertices.foreach_get("normal", nrm)
    except (AttributeError, TypeError, RuntimeError):
        data.vertex_normals.foreach_get("vector", nrm)
    evaluated.to_mesh_clear()
    world = TO_GLTF @ evaluated.matrix_world
    rotation = np.array(world.to_3x3().inverted().transposed())
    co = co.reshape(-1, 3)[source]
    nrm = nrm.reshape(-1, 3)[source]
    points = co @ np.array(world.to_3x3()).T + np.array(world.translation)
    normals = nrm @ rotation.T
    lengths = np.linalg.norm(normals, axis=1, keepdims=True)
    normals = normals / np.maximum(lengths, 1e-9)
    return points, normals


def main():
    args = parse()
    os.makedirs(args.out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.input))
    scene = bpy.context.scene
    mesh, armature = skinned_mesh(scene)
    source_tris = triangles_of(mesh)
    tris = decimate(mesh, args.lod_tris)
    source, uvs, index = split_vertices(mesh)
    vertices = len(source)

    # Only the clip being baked plays: the importer's NLA tracks would blend on top.
    animation = armature.animation_data or armature.animation_data_create()
    for track in list(animation.nla_tracks):
        animation.nla_tracks.remove(track)
    animation.action_extrapolation = "HOLD"
    animation.action_blend_type = "REPLACE"
    animation.action_influence = 1.0
    loops = {name.strip() for name in args.loop.split(",") if name.strip()}
    scene_fps = scene.render.fps / scene.render.fps_base

    clips = []
    poses = []
    frames = 0
    for name, action_name in clip_list(args.clips):
        action = find_action(action_name)
        animation.action = action
        slots = getattr(action, "slots", None)
        if slots and getattr(animation, "action_slot", None) is None:
            animation.action_slot = slots[0]
        start, end = action.frame_range
        seconds = max(1.0 / args.fps, (end - start) / scene_fps)
        loop = name in loops
        # A loop's last key repeats its first: bake [0, seconds); a one-shot bakes its last frame too.
        count = max(1, round(seconds * args.fps)) + (0 if loop else 1)
        for k in range(count):
            frame = start + (k / args.fps) * scene_fps
            whole = math.floor(frame)
            scene.frame_set(int(whole), subframe=frame - whole)
            poses.append(sample_pose(mesh, bpy.context.evaluated_depsgraph_get(), source))
        clips.append({"name": name, "start": frames, "frames": count, "fps": args.fps, "loop": loop})
        print("clip %s <- %s: %d frames (%.2f s, %s)" % (name, action.name, count, seconds, "loop" if loop else "once"))
        frames += count

    width = args.width
    if width == 0:
        width = 1024 if math.ceil(vertices * frames / 1024) <= MAX_ROWS else 2048
    rows = math.ceil(vertices * frames / width)
    if rows > MAX_ROWS:
        raise SystemExit("%d vertices x %d frames need %d rows at width %d (max %d): lower --lod-tris or --fps" % (vertices, frames, rows, width, MAX_ROWS))
    positions = np.zeros((width * rows, 4), dtype=np.float16)
    normals = np.zeros((width * rows, 4), dtype=np.float16)
    lo = np.full(3, np.inf)
    hi = np.full(3, -np.inf)
    for frame, (points, frame_normals) in enumerate(poses):
        at = frame * vertices
        positions[at:at + vertices, :3] = points
        positions[at:at + vertices, 3] = 1.0
        normals[at:at + vertices, :3] = frame_normals
        lo = np.minimum(lo, points.min(axis=0))
        hi = np.maximum(hi, points.max(axis=0))

    bin_name = args.id + ".vat.bin"
    blobs = [positions.tobytes(), normals.tobytes(), index.astype("<u4").tobytes(), uvs.astype("<f4").tobytes()]
    offsets = []
    at = 0
    for blob in blobs:
        offsets.append(at)
        at += len(blob)
    with open(os.path.join(args.out, bin_name), "wb") as handle:
        for blob in blobs:
            handle.write(blob)
    meta = {
        "format": "ic-vat-1",
        "id": args.id,
        "vertices": int(vertices),
        "frames": int(frames),
        "width": int(width),
        "rows": int(rows),
        "triangles": int(len(index) // 3),
        "clips": clips,
        "min": [round(float(v), 5) for v in lo],
        "max": [round(float(v), 5) for v in hi],
        "sections": {
            "positions": {"offset": offsets[0], "bytes": len(blobs[0])},
            "normals": {"offset": offsets[1], "bytes": len(blobs[1])},
            "index": {"offset": offsets[2], "count": int(len(index))},
            "uv": {"offset": offsets[3], "count": int(uvs.size)},
        },
        "bin": bin_name,
        "source": {"input": os.path.basename(args.input), "triangles": int(source_tris), "decimated": int(tris), "fps": args.fps},
    }
    with open(os.path.join(args.out, args.id + ".vat.json"), "w", encoding="utf-8") as handle:
        json.dump(meta, handle, indent=1)
    texture_mb = width * rows * 8 * 2 / (1024 * 1024)
    print("vat %s: %d -> %d triangles, %d vertices, %d frames, %d x %d (%.2f MB), in %s" % (args.id, source_tris, tris, vertices, frames, width, rows, texture_mb, args.out))


main()
