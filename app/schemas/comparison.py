from pydantic import BaseModel, Field


class RankItem(BaseModel):
    rank: int = Field(description="Rank within the filtered scope (1 = highest value)")
    national_rank: int | None = Field(description="Rank across all states")
    state_code: str
    state_name: str
    region: str
    value: float
    display: str | None
    share_pct: float | None = Field(description="Share of the scope total (additive metrics only)")
    yoy_change: float | None
    yoy_display: str | None
    is_synthetic: bool


class RankingData(BaseModel):
    metric: str
    label: str
    unit: str
    year: int
    order: str
    n: int
    items: list[RankItem]


class RaceItem(BaseModel):
    rank: int
    state_code: str
    state_name: str
    value: float
    display: str | None
    is_synthetic: bool


class RaceFrame(BaseModel):
    year: int
    items: list[RaceItem]


class RaceState(BaseModel):
    state_code: str
    state_name: str
    region: str


class RaceData(BaseModel):
    metric: str
    label: str
    unit: str
    max_value: float | None = Field(description="Largest value across frames, for a fixed axis")
    states: list[RaceState]
    frames: list[RaceFrame]


class CompareValue(BaseModel):
    value: float | None
    display: str | None
    is_synthetic: bool


class CompareMetric(BaseModel):
    key: str
    label: str
    unit: str
    higher_is_better: bool
    leader: str | None
    values: dict[str, CompareValue]


class CompareSeriesPoint(BaseModel):
    year: int
    total_visits: float
    domestic_visits: float
    foreign_visits: float
    revenue: float
    is_synthetic: bool


class CompareState(BaseModel):
    state_code: str
    state_name: str


class CompareData(BaseModel):
    year: int
    states: list[CompareState]
    metrics: list[CompareMetric]
    series: dict[str, list[CompareSeriesPoint]]


class ScatterPoint(BaseModel):
    state_code: str
    state_name: str
    region: str
    visits: float
    visits_display: str | None
    revenue_per_tourist: float
    revenue_per_tourist_display: str | None
    hotel_rooms: float | None
    hotel_rooms_display: str | None
    bubble_size: float | None = Field(description="hotel_rooms / max hotel_rooms (0-1)")
    is_synthetic: bool


class ScatterData(BaseModel):
    year: int
    x: str
    y: str
    size: str
    medians: dict[str, float | None]
    points: list[ScatterPoint]
