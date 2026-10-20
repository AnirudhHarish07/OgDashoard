import pytest

from app.services import forecast as fsvc
from app.services.filters import Filters


def get(client, url):
    r = client.get(url)
    assert r.status_code == 200, r.text
    return r.json()


def test_forecast_shape_and_flags(client, annual):
    r = get(client, "/api/forecast?metric=total_visits&years=3")
    d = r["data"]
    assert [p["year"] for p in d["forecast"]] == [2026, 2027, 2028]
    assert all(p["is_forecast"] is True and p["is_synthetic"] is True for p in d["forecast"])
    assert all(p["lower"] < p["value"] < p["upper"] for p in d["forecast"])
    widths = [p["upper"] / p["lower"] for p in d["forecast"]]
    assert widths == sorted(widths) and widths[-1] > widths[0]  # uncertainty grows with horizon
    assert all(h["is_forecast"] is False for h in d["history"])
    last = d["history"][-1]
    y = annual[annual.year == 2025]
    assert last["year"] == 2025 and last["value"] == (y.domestic_visits + y.foreign_visits).sum()
    assert r["meta"]["synthetic_share"] == 100


def test_covid_years_excluded_from_training(client):
    d = get(client, "/api/forecast?metric=total_visits")["data"]
    assert d["model"]["excluded_years"] == [2020, 2021]
    assert 2020 not in d["model"]["training_years"] and 2021 not in d["model"]["training_years"]
    h = {p["year"]: p for p in d["history"]}
    assert h[2020]["used_in_training"] is False and h[2020]["excluded_reason"] == "covid_outlier"
    assert h[2019]["used_in_training"] is True
    # COVID collapse must not drag the projection down: growth stays positive, forecast is near the recent level
    assert d["model"]["implied_annual_growth_pct"] > 0
    assert 0.9 * h[2025]["value"] < d["forecast"][0]["value"] < 1.4 * h[2025]["value"]


def test_state_scope_and_options(client, annual):
    d = get(client, "/api/forecast?state=ga&metric=foreign_visits&years=2")["data"]
    assert d["scope"]["states"] == ["GA"] and len(d["forecast"]) == 2
    ga = annual[(annual.state_code == "GA") & (annual.year == 2025)].foreign_visits.iloc[0]
    assert d["history"][-1]["value"] == ga
    narrow = get(client, "/api/forecast?state=GA&metric=revenue&confidence=0.8")["data"]["forecast"][0]
    wide = get(client, "/api/forecast?state=GA&metric=revenue&confidence=0.95")["data"]["forecast"][0]
    assert narrow["upper"] - narrow["lower"] < wide["upper"] - wide["lower"]
    assert narrow["value"] == pytest.approx(wide["value"])


def test_short_history_and_boundary_note(client):
    la = get(client, "/api/forecast?state=LA")["data"]
    assert la["model"]["training_years"] == [2019, 2022, 2023, 2024, 2025]
    jk = get(client, "/api/forecast?state=JK")
    assert any("boundary_change" in n for n in jk["data"]["notes"])


def test_validation_and_synthetic_toggle(client):
    assert client.get("/api/forecast?state=ZZ").status_code == 422
    assert client.get("/api/forecast?years=9").status_code == 422
    assert client.get("/api/forecast?metric=growth_pct").status_code == 422
    d = get(client, "/api/forecast?include_synthetic=false")["data"]
    assert d["forecast"] == [] and d["model"] is None and "not_available" in d["notes"][0]


def test_results_are_cached(client, fresh_caches):
    get(client, "/api/forecast?state=KL&metric=total_visits")
    n = len(fsvc.forecast.cache)
    get(client, "/api/forecast?state=KL&metric=total_visits")
    assert len(fsvc.forecast.cache) == n and n >= 1
    assert fsvc.forecast("total_visits", Filters(states=("KL",)), 3, 0.95) is fsvc.forecast("total_visits", Filters(states=("KL",)), 3, 0.95)
