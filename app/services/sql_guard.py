"""Validation and sandboxed execution of model-generated SQL.

Defence in depth:
 1. Parse with sqlglot: exactly one statement, root must be SELECT (or a set operation of SELECTs, optionally with CTEs).
 2. No DML/DDL/PRAGMA/ATTACH nodes anywhere; only whitelisted tables, columns and functions.
 3. The SQL that is executed is regenerated from the parsed tree, never the raw text; a LIMIT is enforced.
 4. Executed on a read-only connection (mode=ro, query_only) with a SQLite authorizer (SELECT/READ/whitelisted FUNCTION only)
    and a progress handler that aborts the query after a timeout.
"""
import sqlite3
import time
from dataclasses import dataclass
from functools import lru_cache

import sqlglot
from sqlglot import exp
from sqlglot.errors import SqlglotError

from app.config import settings
from app.db import TABLES, connect_ro

SAFE_FUNCS = {
    "count", "sum", "avg", "min", "max", "total", "group_concat", "round", "abs", "coalesce", "ifnull", "nullif", "iif",
    "length", "lower", "upper", "trim", "ltrim", "rtrim", "substr", "substring", "instr", "replace", "printf", "format",
    "strftime", "date", "time", "datetime", "julianday", "typeof", "sign", "like", "glob", "row_number", "rank",
    "dense_rank", "lag", "lead", "first_value", "last_value", "ntile", "percent_rank", "cume_dist", "nth_value",
    "cast", "if", "case", "concat", "quote",
}
FORBIDDEN = tuple(c for c in (getattr(exp, n, None) for n in (
    "Insert", "Update", "Delete", "Create", "Drop", "Alter", "Command", "Pragma", "Attach", "Detach", "Merge", "Set",
    "Transaction", "Commit", "Rollback", "Use", "Into", "TruncateTable", "AlterColumn", "LoadData", "Analyze", "Vacuum")) if c)
SET_OPS = tuple(c for c in (getattr(exp, n, None) for n in ("Union", "Intersect", "Except")) if c)


class SqlRejected(Exception):
    pass


class QueryTimeout(Exception):
    pass


@dataclass
class Checked:
    sql: str
    tables: list[str]
    ctes: tuple[str, ...] = ()


@lru_cache(maxsize=1)
def schema() -> dict[str, list[tuple[str, str]]]:
    conn = connect_ro()
    try:
        return {t: [(r["name"], r["type"]) for r in conn.execute(f'PRAGMA table_info("{t}")')] for t in TABLES}
    finally:
        conn.close()


def validate_select(sql: str) -> Checked:
    if not sql or not sql.strip():
        raise SqlRejected("empty query")
    if len(sql) > 4000:
        raise SqlRejected("query too long")
    try:
        stmts = [s for s in sqlglot.parse(sql, read="sqlite") if s is not None]
    except SqlglotError as e:
        raise SqlRejected(f"could not parse SQL: {str(e)[:120]}") from e
    if len(stmts) != 1:
        raise SqlRejected("exactly one statement is allowed")
    root = stmts[0]
    if not isinstance(root, (exp.Select, *SET_OPS)):
        raise SqlRejected("only SELECT statements are allowed")
    for node in root.walk():
        n = node[0] if isinstance(node, tuple) else node
        if isinstance(n, FORBIDDEN):
            raise SqlRejected(f"{type(n).__name__} is not allowed")
    allowed_tables = {t.lower() for t in TABLES}
    cols = {c.lower() for t in schema().values() for c, _ in t}
    ctes = {c.alias_or_name.lower() for c in root.find_all(exp.CTE)}
    if any(c.startswith("sqlite_") for c in ctes):
        raise SqlRejected("CTE names starting with sqlite_ are not allowed")
    aliases = {a.alias.lower() for a in root.find_all(exp.Alias) if a.alias}
    aliases |= {t.alias.lower() for t in root.find_all(exp.TableAlias) if t.alias}
    for ta in root.find_all(exp.TableAlias):
        aliases |= {c.name.lower() for c in (ta.args.get("columns") or [])}
    used = []
    for t in root.find_all(exp.Table):
        name = t.name.lower()
        if name in ctes:
            continue
        if t.args.get("db") or t.args.get("catalog"):
            raise SqlRejected("schema-qualified tables are not allowed")
        if name not in allowed_tables:
            raise SqlRejected(f"table '{t.name}' is not in the dataset")
        used.append(name)
    for c in root.find_all(exp.Column):
        if isinstance(c.this, exp.Star):
            continue
        nm = c.name.lower()
        if nm not in cols and nm not in aliases:
            raise SqlRejected(f"column '{c.name}' is not in the dataset")
    for f in root.find_all(exp.Anonymous):
        if str(f.name).lower() not in SAFE_FUNCS:
            raise SqlRejected(f"function '{f.name}' is not allowed")
    if not used:
        raise SqlRejected("query must read at least one dataset table")
    lim = root.args.get("limit")
    if lim is None:
        root = root.limit(settings.query_row_limit + 1)
    return Checked(sql=root.sql(dialect="sqlite"), tables=sorted(set(used)), ctes=tuple(sorted(ctes)))


