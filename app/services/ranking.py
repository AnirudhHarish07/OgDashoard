"""Rankings, bar-chart-race frames, state comparison and scatter data."""
import pandas as pd

from app.services import data, derived
from app.services.cache import ttl_cached
from app.services.filters import Filters, filter_states, resolve_years
from app.services.formatting import fmt_count, fmt_crore, fmt_number, fmt_pct, fmt_rupees
from app.services.mapping import build_map

ADDITIVE = {"domestic_visits", "foreign_visits", "total_visits", "revenue"}


def scoped_rows(metric: str, year: int, f: Filters) -> list[dict]:
    """Rows for states in scope with a rank computed within the scope (national_rank kept as well)."""
    rows = build_map(metric, year, f.visitor_type, f.include_synthetic)
    df = pd.DataFrame(list(rows))
    if df.empty:
        return []
    df = filter_states(df, f)
    df = df[df["value"].notna()].copy()
    if df.empty:
        return []
    df["scope_rank"] = df["value"].rank(method="min", ascending=False).astype(int)
    total = df["value"].sum() if metric in ADDITIVE else None
    out = []
    for r in df.sort_values(["scope_rank", "state_code"]).to_dict("records"):
        out.append({
            "rank": int(r["scope_rank"]), "national_rank": None if pd.isna(r["rank"]) else int(r["rank"]),
            "state_code": r["state_code"], "state_name": r["state_name"], "region": r["region"],
            "value": float(r["value"]), "display": None if pd.isna(r["display"]) else r["display"],
            "share_pct": round(float(r["value"]) / total * 100, 2) if total else None,
            "yoy_change": None if pd.isna(r["yoy_change"]) else float(r["yoy_change"]),
            "yoy_display": None if pd.isna(r["yoy_display"]) else r["yoy_display"], "is_synthetic": bool(r["is_synthetic"])})
    return out


@ttl_cached()
def rankings(metric: str, year: int, f: Filters, order: str, n: int) -> tuple[dict, ...]:
    rows = scoped_rows(metric, year, f)
    rows = rows[:n] if order == "top" else rows[::-1][:n]
    return tuple(rows)


@ttl_cached()
def race(metric: str, f: Filters, n: int) -> dict:
    frames, vmax, seen = [], 0.0, {}
    for y in resolve_years(f):
        rows = scoped_rows(metric, y, f)[:n]
        for r in rows:
            vmax = max(vmax, r["value"])
            seen[r["state_code"]] = {"state_code": r["state_code"], "state_name": r["state_name"], "region": r["region"]}
        if rows:
            frames.append({"year": y, "items": [{k: r[k] for k in ("rank", "state_code", "state_name", "value", "display", "is_synthetic")} for r in rows]})
    return {"metric": metric, "label": derived.METRICS[metric]["label"], "unit": derived.METRICS[metric]["unit"],
            "max_value": vmax or None, "states": sorted(seen.values(), key=lambda s: s["state_code"]), "frames": frames}


# ---- compare -------------------------------------------------------------

COMPARE = [  # key, label, unit, formatter, higher_is_better
    ("total_visits", "Total visits", "visits", fmt_count, True),
    ("domestic_visits", "Domestic visits", "visits", fmt_count, True),
    ("foreign_visits", "Foreign visits", "visits", fmt_count, True),
    ("revenue", "Tourism revenue", "INR crore", fmt_crore, True),
    ("forex_earnings", "Forex earnings", "INR crore", fmt_crore, True),
    ("revenue_per_tourist", "Revenue per tourist", "INR", fmt_rupees, True),
    ("yoy_growth_total", "YoY growth of visits", "%", lambda v: fmt_pct(v, True), True),
    ("share_of_india_total", "Share of India total", "%", lambda v: None if v is None else f"{v:.2f}%", True),
    ("visits_per_1000_people", "Visits per 1,000 people", "per 1,000", fmt_number, True),
    ("tourism_share_of_gsdp", "Tourism share of GSDP", "%", lambda v: None if v is None else f"{v:.2f}%", True),
    ("tourism_employment", "Tourism employment", "persons", fmt_count, True),
    ("hotel_rooms", "Hotel rooms", "rooms", fmt_count, True),
    ("occupancy_rate", "Hotel occupancy", "%", lambda v: None if v is None else f"{v:.1f}%", True),
    ("rank_total_visits", "Rank by total visits", "rank", lambda v: None if v is None else f"#{int(v)}", False),
]


