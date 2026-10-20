"""Call the API against the dataset and save one real response per endpoint in samples/ (front-end mock data).

Usage: python scripts/generate_samples.py

POST /api/ask needs Claude. If ANTHROPIC_API_KEY is set the real model is used; otherwise the SQL step is replaced by a
fixed stub (everything after it - validation, execution, chart suggestion, response shape - is real) and meta.notes says so.
"""
import json
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services import ai  # noqa: E402

OUT = ROOT / "samples"
ASK_Q = {"question": "top 5 states for foreign tourists in 2023"}
STUB_SQL = ("SELECT s.state_code, s.state_name, t.foreign_visits FROM tourism_annual t JOIN states s ON s.state_code = t.state_code "
            "WHERE t.year = 2023 ORDER BY t.foreign_visits DESC LIMIT 5")

GET = [  # (file, url, dashboard feature)
    ("health", "/api/health", "Status / row counts"),
    ("filters", "/api/filters", "Filter controls (years, states, regions, types, metrics)"),
    ("sources", "/api/sources", "Data sources and synthetic share"),
    ("geo_states", "/api/geo/states", "Map geometry, labels, fitBounds"),
    ("map_total_visits", "/api/map?metric=total_visits&year=2024", "Choropleth / 3D extrusion"),
    ("map_growth_pct", "/api/map?metric=growth_pct&year=2019", "Choropleth with null growth at the J&K/Ladakh boundary"),
    ("overview_kpis", "/api/overview/kpis?year=2024", "KPI cards and count-ups"),
    ("overview_trend", "/api/overview/trend", "National trend with COVID annotation"),
    ("rankings_top10_foreign", "/api/rankings?metric=foreign_visits&year=2023&order=top&n=10", "Top / bottom bar chart"),
    ("rankings_race", "/api/rankings/race?metric=total_visits&n=10", "Bar chart race"),
    ("compare_kl_ga_rj", "/api/compare?states=KL,GA,RJ&year=2024", "Side-by-side state comparison"),
    ("scatter", "/api/scatter?year=2024", "Bubble chart: visits vs revenue per tourist"),
    ("state_detail_ga", "/api/states/GA?year=2024", "Fly-in detail panel"),
    ("state_detail_la_2018_no_data", "/api/states/LA?year=2018", "Detail panel for a state with no data in that year"),
    ("seasonality_heatmap", "/api/seasonality/heatmap?year=2023", "State x month heatmap"),
    ("seasonality_by_type", "/api/seasonality/by-type?year=2023", "Monthly curves by tourism type"),
    ("festivals_october", "/api/festivals?month=10", "Festival calendar overlay"),
    ("economy", "/api/economy?year=2024", "GSDP share, revenue per tourist, forex"),
    ("infrastructure_demand_capacity", "/api/infrastructure/demand-capacity?year=2024", "Under-served states"),
    ("infrastructure_occupancy_trend", "/api/infrastructure/occupancy-trend", "Hotel occupancy over time"),
    ("covid_recovery", "/api/covid/recovery?year=2025", "COVID recovery ranking"),
    ("forecast_national", "/api/forecast?metric=total_visits&years=3", "National forecast with confidence band"),
    ("forecast_kerala_revenue", "/api/forecast?state=KL&metric=revenue&years=3", "State forecast"),
    ("anomalies", "/api/anomalies?metric=total_visits&limit=15", "Anomaly flags"),
    ("insights_national", "/api/insights?year=2024", "Insight cards"),
    ("insights_state_kl", "/api/insights?year=2024&state=KL", "Insight cards for a state"),
    ("error_unknown_state", "/api/states/ZZ", "Error response shape"),
]


def main() -> None:
    logging.disable(logging.CRITICAL)
    OUT.mkdir(exist_ok=True)
    index = []

    def save(name, method, url, feature, body, note=None):
        (OUT / f"{name}.json").write_text(json.dumps(body, indent=2, ensure_ascii=False) + "\n")
        index.append({"file": f"{name}.json", "method": method, "request": url, "feature": feature, **({"note": note} if note else {})})

    with TestClient(app) as c:
        for name, url, feature in GET:
            r = c.get(url)
            save(name, "GET", url, feature, r.json(), None if r.status_code == 200 else f"HTTP {r.status_code}")
        r = c.get("/api/export?view=rankings&metric=foreign_visits&year=2023&n=10")
        (OUT / "export_rankings.csv").write_text(r.text)
        index.append({"file": "export_rankings.csv", "method": "GET", "request": "/api/export?view=rankings&metric=foreign_visits&year=2023&n=10",
                      "feature": "CSV download"})
        stub = not ai.available()
        if stub:
            ai.available = lambda: True
            ai.complete_json = lambda *a, **k: {"sql": STUB_SQL, "chart_type": "bar", "title": "Top 5 states by foreign visits, 2023",
                                                "explanation": "Ranks states by foreign_visits for 2023."}
        r = c.post("/api/ask", json=ASK_Q)
        body = r.json()
        if stub and r.status_code == 200:
            body["meta"]["notes"].append("SAMPLE ONLY: the SQL came from a fixed stub because no ANTHROPIC_API_KEY was set when this sample was generated.")
        save("ask_top5_foreign", "POST", "/api/ask " + json.dumps(ASK_Q), "Natural-language query", body,
             "SQL step stubbed (no API key at generation time); shape is real" if stub else None)
    (OUT / "_index.json").write_text(json.dumps(index, indent=2) + "\n")
    bad = [i for i in index if i.get("note", "").startswith("HTTP") and i["file"] != "error_unknown_state.json"]
    print(f"wrote {len(index)} samples to {OUT}" + (f"; unexpected errors: {bad}" if bad else ""))


if __name__ == "__main__":
    main()
