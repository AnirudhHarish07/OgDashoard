import pytest


def states(client, **q):
    qs = "&".join(f"{k}={v}" for k, v in q.items())
    return client.get(f"/api/map?{qs}").json()


def test_rank_and_top10_logic(client):
    d = states(client, metric="total_visits", year=2024)["data"]["states"]
    ranked = sorted((s for s in d if s["rank"]), key=lambda s: s["rank"])
    assert [s["value"] for s in ranked] == sorted([s["value"] for s in ranked], reverse=True)
    assert sum(s["is_top10"] for s in d) == 10
    top = [s for s in d if s["is_top10"]]
    assert sorted(s["color_bucket"] for s in top) == list(range(1, 11))
    assert all(s["color_bucket"] is None for s in d if not s["is_top10"])
    assert max(s["height"] for s in d) == 1.0 and min(s["height"] for s in d) >= 0


def test_totals_match_dataset(client, annual):
    r = states(client, metric="total_visits", year=2024)["data"]["states"]
    y = annual[annual.year == 2024]
    assert sum(s["value"] for s in r) == (y.domestic_visits + y.foreign_visits).sum()
    r = states(client, metric="revenue", year=2023)["data"]["states"]
    assert sum(s["value"] for s in r) == pytest.approx(annual[annual.year == 2023].tourism_revenue_cr.sum())


def test_yoy_matches_dataset_and_null_at_boundary(client, annual):
    r = {s["state_code"]: s for s in states(client, metric="domestic_visits", year=2024)["data"]["states"]}
    kl = annual[(annual.state_code == "KL")]
    cur, prev = (kl[kl.year == y].domestic_visits.iloc[0] for y in (2024, 2023))
    assert r["KL"]["yoy_change"] == pytest.approx((cur - prev) / prev * 100, abs=0.01)
    # J&K basis changes in 2019 -> no YoY; Ladakh has no prior year
    r19 = {s["state_code"]: s for s in states(client, metric="total_visits", year=2019)["data"]["states"]}
    assert r19["JK"]["yoy_change"] is None and r19["LA"]["yoy_change"] is None


def test_growth_pct_boundary_not_available(client):
    r = {s["state_code"]: s for s in states(client, metric="growth_pct", year=2019)["data"]["states"]}
    assert r["JK"]["value"] is None and "not_available" in r["JK"]["note"]
    assert r["JK"]["rank"] is None and r["KL"]["rank"] is not None


def test_per_1000_derived_synthetic_propagates(client):
    from app.services import data
    annual = data.frames().annual
    d = states(client, metric="visits_per_1000_people", year=2024)
    kl = next(s for s in d["data"]["states"] if s["state_code"] == "KL")
    row = annual[(annual.state_code == "KL") & (annual.year == 2024)].iloc[0]
    assert kl["value"] == pytest.approx((row.domestic_visits + row.foreign_visits) / row.population * 1000)
    assert kl["is_synthetic"] is True  # inputs (visits, population) are synthetic/unverified
    assert set(d["meta"]["data_sources"]) and d["meta"]["synthetic_share"] == 100


def test_visitor_type_changes_total(client, annual):
    dom = sum(s["value"] for s in states(client, metric="total_visits", year=2024, visitor_type="domestic")["data"]["states"])
    assert dom == annual[annual.year == 2024].domestic_visits.sum()


def test_display_strings_indian_format(client):
    d = states(client, metric="total_visits", year=2024)["data"]["states"]
    assert all(s["display"].endswith(("Cr", "L")) or s["display"].replace(",", "").isdigit() for s in d)
    from app.services.formatting import fmt_count, fmt_crore, indian_group
    assert fmt_count(219_000_000) == "21.9 Cr" and fmt_count(305_000) == "3.05 L" and fmt_count(45_210) == "45,210"
    assert fmt_crore(1_027_314.88) == "₹10.3 L Cr" and fmt_crore(9713.89) == "₹9,714 Cr"
    assert indian_group(12345678) == "1,23,45,678"


def test_geo_states(client):
    r = client.get("/api/geo/states").json()
    codes = {f["properties"]["state_code"] for f in r["features"]}
    assert len(codes) == 36 and {"JK", "LA"} <= codes
    p = next(f["properties"] for f in r["features"] if f["properties"]["state_code"] == "GA")
    assert p["small_state"] is True and len(p["centroid"]) == 2 and len(p["bbox"]) == 4
    assert not next(f["properties"] for f in r["features"] if f["properties"]["state_code"] == "RJ")["small_state"]
    assert "meta" in r
    assert len(client.get("/api/geo/states?states=GA,KL").json()["features"]) == 2
