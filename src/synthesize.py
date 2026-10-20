"""Stage 3: seeded synthetic generator (seed=42).

All numbers are illustrative. National totals per year are hard-coded
*illustrative anchors* (loosely shaped like the real pre-COVID peak, 2020-21
collapse and recovery); they are not verified government figures.
State values are drawn around those anchors and apportioned so that state sums
equal the national totals exactly, monthly sums equal annual totals, and the
foreign-source-country split sums to each state's foreign visits.
"""
import numpy as np
import pandas as pd

from common import INTERIM, PROC, SEED, SYN_SOURCE, YEAR_END, YEAR_START

YEARS = list(range(YEAR_START, YEAR_END + 1))

# Illustrative national anchors (millions of visits)
NAT_DOM = {2015: 1432, 2016: 1615, 2017: 1657, 2018: 1854, 2019: 2322, 2020: 610,
           2021: 677, 2022: 1731, 2023: 2509, 2024: 2870, 2025: 3050}
NAT_FOR = {2015: 8.03, 2016: 8.80, 2017: 10.04, 2018: 10.56, 2019: 10.93, 2020: 2.74,
           2021: 1.52, 2022: 6.44, 2023: 9.24, 2024: 9.90, 2025: 10.40}

# code: (domestic weight, foreign weight, profile, climate, GSDP 2015 in lakh crore,
#        airports 2015, international airports)
P = {
    "AP": (11, 0.20, "south", "coastal_s", 6.0, 6, 1),
    "AR": (0.05, 0.02, "ne", "ne", 0.15, 2, 0),
    "AS": (0.35, 0.15, "ne", "ne", 2.5, 5, 1),
    "BR": (1.3, 1.1, "plain", "east", 3.5, 4, 1),
    "CG": (0.5, 0.05, "plain", "central", 2.5, 3, 0),
    "GA": (0.35, 0.9, "beach", "coastal_w", 0.7, 2, 2),
    "GJ": (2.0, 0.3, "plain", "central", 10.0, 10, 3),
    "HR": (0.4, 0.05, "plain", "north_plain", 5.0, 2, 0),
    "HP": (1.2, 0.4, "hill", "hill", 1.3, 3, 0),
    "JH": (0.5, 0.03, "plain", "east", 2.6, 4, 0),
    "KA": (12, 1.0, "south", "central", 10.0, 8, 2),
    "KL": (0.7, 0.9, "beach", "coastal_s", 6.0, 4, 4),
    "MP": (5, 0.3, "plain", "central", 6.0, 7, 1),
    "MH": (5, 4.4, "plain", "coastal_w", 20.0, 14, 3),
    "MN": (0.03, 0.02, "ne", "ne", 0.2, 1, 0),
    "ML": (0.1, 0.05, "ne", "ne", 0.25, 1, 0),
    "MZ": (0.02, 0.01, "ne", "ne", 0.1, 1, 0),
    "NL": (0.03, 0.01, "ne", "ne", 0.2, 1, 0),
    "OD": (0.9, 0.1, "beach", "east", 3.8, 4, 0),
    "PB": (1.5, 0.3, "plain", "north_plain", 4.0, 5, 2),
    "RJ": (2.5, 1.8, "desert", "desert", 6.5, 6, 1),
    "SK": (0.03, 0.02, "hill", "hill", 0.2, 1, 0),
    "TN": (21, 3.5, "south", "coastal_s", 12.0, 8, 4),
    "TS": (4, 0.6, "south", "central", 6.0, 4, 1),
    "TR": (0.05, 0.02, "ne", "ne", 0.3, 1, 0),
    "UP": (23, 2.8, "plain", "north_plain", 11.0, 12, 2),
    "UT": (1.5, 0.12, "hill", "hill", 2.0, 3, 0),
    "WB": (3.5, 1.4, "plain", "east", 8.0, 5, 1),
    "AN": (0.04, 0.03, "island", "island", 0.06, 1, 1),
    "CH": (0.1, 0.02, "plain", "north_plain", 0.3, 1, 1),
    "DD": (0.15, 0.02, "beach", "coastal_w", 0.15, 2, 0),
    "DL": (1.0, 2.4, "plain", "north_plain", 6.0, 1, 1),
    "JK": (1.4, 0.1, "hill", "hill", 1.1, 2, 1),
    "LA": (0.0737, 0.03, "cold", "cold", 0.03, 1, 0),
    "LD": (0.01, 0.002, "island", "island", 0.01, 1, 0),
    "PY": (0.3, 0.2, "beach", "coastal_s", 0.3, 1, 0),
}

