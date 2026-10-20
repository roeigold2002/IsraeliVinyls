#!/usr/bin/env bash
# Rebuilds worlds/my-room and game/ from the photos, for free, on CPU.
#   ./rebuild.sh             reuse the committed TripoSR meshes in triposr/
#   ./rebuild.sh --triposr   regenerate them with TripoSR (downloads ~2.5 GB of models, ~2 min per prop)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOM="$(dirname "$HERE")"
WORK="$HERE/.work"
WORLD="$ROOM/worlds/my-room"
mkdir -p "$WORK"

if [ ! -x "$WORK/venv/bin/python" ]; then
  python3 -m venv "$WORK/venv"
  "$WORK/venv/bin/pip" install -q -r "$HERE/requirements.txt"
fi
PY="$WORK/venv/bin/python"

if [ "${1:-}" = "--triposr" ]; then
  [ -d "$WORK/tsr-src" ] || git clone -q --depth 1 https://github.com/VAST-AI-Research/TripoSR "$WORK/tsr-src"
  # TripoSR imports torchmcubes (needs a compiler); swap in PyMCubes
  "$PY" - "$WORK/tsr-src/tsr/models/isosurface.py" <<'EOF'
import sys
p = sys.argv[1]
s = open(p).read()
if "import mcubes" not in s:
    s = s.replace("from torchmcubes import marching_cubes\n", """import mcubes


def marching_cubes(level, threshold):
    v, f = mcubes.marching_cubes(level.cpu().numpy(), threshold)
    v = v[:, [2, 1, 0]]
    return torch.from_numpy(v.astype(np.float32)), torch.from_numpy(f.astype(np.int64))
""")
    open(p, "w").write(s)
EOF
  "$PY" "$HERE/make_crops.py" "$WORLD/source" "$HERE/crops.json" "$WORK/crops"
  cp "$HERE/heights.json" "$WORK/heights.json"
  mkdir -p "$WORK/models"
  # one process per prop keeps peak memory down
  for p in office-chair keyboard-bench pillow; do "$PY" "$HERE/tsr_run.py" "$WORK" "$p"; done
  cp "$WORK"/models/{office-chair,keyboard-bench,pillow}{.glb,-cutout.png} "$HERE/triposr/"
fi

"$PY" "$HERE/build_room.py" "$WORLD/source" "$WORK/build" "$HERE/triposr"
"$PY" "$HERE/make_world.py" "$WORK/build" "$HERE/triposr" "$WORLD"
"$PY" "$HERE/make_sfx.py" "$WORLD"
"$PY" "$HERE/export_game.py" "$WORLD" "$WORK/build" "$ROOM/game"
