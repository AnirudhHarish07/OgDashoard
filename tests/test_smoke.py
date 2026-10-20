"""Sweep every endpoint x metric x filter combination: no 5xx, no NaN, always a meta block."""
import pytest

METRICS = ["domestic_visits", "foreign_visits", "total_visits", "revenue", "growth_pct", "visits_per_1000_people"]
PATHS = ["/api/map?metric={m}", "/api/rankings?metric={m}", "/api/rankings/race?metric={m}"]
PLAIN = ["/api/overview/kpis", "/api/overview/trend", "/api/scatter", "/api/states/LA", "/api/states/JK",
         "/api/seasonality/heatmap", "/api/seasonality/by-type", "/api/festivals", "/api/economy",
         "/api/infrastructure/demand-capacity", "/api/infrastructure/occupancy-trend", "/api/covid/recovery",
         "/api/forecast", "/api/forecast?state=LA&metric=revenue", "/api/forecast?state=JK&metric=foreign_visits",
         "/api/anomalies", "/api/anomalies?metric=revenue&threshold=1.5", "/api/insights", "/api/insights?state=DD"]
EXTRAS = ["", "year=2015", "year=2019", "year=2020", "year=2025", "region=Islands", "tourism_type=medical",
          "visitor_type=foreign", "include_synthetic=false", "states=JK,LA&year=2019", "states=LA&year=2019&visitor_type=foreign"]


def urls():
    for p in [x.format(m=m) for x in PATHS for m in METRICS] + PLAIN:
        for e in EXTRAS:
            yield p + (("&" if "?" in p else "?") + e if e else "")


@pytest.mark.parametrize("url", list(urls()))
def test_no_server_errors(client, url):
    r = client.get(url)
    assert r.status_code in (200, 422), (url, r.status_code, r.text[:200])
    if r.status_code == 200:
        assert "meta" in r.json() and "NaN" not in r.text and "Infinity" not in r.text
