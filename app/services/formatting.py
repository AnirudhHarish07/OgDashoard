"""Indian-format display strings (lakh / crore)."""
import math


def _ok(v) -> bool:
    return v is not None and not (isinstance(v, float) and math.isnan(v))


def indian_group(n: float, decimals: int = 0) -> str:
    s = f"{abs(n):.{decimals}f}"
    whole, _, frac = s.partition(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        whole = ",".join(parts + [tail])
    out = whole + ("." + frac if frac else "")
    return ("-" if n < 0 and float(s) != 0 else "") + out


def _scaled(x: float) -> str:
    return f"{x:.2f}" if abs(x) < 10 else f"{x:.1f}"


def fmt_count(v) -> str | None:
    """Visit counts: '21.9 Cr', '3.05 L', '45,210'."""
    if not _ok(v):
        return None
    a = abs(v)
    if a >= 1e7:
        return f"{_scaled(v / 1e7)} Cr"
    if a >= 1e5:
        return f"{_scaled(v / 1e5)} L"
    return indian_group(v)


def fmt_crore(v) -> str | None:
    """Money already expressed in INR crore: '₹9,714 Cr', '₹10.3 L Cr'."""
    if not _ok(v):
        return None
    if abs(v) >= 1e5:
        return f"₹{_scaled(v / 1e5)} L Cr"
    return f"₹{indian_group(v)} Cr"


def fmt_rupees(v) -> str | None:
    """Money in INR (per-tourist spend): '₹2,536'."""
    return f"₹{indian_group(v)}" if _ok(v) else None


def fmt_pct(v, signed: bool = False) -> str | None:
    if not _ok(v):
        return None
    return f"{v:+.1f}%" if signed else f"{v:.1f}%"


def fmt_number(v, decimals: int = 0) -> str | None:
    return indian_group(v, decimals) if _ok(v) else None
