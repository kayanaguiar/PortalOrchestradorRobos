import time
import os
import httpx

SCOPES = "OR.Robots.Read OR.Jobs.Read OR.Jobs.Write OR.Folders.Read OR.Audit.Read OR.Execution.Read OR.Monitoring.Read"

# Cache de tokens por orchestrator_id
_token_cache: dict[str, dict] = {}


async def get_token(orchestrator_id: str, client_id: str, client_secret: str) -> str:
    """Retorna um token válido para um orchestrator específico, renovando se necessário."""
    now = time.time()

    cached = _token_cache.get(orchestrator_id)
    if cached and cached["access_token"] and now < cached["expires_at"] - 300:
        return cached["access_token"]

    token_url = os.environ.get(
        "UIPATH_TOKEN_URL",
        "https://cloud.uipath.com/identity_/connect/token",
    )

    async with httpx.AsyncClient() as client:
        response = await client.post(
            token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": SCOPES,
            },
        )
        response.raise_for_status()
        data = response.json()

    _token_cache[orchestrator_id] = {
        "access_token": data["access_token"],
        "expires_at": now + data["expires_in"],
    }

    return data["access_token"]
