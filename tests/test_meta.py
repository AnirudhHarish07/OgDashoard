from app.db import TABLES, connect_ro


def test_health_counts_match_db(client):
    r = client.get("/api/health").json()["data"]
    assert r["status"] == "ok"
    conn = connect_ro()
    for t in TABLES:
        assert r["row_counts"][t] == conn.execute(f"select count(*) from {t}").fetchone()[0]


def test_db_is_read_only():
    import sqlite3
    import pytest
    conn = connect_ro()
    with pytest.raises(sqlite3.OperationalError):
        conn.execute("create table x (a int)")
    with pytest.raises(sqlite3.OperationalError):
        conn.execute("delete from states")


def test_filters_lists_dataset_values(client):
    d = client.get("/api/filters").json()["data"]
    assert d["years"] == list(range(2015, 2026))
    codes = {s["state_code"] for s in d["states"]}
    assert {"JK", "LA", "DD", "TS"} <= codes and len(codes) == 36
    la = next(s for s in d["states"] if s["state_code"] == "LA")
    assert la["first_year"] == 2019
    assert "heritage" in d["tourism_types"]
    assert {m["key"] for m in d["metrics"]} >= {"total_visits", "growth_pct", "visits_per_1000_people"}


def test_sources_reports_full_synthetic_share(client):
    r = client.get("/api/sources").json()
    assert len(r["data"]["tables"]) == 10
    assert all(t["synthetic_share"] == 100 for t in r["data"]["tables"])
    assert r["meta"]["synthetic_share"] == 100


def test_error_shape(client):
    r = client.get("/api/map?metric=total_visits&states=ZZ")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "unknown_state"
    r = client.get("/api/map?metric=bogus")
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
