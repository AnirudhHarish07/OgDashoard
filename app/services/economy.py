"""Economy, infrastructure and COVID-recovery analytics (all derived from dataset values)."""
import numpy as np
import pandas as pd

from app.config import settings
from app.services import data, derived
from app.services.cache import ttl_cached
from app.services.filters import Filters, filter_states, resolve_years
from app.services.formatting import fmt_count, fmt_crore, fmt_number, fmt_pct, fmt_rupees


def _pct(v):
    return None if v is None or pd.isna(v) else f"{v:.2f}%"


def economy(year: int, f: Filters) -> tuple[dict, list[bool]]:
    a = data.frames().annual
    a = a[a.year == year]
    if not f.include_synthetic:
        a = a[~a.is_synthetic]
    a = filter_states(a, f)
    vcol, rcol = derived.visits_col(f.visitor_type), derived.revenue_col(f.visitor_type)
    a = a.assign(rev=a[rcol], vis=a[vcol])
    a["rpt"] = a.rev * 1e7 / a.vis
    a["gshare"] = a.rev / a.gsdp_cr * 100
    a["fshare"] = a.forex_earnings_cr / a.tourism_revenue_cr * 100
    for c in ("gshare", "rpt", "forex_earnings_cr"):
        a[f"rank_{c}"] = a[c].rank(method="min", ascending=False).astype(int)
    rows = []
    for r in a.sort_values("gshare", ascending=False).itertuples():
        rows.append({"state_code": r.state_code, "state_name": r.state_name, "region": r.region,
                     "revenue_cr": float(r.rev), "revenue_display": fmt_crore(r.rev),
                     "gsdp_cr": float(r.gsdp_cr), "gsdp_display": fmt_crore(r.gsdp_cr),
                     "tourism_share_of_gsdp": round(float(r.gshare), 4), "tourism_share_display": _pct(r.gshare),
                     "revenue_per_tourist": round(float(r.rpt), 2), "revenue_per_tourist_display": fmt_rupees(r.rpt),
                     "forex_earnings_cr": float(r.forex_earnings_cr), "forex_display": fmt_crore(r.forex_earnings_cr),
                     "forex_share_of_revenue_pct": round(float(r.fshare), 2),
                     "tourism_employment": int(r.tourism_employment),
                     "rank_gsdp_share": int(r.rank_gshare), "rank_revenue_per_tourist": int(r.rank_rpt),
                     "rank_forex": int(r.rank_forex_earnings_cr), "is_synthetic": bool(r.is_synthetic)})
    summary = None
    if len(a):
        summary = {"revenue_cr": float(a.rev.sum()), "revenue_display": fmt_crore(a.rev.sum()),
                   "forex_earnings_cr": float(a.forex_earnings_cr.sum()), "forex_display": fmt_crore(a.forex_earnings_cr.sum()),
                   "gsdp_cr": float(a.gsdp_cr.sum()), "tourism_share_of_gsdp": round(float(a.rev.sum() / a.gsdp_cr.sum() * 100), 4),
                   "revenue_per_tourist": round(float(a.rev.sum() * 1e7 / a.vis.sum()), 2),
                   "revenue_per_tourist_display": fmt_rupees(a.rev.sum() * 1e7 / a.vis.sum()), "is_synthetic": bool(a.is_synthetic.any())}
    return {"year": year, "summary": summary, "states": rows}, [r["is_synthetic"] for r in rows]


# ---- infrastructure --------------------------------------------------------

def demand_capacity(year: int, f: Filters) -> tuple[dict, list[bool]]:
    fr = data.frames()
    a = fr.annual[fr.annual.year == year]
    inf = fr.infrastructure[fr.infrastructure.year == year][["state_code", "hotel_rooms", "hotels_total", "occupancy_rate", "is_synthetic"]]
    m = a.merge(inf.rename(columns={"is_synthetic": "infra_syn"}), on="state_code")
    if not f.include_synthetic:
        m = m[~(m.is_synthetic | m.infra_syn)]
    m = m.assign(vis=m[derived.visits_col(f.visitor_type)])
    m["vpr"] = m.vis / m.hotel_rooms
    out = {"year": year, "thresholds": None, "states": []}
    if m.empty:
        return out, []
    q25, med, q75 = (float(m.vpr.quantile(q)) for q in (0.25, 0.5, 0.75))  # thresholds from ALL states, then filter
    out["thresholds"] = {"p25": round(q25, 2), "median": round(med, 2), "p75": round(q75, 2),
                         "method": "quartiles of visits per hotel room across all states for the year; under_served = above p75, over_supplied = below p25"}
    m = filter_states(m, f)
    for r in m.sort_values("vpr", ascending=False).itertuples():
        status = "under_served" if r.vpr > q75 else "over_supplied" if r.vpr < q25 else "balanced"
        out["states"].append({
            "state_code": r.state_code, "state_name": r.state_name, "region": r.region,
            "visits": float(r.vis), "visits_display": fmt_count(r.vis), "hotel_rooms": int(r.hotel_rooms),
            "hotel_rooms_display": fmt_count(r.hotel_rooms), "hotels_total": int(r.hotels_total),
            "visits_per_room": round(float(r.vpr), 2), "occupancy_rate": float(r.occupancy_rate), "status": status,
            "under_served": status == "under_served",
            "rooms_to_reach_median_ratio": int(max(0, np.ceil(r.vis / med - r.hotel_rooms))),
            "is_synthetic": bool(r.is_synthetic or r.infra_syn)})
    return out, [s["is_synthetic"] for s in out["states"]]


