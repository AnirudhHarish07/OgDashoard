from pydantic import BaseModel, Field


class Kpi(BaseModel):
    key: str
    label: str
    unit: str
    value: float | None
    display: str | None
    previous_value: float | None
    previous_display: str | None
    change_abs: float | None
    change_pct: float | None = Field(None, description="Percent change (percentage points for growth)")
    change_display: str | None
    direction: str = Field(description="up | down | flat | none")
    is_synthetic: bool
    state_code: str | None = None
    state_name: str | None = None
    previous_state_code: str | None = None
    share_pct: float | None = None
    note: str | None = None


class KpiData(BaseModel):
    year: int
    previous_year: int | None
    kpis: list[Kpi]


class TrendPoint(BaseModel):
    year: int
    domestic_visits: float
    foreign_visits: float
    total_visits: float
    revenue_cr: float
    forex_cr: float
    total_display: str
    revenue_display: str
    yoy_total_pct: float | None
    yoy_note: str | None = None
    is_synthetic: bool


class Annotation(BaseModel):
    id: str
    type: str
    label: str
    year_from: int
    year_to: int
    baseline_year: int | None
    baseline_value: float | None
    trough_year: int | None
    trough_value: float | None
    drop_pct: float | None
    recovery_year: int | None
    description: str
    is_synthetic: bool


class TrendData(BaseModel):
    series: list[TrendPoint]
    annotations: list[Annotation]
