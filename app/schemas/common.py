from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Meta(BaseModel):
    filters: dict = Field(description="Filters applied (plus resolved defaults)")
    data_sources: list[str] = Field(description="data_source values of the returned rows")
    synthetic_share: float = Field(description="Percentage (0-100) of returned values that are synthetic")
    record_count: int
    notes: list[str] = []


class Envelope(BaseModel, Generic[T]):
    data: T
    meta: Meta


class ErrorBody(BaseModel):
    code: str
    message: str
    details: object | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class ValueItem(BaseModel):
    """A numeric value with its display string and synthetic flag."""
    value: float | None
    display: str | None
    is_synthetic: bool
