"""Derived metrics, computed only from dataset values.
A derived value is synthetic if ANY input used to compute it is synthetic."""
import numpy as np
import pandas as pd

from app.services import data
from app.services.formatting import fmt_count, fmt_crore, fmt_number, fmt_pct

METRICS = {
    "domestic_visits": {"label": "Domestic visits", "unit": "visits", "table": "tourism_annual"},
    "foreign_visits": {"label": "Foreign visits", "unit": "visits", "table": "tourism_annual"},
    "total_visits": {"label": "Total visits", "unit": "visits", "table": "tourism_annual"},
    "revenue": {"label": "Tourism revenue", "unit": "INR crore", "table": "tourism_annual"},
    "growth_pct": {"label": "YoY growth of visits", "unit": "%", "table": "tourism_annual"},
    "visits_per_1000_people": {"label": "Visits per 1,000 people", "unit": "visits per 1,000 residents",
                               "table": "tourism_annual+states"},
}


def display(metric: str, v) -> str | None:
    if metric in ("domestic_visits", "foreign_visits", "total_visits"):
        return fmt_count(v)
    if metric == "revenue":
        return fmt_crore(v)
    if metric == "growth_pct":
        return fmt_pct(v, signed=True)
    return fmt_number(v)


def visits_col(visitor_type: str) -> str:
    return {"domestic": "domestic_visits", "foreign": "foreign_visits"}.get(visitor_type, "total_visits")


def revenue_col(visitor_type: str) -> str:
    return {"domestic": "domestic_revenue_cr", "foreign": "forex_earnings_cr"}.get(visitor_type, "tourism_revenue_cr")


def with_prev(df: pd.DataFrame, col: str = "value") -> pd.DataFrame:
    """Attach prev (value one calendar year earlier, same boundary basis) and its synthetic flag."""
    p = df[["state_code", "year", col, "boundary_basis", "is_synthetic"]].copy()
    p["year"] += 1
    p = p.rename(columns={col: "prev", "boundary_basis": "prev_basis", "is_synthetic": "prev_syn"})
    m = df.merge(p, on=["state_code", "year"], how="left")
    m.loc[m["boundary_basis"] != m["prev_basis"], "prev"] = np.nan
    m["prev_syn"] = m["prev_syn"].fillna(False).astype(bool)
    return m


def pct_change(cur, prev):
    if prev is None or pd.isna(prev) or prev == 0 or cur is None or pd.isna(cur):
        return None
    return round((cur - prev) / abs(prev) * 100, 2)


def metric_frame(metric: str, visitor_type: str = "all") -> pd.DataFrame:
    """state_code, year, value, boundary_basis, is_synthetic (+ state info) for every state-year."""
    a = data.frames().annual
    base = a[["state_code", "state_name", "region", "tourism_type_tags", "year", "boundary_basis"]].copy()
    syn = a["is_synthetic"]
    if metric in ("domestic_visits", "foreign_visits", "total_visits"):
        base["value"] = a[visits_col(visitor_type) if metric == "total_visits" else metric]
        base["is_synthetic"] = syn
    elif metric == "revenue":
        base["value"] = a[revenue_col(visitor_type)]
        base["is_synthetic"] = syn
    elif metric == "visits_per_1000_people":
        base["value"] = a[visits_col(visitor_type)] / a["population"] * 1000
        base["is_synthetic"] = syn | a["pop_synthetic"]
    elif metric == "growth_pct":
        tmp = base.copy()
        tmp["value"] = a[visits_col(visitor_type)]
        tmp["is_synthetic"] = syn
        w = with_prev(tmp)
        base = w[["state_code", "state_name", "region", "tourism_type_tags", "year", "boundary_basis"]].copy()
        base["value"] = (w["value"] - w["prev"]) / w["prev"] * 100
        base["is_synthetic"] = w["is_synthetic"] | (w["prev_syn"] & w["prev"].notna())
    else:
        raise KeyError(metric)
    return base


def rank_year(df: pd.DataFrame, year: int) -> pd.DataFrame:
    """Rows for one year with rank (1 = highest, ties share the lowest rank)."""
    y = df[df["year"] == year].copy()
    y["rank"] = y["value"].rank(method="min", ascending=False)
    y.loc[y["value"].isna(), "rank"] = np.nan
    return y
