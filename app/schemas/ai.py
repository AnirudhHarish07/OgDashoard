from typing import Any

from pydantic import BaseModel, Field


class InsightCard(BaseModel):
    id: str
    kind: str
    title: str
    text: str
    text_source: str = Field(description="claude | template")
    state_codes: list[str]
    figures: dict[str, str] = Field(description="Display strings the sentence is allowed to use")
    values: dict[str, Any]
    is_synthetic: bool
    synthetic_based: bool


class InsightData(BaseModel):
    year: int
    state: str | None
    phrasing: str = Field(description="claude | template")
    cards: list[InsightCard]


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500, examples=["top 5 states for foreign tourists in 2023"])


class AskData(BaseModel):
    question: str
    title: str
    explanation: str
    chart_type: str = Field(description="bar | line | map | table")
    sql: str = Field(description="The validated SQL that was executed")
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int
    truncated: bool
    tables_used: list[str]
