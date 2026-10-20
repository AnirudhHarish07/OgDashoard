"""CSV export for any view: runs the same services as the JSON endpoints and flattens the rows."""
import pandas as pd

from app.services import analytics_views as v
from app.services import data
from app.services.filters import Filters

VIEWS = ["map", "rankings", "race", "trend", "kpis", "compare", "scatter", "heatmap", "seasonality_by_type", "festivals",
         "economy", "demand_capacity", "occupancy_trend", "covid_recovery", "forecast", "anomalies"]

TABLES = {
    "map": ["tourism_annual"], "rankings": ["tourism_annual"], "race": ["tourism_annual"], "trend": ["tourism_annual"],
    "kpis": ["tourism_annual"], "compare": ["tourism_annual", "infrastructure", "states"], "scatter": ["tourism_annual", "infrastructure"],
    "heatmap": ["tourism_monthly"], "seasonality_by_type": ["tourism_monthly", "states"], "festivals": ["festivals_events", "states"],
    "economy": ["tourism_annual"], "demand_capacity": ["tourism_annual", "infrastructure"], "occupancy_trend": ["infrastructure"],
    "covid_recovery": ["tourism_annual"], "forecast": ["tourism_annual"], "anomalies": ["tourism_annual"],
}


def rows_for(view: str, f: Filters, p: dict) -> tuple[list[dict], dict]:
    """Return (flat rows, resolved params)."""
    return getattr(v, f"view_{view}")(f, p)


def to_frame(view: str, rows: list[dict]) -> pd.DataFrame:
    df = pd.json_normalize(rows, sep=".") if rows else pd.DataFrame()
    for c in df.columns:
        if df[c].map(lambda x: isinstance(x, list)).any():
            df[c] = df[c].map(lambda x: ";".join(map(str, x)) if isinstance(x, list) else x)
    if "is_synthetic" not in df.columns:
        df["is_synthetic"] = True
    df["data_source"] = " | ".join(data.sources_for(*TABLES[view]))
    first = [c for c in ("state_code", "state_name", "region", "year", "month") if c in df.columns]
    rest = [c for c in df.columns if c not in first and c not in ("is_synthetic", "data_source")]
    return df[first + rest + ["is_synthetic", "data_source"]]
