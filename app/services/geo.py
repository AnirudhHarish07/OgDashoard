"""Boundary GeoJSON with precomputed label points, bounding boxes and small-state flags."""
import json
from functools import lru_cache

from shapely.geometry import mapping, shape

from app.config import settings
from app.services import data


@lru_cache(maxsize=1)
def _base() -> list[dict]:
    raw = json.loads(settings.geo_path.read_text())
    states = data.frames().states.set_index("state_code")
    out = []
    for feat in raw["features"]:
        code = feat["properties"]["state_code"]
        geom = shape(feat["geometry"])
        parts = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
        main = max(parts, key=lambda p: p.area)  # label the biggest landmass (islands/enclaves)
        pt = main.centroid if main.contains(main.centroid) else main.representative_point()
        s = states.loc[code]
        minx, miny, maxx, maxy = geom.bounds
        out.append({
            "code": code, "geom": geom,
            "props": {
                "state_code": code, "state_name": s["state_name"], "region": s["region"],
                "centroid": [round(pt.x, 4), round(pt.y, 4)],
                "bbox": [round(minx, 4), round(miny, 4), round(maxx, 4), round(maxy, 4)],
                "small_state": bool(s["area_km2"] < settings.small_state_area_km2),
                "is_synthetic": True,  # small_state derives from the unverified area_km2 reference value
            }})
    return out


@lru_cache(maxsize=16)
def feature_collection(tolerance: float, codes: tuple[str, ...]) -> dict:
    feats = []
    for e in _base():
        if codes and e["code"] not in codes:
            continue
        g = e["geom"].simplify(tolerance, preserve_topology=True) if tolerance > 0 else e["geom"]
        feats.append({"type": "Feature", "properties": e["props"], "geometry": mapping(g)})
    return {"type": "FeatureCollection", "features": feats}
