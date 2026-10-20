"""Contract and deployment checks: openapi.json is current, samples exist, the DB can be rebuilt from CSVs."""
import json
import os
import subprocess
import sys
from pathlib import Path

from app.main import app

ROOT = Path(__file__).resolve().parents[1]


def test_openapi_json_is_up_to_date():
    committed = json.loads((ROOT / "openapi.json").read_text())
    assert committed == json.loads(json.dumps(app.openapi())), "openapi.json is stale: run python scripts/export_openapi.py"


def test_every_route_has_a_response_model_and_docs():
    spec = app.openapi()
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            assert "200" in op["responses"], (path, method)
            assert op.get("summary") or op.get("description"), (path, method)


def test_samples_cover_every_endpoint():
    index = json.loads((ROOT / "samples" / "_index.json").read_text())
    covered = {i["request"].split(" ")[0].split("?")[0] for i in index}
    spec_paths = set(app.openapi()["paths"])
    for p in spec_paths:
        base = p.split("{")[0].rstrip("/")
        assert any(c == p or c.startswith(base) for c in covered), f"no sample for {p}"
    for i in index:
        assert (ROOT / "samples" / i["file"]).exists()


def test_database_rebuilds_from_csv_when_missing(tmp_path):
    db = tmp_path / "rebuilt.db"
    code = ("from fastapi.testclient import TestClient\nfrom app.main import app\n"
            "with TestClient(app) as c:\n    r = c.get('/api/overview/kpis?year=2024').json()\n"
            "    print(r['data']['kpis'][0]['value'])")
    out = subprocess.run([sys.executable, "-c", code], cwd=ROOT, env={**os.environ, "DATABASE_PATH": str(db)},
                         capture_output=True, text=True, timeout=120)
    assert out.returncode == 0, out.stderr[-500:]
    assert db.exists() and float(out.stdout.strip().splitlines()[-1]) == 2870000000.0


def test_cors_origins_and_port_come_from_env():
    code = "from app.config import settings; print(settings.cors_origins, settings.port)"
    out = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True,
                         env={**os.environ, "CORS_ORIGINS": "https://a.example, https://b.example", "PORT": "9123"})
    assert "('https://a.example', 'https://b.example') 9123" in out.stdout
    out = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True,
                         env={k: v for k, v in os.environ.items() if k not in ("CORS_ORIGINS", "PORT")})
    assert "('http://localhost:5173',) 8000" in out.stdout
