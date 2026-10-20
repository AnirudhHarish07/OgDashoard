# India Tourism Dashboard: Front end

Vite + React 18 + TypeScript (strict) dashboard for the FastAPI backend in `../app`. **Built for laptop screens** (designed and checked at 1366×768, 1440×900 and 1920×1080; below ~1100px wide the page scrolls horizontally). There are no phone or tablet layouts.

> All figures come from the API. Everything in the bundled dataset is synthetic, so the UI shows a "Synthetic" badge wherever the API returns `is_synthetic: true`, plus a footer notice. Map boundaries are the backend's unofficial dissolved-district file, not the official Survey of India one.

## Setup

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173, talks to the backend at VITE_API_URL
npm run dev:mock       # no backend needed: serves ../samples/*.json
npm test               # Vitest
npm run lint
npm run build          # type-check + production build into dist/
```

Start the backend with `uvicorn app.main:app` from the repo root (port 8000). Its default `CORS_ORIGINS` already allows `http://localhost:5173`.

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` in dev, empty (same origin) in a production build | Backend base URL |
| `VITE_USE_MOCKS` | `false` | `true` serves the sample responses. Mock data does not react to filters. |

## Regenerating the typed API client

`src/api/schema.d.ts` is generated from the backend contract. After the backend changes:

```bash
cd .. && python scripts/export_openapi.py     # refresh openapi.json
cd frontend && npm run api:generate           # regenerate src/api/schema.d.ts
```

## Structure

```
src/api/          generated schema, typed fetch client (+ "waking up" timer), mock mode, one hook per endpoint
src/store/        filters (Zustand, mirrored to URL params), ui (theme, motion, shared hover, cross-filter)
src/pages/        Home, Overview, Compare, StatePage, Seasonality, Economy, Covid
src/components/   map/ charts/ cards/ filters/ common/ ask/
src/ui/interactions/   pointer-driven motion: cursor, ambient, spotlight, tilt, magnetic, parallax, shared tokens
src/lib/          Indian number formatter, colour scales
src/styles/       design tokens (CSS variables) and base styles
tests/            Vitest suite (runs against ../samples)
scripts/shoot.mjs optional headless-Chromium screenshots for visual checks
```

## Component to endpoint map

| Component | Endpoint |
|---|---|
| Filter bar (years, states, region, type, visitors) | `/api/filters` |
| Opening page hero + silhouette | `/api/overview/kpis`, `/api/geo/states` |
| KPI cards | `/api/overview/kpis` |
| HeroMap (choropleth, top 10, 3D, fly-in, labels) | `/api/geo/states`, `/api/map` |
| Map state panel | `/api/states/{code}` |
| National trend chart | `/api/overview/trend` |
| Insight cards | `/api/insights` |
| Export menu (CSV) | `/api/export` |

Further pages (comparison, drill-down, seasonality, economy, COVID, Ask the data, forecast, anomaly flags) are added in later steps and listed here as they land.

## Interaction and motion

All pointer effects share one rAF-throttled pointer tracker (`src/ui/interactions/pointer.ts`) and one set of timing tokens (hover 200ms, transitions 500ms, fly-in 2s, one easing curve). They turn off with the header's motion toggle or `prefers-reduced-motion` (the fly-in becomes an instant jump). Preferences persist in `localStorage`.
