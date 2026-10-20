from pydantic import BaseModel


class HealthData(BaseModel):
    status: str
    database: str
    database_path: str
    row_counts: dict[str, int]
    geo_file: str
    anthropic_configured: bool


class StateInfo(BaseModel):
    state_code: str
    state_name: str
    region: str
    tourism_types: list[str]
    first_year: int
    last_year: int
    boundary_note: str | None = None
    is_synthetic: bool


class MetricInfo(BaseModel):
    key: str
    label: str
    unit: str
    source_table: str


class FiltersData(BaseModel):
    years: list[int]
    states: list[StateInfo]
    regions: list[str]
    tourism_types: list[str]
    visitor_types: list[str]
    metrics: list[MetricInfo]
    months: list[int]
    forecast_metrics: list[str]


class TableSource(BaseModel):
    table: str
    rows: int
    data_sources: list[str]
    synthetic_rows: int
    synthetic_share: float


class MetricSource(BaseModel):
    metric: str
    source_table: str
    data_sources: list[str]
    synthetic_share: float


class SourcesData(BaseModel):
    tables: list[TableSource]
    metrics: list[MetricSource]
