from pydantic import BaseModel, Field


class GeoProps(BaseModel):
    state_code: str
    state_name: str
    region: str
    centroid: list[float] = Field(description="[lon, lat] label position")
    bbox: list[float] = Field(description="[minLon, minLat, maxLon, maxLat] for fitBounds/flyTo")
    small_state: bool = Field(description="true -> use a leader-line label")
    is_synthetic: bool


class GeoFeature(BaseModel):
    type: str = "Feature"
    properties: GeoProps
    geometry: dict


class GeoCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[GeoFeature]
    meta: dict


class MapState(BaseModel):
    state_code: str
    state_name: str
    region: str
    value: float | None
    display: str | None
    rank: int | None
    is_top10: bool
    color_bucket: int | None = Field(None, description="1-10 for the top 10 (1 = highest), else null")
    yoy_change: float | None = Field(None, description="% change vs previous year (percentage points for growth_pct)")
    yoy_display: str | None
    height: float | None = Field(None, description="0-1 normalised height for 3D extrusion")
    is_synthetic: bool
    note: str | None = None


class MapData(BaseModel):
    year: int
    metric: str
    label: str
    unit: str
    min_value: float | None
    max_value: float | None
    states: list[MapState]
