#!/usr/bin/env node
// Runs the paid image-blaster steps for worlds/my-room from the image-blaster repo root.
// Usage: node blast-my-room.mjs [plate|world|objects|sfx|all] [--only id,id] [--concurrency 3] [--generate-type Normal|LowPoly|Geometry]
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const WORLD = "my-room";
const WD = `worlds/${WORLD}`;
const HERO = `${WD}/source/0-desk-window-wide.jpg`;

const PLATE_PROMPT =
  "remove the following from the image: laminate computer desk, curved computer monitor, black laptop, " +
  "mechanical keyboard, glowing computer mouse, white game controllers, black cylindrical speaker, patterned desk mat, " +
  "gray step platform under the desk, white digital piano keyboard, black X-shaped keyboard stand, white mini fridge " +
  "and the telephone on it, navy single bed, all black cables, power adapters, and the teal power strip on the floor";

const WORLD_PROMPT =
  "Empty small square bedroom, about 3 m by 3 m, with white painted plaster walls and beige square ceramic floor tiles " +
  "with a matching tile skirting strip. On the main wall, a large hand-painted poster of a yellow-haired anime character " +
  "with Hebrew lettering and a smaller poster of a white-haired anime fighter in orange flames hang above bare floor; at " +
  "the right end of that wall an aluminum-framed casement window with a white roller shutter stands open. The wall to the " +
  "right has a white power outlet and two small posters, one showing an illustrated instant camera. The wall to the left " +
  "has a wood-veneer door with a metal lever handle, a white light switch, two thin empty black floating shelves, and a " +
  "film poster with a pale face and blue sky. Even overhead artificial ceiling light, neutral white, soft short shadows, " +
  "clear indoor air. Photorealistic.";

const AMBIENT_PROMPT =
  "ambient environment, loop of a quiet small tiled bedroom with the low hum of a mini fridge compressor and a soft computer fan whir";

const args = process.argv.slice(2);
const step = args.find((a) => !a.startsWith("--")) || "all";
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const only = flag("only")?.split(",");
const concurrency = Number(flag("concurrency", 3));

if (!existsSync(".claude/scripts") || !existsSync(WD)) {
  console.error(`Run this from the image-blaster repo root with ${WD} present (see room-3d/setup.sh).`);
  process.exit(1);
}

function run(script, scriptArgs) {
  console.log(`\n> node ${script} ${scriptArgs.map((a) => (a.length > 60 ? `"${a.slice(0, 57)}..."` : a)).join(" ")}`);
  execFileSync("node", [script, ...scriptArgs], { stdio: "inherit" });
}

function runAsync(script, scriptArgs, label) {
  return new Promise((resolve) => {
    const child = spawn("node", [script, ...scriptArgs], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      console.log(`${code === 0 ? "done" : "FAILED"}: ${label}${code === 0 ? "" : `\n${out.slice(-2000)}`}`);
      resolve(code === 0);
    });
  });
}

async function pool(items, worker) {
  const queue = [...items];
  const results = [];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) results.push(await worker(queue.shift()));
    })
  );
  return results;
}

function objects() {
  return readdirSync(`${WD}/output`, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(`${WD}/output/${e.name}/object.json`))
    .map((e) => JSON.parse(readFileSync(`${WD}/output/${e.name}/object.json`, "utf8")).object)
    .filter((o) => !only || only.includes(o.id));
}

function latestPlate() {
  return readdirSync(`${WD}/source`)
    .filter((f) => /^\d+-.*-plate\.(png|jpe?g|webp)$/.test(f))
    .sort((a, b) => parseInt(b) - parseInt(a))[0];
}

function editPrompt(o) {
  return (
    `Isolate the ${o.name} from this image. ${o.description} Reproduce it exactly as shown -- same colors, materials, ` +
    "and proportions. White background, centered, tight crop, studio lighting. No other objects, no scene, no people, " +
    "no text, no shadows on the ground. Isolate the object and remove all clustered, adjacent, overlapping, or items " +
    "resting on the target object. If several similar items are visible, show exactly one single instance. Create a " +
    "clean render of that one single object that is true to the source image."
  );
}

async function main() {
  if (step === "plate" || step === "all") {
    if (latestPlate()) console.log(`plate exists: ${latestPlate()} (delete it to redo)`);
    else
      run(".claude/scripts/image-edit/generate-edit.mjs", [
        "--image", HERO, "--prompt", PLATE_PROMPT, "--output-dir", `${WD}/source`,
        "--role", "plate", "--output-slug", "desk-window-wide-plate",
      ]);
  }

  if (step === "world" || step === "all") {
    const plate = latestPlate();
    run(".claude/scripts/world/generate-world.mjs", [
      "--world", WORLD, "--image", plate ? `${WD}/source/${plate}` : HERO, "--prompt", WORLD_PROMPT,
    ]);
  }

  if (step === "objects" || step === "all") {
    const generateType = flag("generate-type");
    await pool(objects(), (o) =>
      runAsync(".claude/scripts/asset-pipeline/generate-single-asset.mjs",
        ["--world", WORLD, "--object-id", o.id, "--image-edit-prompt", editPrompt(o),
          ...(generateType ? ["--generate-type", generateType] : [])], `3d ${o.id}`)
    );
  }

  if (step === "sfx" || step === "all") {
    const jobs = [
      ["ambient", ["--prompt", AMBIENT_PROMPT, "--output-dir", `${WD}/output/sfx`, "--prefix", "ambient-loop",
        "--count", "2", "--kind", "world-ambience", "--duration-seconds", "10", "--loop", "--postprocess", "true"]],
      ...objects().map((o) => [`impact ${o.id}`, [
        "--prompt", `impact one-shot, short-decay, ${o.materials.join(", ")} ${o.name} hitting a hard ceramic tile floor`,
        "--output-dir", path.join(o.working_dir, "sfx"), "--prefix", `impact-${o.id}`, "--count", "4",
        "--kind", "object-impact", "--duration-seconds", "1", "--postprocess", "true"]]),
    ];
    const hasAudio = (a) => {
      const dir = a[a.indexOf("--output-dir") + 1];
      const prefix = a[a.indexOf("--prefix") + 1];
      return existsSync(dir) && readdirSync(dir).some((f) => /^\d+-/.test(f) && f.includes(prefix) && /\.(mp3|wav)$/.test(f));
    };
    const pending = jobs.filter(([label, a]) => !hasAudio(a) || (console.log(`sfx exists, skipping: ${label}`), false));
    await pool(pending, ([label, a]) => runAsync(".claude/scripts/sfx/fal-elevenlabs-sfx.mjs", a, label));
  }

  run(".claude/scripts/project/project-state.mjs", ["--world", WORLD]);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