# monthly seasonal curves, Jan..Dec: (domestic, foreign)
CURVES = {
    "hill": ([0.5, 0.6, 1.0, 1.5, 1.9, 1.6, 0.9, 0.8, 1.0, 1.3, 0.9, 0.7],
             [0.6, 0.7, 1.0, 1.4, 1.5, 1.0, 0.7, 0.7, 1.1, 1.5, 1.0, 0.7]),
    "beach": ([1.5, 1.3, 0.9, 0.7, 0.8, 0.5, 0.4, 0.5, 0.7, 1.1, 1.6, 1.9],
              [1.9, 1.7, 1.0, 0.5, 0.3, 0.2, 0.2, 0.3, 0.5, 1.0, 1.6, 2.0]),
    "plain": ([1.2, 1.2, 1.0, 0.8, 0.7, 0.6, 0.6, 0.7, 0.9, 1.4, 1.3, 1.3],
              [1.5, 1.4, 1.3, 0.8, 0.5, 0.4, 0.4, 0.5, 0.7, 1.3, 1.6, 1.8]),
    "desert": ([1.4, 1.3, 1.1, 0.8, 0.5, 0.4, 0.4, 0.5, 0.8, 1.5, 1.5, 1.5],
               [1.6, 1.5, 1.3, 0.7, 0.3, 0.2, 0.2, 0.3, 0.6, 1.4, 1.7, 1.9]),
    "south": ([1.2, 1.1, 1.0, 1.0, 1.1, 0.8, 0.8, 0.8, 0.9, 1.1, 1.0, 1.3],
              [1.5, 1.4, 1.1, 0.8, 0.6, 0.5, 0.5, 0.6, 0.8, 1.2, 1.5, 1.7]),
    "ne": ([0.8, 0.9, 1.2, 1.4, 1.2, 0.7, 0.6, 0.7, 1.0, 1.5, 1.2, 0.8],
           [1.0, 1.1, 1.3, 1.3, 0.9, 0.5, 0.4, 0.5, 0.9, 1.5, 1.3, 1.0]),
    "island": ([1.5, 1.3, 1.0, 0.9, 0.8, 0.4, 0.4, 0.5, 0.6, 1.0, 1.5, 1.7],
               [1.8, 1.6, 1.1, 0.7, 0.4, 0.2, 0.2, 0.3, 0.5, 1.0, 1.6, 1.9]),
    "cold": ([0.1, 0.1, 0.2, 0.8, 1.8, 2.4, 2.5, 2.2, 1.2, 0.4, 0.1, 0.1],
             [0.1, 0.1, 0.2, 0.8, 1.7, 2.4, 2.6, 2.3, 1.2, 0.4, 0.1, 0.1]),
}
# COVID month-level suppression (multiplier on the seasonal curve)
LOCK = {
    2020: [1, 1, 0.6, 0.02, 0.02, 0.03, 0.08, 0.12, 0.2, 0.3, 0.35, 0.4],
    2021: [0.4, 0.4, 0.45, 0.2, 0.15, 0.2, 0.4, 0.6, 0.7, 0.8, 0.9, 0.9],
}
# climate: mean C, amplitude, peak month, monsoon dip
CLIMATE = {
    "hill": (13, 9, 5.7, 1.5), "north_plain": (25, 11, 5.7, 3.0), "desert": (27, 10, 5.7, 2.0),
    "coastal_w": (27.5, 2.5, 5.0, 1.5), "coastal_s": (28.2, 2.2, 4.8, 1.2),
    "east": (26, 6, 5.5, 1.5), "ne": (19, 6, 6.5, 0.0), "central": (26, 9, 5.2, 2.5),
    "island": (27.5, 1.2, 4.5, 0.8), "cold": (4, 14, 7.0, 0.0),
}
SEASON = {12: "Winter", 1: "Winter", 2: "Winter", 3: "Summer", 4: "Summer", 5: "Summer",
          6: "Monsoon", 7: "Monsoon", 8: "Monsoon", 9: "Monsoon", 10: "Post-monsoon",
          11: "Post-monsoon"}

