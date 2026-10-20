"""Colored surface samples from a GLB scene (textures, base colors, or vertex colors)."""
import numpy as np
import trimesh


def _srgb_from_linear(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def sample_scene(path_or_scene, spacing=0.01, min_points=200, density=None):
    """Returns points (N,3), normals (N,3), colors (N,3 uint8 sRGB), per-point spacing (N,), node name per point."""
    scene = path_or_scene if isinstance(path_or_scene, trimesh.Scene) else trimesh.load(path_or_scene, force="scene")
    P, Nn, Cc, Sp, Lb = [], [], [], [], []
    for node in scene.graph.nodes_geometry:
        T, gname = scene.graph[node]
        m = scene.geometry[gname].copy()
        m.apply_transform(T)
        if m.area <= 0:
            continue
        sp = (density or {}).get(node, spacing)
        n = max(min_points, int(m.area / (sp * sp)))
        pts, fi = trimesh.sample.sample_surface(m, n)
        tri = m.triangles[fi]
        bary = trimesh.triangles.points_to_barycentric(tri, pts)
        vis = m.visual
        if vis.kind == "texture" and getattr(vis, "uv", None) is not None and vis.material is not None:
            mat = vis.material
            tex = getattr(mat, "baseColorTexture", None) or getattr(mat, "image", None)
            if tex is not None and len(vis.uv) == len(m.vertices):
                uv = (vis.uv[m.faces[fi]] * bary[:, :, None]).sum(1)
                img = np.array(tex.convert("RGB"))
                h, w = img.shape[:2]
                col = img[((1 - uv[:, 1] % 1) * (h - 1)).astype(int), ((uv[:, 0] % 1) * (w - 1)).astype(int)].astype(float)
                fac = np.array(getattr(mat, "baseColorFactor", None) if getattr(mat, "baseColorFactor", None) is not None else [255] * 4)[:3]
                col = col * (fac / 255.0)
            else:
                fac = getattr(mat, "baseColorFactor", None)
                if fac is None:
                    fac = getattr(mat, "main_color", [200, 200, 200, 255])
                col = np.tile(np.array(fac[:3], float), (len(pts), 1))
        elif vis.kind == "vertex":
            lin = (vis.vertex_colors[m.faces[fi]][:, :, :3] * bary[:, :, None]).sum(1) / 255.0
            col = _srgb_from_linear(lin) * 255  # vertex colors are stored linear
        else:
            col = np.full((len(pts), 3), 200.0)
        P.append(pts)
        Nn.append(m.face_normals[fi])
        Cc.append(np.clip(col, 0, 255).astype(np.uint8))
        Sp.append(np.full(len(pts), np.sqrt(m.area / n)))
        Lb.append(np.full(len(pts), node, dtype=object))
    return np.concatenate(P), np.concatenate(Nn), np.concatenate(Cc), np.concatenate(Sp), np.concatenate(Lb)
