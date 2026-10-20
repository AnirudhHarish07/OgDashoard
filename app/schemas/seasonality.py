from pydantic import BaseModel, Field


class HeatCell(BaseModel):
    month: int
    value: float
    display: str | None
    share_of_year_pct: float | None
    intensity_row: float | None = Field(description="value / the state's own busiest month (0-1): seasonal shape")
    intensity_global: float | None = Field(description="value / busiest state-month overall (0-1): absolute volume")
    is_synthetic: bool


class HeatRow(BaseModel):
    state_code: str
    state_name: str
    region: str
    peak_month: int
    low_month: int
    peak_to_low_ratio: float | None
    year_total: float
    cells: list[HeatCell]


class HeatmapData(BaseModel):
    year: int
    months: list[int]
    month_names: list[str]
    max_value: float | None
    rows: list[HeatRow]


class TypeMonth(BaseModel):
    month: int
    month_name: str
    value: float
    display: str | None
    share_of_year_pct: float
    seasonal_index: float = Field(description="100 = average month")
    is_synthetic: bool


class TypeCurve(BaseModel):
    tourism_type: str
    n_states: int
    state_codes: list[str]
    peak_month: int
    low_month: int
    months: list[TypeMonth]


class ByTypeData(BaseModel):
    year: int
    curves: list[TypeCurve]


class FestivalEvent(BaseModel):
    name: str
    state_code: str
    state_name: str
    region: str
    month: int
    month_name: str
    type: str
    is_synthetic: bool


class MonthCount(BaseModel):
    month: int
    month_name: str
    count: int


class FestivalData(BaseModel):
    month: int | None
    events: list[FestivalEvent]
    by_month: list[MonthCount] = Field(description="Event counts per month for the filtered states (ignores the month filter)")
