import csv
import io

import pytest

from app.services import export


def rows(client, url):
    r = client.get(url)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    return list(csv.DictReader(io.StringIO(r.text))), r


@pytest.mark.parametrize("view", export.VIEWS)
def test_every_view_exports_with_provenance_columns(client, view):
    q = f"/api/export?view={view}" + ("&states=KL,GA" if view == "compare" else "")
    data_rows, r = rows(client, q)
    assert data_rows, view
    assert {"is_synthetic", "data_source"} <= set(data_rows[0])
    assert all(x["data_source"].startswith("SYNTHETIC") for x in data_rows[:5])
    assert 'attachment; filename="india_tourism_' in r.headers["content-disposition"]
    assert int(r.headers["x-record-count"]) == len(data_rows) and float(r.headers["x-synthetic-share"]) == 100


def test_export_matches_api_and_dataset(client, annual):
    d, _ = rows(client, "/api/export?view=map&metric=total_visits&year=2024")
    api = client.get("/api/map?metric=total_visits&year=2024").json()["data"]["states"]
    assert len(d) == len(api) == 36
    assert sum(float(x["value"]) for x in d) == (annual[annual.year == 2024].domestic_visits + annual[annual.year == 2024].foreign_visits).sum()
    assert [x["state_code"] for x in d] == [s["state_code"] for s in api]
    cov, _ = rows(client, "/api/export?view=covid_recovery")
    js = client.get("/api/covid/recovery").json()["data"]["states"]
    assert [float(x["recovery_pct"]) for x in cov] == [s["recovery_pct"] for s in js]
    assert "domestic.recovery_pct" in cov[0]  # nested fields are flattened


def test_export_respects_filters_and_params(client):
    d, _ = rows(client, "/api/export?view=rankings&metric=revenue&order=bottom&n=4&region=South&year=2023")
    assert len(d) == 4 and {x["region"] for x in d} == {"South"}
    d, _ = rows(client, "/api/export?view=heatmap&states=GA&year=2022")
    assert len(d) == 12 and {x["state_code"] for x in d} == {"GA"}
    d, _ = rows(client, "/api/export?view=forecast&state=KL&years=2")
    assert [x["kind"] for x in d].count("forecast") == 2 and all(x["is_forecast"] == "True" for x in d if x["kind"] == "forecast")
    d, _ = rows(client, "/api/export?view=festivals&month=10")
    assert d and {x["month"] for x in d} == {"10"}


def test_export_synthetic_toggle_gives_header_only(client):
    r = client.get("/api/export?view=economy&include_synthetic=false")
    assert r.status_code == 200 and r.text.strip() in ("", "is_synthetic,data_source", "is_synthetic,data_source".strip())
    assert r.headers["x-record-count"] == "0"


def test_export_errors(client):
    assert client.get("/api/export").status_code == 422
    assert client.get("/api/export?view=nope").status_code == 422
    assert client.get("/api/export?view=map&format=xlsx").status_code == 422
    assert client.get("/api/export?view=compare&states=KL").json()["error"]["code"] == "compare_needs_2_or_3_states"
    assert client.get("/api/export?view=forecast&metric=growth_pct").json()["error"]["code"] == "metric_not_supported"
