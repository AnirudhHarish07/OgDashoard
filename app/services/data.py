"""Dataset access. Tables are read once through a read-only connection and held in memory
(the whole dataset is ~10k rows). Nothing here fabricates or adjusts values."""
from functools import lru_cache
from types import SimpleNamespace

import pandas as pd

from app.db import TABLES, connect_ro

BOOL_COL = "is_synthetic"


@lru_cache(maxsize=1)
def frames() -> SimpleNamespace:
    conn = connect_ro()
    try:
        t = {name: pd.read_sql_query(f'SELECT * FROM "{name}"', conn) for name in TABLES}
    finally:
        conn.close()
    for df in t.values():
        df[BOOL_COL] = df[BOOL_COL].astype(bool)
    states = t["states"]
    info = states[["state_code", "state_name", "region", "tourism_type_tags", "population"]]
    annual = t["tourism_annual"].merge(info, on="state_code", how="left")
    annual["pop_synthetic"] = annual["state_code"].map(states.set_index("state_code")[BOOL_COL])
    annual["total_visits"] = annual["domestic_visits"] + annual["foreign_visits"]
    # derived: domestic revenue = total revenue - foreign (forex) spend
    annual["domestic_revenue_cr"] = annual["tourism_revenue_cr"] - annual["forex_earnings_cr"]
    t["annual"] = annual
    t["table_counts"] = {n: len(t[n]) for n in TABLES}
    return SimpleNamespace(**t)


def reset() -> None:
    frames.cache_clear()


def with_state_info(df: pd.DataFrame) -> pd.DataFrame:
    f = frames()
    info = f.states[["state_code", "state_name", "region", "tourism_type_tags"]]
    return df.merge(info, on="state_code", how="left")


def years() -> list[int]:
    return sorted(int(y) for y in frames().tourism_annual["year"].unique())


def latest_year() -> int:
    return years()[-1]


def state_name(code: str) -> str:
    s = frames().states
    return s.loc[s.state_code == code, "state_name"].iloc[0]


def tag_set() -> list[str]:
    tags = set()
    for v in frames().states["tourism_type_tags"].dropna():
        tags.update(x.strip() for x in v.split(";") if x.strip())
    return sorted(tags)


def sources_for(*tables: str) -> list[str]:
    f = frames()
    out: set[str] = set()
    for tb in tables:
        out.update(f.__dict__[tb]["data_source"].dropna().unique())
    return sorted(out)
