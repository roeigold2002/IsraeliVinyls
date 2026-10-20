# room-3d — my room, prepped for IMAGE-BLASTER

My bedroom photos, analyzed and staged as an [image-blaster](https://github.com/neilsonnn/image-blaster) world (`worlds/my-room`) so it can be turned into a 3D game level: a walkable Gaussian-splat room + collider, separate 3D models for every movable prop, and sound effects.

## What's already done (free steps)

| image-blaster step | status | files |
| --- | --- | --- |
| project envelope + staged sources | done | `worlds/my-room/project.json`, `worlds/my-room/source/0-*.jpg` (10 photos) |
| uncover: per-image literal analysis | done | `worlds/my-room/source/0-*.json` (10) |
| uncover: merged scene analysis | done | `worlds/my-room/image.json` (30 object candidates) |
| confirmed objects | done | `worlds/my-room/output/<object>/object.json` (25) |
| clean plate (FAL nano-banana) | needs `FAL_KEY` | → `worlds/my-room/source/1-desk-window-wide-plate.png` |
| world splat + collider (World Labs Marble) | needs `WORLD_LABS_API_KEY` | → `worlds/my-room/output/world/` |
| 3D props (FAL Hunyuan 3D) | needs `FAL_KEY` | → `worlds/my-room/output/<object>/*.glb` |
| SFX (FAL ElevenLabs) | needs `FAL_KEY` | → `output/sfx/`, `output/<object>/sfx/` |

## Run the rest

```bash
cd room-3d
./setup.sh                      # clones image-blaster into room-3d/image-blaster and copies the world in
cd image-blaster
# put your keys in .env: WORLD_LABS_API_KEY (https://platform.worldlabs.ai/) and FAL_KEY (https://fal.ai/)
node blast-my-room.mjs          # plate -> world -> 25 props -> sfx
bun install && bun run dev      # open the viewer, pick "My Room"
```

Steps can run one at a time: `node blast-my-room.mjs plate|world|objects|sfx`, and `--only office-chair,single-bed` limits objects/sfx to specific props. Re-running resumes or skips work that already finished.

Or use image-blaster's own Claude skills: run `claude` inside `image-blaster/` and say *"blast my-room — analysis and objects are done, do the plate, world, 3d and sfx"*.

## The room (top-down, from the photos)

```
            WINDOW (roller shutter)
   +-----------------------------------+
   | desk   | piano on X stand  | fridge|
   | (step  |                   +-------+
   |  under)|                   |       |   posters: anime (desk wall),
 D |                            |  bed  |   MEMENTO (bed wall),
 O | shelves w/ figures         | (navy)|   Evangelion (door wall)
 O | + poster                   |       |
 R |                            +-------+
   |  [door]  clothes/mat/dumbbells  fan  chair  bench  TV stand
   +-----------------------------------+
```

About 3 m x 3 m, white walls, beige ceramic floor tiles, overhead light.

The world is generated from `source/0-desk-window-wide.jpg` (desk wall + window + fridge + bed), the widest single view. Marble generates the parts of the room that photo doesn't show, guided by the text prompt in `blast.mjs`, so the door wall and posters are approximate. All 10 photos are used as multi-view references when extracting each prop, so the meshes match the real items.

## Props that become separate 3D models (25)

office chair, keyboard bench, digital piano keyboard, keyboard X stand, computer desk, curved monitor, gaming laptop, mechanical keyboard, gaming mouse, white/black gamepad, white gamepad, over-ear headphones, portable speaker, aerobic step platform, mini fridge, single bed, pillow, flat-screen TV, wooden TV stand, pedestal fan, rolled exercise mat, yoga block, hex dumbbell, collectible vinyl figure, anime figure statue.

Left as candidates only (in `image.json`, `generate_as_3d_object: false`): floating wall shelf, cordless telephone, power strip, power adapter, slide sandal. To add one, create `worlds/my-room/output/<id>/object.json` (same shape as the others) and run `node blast-my-room.mjs objects --only <id>`. To drop a prop, delete its folder.

## Using it in a game

- **Room**: `output/world/N-world-*.spz` is the Gaussian splat. Render it in Three.js with Spark (`@sparkjsdev/spark`, which the image-blaster viewer uses), or in Unity, Unreal or Godot with a Gaussian-splat plugin.
- **Collision**: `output/world/N-world.glb` is the room's collider mesh. Use it as a static mesh collider (invisible) so the player walks on the floor and stops at walls.
- **Props**: each `output/<object>/N-<object>.glb` is a PBR-textured mesh (~50k faces). Use them as rigid bodies (chair, gamepads, dumbbells, figures) or static colliders (desk, bed, fridge). For lighter meshes run `node blast-my-room.mjs objects --generate-type LowPoly`.
- **Audio**: loop `output/sfx/ambient-loop-*.mp3` as room tone, and play `output/<object>/sfx/impact-*.mp3` on physics collisions.
- **Placement**: in the image-blaster viewer, drag the props into place on top of the splat and save. That writes `worlds/my-room/scene.json` with the position, rotation and scale of every prop, which you can import into your engine.
