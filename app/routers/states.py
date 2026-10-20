from fastapi import APIRouter, Depends

from app.errors import ApiError
from app.schemas.common import Envelope
from app.schemas.states import StateDetail
from app.services import data, state_detail
from app.services.filters import Filters, common_filters
from app.services.meta import build_meta

router = APIRouter(prefix="/api", tags=["state_detail"])


@router.get("/states/{code}", response_model=Envelope[StateDetail], summary="Everything for the state fly-in detail panel")
def state(code: str, f: Filters = Depends(common_filters)):
    code = code.upper()
    if code not in set(data.frames().states.state_code):
        raise ApiError(404, "state_not_found", f"Unknown state code '{code}'")
    year = f.year or data.latest_year()
    d, flags = state_detail.build(code, year, f.include_synthetic)
    return {"data": d, "meta": build_meta(
        f, ["states", "tourism_annual", "tourism_monthly", "infrastructure", "attractions", "ftv_source_countries", "festivals_events"],
        flags, resolved={"year": year, "state": code},
        notes=["Only year and include_synthetic apply; other filters are ignored for a single-state view.",
               "Attraction footfall is a single 2024 snapshot."] + d["notes"])}
