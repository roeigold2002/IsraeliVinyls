#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PRODUCTION_API_HOST = 'israeli-vinyls-projectv.netlify.app';

const rootDir = path.resolve(__dirname, '..');
const mobileDir = path.join(rootDir, 'dist', 'mobile');
const mobileIndexPath = path.join(mobileDir, 'index.html');
const handoffDir = path.join(rootDir, 'dist', 'android-web-to-app');
const handoffAppDir = path.join(handoffDir, 'app');

function fail(message) {
  console.error('ANDROID_PREP=FAIL');
  console.error(message);
  process.exit(1);
}

function ensure(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function extractIndexAssets(indexHtml) {
  const scriptPaths = [...indexHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  const cssPaths = [...indexHtml.matchAll(/<link[^>]+href="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((href) => href.endsWith('.css'));

  return { scriptPaths, cssPaths };
}

function assertRelativeAssets(assetPaths, label) {
  for (const assetPath of assetPaths) {
    const isExternal = /^https?:\/\//i.test(assetPath);
    if (isExternal) {
      continue;
    }

    const isRelative = assetPath.startsWith('./') || assetPath.startsWith('../');
    ensure(
      isRelative,
      `${label} asset path must be relative for Android WebView packaging: ${assetPath}`
    );
  }
}

function cleanAndCreateDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

(function main() {
  ensure(fs.existsSync(mobileIndexPath), 'Missing dist/mobile/index.html. Run npm run build:android:web first.');

  const indexHtml = fs.readFileSync(mobileIndexPath, 'utf8');
  const { scriptPaths, cssPaths } = extractIndexAssets(indexHtml);

  ensure(scriptPaths.length > 0, 'No script tag found in dist/mobile/index.html');
  ensure(cssPaths.length > 0, 'No stylesheet link found in dist/mobile/index.html');

  assertRelativeAssets(scriptPaths, 'Script');
  assertRelativeAssets(cssPaths, 'Stylesheet');

  const mainBundlePathValue = scriptPaths.find((assetPath) =>
    !/^https?:\/\//i.test(assetPath) && assetPath.endsWith('.js')
  );

  ensure(Boolean(mainBundlePathValue), 'Could not resolve main JS bundle path from dist/mobile/index.html');

  const mainBundlePath = path.resolve(mobileDir, mainBundlePathValue);
  ensure(fs.existsSync(mainBundlePath), `Referenced JS bundle is missing: ${mainBundlePathValue}`);

  const bundleContent = fs.readFileSync(mainBundlePath, 'utf8');
  ensure(
    bundleContent.includes(PRODUCTION_API_HOST),
    `Compiled bundle does not include production API fallback host: ${PRODUCTION_API_HOST}`
  );

  cleanAndCreateDirectory(handoffDir);
  fs.cpSync(mobileDir, handoffAppDir, { recursive: true });

  const manifest = {
    generated_at: new Date().toISOString(),
    source_dir: toPosix(path.relative(rootDir, mobileDir)),
    handoff_app_dir: toPosix(path.relative(rootDir, handoffAppDir)),
    entry_file: 'index.html',
    api_host_fallback: `https://${PRODUCTION_API_HOST}`,
    validation: {
      relative_assets: true,
      api_fallback_in_bundle: true,
    },
  };

  fs.writeFileSync(path.join(handoffDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const guideSource = path.join(rootDir, 'WEB_TO_APP_ANDROID.md');
  if (fs.existsSync(guideSource)) {
    fs.copyFileSync(guideSource, path.join(handoffDir, 'WEB_TO_APP_ANDROID.md'));
  }

  console.log('ANDROID_PREP=PASS');
  console.log(`Handoff app folder: ${toPosix(path.relative(rootDir, handoffAppDir))}`);
  console.log(`Manifest: ${toPosix(path.relative(rootDir, path.join(handoffDir, 'manifest.json')))}`);
})();
