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

One shared module, `src/ui/interactions/`, drives every pointer effect:

| Effect | Where | File |
|---|---|---|
| Custom cursor (dot + lerped ring, grows on clickable elements, shrinks on click) | every page | `Cursor.tsx` |
| Ambient glow + particle field drifting toward the cursor | one canvas behind all pages | `Ambient.tsx` |
| Spotlight (dark theme only) | every page | `Spotlight.tsx` |
| 3D tilt (max 8 degrees) with a light sheen | KPI cards | `useTilt.ts` |
| Magnetic button | Opening page CTA | `useMagnetic.ts` |
| Multi-layer parallax | Opening page | `useParallax.ts` |
| Sliding hover indicator | header navigation | `components/common/Layout.tsx` |
| Shared hover (one hovered state lights up in every component) | map, tables, insight cards, charts | `useSharedHover.ts`, `charts/EChart.tsx` (`hoverCodes`) |
| Chart hover effects (bar rise + glow with others dimmed, heatmap cell zoom, crosshair) | all charts | `components/charts/fx.ts` |

Rules every effect follows:

- **Tokens:** hover 200ms, transitions 500ms, fly-in 2s, one easing curve (`tokens.ts`, mirrored as CSS variables).
- **Throttling:** a single `pointermove` listener (`pointer.ts`), delivered once per animation frame; only `transform` and `opacity` are animated.
- **Off switches:** the header motion toggle (persisted in `localStorage`) and the OS `prefers-reduced-motion` setting turn off the cursor, ambient field, spotlight, tilt, magnetic, parallax and lerp, and make the fly-in an instant jump. Simple highlight states stay.
- **Mouse only:** effects need a hover-capable fine pointer. This is a laptop dashboard, so there is no touch gesture handling.
- **Cleanup:** all listeners and animation frames are released on unmount (`pointerStats()` is used by tests to prove it).

Visual and motion checks run in headless Chromium: `npm run dev:mock`, then `node scripts/shoot.mjs` (screenshots) and `node scripts/verify-motion.mjs` (toggle, reduced motion, nav indicator, frame times).
