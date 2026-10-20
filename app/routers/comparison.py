from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.errors import ApiError
from app.routers.map import MetricName
from app.schemas.common import Envelope
from app.schemas.comparison import CompareData, RaceData, RankingData, ScatterData
from app.services import data, derived, ranking
from app.services.filters import Filters, common_filters, resolve_years
from app.services.meta import build_meta

router = APIRouter(prefix="/api", tags=["comparison"])


def _tables(metric):
    return ["tourism_annual"] + (["states"] if metric == "visits_per_1000_people" else [])


@router.get("/rankings", response_model=Envelope[RankingData], summary="Top / bottom states for a metric")
def rankings(metric: MetricName = Query(...), order: Literal["top", "bottom"] = "top",
             n: int = Query(10, ge=1, le=40), f: Filters = Depends(common_filters)):
    year = f.year or data.latest_year()
    items = list(ranking.rankings(metric, year, f, order, n))
    info = derived.METRICS[metric]
    notes = ["rank is computed within the filtered scope; national_rank is across all states."]
    if not f.include_synthetic:
        notes.append("include_synthetic=false: every value in this dataset is synthetic, so nothing is returned.")
    return {"data": {"metric": metric, "label": info["label"], "unit": info["unit"], "year": year, "order": order,
                     "n": n, "items": items},
            "meta": build_meta(f, _tables(metric), [i["is_synthetic"] for i in items], notes, resolved={"year": year})}


@router.get("/rankings/race", response_model=Envelope[RaceData], summary="Per-year ranked frames for a bar chart race")
def rankings_race(metric: MetricName = Query(...), n: int = Query(10, ge=1, le=40), f: Filters = Depends(common_filters)):
    d = ranking.race(metric, f, n)
    flags = [i["is_synthetic"] for fr in d["frames"] for i in fr["items"]]
    return {"data": d, "meta": build_meta(f, _tables(metric), flags, resolved={"years": resolve_years(f)},
                                          notes=["Each frame ranks the states in scope for that year; only the top n are included."])}


@router.get("/compare", response_model=Envelope[CompareData], summary="Side-by-side key metrics for 2-3 states")
def compare(f: Filters = Depends(common_filters)):
    if not 2 <= len(f.states) <= 3:
        raise ApiError(422, "compare_needs_2_or_3_states", "Pass 2 or 3 state codes, e.g. ?states=KL,GA")
    if len(set(f.states)) != len(f.states):
        raise ApiError(422, "duplicate_states", "State codes must be distinct")
    year = f.year or data.latest_year()
    d, flags = ranking.compare(f.states, year, f.include_synthetic)
    return {"data": d, "meta": build_meta(f, ["tourism_annual", "infrastructure", "states"], flags, resolved={"year": year},
                                          notes=["visitor_type is ignored here: domestic, foreign and total are all shown.",
                                                 "YoY is null where the J&K/Ladakh boundary basis changes (2019)."])}


@router.get("/scatter", response_model=Envelope[ScatterData], summary="Visits vs revenue per tourist, bubble = hotel rooms")
def scatter(f: Filters = Depends(common_filters)):
    year = f.year or data.latest_year()
    d, flags = ranking.scatter(year, f)
    return {"data": d, "meta": build_meta(f, ["tourism_annual", "infrastructure"], flags, resolved={"year": year},
                                          notes=["revenue_per_tourist = revenue (INR crore) x 10^7 / visits; derived."])}
