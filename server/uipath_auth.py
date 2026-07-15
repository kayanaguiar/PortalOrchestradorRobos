import time
import os
import httpx

# Scopes garantidos — toda External Application do portal precisa ter estes.
BASE_SCOPES = [
    "OR.Robots.Read",
    "OR.Jobs.Read",
    "OR.Jobs.Write",
    "OR.Folders.Read",
    "OR.Audit.Read",
    "OR.Execution.Read",
    "OR.Execution.Write",
    "OR.Monitoring.Read",
    "OR.Administration.Write",
]

# Scopes opcionais — nem toda app tem. Pedimos por cima e negociamos: se o UiPath
# recusar (invalid_scope), descobrimos quais são aceitos e caímos pro conjunto que
# funciona (por orchestrator). Assim uma app sem OR.Queues não quebra o token inteiro.
OPTIONAL_SCOPES = [
    "OR.Queues",   # parent — autoriza leitura E escrita de filas (confirmado)
    "OR.Buckets",
    "OR.Assets",
]

# Compat: string com os scopes base (mantida caso algo externo ainda referencie).
SCOPES = " ".join(BASE_SCOPES)

# Cache de tokens por orchestrator_id
_token_cache: dict[str, dict] = {}
# Cache do conjunto de scopes que efetivamente funciona por orchestrator_id.
# Cada entrada: {"scope": str, "full": bool, "ts": float}. Evita re-negociar a cada
# renovação de token, mas orchestrators com conjunto REDUZIDO (sem algum opcional)
# são re-testados periodicamente — assim, ao adicionar um scope no UiPath, o portal
# passa a enxergá-lo sozinho em até RETRY_REDUCED_AFTER segundos (sem reiniciar).
_scope_cache: dict[str, dict] = {}

# De quanto em quanto tempo re-tentar o conjunto completo num orchestrator reduzido.
RETRY_REDUCED_AFTER = 300  # 5 min


def clear_token_cache():
    """Limpa os caches de token e de scopes, forçando renovação/negociação no próximo request."""
    _token_cache.clear()
    _scope_cache.clear()


def _token_url() -> str:
    return os.environ.get(
        "UIPATH_TOKEN_URL",
        "https://cloud.uipath.com/identity_/connect/token",
    )


def _is_invalid_scope(response: httpx.Response) -> bool:
    if response.status_code != 400:
        return False
    try:
        return response.json().get("error") == "invalid_scope"
    except Exception:
        return "invalid_scope" in response.text


async def _request_token(client: httpx.AsyncClient, client_id: str, client_secret: str, scope: str) -> httpx.Response:
    return await client.post(
        _token_url(),
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": scope,
        },
    )


async def _negotiate(client: httpx.AsyncClient, client_id: str, client_secret: str) -> tuple[httpx.Response, str]:
    """Descobre o maior conjunto de scopes aceito por esta app e devolve (resposta, scope_str)
    do token já com esse conjunto. Só é chamado quando o conjunto completo é recusado."""
    granted = list(BASE_SCOPES)
    for opt in OPTIONAL_SCOPES:
        resp = await _request_token(client, client_id, client_secret, " ".join(BASE_SCOPES + [opt]))
        if resp.status_code == 200:
            granted.append(opt)
        # invalid_scope → app não tem esse scope; ignora. Outros erros também caem
        # no conjunto base (o request final abaixo revalida e propaga erro real).
    return await _request_token(client, client_id, client_secret, " ".join(granted)), " ".join(granted)


async def get_token(orchestrator_id: str, client_id: str, client_secret: str) -> str:
    """Retorna um token válido para um orchestrator, renovando/negociando scopes se necessário."""
    now = time.time()
    full = " ".join(BASE_SCOPES + OPTIONAL_SCOPES)

    cached = _token_cache.get(orchestrator_id)
    entry = _scope_cache.get(orchestrator_id)
    token_valid = bool(cached and cached["access_token"] and now < cached["expires_at"] - 300)
    # Orchestrator com conjunto reduzido: re-tenta o completo de tempos em tempos
    # (pra capturar scopes recém-adicionados no UiPath sem reiniciar o backend).
    retry_upgrade = bool(entry and not entry["full"] and now - entry["ts"] > RETRY_REDUCED_AFTER)

    if token_valid and not retry_upgrade:
        return cached["access_token"]

    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1) Re-teste de upgrade: tenta o completo; se agora passar, adota.
        if retry_upgrade:
            resp = await _request_token(client, client_id, client_secret, full)
            if resp.status_code == 200:
                _scope_cache[orchestrator_id] = {"scope": full, "full": True, "ts": now}
                return _store(orchestrator_id, resp, now)
            if not _is_invalid_scope(resp):
                resp.raise_for_status()
            # ainda reduzido: mantém o scope conhecido, só renova o token e o timestamp
            entry["ts"] = now
            resp = await _request_token(client, client_id, client_secret, entry["scope"])
            resp.raise_for_status()
            return _store(orchestrator_id, resp, now)

        # 2) Já sabemos quais scopes funcionam → usa direto.
        if entry:
            resp = await _request_token(client, client_id, client_secret, entry["scope"])
            if resp.status_code == 200:
                return _store(orchestrator_id, resp, now)
            if not _is_invalid_scope(resp):
                resp.raise_for_status()
            _scope_cache.pop(orchestrator_id, None)  # scopes mudaram → re-negocia

        # 3) Primeira vez / re-negociação: tenta o completo, senão negocia scope a scope.
        resp = await _request_token(client, client_id, client_secret, full)
        if resp.status_code == 200:
            _scope_cache[orchestrator_id] = {"scope": full, "full": True, "ts": now}
            return _store(orchestrator_id, resp, now)
        if not _is_invalid_scope(resp):
            resp.raise_for_status()

        resp, scope_str = await _negotiate(client, client_id, client_secret)
        resp.raise_for_status()
        _scope_cache[orchestrator_id] = {"scope": scope_str, "full": scope_str == full, "ts": now}
        return _store(orchestrator_id, resp, now)


def _store(orchestrator_id: str, resp: httpx.Response, now: float) -> str:
    data = resp.json()
    _token_cache[orchestrator_id] = {
        "access_token": data["access_token"],
        "expires_at": now + data["expires_in"],
    }
    return data["access_token"]
