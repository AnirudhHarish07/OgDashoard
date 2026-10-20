from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.errors import ApiError
from app.services import data, export
from app.services.filters import Filters, common_filters

router = APIRouter(prefix="/api", tags=["export"])
View = Literal[tuple(export.VIEWS)]  # type: ignore[valid-type]
Metric = Literal["domestic_visits", "foreign_visits", "total_visits", "revenue", "growth_pct", "visits_per_1000_people"]


@router.get("/export", summary="Download filtered data for any view as CSV (includes is_synthetic and data_source)",
            response_class=Response, responses={200: {"content": {"text/csv": {}}}})
def export_view(view: View = Query(..., description="Which dashboard view to export"),
                format: Literal["csv"] = "csv", metric: Metric = "total_visits",
                order: Literal["top", "bottom"] = "top", n: int = Query(10, ge=1, le=40),
                years: int = Query(3, ge=1, le=5, description="forecast horizon"),
                month: int | None = Query(None, ge=1, le=12), state: str | None = Query(None, description="single state (forecast)"),
                f: Filters = Depends(common_filters)):
    if view in ("forecast", "anomalies") and metric in ("growth_pct", "visits_per_1000_people"):
        raise ApiError(422, "metric_not_supported", f"metric '{metric}' is not available for the {view} view")
    if view == "compare" and not 2 <= len(f.states) <= 3:
        raise ApiError(422, "compare_needs_2_or_3_states", "Pass 2 or 3 state codes, e.g. ?states=KL,GA")
    if state:
        code = state.strip().upper()
        if code not in set(data.frames().states.state_code):
            raise ApiError(422, "unknown_state", f"Unknown state code(s): {code}")
        f = f.with_(states=(code,))
    if view == "forecast":
        f = f.with_(year=None, year_from=None, year_to=None, visitor_type="all")
    rows, resolved = export.rows_for(view, f, {"metric": metric, "order": order, "n": n, "years": years, "month": month})
    df = export.to_frame(view, rows)
    year = resolved.get("year") or "all"
    fname = f"india_tourism_{view}_{year}.csv"
    share = round(100 * df["is_synthetic"].astype(bool).mean(), 2) if len(df) else 0.0
    return Response(df.to_csv(index=False), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"', "X-Record-Count": str(len(df)),
                             "X-Synthetic-Share": str(share), "Access-Control-Expose-Headers": "Content-Disposition, X-Record-Count, X-Synthetic-Share"})
