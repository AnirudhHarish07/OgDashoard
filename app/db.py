"""Read-only SQLite access. Every connection is opened with mode=ro."""
import sqlite3
from contextlib import contextmanager

from app.config import settings

TABLES = ["states", "tourism_annual", "tourism_monthly", "infrastructure", "attractions",
          "ftv_source_countries", "festivals_events", "national_annual",
          "state_boundary_mapping", "state_name_aliases"]


def connect_ro(timeout_seconds: float | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{settings.database_path}?mode=ro", uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = ON")
    return conn


@contextmanager
def read_conn():
    conn = connect_ro()
    try:
        yield conn
    finally:
        conn.close()


def ensure_database() -> None:
    """Rebuild the DB from data/processed/*.csv when missing (never from raw sources)."""
    if settings.database_path.exists():
        return
    from scripts.load_db import build_db
    build_db(settings.database_path, settings.processed_dir)
