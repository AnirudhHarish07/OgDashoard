"""Build data/india_tourism.db from data/processed/*.csv and add lookup indexes.

Usage: python scripts/load_db.py [--force]
The loader never touches raw sources and never alters values; it only loads the CSVs and adds indexes.
"""
import sqlite3
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

UNIQUE = {
    "states": "state_code", "tourism_annual": "state_code, year", "tourism_monthly": "state_code, year, month",
    "infrastructure": "state_code, year", "attractions": "name, state_code",
    "ftv_source_countries": "state_code, year, country", "festivals_events": "name, state_code",
    "national_annual": "year", "state_boundary_mapping": "legacy_entity, current_state_code",
    "state_name_aliases": "raw_name",
}
LOOKUP = {  # table -> columns that get their own single-column index
    "tourism_annual": ["state_code", "year"], "tourism_monthly": ["state_code", "year", "month"],
    "infrastructure": ["state_code", "year"], "attractions": ["state_code"],
    "ftv_source_countries": ["state_code", "year"], "festivals_events": ["state_code", "month"],
}


def add_indexes(conn: sqlite3.Connection) -> None:
    for table, cols in LOOKUP.items():
        for c in cols:
            conn.execute(f'CREATE INDEX IF NOT EXISTS idx_{table}_{c} ON "{table}" ("{c}")')
    conn.commit()


def build_db(db_path: Path, processed_dir: Path) -> None:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        for table, key in UNIQUE.items():
            df = pd.read_csv(processed_dir / f"{table}.csv")
            for col in df.columns:
                if df[col].dtype == bool:
                    df[col] = df[col].astype(int)
                elif df[col].dtype == object and set(df[col].dropna().unique()) <= {"True", "False"} and col.startswith(("is_",)):
                    df[col] = (df[col] == "True").astype(int)
            df.to_sql(table, conn, if_exists="replace", index=False)
            conn.execute(f'CREATE UNIQUE INDEX IF NOT EXISTS ux_{table} ON "{table}" ({key})')
        add_indexes(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    from app.config import settings
    path = settings.database_path
    if "--force" in sys.argv and path.exists():
        path.unlink()
    if path.exists():
        conn = sqlite3.connect(path)
        add_indexes(conn)
        conn.close()
        print(f"{path}: exists, indexes ensured")
    else:
        build_db(path, settings.processed_dir)
        print(f"{path}: built from {settings.processed_dir}")
