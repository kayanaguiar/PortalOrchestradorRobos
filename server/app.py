import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

from uipath_auth import get_token
from orchestrator_store import load_orchestrators, save_orchestrators
from cache import get_cached, set_cached, clear_cache

app = FastAPI(title="RoboCommand API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def uipath_get(orch: dict, endpoint: str, params: dict | None = None) -> dict:
    """Faz uma requisição GET autenticada a um orchestrator."""
    token = await get_token(orch["id"], orch["clientId"], orch["clientSecret"])
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{orch['baseUrl']}/{endpoint}",
            params=params,
            headers={
                "Authorization": f"Bearer {token}",
                "X-UIPATH-OrganizationUnitId": orch["folderId"],
            },
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()


async def uipath_post(orch: dict, endpoint: str, body: dict | None = None) -> dict:
    """Faz uma requisição POST autenticada a um orchestrator."""
    token = await get_token(orch["id"], orch["clientId"], orch["clientSecret"])
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{orch['baseUrl']}/{endpoint}",
            json=body,
            headers={
                "Authorization": f"Bearer {token}",
                "X-UIPATH-OrganizationUnitId": orch["folderId"],
                "Content-Type": "application/json",
            },
        )
        if response.status_code not in (200, 201, 202, 204):
            raise HTTPException(status_code=response.status_code, detail=response.text)
        if response.status_code == 204 or not response.content:
            return {"status": "ok"}
        return response.json()


async def uipath_patch(orch: dict, endpoint: str, body: dict | None = None) -> dict:
    """Faz uma requisição PATCH autenticada a um orchestrator."""
    token = await get_token(orch["id"], orch["clientId"], orch["clientSecret"])
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.patch(
            f"{orch['baseUrl']}/{endpoint}",
            json=body,
            headers={
                "Authorization": f"Bearer {token}",
                "X-UIPATH-OrganizationUnitId": orch["folderId"],
                "Content-Type": "application/json",
            },
        )
        if response.status_code not in (200, 201, 202, 204):
            raise HTTPException(status_code=response.status_code, detail=response.text)
        if response.status_code == 204 or not response.content:
            return {"status": "ok"}
        return response.json()


async def request_all_orchestrators(endpoint: str, params: dict | None = None) -> list:
    """Faz a mesma requisição em todos os orchestrators em PARALELO e combina os resultados."""
    import asyncio
    orchestrators = load_orchestrators()

    async def fetch_one(orch):
        if not orch.get("clientId") or not orch.get("clientSecret"):
            return []
        try:
            data = await uipath_get(orch, endpoint, params)
            values = data.get("value", [])
            for item in values:
                item["_orchestratorId"] = orch["id"]
                item["_orchestratorName"] = orch["name"]
            return values
        except Exception:
            return []

    results = await asyncio.gather(*[fetch_one(orch) for orch in orchestrators])
    all_values = []
    for values in results:
        all_values.extend(values)
    return all_values


# ─── Health ───────────────────────────────────────────────

@app.get("/api/health")
async def health():
    """Verifica conexão com cada orchestrator individualmente."""
    orchestrators = load_orchestrators()
    connected_count = 0
    orch_statuses = []

    for orch in orchestrators:
        if not orch.get("clientId") or not orch.get("clientSecret"):
            orch_statuses.append({"id": orch["id"], "name": orch["name"], "connected": False, "error": "Sem credenciais"})
            continue
        try:
            await get_token(orch["id"], orch["clientId"], orch["clientSecret"])
            connected_count += 1
            orch_statuses.append({"id": orch["id"], "name": orch["name"], "connected": True})
        except Exception as e:
            orch_statuses.append({"id": orch["id"], "name": orch["name"], "connected": False, "error": str(e)})

    return {
        "status": "ok" if connected_count > 0 else "disconnected",
        "connected": connected_count > 0,
        "orchestratorCount": len(orchestrators),
        "connectedCount": connected_count,
        "orchestrators": orch_statuses,
    }


# ─── Logs ─────────────────────────────────────────────────

