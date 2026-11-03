"""
Bakes a weapon's impostor atlas: the real full model photographed for the far and tiny skill swords (key 7's far
river, K5's gate ring; owner 03/11/2026: the skill swords must be our approved sword, not code-styled stand-ins).

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/models/blender/bake_sword_impostor.py -- \\
      --input art-src/lab/models/weapons/clear-wind.glb --out art-src/lab/models/weapons --id clear-wind \\
      [--cell 512] [--rolls 0,30,60,90] [--samples 32]

One row per view round the sword's long axis (`--rolls`, degrees: 0 broadside, the flat facing the camera; 30 and
60 three-quarter from above; 90 edge-on from above), each cell `--cell` px along the sword and a quarter of that
across, the sword laid tip right (u grows pommel → tip), in EEVEE on a transparent background under the lab's
lookdev light (src/lab/look.ts: sun, hemisphere, key and rim as the play camera sees them, turning with the camera
so every row is lit alike on screen; the misty_pines HDRI at 0.45). Colour is scene-linear radiance through the
Standard view transform (sRGB, unclamped tone curve: the game's OutputPass does exposure and tone mapping), straight
alpha (three premultiplies on upload). A second atlas of the same layout holds masks (linear, Raw): R the blade's
cutting-edge field (|across| / half width, 0 at the spine, 1 at the edge, over the blade only) for the runtime's
white-hot edge line, G the blade (guard to tip).

Writes <id>-impostor.png, <id>-impostor-mask.png and <id>-impostor.json (the layout src/view/skills/real-swords.ts
reads; for the sword aura's MantleHalo, SWORD_AURA §5.2, also ringU / ringR, the jade ring's centre and outer radius
along the cell, and rollWidth, the blade's drawn width per row over the broadside row's). Media: art-src/ is ignored by
Git, never commit the output.
"""
import argparse
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

LOOKDEV_HDRI = "art-src/lab/lookdev/misty_pines_2k.hdr"


def parse():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--cell", type=int, default=512)
    parser.add_argument("--rolls", default="0,30,60,90")
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--margin", type=float, default=0.035, help="empty share of the cell's length at each end")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def joined_mesh():
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def lay_flat(obj):
    """Tip toward +X, the flat facing −Y, centred: returns the long axis' profile (the guard's place)."""
    me = obj.data
    vs = [v.co.copy() for v in me.vertices]
    ext = [max(v[i] for v in vs) - min(v[i] for v in vs) for i in range(3)]
    if ext.index(max(ext)) != 2:
        raise SystemExit("expected the blade along Blender Z (glTF Y)")
    lo = min(v.z for v in vs)
    n = 64
    width = [0.0] * n
    for v in vs:
        s = min(n - 1, int((v.z - lo) / ext[2] * n))
        width[s] = max(width[s], abs(v.x), abs(v.y))
    guard = width.index(max(width))
    sign = 1 if guard < n / 2 else -1
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = (0.0, math.radians(90 * sign), 0.0)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    bb = [Vector(c) for c in obj.bound_box]
    mid = sum(bb, Vector()) / 8
    for v in obj.data.vertices:
        v.co -= mid
    obj.data.update()


def edge_field(obj):
    """Per vertex: the blade's edge field (|z − spine| / half width at x) and a blade flag, as a colour attribute."""
    me = obj.data
    xs = [v.co.x for v in me.vertices]
    x0, x1 = min(xs), max(xs)
    n = 96
    zmin = [math.inf] * n
    zmax = [-math.inf] * n
    span = [0.0] * n
    for v in me.vertices:
        s = min(n - 1, int((v.co.x - x0) / (x1 - x0) * n))
        zmin[s] = min(zmin[s], v.co.z)
        zmax[s] = max(zmax[s], v.co.z)
    for s in range(n):
        span[s] = zmax[s] - zmin[s] if zmax[s] >= zmin[s] else 0.0
    # The guard: the widest slice; the blade starts where the width falls under twice the blade's own (past the ring).
    g = span.index(max(span))
    blade_w = span[int(n * 0.8)]
    s0 = g
    while s0 < n - 1 and span[s0] > blade_w * 1.6:
        s0 += 1
    blade_x0 = x0 + (s0 + 0.5) / n * (x1 - x0)
    attr = me.color_attributes.new("edge", "FLOAT_COLOR", "POINT")
    for i, v in enumerate(me.vertices):
        s = min(n - 1, int((v.co.x - x0) / (x1 - x0) * n))
        on = 1.0 if v.co.x >= blade_x0 else 0.0
        half = span[s] * 0.5
        mid = (zmin[s] + zmax[s]) * 0.5
        e = min(1.0, abs(v.co.z - mid) / half) if half > 1e-6 else 0.0
        attr.data[i].color = (e * on, on, 0.0, 1.0)
    return {"bladeFromU": (blade_x0 - x0) / (x1 - x0), "guardU": (g + 0.5) / n, "ringR": span[g] * 0.5 / (x1 - x0)}


