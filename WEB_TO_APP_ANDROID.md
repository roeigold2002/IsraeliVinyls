# Android APK Build (web-to-app)

This project can be packaged into an Android APK using:

- `web-to-app` repo: https://github.com/shiahonb777/web-to-app
- Existing hosted API: `https://israeli-vinyls-projectv.netlify.app`

## 1. Build mobile web bundle

From this repo root:

```bash
npm run build:android:handoff
```

Output folders:

- `dist/mobile`
- `dist/android-web-to-app/app`
- `dist/android-web-to-app/manifest.json`

This build uses relative asset paths (`--base ./`) so it works when loaded from Android WebView local files.
The handoff command also validates asset paths and API fallback before preparing the import folder.

## 2. Import into web-to-app

Inside the web-to-app app:

1. Create HTML app
2. Select folder: `dist/android-web-to-app/app`
3. Entry file: `index.html`
4. Set app name, package id, icon, version
5. Build APK

## 3. API behavior in Android runtime

`src/lib/api.ts` now detects local app runtimes (`file:` / `content:` URLs and Android appassets host) and automatically targets:

- `https://israeli-vinyls-projectv.netlify.app`

You can still override API at runtime using query param:

- `?api=https://your-backend.example.com`

## 4. Smoke test checklist

After APK install:

1. Search for records (for example: `die lit`)
2. Open record detail page
3. Confirm stock state consistency between card and detail
4. Open store link from detail page
5. Add/remove wishlist item and relaunch app to confirm persistence

## 5. Fast rebuild loop

For UI-only iteration:

```bash
npm run build:android:handoff:fast
```

Then re-import/rebuild in web-to-app.
