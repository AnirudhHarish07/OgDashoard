"""Forecast: random walk with drift on log values (ARIMA(0,1,0)+trend), trained only on dataset values.
COVID years are masked as missing, so the Kalman filter bridges the gap instead of fitting the collapse."""
import warnings

import numpy as np
from statsmodels.tsa.arima.model import ARIMA

from app.config import settings
from app.services import data
from app.services.cache import ttl_cached
from app.services.filters import Filters
from app.services.formatting import fmt_count, fmt_crore
from app.services.overview import annual_scope

METRIC_COL = {"total_visits": "total_visits", "domestic_visits": "domestic_visits",
              "foreign_visits": "foreign_visits", "revenue": "tourism_revenue_cr"}
MIN_POINTS = 4


@ttl_cached()
def forecast(metric: str, f: Filters, horizon: int, level: float) -> dict:
    col = METRIC_COL[metric]
    fmt = fmt_crore if metric == "revenue" else fmt_count
    a = annual_scope(f)
    scope = {"states": list(f.states), "region": f.region, "tourism_type": f.tourism_type}
    out = {"metric": metric, "scope": scope, "horizon": horizon, "confidence_level": level,
           "model": None, "history": [], "forecast": [], "notes": []}
    if a.empty:
        out["notes"].append("not_available: no data for this selection")
        return out
    g = a.groupby("year").agg(value=(col, "sum"), syn=("is_synthetic", "any"))
    y = g["value"].astype(float).reindex(range(int(g.index.min()), int(g.index.max()) + 1))
    c0, c1 = settings.covid_years
    train = y.copy()
    train.loc[[i for i in train.index if c0 <= i <= c1]] = np.nan
    out["history"] = [{"year": int(i), "value": None if np.isnan(v) else float(v), "display": None if np.isnan(v) else fmt(v),
                       "used_in_training": bool(not np.isnan(train[i])), "excluded_reason": "covid_outlier" if c0 <= i <= c1 else None,
                       "is_forecast": False, "is_synthetic": bool(g["syn"].get(i, False))} for i, v in y.items()]
    if train.notna().sum() < MIN_POINTS or (train <= 0).any():
        out["notes"].append(f"not_available: fewer than {MIN_POINTS} usable years after excluding {c0}-{c1}")
        return out
    codes = set(a.state_code)
    if ("JK" in codes) != ("LA" in codes) and y.index.min() < 2019:
        out["notes"].append("boundary_change: pre-2019 J&K figures include Ladakh; the 2019 level shift is not modelled")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            res = ARIMA(np.log(train.values), order=(0, 1, 0), trend="t").fit()
            fc = res.get_forecast(horizon)
            mean, ci = np.asarray(fc.predicted_mean), np.asarray(fc.conf_int(alpha=1 - level))
    except Exception as e:  # pragma: no cover - numerical failure
        out["notes"].append(f"not_available: model could not be fitted ({type(e).__name__})")
        return out
    syn = bool(g["syn"].any())
    last = int(y.index.max())
    for k in range(horizon):
        v, lo, hi = (float(np.exp(x)) for x in (mean[k], ci[k, 0], ci[k, 1]))
        out["forecast"].append({"year": last + k + 1, "value": v, "lower": lo, "upper": hi, "display": fmt(v),
                                "lower_display": fmt(lo), "upper_display": fmt(hi),
                                "is_forecast": True, "is_synthetic": syn})
    drift = float(res.params[0]) if len(res.params) else None
    out["model"] = {"name": "ARIMA(0,1,0) with drift on log values", "training_years": [int(i) for i in train.dropna().index],
                    "excluded_years": [int(i) for i in train.index if c0 <= i <= c1],
                    "implied_annual_growth_pct": None if drift is None else round((float(np.exp(drift)) - 1) * 100, 2),
                    "interval": f"{int(level * 100)}% prediction interval (widens with horizon)"}
    out["notes"].append("Few annual observations: intervals are wide by design. Values are model projections, not data.")
    return out
