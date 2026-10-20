"""National / filtered aggregates: KPIs and annual trend."""
import pandas as pd

from app.config import settings
from app.services import data, derived
from app.services.filters import Filters, filter_all
from app.services.formatting import fmt_count, fmt_crore, fmt_pct

UP, DOWN, FLAT, NONE = "up", "down", "flat", "none"


def comparable(codes: set[str], year: int) -> bool:
    """2018->2019 compares undivided J&K (incl. Ladakh) with JK+LA: only valid if both or neither selected."""
    return ("JK" in codes) == ("LA" in codes) if year == 2019 else True


def _direction(cur, prev) -> str:
    if cur is None or prev is None or pd.isna(cur) or pd.isna(prev):
        return NONE
    return UP if cur > prev else DOWN if cur < prev else FLAT


def annual_scope(f: Filters) -> pd.DataFrame:
    return filter_all(data.frames().annual, f, use_years=False)


def _sum(a: pd.DataFrame, year: int, col: str):
    r = a[a["year"] == year]
    if r.empty:
        return None, False, set()
    return round(float(r[col].sum()), 2), bool(r["is_synthetic"].any()), set(r["state_code"])


def make_kpi(key, label, unit, cur, prev, syn, fmt, *, pct_points=False, note=None, **extra) -> dict:
    cur_v, prev_v = cur, prev
    chg = None if cur_v is None or prev_v is None else round(cur_v - prev_v, 2)
    if pct_points:
        pct = chg
        disp = None if chg is None else f"{chg:+.1f} pp"
    else:
        pct = derived.pct_change(cur_v, prev_v)
        disp = fmt_pct(pct, signed=True)
    return {"key": key, "label": label, "unit": unit, "value": cur_v, "display": fmt(cur_v),
            "previous_value": prev_v, "previous_display": fmt(prev_v), "change_abs": chg,
            "change_pct": pct, "change_display": disp, "direction": _direction(cur_v, prev_v),
            "is_synthetic": syn, "note": note, **extra}


def _growth(a: pd.DataFrame, year: int, col: str):
    cur, s1, c1 = _sum(a, year, col)
    prev, s2, c2 = _sum(a, year - 1, col)
    if cur is None or prev is None or not comparable(c1, year):
        return None, s1 or s2
    return derived.pct_change(cur, prev), s1 or s2


def build_kpis(f: Filters) -> tuple[dict, list[bool]]:
    a = annual_scope(f)
    year = f.year or data.latest_year()
    vcol, rcol = derived.visits_col(f.visitor_type), derived.revenue_col(f.visitor_type)
    kpis = []
    for key, label, col, fmt in (("total_domestic", "Domestic visits", "domestic_visits", fmt_count),
                                 ("total_foreign", "Foreign visits", "foreign_visits", fmt_count),
                                 ("revenue", "Tourism revenue", rcol, fmt_crore)):
        cur, s1, codes = _sum(a, year, col)
        prev, s2, _ = _sum(a, year - 1, col)
        note = None
        if cur is not None and prev is not None and not comparable(codes, year):
            prev, note = None, "boundary_change: J&K/Ladakh split in 2019; previous year not comparable for this selection"
        kpis.append(make_kpi(key, label, "INR crore" if key == "revenue" else "visits", cur, prev, s1 or s2, fmt, note=note))
    g, gs = _growth(a, year, vcol)
    gp, gps = _growth(a, year - 1, vcol)
    kpis.append(make_kpi("yoy_growth", "YoY growth of visits", "%", g, gp, gs or gps, lambda v: fmt_pct(v, signed=True),
                     pct_points=True, note=None if g is not None else "not_available: no comparable previous year"))
    # top state
    cur = a[a["year"] == year]
    if cur.empty:
        kpis.append(make_kpi("top_state", "Top state", "visits", None, None, False, fmt_count, note="not_available"))
    else:
        top = cur.sort_values([vcol, "state_code"], ascending=[False, True]).iloc[0]
        prv = a[a["year"] == year - 1]
        ptop = prv.sort_values([vcol, "state_code"], ascending=[False, True]).iloc[0] if not prv.empty else None
        same = prv[(prv["state_code"] == top["state_code"]) & (prv["boundary_basis"] == top["boundary_basis"])]
        pv = float(same[vcol].iloc[0]) if not same.empty else None
        syn = bool(top["is_synthetic"] or (not same.empty and same["is_synthetic"].iloc[0]))
        kpis.append(make_kpi("top_state", "Top state", "visits", float(top[vcol]), pv, syn, fmt_count,
                         state_code=top["state_code"], state_name=top["state_name"],
                         previous_state_code=None if ptop is None else ptop["state_code"],
                         share_pct=round(float(top[vcol]) / float(cur[vcol].sum()) * 100, 2)))
    return ({"year": year, "previous_year": year - 1 if year - 1 in data.years() else None, "kpis": kpis},
            [k["is_synthetic"] for k in kpis])


def build_trend(f: Filters) -> tuple[dict, list[bool]]:
    a = annual_scope(f)
    vcol = derived.visits_col(f.visitor_type)
    rcol = derived.revenue_col(f.visitor_type)
    series, totals = [], {}
    for y in sorted(a["year"].unique()):
        r = a[a["year"] == y]
        total = float(r[vcol].sum())
        totals[int(y)] = (total, bool(r["is_synthetic"].any()))
        g, note = None, None
        if y - 1 in totals:
            prev_codes = set(a[a["year"] == y - 1]["state_code"])
            if comparable(set(r["state_code"]), int(y)):
                g = derived.pct_change(total, totals[y - 1][0])
            else:
                note = "boundary_change: J&K/Ladakh split in 2019 not comparable for this selection"
        series.append({
            "year": int(y), "domestic_visits": float(r["domestic_visits"].sum()),
            "foreign_visits": float(r["foreign_visits"].sum()), "total_visits": total,
            "revenue_cr": round(float(r[rcol].sum()), 2), "forex_cr": round(float(r["forex_earnings_cr"].sum()), 2),
            "total_display": fmt_count(total), "revenue_display": fmt_crore(float(r[rcol].sum())),
            "yoy_total_pct": g, "yoy_note": note, "is_synthetic": bool(r["is_synthetic"].any())})
    ann = []
    c0, c1 = settings.covid_years
    base_y = settings.covid_baseline_year
    if base_y in totals and any(y in totals for y in (c0, c1)):
        base_v, bs = totals[base_y]
        trough_y = min((y for y in (c0, c1) if y in totals), key=lambda y: totals[y][0])
        trough_v, ts = totals[trough_y]
        rec = next((y for y in sorted(totals) if y > c1 and totals[y][0] >= base_v), None)
        drop = derived.pct_change(trough_v, base_v)
        desc = (f"Visits fell {abs(drop):.1f}% from {base_y} ({fmt_count(base_v)}) to {trough_y} ({fmt_count(trough_v)})."
                + (f" They regained the {base_y} level in {rec}." if rec else f" They had not regained the {base_y} level by the last year in the data."))
        ann.append({"id": "covid_dip", "type": "covid", "label": "COVID-19 dip", "year_from": c0, "year_to": c1,
                    "baseline_year": base_y, "baseline_value": base_v, "trough_year": trough_y,
                    "trough_value": trough_v, "drop_pct": drop, "recovery_year": rec,
                    "description": desc, "is_synthetic": bs or ts})
    return {"series": series, "annotations": ann}, [p["is_synthetic"] for p in series]
