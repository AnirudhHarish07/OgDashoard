# India Tourism Dashboard: Backend API

FastAPI backend for a state-wise analytical dashboard on tourism in India (MapLibre map, charts, animations are built separately and consume this API).

> **All data is synthetic.** Every row of the bundled dataset (`data/india_tourism.db`, `data/processed/*.csv`) is synthetic or unverified (see `DATA_DICTIONARY.md`). The API says so on every response: each value-level record carries `is_synthetic`, and each response has a `meta` block with `data_sources` and `synthetic_share`. Nothing is fetched from the internet and no figures are hard-coded; the backend only reads the dataset and computes derived metrics from it.

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate      # Python 3.11+
pip install -r requirements-dev.txt                    # requirements.txt for runtime only
cp .env.example .env                                   # optional: add ANTHROPIC_API_KEY
uvicorn app.main:app --reload                          # or: python -m app   (honours $PORT)
```

Open <http://localhost:8000/docs> for interactive docs. Run the tests with `pytest`.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_PATH` | `data/india_tourism.db` | SQLite file (opened **read-only** for every request) |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed front-end origins |
| `ANTHROPIC_API_KEY` | unset | Enables Claude phrasing in `/api/insights` and the whole of `/api/ask`. Without it everything else works and these two degrade gracefully |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Any model id (e.g. `claude-sonnet-5-5` or `claude-haiku-5-5` for lower cost) |
| `PORT` | `8000` | Used by `python -m app` and the hosting platforms |

## How the dataset is loaded

- The committed `data/india_tourism.db` (1.8 MB) is used as-is.
- `scripts/load_db.py` rebuilds it from `data/processed/*.csv` (never from raw sources) and adds lookup indexes on `state_code`, `year` and `month`. The app runs this automatically on startup if the file is missing. To run it by hand: `python scripts/load_db.py [--force]`.
- The dataset itself is produced by `src/build.py` (see `DATA_DICTIONARY.md`). The API never modifies it.
- Boundary files: `data/geo/india_states.geojson` holds geometry only (built by `scripts/build_geo.py` from a public district map; **not** the official Survey of India file, see `docs/DATA_REPORT.md`).

State boundary handling follows the dataset: J&K (`JK`) and Ladakh (`LA`) are separate from 2019 (before 2019 `JK` includes Ladakh, so year-over-year values across that break are `null`), Dadra and Nagar Haveli and Daman and Diu is one entity (`DD`), Telangana (`TS`) exists for all years.

## Conventions shared by every data endpoint

**Common filters (query params):** `year` or `year_from`/`year_to`, `states` (comma-separated codes), `region`, `tourism_type` (a tag such as `beach`), `visitor_type` (`domestic|foreign|all`), `include_synthetic` (`true|false`, default `true`; everything in this dataset is synthetic, so `false` returns empty data).

**Response envelope:** `{"data": ..., "meta": {"filters", "data_sources", "synthetic_share", "record_count", "notes"}}`. Errors: `{"error": {"code", "message", "details"}}`.

**Numbers:** raw values plus Indian-format display strings (`"21.9 Cr"`, `"3.05 L"`, `"₹10.3 L Cr"`).

**Derived metrics** (YoY, rank, share, visits per 1,000, recovery %, revenue per tourist) are computed from dataset values only. A derived value is `is_synthetic: true` if any input is. Forecast points additionally carry `is_forecast: true`.

**Missing data** is returned as `null` with a `not_available` or `boundary_change` note, never invented.

## Endpoints and the dashboard feature they serve

| Endpoint | Dashboard feature |
|---|---|
| `GET /api/health` | Status, database check, row counts per table |
| `GET /api/filters` | Filter controls: years, states (with boundary notes), regions, tourism types, metrics |
| `GET /api/sources` | Data-source and synthetic-share footer / info panel |
| `GET /api/geo/states` | Map geometry with per-state label point, bounding box (flyTo/fitBounds) and `small_state` flag (leader-line labels) |
| `GET /api/map?metric=&year=` | Choropleth: value, display, rank, top-10 colour bucket, YoY, 0–1 height for 3D extrusion |
| `GET /api/overview/kpis` | KPI cards with previous-year value and direction (arrows, count-ups) |
| `GET /api/overview/trend` | National annual trend with the COVID-dip annotation |
| `GET /api/rankings?metric=&year=&order=&n=` | Top / bottom states bar chart |
| `GET /api/rankings/race?metric=` | Bar chart race (per-year ranked frames) |
| `GET /api/compare?states=KL,GA` | Side-by-side comparison of 2–3 states |
| `GET /api/scatter?year=` | Bubble chart: visits vs revenue per tourist, bubble = hotel rooms |
| `GET /api/states/{code}` | Fly-in detail panel in one call (profile, KPIs, trend, source countries, attractions, hotels, seasonality, festivals, rank history) |
| `GET /api/seasonality/heatmap?year=` | State × month heatmap |
| `GET /api/seasonality/by-type` | Monthly curves by tourism type |
| `GET /api/festivals?month=&state=` | Festival calendar overlay |
| `GET /api/economy` | GSDP share, revenue per tourist, forex by state |
| `GET /api/infrastructure/demand-capacity` | Visits vs hotel rooms; flags under-served states |
| `GET /api/infrastructure/occupancy-trend` | Hotel occupancy over time |
| `GET /api/covid/recovery` | COVID drop and recovery vs 2019, domestic vs foreign, ranked |
| `GET /api/forecast?state=&metric=&years=` | Forecast with confidence band (2020–21 excluded from training) |
| `GET /api/anomalies?metric=` | Unusual spikes/drops per state with z-scores |
| `GET /api/insights?year=&state=` | AI insight cards (facts computed in Python, phrased by Claude) |
| `POST /api/ask` | Natural-language question → validated read-only SQL → data + chart type |
| `GET /api/export?view=&format=csv` | CSV download of any view, with `is_synthetic` and `data_source` columns |

