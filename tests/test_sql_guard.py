import pytest

from app.services import sql_guard as g

GOOD = [
    "SELECT s.state_name, SUM(t.foreign_visits) AS v FROM tourism_annual t JOIN states s ON s.state_code=t.state_code "
    "WHERE t.year=2023 GROUP BY s.state_name ORDER BY v DESC LIMIT 5",
    "WITH x AS (SELECT state_code, year, domestic_visits+foreign_visits AS tot FROM tourism_annual) "
    "SELECT state_code, tot FROM x WHERE year=2024 ORDER BY tot DESC",
    "SELECT COUNT(*) FROM festivals_events",
    "SELECT state_code FROM states UNION SELECT state_code FROM attractions",
    "SELECT state_code, ROUND(AVG(occupancy_rate), 1) AS occ FROM infrastructure GROUP BY state_code",
]
BAD = [
    "DROP TABLE states", "DELETE FROM states", "INSERT INTO states(state_code) VALUES ('X')", "UPDATE states SET region='x'",
    "CREATE TABLE x(a)", "ALTER TABLE states ADD COLUMN a", "VACUUM", "PRAGMA table_info(states)", "ATTACH 'x.db' AS x",
    "SELECT 1; DROP TABLE states", "SELECT * FROM states; SELECT * FROM states", "SELECT * FROM sqlite_master",
    "SELECT * FROM main.states", "SELECT secret FROM states", "SELECT * FROM unknown_table",
    "SELECT load_extension('x')", "SELECT randomblob(1000000000) FROM states", "SELECT readfile('/etc/passwd')",
    "WITH d AS (DELETE FROM states RETURNING *) SELECT * FROM d", "EXPLAIN SELECT * FROM states", "", "   ",
    "SELECT 1 -- ; DROP TABLE states", "SELECT * FROM states WHERE state_code = (SELECT sql FROM sqlite_master)",
    "REPLACE INTO states VALUES (1)", "SELECT 'x' || state_code FROM states, pragma_table_info('states')",
]


@pytest.mark.parametrize("sql", GOOD)
def test_valid_selects_pass(sql):
    c = g.validate_select(sql)
    assert c.tables and c.sql.upper().startswith(("SELECT", "WITH"))
    cols, rows, _ = g.run(c)
    assert cols and rows


@pytest.mark.parametrize("sql", BAD)
def test_non_select_and_non_whitelisted_rejected(sql):
    with pytest.raises(g.SqlRejected):
        g.validate_select(sql)


def test_limit_enforced_and_truncated():
    c = g.validate_select("SELECT * FROM tourism_monthly")
    assert "LIMIT 501" in c.sql
    cols, rows, trunc = g.run(c)
    assert len(rows) == 500 and trunc is True
    cols, rows, trunc = g.run(g.validate_select("SELECT * FROM states LIMIT 10"))
    assert len(rows) == 10 and trunc is False


def test_executed_sql_is_regenerated_not_raw():
    raw = "select   STATE_CODE   from states   where 1=1   "
    c = g.validate_select(raw)
    assert c.sql != raw and "LIMIT" in c.sql


def test_timeout_aborts_runaway_query():
    c = g.validate_select("WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT COUNT(*) FROM c, states")
    with pytest.raises(g.QueryTimeout):
        g.run(c, timeout=0.3)


@pytest.mark.parametrize("sql", ["DELETE FROM states", "SELECT * FROM sqlite_master", "SELECT load_extension('x')",
                                 "SELECT randomblob(8)", "INSERT INTO states(state_code) VALUES ('Z')", "PRAGMA writable_schema=1"])
def test_authorizer_and_readonly_block_even_if_validation_is_bypassed(sql):
    with pytest.raises(g.SqlRejected):
        g.run(g.Checked(sql=sql, tables=["states"]))
    from app.db import connect_ro
    assert connect_ro().execute("SELECT COUNT(*) FROM states").fetchone()[0] == 36


def test_suggest_chart():
    rows = [{"state_code": "A", "v": 1}, {"state_code": "B", "v": 2}, {"state_code": "C", "v": 3}]
    assert g.suggest_chart("map", ["state_code", "v"], rows) == "map"
    assert g.suggest_chart("line", ["state_code", "v"], rows) == "map"  # no time column -> falls back to a compatible type
    ts = [{"year": 2020, "v": 1}, {"year": 2021, "v": 2}, {"year": 2022, "v": 3}]
    assert g.suggest_chart("bar", ["year", "v"], ts) == "line"
    assert g.suggest_chart("map", ["a"], [{"a": "x"}]) == "table" and g.suggest_chart("bar", [], []) == "table"