COUNTRIES = ["United States", "Bangladesh", "United Kingdom", "Canada", "Australia", "Germany",
             "France", "Sri Lanka", "Malaysia", "Japan", "Russia", "Others"]
C_BASE = [0.17, 0.16, 0.10, 0.05, 0.04, 0.035, 0.035, 0.03, 0.03, 0.025, 0.02]
C_BASE.append(round(1 - sum(C_BASE), 4))
C_TILT = {
    "WB": {"Bangladesh": 3}, "TR": {"Bangladesh": 6}, "ML": {"Bangladesh": 4},
    "AS": {"Bangladesh": 2}, "TN": {"Sri Lanka": 3, "Malaysia": 3},
    "KL": {"United Kingdom": 1.5, "Germany": 1.8, "France": 1.5},
    "GA": {"United Kingdom": 2, "Russia": 6, "Germany": 1.5},
    "RJ": {"France": 2, "United Kingdom": 1.5, "Germany": 1.5},
    "MH": {"United States": 1.2, "United Kingdom": 1.2}, "DL": {"United States": 1.2},
    "BR": {"Japan": 6, "Sri Lanka": 3, "Malaysia": 2},
    "UP": {"Japan": 1.2, "France": 1.2},
    "PB": {"Canada": 4, "United Kingdom": 2, "Australia": 1.5},
    "HP": {"Russia": 1.5}, "LA": {"France": 3, "Japan": 2, "United States": 1.5},
    "KA": {"United States": 1.3, "Germany": 1.3}, "AN": {"Germany": 2, "France": 2},
    "PY": {"France": 8}, "UT": {"Germany": 1.2, "United States": 1.3},
}
COVID_STR = {2020: 1.0, 2021: 1.0, 2022: 0.5}
D_SPEND_COVID = {2020: 0.88, 2021: 0.92, 2022: 0.97}
F_SPEND_COVID = {2020: 0.80, 2021: 0.85, 2022: 0.95}
GSDP_GROWTH = {2016: 1.10, 2017: 1.10, 2018: 1.10, 2019: 1.07, 2020: 0.97, 2021: 1.17,
               2022: 1.15, 2023: 1.10, 2024: 1.09, 2025: 1.09}
HOTEL_G = {2015: 1.0, 2016: 1.03, 2017: 1.06, 2018: 1.09, 2019: 1.12, 2020: 1.10, 2021: 1.07,
           2022: 1.09, 2023: 1.13, 2024: 1.17, 2025: 1.21}
HOMESTAY_G = {2015: 1.0, 2016: 1.15, 2017: 1.32, 2018: 1.52, 2019: 1.75, 2020: 1.8, 2021: 1.85,
              2022: 2.07, 2023: 2.32, 2024: 2.6, 2025: 2.9}
OPERATOR_G = {2015: 1.0, 2016: 1.05, 2017: 1.10, 2018: 1.16, 2019: 1.22, 2020: 1.18, 2021: 1.15,
              2022: 1.20, 2023: 1.30, 2024: 1.36, 2025: 1.43}
STAR_COLS = ["hotels_1star", "hotels_2star", "hotels_3star", "hotels_4star", "hotels_5star",
             "hotels_heritage"]
STAR_BASE = np.array([0.10, 0.15, 0.35, 0.22, 0.12, 0.06])
ROOMS_PER = np.array([12, 20, 35, 90, 180, 40])
PREMIUM = {"MH", "DL", "GA", "KA", "KL", "RJ", "TN", "HR"}
HERITAGE = {"RJ": 6, "GJ": 3, "MP": 3, "UP": 3, "TN": 2, "KA": 2}
FOOTFALL_RANGE = {0: (8e6, 25e6), 1: (3e6, 8e6), 2: (1e6, 3e6), 3: (4e5, 1e6),
                  4: (1e5, 4e5), 5: (1e4, 1e5)}
FOOTFALL_YEAR = 2024


