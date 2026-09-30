# Fuel Log

A lightweight nutrition and macro tracker, built as an installable Progressive Web App. No account, no backend, no build step — everything runs in the browser and your data stays in `localStorage` on your device.

**Live:** https://f-hanke.github.io/fuel-log/

## Features

- **Daily tracking** — log meals into Breakfast / Lunch / Dinner / Snacks, with kcal/protein/carbs/fat targets shown as fillable progress rings
- **Three ways to add a food**
  - Search real products via the [Open Food Facts](https://world.openfoodfacts.org/) database, scaled to the amount you ate
  - Scan a barcode with your camera
  - Quick manual entry (name + macros)
- **Week and month overviews**, with a GitHub-style heatmap for the month view
- **Weight tracking** — log body weight over time and see it charted
- **Settings**
  - German / English UI
  - Dark / light theme
  - Editable daily macro targets, or auto-calculate them from body stats (Mifflin-St Jeor)
- **Installable PWA** — add to your home screen, works offline, auto-updates in the background

## Tech

Plain HTML/CSS/JS, no framework and no build step. State lives in `localStorage`; a Service Worker precaches the app shell and serves it network-first (falling back to cache when offline).

```
index.html
styles.css
sw.js                  service worker (bump CACHE_NAME on every change)
manifest.json           PWA manifest
icons/                  home screen icons
i18n/                   de.js / en.js translation strings
scripts/
  state.js               shared state, i18n, date helpers
  day.js                 day view rendering + edit/delete
  add.js                 add-food page: search / barcode / quick entry
  week-month.js           week + month views, heatmap
  weight.js               weight tracking + chart
  settings.js             settings modal
  main.js                 entry point + service worker registration
```

External dependency: [ZXing](https://github.com/zxing-js/library) (loaded from a CDN) for barcode scanning.

## Running locally

No build step — just serve the folder statically, e.g.:

```
python3 -m http.server 8000
```

then open `http://localhost:8000`. (Opening `index.html` directly via `file://` won't work — the Service Worker requires `http(s)`.)

## Deployment

Hosted on GitHub Pages from the `main` branch. After any change to a cached file, bump `CACHE_NAME` in `sw.js` — otherwise installed/home-screen instances keep serving the old cached version.
