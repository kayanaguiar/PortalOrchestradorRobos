"""Testes da negociação de scopes (uipath_auth) — a parte que já teve bug em produção.

Mockamos `_request_token` pra simular uma External Application que só aceita
determinados scopes opcionais. Assim validamos: conjunto completo, fallback quando
não tem scope, parcial, cache de token e o re-teste periódico de upgrade.
"""
import pytest

import uipath_auth
from uipath_auth import get_token, BASE_SCOPES, clear_token_cache


class FakeResp:
    def __init__(self, status_code, data=None):
        self.status_code = status_code
        self._data = data or {}
        self.text = str(self._data)

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def make_token_fn(allowed_optional):
    """Fake _request_token: só devolve 200 se TODOS os scopes pedidos forem permitidos
    (base sempre é; opcionais só os de `allowed_optional`). Senão, 400 invalid_scope."""
    allowed = set(BASE_SCOPES) | set(allowed_optional)

    async def fake(client, client_id, client_secret, scope):
        fake.calls.append(scope)
        requested = scope.split(" ")
        if any(s not in allowed for s in requested):
            return FakeResp(400, {"error": "invalid_scope"})
        return FakeResp(200, {"access_token": f"tok::{scope}", "expires_in": 3600})

    fake.calls = []
    return fake


@pytest.fixture(autouse=True)
def _clear_caches():
    clear_token_cache()
    yield
    clear_token_cache()


async def test_full_scopes_single_request(monkeypatch):
    fake = make_token_fn(["OR.Queues", "OR.Buckets", "OR.Assets"])
    monkeypatch.setattr(uipath_auth, "_request_token", fake)

    tok = await get_token("orch1", "cid", "secret")

    assert tok.startswith("tok::")
    entry = uipath_auth._scope_cache["orch1"]
    assert entry["full"] is True
    assert "OR.Queues" in entry["scope"]
    # conjunto completo aceito de primeira → uma única chamada
    assert len(fake.calls) == 1


async def test_no_optional_scopes_falls_back_to_base(monkeypatch):
    fake = make_token_fn([])  # app só tem os scopes base
    monkeypatch.setattr(uipath_auth, "_request_token", fake)

    await get_token("orch1", "cid", "secret")

    entry = uipath_auth._scope_cache["orch1"]
    assert entry["full"] is False
    assert set(entry["scope"].split(" ")) == set(BASE_SCOPES)


async def test_partial_scopes_keeps_only_supported(monkeypatch):
    fake = make_token_fn(["OR.Queues"])  # tem só Queues, não Buckets/Assets
    monkeypatch.setattr(uipath_auth, "_request_token", fake)

    await get_token("orch1", "cid", "secret")

    scopes = set(uipath_auth._scope_cache["orch1"]["scope"].split(" "))
    assert "OR.Queues" in scopes
    assert "OR.Buckets" not in scopes
    assert uipath_auth._scope_cache["orch1"]["full"] is False


async def test_token_cache_avoids_new_requests(monkeypatch):
    fake = make_token_fn(["OR.Queues", "OR.Buckets", "OR.Assets"])
    monkeypatch.setattr(uipath_auth, "_request_token", fake)

    await get_token("orch1", "cid", "secret")
    n = len(fake.calls)
    await get_token("orch1", "cid", "secret")  # deve reusar o token cacheado

    assert len(fake.calls) == n


async def test_reduced_scope_reretries_and_upgrades(monkeypatch):
    # 1) começa sem scopes opcionais → conjunto reduzido
    monkeypatch.setattr(uipath_auth, "_request_token", make_token_fn([]))
    await get_token("orch1", "cid", "secret")
    assert uipath_auth._scope_cache["orch1"]["full"] is False

    # 2) simula o tempo do re-teste passado
    uipath_auth._scope_cache["orch1"]["ts"] -= uipath_auth.RETRY_REDUCED_AFTER + 10

    # 3) agora a app ganhou os scopes → próxima chamada deve fazer upgrade pro completo
    monkeypatch.setattr(uipath_auth, "_request_token", make_token_fn(["OR.Queues", "OR.Buckets", "OR.Assets"]))
    await get_token("orch1", "cid", "secret")

    assert uipath_auth._scope_cache["orch1"]["full"] is True
    assert "OR.Buckets" in uipath_auth._scope_cache["orch1"]["scope"]
