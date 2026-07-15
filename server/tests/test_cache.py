"""Testes do cache em memória com TTL."""
import cache


def test_set_and_get_within_ttl():
    cache.clear_cache()
    cache.set_cached("k", {"v": 1})
    assert cache.get_cached("k", ttl=10) == {"v": 1}


def test_expired_returns_none():
    cache.clear_cache()
    cache.set_cached("k", 1)
    assert cache.get_cached("k", ttl=0) is None  # ttl 0 → já expirado


def test_clear_cache():
    cache.set_cached("k", 1)
    cache.clear_cache()
    assert cache.get_cached("k") is None


def test_missing_key():
    cache.clear_cache()
    assert cache.get_cached("inexistente") is None
