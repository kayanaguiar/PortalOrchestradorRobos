import time
from typing import Any

_cache: dict[str, dict] = {}


def get_cached(key: str, ttl: int = 10) -> Any | None:
    """Retorna valor cacheado se ainda válido (dentro do TTL em segundos)."""
    entry = _cache.get(key)
    if entry and time.time() - entry["time"] < ttl:
        return entry["value"]
    return None


def set_cached(key: str, value: Any):
    """Salva valor no cache."""
    _cache[key] = {"value": value, "time": time.time()}


def clear_cache():
    """Limpa todo o cache."""
    _cache.clear()
