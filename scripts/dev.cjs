#!/usr/bin/env node
"use strict";

/**
 * Cross-platform dev runner: starts the local API server (port 3001) and
 * the Vite dev server (port 5000) together.
 *
 * Replaces the old `node server/api.cjs & vite` npm script, which silently
 * broke on Windows (cmd.exe runs `&` sequentially, so Vite never started).
 *
 * Usage: node scripts/dev.cjs [--host 127.0.0.1] [--port 5173]
 */

const { spawn } = require("node:child_process");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");
const extraViteArgs = process.argv.slice(2);

const children = [];

function launch(name, command, args) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    // If either process dies, take the whole dev environment down.
    shutdown(code === null ? 1 : code);
  });
  children.push(child);
  console.log(`[dev] started ${name} (pid ${child.pid})`);
  return child;
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // already dead
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

launch("api", process.execPath, ["server/api.cjs"]);
launch("vite", process.execPath, [
  path.join(rootDir, "node_modules", "vite", "bin", "vite.js"),
  ...extraViteArgs,
]);
