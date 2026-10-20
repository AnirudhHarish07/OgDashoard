import pytest

from app.services import data


def get(client, url):
    r = client.get(url)
    assert r.status_code == 200, r.text
    return r.json()


def test_heatmap_matches_monthly_table(client):
    d = get(client, "/api/seasonality/heatmap?year=2023")["data"]
    assert len(d["rows"]) == 36 and d["months"] == list(range(1, 13))
    m = data.frames().tourism_monthly
    kl = next(r for r in d["rows"] if r["state_code"] == "KL")
    src = m[(m.state_code == "KL") & (m.year == 2023)].sort_values("month")
    assert [c["value"] for c in kl["cells"]] == list((src.domestic_visits + src.foreign_visits).astype(float))
    assert sum(c["share_of_year_pct"] for c in kl["cells"]) == pytest.approx(100, abs=0.1)
    assert max(c["intensity_row"] for c in kl["cells"]) == 1.0
    assert kl["peak_month"] == next(c["month"] for c in kl["cells"] if c["intensity_row"] == 1.0)


def test_heatmap_filters_and_visitor_type(client):
    d = get(client, "/api/seasonality/heatmap?year=2023&states=GA,KL&visitor_type=foreign")["data"]
    assert {r["state_code"] for r in d["rows"]} == {"GA", "KL"}
    m = data.frames().tourism_monthly
    ga = next(r for r in d["rows"] if r["state_code"] == "GA")
    assert ga["year_total"] == m[(m.state_code == "GA") & (m.year == 2023)].foreign_visits.sum()
    assert get(client, "/api/seasonality/heatmap?year=2023&include_synthetic=false")["data"]["rows"] == []
    # Ladakh has no monthly rows before 2019
    codes = {r["state_code"] for r in get(client, "/api/seasonality/heatmap?year=2018")["data"]["rows"]}
    assert "LA" not in codes and len(codes) == 35


def test_by_type_curves(client):
    d = get(client, "/api/seasonality/by-type?year=2023")
    curves = {c["tourism_type"]: c for c in d["data"]["curves"]}
    assert set(curves) == set(data.tag_set())
    beach = curves["beach"]
    states = data.frames().states
    expected = {r.state_code for r in states.itertuples() if "beach" in r.tourism_type_tags.split(";")}
    assert set(beach["state_codes"]) == expected and beach["n_states"] == len(expected)
    m = data.frames().tourism_monthly
    jan = m[(m.year == 2023) & (m.month == 1) & m.state_code.isin(expected)]
    assert beach["months"][0]["value"] == (jan.domestic_visits + jan.foreign_visits).sum()
    assert sum(x["share_of_year_pct"] for x in beach["months"]) == pytest.approx(100, abs=0.1)
    assert any("counted in each" in n for n in d["meta"]["notes"])
    only = get(client, "/api/seasonality/by-type?tourism_type=hill")["data"]["curves"]
    assert [c["tourism_type"] for c in only] == ["hill"]


def test_festivals_filters(client):
    allf = get(client, "/api/festivals")["data"]
    assert len(allf["events"]) == 108 and sum(m["count"] for m in allf["by_month"]) == 108
    m10 = get(client, "/api/festivals?month=10")["data"]
    assert m10["events"] and {e["month"] for e in m10["events"]} == {10}
    assert len(m10["by_month"]) == 12 and sum(m["count"] for m in m10["by_month"]) == 108
    ga = get(client, "/api/festivals?state=ga")["data"]["events"]
    assert ga and {e["state_code"] for e in ga} == {"GA"}
    both = get(client, "/api/festivals?state=GA&month=2")["data"]["events"]
    assert {e["month"] for e in both} == {2}
    assert client.get("/api/festivals?month=13").status_code == 422
    assert client.get("/api/festivals?state=ZZ").json()["error"]["code"] == "unknown_state"
    assert get(client, "/api/festivals?include_synthetic=false")["data"]["events"] == []
    assert get(client, "/api/festivals")["meta"]["synthetic_share"] == 100
