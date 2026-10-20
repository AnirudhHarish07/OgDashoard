from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.errors import ApiError
from app.schemas.common import Envelope
from app.schemas.map import GeoCollection, MapData
from app.services import data, derived, geo, mapping
from app.services.filters import Filters, common_filters, filter_states
from app.services.meta import build_meta

import pandas as pd

router = APIRouter(prefix="/api", tags=["map"])
MetricName = Literal["domestic_visits", "foreign_visits", "total_visits", "revenue", "growth_pct", "visits_per_1000_people"]


@router.get("/geo/states", response_model=GeoCollection, summary="State/UT boundaries with label points and bboxes")
def geo_states(f: Filters = Depends(common_filters),
               tolerance: float = Query(0.01, ge=0, le=0.5, description="Geometry simplification tolerance in degrees")):
    codes = ()
    if f.states or f.region or f.tourism_type:
        s = filter_states(data.frames().states, f)
        codes = tuple(sorted(s.state_code))
    fc = geo.feature_collection(round(tolerance, 4), codes)
    meta = build_meta(f, ["states"], [x["properties"]["is_synthetic"] for x in fc["features"]],
                      notes=["Geometry: public district boundaries (Census 2011 basis) dissolved to states; "
                             "not the official Survey of India file. J&K and Ladakh are separate UTs.",
                             "is_synthetic on a feature refers to small_state, derived from the unverified area_km2 reference value."],
                      extra_sources=["data/geo/india_states.geojson (geometry only)"])
    return {**fc, "meta": meta}


@router.get("/map", response_model=Envelope[MapData], summary="Per-state value, rank, top-10 bucket, YoY and 3D height")
def map_data(metric: MetricName = Query(...), f: Filters = Depends(common_filters)):
    year = f.year or data.latest_year()
    rows = mapping.build_map(metric, year, f.visitor_type, f.include_synthetic)
    sel = pd.DataFrame(rows, columns=list(rows[0].keys()) if rows else ["state_code", "region", "tourism_type_tags"])
    keep = set(filter_states(sel, f).state_code) if rows else set()
    states = [{k: v for k, v in r.items() if k not in ("tourism_type_tags", "year")} for r in rows if r["state_code"] in keep]
    vals = [s["value"] for s in states if s["value"] is not None]
    info = derived.METRICS[metric]
    notes = ["rank/top-10/colour bucket are computed across all states for the year, then state/region/type filters select the output.",
             "height = value / max (min-max for growth_pct)."]
    if not f.include_synthetic:
        notes.append("include_synthetic=false: every value in this dataset is synthetic, so nothing is returned.")
    tables = ["tourism_annual"] + (["states"] if metric == "visits_per_1000_people" else [])
    return {"data": {"year": year, "metric": metric, "label": info["label"], "unit": info["unit"],
                     "min_value": min(vals) if vals else None, "max_value": max(vals) if vals else None,
                     "states": states},
            "meta": build_meta(f, tables, [s["is_synthetic"] for s in states], notes, resolved={"year": year})}
