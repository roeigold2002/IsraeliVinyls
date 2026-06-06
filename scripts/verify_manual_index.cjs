#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const INDEX_PATH = path.resolve(
  __dirname,
  "..",
  "netlify",
  "data",
  "manual_enrichment_index.json"
);

function fail(message) {
  console.error("MANUAL_INDEX_CHECK=FAIL");
  console.error(message);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(INDEX_PATH)) {
    fail(`Index file not found: ${INDEX_PATH}`);
  }

  const payload = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  if (entries.length === 0) {
    fail("Index exists but has zero entries");
  }

  const withCover = entries.filter((entry) => Boolean(entry.cover_url)).length;
  const withPrice = entries.filter((entry) => Number(entry.price || 0) > 0).length;
  const withInStock = entries.filter((entry) => entry.in_stock === true || entry.in_stock === false).length;

  if (withCover === 0) {
    fail("Index has no cover data");
  }

  if (withPrice === 0) {
    fail("Index has no price data");
  }

  console.log("MANUAL_INDEX_CHECK=PASS");
  console.log(
    JSON.stringify(
      {
        generated_at: payload.generated_at || null,
        entries: entries.length,
        with_cover: withCover,
        with_price: withPrice,
        with_in_stock: withInStock,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
