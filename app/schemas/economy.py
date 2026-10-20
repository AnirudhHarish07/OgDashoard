from pydantic import BaseModel, Field


class EconomyState(BaseModel):
    state_code: str
    state_name: str
    region: str
    revenue_cr: float
    revenue_display: str | None
    gsdp_cr: float
    gsdp_display: str | None
    tourism_share_of_gsdp: float
    tourism_share_display: str | None
    revenue_per_tourist: float
    revenue_per_tourist_display: str | None
    forex_earnings_cr: float
    forex_display: str | None
    forex_share_of_revenue_pct: float
    tourism_employment: int
    rank_gsdp_share: int
    rank_revenue_per_tourist: int
    rank_forex: int
    is_synthetic: bool


class EconomySummary(BaseModel):
    revenue_cr: float
    revenue_display: str | None
    forex_earnings_cr: float
    forex_display: str | None
    gsdp_cr: float
    tourism_share_of_gsdp: float
    revenue_per_tourist: float
    revenue_per_tourist_display: str | None
    is_synthetic: bool


class EconomyData(BaseModel):
    year: int
    summary: EconomySummary | None
    states: list[EconomyState]


class Thresholds(BaseModel):
    p25: float
    median: float
    p75: float
    method: str


class DemandState(BaseModel):
    state_code: str
    state_name: str
    region: str
    visits: float
    visits_display: str | None
    hotel_rooms: int
    hotel_rooms_display: str | None
    hotels_total: int
    visits_per_room: float
    occupancy_rate: float
    status: str = Field(description="under_served | balanced | over_supplied")
    under_served: bool
    rooms_to_reach_median_ratio: int = Field(description="Extra rooms needed to match the median visits-per-room ratio")
    is_synthetic: bool


class DemandCapacityData(BaseModel):
    year: int
    thresholds: Thresholds | None
    states: list[DemandState]


class NationalOccupancy(BaseModel):
    year: int
    weighted_occupancy_rate: float = Field(description="Room-weighted mean occupancy (%)")
    mean_occupancy_rate: float
    hotel_rooms: int
    n_states: int
    is_synthetic: bool


class OccupancyPoint(BaseModel):
    year: int
    occupancy_rate: float
    hotel_rooms: int
    is_synthetic: bool


class StateOccupancy(BaseModel):
    state_code: str
    state_name: str
    region: str
    points: list[OccupancyPoint]


class OccupancyData(BaseModel):
    national: list[NationalOccupancy]
    states: list[StateOccupancy]
