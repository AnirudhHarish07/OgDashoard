import pytest

from app.db import connect_ro


def kpis(client, q=""):
    return {k["key"]: k for k in client.get(f"/api/overview/kpis?{q}").json()["data"]["kpis"]}


def test_kpis_match_national_totals(client):
    conn = connect_ro()
    nat = dict(conn.execute("select year, domestic_visits_total from national_annual").fetchall())
    k = kpis(client, "year=2024")
    assert k["total_domestic"]["value"] == nat[2024] and k["total_domestic"]["previous_value"] == nat[2023]
    assert k["total_domestic"]["direction"] == "up"
    assert k["total_domestic"]["change_pct"] == pytest.approx((nat[2024] - nat[2023]) / nat[2023] * 100, abs=0.01)
    assert k["total_domestic"]["display"].endswith("Cr")


def test_covid_year_direction_down_and_first_year_none(client):
    assert kpis(client, "year=2020")["total_domestic"]["direction"] == "down"
    k = kpis(client, "year=2015")
    assert k["total_domestic"]["previous_value"] is None and k["total_domestic"]["direction"] == "none"


def test_top_state_and_boundary_note(client, annual):
    k = kpis(client, "year=2024")["top_state"]
    y = annual[annual.year == 2024]
    best = y.assign(t=y.domestic_visits + y.foreign_visits).sort_values("t", ascending=False).iloc[0]
    assert k["state_code"] == best.state_code and k["value"] == best.t
    jk = kpis(client, "year=2019&states=JK")
    assert jk["total_domestic"]["previous_value"] is None and "boundary_change" in jk["total_domestic"]["note"]
    both = kpis(client, "year=2019&states=JK,LA")
    assert both["total_domestic"]["previous_value"] is not None


def test_synthetic_flag_and_meta(client):
    r = client.get("/api/overview/kpis").json()
    assert all(k["is_synthetic"] for k in r["data"]["kpis"]) and r["meta"]["synthetic_share"] == 100


def test_trend_matches_dataset_and_covid_annotation(client):
    r = client.get("/api/overview/trend").json()["data"]
    conn = connect_ro()
    nat = {y: (d, f, rev) for y, d, f, rev in conn.execute(
        "select year, domestic_visits_total, foreign_visits_total, tourism_revenue_cr_total from national_annual")}
    assert [p["year"] for p in r["series"]] == list(range(2015, 2026))
    for p in r["series"]:
        d, f, rev = nat[p["year"]]
        assert p["domestic_visits"] == d and p["foreign_visits"] == f and p["revenue_cr"] == pytest.approx(rev, abs=0.5)
    a = r["annotations"][0]
    assert (a["year_from"], a["year_to"], a["baseline_year"]) == (2020, 2021, 2019)
    assert a["trough_year"] == 2020 and a["drop_pct"] < -50 and a["recovery_year"] == 2023
    assert r["series"][0]["yoy_total_pct"] is None


def test_trend_respects_state_filter(client, annual):
    r = client.get("/api/overview/trend?states=KL").json()["data"]["series"]
    kl = annual[annual.state_code == "KL"].set_index("year")
    assert r[0]["total_visits"] == kl.loc[2015, "domestic_visits"] + kl.loc[2015, "foreign_visits"]
