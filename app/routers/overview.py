from fastapi import APIRouter, Depends

from app.schemas.common import Envelope
from app.schemas.overview import KpiData, TrendData
from app.services import overview
from app.services.filters import Filters, common_filters
from app.services.meta import build_meta

router = APIRouter(prefix="/api/overview", tags=["overview"])


@router.get("/kpis", response_model=Envelope[KpiData], summary="Headline KPIs with previous-year comparison")
def kpis(f: Filters = Depends(common_filters)):
    d, flags = overview.build_kpis(f)
    return {"data": d, "meta": build_meta(f, ["tourism_annual"], flags, resolved={"year": d["year"]},
                                          notes=["Aggregates cover the states selected by the filters."])}


@router.get("/trend", response_model=Envelope[TrendData], summary="Annual series with COVID annotation")
def trend(f: Filters = Depends(common_filters)):
    d, flags = overview.build_trend(f)
    return {"data": d, "meta": build_meta(f, ["tourism_annual"], flags,
                                          notes=["Year filters are ignored: the series covers all years in the dataset."])}