def roll_widths(mask, ch, rows, u_from, u_to):
    """The blade's drawn width per row (the mask's G, blade guard to tip) over the broadside row's: the median column
    between u_from and u_to of the cell, mid-blade past the guard's decoration (SWORD_AURA §5.2: the MantleHalo's width
    per roll)."""
    w = mask.shape[1]
    c0, c1 = int(u_from * w), int(u_to * w)
    widths = []
    for row in range(rows):
        g = mask[row * ch:(row + 1) * ch, c0:c1, 1] > 0.5
        widths.append(float(np.median(g.sum(axis=0))) if g.size else 0.0)
    base = widths[0] if widths and widths[0] > 0 else 1.0
    return [round(x / base, 4) for x in widths]


def lookdev_world(scene, hdri, env):
    world = bpy.data.worlds.new("lookdev")
    world.use_nodes = True
    nt = world.node_tree
    for node in list(nt.nodes):
        nt.nodes.remove(node)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    env_tex = nt.nodes.new("ShaderNodeTexEnvironment")
    env_tex.image = bpy.data.images.load(os.path.abspath(hdri))
    bg_env = nt.nodes.new("ShaderNodeBackground")
    bg_env.inputs["Strength"].default_value = env
    nt.links.new(env_tex.outputs["Color"], bg_env.inputs["Color"])
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = -1
    ramp.inputs["From Max"].default_value = 1
    nt.links.new(sep.outputs["Z"], ramp.inputs["Value"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (0.0203, 0.0513, 0.0782, 1)
    mix.inputs[7].default_value = (0.8388, 0.807, 0.7157, 1)
    nt.links.new(ramp.outputs["Result"], mix.inputs["Factor"])
    bg_hemi = nt.nodes.new("ShaderNodeBackground")
    bg_hemi.inputs["Strength"].default_value = 0.45 / math.pi
    nt.links.new(mix.outputs[2], bg_hemi.inputs["Color"])
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(bg_env.outputs["Background"], add.inputs[0])
    nt.links.new(bg_hemi.outputs["Background"], add.inputs[1])
    nt.links.new(add.outputs["Shader"], out.inputs["Surface"])
    scene.world = world
    return world


def lookdev_lights(scene, camera):
    """The lab's sun, key and rim in the play camera's view space, parented to the camera (they turn with it)."""
    tilt = math.radians(55)
    right = Vector((1, 0, 0))
    fwd = Vector((0, -math.sin(tilt), -math.cos(tilt)))
    up = Vector((0, math.cos(tilt), -math.sin(tilt)))
    out = []
    for name, colour, energy, towards in (
        ("Sun", (1.0, 0.945, 0.863), 1.4, Vector((26, 34, -18))),
        ("Key", (1.0, 0.957, 0.886), 0.35, Vector((-18, 34, 22))),
        ("Rim", (0.725, 0.78, 0.863), 0.3, Vector((6, 14, -30))),
    ):
        d = towards.normalized()
        v = Vector((d.dot(right), d.dot(up), -d.dot(fwd)))
        data = bpy.data.lights.new(name, "SUN")
        data.color = colour
        data.energy = energy
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.parent = camera
        # Camera space: −Z ahead, +Y up, +X right; a sun's +Z points back at the light.
        obj.rotation_euler = v.normalized().to_track_quat("Z", "Y").to_euler()
        out.append(obj)
    return out


def mask_material():
    m = bpy.data.materials.new("impostor-mask")
    m.use_nodes = True
    nt = m.node_tree
    for node in list(nt.nodes):
        nt.nodes.remove(node)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "edge"
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(attr.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return m


def render_to_array(scene, path, w, h):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(path, check_existing=False)
    px = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(image)
    os.remove(path)
    return px


def save_png(path, arr, colorspace):
    h, w, _ = arr.shape
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(arr.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()


def main():
    args = parse()
    os.makedirs(args.out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.input))
    obj = joined_mesh()
    lay_flat(obj)
    layout = edge_field(obj)
    xs = [v.co.x for v in obj.data.vertices]
    length = max(xs) - min(xs)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = args.samples
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    cw = args.cell
    ch = args.cell // 4
    scene.render.resolution_x = cw
    scene.render.resolution_y = ch
    scene.render.resolution_percentage = 100
    lookdev_world(scene, os.path.join(os.getcwd(), LOOKDEV_HDRI), 0.45)
    cam_data = bpy.data.cameras.new("impostor")
    cam_data.type = "ORTHO"
    # The sword spans [margin, 1 − margin] of the cell's length.
    cam_data.ortho_scale = length / (1 - 2 * args.margin)
    cam_data.clip_start = 0.01
    cam_data.clip_end = length * 8
    cam = bpy.data.objects.new("impostor", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    lookdev_lights(scene, cam)
    rolls = [float(r) for r in args.rolls.split(",")]
    lit = np.zeros((ch * len(rolls), cw, 4), dtype=np.float32)
    mask = np.zeros_like(lit)
    tmp = os.path.join(args.out, "_impostor_tile.png")
    real = obj.data.materials[0]
    masked = mask_material()
    for row, roll in enumerate(rolls):
        r = math.radians(roll)
        cam.location = Vector((0, -math.cos(r) * length * 3, math.sin(r) * length * 3))
        cam.rotation_euler = (math.radians(90) - r, 0, 0)
        bpy.context.view_layer.update()
        # Row 0 at the top of the image (numpy rows run bottom-up in Blender's pixel order: flip at the end).
        y0 = row * ch
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.exposure = 0
        obj.data.materials[0] = real
        lit[y0:y0 + ch] = np.flipud(render_to_array(scene, tmp, cw, ch))
        try:
            scene.view_settings.view_transform = "Raw"
        except TypeError:
            scene.view_settings.view_transform = "Standard"
        obj.data.materials[0] = masked
        mask[y0:y0 + ch] = np.flipud(render_to_array(scene, tmp, cw, ch))
    obj.data.materials[0] = real
    # Blender's pixel buffers start at the bottom row.
    base = os.path.join(args.out, args.id + "-impostor")
    save_png(base + ".png", np.flipud(lit), "sRGB")
    save_png(base + "-mask.png", np.flipud(mask), "Non-Color")
    meta = {
        "id": args.id,
        "source": args.input,
        "cellW": cw,
        "cellH": ch,
        "rolls": rolls,
        # Pommel end and tip of the sword along the cell (share of its length), and its length in the model (m).
        "u0": args.margin,
        "u1": 1 - args.margin,
        "lengthM": length,
        "guardU": args.margin + layout["guardU"] * (1 - 2 * args.margin),
        "bladeFromU": args.margin + layout["bladeFromU"] * (1 - 2 * args.margin),
        "ringU": args.margin + layout["guardU"] * (1 - 2 * args.margin),
        "ringR": layout["ringR"] * (1 - 2 * args.margin),
        "rollWidth": roll_widths(np.flipud(mask), ch, len(rolls), 0.5, 0.75),
        "light": "lab lookdev (sun 1.4, key 0.35, rim 0.3, hemisphere 0.45, misty_pines 0.45), camera-relative",
    }
    with open(base + ".json", "w") as f:
        json.dump(meta, f, indent=1)
    print("SWORD_IMPOSTOR", json.dumps(meta))


main()
