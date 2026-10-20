# room-3d: my room, ready for a 3D game

The bedroom from my 10 photos, rebuilt in 3D in the [image-blaster](https://github.com/neilsonnn/image-blaster) world format, plus plain GLB files that load into any engine. **No paid API was used.** Everything was built locally: geometry and textures from the photos, local TripoSR (CPU) for organic shapes, and ffmpeg for sounds.

## What's here

| path | what it is |
| --- | --- |
| `game/my-room-furnished.glb` | the whole room with all 25 props in place. One file for Unity, Unreal, Godot, Blender or Three.js |
| `game/my-room-empty.glb` | just the room shell: textured walls, tile floor, ceiling, window with roller shutter, door, posters, figure-shelf photo |
| `game/my-room-collider.glb` | invisible box collider for floor, walls and ceiling |
| `worlds/my-room/` | the image-blaster project: drop it into `image-blaster/worlds/` and it opens in the viewer as a walkable world |
| `worlds/my-room/output/world/0-world-full_res.spz` | Gaussian splat of the empty room (~500k splats, 2.9 MB) |
| `worlds/my-room/output/<prop>/0-<prop>.glb` | 23 separate props in real-world meters, each with 3 impact sounds in `sfx/` |
| `worlds/my-room/scene.json` | where every prop stands (matches the photos), with physics type |
| `worlds/my-room/output/sfx/0-ambient-loop.mp3` | 10 s seamless room tone (fridge hum) |
| `worlds/my-room/source/` + `image.json` | the 10 photos and the literal scene analysis everything was built from |
| `free-pipeline/` | the scripts that build all of the above; `./free-pipeline/rebuild.sh` regenerates it |

Units are meters, Y is up, the floor's center is the origin, and the room is 3 m × 3 m × 2.6 m.

## Walk around it in image-blaster

```bash
cd room-3d
./setup.sh                    # clones image-blaster into room-3d/image-blaster and copies worlds/my-room in
cd image-blaster && bun install && bun run dev
# open http://localhost:5173/my-room  (WASD to walk, right-drag to look)
```

## The room (top view)

```
              window (roller shutter)
   +------------------------------------------+
   | desk + monitor,  | piano on X stand |fridge|
   | laptop, pads...  |                  +------+
   |                                     |      |
 d | shelf photo +                       | bed  |
 o | film poster                         |      |
 o |                                     +------+
 r |  dumbbells, mat, blocks  chair  fan  bench  TV |
   +------------------------------------------+
```

## How each part was made

- **Room shell**: modeled to measurements read off the photos. The posters, figure shelves and laptop and monitor screens are perspective-corrected crops of the photos. The floor tile and wall colors are sampled from them.
- **Props**: the boxy and simple ones (desk, bed, fridge, piano and stand, TV and stand, monitor, laptop, keyboard, mouse, gamepads, headphones, speaker, fan, step, yoga block, dumbbell) are modeled to their real sizes and colored from the photos. The exercise mat carries its real print.
- **TripoSR (local, free)**: the keyboard bench, the pillow, and the office chair's backrest and seat (on a modeled five-star base). TripoSR also ran on the small desk items, but their photo crops are only about 100 px, so those results were replaced by the modeled versions.
- **Splat**: the empty room mesh, sampled into Gaussians and written as SPZ, so the viewer renders it like a World Labs world (`flip_y: false`, since the data is already Y-up).
- **Sounds**: synthesized with ffmpeg: room-tone loop, plus wood, plastic, metal, soft and heavy impacts matched to each prop.

Physics in `scene.json`: floor-standing props (chair, bench, fan, mat, blocks, dumbbells) are rigid bodies you can push and grab. Things resting on other props are static, because the viewer loads models asynchronously and a dynamic monitor would fall before the desk's collider exists. Furniture is static.

## Limits

- Accuracy is "same room, same layout", not a scan. Positions and sizes are estimated from 10 phone photos, to within about 10–20 cm.
- The figure collection is too small in the photos (40–70 px per figure) for 3D, so it's a photo on the wall. `collectible-vinyl-figure` and `anime-figure-statue` have no models.
- The clothes pile, sandals, cables, phone and power strip were left out.
- The splat is generated from the rebuilt mesh, not trained from the photos, so it looks clean and slightly "CG" rather than photoreal.

## Optional: the paid image-blaster route

`blast.mjs` / `setup.sh` still run image-blaster's paid generators (World Labs Marble world, FAL Hunyuan3D props, ElevenLabs SFX) once `WORLD_LABS_API_KEY` and `FAL_KEY` are in `image-blaster/.env`. Existing outputs are skipped, so with the free build in place this only generates the two figure props. Pass `--regenerate` to the underlying scripts to replace the free assets.

## Rebuild

```bash
./free-pipeline/rebuild.sh              # ~2 min, CPU only, reuses free-pipeline/triposr/*.glb
./free-pipeline/rebuild.sh --triposr    # also re-runs TripoSR locally (downloads ~2.5 GB of models)
```

Tweak layouts in `free-pipeline/make_world.py` (`LAYOUT`), prop shapes in `free-pipeline/build_room.py` (`props()`), and crop boxes in `free-pipeline/crops.json`.