def compare(codes: tuple[str, ...], year: int, include_synthetic: bool) -> tuple[dict, list[bool]]:
    fr = data.frames()
    a, infra = fr.annual, fr.infrastructure
    names = {c: data.state_name(c) for c in codes}
    ranks = {r["state_code"]: r["rank"] for r in build_map("total_visits", year, "all", include_synthetic)}
    per: dict[str, dict] = {}
    for c in codes:
        cur = a[(a.state_code == c) & (a.year == year)]
        prv = a[(a.state_code == c) & (a.year == year - 1)]
        inf = infra[(infra.state_code == c) & (infra.year == year)]
        if not include_synthetic:
            cur, prv, inf = cur[~cur.is_synthetic], prv[~prv.is_synthetic], inf[~inf.is_synthetic]
        v: dict = {}
        if not cur.empty:
            r = cur.iloc[0]
            syn = bool(r.is_synthetic)
            same = not prv.empty and prv.iloc[0].boundary_basis == r.boundary_basis
            yoy = derived.pct_change(r.total_visits, prv.iloc[0].total_visits) if same else None
            vals = {"total_visits": r.total_visits, "domestic_visits": r.domestic_visits, "foreign_visits": r.foreign_visits,
                    "revenue": r.tourism_revenue_cr, "forex_earnings": r.forex_earnings_cr,
                    "revenue_per_tourist": r.revenue_per_tourist, "yoy_growth_total": yoy,
                    "share_of_india_total": r.share_of_india_total, "visits_per_1000_people": r.visits_per_1000,
                    "tourism_share_of_gsdp": r.tourism_share_of_gsdp, "tourism_employment": r.tourism_employment,
                    "rank_total_visits": ranks.get(c)}
            for k, x in vals.items():
                v[k] = (None if x is None or pd.isna(x) else float(x), syn or (k == "visits_per_1000_people" and bool(r.pop_synthetic))
                        or (k == "yoy_growth_total" and same and bool(prv.iloc[0].is_synthetic)))
        if not inf.empty:
            i = inf.iloc[0]
            v["hotel_rooms"] = (float(i.hotel_rooms), bool(i.is_synthetic))
            v["occupancy_rate"] = (float(i.occupancy_rate), bool(i.is_synthetic))
        per[c] = v
    flags, metrics = [], []
    for key, label, unit, fmt, hib in COMPARE:
        vals, best, best_v = {}, None, None
        for c in codes:
            x = per[c].get(key)
            val, syn = (x if x else (None, False))
            vals[c] = {"value": val, "display": fmt(val), "is_synthetic": syn}
            if x:
                flags.append(syn)
            if val is not None and (best_v is None or (val > best_v if hib else val < best_v)):
                best, best_v = c, val
        metrics.append({"key": key, "label": label, "unit": unit, "higher_is_better": hib, "leader": best, "values": vals})
    series = {}
    for c in codes:
        s = a[a.state_code == c]
        if not include_synthetic:
            s = s[~s.is_synthetic]
        series[c] = [{"year": int(r.year), "total_visits": float(r.total_visits), "domestic_visits": float(r.domestic_visits),
                      "foreign_visits": float(r.foreign_visits), "revenue": float(r.tourism_revenue_cr),
                      "is_synthetic": bool(r.is_synthetic)} for r in s.itertuples()]
    return {"year": year, "states": [{"state_code": c, "state_name": names[c]} for c in codes],
            "metrics": metrics, "series": series}, flags


# ---- scatter -------------------------------------------------------------

def scatter(year: int, f: Filters) -> tuple[dict, list[bool]]:
    fr = data.frames()
    a = fr.annual[fr.annual.year == year]
    a = a.merge(fr.infrastructure[["state_code", "year", "hotel_rooms", "is_synthetic"]].rename(columns={"is_synthetic": "infra_syn"}),
                on=["state_code", "year"], how="left")
    a = filter_states(a, f)
    vcol, rcol = derived.visits_col(f.visitor_type), derived.revenue_col(f.visitor_type)
    if not f.include_synthetic:
        a = a[~(a.is_synthetic | a.infra_syn.fillna(False).astype(bool))]
    a = a[a[vcol] > 0].copy()
    a["rpt"] = a[rcol] * 1e7 / a[vcol]
    rmax = a["hotel_rooms"].max() if len(a) else 0
    pts = []
    for r in a.sort_values("state_code").itertuples():
        pts.append({"state_code": r.state_code, "state_name": r.state_name, "region": r.region,
                    "visits": float(getattr(r, vcol)), "visits_display": fmt_count(getattr(r, vcol)),
                    "revenue_per_tourist": float(r.rpt), "revenue_per_tourist_display": fmt_rupees(r.rpt),
                    "hotel_rooms": None if pd.isna(r.hotel_rooms) else float(r.hotel_rooms),
                    "hotel_rooms_display": fmt_count(r.hotel_rooms),
                    "bubble_size": None if pd.isna(r.hotel_rooms) or not rmax else round(float(r.hotel_rooms) / float(rmax), 4),
                    "is_synthetic": bool(r.is_synthetic or r.infra_syn)})
    med = {"visits": float(a[vcol].median()), "revenue_per_tourist": float(a["rpt"].median())} if len(a) else {"visits": None, "revenue_per_tourist": None}
    return {"year": year, "x": "visits", "y": "revenue_per_tourist", "size": "hotel_rooms", "medians": med, "points": pts}, [p["is_synthetic"] for p in pts]
