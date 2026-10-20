"""Natural-language question -> SQL (Claude) -> validated, sandboxed execution -> data + chart suggestion."""
import logging

from app.db import connect_ro
from app.services import ai, data, sql_guard

log = logging.getLogger("app.ask")

SCHEMA = {"type": "object", "properties": {
    "sql": {"type": "string"},
    "chart_type": {"type": "string", "enum": ["bar", "line", "map", "table"]},
    "title": {"type": "string"},
    "explanation": {"type": "string"}},
    "required": ["sql", "chart_type", "title", "explanation"], "additionalProperties": False}

NOTES = """Conventions (from the dataset's data dictionary):
- Counts are integers; money is INR crore (tourism_revenue_cr, forex_earnings_cr, gsdp_cr) except avg_spend_per_tourist (INR); percentages are 0-100.
- year is the calendar year 2015-2025; month is 1-12.
- J&K ('JK') and Ladakh ('LA') are separate from 2019; before 2019 JK includes Ladakh and there are no LA rows. Dadra and Nagar Haveli and Daman and Diu is one entity 'DD'. Telangana is 'TS'; Uttarakhand is 'UT'.
- Join states(state_code) to get state_name and region. Use state_code values, or state_name LIKE for names; tourism_type_tags is ';'-separated.
- tourism_annual has domestic_visits and foreign_visits; total visits = domestic_visits + foreign_visits.
- Every table has is_synthetic (1 = synthetic) and data_source."""

SYSTEM = (
    "You translate questions about Indian state tourism into ONE read-only SQLite SELECT statement over the schema below. "
    "Use only the listed tables and columns. No comments, no multiple statements, no PRAGMA, no functions that are not standard SQLite aggregates/scalars. "
    "Prefer including state_code and state_name (and year when relevant) in the output columns, give computed columns clear aliases, "
    "add ORDER BY and a sensible LIMIT (default 10 for 'top N' questions; at most 500). "
    "Pick chart_type: 'map' for one value per state, 'line' for a series over year or month, 'bar' for a ranking/comparison of categories, otherwise 'table'. "
    "If the question cannot be answered from this data, still return a best-effort SELECT that returns the closest available data and say so in `explanation`."
)


def schema_text() -> str:
    lines = []
    for t, cols in sql_guard.schema().items():
        lines.append(f"{t}({', '.join(f'{c} {ty}' for c, ty in cols)})")
    f = data.frames()
    states = "; ".join(f"{r.state_code}={r.state_name}" for r in f.states.itertuples())
    return ("TABLES:\n" + "\n".join(lines) + "\n\n" + NOTES + f"\n\nState codes: {states}\nRegions: {', '.join(sorted(f.states.region.unique()))}")


def _tables_meta(tables: list[str]) -> tuple[list[str], float]:
    conn = connect_ro()
    try:
        total = syn = 0
        sources: set[str] = set()
        for t in tables:
            n, s = conn.execute(f'SELECT COUNT(*), SUM(is_synthetic) FROM "{t}"').fetchone()
            total += n
            syn += s or 0
            sources.update(r[0] for r in conn.execute(f'SELECT DISTINCT data_source FROM "{t}"'))
        return sorted(sources), (round(100 * syn / total, 2) if total else 0.0)
    finally:
        conn.close()


def answer(question: str) -> dict:
    """Raises ai.AiUnavailable / ai.AiError / sql_guard.SqlRejected / sql_guard.QueryTimeout."""
    system = SYSTEM + "\n\n" + schema_text()
    user = f"Question: {question}"
    last_err = None
    for attempt in range(2):
        prompt = user if attempt == 0 else (
            f"{user}\n\nYour previous SQL was rejected: {last_err}\nPrevious SQL:\n{last['sql']}\nReturn a corrected single SELECT.")
        last = ai.complete_json(system, prompt, SCHEMA, max_tokens=1500)
        try:
            checked = sql_guard.validate_select(last.get("sql", ""))
            break
        except sql_guard.SqlRejected as e:
            last_err = str(e)
            log.warning("generated SQL rejected", extra={"fields": {"attempt": attempt, "reason": last_err}})
    else:
        raise sql_guard.SqlRejected(f"{last_err} (generated SQL: {last.get('sql', '')[:300]})")
    columns, rows, truncated = sql_guard.run(checked)
    sources, share = _tables_meta(checked.tables)
    return {"question": question, "title": last.get("title", ""), "explanation": last.get("explanation", ""),
            "chart_type": sql_guard.suggest_chart(last.get("chart_type"), columns, rows),
            "sql": checked.sql, "columns": columns, "rows": rows, "row_count": len(rows), "truncated": truncated,
            "tables_used": checked.tables, "sources": sources, "synthetic_share": share}
