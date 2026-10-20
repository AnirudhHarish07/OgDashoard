"""Dissolve a district-level India GeoJSON into one simplified feature per state/UT.

Usage: python scripts/build_geo.py <districts.geojson> [out.geojson]
Geometry only: properties are state_code (matched to the dataset's states table),
state_name and source. Output is written to data/geo/india_states.geojson.
"""
import json
import sqlite3
import sys
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "udit-001/india-maps-data (district boundaries, Census 2011 basis, dissolved to states)"


def main(src: str, out: str) -> None:
    db = sqlite3.connect(f"file:{ROOT / 'data' / 'india_tourism.db'}?mode=ro", uri=True)
    codes = {n: c for c, n in db.execute("select state_code, state_name from states")}
    groups: dict[str, list] = {}
    for f in json.load(open(src))["features"]:
        groups.setdefault(f["properties"]["st_nm"], []).append(shape(f["geometry"]).buffer(0))
    missing = set(codes) ^ set(groups)
    if missing:
        raise SystemExit(f"state name mismatch: {sorted(missing)}")
    feats = []
    for name, geoms in sorted(groups.items()):
        g = unary_union(geoms).simplify(0.005, preserve_topology=True)
        feats.append({"type": "Feature",
                      "properties": {"state_code": codes[name], "state_name": name, "source": SOURCE},
                      "geometry": json.loads(json.dumps(mapping(g)))})
    fc = {"type": "FeatureCollection", "features": feats}
    Path(out).write_text(json.dumps(fc, separators=(",", ":"), default=lambda o: round(o, 5)))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else str(ROOT / "data/geo/india_states.geojson"))