def occupancy_trend(f: Filters) -> tuple[dict, list[bool]]:
    fr = data.frames()
    i = data.with_state_info(fr.infrastructure)
    i = i[i.year.isin(resolve_years(f))]
    if not f.include_synthetic:
        i = i[~i.is_synthetic]
    i = filter_states(i, f)
    national = []
    for y, g in i.groupby("year"):
        w = float((g.occupancy_rate * g.hotel_rooms).sum() / g.hotel_rooms.sum())
        national.append({"year": int(y), "weighted_occupancy_rate": round(w, 2),
                         "mean_occupancy_rate": round(float(g.occupancy_rate.mean()), 2),
                         "hotel_rooms": int(g.hotel_rooms.sum()), "n_states": int(len(g)), "is_synthetic": bool(g.is_synthetic.any())})
    states = [{"state_code": c, "state_name": g.state_name.iloc[0], "region": g.region.iloc[0],
               "points": [{"year": int(r.year), "occupancy_rate": float(r.occupancy_rate), "hotel_rooms": int(r.hotel_rooms),
                           "is_synthetic": bool(r.is_synthetic)} for r in g.sort_values("year").itertuples()]}
              for c, g in i.groupby("state_code")]
    flags = [p["is_synthetic"] for p in national] + [p["is_synthetic"] for s in states for p in s["points"]]
    return {"national": national, "states": states}, flags


# ---- covid -------------------------------------------------------------------

def _rec(cur, base):
    return None if not base else round(float(cur) / float(base) * 100, 2)


@ttl_cached()
def covid_recovery(year: int, f: Filters) -> tuple[dict, tuple[bool, ...]]:
    a = data.frames().annual
    if not f.include_synthetic:
        a = a[~a.is_synthetic]
    a = filter_states(a, f)
    base_y, (c0, c1) = settings.covid_baseline_year, settings.covid_years
    vcol = derived.visits_col(f.visitor_type)
    rows = []
    for code, g in a.groupby("state_code"):
        g = g.set_index("year")
        if base_y not in g.index or year not in g.index:
            continue
        b, cur = g.loc[base_y], g.loc[year]
        dip = {y: g.loc[y] for y in (c0, c1) if y in g.index}
        if not dip:
            continue
        trough_y = min(dip, key=lambda y: dip[y][vcol])
        used = [b, cur, *dip.values()]
        later = g[(g.index > c1) & (g.index <= year) & (g[vcol] >= b[vcol])]
        rows.append({
            "state_code": code, "state_name": b.state_name, "region": b.region,
            "baseline_year": base_y, "baseline_visits": float(b[vcol]), "baseline_display": fmt_count(b[vcol]),
            "covid_visits": {str(y): float(r[vcol]) for y, r in dip.items()},
            "drop_pct": {str(y): derived.pct_change(r[vcol], b[vcol]) for y, r in dip.items()},
            "trough_year": int(trough_y), "trough_drop_pct": derived.pct_change(dip[trough_y][vcol], b[vcol]),
            "latest_year": year, "latest_visits": float(cur[vcol]), "latest_display": fmt_count(cur[vcol]),
            "recovery_pct": _rec(cur[vcol], b[vcol]), "recovery_display": fmt_pct(_rec(cur[vcol], b[vcol])),
            "recovered": bool(cur[vcol] >= b[vcol]), "recovery_year": int(later.index.min()) if len(later) else None,
            "domestic": {"baseline": float(b.domestic_visits), "trough": float(dip[trough_y].domestic_visits), "latest": float(cur.domestic_visits),
                         "trough_drop_pct": derived.pct_change(dip[trough_y].domestic_visits, b.domestic_visits),
                         "recovery_pct": _rec(cur.domestic_visits, b.domestic_visits)},
            "foreign": {"baseline": float(b.foreign_visits), "trough": float(dip[trough_y].foreign_visits), "latest": float(cur.foreign_visits),
                        "trough_drop_pct": derived.pct_change(dip[trough_y].foreign_visits, b.foreign_visits),
                        "recovery_pct": _rec(cur.foreign_visits, b.foreign_visits)},
            "is_synthetic": any(bool(x.is_synthetic) for x in used)})
    rows.sort(key=lambda r: (-r["recovery_pct"], r["state_code"]))
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    summary = None
    if rows:
        tb = sum(r["baseline_visits"] for r in rows)
        tl = sum(r["latest_visits"] for r in rows)
        summary = {"baseline_visits": tb, "latest_visits": tl, "recovery_pct": _rec(tl, tb),
                   "states_recovered": sum(r["recovered"] for r in rows), "n_states": len(rows),
                   "is_synthetic": any(r["is_synthetic"] for r in rows)}
    return ({"baseline_year": base_y, "covid_years": [c0, c1], "latest_year": year, "summary": summary, "states": rows},
            tuple(r["is_synthetic"] for r in rows))
