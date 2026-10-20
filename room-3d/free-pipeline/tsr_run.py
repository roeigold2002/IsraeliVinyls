"""Local CPU image-to-3D with TripoSR: crops/<id>.png -> models/<id>.glb (vertex colors, Y-up, meters)."""
import json
import sys
import time

import numpy as np
import rembg
import torch
import trimesh
from PIL import Image
from scipy.spatial import cKDTree

FACES = 20000

S = sys.argv[1]
sys.path.insert(0, f"{S}/tsr-src")
from tsr.system import TSR  # noqa: E402
from tsr.utils import remove_background, resize_foreground  # noqa: E402

# real-world height of each prop in meters (bounding box Y after orientation)
HEIGHTS = json.load(open(f"{S}/heights.json"))

torch.set_num_threads(4)
model = TSR.from_pretrained("stabilityai/TripoSR", config_name="config.yaml", weight_name="model.ckpt")
model.renderer.set_chunk_size(8192)
session = rembg.new_session("isnet-general-use")

for name in sys.argv[2:]:
    t = time.time()
    img = remove_background(Image.open(f"{S}/crops/{name}.png").convert("RGB"), session)
    img = resize_foreground(img, 0.85)
    img.save(f"{S}/models/{name}-cutout.png")
    a = np.array(img).astype(np.float32) / 255.0
    a = a[:, :, :3] * a[:, :, 3:4] + (1 - a[:, :, 3:4]) * 0.5
    with torch.no_grad():
        codes = model([Image.fromarray((a * 255).astype(np.uint8))], device="cpu")
        mesh = model.extract_mesh(codes, True, resolution=256)[0]
    # same orientation fix TripoSR's gradio demo applies, giving a Y-up mesh facing +Z
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    # keep the largest connected piece's neighbourhood: drop tiny floating fragments
    parts = mesh.split(only_watertight=False)
    if len(parts) > 1:
        big = max(p.area for p in parts)
        mesh = trimesh.util.concatenate([p for p in parts if p.area > 0.02 * big])
    # TripoSR predicts dull colors: rescale so the mean matches the cut-out photo's foreground
    cut = np.array(img).astype(np.float32)
    fg = cut[cut[:, :, 3] > 128][:, :3]
    col = mesh.visual.vertex_colors[:, :3].astype(np.float32)
    col = np.clip(col * (fg.mean(0) / np.maximum(col.mean(0), 1)), 0, 255)
    # decimate for game use, then carry colors over from the nearest original vertex
    src_v = mesh.vertices.copy()
    if len(mesh.faces) > FACES:
        mesh = mesh.simplify_quadric_decimation(face_count=FACES)
    col = col[cKDTree(src_v).query(mesh.vertices)[1]]
    # glTF COLOR_0 is linear; convert from sRGB so engines show the photo's brightness
    c = col / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    mesh.visual = trimesh.visual.ColorVisuals(mesh, vertex_colors=np.c_[lin * 255, np.full(len(lin), 255)].astype(np.uint8))
    lo, hi = mesh.bounds
    mesh.apply_translation([-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2])
    mesh.apply_scale(HEIGHTS[name] / (hi[1] - lo[1]))
    mesh.export(f"{S}/models/{name}.glb")
    print("ok", name, f"{len(mesh.faces)} faces", f"{round(time.time() - t)}s", flush=True)
