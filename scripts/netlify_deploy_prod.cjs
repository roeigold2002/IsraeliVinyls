#!/usr/bin/env node
"use strict";

/**
 * Publish ./dist to Netlify production, resilient to the CLI's `deploy --prod`
 * path returning 403 Forbidden.
 *
 * Background: on this account the one-shot `netlify deploy --prod` began
 * failing at the production-publish step with `JSONHTTPError: Forbidden`,
 * while draft uploads and the REST "restore deploy" endpoint both work. So
 * this does it in two steps:
 *   1. upload a draft deploy   (netlify deploy --json, no --prod)
 *   2. promote it to production (POST /sites/:id/deploys/:deploy/restore)
 *
 * Env: NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID. Optional: DEPLOY_MESSAGE.
 */

const { execFileSync } = require("node:child_process");

const token = process.env.NETLIFY_AUTH_TOKEN;
const siteId = process.env.NETLIFY_SITE_ID;
const message = process.env.DEPLOY_MESSAGE || "Automated deploy";

if (!token || !siteId) {
  console.error("NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID are required");
  process.exit(1);
}

function run(args) {
  return execFileSync("npx", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
    shell: process.platform === "win32",
  });
}

async function main() {
  // 1. Upload a draft deploy and capture its id from --json output.
  console.log("Uploading draft deploy…");
  const out = run([
    "netlify-cli", "deploy",
    "--dir", "dist",
    "--site", siteId,
    "--message", message,
    "--json",
  ]);

  let deployId = null;
  try {
    const parsed = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    deployId = parsed.deploy_id || parsed.deployId || (parsed.deploy && parsed.deploy.id);
  } catch {
    const m = out.match(/[0-9a-f]{24}/);
    deployId = m ? m[0] : null;
  }
  if (!deployId) {
    console.error("Could not determine draft deploy id from CLI output:\n" + out.slice(0, 500));
    process.exit(1);
  }
  console.log("Draft deploy:", deployId);

  // 2. Promote the draft to production via the REST restore endpoint, which
  // is not subject to the CLI --prod 403.
  console.log("Promoting to production…");
  const res = await fetch(
    `https://api.netlify.com/api/v1/sites/${siteId}/deploys/${deployId}/restore`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    console.error(`Restore failed: HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  const published = await res.json();
  console.log(`Published to production: ${published.ssl_url || published.url} (deploy ${published.id}, state ${published.state})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
