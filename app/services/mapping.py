"""Choropleth data: value, rank, top-10 bucket, YoY change and normalised height per state."""
import numpy as np

from app.services import derived
from app.services.cache import ttl_cached
from app.services.formatting import fmt_pct


@ttl_cached()
def build_map(metric: str, year: int, visitor_type: str, include_synthetic: bool) -> tuple[dict, ...]:
    """Ranks are computed over all states for the year (before state/region/type filtering)."""
    mf = derived.metric_frame(metric, visitor_type)
    if not include_synthetic:
        mf = mf[~mf["is_synthetic"]]
    w = derived.with_prev(mf)
    y = derived.rank_year(w, year)
    vals = y["value"].dropna()
    if len(vals):
        lo, hi = float(vals.min()), float(vals.max())
    else:
        lo = hi = 0.0
    out = []
    for r in y.sort_values(["rank", "state_code"]).itertuples():
        v = None if np.isnan(r.value) else float(r.value)
        rank = None if np.isnan(r.rank) else int(r.rank)
        prev_ok = not np.isnan(r.prev)
        if metric == "growth_pct":
            yoy = None if (v is None or not prev_ok) else round(v - float(r.prev), 2)
            yoy_disp = None if yoy is None else f"{yoy:+.1f} pp"
        else:
            yoy = derived.pct_change(v, r.prev) if prev_ok else None
            yoy_disp = fmt_pct(yoy, signed=True)
        if v is None:
            height = None
        elif metric == "growth_pct":
            height = 0.0 if hi == lo else round((v - lo) / (hi - lo), 4)
        else:
            height = 0.0 if hi <= 0 else round(v / hi, 4)
        out.append({
            "state_code": r.state_code, "state_name": r.state_name, "region": r.region,
            "tourism_type_tags": r.tourism_type_tags, "value": v,
            "display": derived.display(metric, v), "rank": rank,
            "is_top10": rank is not None and rank <= 10,
            "color_bucket": rank if rank is not None and rank <= 10 else None,
            "yoy_change": yoy, "yoy_display": yoy_disp, "height": height,
            "is_synthetic": bool(r.is_synthetic or (r.prev_syn and prev_ok)),
            "note": "not_available: no value for this state/year (new state or no prior year)" if v is None else None,
            "year": r.year,
        })
    return tuple(out)
