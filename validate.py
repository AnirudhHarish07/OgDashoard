"""Validate data/processed/*.csv and print a summary report. Exit 1 on failures."""
import sys
from pathlib import Path

import pandas as pd

PROC = Path(__file__).resolve().parent / "data" / "processed"
KEYS = {
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
# columns that may legitimately be null
ALLOWED_NULL = {"tourism_annual": {"yoy_growth_domestic", "yoy_growth_foreign"},
                "state_boundary_mapping": {"indicative_share"}}

fails, notes = [], []


def check(ok, msg):
    if not ok:
        fails.append(msg)


def main():
    t = {k: pd.read_csv(PROC / f"{k}.csv") for k in KEYS}
    codes = set(t["states"].state_code)

    for name, df in t.items():
        nulls = df.isna().sum()
        bad = [c for c, v in nulls.items() if v and c not in ALLOWED_NULL.get(name, set())]
        check(not bad, f"{name}: unexpected nulls in {bad}")
        check(not df.duplicated(KEYS[name]).any(), f"{name}: duplicate keys {KEYS[name]}")
        if "is_synthetic" in df:
            check(df.is_synthetic.dtype == bool, f"{name}: is_synthetic not boolean")
            check(df.data_source.notna().all(), f"{name}: missing data_source")
        else:
            fails.append(f"{name}: no is_synthetic column")
        if "state_code" in df:
            check(df.state_code.isin(codes).all(), f"{name}: unknown state_code")

    a, m, i, f, n = (t[k] for k in ("tourism_annual", "tourism_monthly", "infrastructure",
                                    "ftv_source_countries", "national_annual"))
    check(len(t["states"]) == 36, "states: expected 36 rows")
    check(set(a[a.year >= 2019].state_code) == codes, "annual: all 36 entities needed from 2019")
    check(set(a[a.year < 2019].state_code) == codes - {"LA"}, "annual: LA must be absent pre-2019")

    # monthly -> annual, source countries -> annual
    ms = m.groupby(["state_code", "year"])[["domestic_visits", "foreign_visits"]].sum().reset_index()
    j = a.merge(ms, on=["state_code", "year"], suffixes=("", "_m"))
    check(len(j) == len(a), "monthly: missing state-years")
    check((j.domestic_visits == j.domestic_visits_m).all(), "monthly domestic sums != annual")
    check((j.foreign_visits == j.foreign_visits_m).all(), "monthly foreign sums != annual")
    fs = f.groupby(["state_code", "year"]).foreign_visits.sum().reset_index()
    j = a.merge(fs, on=["state_code", "year"], suffixes=("", "_c"))
    check((j.foreign_visits == j.foreign_visits_c).all(), "source-country sums != annual foreign")
    check((m.groupby(["state_code", "year"]).size() == 12).all(), "monthly: need 12 months")

    # state sums vs national
    s = a.groupby("year")[["domestic_visits", "foreign_visits", "tourism_revenue_cr"]].sum()
    n = n.set_index("year")
    check((s.domestic_visits == n.domestic_visits_total).all(), "state domestic sum != national")
    check((s.foreign_visits == n.foreign_visits_total).all(), "state foreign sum != national")
    check(((s.tourism_revenue_cr - n.tourism_revenue_cr_total).abs() < 1).all(),
          "state revenue sum != national")
    shares = a.groupby("year").share_of_india_total.sum()
    check(((shares - 100).abs() < 0.05).all(), "share_of_india_total does not sum to ~100")

    # revenue ~ visits x spend, forex <= revenue
    approx = (a.domestic_visits + a.foreign_visits) * a.avg_spend_per_tourist / 1e7
    err = ((approx - a.tourism_revenue_cr).abs() / a.tourism_revenue_cr.clip(lower=1e-9)).max()
    check(err < 0.01, f"revenue != visits x spend (max rel err {err:.4f})")
    check((a.forex_earnings_cr <= a.tourism_revenue_cr + 0.01).all(), "forex > revenue")

    # ranges
    for df, name, cols in [(a, "annual", ["domestic_visits", "foreign_visits", "tourism_revenue_cr",
                                          "tourism_employment", "gsdp_cr"]),
                           (m, "monthly", ["domestic_visits", "foreign_visits"]),
                           (i, "infra", [c for c in i.columns if c not in
                                         ("state_code", "year", "data_source", "is_synthetic")])]:
        check((df[cols] >= 0).all().all(), f"{name}: negative values")
    check(a.tourism_share_of_gsdp.between(0, 100).all(), "tourism_share_of_gsdp outside 0-100")
    check(a.share_of_india_total.between(0, 100).all(), "share_of_india_total outside 0-100")
    check(i.occupancy_rate.between(0, 100).all(), "occupancy outside 0-100")
    check((i.international_airports <= i.airports).all(), "intl airports > airports")
    star = [c for c in i.columns if c.startswith("hotels_") and c != "hotels_total"]
    check((i[star].sum(axis=1) == i.hotels_total).all(), "hotels_by_star != hotels_total")
    check((i.hotel_rooms >= i.hotels_total).all(), "rooms < hotels")
    check(m.month.between(1, 12).all(), "month outside 1-12")
    check(t["festivals_events"].month.between(1, 12).all(), "festival month outside 1-12")
    for col in ("domestic_visits", "foreign_visits", "tourism_employment"):
        check(a[col].dtype.kind == "i", f"annual.{col} not integer")

    # COVID shape
    d = n.domestic_visits_total
    check(d[2020] < 0.4 * d[2019] and d[2023] > d[2019] * 0.9, "COVID collapse/recovery shape off")

    print("=" * 66)
    print("VALIDATION REPORT")
    print("=" * 66)
    print(f"{'table':<26}{'rows':>8}{'synthetic rows':>16}{'% synthetic':>13}")
    for name, df in t.items():
        syn = int(df.is_synthetic.sum()) if "is_synthetic" in df else 0
        print(f"{name:<26}{len(df):>8}{syn:>16}{100 * syn / len(df):>12.1f}%")
    print("-" * 66)
    print(f"annual years: {a.year.min()}-{a.year.max()}  entities: {a.state_code.nunique()}")
    print(f"national domestic 2019 / 2020 / {a.year.max()}: "
          f"{d[2019]:,} / {d[2020]:,} / {d[a.year.max()]:,}")
    if fails:
        print(f"\nFAILED ({len(fails)}):")
        for x in fails:
            print("  x", x)
        return 1
    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
