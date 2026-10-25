# Source: games/space-typing/scripts/models/blender/bake_impostor.py @30ad77ef (adapted: 8 phases of a walk clip from the model's action instead of 4 wing beats, the game's tilt 55° and lights, nose glTF +Z, phase 0 in the bottom row, the meta src/view/impostor.ts reads; no LOD export: bake_vat.py decimates)
"""
Bakes a rigged GLB into an impostor atlas for the crowd (canon §20.3, PB-34):
the model photographed from `--yaws` directions round it (16) at the game
camera's tilt (`--elevation`, 55°, canon D48), at `--phases` (8) phases of one
walk cycle (the clip `--clip`, Move by the model contract), one column per
direction and one row per phase. src/view/impostor.ts draws it: a camera-facing
quad picks the column from the view angle and blends the two neighbouring
phases (4 phases would be the jerky motion the owner refuses).

  ~/.local/blender/blender-5.2.3-linux-x64/blender -b --factory-startup -P scripts/models/blender/bake_impostor.py -- \\
      --input art-src/models/beasts/phong-lang.glb --out public/assets/immortality-cultivation/impostor \\
      --id phong-lang-high [--clip Move] [--yaws 16] [--phases 8] [--tile 192] [--elevation 55]

`--clip` takes `Name=Action` as bake_vat.py does (e.g. Move=Hero_Fly). The
model's nose is glTF +Z (Blender −Y, src/content/model-contracts.ts); yaw 0 is
the tile seen from straight ahead of it, and the yaw grows with the camera's
azimuth counter-clockwise seen from above. The lights turn with the camera, as
if the model turned under the game's fixed lights (src/view/renderer.ts
IC_LIGHTS: a warm key from the south-west above, a cool rim from the north).
Writes <id>-impostor.png (sRGB, phase 0 in the bottom row) and
<id>-impostor.json; neither goes into Git (AGENTS.md).
"""
import argparse
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector


def parse():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--clip", default="Move", help="the walk clip, or Name=Action")
    parser.add_argument("--yaws", type=int, default=16)
    parser.add_argument("--phases", type=int, default=8)
    parser.add_argument("--tile", type=int, default=192)
    parser.add_argument("--elevation", type=float, default=55.0)
    parser.add_argument("--margin", type=float, default=1.12, help="empty border round the model in a tile (mipmaps never reach the next tile)")
    # Eevee needs a GPU context; in WSL's background mode it falls to software GL and takes minutes a tile.
    parser.add_argument("--engine", default="cycles", choices=["cycles", "eevee"])
    parser.add_argument("--samples", type=int, default=16, help="Cycles samples a tile")
    parser.add_argument("--threads", type=int, default=6, help="render threads (other work shares the machine)")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def find_action(name):
    action = bpy.data.actions.get(name)
    if action is not None:
        return action
    for candidate in bpy.data.actions:
        if name in candidate.name:
            return candidate
    raise SystemExit("no action named %r (have: %s)" % (name, ", ".join(a.name for a in bpy.data.actions)))


def gltf_to_blender(x, y, z):
    """glTF (+Y up, nose +Z) to Blender (+Z up, nose −Y)."""
    return Vector((x, -z, y))


def pick_engine(scene, wanted, samples):
    if wanted == "eevee":
        for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
            try:
                scene.render.engine = engine
                return engine
            except TypeError:
                continue
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 2
    scene.render.film_transparent = True
    return "CYCLES"


def render_tile(scene, temp, tile):
    scene.render.filepath = temp
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(temp, check_existing=False)
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(tile, tile, 4)
    bpy.data.images.remove(image)
    return pixels


