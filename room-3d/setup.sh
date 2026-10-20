#!/usr/bin/env bash
# Clones image-blaster next to this folder and drops the prepared my-room world into it.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-$HERE/image-blaster}"

if [ ! -d "$TARGET/.git" ]; then
  git clone https://github.com/neilsonnn/image-blaster "$TARGET"
fi

mkdir -p "$TARGET/worlds"
cp -R "$HERE/worlds/my-room" "$TARGET/worlds/"
cp "$HERE/blast.mjs" "$TARGET/blast-my-room.mjs"

if [ ! -f "$TARGET/.env" ]; then
  cp "$TARGET/.env.example" "$TARGET/.env"
  echo "Created $TARGET/.env - paste your WORLD_LABS_API_KEY and FAL_KEY into it."
fi

echo "Ready: $TARGET/worlds/my-room"
echo "Next:  cd \"$TARGET\" && node blast-my-room.mjs        (or run 'claude' and say: blast my-room)"
