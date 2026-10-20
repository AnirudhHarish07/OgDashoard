"""Monthly seasonality: state x month heatmap, curves by tourism type, festival calendar."""
import calendar

import numpy as np
import pandas as pd

from app.services import data, derived
from app.services.filters import Filters, filter_states
from app.services.formatting import fmt_count


def _monthly(year: int, f: Filters) -> pd.DataFrame:
    m = data.with_state_info(data.frames().tourism_monthly)
    m = m[m.year == year].copy()
    m["total_visits"] = m.domestic_visits + m.foreign_visits
    m["value"] = m[derived.visits_col(f.visitor_type)]
    if not f.include_synthetic:
        m = m[~m.is_synthetic]
    return m


def heatmap(year: int, f: Filters) -> tuple[dict, list[bool]]:
    m = filter_states(_monthly(year, f), f)
    gmax = float(m.value.max()) if len(m) else 0.0
    rows, flags = [], []
    for code, g in m.groupby("state_code"):
        g = g.sort_values("month")
        vals = g.value.astype(float).to_numpy()
        total, rmax = vals.sum(), vals.max()
        cells = []
        for r, v in zip(g.itertuples(), vals):
            cells.append({"month": int(r.month), "value": float(v), "display": fmt_count(v),
                          "share_of_year_pct": round(v / total * 100, 2) if total else None,
                          "intensity_row": round(v / rmax, 4) if rmax else None,
                          "intensity_global": round(v / gmax, 4) if gmax else None,
                          "is_synthetic": bool(r.is_synthetic)})
        flags += [c["is_synthetic"] for c in cells]
        mn = vals.min()
        rows.append({"state_code": code, "state_name": g.state_name.iloc[0], "region": g.region.iloc[0],
                     "peak_month": int(g.month.iloc[int(vals.argmax())]), "low_month": int(g.month.iloc[int(vals.argmin())]),
                     "peak_to_low_ratio": round(float(rmax / mn), 2) if mn else None,
                     "year_total": float(total), "cells": cells})
    rows.sort(key=lambda r: r["state_code"])
    return {"year": year, "months": list(range(1, 13)), "month_names": list(calendar.month_abbr)[1:],
            "max_value": gmax or None, "rows": rows}, flags


def by_type(year: int, f: Filters) -> tuple[dict, list[bool]]:
    fr = data.frames()
    m = _monthly(year, f)
    scope = filter_states(fr.states.assign(), f.with_(tourism_type=None))
    curves, flags = [], []
    for tag in ([f.tourism_type] if f.tourism_type else data.tag_set()):
        codes = [r.state_code for r in scope.itertuples() if tag in (r.tourism_type_tags or "").split(";")]
        g = m[m.state_code.isin(codes)].groupby("month").agg(value=("value", "sum"), syn=("is_synthetic", "any"))
        if g.empty:
            continue
        mean, total = g.value.mean(), g.value.sum()
        months = [{"month": int(mo), "month_name": calendar.month_abbr[int(mo)], "value": float(r.value), "display": fmt_count(r.value),
                   "share_of_year_pct": round(r.value / total * 100, 2), "seasonal_index": round(r.value / mean * 100, 1),
                   "is_synthetic": bool(r.syn)} for mo, r in g.iterrows()]
        flags += [x["is_synthetic"] for x in months]
        curves.append({"tourism_type": tag, "n_states": len(codes), "state_codes": sorted(codes),
                       "peak_month": months[int(np.argmax([x["value"] for x in months]))]["month"],
                       "low_month": months[int(np.argmin([x["value"] for x in months]))]["month"], "months": months})
    return {"year": year, "curves": curves}, flags


def festivals(f: Filters, month: int | None) -> tuple[dict, list[bool]]:
    fe = data.with_state_info(data.frames().festivals_events)
    fe = filter_states(fe, f)
    if not f.include_synthetic:
        fe = fe[~fe.is_synthetic]
    counts = fe.groupby("month").size()
    by_month = [{"month": mo, "month_name": calendar.month_abbr[mo], "count": int(counts.get(mo, 0))} for mo in range(1, 13)]
    if month:
        fe = fe[fe.month == month]
    ev = [{"name": r.name, "state_code": r.state_code, "state_name": r.state_name, "region": r.region, "month": int(r.month),
           "month_name": calendar.month_abbr[int(r.month)], "type": r.type, "is_synthetic": bool(r.is_synthetic)}
          for r in fe.sort_values(["month", "state_code", "name"]).itertuples()]
    return {"month": month, "events": ev, "by_month": by_month}, [e["is_synthetic"] for e in ev]
