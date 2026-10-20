from fastapi import APIRouter, Depends, Query

from app.errors import ApiError
from app.schemas.common import Envelope
from app.schemas.seasonality import ByTypeData, FestivalData, HeatmapData
from app.services import data, seasonality
from app.services.filters import Filters, common_filters
from app.services.meta import build_meta

router = APIRouter(prefix="/api", tags=["seasonality"])


@router.get("/seasonality/heatmap", response_model=Envelope[HeatmapData], summary="State x month visits matrix")
def heatmap(f: Filters = Depends(common_filters)):
    year = f.year or data.latest_year()
    d, flags = seasonality.heatmap(year, f)
    return {"data": d, "meta": build_meta(f, ["tourism_monthly"], flags, resolved={"year": year},
                                          notes=["States without monthly rows for the year (e.g. Ladakh before 2019) are omitted."])}


@router.get("/seasonality/by-type", response_model=Envelope[ByTypeData], summary="Monthly curves by tourism type")
def by_type(f: Filters = Depends(common_filters)):
    year = f.year or data.latest_year()
    d, flags = seasonality.by_type(year, f)
    return {"data": d, "meta": build_meta(f, ["tourism_monthly", "states"], flags, resolved={"year": year},
                                          notes=["Types come from states.tourism_type_tags; a state with several tags is counted in each of its types, "
                                                 "so curves overlap and must not be summed.",
                                                 "Dataset has no tourism type on visit rows; this is an aggregation of tagged states."])}


@router.get("/festivals", response_model=Envelope[FestivalData], summary="Festival and event calendar")
def festivals(month: int | None = Query(None, ge=1, le=12), state: str | None = Query(None, description="State code (alias of states=)"),
              f: Filters = Depends(common_filters)):
    if state:
        code = state.strip().upper()
        if code not in set(data.frames().states.state_code):
            raise ApiError(422, "unknown_state", f"Unknown state code(s): {code}")
        f = f.with_(states=tuple(dict.fromkeys((*f.states, code))))
    d, flags = seasonality.festivals(f, month)
    return {"data": d, "meta": build_meta(f, ["festivals_events", "states"], flags,
                                          notes=["Festival names and months are hand-entered reference values, unverified.",
                                                 "year and visitor_type do not apply."])}