def main():
    args = parse()
    os.makedirs(args.out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.input))
    scene = bpy.context.scene
    skinned = [obj for obj in scene.objects if obj.type == "MESH" and any(m.type == "ARMATURE" for m in obj.modifiers)]
    meshes = skinned or [obj for obj in scene.objects if obj.type == "MESH"]
    # Stray unskinned helpers (an importer's icosphere) stay out of the pictures.
    for obj in scene.objects:
        if obj.type == "MESH" and obj not in meshes:
            obj.hide_render = True
    armature = None
    for mesh in meshes:
        for modifier in mesh.modifiers:
            if modifier.type == "ARMATURE":
                armature = modifier.object

    name, _, action_name = args.clip.partition("=")
    seconds = 0.0
    start = 0.0
    scene_fps = scene.render.fps / scene.render.fps_base
    if armature is not None:
        animation = armature.animation_data or armature.animation_data_create()
        for track in list(animation.nla_tracks):
            animation.nla_tracks.remove(track)
        action = find_action((action_name or name).strip())
        animation.action = action
        slots = getattr(action, "slots", None)
        if slots and getattr(animation, "action_slot", None) is None:
            animation.action_slot = slots[0]
        start, end = action.frame_range
        seconds = (end - start) / scene_fps

    def pose(phase):
        frame = start + phase * seconds * scene_fps
        whole = math.floor(frame)
        scene.frame_set(int(whole), subframe=frame - whole)

    # The frame: the bounding sphere over every phase (wings and tails reach out).
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for phase in range(args.phases):
        pose(phase / args.phases)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        for mesh in meshes:
            evaluated = mesh.evaluated_get(depsgraph)
            data = evaluated.to_mesh()
            for vertex in data.vertices:
                p = evaluated.matrix_world @ vertex.co
                lo = Vector((min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)))
                hi = Vector((max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)))
            evaluated.to_mesh_clear()
    centre = (lo + hi) / 2
    radius = (hi - lo).length / 2

    engine = pick_engine(scene, args.engine, args.samples)
    scene.render.threads_mode = "FIXED"
    scene.render.threads = max(1, args.threads)
    scene.render.film_transparent = True
    scene.render.resolution_x = args.tile
    scene.render.resolution_y = args.tile
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    # The game's hemisphere light as a flat sky: paper ivory over ink indigo, averaged.
    world = bpy.data.worlds.new("ImpostorSky")
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (0.62, 0.62, 0.62, 1)
    background.inputs["Strength"].default_value = 1.0
    scene.world = world

    camera_data = bpy.data.cameras.new("Impostor")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = radius * 2 * args.margin
    camera_data.clip_start = 0.01
    camera_data.clip_end = radius * 12
    camera = bpy.data.objects.new("Impostor", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    # Lights ride an empty that turns with the camera: the model seems to turn under fixed lights.
    rig = bpy.data.objects.new("ImpostorLights", None)
    scene.collection.objects.link(rig)
    rig.location = centre
    # IC_LIGHTS (glTF metres, the game camera south of the field looking north = this camera at yaw 0).
    for light_name, color, energy, towards in (
        ("Key", (1.0, 0.957, 0.886), 4.2, (-18.0, 34.0, 22.0)),
        ("Rim", (0.725, 0.78, 0.863), 1.4, (6.0, 14.0, -30.0)),
    ):
        light_data = bpy.data.lights.new(light_name, "SUN")
        light_data.color = color
        light_data.energy = energy
        light = bpy.data.objects.new(light_name, light_data)
        scene.collection.objects.link(light)
        light.parent = rig
        # A sun shines down its own −Z, so its +Z points back at where it sits.
        light.rotation_euler = gltf_to_blender(*towards).normalized().to_track_quat("Z", "Y").to_euler()

    tile = args.tile
    atlas = np.zeros((args.phases * tile, args.yaws * tile, 4), dtype=np.float32)
    temp = os.path.join(args.out, "_tile.png")
    elevation = math.radians(args.elevation)
    for phase in range(args.phases):
        pose(phase / args.phases)
        for step in range(args.yaws):
            yaw = step / args.yaws * math.pi * 2
            # The camera's azimuth from the nose (glTF +Z) towards glTF +X, counter-clockwise seen from above.
            direction = gltf_to_blender(math.sin(yaw) * math.cos(elevation), math.sin(elevation), math.cos(yaw) * math.cos(elevation))
            camera.location = centre + direction * radius * 5
            camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
            rig.rotation_euler = (0.0, 0.0, yaw)
            pixels = render_tile(scene, temp, tile)
            # Blender's rows run bottom-up, as the atlas does: phase 0 is the bottom row of tiles.
            atlas[phase * tile:(phase + 1) * tile, step * tile:(step + 1) * tile] = pixels
    os.remove(temp)

    width, height = args.yaws * tile, args.phases * tile
    out_image = bpy.data.images.new(args.id + "-impostor", width=width, height=height, alpha=True)
    out_image.pixels = atlas.ravel()
    out_image.filepath_raw = os.path.join(args.out, args.id + "-impostor.png")
    out_image.file_format = "PNG"
    out_image.save()
    meta = {
        "id": args.id,
        "yaws": args.yaws,
        "phases": args.phases,
        "tile": tile,
        "elevationDeg": args.elevation,
        # Tile side in model units (the ortho frame): the quad's side for the model at scale 1.
        "frameSize": round(camera_data.ortho_scale, 5),
        # Frame centre above the model's lowest point (glTF +Y).
        "centreY": round(centre.z - lo.z, 5),
        "cycleS": round(seconds, 5),
        "image": args.id + "-impostor.png",
        "engine": engine,
    }
    with open(os.path.join(args.out, args.id + "-impostor.json"), "w", encoding="utf-8") as handle:
        json.dump(meta, handle, indent=1)
    print("impostor %s: %dx%d (%d yaws x %d phases, %s), frame %.3f, in %s" % (args.id, width, height, args.yaws, args.phases, engine, camera_data.ortho_scale, args.out))


main()