@app.get("/api/logs")
async def get_logs(
    top: int = Query(50, alias="$top"),
    skip: int = Query(0, alias="$skip"),
    filter: str | None = Query(None, alias="$filter"),
    orderby: str = Query("TimeStamp desc", alias="$orderby"),
    orchestrator_id: str | None = Query(None),
):
    """Busca logs de todos os orchestrators (ou de um específico)."""
    cache_key = f"logs:{top}:{skip}:{filter}:{orderby}:{orchestrator_id}"
    cached = get_cached(cache_key, ttl=5)
    if cached:
        return cached

    params = {
        "$top": top,
        "$skip": skip,
        "$orderby": orderby,
        "$count": "true",
    }
    if filter:
        params["$filter"] = filter

    if orchestrator_id:
        orchestrators = load_orchestrators()
        orch = next((o for o in orchestrators if o["id"] == orchestrator_id), None)
        if not orch:
            raise HTTPException(status_code=404, detail="Orchestrator não encontrado")
        result = await uipath_get(orch, "RobotLogs", params)
        set_cached(cache_key, result)
        return result

    all_logs = await request_all_orchestrators("RobotLogs", params)
    all_logs.sort(key=lambda x: x.get("TimeStamp", ""), reverse=True)
    result = {"value": all_logs[:top], "@odata.count": len(all_logs)}
    set_cached(cache_key, result)
    return result


@app.get("/api/logs/job/{job_key}")
async def get_logs_by_job(job_key: str, process_name: str | None = Query(None)):
    """Busca logs de um job específico. Filtra por ProcessName na API e por JobKey no servidor."""
    params = {
        "$top": 500,
        "$orderby": "TimeStamp asc",
    }
    if process_name:
        params["$filter"] = f"ProcessName eq '{process_name}'"

    all_logs = await request_all_orchestrators("RobotLogs", params)
    # Filtra pelo JobKey no servidor (campo não filtrável via OData)
    filtered = [log for log in all_logs if log.get("JobKey") == job_key]
    return {"value": filtered}


# ─── Jobs ─────────────────────────────────────────────────

@app.get("/api/jobs")
async def get_jobs(
    top: int = Query(100, alias="$top"),
    filter: str | None = Query(None, alias="$filter"),
    orderby: str = Query("CreationTime desc", alias="$orderby"),
):
    """Busca jobs de todos os orchestrators."""
    cache_key = f"jobs:{top}:{filter}:{orderby}"
    cached = get_cached(cache_key, ttl=5)
    if cached:
        return cached

    params = {
        "$top": top,
        "$orderby": orderby,
        "$count": "true",
    }
    if filter:
        params["$filter"] = filter

    all_jobs = await request_all_orchestrators("Jobs", params)
    all_jobs.sort(key=lambda x: x.get("CreationTime", ""), reverse=True)
    result = {"value": all_jobs[:top], "@odata.count": len(all_jobs)}
    set_cached(cache_key, result)
    return result


# ─── Job Actions (Start/Stop/Pause/Resume) ───────────────

def _find_orchestrator(orchestrator_id: str) -> dict:
    orchestrators = load_orchestrators()
    orch = next((o for o in orchestrators if o["id"] == orchestrator_id), None)
    if not orch:
        raise HTTPException(status_code=404, detail="Orchestrator não encontrado")
    return orch


class StartJobRequest(BaseModel):
    orchestratorId: str
    releaseKey: str  # Key do Release/Process a iniciar


class JobActionRequest(BaseModel):
    orchestratorId: str
    jobId: int
    strategy: str = "SoftStop"  # SoftStop ou Kill


@app.post("/api/jobs/start")
async def start_job(req: StartJobRequest):
    """Inicia um job no UiPath."""
    orch = _find_orchestrator(req.orchestratorId)
    body = {
        "startInfo": {
            "ReleaseKey": req.releaseKey,
            "Strategy": "ModernJobsCount",
            "JobsCount": 1,
            "RuntimeType": "Unattended",
        }
    }
    result = await uipath_post(orch, "Jobs/UiPath.Server.Configuration.OData.StartJobs", body)
    clear_cache()
    return result


