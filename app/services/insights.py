"""Insight cards. Facts are computed in Python from the dataset; Claude (if available) only rephrases them,
and its output is rejected for any card containing a number that is not in that card's facts."""
import calendar
import logging
import re

import pandas as pd

from app.config import settings
from app.services import ai, data
from app.services.cache import ttl_cached
from app.services.formatting import fmt_count, fmt_crore, fmt_pct, fmt_rupees
from app.services.mapping import build_map

log = logging.getLogger("app.insights")
NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")

SCHEMA = {"type": "object", "properties": {"insights": {"type": "array", "items": {
    "type": "object", "properties": {"id": {"type": "string"}, "text": {"type": "string"}},
    "required": ["id", "text"], "additionalProperties": False}}},
    "required": ["insights"], "additionalProperties": False}

SYSTEM = (
    "You phrase pre-computed tourism facts as short dashboard insight sentences. "
    "For each fact write exactly one sentence of at most 28 words. "
    "Use ONLY the figures in that fact's `display` values, copied verbatim (including units such as Cr, L, %, #). "
    "Never introduce any other number, percentage, rank, year or date, never compute or estimate anything, "
    "and make no causal claims or predictions. Mention a state by name when the fact has one. "
    "Do not use ordinal digits like 1st or 2nd. Return the same ids you were given."
)


def _nums(s: str) -> set[str]:
    return {m.rstrip(".").replace(",", "") for m in NUM.findall(s)}


def _fact(id_, kind, title, template, display, values, codes, syn, **extra):
    return {"id": id_, "kind": kind, "title": title, "template": template, "display": display, "values": values,
            "state_codes": codes, "is_synthetic": bool(syn), **extra}


def _rows(metric, year, include_synthetic):
    return {r["state_code"]: r for r in build_map(metric, year, "all", include_synthetic)}