### Method notes

- **Rankings / map:** rank 1 = highest value; ties share a rank. Map ranks are across all states for the year, then `states/region/tourism_type` select the output. `/api/rankings` ranks within the filtered scope and also returns `national_rank`.
- **Forecast:** random walk with drift on log values (ARIMA(0,1,0)+trend, statsmodels), trained only on dataset values with 2020–21 treated as missing so COVID does not distort the trend. With ~9 usable annual points the intervals are wide by design. Results are cached.
- **Anomalies:** a state's YoY growth minus the peer median that year, z-scored against that state's own history (so shocks common to all states, such as COVID, are not flagged).
- **Under-served flag:** visits per hotel room above the 75th percentile across all states (quartile-based, relative; thresholds are returned).
- **Tourism-type curves:** the dataset has types only as state tags, so each curve aggregates states carrying the tag; a multi-tag state counts in each curve and curves must not be summed.
- **Insights:** facts are computed from the dataset first; Claude only rephrases them. Any sentence containing a number that is not in its facts is replaced by a template sentence.
- **`/api/ask` security:** Claude proposes SQL; the backend parses it (single SELECT only), whitelists tables/columns/functions, regenerates the SQL from the parsed tree (raw text is never executed), enforces a row limit, and runs it on a read-only connection with a SQLite authorizer and a timeout.
- **Caching:** in-memory TTL caches for map, rankings, race, forecasts, insights, state detail and COVID recovery.

## Front-end integration

- **`openapi.json`** (repo root) is the data contract. Regenerate with `python scripts/export_openapi.py` (a test fails if it is stale).
- **`samples/`** holds one real response per endpoint, generated by `python scripts/generate_samples.py`; `samples/_index.json` maps each file to its request and dashboard feature. `ask_top5_foreign.json` uses a stubbed SQL step if no API key was available at generation time (noted in its `meta.notes`).
- A `frontend/` folder can be added at the repo root without changes here.

## Project layout

```
app/            main.py, config.py, db.py, errors.py, logging_config.py
  routers/      one module per endpoint group
  services/     filters, derived metrics, formatting, forecast, anomalies, insights, SQL guard, export ...
  schemas/      Pydantic response models
scripts/        load_db.py, build_geo.py, export_openapi.py, generate_samples.py
data/           india_tourism.db, processed/*.csv, geo/india_states.geojson
src/, validate.py   the dataset's own build pipeline
tests/          pytest suite (runs against the real dataset)
samples/        example responses for the front end
docs/DATA_REPORT.md   schema findings, gaps, caveats
```

## Tests

`pytest` runs ~550 tests against the real dataset: filters and the `include_synthetic` toggle, rank/top-10 logic, recovery %, `is_synthetic` propagation, API totals vs dataset totals, a sweep of every endpoint × metric × filter combination (no 5xx), SQL-guard rejection of non-SELECT and other unsafe queries, CSV export, and the `openapi.json`/DB-rebuild contract. Claude calls are mocked in tests.

## Deployment (Render)

1. Push the repo to GitHub.
2. In Render choose **New → Blueprint** and select the repo; `render.yaml` defines the service (build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check `/api/health`, Python 3.11).
3. In the service's environment set `CORS_ORIGINS` to your front-end URL(s) (comma-separated) and, optionally, `ANTHROPIC_API_KEY`.
4. The committed SQLite DB is used directly; no build step touches data.

**Railway:** create a project from the GitHub repo; the `Procfile` provides the start command. Set the same environment variables.

The free Render tier sleeps when idle, so the first request after a pause is slow. `/api/states/{code}` is cached and responds in well under 200 ms once warm.
