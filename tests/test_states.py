import time

import pytest

from app.services import data


def detail(client, code="KL", q=""):
    r = client.get(f"/api/states/{code}?{q}")
    assert r.status_code == 200, r.text
    return r.json()


def test_detail_sections_present(client):
    d = detail(client)["data"]
    assert d["year"] == 2025
    assert {"profile", "kpis", "trend", "source_countries", "top_attractions", "hotel_infrastructure",
            "seasonality", "festivals", "rank_history"} <= set(d)
    assert d["profile"]["state_name"] == "Kerala" and "beach" in d["profile"]["tourism_types"]
    assert d["profile"]["airports"] is not None and len(d["trend"]) == 11 and len(d["rank_history"]) == 11
    assert len(d["seasonality"]["months"]) == 12 and d["seasonality"]["peak_month"] in range(1, 13)


def test_detail_values_match_dataset(client):
    d = detail(client, "RJ", "year=2023")["data"]
    fr = data.frames()
    row = fr.annual[(fr.annual.state_code == "RJ") & (fr.annual.year == 2023)].iloc[0]
    k = {x["key"]: x for x in d["kpis"]}
    assert k["total_visits"]["value"] == row.domestic_visits + row.foreign_visits
    assert k["revenue"]["value"] == pytest.approx(row.tourism_revenue_cr)
    assert sum(m["total_visits"] for m in d["seasonality"]["months"]) == row.domestic_visits + row.foreign_visits
    assert sum(c["foreign_visits"] for c in d["source_countries"]) <= row.foreign_visits
    assert d["source_countries"][-1]["is_other"] or all(not c["is_other"] for c in d["source_countries"])
    atts = [a["annual_footfall"] for a in d["top_attractions"]]
    assert atts == sorted(atts, reverse=True)
    assert sum(s["hotels"] for s in d["hotel_infrastructure"]["star_mix"]) == d["hotel_infrastructure"]["hotels_total"]


def test_rank_history_matches_rank_kpi(client):
    d = detail(client, "GA", "year=2022")["data"]
    k = next(x for x in d["kpis"] if x["key"] == "rank_total_visits")
    assert k["value"] == next(h for h in d["rank_history"] if h["year"] == 2022)["rank_total_visits"]
    assert k["direction"] in ("up", "down", "flat", "none")


def test_boundary_handling(client):
    la = detail(client, "LA", "year=2018")["data"]
    assert la["kpis"] == [] and la["trend"][0]["year"] == 2019 and "not_available" in la["notes"][0]
    jk = detail(client, "JK", "year=2019")["data"]
    assert {k["key"]: k for k in jk["kpis"]}["total_visits"]["previous_value"] is None
    assert any("boundary_change" in n for n in jk["notes"])
    assert detail(client, "LA")["data"]["profile"]["first_year"] == 2019


def test_synthetic_toggle_and_flags(client):
    r = detail(client, "KL")
    assert r["meta"]["synthetic_share"] == 100
    d = detail(client, "KL", "include_synthetic=false")["data"]
    assert d["kpis"] == [] and d["trend"] == [] and d["festivals"] == [] and d["profile"]["population"] is None


def test_unknown_state_404_and_case_insensitive(client):
    r = client.get("/api/states/ZZ")
    assert r.status_code == 404 and r.json()["error"]["code"] == "state_not_found"
    assert detail(client, "kl")["data"]["profile"]["state_code"] == "KL"


def test_detail_fast_enough_for_fly_in(client):
    for code in ("MH", "UP", "DL", "AN"):
        t = time.perf_counter()
        detail(client, code, "year=2021")
        assert time.perf_counter() - t < 0.2, code