def _authorizer(tables: set[str]):
    def cb(action, arg1, arg2, dbname, source):
        if action in (sqlite3.SQLITE_SELECT, sqlite3.SQLITE_RECURSIVE):
            return sqlite3.SQLITE_OK
        if action == sqlite3.SQLITE_READ:
            return sqlite3.SQLITE_OK if (arg1 or "").lower() in tables else sqlite3.SQLITE_DENY
        if action == sqlite3.SQLITE_FUNCTION:
            return sqlite3.SQLITE_OK if (arg2 or "").lower() in SAFE_FUNCS else sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_DENY
    return cb


def run(checked: Checked, timeout: float | None = None, limit: int | None = None) -> tuple[list[str], list[dict], bool]:
    timeout = settings.query_timeout_seconds if timeout is None else timeout
    limit = settings.query_row_limit if limit is None else limit
    conn = connect_ro()
    try:
        conn.set_authorizer(_authorizer({t.lower() for t in TABLES} | set(checked.ctes)))
        deadline = time.monotonic() + timeout
        conn.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 1000)
        try:
            cur = conn.execute(checked.sql)
            rows = cur.fetchmany(limit + 1)
        except sqlite3.OperationalError as e:
            if "interrupted" in str(e).lower():
                raise QueryTimeout(f"query exceeded {timeout}s") from e
            raise SqlRejected(f"query failed: {e}") from e
        except sqlite3.DatabaseError as e:
            raise SqlRejected(f"query rejected: {e}") from e
        names = [d[0] for d in cur.description or []]
        truncated = len(rows) > limit
        return names, [dict(zip(names, tuple(r))) for r in rows[:limit]], truncated
    finally:
        conn.close()


def suggest_chart(requested: str | None, columns: list[str], rows: list[dict]) -> str:
    """Pick a chart type the result can actually support; the model's suggestion is honoured only if compatible."""
    if not rows:
        return "table"
    numeric = [c for c in columns if all(isinstance(r[c], (int, float)) or r[c] is None for r in rows) and c not in ("year", "month")]
    has_state = "state_code" in columns
    has_time = any(c in columns for c in ("year", "month"))
    texty = [c for c in columns if c not in numeric and c not in ("year", "month")]
    ok = {"table": True,
          "map": has_state and bool(numeric) and len(rows) >= 2 and len({r["state_code"] for r in rows}) == len(rows),
          "line": has_time and bool(numeric) and len(rows) >= 3,
          "bar": bool(texty) and bool(numeric) and len(rows) <= 40}
    if requested in ok and ok[requested]:
        return requested
    for c in ("map", "line", "bar"):
        if ok[c]:
            return c
    return "table"
