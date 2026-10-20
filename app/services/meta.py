"""Build the meta block attached to every response."""
from typing import Iterable

from app.services import data
from app.services.filters import Filters


def build_meta(f: Filters, tables: Iterable[str], flags: Iterable[bool], notes: list[str] | None = None,
               extra_sources: list[str] | None = None, resolved: dict | None = None) -> dict:
    flags = [bool(x) for x in flags]
    share = round(100 * sum(flags) / len(flags), 2) if flags else 0.0
    filters = f.as_dict()
    if resolved:
        filters["resolved"] = resolved
    return {
        "filters": filters,
        "data_sources": data.sources_for(*tables) + (extra_sources or []),
        "synthetic_share": share,
        "record_count": len(flags),
        "notes": notes or [],
    }
