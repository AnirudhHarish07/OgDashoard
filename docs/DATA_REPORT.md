# Data report: schema findings, gaps and caveats

## Schema found vs the original brief

The brief expected 7 tables; the database has **10**. All 7 expected tables exist with the expected purpose, each with `data_source` and `is_synthetic`.

| Table | Rows | Key |
|---|---|---|
| states | 36 | state_code |
| tourism_annual | 392 | state_code, year (2015–2025) |
| tourism_monthly | 4,704 | state_code, year, month |
| infrastructure | 392 | state_code, year |
| attractions | 177 | name, state_code |
| ftv_source_countries | 4,704 | state_code, year, country |
| festivals_events | 108 | name, state_code |
| **national_annual** (extra) | 11 | year |
| **state_boundary_mapping** (extra) | 9 | legacy_entity, current_state_code |
| **state_name_aliases** (extra) | 54 | raw_name |

Other differences: `is_synthetic` is `1` on every row of every table; the dataset lived on an unmerged branch (`claude/exciting-meitner-so4678`) and was fast-forwarded into the working branch; the database initially had only unique composite indexes (the loader now adds lookup indexes without changing data).

## Dashboard features the dataset cannot fully support

| Need | What the dataset has | What the API does |
|---|---|---|
| Real (non-synthetic) figures | Everything is synthetic or unverified | `is_synthetic` and `synthetic_share` on every response; `include_synthetic=false` returns empty data |
| Tourism type on visit rows | Only `states.tourism_type_tags` and `attractions.type` | `tourism_type` filter selects states carrying the tag; `/api/seasonality/by-type` aggregates tagged states (curves overlap, noted in `meta.notes`) |
| Domestic vs foreign revenue | Total revenue and forex (foreign) only | Domestic revenue is derived as revenue − forex and flagged as derived |
| Monthly revenue | None | Not provided |
| Attraction footfall trend | 2024 snapshot only | Single-year footfall (`footfall_year`) |
| Official Survey of India boundaries | None | Geometry built from a public Census-2011-basis district map (J&K and Ladakh separate, DNH&DD merged); not the official file. Re-run `scripts/build_geo.py` with an official file to replace it |
| Year-over-year across the 2019 J&K/Ladakh split | Pre-2019 `JK` includes Ladakh | YoY is `null` (note `boundary_change`) for JK 2019 and Ladakh; aggregates skip the comparison when a selection includes only one of the two |
| Under-served / capacity standards | None | Relative, quartile-based flag; thresholds and method are returned |
| Forecast quality | 11 annual points, COVID years unusable | Wide intervals; fewer than 4 usable points gives `not_available` |

## Where the API returns `null` with a note

- Map / rankings: no value for a state-year (e.g. Ladakh before 2019), `growth_pct` and YoY across the boundary change.
- KPIs, trend, state detail: previous-year values across the boundary change; state detail for a year without data (`not_available`).
- Forecast: too few usable years, or no data under the filters.
- Insights: no data under the filters. `/api/ask`: returns 503 `ai_not_configured` without an API key.

## Caveats

- Claude-backed behaviour (insight phrasing, `/api/ask`) was developed and tested with mocked responses only, because no API key was available during development. Verify once with a real key.
- The synthetic data generator produces some surprising rankings (for example Goa 23rd of 36 by visits); the backend does not alter dataset values.
