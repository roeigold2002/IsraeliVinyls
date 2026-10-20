"""Crops each prop out of its best source photo (boxes in crops.json) for TripoSR.

Run: python make_crops.py <source-dir> <crops-json> <out-dir>
"""
import json
import sys
from pathlib import Path

from PIL import Image

src, boxes, out = Path(sys.argv[1]), json.loads(Path(sys.argv[2]).read_text()), Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
for pid, (image, box) in boxes.items():
    Image.open(src / f"{image}.jpg").crop(box).save(out / f"{pid}.png")
print(f"{len(boxes)} crops -> {out}")
