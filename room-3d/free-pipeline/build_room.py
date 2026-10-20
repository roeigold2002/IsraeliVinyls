"""Free, local replacement for the paid image-blaster steps for worlds/my-room.

Builds (all in meters, Y up, room floor centered at the origin):
  - room.glb            textured empty room (walls, floor, ceiling, window, door, posters, shelf photo)
  - room-collider.glb   simple box collider for walls, floor and ceiling
  - props/<id>.glb      procedural props for boxy furniture, textured from the photos
Run: python build_room.py <source-dir> <out-dir>
"""
import json
import sys
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image, ImageDraw, ImageFilter
from trimesh.visual.material import PBRMaterial

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
(OUT / "props").mkdir(parents=True, exist_ok=True)
(OUT / "tex").mkdir(exist_ok=True)
RNG = np.random.default_rng(7)

W, D, H = 3.0, 3.0, 2.6  # room width (x), depth (z), height (y)
X0, X1, Z0, Z1 = -W / 2, W / 2, -D / 2, D / 2


def photo(name):
    return Image.open(SRC / f"{name}.jpg").convert("RGB")


def sample_color(name, box):
    a = np.array(photo(name).crop(box)).reshape(-1, 3)
    return tuple(int(v) for v in np.median(a, axis=0))


def rectify(name, quad, size):
    # quad = upper-left, lower-left, lower-right, upper-right in source pixels
    return photo(name).transform(size, Image.QUAD, quad, Image.BICUBIC)


C = {
    "wall": sample_color("0-fan-mat-corner", (300, 250, 700, 600)),
    "tile": sample_color("0-door-wall", (480, 1300, 640, 1420)),
    "door": sample_color("0-door-wall", (60, 420, 240, 820)),
    "laminate": sample_color("0-desk-wall-front", (470, 1120, 590, 1230)),
    "navy": sample_color("0-bed-wall-from-door", (420, 760, 700, 860)),
    "bedbase": sample_color("0-bed-wall-from-door", (300, 955, 620, 1000)),
    "wood": sample_color("0-tv-stand-chair-corner", (150, 780, 225, 900)),
    "fridge": sample_color("0-window-fridge-corner", (330, 1200, 520, 1400)),
    "step": sample_color("0-desk-wall-front", (150, 1300, 400, 1330)),
    "purple": sample_color("0-fan-mat-corner", (900, 1215, 1000, 1260)),
}
C.update({"white": (238, 238, 236), "black": (22, 22, 24), "chrome": (190, 192, 196),
          "pink": (196, 60, 120), "glass": (40, 48, 56), "frame": (232, 232, 230)})
# the photos are dim indoor snapshots; lift the wall/ceiling a little toward their real white
C["ceiling"] = tuple(min(255, int(v * 1.05)) for v in C["wall"])
# prop albedos picked by eye from the photos (the dim photo samples above land in shadow for these)
C.update({"laminate": (186, 180, 168), "bedbase": (176, 173, 166), "step": (122, 122, 120), "purple": (112, 86, 162),
          "wood": (118, 58, 42), "fridge": (226, 226, 221), "navy": (34, 44, 74)})


def save_tex(img, name):
    img.save(OUT / "tex" / f"{name}.png")
    return img


def tile_texture():
    n = 512
    base = np.array(C["tile"], np.float32)
    img = np.clip(base + RNG.normal(0, 3.5, (n, n, 1)), 0, 255)
    g = 4  # grout width in px for a 0.45 m tile
    img[:g], img[:, :g] = base * 0.8, base * 0.8
    return save_tex(Image.fromarray(img.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), "floor-tile")


def wood_texture(color, name):
    w, h = 256, 512
    base = np.array(color, np.float32)
    streak = RNG.normal(0, 1, w).cumsum()
    streak = (streak - streak.mean()) / (streak.std() + 1e-6)
    img = base * (1 + 0.06 * streak[None, :, None]) * (1 + RNG.normal(0, 0.015, (h, w, 1)))
    return save_tex(Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)), name)


def shutter_texture():
    img = Image.new("RGB", (256, 512), (205, 205, 200))
    d = ImageDraw.Draw(img)
    for y in range(0, 512, 16):
        d.line([(0, y), (256, y)], fill=(160, 160, 156), width=2)
    return save_tex(img, "roller-shutter")


def piano_keys_texture():
    whites, w, h = 36, 36 * 24, 160
    img = Image.new("RGB", (w, h), C["white"])
    d = ImageDraw.Draw(img)
    for i in range(whites + 1):
        d.line([(i * 24, 0), (i * 24, h)], fill=(150, 150, 150), width=2)
    for i in range(whites - 1):
        if i % 7 in (0, 1, 3, 4, 5):
            d.rectangle([i * 24 + 15, 0, i * 24 + 33, int(h * 0.62)], fill=C["black"])
    return save_tex(img, "piano-keys")


