import pytest

from app.services import data


def rec(client, q=""):
    r = client.get(f"/api/covid/recovery?{q}")
    assert r.status_code == 200, r.text
    return r.json()


def test_recovery_pct_matches_dataset(client):
    d = rec(client, "year=2025")["data"]
    a = data.frames().annual.set_index(["state_code", "year"])
    assert len(d["states"]) == 36
    for s in d["states"]:
        c = s["state_code"]
        b, l = a.loc[(c, 2019)], a.loc[(c, 2025)]
        assert s["baseline_visits"] == b.total_visits and s["latest_visits"] == l.total_visits
        assert s["recovery_pct"] == pytest.approx(l.total_visits / b.total_visits * 100, abs=0.01)
        assert s["drop_pct"]["2020"] == pytest.approx((a.loc[(c, 2020)].total_visits - b.total_visits) / b.total_visits * 100, abs=0.01)
        assert s["domestic"]["recovery_pct"] == pytest.approx(l.domestic_visits / b.domestic_visits * 100, abs=0.01)
        assert s["foreign"]["recovery_pct"] == pytest.approx(l.foreign_visits / b.foreign_visits * 100, abs=0.01)
        assert s["recovered"] == (s["recovery_pct"] >= 100)
        assert s["trough_drop_pct"] == min(s["drop_pct"].values())


def test_ranked_by_recovery(client):
    d = rec(client)["data"]["states"]
    assert [s["rank"] for s in d] == list(range(1, 37))
    vals = [s["recovery_pct"] for s in d]
    assert vals == sorted(vals, reverse=True)


def test_recovery_year_and_summary(client):
    d = rec(client, "year=2023")["data"]
    for s in d["states"]:
        if s["recovered"]:
            assert 2022 <= s["recovery_year"] <= 2023
        else:
            assert s["recovery_year"] is None
    a = data.frames().tourism_annual
    base = a[a.year == 2019]
    assert d["summary"]["baseline_visits"] == (base.domestic_visits + base.foreign_visits).sum()
    assert d["summary"]["n_states"] == 36 and d["covid_years"] == [2020, 2021]


def test_filters_synthetic_flags_and_errors(client):
    r = rec(client, "region=North-East")
    assert {s["region"] for s in r["data"]["states"]} == {"North-East"}
    assert r["meta"]["synthetic_share"] == 100 and all(s["is_synthetic"] for s in r["data"]["states"])
    assert rec(client, "include_synthetic=false")["data"]["states"] == []
    r = client.get("/api/covid/recovery?year=2021")
    assert r.status_code == 422 and r.json()["error"]["code"] == "year_before_recovery"
    f = rec(client, "year=2025&visitor_type=foreign")["data"]["states"]
    assert all(s["recovery_pct"] == s["foreign"]["recovery_pct"] for s in f)
