"""Write the API's OpenAPI schema to openapi.json (the front-end data contract).

Usage: python scripts/export_openapi.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: E402


def render() -> str:
    return json.dumps(app.openapi(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    out = ROOT / "openapi.json"
    out.write_text(render())
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")
