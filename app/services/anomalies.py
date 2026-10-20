"""Anomaly detection on year-over-year change relative to peers.
deviation = state's YoY growth - median YoY growth of all states that year (removes shocks common to everyone, e.g. COVID);
z = (deviation - mean of that state's deviations) / std of that state's deviations."""
import numpy as np
import pandas as pd

from app.services import derived
from app.services.filters import Filters, filter_states, resolve_years
from app.services.formatting import fmt_count, fmt_crore, fmt_pct

MIN_HISTORY = 5


def detect(metric: str, f: Filters, threshold: float, limit: int) -> tuple[dict, list[bool]]:
    mf = derived.metric_frame(metric, f.visitor_type)
    if not f.include_synthetic:
        mf = mf[~mf.is_synthetic]
    w = derived.with_prev(mf)
    w = w[w.prev.notna() & (w.prev > 0)].copy()
    w["growth"] = (w.value - w.prev) / w.prev * 100
    w["peer_median"] = w.groupby("year")["growth"].transform("median")
    w["dev"] = w.growth - w.peer_median
    st = w.groupby("state_code")["dev"].agg(["mean", "std", "count"])
    w = w.join(st, on="state_code")
    w = w[(w["count"] >= MIN_HISTORY) & (w["std"] > 0)].copy()
    w["z"] = (w.dev - w["mean"]) / w["std"]
    cand = w[w.z.abs() >= threshold]
    cand = filter_states(cand, f)
    cand = cand[cand.year.isin(resolve_years(f))]
    fmt = fmt_crore if metric == "revenue" else fmt_count
    cand = cand.reindex(cand.z.abs().sort_values(ascending=False).index)
    rows = []
    for r in cand.head(limit).itertuples():
        rows.append({
            "state_code": r.state_code, "state_name": r.state_name, "region": r.region, "year": int(r.year),
            "kind": "spike" if r.z > 0 else "drop", "z_score": round(float(r.z), 2),
            "value": float(r.value), "value_display": fmt(r.value), "previous_value": float(r.prev), "previous_display": fmt(r.prev),
            "growth_pct": round(float(r.growth), 2), "growth_display": fmt_pct(r.growth, signed=True),
            "peer_median_growth_pct": round(float(r.peer_median), 2), "deviation_pp": round(float(r.dev), 2),
            "state_mean_deviation_pp": round(float(r.mean), 2), "state_std_deviation_pp": round(float(r.std), 2),
            "summary": (f"{r.state_name} {r.year}: visits changed {fmt_pct(r.growth, signed=True)} against a peer median of "
                        f"{fmt_pct(r.peer_median, signed=True)} ({r.dev:+.1f} pp), z = {r.z:+.2f}."),
            "history_points": int(r.count), "is_synthetic": bool(r.is_synthetic or r.prev_syn)})
    return ({"metric": metric, "threshold": threshold, "n_candidates": int(len(cand)), "n_scored": int(len(w)), "anomalies": rows,
             "method": "z-score of YoY growth minus peer-median growth, per state history (>= %d points)" % MIN_HISTORY},
            [x["is_synthetic"] for x in rows])