def build_facts(year: int, state: str | None, include_synthetic: bool) -> list[dict]:
    fr = data.frames()
    a = fr.annual
    if not include_synthetic:
        a = a[~a.is_synthetic]
    cur, prv = a[a.year == year], a[a.year == year - 1]
    if cur.empty:
        return []
    tot = _rows("total_visits", year, include_synthetic)
    prev_tot = _rows("total_visits", year - 1, include_synthetic) if year - 1 in data.years() else {}
    facts: list[dict] = []
    nat, nat_syn = float(cur.total_visits.sum()), bool(cur.is_synthetic.any())
    nat_prev = float(prv.total_visits.sum()) if not prv.empty else None
    ngrowth = (nat - nat_prev) / nat_prev * 100 if nat_prev else None
    if ngrowth is not None:
        facts.append(_fact(
            "national_growth", "national", "National growth",
            f"India recorded {fmt_count(nat)} visits in {year}, {fmt_pct(ngrowth, True)} on the previous year.",
            {"year": str(year), "visits": fmt_count(nat), "growth": fmt_pct(ngrowth, True)},
            {"visits": nat, "growth_pct": round(ngrowth, 2)}, [], nat_syn or bool(prv.is_synthetic.any())))

    def st(code):
        return data.state_name(code)

    if state:
        r = tot.get(state)
        if r is None or r["value"] is None:
            return facts
        pr = prev_tot.get(state)
        d = {"year": str(year), "visits": r["display"], "rank": f"#{r['rank']}"}
        v = {"visits": r["value"], "rank": r["rank"]}
        syn = r["is_synthetic"]
        move = ""
        if pr and pr["rank"] and r["rank"]:
            d["previous_rank"] = f"#{pr['rank']}"
            v["previous_rank"] = pr["rank"]
            move = f", from {d['previous_rank']} the year before" if pr["rank"] != r["rank"] else ", unchanged from the year before"
            syn = syn or pr["is_synthetic"]
        facts.append(_fact("state_rank", "state_rank", "Rank", f"{st(state)} ranked {d['rank']} for total visits in {year}{move}.",
                           d, v, [state], syn))
        if r["yoy_change"] is not None and ngrowth is not None:
            diff = r["yoy_change"] - ngrowth
            comp = "faster" if diff > 0 else "slower" if diff < 0 else "in line with"
            d = {"year": str(year), "growth": r["yoy_display"], "national_growth": fmt_pct(ngrowth, True), "gap": f"{abs(diff):.1f} pp"}
            facts.append(_fact("state_growth", "state_growth", "Growth vs India",
                               f"{st(state)} grew {d['growth']} in {year}, "
                               + ("in line with India's " + d["national_growth"] + "." if comp == "in line with"
                                  else f"{comp} than India's {d['national_growth']} (a gap of {d['gap']})."),
                               d, {"growth_pct": r["yoy_change"], "national_growth_pct": round(ngrowth, 2), "gap_pp": round(abs(diff), 2)},
                               [state], r["is_synthetic"] or nat_syn))
        row = cur[cur.state_code == state]
        if not row.empty:
            x = row.iloc[0]
            share = x.total_visits / nat * 100
            facts.append(_fact("state_share", "state_share", "Share of India",
                               f"{st(state)} accounted for {share:.1f}% of India's visits in {year}.",
                               {"year": str(year), "share": f"{share:.1f}%"}, {"share_pct": round(share, 2)}, [state],
                               bool(x.is_synthetic or nat_syn)))
            fshare = x.foreign_visits / x.total_visits * 100
            facts.append(_fact("state_foreign", "state_foreign", "Foreign share",
                               f"Foreign visitors made up {fshare:.1f}% of {st(state)}'s visits in {year}.",
                               {"year": str(year), "foreign_share": f"{fshare:.1f}%"}, {"foreign_share_pct": round(fshare, 2)},
                               [state], bool(x.is_synthetic)))
            rr = a[(a.year == year)].assign(rpt=lambda d_: d_.revenue_per_tourist).sort_values("rpt", ascending=False).reset_index(drop=True)
            pos = int(rr.index[rr.state_code == state][0]) + 1
            facts.append(_fact("state_spend", "state_spend", "Revenue per tourist",
                               f"{st(state)} earned {fmt_rupees(x.revenue_per_tourist)} per tourist in {year}, rank #{pos} of {len(rr)} states.",
                               {"year": str(year), "revenue_per_tourist": fmt_rupees(x.revenue_per_tourist), "rank": f"#{pos}", "of": str(len(rr))},
                               {"revenue_per_tourist": float(x.revenue_per_tourist), "rank": pos}, [state], bool(x.is_synthetic)))
        m = fr.tourism_monthly
        m = m[(m.state_code == state) & (m.year == year)]
        m = m if include_synthetic else m[~m.is_synthetic]
        if not m.empty:
            tv = (m.domestic_visits + m.foreign_visits).reset_index(drop=True)
            pk = calendar.month_name[int(m.month.iloc[int(tv.idxmax())])]
            facts.append(_fact("state_peak", "state_peak", "Peak month", f"{st(state)}'s busiest month in {year} was {pk}.",
                               {"year": str(year), "peak_month": pk}, {"peak_month": pk}, [state], bool(m.is_synthetic.any())))
        return facts

    # national view -----------------------------------------------------------
    ranked = [r for r in tot.values() if r["value"] is not None]
    if ranked:
        t = min(ranked, key=lambda r: r["rank"])
        share = t["value"] / nat * 100
        facts.append(_fact("top_state", "top_state", "Most visited",
                           f"{t['state_name']} was the most visited state in {year} with {t['display']} visits, {share:.1f}% of India's total.",
                           {"year": str(year), "visits": t["display"], "share": f"{share:.1f}%"},
                           {"visits": t["value"], "share_pct": round(share, 2)}, [t["state_code"]], t["is_synthetic"] or nat_syn))
    g = [r for r in ranked if r["yoy_change"] is not None]
    if g:
        best = max(g, key=lambda r: r["yoy_change"])
        facts.append(_fact("largest_growth", "largest_growth", "Fastest growth",
                           f"{best['state_name']} grew fastest in {year}, up {best['yoy_display'].lstrip('+')} to {best['display']} visits.",
                           {"year": str(year), "growth": best["yoy_display"], "visits": best["display"]},
                           {"growth_pct": best["yoy_change"], "visits": best["value"]}, [best["state_code"]], best["is_synthetic"]))
        worst = min(g, key=lambda r: r["yoy_change"])
        if worst["yoy_change"] < 0:
            facts.append(_fact("biggest_drop", "biggest_drop", "Biggest drop",
                               f"{worst['state_name']} saw the sharpest fall in {year}, at {worst['yoy_display']} to {worst['display']} visits.",
                               {"year": str(year), "change": worst["yoy_display"], "visits": worst["display"]},
                               {"change_pct": worst["yoy_change"], "visits": worst["value"]}, [worst["state_code"]], worst["is_synthetic"]))
        else:
            facts.append(_fact("slowest_growth", "slowest_growth", "Slowest growth",
                               f"{worst['state_name']} grew most slowly in {year}, at {worst['yoy_display']}.",
                               {"year": str(year), "growth": worst["yoy_display"]}, {"growth_pct": worst["yoy_change"]},
                               [worst["state_code"]], worst["is_synthetic"]))
    moves = [(r, prev_tot[c]) for c, r in tot.items() if c in prev_tot and r["rank"] and prev_tot[c]["rank"]]
    if moves:
        up = max(moves, key=lambda m_: m_[1]["rank"] - m_[0]["rank"])
        if up[1]["rank"] - up[0]["rank"] > 0:
            r, p = up
            facts.append(_fact("rank_climber", "rank_change", "Biggest climber",
                               f"{r['state_name']} climbed from #{p['rank']} to #{r['rank']} in total visits in {year}.",
                               {"year": str(year), "from_rank": f"#{p['rank']}", "to_rank": f"#{r['rank']}"},
                               {"from_rank": p["rank"], "to_rank": r["rank"]}, [r["state_code"]], r["is_synthetic"] or p["is_synthetic"]))
        dn = max(moves, key=lambda m_: m_[0]["rank"] - m_[1]["rank"])
        if dn[0]["rank"] - dn[1]["rank"] > 0:
            r, p = dn
            facts.append(_fact("rank_faller", "rank_change", "Biggest faller",
                               f"{r['state_name']} slipped from #{p['rank']} to #{r['rank']} in total visits in {year}.",
                               {"year": str(year), "from_rank": f"#{p['rank']}", "to_rank": f"#{r['rank']}"},
                               {"from_rank": p["rank"], "to_rank": r["rank"]}, [r["state_code"]], r["is_synthetic"] or p["is_synthetic"]))
    fv = [r for r in _rows("foreign_visits", year, include_synthetic).values() if r["value"] is not None]
    if fv:
        t = min(fv, key=lambda r: r["rank"])
        facts.append(_fact("foreign_leader", "foreign_leader", "Foreign visitors",
                           f"{t['state_name']} drew the most foreign visitors in {year}, at {t['display']}.",
                           {"year": str(year), "foreign_visits": t["display"]}, {"foreign_visits": t["value"]},
                           [t["state_code"]], t["is_synthetic"]))
    base = a[a.year == settings.covid_baseline_year]
    if year > settings.covid_years[1] and not base.empty:
        rec = nat / float(base.total_visits.sum()) * 100
        facts.append(_fact("covid_recovery", "recovery", "Recovery vs 2019",
                           f"National visits in {year} stood at {rec:.1f}% of the {settings.covid_baseline_year} level.",
                           {"year": str(year), "baseline_year": str(settings.covid_baseline_year), "recovery": f"{rec:.1f}%"},
                           {"recovery_pct": round(rec, 2)}, [], nat_syn or bool(base.is_synthetic.any())))
    return facts


