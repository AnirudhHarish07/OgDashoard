"""Everything the fly-in detail panel needs, in one call (cached)."""
import calendar

import pandas as pd

from app.services import data, derived
from app.services.cache import ttl_cached
from app.services.formatting import fmt_count, fmt_crore, fmt_number, fmt_pct, fmt_rupees
from app.services.mapping import build_map
from app.services.overview import make_kpi


def _keep(df: pd.DataFrame, include_synthetic: bool) -> pd.DataFrame:
    return df if include_synthetic else df[~df["is_synthetic"]]


@ttl_cached(maxsize=1)
def _rank_table(include_synthetic: bool) -> pd.DataFrame:
    """Rank of every state in every year by total visits and by revenue (national, 1 = highest)."""
    out = []
    for metric in ("total_visits", "revenue"):
        mf = derived.metric_frame(metric)
        mf = mf if include_synthetic else mf[~mf.is_synthetic]
        mf = mf.copy()
        mf["rank"] = mf.groupby("year")["value"].rank(method="min", ascending=False)
        out.append(mf.assign(metric=metric)[["state_code", "year", "metric", "value", "rank", "is_synthetic"]])
    return pd.concat(out, ignore_index=True)


def _growth(rows: pd.DataFrame, year: int):
    c, p = rows[rows.year == year], rows[rows.year == year - 1]
    if c.empty or p.empty or c.iloc[0].boundary_basis != p.iloc[0].boundary_basis:
        return None, False
    return derived.pct_change(c.iloc[0].total_visits, p.iloc[0].total_visits), bool(c.iloc[0].is_synthetic or p.iloc[0].is_synthetic)


