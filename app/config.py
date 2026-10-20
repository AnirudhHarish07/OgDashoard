"""Runtime configuration, read from environment variables (see .env.example)."""
import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load_dotenv() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()


def _path(value: str) -> Path:
    p = Path(value)
    return p if p.is_absolute() else ROOT / p


@dataclass(frozen=True)
class Settings:
    database_path: Path = field(default_factory=lambda: _path(os.getenv("DATABASE_PATH", "data/india_tourism.db")))
    processed_dir: Path = ROOT / "data" / "processed"
    geo_path: Path = field(default_factory=lambda: _path(os.getenv("GEO_PATH", "data/geo/india_states.geojson")))
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip())
    )
    anthropic_api_key: str | None = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY") or None)
    claude_model: str = field(default_factory=lambda: os.getenv("CLAUDE_MODEL", "claude-opus-5-5"))
    port: int = field(default_factory=lambda: int(os.getenv("PORT", "8000")))
    claude_timeout_seconds: float = 45.0
    cache_ttl_seconds: int = 3600
    # States below this area (km2, from the states table) get small_state=true for leader-line labels.
    small_state_area_km2: int = 12000
    covid_years: tuple[int, int] = (2020, 2021)
    covid_baseline_year: int = 2019
    query_row_limit: int = 500
    query_timeout_seconds: float = 3.0


settings = Settings()