def music_rest_texture():
    img = Image.new("RGB", (300, 100), C["white"])
    d = ImageDraw.Draw(img)
    for x in (55, 175):
        d.rectangle([x, 15, x + 70, 85], outline=(200, 200, 198), width=6)
    return save_tex(img, "music-rest")


# ---------------------------------------------------------------- geometry

def material(color=None, rough=0.85, metal=0.0, tex=None):
    if tex is not None:
        return PBRMaterial(baseColorTexture=tex, baseColorFactor=[255, 255, 255, 255],
                           roughnessFactor=rough, metallicFactor=metal, doubleSided=False)
    return PBRMaterial(baseColorFactor=[*color, 255], roughnessFactor=rough, metallicFactor=metal)


def textured(vertices, faces, uv, mat):
    m = trimesh.Trimesh(vertices=np.asarray(vertices, float), faces=np.asarray(faces), process=False)
    m.visual = trimesh.visual.TextureVisuals(uv=np.asarray(uv, float), material=mat)
    return m


def quad(p0, p1, p2, p3, mat, uv_scale=(1.0, 1.0)):
    """p0 bottom-left, p1 bottom-right, p2 top-right, p3 top-left, seen from the front."""
    su, sv = uv_scale
    return textured([p0, p1, p2, p3], [[0, 1, 2], [0, 2, 3]], [[0, 0], [su, 0], [su, sv], [0, sv]], mat)


def box(size, center=(0, 0, 0), mat=None, rotate=None):
    sx, sy, sz = size
    b = trimesh.creation.box(extents=size)
    # unshared vertices + per-face planar UVs so textures are not smeared across box faces
    m = trimesh.Trimesh(vertices=b.vertices[b.faces].reshape(-1, 3), faces=np.arange(len(b.faces) * 3).reshape(-1, 3), process=False)
    v, n = m.vertices, b.face_normals.repeat(3, axis=0)
    ax = np.abs(n).argmax(1)
    uv = np.where(ax[:, None] == 0, v[:, [2, 1]], np.where(ax[:, None] == 1, v[:, [0, 2]], v[:, [0, 1]]))
    ext = np.array([[sz, sy], [sx, sz], [sx, sy]])[ax]
    uv = uv / ext + 0.5
    out = textured(v, m.faces, uv, mat)
    if rotate is not None:
        out.apply_transform(rotate)
    out.apply_translation(center)
    return out


def cylinder(r, h, center, mat, axis="y", sections=24):
    m = trimesh.creation.cylinder(radius=r, height=h, sections=sections)
    if axis == "x":
        m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    elif axis == "y":
        m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    m = trimesh.Trimesh(vertices=m.vertices, faces=m.faces, process=False)
    m.visual = trimesh.visual.TextureVisuals(uv=np.zeros((len(m.vertices), 2)), material=mat)
    m.apply_translation(center)
    return m


def hex_prism(r, length, center, mat):
    m = trimesh.creation.cylinder(radius=r, height=length, sections=6)
    m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    m = trimesh.Trimesh(vertices=m.vertices, faces=m.faces, process=False)
    m.visual = trimesh.visual.TextureVisuals(uv=np.zeros((len(m.vertices), 2)), material=mat)
    m.apply_translation(center)
    return m


def scene_of(parts):
    s = trimesh.Scene()
    for name, mesh in parts:
        s.add_geometry(mesh, node_name=name, geom_name=name)
    return s


# ---------------------------------------------------------------- room

def wall_with_holes(axis_pos, normal, u_range, holes, mat, tag):
    """Interior wall face split into quads around rectangular holes (u, v ranges)."""
    u0, u1 = u_range
    us = sorted({u0, u1, *[h[0] for h in holes], *[h[1] for h in holes]})
    vs = sorted({0.0, H, *[h[2] for h in holes], *[h[3] for h in holes]})
    parts = []
    for a, b in zip(us, us[1:]):
        for c, d in zip(vs, vs[1:]):
            mid_u, mid_v = (a + b) / 2, (c + d) / 2
            if any(h[0] <= mid_u <= h[1] and h[2] <= mid_v <= h[3] for h in holes):
                continue
            parts.append((a, b, c, d))
    meshes = []
    for a, b, c, d in parts:
        pts = [wall_point(axis_pos, normal, u, v) for u, v in [(a, c), (b, c), (b, d), (a, d)]]
        if normal in ("-z", "+x"):  # wind so the face points into the room
            pts = [pts[1], pts[0], pts[3], pts[2]]
        meshes.append(quad(*pts, mat, uv_scale=(abs(b - a), d - c)))
    return [(f"{tag}-{i}", m) for i, m in enumerate(meshes)]


