from fastapi import APIRouter, Depends

from app.schemas.common import Envelope
from app.schemas.economy import DemandCapacityData, EconomyData, OccupancyData
from app.services import data, economy
from app.services.filters import Filters, common_filters, resolve_years
from app.services.meta import build_meta

router = APIRouter(prefix="/api", tags=["economy_infrastructure"])


@router.get("/economy", response_model=Envelope[EconomyData], summary="GSDP share, revenue per tourist and forex by state")
def economy_view(f: Filters = Depends(common_filters)):
    year = f.year or data.latest_year()
    d, flags = economy.economy(year, f)
    return {"data": d, "meta": build_meta(f, ["tourism_annual"], flags, resolved={"year": year},
                                          notes=["tourism_share_of_gsdp = revenue / gsdp x 100; revenue per tourist = revenue x 10^7 / visits (both follow visitor_type).",
                                                 "GSDP is a synthetic value in the dataset."])}


@router.get("/infrastructure/demand-capacity", response_model=Envelope[DemandCapacityData],
            summary="Visits vs hotel rooms, flagging under-served states")
def demand_capacity(f: Filters = Depends(common_filters)):
    year = f.year or data.latest_year()
    d, flags = economy.demand_capacity(year, f)
    return {"data": d, "meta": build_meta(f, ["tourism_annual", "infrastructure"], flags, resolved={"year": year},
                                          notes=["Flags are relative (quartiles across all states), not an absolute standard."])}


@router.get("/infrastructure/occupancy-trend", response_model=Envelope[OccupancyData], summary="Hotel occupancy over time")
def occupancy_trend(f: Filters = Depends(common_filters)):
    d, flags = economy.occupancy_trend(f)
    return {"data": d, "meta": build_meta(f, ["infrastructure"], flags, resolved={"years": resolve_years(f)},
                                          notes=["National occupancy is weighted by hotel rooms (derived)."])}
