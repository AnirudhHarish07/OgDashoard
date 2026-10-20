import pytest


@pytest.mark.parametrize("q,code", [("year=1999", "year_not_available"), ("region=Mars", "unknown_region"),
                                    ("tourism_type=casino", "unknown_tourism_type"),
                                    ("year_from=2022&year_to=2019", "bad_year_range")])
def test_bad_filters_rejected(client, q, code):
    r = client.get(f"/api/overview/kpis?{q}")
    assert r.status_code == 422 and r.json()["error"]["code"] == code


def test_meta_block_on_every_response(client):
    for u in ["/api/overview/kpis", "/api/overview/trend", "/api/map?metric=revenue", "/api/filters", "/api/sources", "/api/health"]:
        m = client.get(u).json()["meta"]
        assert {"filters", "data_sources", "synthetic_share"} <= set(m)


def test_include_synthetic_false_returns_nothing(client):
    r = client.get("/api/map?metric=total_visits&include_synthetic=false").json()
    assert r["data"]["states"] == [] and r["meta"]["record_count"] == 0
    k = client.get("/api/overview/kpis?include_synthetic=false").json()["data"]
    assert all(x["value"] is None for x in k["kpis"])


def test_region_and_type_and_states_filters(client):
    r = client.get("/api/map?metric=total_visits&region=south&year=2024").json()["data"]["states"]
    assert {s["region"] for s in r} == {"South"}
    r = client.get("/api/map?metric=total_visits&states=kl,ga&year=2024").json()["data"]["states"]
    assert {s["state_code"] for s in r} == {"KL", "GA"}
    r = client.get("/api/map?metric=total_visits&tourism_type=beach&year=2024").json()["data"]["states"]
    assert "GA" in {s["state_code"] for s in r} and "DL" not in {s["state_code"] for s in r}
