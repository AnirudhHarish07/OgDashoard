from fastapi import APIRouter

from app.config import settings
from app.db import connect_ro
from app.schemas.common import Envelope
from app.schemas.meta import FiltersData, HealthData, SourcesData
from app.services import data, derived
from app.services.filters import Filters
from app.services.meta import build_meta

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health", response_model=Envelope[HealthData])
def health():
    conn = connect_ro()
    try:
        conn.execute("SELECT 1").fetchone()
        status = "ok"
    except Exception as e:  # pragma: no cover
        status = f"error: {e}"
    finally:
        conn.close()
    f = data.frames()
    d = {"status": "ok" if status == "ok" else "degraded", "database": status,
         "database_path": str(settings.database_path.name), "row_counts": f.table_counts,
         "geo_file": "present" if settings.geo_path.exists() else "missing",
         "anthropic_configured": bool(settings.anthropic_api_key)}
    return {"data": d, "meta": build_meta(Filters(), [], [])}


@router.get("/filters", response_model=Envelope[FiltersData])
def filters():
    f = data.frames()
    a = f.tourism_annual
    span = a.groupby("state_code")["year"].agg(["min", "max"])
    notes = f.state_boundary_mapping.dropna(subset=["note"]).groupby("current_state_code")["note"].first()
    states = []
    for s in f.states.itertuples():
        states.append({"state_code": s.state_code, "state_name": s.state_name, "region": s.region,
                       "tourism_types": [t for t in (s.tourism_type_tags or "").split(";") if t],
                       "first_year": int(span.loc[s.state_code, "min"]), "last_year": int(span.loc[s.state_code, "max"]),
                       "boundary_note": notes.get(s.state_code), "is_synthetic": bool(s.is_synthetic)})
    d = {"years": data.years(), "states": states, "regions": sorted(f.states.region.unique()),
         "tourism_types": data.tag_set(), "visitor_types": ["domestic", "foreign", "all"],
         "metrics": [{"key": k, "label": v["label"], "unit": v["unit"], "source_table": v["table"]}
                     for k, v in derived.METRICS.items()],
         "months": list(range(1, 13)),
         "forecast_metrics": ["total_visits", "domestic_visits", "foreign_visits", "revenue"]}
    return {"data": d, "meta": build_meta(Filters(), ["states", "tourism_annual"], f.states.is_synthetic.tolist())}


@router.get("/sources", response_model=Envelope[SourcesData])
def sources():
    f = data.frames()
    from app.db import TABLES
    tables = []
    for t in TABLES:
        df = f.__dict__[t]
        syn = int(df["is_synthetic"].sum())
        tables.append({"table": t, "rows": len(df), "data_sources": sorted(df["data_source"].unique()),
                       "synthetic_rows": syn, "synthetic_share": round(100 * syn / len(df), 2)})
    metrics = []
    for k, v in derived.METRICS.items():
        mf = derived.metric_frame(k)
        mf = mf[mf["value"].notna()]
        srcs = data.sources_for(*[x for x in ["tourism_annual", "states"] if x in v["table"]])
        metrics.append({"metric": k, "source_table": v["table"], "data_sources": srcs,
                        "synthetic_share": round(100 * mf["is_synthetic"].mean(), 2) if len(mf) else 0.0})
    flags = [r for t in tables for r in [True] * t["synthetic_rows"] + [False] * (t["rows"] - t["synthetic_rows"])]
    notes = ["Derived metrics are synthetic if any input value is synthetic."]
    return {"data": {"tables": tables, "metrics": metrics}, "meta": build_meta(Filters(), [], flags, notes=notes)}
