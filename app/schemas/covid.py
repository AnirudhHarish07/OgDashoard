from pydantic import BaseModel, Field


class SplitRecovery(BaseModel):
    baseline: float
    trough: float
    latest: float
    trough_drop_pct: float | None
    recovery_pct: float | None


class CovidState(BaseModel):
    rank: int = Field(description="1 = fastest / highest recovery")
    state_code: str
    state_name: str
    region: str
    baseline_year: int
    baseline_visits: float
    baseline_display: str | None
    covid_visits: dict[str, float]
    drop_pct: dict[str, float | None] = Field(description="% change vs baseline for each COVID year")
    trough_year: int
    trough_drop_pct: float | None
    latest_year: int
    latest_visits: float
    latest_display: str | None
    recovery_pct: float | None = Field(description="latest year / 2019 baseline x 100")
    recovery_display: str | None
    recovered: bool
    recovery_year: int | None = Field(description="First year after the COVID years with visits >= baseline")
    domestic: SplitRecovery
    foreign: SplitRecovery
    is_synthetic: bool


class CovidSummary(BaseModel):
    baseline_visits: float
    latest_visits: float
    recovery_pct: float | None
    states_recovered: int
    n_states: int
    is_synthetic: bool


class CovidData(BaseModel):
    baseline_year: int
    covid_years: list[int]
    latest_year: int
    summary: CovidSummary | None
    states: list[CovidState]
