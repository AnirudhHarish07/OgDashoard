import pytest

from app.services import data


def get(client, url):
    r = client.get(url)
    assert r.status_code == 200, r.text
    return r.json()


def test_economy_matches_dataset(client):
    d = get(client, "/api/economy?year=2024")["data"]
    a = data.frames().tourism_annual
    y = a[a.year == 2024].set_index("state_code")
    assert len(d["states"]) == 36
    for s in d["states"]:
        r = y.loc[s["state_code"]]
        assert s["tourism_share_of_gsdp"] == pytest.approx(r.tourism_share_of_gsdp, abs=0.01)
        assert s["revenue_per_tourist"] == pytest.approx(r.avg_spend_per_tourist, abs=1)
        assert s["forex_earnings_cr"] == r.forex_earnings_cr and s["is_synthetic"]
        assert 0 <= s["forex_share_of_revenue_pct"] <= 100
    shares = [s["tourism_share_of_gsdp"] for s in d["states"]]
    assert shares == sorted(shares, reverse=True) and d["states"][0]["rank_gsdp_share"] == 1
    assert d["summary"]["revenue_cr"] == pytest.approx(y.tourism_revenue_cr.sum())


def test_economy_visitor_type_and_filters(client):
    a = data.frames().annual
    y = a[(a.year == 2024) & (a.state_code == "GA")].iloc[0]
    d = get(client, "/api/economy?year=2024&states=GA&visitor_type=foreign")["data"]["states"]
    assert len(d) == 1 and d[0]["revenue_cr"] == y.forex_earnings_cr
    assert d[0]["revenue_per_tourist"] == pytest.approx(y.forex_earnings_cr * 1e7 / y.foreign_visits, rel=1e-6)
    assert get(client, "/api/economy?include_synthetic=false")["data"]["states"] == []
    assert get(client, "/api/economy?include_synthetic=false")["data"]["summary"] is None


def test_demand_capacity_flags(client):
    r = get(client, "/api/infrastructure/demand-capacity?year=2024")
    d = r["data"]
    t = d["thresholds"]
    assert t["p25"] < t["median"] < t["p75"]
    st = d["states"]
    assert [s["visits_per_room"] for s in st] == sorted((s["visits_per_room"] for s in st), reverse=True)
    for s in st:
        assert s["under_served"] == (s["visits_per_room"] > t["p75"])
        assert s["status"] == ("under_served" if s["visits_per_room"] > t["p75"] else "over_supplied" if s["visits_per_room"] < t["p25"] else "balanced")
        assert (s["rooms_to_reach_median_ratio"] > 0) == (s["visits_per_room"] > t["median"])
    assert 5 <= sum(s["under_served"] for s in st) <= 12
    fr = data.frames()
    kl = fr.annual[(fr.annual.state_code == "KL") & (fr.annual.year == 2024)].iloc[0]
    rooms = fr.infrastructure[(fr.infrastructure.state_code == "KL") & (fr.infrastructure.year == 2024)].hotel_rooms.iloc[0]
    row = next(s for s in st if s["state_code"] == "KL")
    assert row["visits_per_room"] == pytest.approx((kl.domestic_visits + kl.foreign_visits) / rooms, abs=0.01)
    # thresholds are stable under filtering
    sub = get(client, "/api/infrastructure/demand-capacity?year=2024&region=South")["data"]
    assert sub["thresholds"] == t and {s["region"] for s in sub["states"]} == {"South"}
    assert get(client, "/api/infrastructure/demand-capacity?include_synthetic=false")["data"]["states"] == []


def test_occupancy_trend(client):
    d = get(client, "/api/infrastructure/occupancy-trend")["data"]
    assert [p["year"] for p in d["national"]] == list(range(2015, 2026))
    i = data.frames().infrastructure
    g = i[i.year == 2019]
    w = (g.occupancy_rate * g.hotel_rooms).sum() / g.hotel_rooms.sum()
    assert next(p for p in d["national"] if p["year"] == 2019)["weighted_occupancy_rate"] == pytest.approx(w, abs=0.01)
    covid = {p["year"]: p["weighted_occupancy_rate"] for p in d["national"]}
    assert covid[2020] < covid[2019]
    sub = get(client, "/api/infrastructure/occupancy-trend?states=KL&year_from=2019&year_to=2021")["data"]
    assert len(sub["states"]) == 1 and [p["year"] for p in sub["states"][0]["points"]] == [2019, 2020, 2021]
    assert get(client, "/api/infrastructure/occupancy-trend?include_synthetic=false")["data"]["national"] == []
