"""Common query filters shared by every data endpoint."""
from dataclasses import dataclass
from typing import Literal

import pandas as pd
from fastapi import Query

from app.errors import ApiError
from app.services import data

VisitorType = Literal["domestic", "foreign", "all"]


@dataclass(frozen=True)
class Filters:
    year: int | None = None
    year_from: int | None = None
    year_to: int | None = None
    states: tuple[str, ...] = ()
    region: str | None = None
    tourism_type: str | None = None
    visitor_type: str = "all"
    include_synthetic: bool = True

    def key(self) -> tuple:
        return (self.year, self.year_from, self.year_to, self.states, self.region,
                self.tourism_type, self.visitor_type, self.include_synthetic)

    def as_dict(self) -> dict:
        return {"year": self.year, "year_from": self.year_from, "year_to": self.year_to,
                "states": list(self.states), "region": self.region, "tourism_type": self.tourism_type,
                "visitor_type": self.visitor_type, "include_synthetic": self.include_synthetic}

    def with_(self, **kw) -> "Filters":
        d = {**self.__dict__, **kw}
        return Filters(**d)


def common_filters(
    year: int | None = Query(None, description="Single year"),
    year_from: int | None = Query(None, description="Start of year range (inclusive)"),
    year_to: int | None = Query(None, description="End of year range (inclusive)"),
    states: str | None = Query(None, description="Comma-separated state codes, e.g. KL,GA"),
    region: str | None = Query(None, description="North, South, East, West, Central, North-East, Islands"),
    tourism_type: str | None = Query(None, description="Tag, e.g. heritage, beach, hill (states carrying the tag)"),
    visitor_type: VisitorType = Query("all", description="domestic | foreign | all"),
    include_synthetic: bool = Query(True, description="false drops every synthetic value"),
) -> Filters:
    avail = data.years()
    for name, v in (("year", year), ("year_from", year_from), ("year_to", year_to)):
        if v is not None and v not in avail:
            raise ApiError(422, "year_not_available", f"{name}={v} is outside the dataset ({avail[0]}-{avail[-1]})")
    if year_from and year_to and year_from > year_to:
        raise ApiError(422, "bad_year_range", "year_from must be <= year_to")
    codes = tuple(c.strip().upper() for c in states.split(",") if c.strip()) if states else ()
    known = set(data.frames().states.state_code)
    bad = [c for c in codes if c not in known]
    if bad:
        raise ApiError(422, "unknown_state", f"Unknown state code(s): {', '.join(bad)}", {"valid": sorted(known)})
    reg = None
    if region:
        regions = {r.lower(): r for r in data.frames().states.region.unique()}
        if region.lower() not in regions:
            raise ApiError(422, "unknown_region", f"Unknown region '{region}'", {"valid": sorted(regions.values())})
        reg = regions[region.lower()]
    tt = None
    if tourism_type:
        tt = tourism_type.lower()
        if tt not in data.tag_set():
            raise ApiError(422, "unknown_tourism_type", f"Unknown tourism_type '{tourism_type}'", {"valid": data.tag_set()})
    return Filters(year, year_from, year_to, codes, reg, tt, visitor_type, include_synthetic)


def resolve_years(f: Filters) -> list[int]:
    avail = data.years()
    if f.year is not None:
        return [f.year]
    lo, hi = f.year_from or avail[0], f.year_to or avail[-1]
    return [y for y in avail if lo <= y <= hi]


def filter_states(df: pd.DataFrame, f: Filters) -> pd.DataFrame:
    """Apply states / region / tourism_type. df needs state_code, region, tourism_type_tags."""
    if f.states:
        df = df[df["state_code"].isin(f.states)]
    if f.region:
        df = df[df["region"] == f.region]
    if f.tourism_type:
        df = df[df["tourism_type_tags"].fillna("").apply(lambda s: f.tourism_type in s.split(";"))]
    return df


def filter_all(df: pd.DataFrame, f: Filters, *, use_years: bool = True) -> pd.DataFrame:
    df = filter_states(df, f)
    if use_years and "year" in df:
        df = df[df["year"].isin(resolve_years(f))]
    if not f.include_synthetic:
        df = df[~df["is_synthetic"]]
    return df
