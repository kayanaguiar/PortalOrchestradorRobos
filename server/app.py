import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

from uipath_auth import get_token
from orchestrator_store import load_orchestrators, save_orchestrators

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
    async with httpx.AsyncClient() as client:
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
    async with httpx.AsyncClient() as client:
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
        if response.status_code == 204:
            return {"status": "ok"}
        return response.json()


async def request_all_orchestrators(endpoint: str, params: dict | None = None) -> list:
    """Faz a mesma requisição em todos os orchestrators e combina os resultados."""
    orchestrators = load_orchestrators()
    all_values = []

    for orch in orchestrators:
        if not orch.get("clientId") or not orch.get("clientSecret"):
            continue
        try:
            data = await uipath_get(orch, endpoint, params)
            values = data.get("value", [])
            for item in values:
                item["_orchestratorId"] = orch["id"]
                item["_orchestratorName"] = orch["name"]
            all_values.extend(values)
        except Exception:
            pass

    return all_values


# ─── Health ───────────────────────────────────────────────

@app.get("/api/health")
async def health():
    """Verifica conexão com pelo menos um orchestrator."""
    orchestrators = load_orchestrators()
    connected_count = 0

    for orch in orchestrators:
        if not orch.get("clientId") or not orch.get("clientSecret"):
            continue
        try:
            await get_token(orch["id"], orch["clientId"], orch["clientSecret"])
            connected_count += 1
        except Exception:
            pass

    return {
        "status": "ok" if connected_count > 0 else "disconnected",
        "connected": connected_count > 0,
        "orchestratorCount": len(orchestrators),
        "connectedCount": connected_count,
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
        return await uipath_get(orch, "RobotLogs", params)

    all_logs = await request_all_orchestrators("RobotLogs", params)
    all_logs.sort(key=lambda x: x.get("TimeStamp", ""), reverse=True)
    return {"value": all_logs[:top], "@odata.count": len(all_logs)}


# ─── Jobs ─────────────────────────────────────────────────

@app.get("/api/jobs")
async def get_jobs(
    top: int = Query(100, alias="$top"),
    filter: str | None = Query(None, alias="$filter"),
    orderby: str = Query("CreationTime desc", alias="$orderby"),
):
    """Busca jobs de todos os orchestrators."""
    params = {
        "$top": top,
        "$orderby": orderby,
        "$count": "true",
    }
    if filter:
        params["$filter"] = filter

    all_jobs = await request_all_orchestrators("Jobs", params)
    all_jobs.sort(key=lambda x: x.get("CreationTime", ""), reverse=True)
    return {"value": all_jobs[:top], "@odata.count": len(all_jobs)}


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
    return await uipath_post(orch, "Jobs/UiPath.Server.Configuration.OData.StartJobs", body)


@app.post("/api/jobs/stop")
async def stop_job(req: JobActionRequest):
    """Para um job (SoftStop ou Kill)."""
    orch = _find_orchestrator(req.orchestratorId)
    body = {
        "jobIds": [req.jobId],
        "strategy": req.strategy,
    }
    return await uipath_post(orch, "Jobs/UiPath.Server.Configuration.OData.StopJobs", body)


@app.post("/api/jobs/resume")
async def resume_job(req: JobActionRequest):
    """Retoma um job pausado."""
    orch = _find_orchestrator(req.orchestratorId)
    body = {"jobId": req.jobId}
    return await uipath_post(orch, f"Jobs({req.jobId})/UiPath.Server.Configuration.OData.ResumeJob", body)


# ─── Processes ────────────────────────────────────────────

@app.get("/api/processes")
async def get_processes():
    """Busca processos de todos os orchestrators."""
    all_procs = await request_all_orchestrators("Releases", {"$orderby": "Name"})
    return {"value": all_procs}


# ─── Machines ─────────────────────────────────────────────

@app.get("/api/machines")
async def get_machines():
    """Busca máquinas de todos os orchestrators."""
    all_machines = await request_all_orchestrators("Machines")
    return {"value": all_machines}


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