@app.post("/api/jobs/stop")
async def stop_job(req: JobActionRequest):
    """Para um job (SoftStop ou Kill)."""
    orch = _find_orchestrator(req.orchestratorId)
    body = {
        "jobIds": [req.jobId],
        "strategy": req.strategy,
    }
    result = await uipath_post(orch, "Jobs/UiPath.Server.Configuration.OData.StopJobs", body)
    clear_cache()
    return result




def _version_is_newer(latest: str, current: str) -> bool:
    """Compara versões semânticas (ex: 1.1.89 vs 1.1.83). Retorna True se latest > current."""
    try:
        l = [int(x) for x in latest.split(".")]
        c = [int(x) for x in current.split(".")]
        return l > c
    except (ValueError, AttributeError):
        return False


# ─── Processes ────────────────────────────────────────────

@app.get("/api/processes")
async def get_processes():
    """Busca processos de todos os orchestrators (rápido, sem buscar versões)."""
    cached = get_cached("processes", ttl=10)
    if cached:
        return cached

    all_procs = await request_all_orchestrators("Releases", {"$orderby": "Name"})
    for proc in all_procs:
        proc["_latestVersion"] = None
        proc["_hasUpdate"] = False
    result = {"value": all_procs}
    set_cached("processes", result)
    return result


@app.get("/api/processes/check-updates")
async def check_process_updates():
    """Busca versões mais recentes de cada processo (pode demorar)."""
    all_procs = await request_all_orchestrators("Releases", {"$orderby": "Name"})
    results = []

    for proc in all_procs:
        orch_id = proc.get("_orchestratorId")
        process_key = proc.get("ProcessKey")
        current_version = proc.get("ProcessVersion")
        auto_update = proc.get("AutoUpdate", False)

        entry = {
            "name": proc.get("Name"),
            "orchestratorId": orch_id,
            "currentVersion": current_version,
            "latestVersion": None,
            "hasUpdate": False,
        }

        if orch_id and process_key and not auto_update:
            try:
                orch = _find_orchestrator(orch_id)
                versions = await uipath_get(
                    orch,
                    f"Processes/UiPath.Server.Configuration.OData.GetProcessVersions(processId='{process_key}')",
                    {"$orderby": "Version desc", "$top": 1},
                )
                latest = (versions.get("value") or [{}])[0]
                latest_version = latest.get("Version")
                entry["latestVersion"] = latest_version
                entry["hasUpdate"] = bool(
                    latest_version and current_version
                    and latest_version != current_version
                    and _version_is_newer(latest_version, current_version)
                )
            except Exception:
                pass

        results.append(entry)

    return {"value": results}


# ─── Process Version Update ───────────────────────────────

@app.get("/api/processes/{process_id}/versions")
async def get_process_versions(process_id: str, orchestrator_id: str = Query(...)):
    """Busca versões disponíveis de um processo."""
    orch = _find_orchestrator(orchestrator_id)
    return await uipath_get(
        orch,
        f"Processes/UiPath.Server.Configuration.OData.GetProcessVersions(processId='{process_id}')",
        {"$orderby": "Version desc", "$top": 10},
    )


class UpdateProcessVersionRequest(BaseModel):
    orchestratorId: str
    releaseName: str
    packageVersion: str


@app.post("/api/processes/update-version")
async def update_process_version(req: UpdateProcessVersionRequest):
    """Atualiza o processo para uma versão específica do pacote."""
    orch = _find_orchestrator(req.orchestratorId)
    # Busca o Release pelo nome pra pegar o Id correto
    data = await uipath_get(orch, "Releases", {"$filter": f"Name eq '{req.releaseName}'"})
    releases = data.get("value", [])
    if not releases:
        raise HTTPException(status_code=404, detail="Release não encontrado")
    release = releases[0]
    release_id = release["Id"]
    print(f"[UPDATE] Release found: Id={release_id}, Name={release['Name']}, CurrentVersion={release.get('ProcessVersion')}, NewVersion={req.packageVersion}")
    body = {"ProcessVersion": req.packageVersion}
    result = await uipath_patch(orch, f"Releases({release_id})", body)
    print(f"[UPDATE] Success via PATCH")
    return result


# ─── Machines ─────────────────────────────────────────────

@app.get("/api/machines")
async def get_machines():
    """Busca máquinas de todos os orchestrators."""
    all_machines = await request_all_orchestrators("Machines")
    return {"value": all_machines}