def wall_point(axis_pos, normal, u, v):
    # walls on z planes use u = x; walls on x planes use u = z
    return (u, v, axis_pos) if normal in ("+z", "-z") else (axis_pos, v, u)


def on_wall(normal, u, v, w, h, mat, depth=0.004, name="decal"):
    """A flat rectangle (poster, switch) facing into the room, centered at (u, v) on a wall."""
    o = {"+z": (0, 0, Z0 + depth), "-z": (0, 0, Z1 - depth), "+x": (X0 + depth, 0, 0), "-x": (X1 - depth, 0, 0)}[normal]
    if normal == "+z":
        p = [(u - w / 2, v - h / 2), (u + w / 2, v - h / 2), (u + w / 2, v + h / 2), (u - w / 2, v + h / 2)]
        pts = [(x, y, o[2]) for x, y in p]
    elif normal == "-z":
        p = [(u + w / 2, v - h / 2), (u - w / 2, v - h / 2), (u - w / 2, v + h / 2), (u + w / 2, v + h / 2)]
        pts = [(x, y, o[2]) for x, y in p]
    elif normal == "+x":
        p = [(u + w / 2, v - h / 2), (u - w / 2, v - h / 2), (u - w / 2, v + h / 2), (u + w / 2, v + h / 2)]
        pts = [(o[0], y, z) for z, y in p]
    else:
        p = [(u - w / 2, v - h / 2), (u + w / 2, v - h / 2), (u + w / 2, v + h / 2), (u - w / 2, v + h / 2)]
        pts = [(o[0], y, z) for z, y in p]
    return (name, quad(*pts, mat))


