import numpy as np
import pytest

from app.services import data


def get(client, url):
    r = client.get(url)
    assert r.status_code == 200, r.text
    return r.json()


def test_zscore_matches_independent_calculation(client):
    d = get(client, "/api/anomalies?metric=total_visits&threshold=2&limit=500")["data"]
    assert d["anomalies"], "expected some anomalies in the dataset"
    a = data.frames().annual.sort_values(["state_code", "year"])
    g = a.assign(prev=a.groupby("state_code").total_visits.shift(1), pb=a.groupby("state_code").boundary_basis.shift(1))
    g = g[(g.prev.notna()) & (g.pb == g.boundary_basis)].copy()
    g["growth"] = (g.total_visits - g.prev) / g.prev * 100
    g["dev"] = g.growth - g.groupby("year").growth.transform("median")
    stats = g.groupby("state_code").dev.agg(["mean", "std"])
    for x in d["anomalies"][:10]:
        row = g[(g.state_code == x["state_code"]) & (g.year == x["year"])].iloc[0]
        z = (row.dev - stats.loc[x["state_code"], "mean"]) / stats.loc[x["state_code"], "std"]
        assert x["z_score"] == pytest.approx(z, abs=0.01)
        assert abs(x["z_score"]) >= 2 and x["kind"] == ("spike" if z > 0 else "drop")
        assert x["growth_pct"] == pytest.approx(row.growth, abs=0.01) and x["previous_value"] == row.prev and x["value"] == row.total_visits
        assert x["is_synthetic"] is True
    z = [abs(x["z_score"]) for x in d["anomalies"]]
    assert z == sorted(z, reverse=True)


def test_threshold_filters_and_boundaries(client):
    lo = get(client, "/api/anomalies?threshold=1.5&limit=500")["data"]["anomalies"]
    hi = get(client, "/api/anomalies?threshold=2.5&limit=500")["data"]["anomalies"]
    assert len(hi) < len(lo) and {(x["state_code"], x["year"]) for x in hi} <= {(x["state_code"], x["year"]) for x in lo}
    assert not [x for x in lo if x["state_code"] in ("JK", "LA") and x["year"] == 2019]  # boundary change: no YoY
    sub = get(client, "/api/anomalies?threshold=1.5&states=TN,UP")["data"]["anomalies"]
    assert {x["state_code"] for x in sub} <= {"TN", "UP"}
    yr = get(client, "/api/anomalies?threshold=1.5&year=2022&limit=500")["data"]["anomalies"]
    assert yr and {x["year"] for x in yr} == {2022}


def test_other_metrics_and_toggle(client):
    for m in ("domestic_visits", "foreign_visits", "revenue"):
        assert get(client, f"/api/anomalies?metric={m}")["data"]["metric"] == m
    assert get(client, "/api/anomalies?include_synthetic=false")["data"]["anomalies"] == []
    assert client.get("/api/anomalies?threshold=0.1").status_code == 422