def _phrase_with_claude(facts: list[dict]) -> dict[str, str]:
    payload = [{"id": f["id"], "kind": f["kind"], "display": f["display"]} for f in facts]
    names = {f["id"]: [data.state_name(c) for c in f["state_codes"]] for f in facts}
    for p in payload:
        p["states"] = names[p["id"]]
    import json
    out = ai.complete_json(SYSTEM, "Facts (JSON):\n" + json.dumps(payload, ensure_ascii=False), SCHEMA, max_tokens=1500)
    allowed = {f["id"]: set().union(*(_nums(str(v)) for v in f["display"].values())) for f in facts}
    texts = {}
    for item in out.get("insights", []):
        fid, text = item.get("id"), (item.get("text") or "").strip()
        if fid not in allowed or not text:
            continue
        extra = _nums(text) - allowed[fid]
        if extra:
            log.warning("insight rejected: numbers not in facts", extra={"fields": {"id": fid, "extra": sorted(extra)}})
            continue
        texts[fid] = text
    return texts


@ttl_cached(maxsize=128)
def insights(year: int, state: str | None, include_synthetic: bool, ai_on: bool) -> tuple[list[dict], dict]:
    facts = build_facts(year, state, include_synthetic)
    info = {"phrasing": "template", "ai_note": None, "rejected": 0}
    texts: dict[str, str] = {}
    if facts and ai_on:
        try:
            texts = _phrase_with_claude(facts)
            info["phrasing"] = "claude" if texts else "template"
            info["rejected"] = len(facts) - len(texts)
        except ai.AiUnavailable as e:
            info["ai_note"] = f"AI phrasing unavailable ({e}); showing template sentences."
        except ai.AiError as e:
            info["ai_note"] = f"AI phrasing failed ({e}); showing template sentences."
    elif facts:
        info["ai_note"] = "ANTHROPIC_API_KEY is not set; showing template sentences computed from the dataset."
    cards = []
    for f in facts:
        claude = f["id"] in texts
        cards.append({"id": f["id"], "kind": f["kind"], "title": f["title"], "text": texts.get(f["id"], f["template"]),
                      "text_source": "claude" if claude else "template", "state_codes": f["state_codes"],
                      "figures": f["display"], "values": f["values"], "is_synthetic": f["is_synthetic"],
                      "synthetic_based": f["is_synthetic"]})
    return cards, info