def build_room():
    wall = material(C["wall"])
    parts = []
    # floor, ceiling
    parts.append(("floor", quad((X0, 0, Z1), (X1, 0, Z1), (X1, 0, Z0), (X0, 0, Z0),
                                material(tex=tile_texture(), rough=0.35), uv_scale=(W / 0.45, D / 0.45))))
    parts.append(("ceiling", quad((X0, H, Z0), (X1, H, Z0), (X1, H, Z1), (X0, H, Z1), material(C["ceiling"]))))

    # window in the desk wall (z = Z0), door in the left wall (x = X0)
    win = (0.2, 1.15, 0.9, 2.3)
    door = (0.5, 1.3, 0.0, 2.05)
    parts += wall_with_holes(Z0, "+z", (X0, X1), [win], wall, "wall-desk")
    parts += wall_with_holes(X0, "+x", (Z0, Z1), [door], wall, "wall-door")
    parts += wall_with_holes(Z1, "-z", (X0, X1), [], wall, "wall-chair")
    parts += wall_with_holes(X1, "-x", (Z0, Z1), [], wall, "wall-bed")

    # window recess, frame, glass and half-lowered roller shutter
    rec = 0.12
    frame = material(C["frame"], rough=0.4)
    u0, u1, v0, v1 = win
    parts.append(("window-sill", quad((u0, v0, Z0), (u1, v0, Z0), (u1, v0, Z0 - rec), (u0, v0, Z0 - rec), frame)))
    parts.append(("window-head", quad((u0, v1, Z0 - rec), (u1, v1, Z0 - rec), (u1, v1, Z0), (u0, v1, Z0), frame)))
    parts.append(("window-jamb-l", quad((u0, v0, Z0), (u0, v0, Z0 - rec), (u0, v1, Z0 - rec), (u0, v1, Z0), frame)))
    parts.append(("window-jamb-r", quad((u1, v0, Z0 - rec), (u1, v0, Z0), (u1, v1, Z0), (u1, v1, Z0 - rec), frame)))
    split = v0 + 0.45 * (v1 - v0)
    z = Z0 - rec
    parts.append(("window-glass", quad((u0, v0, z), (u1, v0, z), (u1, split, z), (u0, split, z), material(C["glass"], rough=0.1))))
    parts.append(("window-shutter", quad((u0, split, z), (u1, split, z), (u1, v1, z), (u0, v1, z), material(tex=shutter_texture()))))
    fw = 0.045
    for i, (a, b, c, d) in enumerate([(u0, u1, v0, v0 + fw), (u0, u1, v1 - fw, v1), (u0, u0 + fw, v0, v1),
                                      (u1 - fw, u1, v0, v1), ((u0 + u1) / 2 - fw / 2, (u0 + u1) / 2 + fw / 2, v0, split),
                                      (u0, u1, split - fw / 2, split + fw / 2)]):
        parts.append((f"window-frame-{i}", box((b - a, d - c, 0.05), ((a + b) / 2, (c + d) / 2, z + 0.03), frame)))

    # door: recessed slab, trim, lever handle
    a, b, c, d = door
    slab = box((0.04, d - c, b - a), (X0 - 0.03, (c + d) / 2, (a + b) / 2), material(tex=wood_texture(C["door"], "door-wood"), rough=0.6))
    parts.append(("door", slab))
    trim = material(C["frame"], rough=0.5)
    parts.append(("door-trim-l", box((0.02, d, 0.06), (X0 + 0.01, d / 2, a - 0.03), trim)))
    parts.append(("door-trim-r", box((0.02, d, 0.06), (X0 + 0.01, d / 2, b + 0.03), trim)))
    parts.append(("door-trim-top", box((0.02, 0.06, b - a + 0.12), (X0 + 0.01, d + 0.03, (a + b) / 2), trim)))
    chrome = material(C["chrome"], rough=0.25, metal=0.9)
    parts.append(("door-handle", box((0.06, 0.02, 0.13), (X0 + 0.02, 1.0, a + 0.12), chrome)))
    parts.append(("door-lock", cylinder(0.02, 0.02, (X0 + 0.0, 0.88, a + 0.08), chrome, axis="x")))

    # posters, switch, outlet (textures rectified from the photos)
    posters = [
        ("poster-anime-big", "+z", -0.95, 1.8, 0.86, 0.71, ("0-desk-wall-front", (100, 228, 104, 634, 590, 630, 586, 224), (800, 660))),
        ("poster-anime-fighter", "+z", -0.32, 1.62, 0.29, 0.44, ("0-desk-wall-front", (627, 410, 632, 660, 790, 658, 788, 410), (300, 460))),
        ("poster-film", "+x", -0.6, 1.55, 0.42, 0.62, ("0-desk-corner-shelves", (170, 322, 180, 712, 430, 715, 415, 322), (420, 640))),
        ("poster-memento", "-x", -0.4, 1.55, 0.3, 0.42, ("0-bed-wall-from-door", (240, 0, 256, 162, 400, 160, 402, 0), (300, 400))),
    ]
    for name, normal, u, v, w, h, (img, q, size) in posters:
        tex = save_tex(rectify(img, q, size), name)
        parts.append(on_wall(normal, u, v, w, h, material(tex=tex, rough=0.5), name=name))
    parts.append(on_wall("+x", 0.32, 1.15, 0.08, 0.08, material(C["white"]), depth=0.008, name="light-switch"))
    parts.append(on_wall("-x", -0.95, 0.62, 0.12, 0.08, material(C["white"]), depth=0.008, name="power-outlet"))

    # the floating shelves and their figures are too small in the photos to rebuild in 3D (40-70 px per figure),
    # so the rectified photo of the shelf display goes on the door wall like a poster
    shelves = save_tex(rectify("0-door-wall", (362, 325, 365, 540, 592, 538, 590, 325), (460, 430)), "figure-shelves")
    parts.append(on_wall("+x", -0.02, 1.56, 0.5, 0.47, material(tex=shelves, rough=0.6), name="figure-shelves"))

    # tile skirting strip
    sk = material(tex=Image.open(OUT / "tex" / "floor-tile.png"), rough=0.35)
    for name, size, center in [("skirt-desk", (W, 0.07, 0.008), (0, 0.035, Z0 + 0.004)),
                               ("skirt-chair", (W, 0.07, 0.008), (0, 0.035, Z1 - 0.004)),
                               ("skirt-bed", (0.008, 0.07, D), (X1 - 0.004, 0.035, 0)),
                               ("skirt-door-a", (0.008, 0.07, door[0] - Z0), (X0 + 0.004, 0.035, (Z0 + door[0]) / 2)),
                               ("skirt-door-b", (0.008, 0.07, Z1 - door[1]), (X0 + 0.004, 0.035, (Z1 + door[1]) / 2))]:
        parts.append((name, box(size, center, sk)))
    return parts


def build_collider():
    t = 0.2
    boxes = [((W + 2 * t, t, D + 2 * t), (0, -t / 2, 0)), ((W + 2 * t, t, D + 2 * t), (0, H + t / 2, 0)),
             ((W + 2 * t, H, t), (0, H / 2, Z0 - t / 2)), ((W + 2 * t, H, t), (0, H / 2, Z1 + t / 2)),
             ((t, H, D), (X0 - t / 2, H / 2, 0)), ((t, H, D), (X1 + t / 2, H / 2, 0))]
    return trimesh.util.concatenate([trimesh.creation.box(extents=s, transform=trimesh.transformations.translation_matrix(c)) for s, c in boxes])


# ---------------------------------------------------------------- procedural props (front faces +z)