# ─── Sessions (Robots conectados / Assistant) ────────────

# Guarda assistants que estavam online no último check
_previous_online_assistants: dict[str, dict] = {}


@app.get("/api/sessions")
async def get_sessions():
    """Busca sessões ativas e detecta assistants que ficaram offline."""
    cached = get_cached("sessions", ttl=10)
    if cached:
        return cached

    global _previous_online_assistants
    all_sessions = await request_all_orchestrators("Sessions")

    # Identifica assistants online agora
    current_online = {}
    for s in all_sessions:
        if s.get("Source") == "Assistant" and s.get("State") == "Available" and s.get("HostMachineName"):
            key = f"{s.get('_orchestratorId')}::{s['Id']}"
            current_online[key] = {
                "id": s["Id"],
                "machineName": s.get("MachineName") or s.get("HostMachineName"),
                "hostMachineName": s.get("HostMachineName"),
                "orchestratorId": s.get("_orchestratorId"),
                "orchestratorName": s.get("_orchestratorName"),
            }

    # Detecta quem sumiu
    gone_offline = []
    for key, info in _previous_online_assistants.items():
        if key not in current_online:
            gone_offline.append(info)

    _previous_online_assistants = current_online

    result = {
        "value": all_sessions,
        "recentlyOffline": gone_offline,
    }
    set_cached("sessions", result)
    return result


# ─── Settings ─────────────────────────────────────────────

import json as _json

SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "data", "settings.json")


def _load_settings() -> dict:
    if not os.path.exists(SETTINGS_FILE):
        return {"pollingInterval": 30}
    with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
        return _json.load(f)


def _save_settings(settings: dict):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        _json.dump(settings, f, indent=2, ensure_ascii=False)


@app.get("/api/settings")
async def get_settings():
    return _load_settings()


class SettingsModel(BaseModel):
    pollingInterval: int = 30


@app.post("/api/settings")
async def save_settings(settings: SettingsModel):
    _save_settings(settings.model_dump())
    return {"status": "ok"}


# ─── Orchestrators CRUD ──────────────────────────────────

class OrchestratorModel(BaseModel):
    id: str
    name: str
    baseUrl: str
    folderId: str
    clientId: str = ""
    clientSecret: str = ""
    status: str = "disconnected"


@app.get("/api/orchestrators")
async def list_orchestrators():
    """Lista orchestrators (sem expor os secrets no retorno)."""
    orchestrators = load_orchestrators()
    return [
        {
            **orch,
            "clientSecret": "••••••••" if orch.get("clientSecret") else "",
            "hasCredentials": bool(orch.get("clientId") and orch.get("clientSecret")),
        }
        for orch in orchestrators
    ]


@app.post("/api/orchestrators")
async def save_all_orchestrators(orchestrators: list[OrchestratorModel]):
    """Salva a lista completa de orchestrators."""
    # Se o secret veio mascarado, mantém o valor antigo
    existing = {o["id"]: o for o in load_orchestrators()}
    to_save = []
    for o in orchestrators:
        data = o.model_dump()
        if data["clientSecret"] == "••••••••" and data["id"] in existing:
            data["clientSecret"] = existing[data["id"]].get("clientSecret", "")
        to_save.append(data)

    save_orchestrators(to_save)
    return {"status": "ok", "count": len(to_save)}


@app.post("/api/orchestrators/test")
async def test_orchestrator(orch: OrchestratorModel):
    """Testa a conexão com um orchestrator específico."""
    # Se o secret veio mascarado, usa o salvo
    secret = orch.clientSecret
    if secret == "••••••••":
        existing = {o["id"]: o for o in load_orchestrators()}
        if orch.id in existing:
            secret = existing[orch.id].get("clientSecret", "")

    orch_dict = orch.model_dump()
    orch_dict["clientSecret"] = secret

    try:
        data = await uipath_get(orch_dict, "RobotLogs", {"$top": 1, "$count": "true"})
        return {"status": "ok", "connected": True, "logCount": data.get("@odata.count", 0)}
    except Exception as e:
        return {"status": "error", "connected": False, "detail": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=3001, reload=True)
