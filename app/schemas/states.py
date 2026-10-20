from pydantic import BaseModel

from app.schemas.overview import Kpi


class UnescoSite(BaseModel):
    name: str
    type: str
    annual_footfall: int
    is_synthetic: bool


class Profile(BaseModel):
    state_code: str
    state_name: str
    region: str
    capital: str | None
    area_km2: int | None
    population: int | None
    population_display: str | None
    tourism_types: list[str]
    unesco_sites: list[UnescoSite]
    unesco_count: int
    airports: int | None
    international_airports: int | None
    first_year: int | None
    boundary_note: str | None
    is_synthetic: bool


class TrendPoint(BaseModel):
    year: int
    domestic_visits: float
    foreign_visits: float
    total_visits: float
    domestic_display: str | None
    foreign_display: str | None
    yoy_domestic_pct: float | None
    yoy_foreign_pct: float | None
    is_synthetic: bool


class SourceCountry(BaseModel):
    country: str
    foreign_visits: int
    display: str | None
    share_pct: float | None
    is_other: bool
    is_synthetic: bool


class Attraction(BaseModel):
    name: str
    type: str
    annual_footfall: int
    footfall_display: str | None
    footfall_year: int
    is_unesco: bool
    is_asi_protected: bool
    is_synthetic: bool


class OccupancyPoint(BaseModel):
    year: int
    occupancy_rate: float


class HotelInfra(BaseModel):
    year: int
    hotels_total: int
    hotel_rooms: int
    hotel_rooms_display: str | None
    occupancy_rate: float
    star_mix: list[dict]
    registered_homestays: int
    registered_tour_operators: int
    occupancy_history: list[OccupancyPoint]
    is_synthetic: bool


class MonthPoint(BaseModel):
    month: int
    month_name: str
    domestic_visits: int
    foreign_visits: int
    total_visits: int
    share_of_year_pct: float
    seasonal_index: float
    avg_temp_c: float
    season: str
    is_synthetic: bool


class Seasonality(BaseModel):
    year: int
    months: list[MonthPoint]
    peak_month: int | None
    low_month: int | None


class Festival(BaseModel):
    name: str
    month: int
    month_name: str
    type: str
    is_synthetic: bool


class RankPoint(BaseModel):
    year: int
    rank_total_visits: int
    total_visits: float
    rank_revenue: int | None
    is_synthetic: bool


class StateDetail(BaseModel):
    year: int
    profile: Profile
    kpis: list[Kpi]
    trend: list[TrendPoint]
    source_countries: list[SourceCountry]
    top_attractions: list[Attraction]
    hotel_infrastructure: HotelInfra | None
    seasonality: Seasonality
    festivals: list[Festival]
    rank_history: list[RankPoint]
    notes: list[str]
