"""Software point-splat previews of GLBs (front + 3/4 views) into one contact sheet."""
import sys

import numpy as np
import trimesh
from PIL import Image, ImageDraw

sys.path.insert(0, sys.path[0])
from scenesample import sample_scene  # noqa: E402

out, paths = sys.argv[1], sys.argv[2:]
TILE = 220
cols = min(4, len(paths))
sheet = Image.new("RGB", (TILE * 2 * cols, (TILE + 16) * ((len(paths) + cols - 1) // cols)), (60, 60, 60))
d = ImageDraw.Draw(sheet)
for n, p in enumerate(paths):
    scene = trimesh.load(p, force="scene")
    ext = scene.extents
    pts, nrm, col, _, _ = sample_scene(scene, spacing=max(ext) / 250)
    shade = np.abs(nrm @ np.array([0.3, 0.8, 0.5])) * 0.35 + 0.65
    col = np.clip(col * shade[:, None], 0, 255).astype(np.uint8)
    for v, ang in enumerate([0, -np.pi / 4]):
        R = trimesh.transformations.rotation_matrix(ang, [0, 1, 0])[:3, :3]
        q = pts @ R.T
        lo, hi = q.min(0), q.max(0)
        s = (TILE - 20) / max(hi[0] - lo[0], hi[1] - lo[1])
        x = ((q[:, 0] - (lo[0] + hi[0]) / 2) * s + TILE / 2).astype(int)
        y = (TILE / 2 - (q[:, 1] - (lo[1] + hi[1]) / 2) * s).astype(int)
        order = np.argsort(q[:, 2])
        tile = np.full((TILE, TILE, 3), 40, np.uint8)
        ok = (x[order] >= 0) & (x[order] < TILE) & (y[order] >= 0) & (y[order] < TILE)
        o = order[ok]
        tile[y[o], x[o]] = col[o]
        sheet.paste(Image.fromarray(tile), ((n % cols) * 2 * TILE + v * TILE, (n // cols) * (TILE + 16)))
    d.text(((n % cols) * 2 * TILE + 4, (n // cols) * (TILE + 16) + TILE + 2),
           f"{p.split('/')[-1]} {ext[0]:.2f}x{ext[1]:.2f}x{ext[2]:.2f}m", fill="white")
sheet.save(out)