@ttl_cached(maxsize=128)
def build(code: str, year: int, include_synthetic: bool) -> tuple[dict, tuple[bool, ...]]:
    fr = data.frames()
    s = fr.states[fr.states.state_code == code].iloc[0]
    flags: list[bool] = []
    st_syn = bool(s.is_synthetic)
    a_all = _keep(fr.annual[fr.annual.state_code == code], include_synthetic).sort_values("year")
    notes = []

    # profile -------------------------------------------------------------
    att = fr.attractions[fr.attractions.state_code == code]
    att = _keep(att, include_synthetic)
    unesco = att[att.is_unesco.astype(bool)]
    infra_all = _keep(fr.infrastructure[fr.infrastructure.state_code == code], include_synthetic).sort_values("year")
    inf = infra_all[infra_all.year == year]
    show = include_synthetic or not st_syn
    mapping = fr.state_boundary_mapping
    bnote = mapping.loc[mapping.current_state_code == code, "note"].dropna()
    profile = {
        "state_code": code, "state_name": s.state_name, "region": s.region,
        "capital": s.capital if show else None,
        "area_km2": int(s.area_km2) if show else None,
        "population": int(s.population) if show else None,
        "population_display": fmt_count(s.population) if show else None,
        "tourism_types": [t for t in (s.tourism_type_tags or "").split(";") if t],
        "unesco_sites": [{"name": r.name, "type": r.type, "annual_footfall": int(r.annual_footfall), "is_synthetic": bool(r.is_synthetic)}
                         for r in unesco.sort_values("annual_footfall", ascending=False).itertuples()],
        "unesco_count": int(len(unesco)),
        "airports": None if inf.empty else int(inf.iloc[0].airports),
        "international_airports": None if inf.empty else int(inf.iloc[0].international_airports),
        "first_year": None if a_all.empty else int(a_all.year.min()),
        "boundary_note": bnote.iloc[0] if len(bnote) else None,
        "is_synthetic": st_syn}
    flags.append(st_syn)

    # KPIs ----------------------------------------------------------------
    cur = a_all[a_all.year == year]
    prv = a_all[a_all.year == year - 1]
    kpis = []
    if cur.empty:
        notes.append(f"not_available: no tourism data for {code} in {year}")
    else:
        r = cur.iloc[0]
        same = not prv.empty and prv.iloc[0].boundary_basis == r.boundary_basis
        p = prv.iloc[0] if same else None
        if not same and not prv.empty:
            notes.append("boundary_change: previous-year comparison omitted (J&K/Ladakh split in 2019)")
        specs = [("total_visits", "Total visits", "visits", "total_visits", fmt_count, False),
                 ("domestic_visits", "Domestic visits", "visits", "domestic_visits", fmt_count, False),
                 ("foreign_visits", "Foreign visits", "visits", "foreign_visits", fmt_count, False),
                 ("revenue", "Tourism revenue", "INR crore", "tourism_revenue_cr", fmt_crore, False),
                 ("forex_earnings", "Forex earnings", "INR crore", "forex_earnings_cr", fmt_crore, False),
                 ("revenue_per_tourist", "Revenue per tourist", "INR", "revenue_per_tourist", fmt_rupees, False),
                 ("visits_per_1000_people", "Visits per 1,000 people", "per 1,000", "visits_per_1000", fmt_number, True),
                 ("share_of_india_total", "Share of India total", "%", "share_of_india_total", lambda v: None if v is None else f"{v:.2f}%", False),
                 ("tourism_share_of_gsdp", "Tourism share of GSDP", "%", "tourism_share_of_gsdp", lambda v: None if v is None else f"{v:.2f}%", False),
                 ("tourism_employment", "Tourism employment", "persons", "tourism_employment", fmt_count, False)]
        for key, label, unit, col, fmt, pop in specs:
            syn = bool(r.is_synthetic) or (pop and bool(r.pop_synthetic))
            pv = None if p is None else float(p[col])
            kpis.append(make_kpi(key, label, unit, float(r[col]), pv, syn or (p is not None and bool(p.is_synthetic)), fmt))
        g, gs = _growth(a_all, year)
        gp, gps = _growth(a_all, year - 1)
        kpis.append(make_kpi("yoy_growth", "YoY growth of visits", "%", g, gp, gs or gps, lambda v: fmt_pct(v, True), pct_points=True,
                             note=None if g is not None else "not_available: no comparable previous year"))
        rt = _rank_table(include_synthetic)
        rk = rt[(rt.state_code == code) & (rt.metric == "total_visits")].set_index("year")
        if year in rk.index:
            cr, pr = int(rk.loc[year, "rank"]), (int(rk.loc[year - 1, "rank"]) if (year - 1 in rk.index and same) else None)
            k = make_kpi("rank_total_visits", "Rank by total visits", "rank", cr, pr, bool(rk.loc[year, "is_synthetic"]), lambda v: None if v is None else f"#{int(v)}")
            k["direction"] = "none" if pr is None else "up" if cr < pr else "down" if cr > pr else "flat"  # lower rank number = better
            k["change_pct"] = None
            k["change_display"] = None if pr is None else (f"{pr - cr:+d} places" if pr != cr else "no change")
            kpis.append(k)
    flags += [k["is_synthetic"] for k in kpis]

    # domestic vs foreign trend -------------------------------------------
    trend = []
    for r in a_all.itertuples():
        trend.append({"year": int(r.year), "domestic_visits": float(r.domestic_visits), "foreign_visits": float(r.foreign_visits),
                      "total_visits": float(r.total_visits), "domestic_display": fmt_count(r.domestic_visits),
                      "foreign_display": fmt_count(r.foreign_visits),
                      "yoy_domestic_pct": None if pd.isna(r.yoy_growth_domestic) else float(r.yoy_growth_domestic),
                      "yoy_foreign_pct": None if pd.isna(r.yoy_growth_foreign) else float(r.yoy_growth_foreign),
                      "is_synthetic": bool(r.is_synthetic)})
    flags += [t["is_synthetic"] for t in trend]

    # source countries -----------------------------------------------------
    ftv = _keep(fr.ftv_source_countries[(fr.ftv_source_countries.state_code == code) & (fr.ftv_source_countries.year == year)], include_synthetic)
    tot = ftv.foreign_visits.sum()
    ctry = []
    for r in ftv[ftv.country != "Others"].sort_values("foreign_visits", ascending=False).head(8).itertuples():
        ctry.append((r, False))
    for r in ftv[ftv.country == "Others"].itertuples():
        ctry.append((r, True))
    countries = [{"country": r.country, "foreign_visits": int(r.foreign_visits), "display": fmt_count(r.foreign_visits),
                  "share_pct": round(r.foreign_visits / tot * 100, 2) if tot else None, "is_other": oth,
                  "is_synthetic": bool(r.is_synthetic)} for r, oth in ctry]
    flags += [c["is_synthetic"] for c in countries]

    # attractions ------------------------------------------------------------
    top_att = [{"name": r.name, "type": r.type, "annual_footfall": int(r.annual_footfall), "footfall_display": fmt_count(r.annual_footfall),
                "footfall_year": int(r.footfall_year), "is_unesco": bool(r.is_unesco), "is_asi_protected": bool(r.is_asi_protected),
                "is_synthetic": bool(r.is_synthetic)}
               for r in att.sort_values("annual_footfall", ascending=False).head(10).itertuples()]
    flags += [t["is_synthetic"] for t in top_att]

    # hotel infrastructure ---------------------------------------------------
    hotels = None
    if not inf.empty:
        i = inf.iloc[0]
        mix = []
        for label, col in (("1-star", "hotels_1star"), ("2-star", "hotels_2star"), ("3-star", "hotels_3star"),
                           ("4-star", "hotels_4star"), ("5-star", "hotels_5star"), ("Heritage", "hotels_heritage")):
            mix.append({"class": label, "hotels": int(i[col]), "share_pct": round(i[col] / i.hotels_total * 100, 2) if i.hotels_total else None})
        hotels = {"year": year, "hotels_total": int(i.hotels_total), "hotel_rooms": int(i.hotel_rooms),
                  "hotel_rooms_display": fmt_count(i.hotel_rooms), "occupancy_rate": float(i.occupancy_rate),
                  "star_mix": mix, "registered_homestays": int(i.registered_homestays),
                  "registered_tour_operators": int(i.registered_tour_operators), "is_synthetic": bool(i.is_synthetic),
                  "occupancy_history": [{"year": int(x.year), "occupancy_rate": float(x.occupancy_rate)} for x in infra_all.itertuples()]}
        flags.append(hotels["is_synthetic"])

    # seasonality ------------------------------------------------------------
    m = _keep(fr.tourism_monthly[(fr.tourism_monthly.state_code == code) & (fr.tourism_monthly.year == year)], include_synthetic).sort_values("month")
    season = {"year": year, "months": [], "peak_month": None, "low_month": None}
    if not m.empty:
        tv = m.domestic_visits + m.foreign_visits
        mean, total = tv.mean(), tv.sum()
        for r, t in zip(m.itertuples(), tv):
            season["months"].append({"month": int(r.month), "month_name": calendar.month_abbr[int(r.month)],
                                     "domestic_visits": int(r.domestic_visits), "foreign_visits": int(r.foreign_visits),
                                     "total_visits": int(t), "share_of_year_pct": round(t / total * 100, 2),
                                     "seasonal_index": round(t / mean * 100, 1), "avg_temp_c": float(r.avg_temp_c),
                                     "season": r.season, "is_synthetic": bool(r.is_synthetic)})
        season["peak_month"] = int(m.month.iloc[int(tv.values.argmax())])
        season["low_month"] = int(m.month.iloc[int(tv.values.argmin())])
        flags += [x["is_synthetic"] for x in season["months"]]

    # festivals --------------------------------------------------------------
    fest = _keep(fr.festivals_events[fr.festivals_events.state_code == code], include_synthetic).sort_values(["month", "name"])
    festivals = [{"name": r.name, "month": int(r.month), "month_name": calendar.month_abbr[int(r.month)], "type": r.type,
                  "is_synthetic": bool(r.is_synthetic)} for r in fest.itertuples()]
    flags += [x["is_synthetic"] for x in festivals]

    # rank history -----------------------------------------------------------
    rt = _rank_table(include_synthetic)
    rt = rt[rt.state_code == code]
    hist = []
    for y in sorted(rt.year.unique()):
        v = rt[(rt.year == y) & (rt.metric == "total_visits")]
        rv = rt[(rt.year == y) & (rt.metric == "revenue")]
        hist.append({"year": int(y), "rank_total_visits": int(v["rank"].iloc[0]), "total_visits": float(v.value.iloc[0]),
                     "rank_revenue": int(rv["rank"].iloc[0]) if len(rv) else None,
                     "is_synthetic": bool(v.is_synthetic.iloc[0])})
    flags += [h["is_synthetic"] for h in hist]

    out = {"year": year, "profile": profile, "kpis": kpis, "trend": trend, "source_countries": countries,
           "top_attractions": top_att, "hotel_infrastructure": hotels, "seasonality": season,
           "festivals": festivals, "rank_history": hist, "notes": notes}
    return out, tuple(flags)
