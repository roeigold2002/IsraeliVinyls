"""Packs the locally built room + props into image-blaster's worlds/my-room layout.

  output/world/0-world.json            World Labs-shaped manifest (flip_y false: data is already Y-up)
  output/world/0-world-full_res.spz    Gaussian splat of the empty room (sampled from room.glb)
  output/world/0-world.glb             collider
  output/<id>/0-<id>.glb               props
  scene.json                           every prop placed where it stands in the photos
Run: python make_world.py <build-dir> <tsr-models-dir> <world-dir>
"""
import gzip
import json
import shutil
import struct
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, sys.path[0])
from scenesample import sample_scene  # noqa: E402

BUILD, TSR, WORLD = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
SLUG = WORLD.name
NOW = datetime.now(timezone.utc).isoformat()
W, D, H = 3.0, 3.0, 2.6
SH_C0 = 0.28209479177387814

# props generated from the photos with TripoSR; everything else (incl. the TripoSR-bodied office chair) comes from build_room.py
AI_PROPS = ["keyboard-bench", "pillow"]

HALF_PI = np.pi / 2
# (object id, position on the floor/surface, yaw, physics); props face +z before rotation.
# Props resting on other props are static: models load asynchronously, so a dynamic body can start
# falling before the collider of the thing it rests on exists. Floor-standing props stay dynamic.
LAYOUT = [
    ("computer-desk", (-1.0, 0, -1.2), 0, "static"),
    ("aerobic-step-platform", (-1.0, 0, -1.28), 0, "static"),
    ("curved-monitor", (-0.8, 0.75, -1.38), 0, "static"),
    ("gaming-laptop", (-1.24, 0.75, -1.3), 0.15, "static"),
    ("mechanical-keyboard", (-0.92, 0.75, -1.08), 0, "static"),
    ("gaming-mouse", (-0.68, 0.75, -1.06), 0, "static"),
    ("white-black-gamepad", (-1.2, 0.75, -1.02), 0.4, "static"),
    ("white-gamepad", (-0.58, 0.75, -1.36), -0.3, "static"),
    ("over-ear-headphones", (-1.4, 0.75, -1.15), HALF_PI, "static"),
    ("portable-speaker", (-0.6, 0.75, -1.15), HALF_PI, "static"),
    ("keyboard-x-stand", (0.05, 0, -1.28), 0, "static"),
    ("digital-piano-keyboard", (0.05, 0.802, -1.3), 0, "static"),
    ("mini-fridge", (1.25, 0, -1.25), -HALF_PI, "static"),
    ("single-bed", (1.03, 0, -0.06), 0, "static"),
    ("pillow", (1.03, 0.56, -0.82), 0, "static"),
    ("wooden-tv-stand", (1.25, 0, 1.21), -HALF_PI, "static"),
    ("flat-screen-tv", (1.25, 0.6, 1.21), -HALF_PI, "static"),
    ("keyboard-bench", (0.55, 0, 1.28), np.pi, "rigidbody"),
    ("pedestal-fan", (-0.05, 0, 1.3), np.pi, "rigidbody"),
    ("office-chair", (-0.15, 0, 0.92), np.pi, "rigidbody"),
    ("rolled-exercise-mat", (-0.62, 0, 1.38), np.pi, "rigidbody"),
    ("yoga-block", (-0.88, 0, 1.36), np.pi, "rigidbody"),
    ("yoga-block", (-0.88, 0.076, 1.36), np.pi + 0.15, "rigidbody"),
    ("hex-dumbbell", (-0.95, 0, 1.12), 0.2, "rigidbody"),
    ("hex-dumbbell", (-0.75, 0, 1.12), -0.1, "rigidbody"),
]


def quat_z_to(n):
    """(w, x, y, z) rotating +z onto each normal."""
    w = 1.0 + n[:, 2]
    q = np.stack([w, -n[:, 1], n[:, 0], np.zeros(len(n))], 1)
    flip = w < 1e-6
    q[flip] = [0, 1, 0, 0]
    return q / np.linalg.norm(q, axis=1, keepdims=True)


def room_gaussians():
    room = trimesh.load(BUILD / "room.glb", force="scene")
    dense = {n: 0.004 for n in room.graph.nodes_geometry if n.startswith(("poster", "window-shutter", "figure-shelves"))}
    pts, nrm, col, sp, node = sample_scene(room, spacing=0.012, density=dense)
    # drop wall splats hidden behind posters so the (large) wall splats cannot bleed through them
    behind = np.zeros(len(pts), bool)
    for name in dense:
        if name.startswith("window"):
            continue
        lo, hi = pts[node == name].min(0) - 0.012, pts[node == name].max(0) + 0.012
        behind |= (node != name) & np.all((pts > lo) & (pts < hi), axis=1)
    pts, nrm, col, sp = pts[~behind], nrm[~behind], col[~behind], sp[~behind]
    # cheap ambient occlusion: darken where two surfaces meet (wall/floor/ceiling seams, corners)
    d = np.stack([pts[:, 1], H - pts[:, 1], pts[:, 0] + W / 2, W / 2 - pts[:, 0], pts[:, 2] + D / 2, D / 2 - pts[:, 2]], 1)
    d = np.sort(np.abs(d), axis=1)[:, 1]
    ao = 1 - 0.22 * np.exp(-d / 0.14)
    rgb = np.clip(col / 255.0 * ao[:, None], 0, 1)
    # random sampling leaves gaps; oversized, overlapping splats keep the background from showing through
    # (dense detail regions get tighter splats so the posters stay sharp)
    k = np.where(sp < 0.006, 0.85, 1.35)
    scale = np.stack([sp * k, sp * k, np.full(len(sp), 0.0015)], 1)
    return pts, rgb, scale, quat_z_to(nrm), np.full(len(pts), 0.99)


