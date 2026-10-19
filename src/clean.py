"""Stage 2: standardise names and build reference tables.

Outputs
  data/processed/states.csv
  data/processed/state_name_aliases.csv
  data/processed/state_boundary_mapping.csv
  data/interim/attractions_base.csv   (footfall added in synthesize.py)
  data/processed/festivals_events.csv
"""
import re

import pandas as pd

from common import INTERIM, PROC, REF_SOURCE
from reference import ALIASES, ATTRACTIONS, BOUNDARY_MAP, FESTIVALS, STATES


def _key(name):
    return re.sub(r"\s+", " ", name.replace("&", " and ")).strip().casefold()


def build_standardizer(canonical_names):
    lookup = {_key(n): n for n in canonical_names}
    for alias, target in ALIASES.items():
        lookup[_key(alias)] = target
    missing = [t for t in ALIASES.values() if _key(t) not in lookup]
    assert not missing, f"alias targets not canonical: {missing}"

    def standardize(name):
        try:
            return lookup[_key(name)]
        except KeyError:
            raise ValueError(f"unknown state name: {name!r}")

    return standardize


def main():
    PROC.mkdir(parents=True, exist_ok=True)
    INTERIM.mkdir(parents=True, exist_ok=True)

    states = pd.DataFrame(
        STATES,
        columns=["state_code", "state_name", "region", "capital", "area_km2",
                 "population", "tourism_type_tags"],
    )
    assert len(states) == 36 and states.state_code.is_unique and states.state_name.is_unique
    standardize = build_standardizer(states.state_name)
    states["state_name"] = states.state_name.map(standardize)
    states["area_km2"] = states.area_km2.astype("int64")
    states["population"] = states.population.astype("int64")
    states["data_source"] = REF_SOURCE + "; population = Census 2011 (approx.)"
    states["is_synthetic"] = True
    states.to_csv(PROC / "states.csv", index=False)

    code_of = dict(zip(states.state_code, states.state_name))
    alias_rows = [(a, t) for a, t in ALIASES.items()]
    alias_rows += [(n, n) for n in states.state_name]
    aliases = pd.DataFrame(alias_rows, columns=["raw_name", "standard_name"]).sort_values("raw_name")
    aliases["data_source"] = REF_SOURCE + "; lookup of historical/variant spellings"
    aliases["is_synthetic"] = True
    aliases.to_csv(PROC / "state_name_aliases.csv", index=False)

    mp = pd.DataFrame(BOUNDARY_MAP, columns=[
        "legacy_entity", "legacy_valid_from", "legacy_valid_to", "current_state_code",
        "effective_from", "indicative_share", "note"])
    assert mp.current_state_code.isin(code_of).all()
    mp.insert(4, "current_state_name", mp.current_state_code.map(code_of))
    mp["data_source"] = REF_SOURCE + "; indicative_share is an assumption"
    mp["is_synthetic"] = True
    mp.to_csv(PROC / "state_boundary_mapping.csv", index=False)

    att = pd.DataFrame(ATTRACTIONS, columns=[
        "name", "state_code", "type", "is_unesco", "is_asi_protected", "tier"])
    att["name"] = att.name.str.strip()
    assert att.state_code.isin(code_of).all() and not att.duplicated(["name", "state_code"]).any()
    assert set(att.state_code) == set(code_of), "every state/UT needs >=1 attraction"
    att["is_unesco"] = att.is_unesco.astype(bool)
    att["is_asi_protected"] = att.is_asi_protected.astype(bool)
    att.to_csv(INTERIM / "attractions_base.csv", index=False)

    fest = pd.DataFrame(FESTIVALS, columns=["name", "state_code", "month", "type"])
    assert fest.state_code.isin(code_of).all() and fest.month.between(1, 12).all()
    assert set(fest.state_code) == set(code_of), "every state/UT needs >=1 festival"
    fest["data_source"] = REF_SOURCE
    fest["is_synthetic"] = True
    fest.to_csv(PROC / "festivals_events.csv", index=False)
    print(f"[clean] states={len(states)} attractions={len(att)} festivals={len(fest)}")


if __name__ == "__main__":
    main()
