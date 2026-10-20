from fastapi import APIRouter, Depends

from app.config import settings
from app.errors import ApiError
from app.schemas.common import Envelope
from app.schemas.covid import CovidData
from app.services import data, economy
from app.services.filters import Filters, common_filters
from app.services.meta import build_meta

router = APIRouter(prefix="/api/covid", tags=["covid"])


@router.get("/recovery", response_model=Envelope[CovidData], summary="Per-state COVID drop and recovery vs 2019, ranked")
def recovery(f: Filters = Depends(common_filters)):
    year = f.year or data.latest_year()
    if year <= settings.covid_years[1]:
        raise ApiError(422, "year_before_recovery", f"year must be after {settings.covid_years[1]} to measure recovery")
    d, flags = economy.covid_recovery(year, f)
    return {"data": d, "meta": build_meta(f, ["tourism_annual"], list(flags), resolved={"year": year},
                                          notes=["recovery_pct = visits in the chosen year / 2019 visits x 100; ranked high to low.",
                                                 "drop is measured against 2019 for each of 2020 and 2021."])}
