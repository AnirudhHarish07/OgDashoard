"""Run the whole pipeline: fetch -> clean -> synthesize -> SQLite."""
import sqlite3
import sys

import pandas as pd

import clean
import fetch
import synthesize
from common import DB_PATH, PROC

# table -> unique key columns
TABLES = {
    "states": ["state_code"],
    "state_name_aliases": ["raw_name"],
    "state_boundary_mapping": ["legacy_entity", "current_state_code"],
    "national_annual": ["year"],
    "tourism_annual": ["state_code", "year"],
    "tourism_monthly": ["state_code", "year", "month"],
    "infrastructure": ["state_code", "year"],
    "attractions": ["name", "state_code"],
    "ftv_source_countries": ["state_code", "year", "country"],
    "festivals_events": ["name", "state_code"],
}


def load_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    con = sqlite3.connect(DB_PATH)
    for name, key in TABLES.items():
        df = pd.read_csv(PROC / f"{name}.csv")
        if "is_synthetic" in df:
            df["is_synthetic"] = df.is_synthetic.astype(int)
        df.to_sql(name, con, index=False)
        con.execute(f"CREATE UNIQUE INDEX ux_{name} ON {name} ({', '.join(key)})")
    con.commit()
    con.close()
    print(f"[build] loaded {len(TABLES)} tables into {DB_PATH}")


def main():
    fetch.main()
    clean.main()
    synthesize.main()
    load_db()


if __name__ == "__main__":
    sys.exit(main())
