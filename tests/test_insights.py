import json

from app.services import insights


def get(client, url):
    r = client.get(url)
    assert r.status_code == 200, r.text
    return r.json()


def test_template_cards_without_api_key(client, fresh_caches, monkeypatch):
    from app.services import ai
    monkeypatch.setattr(ai, "available", lambda: False)
    r = get(client, "/api/insights?year=2024")
    d = r["data"]
    assert d["phrasing"] == "template" and d["cards"]
    assert all(c["text_source"] == "template" and c["is_synthetic"] and c["synthetic_based"] for c in d["cards"])
    assert any("ANTHROPIC_API_KEY" in n for n in r["meta"]["notes"])
    kinds = {c["id"] for c in d["cards"]}
    assert {"national_growth", "top_state", "largest_growth"} <= kinds
    assert r["meta"]["synthetic_share"] == 100


def test_facts_match_dataset(client, fresh_caches, annual):
    facts = {f["id"]: f for f in insights.build_facts(2024, None, True)}
    y, p = annual[annual.year == 2024], annual[annual.year == 2023]
    nat, prev = (y.domestic_visits + y.foreign_visits).sum(), (p.domestic_visits + p.foreign_visits).sum()
    assert abs(facts["national_growth"]["values"]["growth_pct"] - (nat - prev) / prev * 100) < 0.01
    top = y.assign(t=y.domestic_visits + y.foreign_visits).sort_values("t", ascending=False).iloc[0]
    assert facts["top_state"]["state_codes"] == [top.state_code] and facts["top_state"]["values"]["visits"] == top.t
    g = annual.sort_values(["state_code", "year"])
    g = g.assign(t=g.domestic_visits + g.foreign_visits)
    g["gr"] = g.groupby("state_code").t.pct_change() * 100
    best = g[(g.year == 2024) & (g.boundary_basis == "current boundaries")].sort_values("gr", ascending=False).iloc[0]
    assert facts["largest_growth"]["state_codes"] == [best.state_code]


def test_state_insights(client, fresh_caches, monkeypatch):
    from app.services import ai
    monkeypatch.setattr(ai, "available", lambda: False)
    d = get(client, "/api/insights?state=GA&year=2024")["data"]
    ids = {c["id"] for c in d["cards"]}
    assert {"state_rank", "state_growth", "state_share", "state_peak"} <= ids
    assert all(c["state_codes"] in ([], ["GA"]) for c in d["cards"])
    assert client.get("/api/insights?state=XX").status_code == 422
    assert get(client, "/api/insights?include_synthetic=false")["data"]["cards"] == []


def _good(system, user):
    facts = json.loads(user.split("Facts (JSON):\n", 1)[1])
    return {"insights": [{"id": f["id"], "text": "Figures: " + ", ".join(f["display"].values()) + "."} for f in facts]}


def test_claude_phrasing_used_when_numbers_match(client, fake_ai):
    fake_ai.handler = _good
    d = get(client, "/api/insights?year=2024")["data"]
    assert d["phrasing"] == "claude" and all(c["text_source"] == "claude" for c in d["cards"])
    system, user = fake_ai.calls[0]
    assert "ONLY the figures" in system and "Facts (JSON)" in user
    assert "domestic_visits" not in user and "tourism_revenue" not in user  # only computed facts, no raw rows


def test_invented_numbers_are_rejected(client, fake_ai):
    def handler(system, user):
        out = _good(system, user)
        out["insights"][0]["text"] = "India saw 999 Cr visits, a rise of 77.7%."
        out["insights"][1]["text"] = "Something with no numbers at all."  # allowed: no new numbers
        return out
    fake_ai.handler = handler
    r = get(client, "/api/insights?year=2024")
    cards = {c["id"]: c for c in r["data"]["cards"]}
    first = r["data"]["cards"][0]
    assert first["text_source"] == "template" and "999" not in first["text"]
    assert r["data"]["cards"][1]["text_source"] == "claude"
    assert any("rejected" in n for n in r["meta"]["notes"]) and cards


def test_ai_failure_degrades_to_templates(client, fake_ai):
    from app.services import ai

    def boom(system, user):
        raise ai.AiError("could not reach the Claude API")
    fake_ai.handler = boom
    r = get(client, "/api/insights?year=2024")
    assert r["data"]["cards"] and all(c["text_source"] == "template" for c in r["data"]["cards"])
    assert any("AI phrasing failed" in n for n in r["meta"]["notes"])