def props():
    lam, chrome, black = material(C["laminate"], rough=0.6), material(C["chrome"], 0.25, 0.9), material(C["black"], 0.5)
    white = material(C["white"], 0.5)
    P = {}
    P["computer-desk"] = [
        ("top", box((1.0, 0.025, 0.6), (0, 0.7375, 0), lam)),
        ("side-panel", box((0.02, 0.725, 0.6), (0.49, 0.3625, 0), lam)),
        ("apron", box((0.96, 0.22, 0.018), (0.01, 0.615, 0.27), lam)),
        ("leg-front", cylinder(0.025, 0.725, (-0.46, 0.3625, 0.24), chrome)),
        ("leg-back", cylinder(0.025, 0.725, (-0.46, 0.3625, -0.24), chrome)),
    ]
    bar = 0.032
    ang = np.arctan2(0.76, 0.66)
    length = np.hypot(0.76, 0.66)
    rz = lambda a: trimesh.transformations.rotation_matrix(a, [0, 0, 1])  # noqa: E731
    stand = material(C["black"], 0.45, 0.5)
    P["keyboard-x-stand"] = [
        ("bar-a", box((length, bar, bar), (0, 0.4, 0.02), stand, rotate=rz(ang))),
        ("bar-b", box((length, bar, bar), (0, 0.4, -0.02), stand, rotate=rz(-ang))),
        ("pivot", cylinder(0.03, 0.08, (0, 0.4, 0), stand, axis="x")),
        ("arm-l", box((bar, bar, 0.42), (-0.33, 0.785, 0), stand)),
        ("arm-r", box((bar, bar, 0.42), (0.33, 0.785, 0), stand)),
        ("foot-l", box((bar, bar, 0.42), (-0.33, 0.016, 0), stand)),
        ("foot-r", box((bar, bar, 0.42), (0.33, 0.016, 0), stand)),
    ]
    rest_tilt = trimesh.transformations.rotation_matrix(-0.25, [1, 0, 0])
    P["digital-piano-keyboard"] = [
        ("body", box((0.95, 0.07, 0.26), (0, 0.035, 0), white)),
        ("keys", quad((-0.44, 0.0705, 0.13), (0.44, 0.0705, 0.13), (0.44, 0.0705, -0.01), (-0.44, 0.0705, -0.01),
                      material(tex=piano_keys_texture(), rough=0.4))),
        ("music-rest", box((0.62, 0.2, 0.008), (0, 0.17, -0.1), material(tex=music_rest_texture(), rough=0.5), rotate=rest_tilt)),
    ]
    screen = material(C["black"], 0.15, 0.2)
    P["flat-screen-tv"] = [
        ("panel", box((0.56, 0.34, 0.04), (0, 0.22, 0), screen)),
        ("screen", quad((-0.27, 0.06, 0.021), (0.27, 0.06, 0.021), (0.27, 0.38, 0.021), (-0.27, 0.38, 0.021), material((12, 14, 18), 0.1))),
        ("neck", box((0.06, 0.06, 0.03), (0, 0.03, 0), black)),
        ("base", box((0.26, 0.012, 0.16), (0, 0.006, 0), black)),
    ]
    wood = material(tex=wood_texture(C["wood"], "tv-stand-wood"), rough=0.5)
    P["wooden-tv-stand"] = [
        ("top", box((0.47, 0.025, 0.42), (0, 0.5875, 0), wood)),
        ("side-l", box((0.02, 0.575, 0.4), (-0.215, 0.2875, 0), wood)),
        ("side-r", box((0.02, 0.575, 0.4), (0.215, 0.2875, 0), wood)),
        ("back", box((0.41, 0.575, 0.015), (0, 0.2875, -0.1925), wood)),
        ("bottom", box((0.41, 0.02, 0.38), (0, 0.04, 0.0), wood)),
        ("shelf", box((0.41, 0.02, 0.38), (0, 0.32, 0.0), wood)),
        ("lower-front", box((0.41, 0.28, 0.018), (0, 0.18, 0.19), wood)),
        ("plinth", box((0.45, 0.04, 0.38), (0, 0.02, 0), wood)),
    ]
    rubber = material((28, 28, 30), 0.8)
    P["hex-dumbbell"] = [
        ("handle", cylinder(0.016, 0.16, (0, 0.06, 0), chrome, axis="x")),
        ("head-l", hex_prism(0.06, 0.075, (-0.115, 0.06, 0), rubber)),
        ("head-r", hex_prism(0.06, 0.075, (0.115, 0.06, 0), rubber)),
    ]
    fridge = material(C["fridge"], 0.5)
    P["mini-fridge"] = [
        ("cabinet", box((0.45, 0.5, 0.43), (0, 0.255, -0.01), fridge)),
        ("door", box((0.44, 0.49, 0.03), (0, 0.255, 0.215), fridge)),
        ("handle-recess", box((0.02, 0.18, 0.005), (0.19, 0.3, 0.232), material((205, 205, 203), 0.5))),
        ("feet", box((0.4, 0.01, 0.38), (0, 0.005, 0), black)),
    ]
    P["single-bed"] = [
        ("base", box((0.92, 0.28, 1.95), (0, 0.22, 0), material(C["bedbase"], 0.9))),
        ("mattress", box((0.9, 0.2, 1.93), (0, 0.46, 0), material(C["navy"], 0.95))),
    ] + [(f"leg-{i}", cylinder(0.025, 0.08, (x, 0.04, z), chrome)) for i, (x, z) in
         enumerate([(-0.36, -0.85), (0.36, -0.85), (-0.36, 0.85), (0.36, 0.85)])]
    P["aerobic-step-platform"] = [
        ("deck", box((0.68, 0.06, 0.27), (0, 0.12, 0), material(C["step"], 0.8))),
        ("riser-l", box((0.1, 0.09, 0.27), (-0.28, 0.045, 0), material(C["pink"], 0.7))),
        ("riser-r", box((0.1, 0.09, 0.27), (0.28, 0.045, 0), material(C["pink"], 0.7))),
    ]
    P["yoga-block"] = [("block", box((0.23, 0.075, 0.15), (0, 0.0375, 0), material(C["purple"], 0.9)))]

    laptop_screen = save_tex(rectify("0-desk-wall-front", (130, 908, 130, 1000, 283, 1000, 283, 908), (320, 200)), "laptop-screen")
    # lid and screen are built upright at the hinge line, then opened together
    hinge = trimesh.transformations.rotation_matrix(-0.3, [1, 0, 0])
    lid = box((0.36, 0.24, 0.01), (0, 0.12, 0), black)
    screen = quad((-0.165, 0.015, 0.0055), (0.165, 0.015, 0.0055), (0.165, 0.225, 0.0055), (-0.165, 0.225, 0.0055),
                  material(tex=laptop_screen, rough=0.2))
    for m in (lid, screen):
        m.apply_transform(hinge)
        m.apply_translation((0, 0.022, -0.12))
    P["gaming-laptop"] = [
        ("base", box((0.36, 0.022, 0.25), (0, 0.011, 0), black)),
        ("keyboard", quad((-0.16, 0.0225, 0.02), (0.16, 0.0225, 0.02), (0.16, 0.0225, -0.11), (-0.16, 0.0225, -0.11), material((60, 18, 22), 0.6))),
        ("lid", lid),
        ("screen", screen),
    ]

    mon_tex = save_tex(rectify("0-desk-wall-front", (305, 820, 305, 963, 532, 961, 532, 818), (480, 300)), "monitor-screen")
    segs, width, height, radius = 12, 0.62, 0.37, 1.5
    theta = width / radius
    verts, faces, uvs = [], [], []
    for i in range(segs + 1):
        t = -theta / 2 + theta * i / segs
        x, z = radius * np.sin(t), radius * (1 - np.cos(t))
        verts += [(x, 0.09, z + 0.016), (x, 0.09 + height, z + 0.016)]
        uvs += [(i / segs, 0), (i / segs, 1)]
    for i in range(segs):
        a = 2 * i
        faces += [[a, a + 2, a + 3], [a, a + 3, a + 1]]
    face = textured(verts, faces, uvs, material(tex=mon_tex, rough=0.2))
    back = face.copy()
    back.vertices[:, 2] -= 0.025
    back.faces = back.faces[:, ::-1]
    back.visual = trimesh.visual.TextureVisuals(uv=np.zeros((len(back.vertices), 2)), material=black)
    P["curved-monitor"] = [
        ("screen", face), ("back", back),
        ("neck", box((0.04, 0.2, 0.03), (0, 0.1, -0.03), black)),
        ("base", box((0.24, 0.012, 0.18), (0, 0.006, -0.02), black)),
    ]
    P.update(small_props(black, white, chrome))
    return P