def write_spz(path, pts, rgb, scale, quat, alpha):
    n, frac = len(pts), 12
    fixed = np.round(pts * (1 << frac)).astype(np.int32)
    pos = np.stack([fixed & 0xFF, (fixed >> 8) & 0xFF, (fixed >> 16) & 0xFF], -1).astype(np.uint8).reshape(n, 9)
    to_u8 = lambda v: np.clip(np.round(v), 0, 255).astype(np.uint8)  # noqa: E731
    alphas = to_u8(alpha * 255)
    colors = to_u8(((rgb - 0.5) / SH_C0) * (0.15 * 255) + 127.5)
    scales = to_u8((np.log(scale) + 10.0) * 16.0)
    q = quat[:, [1, 2, 3, 0]] * np.where(quat[:, :1] < 0, -1, 1)  # x, y, z, w with w >= 0
    rots = to_u8(q[:, :3] * 127.5 + 127.5)
    header = struct.pack("<IIIBBBB", 0x5053474E, 2, n, 0, frac, 0, 0)
    body = header + pos.tobytes() + alphas.tobytes() + colors.tobytes() + scales.tobytes() + rots.tobytes()
    path.write_bytes(gzip.compress(body, 9))


def write_ply(path, pts, rgb, scale, quat, alpha):
    n = len(pts)
    props = ["x", "y", "z", "nx", "ny", "nz", "f_dc_0", "f_dc_1", "f_dc_2", "opacity",
             "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"]
    head = "ply\nformat binary_little_endian 1.0\nelement vertex %d\n" % n
    head += "".join(f"property float {p}\n" for p in props) + "end_header\n"
    a = np.clip(alpha, 1e-4, 1 - 1e-4)
    data = np.concatenate([pts, np.zeros((n, 3)), (rgb - 0.5) / SH_C0, np.log(a / (1 - a))[:, None],
                           np.log(scale), quat], 1).astype("<f4")
    path.write_bytes(head.encode() + data.tobytes())


def main():
    world_dir = WORLD / "output" / "world"
    world_dir.mkdir(parents=True, exist_ok=True)
    g = room_gaussians()
    write_spz(world_dir / "0-world-full_res.spz", *g)
    write_ply(BUILD / "room-splat.ply", *g)
    shutil.copy(BUILD / "room-collider.glb", world_dir / "0-world.glb")
    manifest = {
        "world_id": f"local-{SLUG}-0",
        "display_name": SLUG,
        "model": "local-procedural (free, built from the source photos)",
        "assets": {
            "mesh": {"collider_mesh_url": "0-world.glb"},
            "imagery": {"pano_url": ""},
            "splats": {"spz_urls": {"full_res": "0-world-full_res.spz"},
                       "semantics_metadata": {"metric_scale_factor": 1, "ground_plane_offset": 0, "flip_y": False}},
            "thumbnail_url": "",
            "caption": "Empty 3 m x 3 m bedroom rebuilt from the photos: white walls, beige tile floor, window with roller shutter, door, posters, shelf display.",
        },
        "world_marble_url": "",
        "tags": ["local", "free"],
        "world_prompt": None,
        "created_at": NOW,
        "updated_at": NOW,
    }
    (world_dir / "0-world.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"splat: {len(g[0])} gaussians, {(world_dir / '0-world-full_res.spz').stat().st_size / 1e6:.1f} MB")

    installed = set()
    for pid in {p for p, *_ in LAYOUT}:
        src = TSR / f"{pid}.glb" if pid in AI_PROPS else BUILD / "props" / f"{pid}.glb"
        if not src.exists():
            print("missing model:", pid)
            continue
        dest = WORLD / "output" / pid
        if not (dest / "object.json").exists():
            print("no object.json for", pid)
            continue
        shutil.copy(src, dest / f"0-{pid}.glb")
        if pid in AI_PROPS and (TSR / f"{pid}-cutout.png").exists():
            shutil.copy(TSR / f"{pid}-cutout.png", dest / f"0-{pid}.png")
        installed.add(pid)

    counts = {}
    instances = []
    for pid, pos, yaw, physics in LAYOUT:
        if pid not in installed:
            continue
        counts[pid] = counts.get(pid, 0) + 1
        instances.append({"instanceId": f"{pid}-{counts[pid]}", "objectId": pid, "assetId": f"{SLUG}/{pid}/0",
                          "physics": physics, "position": [round(float(v), 4) for v in pos],
                          "rotation": [0, round(float(yaw), 4), 0], "scale": [1, 1, 1]})
    scene = {"version": 1, "instances": instances, "sun": {"intensity": 1.2, "rotation": [-0.9, 0.6, 0], "environmentIntensity": 1.0},
             "metricScaleFactor": 1, "groundPlaneOffset": 0, "groundPlaneColliderEnabled": True}
    (WORLD / "scene.json").write_text(json.dumps(scene, indent=2) + "\n")
    print(f"props installed: {len(installed)}, placed instances: {len(instances)}")


if __name__ == "__main__":
    main()