def apportion(total, weights):
    """Split an integer total across weights (largest remainder); sums exactly."""
    w = np.asarray(weights, dtype=float)
    raw = total * w / w.sum()
    fl = np.floor(raw).astype(np.int64)
    rem = int(total - fl.sum())
    if rem > 0:
        fl[np.argsort(-(raw - fl), kind="stable")[:rem]] += 1
    return fl


def meta(df):
    df["data_source"] = SYN_SOURCE
    df["is_synthetic"] = True
    return df


def main():
    rng = np.random.default_rng(SEED)
    states = pd.read_csv(PROC / "states.csv")
    codes = list(states.state_code)
    n, ny = len(codes), len(YEARS)
    ci = {c: i for i, c in enumerate(codes)}
    tags = dict(zip(states.state_code, states.tourism_type_tags))

    wd = np.array([P[c][0] for c in codes], float)
    wf = np.array([P[c][1] for c in codes], float)
    g0 = np.array([P[c][4] for c in codes]) * 1e5  # crore
    ap0 = np.array([P[c][5] for c in codes])
    in0 = np.array([P[c][6] for c in codes])

    # --- static and per-year random draws (fixed order => reproducible) ---
    trend_d = rng.normal(0, 0.02, n)
    trend_f = rng.normal(0, 0.03, n)
    sev_d = np.exp(rng.normal(0, 0.15, n))
    sev_f = np.exp(rng.normal(0, 0.30, n))
    tag_n = np.array([len(tags[c].split(";")) for c in codes])
    dsp0 = 1300 * np.exp(rng.normal(0, 0.25, n)) * (1 + 0.06 * tag_n)
    fsp0 = 85000 * np.exp(rng.normal(0, 0.20, n))
    jpc = 55 * np.exp(rng.normal(0, 0.25, n))
    occ0 = rng.uniform(52, 68, n)
    nz_d = rng.normal(0, 0.05, (n, ny))
    nz_f = rng.normal(0, 0.07, (n, ny))
    nz_g = rng.normal(0, 0.01, (n, ny))
    nz_h = rng.normal(0, 0.015, (n, ny))
    nz_o = rng.normal(0, 1.5, (n, ny))

    yi_of = {y: i for i, y in enumerate(YEARS)}
    rawd = np.zeros((n, ny))
    rawf = np.zeros((n, ny))
    gsdp = np.zeros((n, ny))
    for y in YEARS:
        i = yi_of[y]
        cs = COVID_STR.get(y, 0.0)
        rawd[:, i] = wd * np.exp(trend_d * (y - 2019) + nz_d[:, i]) * sev_d ** cs
        rawf[:, i] = wf * np.exp(trend_f * (y - 2019) + nz_f[:, i]) * sev_f ** cs
        prev = g0 if i == 0 else gsdp[:, i - 1]
        gsdp[:, i] = prev * GSDP_GROWTH.get(y, 1.0) * np.exp(nz_g[:, i])

    def coll(arr, c, y):
        """Value for entity c in year y; pre-2019 JK = undivided J&K (JK + LA)."""
        i = yi_of[y]
        v = arr[ci[c], i]
        if c == "JK" and y < 2019:
            v = v + arr[ci["LA"], i]
        return v

    def ents(y):
        return [c for c in codes if not (c == "LA" and y < 2019)]

    # --- national + annual ---
    ann = {}
    nat_rows = []
    for y in YEARS:
        es = ents(y)
        dom = apportion(int(round(NAT_DOM[y] * 1e6)), [coll(rawd, c, y) for c in es])
        frn = apportion(int(round(NAT_FOR[y] * 1e6)), [coll(rawf, c, y) for c in es])
        for k, c in enumerate(es):
            ann[(c, y)] = {"dom": int(dom[k]), "frn": int(frn[k])}
    rows = []
    for y in YEARS:
        es = ents(y)
        tot_dom = sum(ann[(c, y)]["dom"] for c in es)
        tot_frn = sum(ann[(c, y)]["frn"] for c in es)
        tot_vis = tot_dom + tot_frn
        rev_sum = forex_sum = 0.0
        for c in es:
            a = ann[(c, y)]
            i = ci[c]
            ds = dsp0[i] * 1.05 ** (y - 2015) * D_SPEND_COVID.get(y, 1.0)
            fs = fsp0[i] * 1.06 ** (y - 2015) * F_SPEND_COVID.get(y, 1.0)
            rev = (a["dom"] * ds + a["frn"] * fs) / 1e7
            forex = a["frn"] * fs / 1e7
            vis = a["dom"] + a["frn"]
            g = coll(gsdp, c, y)
            emp = jpc[i] * rev ** 0.9
            basis = ("undivided J&K incl. Ladakh (pre-2019)" if c == "JK" and y < 2019
                     else "current boundaries")
            a.update(rev=rev, forex=forex)
            rev_sum += rev
            forex_sum += forex
            rows.append({
                "state_code": c, "year": y, "domestic_visits": a["dom"],
                "foreign_visits": a["frn"], "share_of_india_total": round(vis / tot_vis * 100, 4),
                "tourism_revenue_cr": round(rev, 2), "forex_earnings_cr": round(forex, 2),
                "gsdp_cr": round(g, 2), "tourism_share_of_gsdp": round(rev / g * 100, 4),
                "avg_spend_per_tourist": round(rev * 1e7 / vis, 2) if vis else np.nan,
                "tourism_employment": int(round(emp)), "boundary_basis": basis,
            })
        nat_rows.append({"year": y, "domestic_visits_total": tot_dom,
                         "foreign_visits_total": tot_frn,
                         "tourism_revenue_cr_total": round(rev_sum, 2),
                         "forex_earnings_cr_total": round(forex_sum, 2)})
    annual = pd.DataFrame(rows).sort_values(["state_code", "year"]).reset_index(drop=True)
    for col, new in (("domestic_visits", "yoy_growth_domestic"),
                     ("foreign_visits", "yoy_growth_foreign")):
        prev = annual.groupby("state_code")[col].shift(1)
        same_basis = annual.groupby("state_code")["boundary_basis"].shift(1) == annual["boundary_basis"]
        yoy = (annual[col] / prev.replace(0, np.nan) - 1) * 100
        annual[new] = yoy.where(same_basis).round(2)
    cols = ["state_code", "year", "domestic_visits", "foreign_visits", "yoy_growth_domestic",
            "yoy_growth_foreign", "share_of_india_total", "tourism_revenue_cr",
            "forex_earnings_cr", "gsdp_cr", "tourism_share_of_gsdp", "avg_spend_per_tourist",
            "tourism_employment", "boundary_basis"]
    annual = meta(annual[cols].copy())
    annual.to_csv(PROC / "tourism_annual.csv", index=False)
    meta(pd.DataFrame(nat_rows)).to_csv(PROC / "national_annual.csv", index=False)

    # --- monthly ---
    mrows = []
    for y in YEARS:
        for c in ents(y):
            prof = P[c][2]
            cd, cf = (np.array(v, float) for v in CURVES[prof])
            lock = np.array(LOCK.get(y, [1] * 12), float)
            wdm = cd * lock * np.exp(rng.normal(0, 0.10, 12))
            wfm = cf * lock * np.exp(rng.normal(0, 0.10, 12))
            dm = apportion(ann[(c, y)]["dom"], wdm)
            fm = apportion(ann[(c, y)]["frn"], wfm)
            mean, amp, peak, dip = CLIMATE[P[c][3]]
            for m in range(1, 13):
                t = (mean + amp * np.cos(2 * np.pi * (m - peak) / 12) - (dip if 6 <= m <= 9 else 0)
                     + 0.03 * (y - 2015) + rng.normal(0, 0.7))
                mrows.append({"state_code": c, "year": y, "month": m,
                              "domestic_visits": int(dm[m - 1]), "foreign_visits": int(fm[m - 1]),
                              "avg_temp_c": round(float(t), 1), "season": SEASON[m]})
    meta(pd.DataFrame(mrows)).to_csv(PROC / "tourism_monthly.csv", index=False)

    # --- foreign visits by source country ---
    crows = []
    base = np.array(C_BASE)
    for y in YEARS:
        for c in ents(y):
            tilt = np.array([C_TILT.get(c, {}).get(k, 1.0) for k in COUNTRIES])
            adj = np.ones(len(COUNTRIES))
            if y in (2020, 2021, 2022):
                bd = {2020: 1.4, 2021: 1.6, 2022: 1.3}[y]
                adj[COUNTRIES.index("Bangladesh")] = bd
                adj[COUNTRIES.index("Sri Lanka")] = 1.3
                if y == 2021:
                    adj[COUNTRIES.index("United States")] = 1.1
            w = base * tilt * adj * np.exp(rng.normal(0, 0.15, len(COUNTRIES)))
            v = apportion(ann[(c, y)]["frn"], w)
            for k, name in enumerate(COUNTRIES):
                crows.append({"state_code": c, "year": y, "country": name,
                              "foreign_visits": int(v[k])})
    meta(pd.DataFrame(crows)).to_csv(PROC / "ftv_source_countries.csv", index=False)

    # --- infrastructure ---
    wdn, wfn = wd / wd.sum(), wf / wf.sum()
    tot19 = {c: ann[(c, 2019)]["dom"] + ann[(c, 2019)]["frn"] for c in codes}
    irows = []
    for y in YEARS:
        i = yi_of[y]
        for c in ents(y):
            comb = [c] + (["LA"] if c == "JK" and y < 2019 else [])
            ix = [ci[k] for k in comb]
            score = 0.6 * np.sqrt(wdn[ix].sum()) + 0.4 * np.sqrt(wfn[ix].sum())
            k0 = ci[c]
            htot = int(round((150 + 4000 * score) * HOTEL_G[y] * np.exp(nz_h[k0, i])))
            w = STAR_BASE.copy()
            if c in PREMIUM:
                w *= np.array([0.7, 1, 1, 1.3, 1.8, 1])
            w[5] *= HERITAGE.get(c, 1)
            w[3:5] *= 1 + 0.01 * (y - 2015)
            w *= np.exp(rng.normal(0, 0.08, 6))
            stars = apportion(htot, w)
            rooms = int(round(float((stars * ROOMS_PER).sum()) * np.exp(rng.normal(0, 0.03))))
            vis = ann[(c, y)]["dom"] + ann[(c, y)]["frn"]
            ref = sum(tot19[k] for k in comb)
            idx = min(vis / ref, 1.25) if ref else 1.0
            occ = float(np.clip(occ0[k0] * idx ** 0.55 + nz_o[k0, i], 5, 92))
            a_rate = 0.25 if sum(ap0[j] for j in ix) >= 4 else 0.12
            air = int(sum(ap0[j] for j in ix) + np.floor(a_rate * (y - 2015)))
            intl = int(min(sum(in0[j] for j in ix), air))
            boost = 1.8 if P[c][2] in ("hill", "beach", "ne") else 1.0
            hs = int(round((10 + 1500 * score) * boost * HOMESTAY_G[y]))
            ops = int(round((15 + 2500 * score) * OPERATOR_G[y]))
            irows.append({"state_code": c, "year": y, "hotels_total": htot,
                          **{col: int(v) for col, v in zip(STAR_COLS, stars)},
                          "hotel_rooms": rooms, "occupancy_rate": round(occ, 1),
                          "airports": air, "international_airports": intl,
                          "registered_homestays": hs, "registered_tour_operators": ops})
    meta(pd.DataFrame(irows)).to_csv(PROC / "infrastructure.csv", index=False)

    # --- attractions ---
    att = pd.read_csv(INTERIM / "attractions_base.csv")
    lo = att.tier.map(lambda t: FOOTFALL_RANGE[t][0]).to_numpy()
    hi = att.tier.map(lambda t: FOOTFALL_RANGE[t][1]).to_numpy()
    att["annual_footfall"] = np.exp(rng.uniform(np.log(lo), np.log(hi))).round().astype("int64")
    att["footfall_year"] = FOOTFALL_YEAR
    att = att.drop(columns="tier")
    meta(att).to_csv(PROC / "attractions.csv", index=False)
    print(f"[synthesize] annual={len(annual)} monthly={len(mrows)} ftv={len(crows)} "
          f"infra={len(irows)} attractions={len(att)}")


if __name__ == "__main__":
    main()