def textured_cylinder(r, h, tex, u_repeat=1.0, sections=32):
    """Upright open cylinder (base at y=0) with the texture wrapped around it."""
    verts, uvs, faces = [], [], []
    for i in range(sections + 1):
        t = 2 * np.pi * i / sections
        verts += [(r * np.sin(t), 0, r * np.cos(t)), (r * np.sin(t), h, r * np.cos(t))]
        uvs += [(u_repeat * i / sections, 0), (u_repeat * i / sections, 1)]
    for i in range(sections):
        a = 2 * i
        faces += [[a, a + 2, a + 3], [a, a + 3, a + 1]]
    return textured(verts, faces, uvs, material(tex=tex, rough=0.9))


def ellipsoid(radii, center, mat, cut_bottom=True):
    m = trimesh.creation.icosphere(subdivisions=3)
    m.apply_scale(radii)
    if cut_bottom:
        m = m.slice_plane([0, 0, 0], [0, 1, 0], cap=True)
    m = trimesh.Trimesh(vertices=m.vertices, faces=m.faces, process=False)
    m.visual = trimesh.visual.TextureVisuals(uv=np.zeros((len(m.vertices), 2)), material=mat)
    m.apply_translation(center)
    return m


def keycaps_texture():
    cols, rows, k = 15, 5, 40
    img = Image.new("RGB", (cols * k, rows * k), (120, 122, 126))
    d = ImageDraw.Draw(img)
    for r in range(rows):
        for c in range(cols):
            gray = c in (0, cols - 1) or r == rows - 1 and c not in range(4, 11)
            fill = (128, 130, 136) if gray else (232, 232, 228)
            d.rounded_rectangle([c * k + 3, r * k + 3, c * k + k - 4, r * k + k - 4], 5, fill=fill)
    return save_tex(img, "keycaps")


