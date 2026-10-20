"""Flat-row builders per export view. Each `view_<name>(Filters, params)` returns (rows, resolved)."""
import pandas as pd

from app.services import anomalies as anomalies_svc
from app.services import data
from app.services import economy as economy_svc
from app.services import forecast as forecast_svc
from app.services import overview, ranking
from app.services import seasonality as seasonality_svc
from app.services.filters import filter_states
from app.services.mapping import build_map


def _year(f):
    return f.year or data.latest_year()


def view_map(f, p):
    y = _year(f)
    rows = list(build_map(p["metric"], y, f.visitor_type, f.include_synthetic))
    if rows:
        keep = set(filter_states(pd.DataFrame(rows), f).state_code)
        rows = [{k: x for k, x in r.items() if k != "tourism_type_tags"} for r in rows if r["state_code"] in keep]
    return rows, {"metric": p["metric"], "year": y}


def view_rankings(f, p):
    y = _year(f)
    return list(ranking.rankings(p["metric"], y, f, p["order"], p["n"])), {"metric": p["metric"], "year": y}


def view_race(f, p):
    d = ranking.race(p["metric"], f, p["n"])
    return [{"year": fr["year"], **i} for fr in d["frames"] for i in fr["items"]], {"metric": p["metric"]}


def view_trend(f, p):
    return overview.build_trend(f)[0]["series"], {}


def view_kpis(f, p):
    d = overview.build_kpis(f)[0]
    return [{"year": d["year"], **k} for k in d["kpis"]], {"year": d["year"]}


def view_compare(f, p):
    d, _ = ranking.compare(f.states, _year(f), f.include_synthetic)
    return [{"year": d["year"], "metric": m["key"], "label": m["label"], "unit": m["unit"], "state_code": c, **val}
            for m in d["metrics"] for c, val in m["values"].items()], {"year": d["year"]}


def view_scatter(f, p):
    return ranking.scatter(_year(f), f)[0]["points"], {"year": _year(f)}


def view_heatmap(f, p):
    d, _ = seasonality_svc.heatmap(_year(f), f)
    return [{"state_code": r["state_code"], "state_name": r["state_name"], "region": r["region"], "year": d["year"], **c}
            for r in d["rows"] for c in r["cells"]], {"year": d["year"]}


def view_seasonality_by_type(f, p):
    d, _ = seasonality_svc.by_type(_year(f), f)
    return [{"tourism_type": c["tourism_type"], "n_states": c["n_states"], "year": d["year"], **m}
            for c in d["curves"] for m in c["months"]], {"year": d["year"]}


def view_festivals(f, p):
    return seasonality_svc.festivals(f, p.get("month"))[0]["events"], {}


def view_economy(f, p):
    return economy_svc.economy(_year(f), f)[0]["states"], {"year": _year(f)}


def view_demand_capacity(f, p):
    return economy_svc.demand_capacity(_year(f), f)[0]["states"], {"year": _year(f)}


def view_occupancy_trend(f, p):
    d, _ = economy_svc.occupancy_trend(f)
    rows = [{"state_code": "ALL", "state_name": "All selected states (room-weighted)", "year": n["year"],
             "occupancy_rate": n["weighted_occupancy_rate"], "hotel_rooms": n["hotel_rooms"], "is_synthetic": n["is_synthetic"]}
            for n in d["national"]]
    rows += [{"state_code": s["state_code"], "state_name": s["state_name"], "region": s["region"], **pt}
             for s in d["states"] for pt in s["points"]]
    return rows, {}


def view_covid_recovery(f, p):
    y = _year(f)
    return economy_svc.covid_recovery(y, f)[0]["states"], {"year": y}


def view_forecast(f, p):
    d = forecast_svc.forecast(p["metric"], f, p["years"], 0.95)
    return [{**h, "kind": "history"} for h in d["history"]] + [{**x, "kind": "forecast"} for x in d["forecast"]], {"metric": p["metric"]}


def view_anomalies(f, p):
    return anomalies_svc.detect(p["metric"], f, 2.0, 500)[0]["anomalies"], {"metric": p["metric"]}
