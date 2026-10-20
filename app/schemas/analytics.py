from pydantic import BaseModel, Field


class HistoryPoint(BaseModel):
    year: int
    value: float | None
    display: str | None
    used_in_training: bool
    excluded_reason: str | None = Field(None, description="covid_outlier for 2020-21")
    is_forecast: bool = False
    is_synthetic: bool


class ForecastPoint(BaseModel):
    year: int
    value: float
    lower: float
    upper: float
    display: str | None
    lower_display: str | None
    upper_display: str | None
    is_forecast: bool = Field(True, description="Always true: a model projection, not data")
    is_synthetic: bool = Field(description="True if any training value is synthetic")


class ModelInfo(BaseModel):
    name: str
    training_years: list[int]
    excluded_years: list[int]
    implied_annual_growth_pct: float | None
    interval: str


class ForecastData(BaseModel):
    metric: str
    scope: dict
    horizon: int
    confidence_level: float
    model: ModelInfo | None
    history: list[HistoryPoint]
    forecast: list[ForecastPoint]
    notes: list[str]


class Anomaly(BaseModel):
    state_code: str
    state_name: str
    region: str
    year: int
    kind: str = Field(description="spike | drop, relative to the peer median growth that year")
    z_score: float
    value: float
    value_display: str | None
    previous_value: float
    previous_display: str | None
    growth_pct: float
    growth_display: str | None
    peer_median_growth_pct: float
    deviation_pp: float
    state_mean_deviation_pp: float
    state_std_deviation_pp: float
    summary: str
    history_points: int
    is_synthetic: bool


class AnomalyData(BaseModel):
    metric: str
    threshold: float
    n_candidates: int
    n_scored: int
    method: str
    anomalies: list[Anomaly]