def small_props(black, white, chrome):
    P = {}
    gray = material((128, 130, 136), 0.6)
    for pid, grip_mat, face_mat in [("white-black-gamepad", white, black), ("white-gamepad", white, white)]:
        tilt = lambda a: trimesh.transformations.rotation_matrix(a, [0, 1, 0])  # noqa: E731
        grip_l = cylinder(0.019, 0.07, (0, 0, 0), grip_mat, axis="z")
        grip_l.apply_transform(tilt(0.35))
        grip_l.apply_translation((-0.048, 0.021, 0.018))
        grip_r = cylinder(0.019, 0.07, (0, 0, 0), grip_mat, axis="z")
        grip_r.apply_transform(tilt(-0.35))
        grip_r.apply_translation((0.048, 0.021, 0.018))
        P[pid] = [
            ("body", box((0.11, 0.032, 0.055), (0, 0.024, -0.005), face_mat)),
            ("grip-l", grip_l), ("grip-r", grip_r),
            ("stick-l", cylinder(0.009, 0.014, (-0.022, 0.044, 0.008), black)),
            ("stick-r", cylinder(0.009, 0.014, (0.022, 0.044, 0.008), black)),
            ("touchpad", box((0.04, 0.003, 0.022), (0, 0.0415, -0.015), material((60, 60, 64) if face_mat is white else (40, 40, 44), 0.3))),
        ]
    P["gaming-mouse"] = [
        ("shell", ellipsoid((0.033, 0.02, 0.062), (0, 0.02, 0), black, cut_bottom=False)),
        ("rgb-strip", box((0.006, 0.004, 0.05), (0, 0.039, -0.005), material((90, 170, 255), 0.2))),
    ]
    # headband lying flat on the desk: a half ring in the XZ plane, ear cups under its two ends
    band = trimesh.creation.torus(major_radius=0.085, minor_radius=0.012, major_sections=48, minor_sections=12)
    band.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    band = band.slice_plane([0, 0, 0], [0, 0, -1], cap=False)
    band = trimesh.Trimesh(vertices=band.vertices, faces=band.faces, process=False)
    band.visual = trimesh.visual.TextureVisuals(uv=np.zeros((len(band.vertices), 2)), material=black)
    band.apply_translation((0, 0.03, 0))
    blue = material((40, 70, 160), 0.6)
    P["over-ear-headphones"] = [
        ("headband", band),
        ("cup-l", cylinder(0.045, 0.04, (-0.085, 0.02, 0.0), blue, axis="y")),
        ("cup-r", cylinder(0.045, 0.04, (0.085, 0.02, 0.0), blue, axis="y")),
    ]
    fabric = material((30, 30, 34), 0.95)
    P["portable-speaker"] = [
        ("body", cylinder(0.036, 0.16, (0, 0.036, 0), fabric, axis="x")),
        ("cap-l", cylinder(0.03, 0.012, (-0.086, 0.036, 0), material((50, 50, 54), 0.7), axis="x")),
        ("cap-r", cylinder(0.03, 0.012, (0.086, 0.036, 0), material((50, 50, 54), 0.7), axis="x")),
    ]
    P["mechanical-keyboard"] = [
        ("case", box((0.33, 0.025, 0.115), (0, 0.0125, 0), material((176, 178, 182), 0.6))),
        ("keys", quad((-0.158, 0.0335, 0.05), (0.158, 0.0335, 0.05), (0.158, 0.0335, -0.05), (-0.158, 0.0335, -0.05),
                      material(tex=keycaps_texture(), rough=0.5))),
        ("keys-body", box((0.316, 0.009, 0.1), (0, 0.029, 0), material((150, 152, 156), 0.6))),
    ]
    blade_mat = material((236, 234, 226), 0.5)
    fan = [
        ("base", cylinder(0.17, 0.03, (0, 0.015, 0), white, sections=48)),
        ("pole-low", cylinder(0.016, 0.6, (0, 0.33, 0), chrome)),
        ("pole-high", cylinder(0.02, 0.45, (0, 0.85, 0), white)),
        ("controls", box((0.06, 0.12, 0.045), (0, 0.9, 0.012), white)),
        ("motor", cylinder(0.065, 0.13, (0, 1.12, -0.07), white, axis="z")),
        ("rim-front", None), ("hub", cylinder(0.035, 0.04, (0, 1.12, 0.03), white, axis="z")),
    ]
    rim = trimesh.creation.torus(major_radius=0.21, minor_radius=0.006, major_sections=64, minor_sections=8)
    rim = trimesh.Trimesh(vertices=rim.vertices, faces=rim.faces, process=False)
    rim.visual = trimesh.visual.TextureVisuals(uv=np.zeros((len(rim.vertices), 2)), material=white)
    rim.apply_translation((0, 1.12, 0.02))
    fan[5] = ("rim", rim)
    for i in range(5):
        a = 2 * np.pi * i / 5
        blade = box((0.07, 0.17, 0.006), (0, 0.11, 0), blade_mat,
                    rotate=trimesh.transformations.rotation_matrix(0.25, [0, 1, 0]))
        blade.apply_transform(trimesh.transformations.rotation_matrix(a, [0, 0, 1]))
        blade.apply_translation((0, 1.12, 0.01))
        fan.append((f"blade-{i}", blade))
    for i in range(8):
        a = 2 * np.pi * i / 8
        spoke = box((0.004, 0.2, 0.004), (0, 0.105, 0), white)
        spoke.apply_transform(trimesh.transformations.rotation_matrix(a, [0, 0, 1]))
        spoke.apply_translation((0, 1.12, 0.045))
        fan.append((f"grill-{i}", spoke))
    P["pedestal-fan"] = fan

    # exercise mat: the photo's front view of the roll (with its ENERGYM print) wrapped around a cylinder
    mat_tex = save_tex(rectify("0-fan-mat-corner", (712, 1175, 712, 1525, 858, 1525, 858, 1175), (150, 360)), "exercise-mat")
    P["rolled-exercise-mat"] = [
        ("roll", textured_cylinder(0.075, 0.6, mat_tex, u_repeat=2.0)),
        ("top", cylinder(0.075, 0.004, (0, 0.598, 0), material((24, 52, 120), 0.9), sections=32)),
    ]
    return P


