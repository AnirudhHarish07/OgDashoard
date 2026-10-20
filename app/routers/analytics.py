from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.errors import ApiError
from app.schemas.analytics import AnomalyData, ForecastData
from app.schemas.common import Envelope
from app.services import anomalies, data, forecast
from app.services.filters import Filters, common_filters
from app.services.meta import build_meta

router = APIRouter(prefix="/api", tags=["analytics"])
ForecastMetric = Literal["total_visits", "domestic_visits", "foreign_visits", "revenue"]


@router.get("/forecast", response_model=Envelope[ForecastData], summary="Forecast with confidence band (COVID years excluded)")
def forecast_view(state: str | None = Query(None, description="State code; omit for all states in scope"),
                  metric: ForecastMetric = Query("total_visits"), years: int = Query(3, ge=1, le=5),
                  confidence: float = Query(0.95, ge=0.5, le=0.99), f: Filters = Depends(common_filters)):
    if state:
        code = state.strip().upper()
        if code not in set(data.frames().states.state_code):
            raise ApiError(422, "unknown_state", f"Unknown state code(s): {code}")
        f = f.with_(states=(code,))
    d = forecast.forecast(metric, f.with_(year=None, year_from=None, year_to=None, visitor_type="all"), years, round(confidence, 2))
    flags = [p["is_synthetic"] for p in d["history"] if p["value"] is not None]
    notes = ["Trained only on dataset values; 2020-21 are treated as missing so COVID does not distort the trend.",
             "Every forecast point has is_forecast=true; is_synthetic marks that the training data is synthetic.",
             "year filters and visitor_type do not apply (metric selects the series)."] + d["notes"]
    return {"data": d, "meta": build_meta(f, ["tourism_annual"], flags, notes)}


@router.get("/anomalies", response_model=Envelope[AnomalyData], summary="Unusual spikes/drops per state with z-scores")
def anomalies_view(metric: ForecastMetric = Query("total_visits"), threshold: float = Query(2.0, ge=1.0, le=5.0),
                   limit: int = Query(50, ge=1, le=500), f: Filters = Depends(common_filters)):
    d, flags = anomalies.detect(metric, f, threshold, limit)
    return {"data": d, "meta": build_meta(f, ["tourism_annual"], flags,
                                          ["Year filters select which years are reported; z-scores always use each state's full history.",
                                           "kind=spike/drop is relative to peers that year, so shared shocks such as COVID are not flagged."])}
