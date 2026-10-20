"""In-memory TTL caching for expensive endpoints (map, rankings, forecasts, insights)."""
from functools import wraps

from cachetools import TTLCache

from app.config import settings

_caches: list[TTLCache] = []


def ttl_cached(maxsize: int = 256):
    cache: TTLCache = TTLCache(maxsize=maxsize, ttl=settings.cache_ttl_seconds)
    _caches.append(cache)

    def deco(fn):
        @wraps(fn)
        def wrapper(*args):
            if args in cache:
                return cache[args]
            val = cache[args] = fn(*args)
            return val
        wrapper.cache = cache
        return wrapper
    return deco


def clear_all() -> None:
    for c in _caches:
        c.clear()
