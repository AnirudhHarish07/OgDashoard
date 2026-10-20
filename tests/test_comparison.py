import pytest

from app.services import data


def get(client, url):
    r = client.get(url)
    assert r.status_code == 200, r.text
    return r.json()


def test_rankings_top_bottom_and_shares(client, annual):
    top = get(client, "/api/rankings?metric=foreign_visits&year=2023&n=5")["data"]["items"]
    y = annual[annual.year == 2023].sort_values("foreign_visits", ascending=False)
    assert [i["state_code"] for i in top] == list(y.state_code.head(5))
    assert [i["rank"] for i in top] == [1, 2, 3, 4, 5]
    assert top[0]["share_pct"] == pytest.approx(y.foreign_visits.iloc[0] / y.foreign_visits.sum() * 100, abs=0.01)
    bottom = get(client, "/api/rankings?metric=foreign_visits&year=2023&n=3&order=bottom")["data"]["items"]
    assert [i["state_code"] for i in bottom] == list(y.state_code.tail(3)[::-1])
    assert bottom[0]["rank"] == 36


def test_rankings_scope_rank_vs_national(client):
    items = get(client, "/api/rankings?metric=total_visits&year=2024&region=South&n=10")["data"]["items"]
    assert {i["region"] for i in items} == {"South"}
    assert items[0]["rank"] == 1 and items[0]["national_rank"] >= 1
    assert [i["rank"] for i in items] == sorted(i["rank"] for i in items)


def test_rankings_synthetic_toggle_and_validation(client):
    r = get(client, "/api/rankings?metric=revenue&include_synthetic=false")
    assert r["data"]["items"] == [] and r["meta"]["record_count"] == 0
    assert client.get("/api/rankings?metric=revenue&n=0").status_code == 422
    assert client.get("/api/rankings?metric=revenue&order=sideways").status_code == 422


def test_race_frames(client):
    d = get(client, "/api/rankings/race?metric=total_visits&n=5")["data"]
    assert [f["year"] for f in d["frames"]] == list(range(2015, 2026))
    assert all(len(f["items"]) == 5 and [i["rank"] for i in f["items"]] == [1, 2, 3, 4, 5] for f in d["frames"])
    assert d["max_value"] == max(i["value"] for f in d["frames"] for i in f["items"])
    sub = get(client, "/api/rankings/race?metric=total_visits&year_from=2020&year_to=2021&n=3")["data"]
    assert [f["year"] for f in sub["frames"]] == [2020, 2021]


def test_compare_values_match_dataset(client):
    d = get(client, "/api/compare?states=KL,GA&year=2023")["data"]
    fr = data.frames()
    kl = fr.annual[(fr.annual.state_code == "KL") & (fr.annual.year == 2023)].iloc[0]
    m = {x["key"]: x for x in d["metrics"]}
    assert m["total_visits"]["values"]["KL"]["value"] == kl.domestic_visits + kl.foreign_visits
    assert m["revenue_per_tourist"]["values"]["KL"]["value"] == pytest.approx(kl.avg_spend_per_tourist, rel=1e-3)
    assert m["hotel_rooms"]["values"]["GA"]["value"] is not None
    leader = m["total_visits"]["leader"]
    assert m["total_visits"]["values"][leader]["value"] == max(v["value"] for v in m["total_visits"]["values"].values())
    assert m["rank_total_visits"]["higher_is_better"] is False
    assert len(d["series"]["KL"]) == 11 and all(v["is_synthetic"] for v in m["total_visits"]["values"].values())


@pytest.mark.parametrize("q", ["states=KL", "states=KL,GA,RJ,TN", "", "states=KL,KL"])
def test_compare_needs_two_or_three(client, q):
    r = client.get(f"/api/compare?{q}")
    assert r.status_code == 422 and r.json()["error"]["code"] in ("compare_needs_2_or_3_states", "duplicate_states")


def test_scatter(client, annual):
    d = get(client, "/api/scatter?year=2024")
    pts = d["data"]["points"]
    assert len(pts) == 36 and max(p["bubble_size"] for p in pts) == 1.0
    kl = next(p for p in pts if p["state_code"] == "KL")
    row = annual[(annual.state_code == "KL") & (annual.year == 2024)].iloc[0]
    assert kl["revenue_per_tourist"] == pytest.approx(row.tourism_revenue_cr * 1e7 / (row.domestic_visits + row.foreign_visits))
    assert all(p["is_synthetic"] for p in pts) and d["meta"]["synthetic_share"] == 100
    assert get(client, "/api/scatter?include_synthetic=false")["data"]["points"] == []
    assert {p["region"] for p in get(client, "/api/scatter?region=Islands")["data"]["points"]} == {"Islands"}
