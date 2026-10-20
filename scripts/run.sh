#!/usr/bin/env bash
# One command: build the front end, then serve API + dashboard on http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")/.."
pip install -q -r requirements.txt
(cd frontend && npm ci && npm run build)
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
