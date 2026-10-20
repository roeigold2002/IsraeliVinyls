"""Engine-ready exports: one furnished GLB (room + every prop placed per scene.json), plus room-only files.

Run: python export_game.py <world-dir> <build-dir> <out-dir>
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import trimesh

WORLD, BUILD, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
OUT.mkdir(parents=True, exist_ok=True)

furnished = trimesh.load(BUILD / "room.glb", force="scene")
scene = json.loads((WORLD / "scene.json").read_text())
for inst in scene["instances"]:
    pid = inst["objectId"]
    prop = trimesh.load(next((WORLD / "output" / pid).glob("0-*.glb")), force="scene")
    # same convention as the image-blaster viewer: the model's bottom-center sits on the placement point
    lo, hi = prop.bounds
    T = trimesh.transformations.translation_matrix(inst["position"])
    T = T @ trimesh.transformations.euler_matrix(*inst["rotation"], axes="sxyz")
    T = T @ trimesh.transformations.translation_matrix([-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2])
    for node in prop.graph.nodes_geometry:
        M, g = prop.graph[node]
        furnished.add_geometry(prop.geometry[g], node_name=f"{inst['instanceId']}/{node}", geom_name=f"{inst['instanceId']}/{g}",
                               transform=T @ M)
furnished.export(OUT / "my-room-furnished.glb")
shutil.copy(BUILD / "room.glb", OUT / "my-room-empty.glb")
shutil.copy(BUILD / "room-collider.glb", OUT / "my-room-collider.glb")
print("furnished:", np.round(furnished.extents, 2), len(scene["instances"]), "props")