def office_chair(tsr_glb):
    """TripoSR chair body (backrest, headrest, seat) on a modeled five-star base."""
    body = trimesh.load(tsr_glb, force="mesh")
    # drop TripoSR's mushy base (faces fully below the seat) but keep the vertex colors
    keep = (body.vertices[body.faces][:, :, 1] > 0.42).any(axis=1)
    body.update_faces(keep)
    body.remove_unreferenced_vertices()
    white, black, chrome = material((232, 232, 230), 0.5), material((25, 25, 27), 0.6), material(C["chrome"], 0.25, 0.9)
    parts = [("body", body), ("gas-lift", cylinder(0.025, 0.46, (0, 0.29, 0), chrome)),
             ("hub", cylinder(0.05, 0.05, (0, 0.085, 0), white))]
    for i in range(5):
        a = 2 * np.pi * i / 5 + np.pi / 10
        leg = box((0.3, 0.03, 0.045), (0.16, 0.075, 0), white, rotate=None)
        leg.apply_transform(trimesh.transformations.rotation_matrix(a, [0, 1, 0]))
        parts.append((f"leg-{i}", leg))
        x, z = 0.3 * np.cos(a), -0.3 * np.sin(a)
        parts.append((f"caster-{i}", cylinder(0.025, 0.03, (x, 0.025, z), black, axis="x")))
    return parts


if __name__ == "__main__":
    room = scene_of(build_room())
    room.export(OUT / "room.glb")
    build_collider().export(OUT / "room-collider.glb")
    for pid, parts in props().items():
        scene_of(parts).export(OUT / "props" / f"{pid}.glb")
    tsr_dir = Path(sys.argv[3]) if len(sys.argv) > 3 else None
    if tsr_dir and (tsr_dir / "office-chair.glb").exists():
        scene_of(office_chair(tsr_dir / "office-chair.glb")).export(OUT / "props" / "office-chair.glb")
    json.dump({k: list(v) for k, v in C.items()}, open(OUT / "palette.json", "w"), indent=1)
    print("room + collider +", len(props()), "props ->", OUT)
