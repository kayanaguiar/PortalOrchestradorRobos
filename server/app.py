import os
import re
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from fastapi import FastAPI, Query, HTTPException, Request, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from uipath_auth import get_token
from orchestrator_store import load_orchestrators, save_orchestrators, get_shared_orchestrators, set_shared_orchestrators
from cache import get_cached, set_cached, clear_cache
from auth import verify_password, create_token, get_current_user, hash_password, generate_user_id, create_default_admin, require_admin, require_operator, require_viewer
from database import SessionLocal
from models import ArchivedProcess, Setting, RobotLog

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="RoboCommand API")
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Muitas requisições. Tente novamente em alguns instantes."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


async def uipath_put(orch: dict, endpoint: str, body: dict | None = None) -> dict:
    """Faz uma requisição PUT autenticada a um orchestrator."""
    token = await get_token(orch["id"], orch["clientId"], orch["clientSecret"])
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.put(
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


async def uipath_delete(orch: dict, endpoint: str) -> dict:
    """Faz uma requisição DELETE autenticada a um orchestrator."""
    token = await get_token(orch["id"], orch["clientId"], orch["clientSecret"])
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.delete(
            f"{orch['baseUrl']}/{endpoint}",
            headers={
                "Authorization": f"Bearer {token}",
                "X-UIPATH-OrganizationUnitId": orch["folderId"],
            },
        )
        if response.status_code not in (200, 204):
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return {"status": "ok"}


async def request_all_orchestrators_with_status(
    endpoint: str, params: dict | None = None, user: dict | None = None
) -> tuple[list, set[str]]:
    """Como request_all_orchestrators, mas também devolve o conjunto de IDs
    dos orchestrators que responderam com sucesso (para distinguir 'sem dados'
    de 'falha de conexão')."""
    import asyncio
    orchestrators = load_orchestrators(user=user)

    async def fetch_one(orch):
        if not orch.get("clientId") or not orch.get("clientSecret"):
            return [], False, orch["id"]
        try:
            data = await uipath_get(orch, endpoint, params)
            values = data.get("value", [])
            for item in values:
                item["_orchestratorId"] = orch["id"]
                item["_orchestratorName"] = orch["name"]
            return values, True, orch["id"]
        except Exception:
            return [], False, orch["id"]

    results = await asyncio.gather(*[fetch_one(orch) for orch in orchestrators])
    all_values = []
    healthy_ids: set[str] = set()
    for values, ok, orch_id in results:
        all_values.extend(values)
        if ok:
            healthy_ids.add(orch_id)
    return all_values, healthy_ids


async def request_all_orchestrators(endpoint: str, params: dict | None = None, user: dict | None = None) -> list:
    """Faz a mesma requisição em todos os orchestrators em PARALELO e combina os resultados."""
    values, _ = await request_all_orchestrators_with_status(endpoint, params, user)
    return values


# ─── Auth ─────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/api/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, req: LoginRequest):
    from models import User
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=req.email).first()
        if not user or not verify_password(req.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Credenciais inválidas")
        if not user.active:
            raise HTTPException(status_code=401, detail="Usuário inativo")
        token = create_token(user.id, user.email, user.role)
        return {
            "token": token,
            "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role},
        }
    finally:
        db.close()


@app.post("/api/auth/refresh")
async def refresh_token(payload: dict = Depends(require_viewer)):
    """Emite um novo token a partir de um token válido — usado pelo frontend
    pra renovar a sessão sem precisar relogar."""
    from models import User
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(id=payload["sub"]).first()
        if not user or not user.active:
            raise HTTPException(status_code=401, detail="Usuário inválido")
        from auth import create_token
        new_token = create_token(user.id, user.email, user.role)
        return {"token": new_token}
    finally:
        db.close()


@app.get("/api/auth/me")
async def get_me(payload: dict = Depends(require_viewer)):
    from models import User
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(id=payload["sub"]).first()
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não encontrado")
        return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}
    finally:
        db.close()


# ─── Health ───────────────────────────────────────────────

@app.get("/api/ping")
async def ping():
    """Healthcheck público — apenas confirma que o uvicorn está respondendo.
    Usado pelo Docker healthcheck (sem autenticação)."""
    return {"status": "ok"}


@app.get("/api/health")
async def health(_user: dict = Depends(require_viewer)):
    """Verifica conexão com cada orchestrator individualmente."""
    orchestrators = load_orchestrators(user=_user)
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

def _parse_log_filter(filter_str: str | None):
    """Extrai process_name e range de datas de um $filter OData simples
    (formato que o frontend monta)."""
    process_name = date_from = date_to = None
    if not filter_str:
        return process_name, date_from, date_to
    m = re.search(r"ProcessName eq '([^']*)'", filter_str)
    if m:
        process_name = m.group(1)
    m = re.search(r"TimeStamp ge ([0-9T:\-.Z]+)", filter_str)
    if m:
        date_from = m.group(1)
    m = re.search(r"TimeStamp le ([0-9T:\-.Z]+)", filter_str)
    if m:
        date_to = m.group(1)
    return process_name, date_from, date_to


def _parse_iso(s: str | None):
    """ISO (com Z) → datetime naive UTC, pra comparar com a coluna do banco."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc).replace(tzinfo=None)
    except ValueError:
        return None


def _is_historical(date_to: str | None) -> bool:
    """True se a busca termina antes do início de hoje (UTC) — vai pro Postgres.
    Sem limite superior (ou incluindo hoje) → busca ao vivo no UiPath."""
    dt = _parse_iso(date_to)
    if dt is None:
        return False
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
    return dt < today_start


def _query_logs_from_db(process_name, date_from, date_to, orchestrator_id, top, skip, orderby):
    """Lê logs arquivados do Postgres no mesmo formato que o UiPath devolveria."""
    db = SessionLocal()
    try:
        q = db.query(RobotLog)
        if process_name:
            q = q.filter(RobotLog.process_name == process_name)
        if orchestrator_id:
            q = q.filter(RobotLog.orchestrator_id == orchestrator_id)
        df, dt = _parse_iso(date_from), _parse_iso(date_to)
        if df:
            q = q.filter(RobotLog.timestamp >= df)
        if dt:
            q = q.filter(RobotLog.timestamp <= dt)
        total = q.count()
        descending = "desc" in (orderby or "").lower()
        q = q.order_by(RobotLog.timestamp.desc() if descending else RobotLog.timestamp.asc())
        rows = q.offset(skip).limit(top).all()
        # `raw` preserva o log original do UiPath — formato idêntico pro frontend
        value = [r.raw or {
            "Id": r.id, "Level": r.level, "Message": r.message,
            "ProcessName": r.process_name, "RobotName": r.robot_name, "JobKey": r.job_key,
        } for r in rows]
        return {"value": value, "@odata.count": total}
    finally:
        db.close()


@app.get("/api/logs")
async def get_logs(
    top: int = Query(50, alias="$top"),
    skip: int = Query(0, alias="$skip"),
    filter: str | None = Query(None, alias="$filter"),
    orderby: str = Query("TimeStamp desc", alias="$orderby"),
    orchestrator_id: str | None = Query(None),
    _user: dict = Depends(require_viewer),
):
    """Busca logs. Histórico (dias anteriores) vem do Postgres; hoje vem ao vivo do UiPath."""
    cache_key = f"logs:{top}:{skip}:{filter}:{orderby}:{orchestrator_id}"
    cached = get_cached(cache_key, ttl=5)
    if cached:
        return cached

    process_name, date_from, date_to = _parse_log_filter(filter)

    # Busca em dias anteriores → lê do banco local (rápido, sem depender do UiPath).
    # Se o banco ainda não tem esses logs (coletor começou depois), cai pro UiPath ao vivo.
    if _is_historical(date_to):
        result = _query_logs_from_db(process_name, date_from, date_to, orchestrator_id, top, skip, orderby)
        if result["@odata.count"] > 0:
            set_cached(cache_key, result)
            return result
        # vazio no banco → segue pro caminho ao vivo abaixo (fallback)

    # Busca de hoje / ao vivo → UiPath
    params = {
        "$top": top,
        "$skip": skip,
        "$orderby": orderby,
        "$count": "true",
    }
    if filter:
        params["$filter"] = filter

    if orchestrator_id:
        orch = _find_orchestrator(orchestrator_id, user=_user)
        result = await uipath_get(orch, "RobotLogs", params)
        set_cached(cache_key, result)
        return result

    all_logs = await request_all_orchestrators("RobotLogs", params, user=_user)
    all_logs.sort(key=lambda x: x.get("TimeStamp", ""), reverse=True)
    result = {"value": all_logs[:top], "@odata.count": len(all_logs)}
    set_cached(cache_key, result)
    return result


@app.get("/api/logs/job/{job_key}")
async def get_logs_by_job(job_key: str, process_name: str | None = Query(None), _user: dict = Depends(require_viewer)):
    """Busca logs de um job específico. Filtra por ProcessName na API e por JobKey no servidor."""
    params = {
        "$top": 500,
        "$orderby": "TimeStamp asc",
    }
    if process_name:
        params["$filter"] = f"ProcessName eq '{process_name}'"

    all_logs = await request_all_orchestrators("RobotLogs", params, user=_user)
    # Filtra pelo JobKey no servidor (campo não filtrável via OData)
    filtered = [log for log in all_logs if log.get("JobKey") == job_key]
    return {"value": filtered}


# ─── Jobs ─────────────────────────────────────────────────

@app.get("/api/jobs")
async def get_jobs(
    top: int = Query(100, alias="$top"),
    filter: str | None = Query(None, alias="$filter"),
    orderby: str = Query("CreationTime desc", alias="$orderby"),
    _user: dict = Depends(require_viewer),
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

    all_jobs = await request_all_orchestrators("Jobs", params, user=_user)
    all_jobs.sort(key=lambda x: x.get("CreationTime", ""), reverse=True)
    result = {"value": all_jobs[:top], "@odata.count": len(all_jobs)}
    set_cached(cache_key, result)
    return result


# ─── Job Actions (Start/Stop/Pause/Resume) ───────────────

def _find_orchestrator(orchestrator_id: str, user: dict | None = None) -> dict:
    orchestrators = load_orchestrators(user=user)
    orch = next((o for o in orchestrators if o["id"] == orchestrator_id), None)
    if not orch:
        raise HTTPException(status_code=404, detail="Orchestrator não encontrado")
    return orch


class StartJobRequest(BaseModel):
    orchestratorId: str
    releaseKey: str  # Key do Release/Process a iniciar
    robotName: str | None = None  # Nome do robô (para audit)


class JobActionRequest(BaseModel):
    orchestratorId: str
    jobId: int
    strategy: str = "SoftStop"  # SoftStop ou Kill
    robotName: str | None = None  # Nome do robô (para audit)
    actionType: str | None = None  # cancel, stop, kill (para audit)


def _save_audit(user: dict, action: str, robot_name: str, orchestrator_id: str = None, orchestrator_name: str = None, detail: str = None):
    """Salva uma entrada no audit log."""
    import uuid
    from models import AuditLog, User
    db = SessionLocal()
    try:
        user_name = user.get("email", "—")
        db_user = db.query(User).filter_by(id=user.get("sub", "")).first()
        if db_user:
            user_name = db_user.name
        log = AuditLog(
            id=str(uuid.uuid4()),
            user_id=user.get("sub", ""),
            user_name=user_name,
            action=action,
            robot_name=robot_name,
            orchestrator_id=orchestrator_id,
            orchestrator_name=orchestrator_name,
            detail=detail,
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@app.post("/api/jobs/start")
@limiter.limit("20/minute")
async def start_job(request: Request, req: StartJobRequest, _user: dict = Depends(require_operator)):
    """Inicia um job no UiPath."""
    orch = _find_orchestrator(req.orchestratorId, user=_user)
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
    _save_audit(_user, "start", req.robotName or req.releaseKey, req.orchestratorId, orch.get("name"))
    return result


@app.post("/api/jobs/stop")
@limiter.limit("20/minute")
async def stop_job(request: Request, req: JobActionRequest, _user: dict = Depends(require_operator)):
    """Para um job (SoftStop ou Kill)."""
    orch = _find_orchestrator(req.orchestratorId, user=_user)
    body = {
        "jobIds": [req.jobId],
        "strategy": req.strategy,
    }
    result = await uipath_post(orch, "Jobs/UiPath.Server.Configuration.OData.StopJobs", body)
    clear_cache()
    action = req.actionType or ("kill" if req.strategy == "Kill" else "stop")
    _save_audit(_user, action, req.robotName or str(req.jobId), req.orchestratorId, orch.get("name"))
    return result


# ─── Audit Trail ──────────────────────────────────────────

@app.get("/api/audit")
async def get_audit_logs(
    top: int = Query(50, alias="$top"),
    skip: int = Query(0, alias="$skip"),
    user_id: str | None = Query(None, alias="userId"),
    action: str | None = Query(None),
    robot_name: str | None = Query(None, alias="robotName"),
    date_from: str | None = Query(None, alias="from"),
    date_to: str | None = Query(None, alias="to"),
    _user: dict = Depends(require_admin),
):
    """Retorna histórico de ações com filtros opcionais."""
    from models import AuditLog
    from datetime import datetime
    db = SessionLocal()
    try:
        query = db.query(AuditLog)
        if user_id:
            query = query.filter(AuditLog.user_id == user_id)
        if action:
            query = query.filter(AuditLog.action == action)
        if robot_name:
            query = query.filter(AuditLog.robot_name.ilike(f"%{robot_name}%"))
        if date_from:
            try:
                dt_from = datetime.fromisoformat(date_from)
                query = query.filter(AuditLog.created_at >= dt_from)
            except ValueError:
                pass
        if date_to:
            try:
                dt_to = datetime.fromisoformat(date_to)
                query = query.filter(AuditLog.created_at <= dt_to)
            except ValueError:
                pass

        total = query.count()
        logs = (
            query
            .order_by(AuditLog.created_at.desc())
            .offset(skip)
            .limit(top)
            .all()
        )
        return {
            "value": [
                {
                    "id": l.id,
                    "userId": l.user_id,
                    "userName": l.user_name,
                    "action": l.action,
                    "robotName": l.robot_name,
                    "orchestratorId": l.orchestrator_id,
                    "orchestratorName": l.orchestrator_name,
                    "detail": l.detail,
                    "createdAt": l.created_at.isoformat() if l.created_at else None,
                }
                for l in logs
            ],
            "total": total,
        }
    finally:
        db.close()




# ─── Packages (pacotes publicados no feed) ────────────────

@app.get("/api/packages")
async def get_packages(_user: dict = Depends(require_viewer)):
    """Busca pacotes disponíveis no feed de todos os orchestrators."""
    cached = get_cached("packages", ttl=30)
    if cached:
        return cached
    all_packages = await request_all_orchestrators("Processes", user=_user)
    result = {"value": all_packages}
    set_cached("packages", result)
    return result


class CreateReleaseRequest(BaseModel):
    orchestratorId: str
    name: str
    processKey: str
    processVersion: str
    entryPointPath: str = "Main.xaml"


@app.post("/api/releases/create")
async def create_release(req: CreateReleaseRequest, _user: dict = Depends(require_operator)):
    """Cria um novo processo (Release) a partir de um pacote."""
    orch = _find_orchestrator(req.orchestratorId, user=_user)
    body = {
        "Name": req.name,
        "ProcessKey": req.processKey,
        "ProcessVersion": req.processVersion,
        "EntryPointPath": req.entryPointPath,
    }
    result = await uipath_post(orch, "Releases", body)
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
async def get_processes(_user: dict = Depends(require_viewer)):
    """Busca processos de todos os orchestrators (rápido, sem buscar versões)."""
    cached = get_cached("processes", ttl=10)
    if cached:
        return cached

    all_procs = await request_all_orchestrators("Releases", {"$orderby": "Name"}, user=_user)
    for proc in all_procs:
        proc["_latestVersion"] = None
        proc["_hasUpdate"] = False
    result = {"value": all_procs}
    set_cached("processes", result)
    return result


@app.get("/api/processes/check-updates")
async def check_process_updates(_user: dict = Depends(require_viewer)):
    """Busca versões mais recentes de cada processo (pode demorar)."""
    all_procs = await request_all_orchestrators("Releases", {"$orderby": "Name"}, user=_user)
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
                orch = _find_orchestrator(orch_id, user=_user)
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
async def get_process_versions(process_id: str, orchestrator_id: str = Query(...), _user: dict = Depends(require_viewer)):
    """Busca versões disponíveis de um processo."""
    orch = _find_orchestrator(orchestrator_id, user=_user)
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
async def update_process_version(req: UpdateProcessVersionRequest, _user: dict = Depends(require_operator)):
    """Atualiza o processo para uma versão específica do pacote."""
    orch = _find_orchestrator(req.orchestratorId, user=_user)
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
async def get_machines(_user: dict = Depends(require_viewer)):
    """Busca máquinas de todos os orchestrators."""
    all_machines = await request_all_orchestrators("Machines", user=_user)
    return {"value": all_machines}


# ─── Sessions (Robots conectados / Assistant) ────────────

# Guarda assistants que estavam online no último check
_previous_online_assistants: dict[str, dict] = {}


@app.get("/api/sessions")
async def get_sessions(_user: dict = Depends(require_viewer)):
    """Busca sessões ativas e detecta assistants que ficaram offline."""
    cached = get_cached("sessions", ttl=10)
    if cached:
        return cached

    global _previous_online_assistants
    all_sessions, healthy_orch_ids = await request_all_orchestrators_with_status("Sessions", user=_user)

    # Identifica assistants online agora (só dos orchestrators que responderam)
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

    # Detecta quem sumiu APENAS em orchestrators que responderam nesta rodada.
    # Sem isso, falha de rede transforma todo o snapshot anterior em "offline".
    gone_offline = []
    for key, info in _previous_online_assistants.items():
        if info.get("orchestratorId") not in healthy_orch_ids:
            continue
        if key not in current_online:
            gone_offline.append(info)

    # Atualiza o snapshot por orchestrator: preserva o estado dos que falharam,
    # sobrescreve só os que responderam.
    new_snapshot = {
        key: info
        for key, info in _previous_online_assistants.items()
        if info.get("orchestratorId") not in healthy_orch_ids
    }
    new_snapshot.update(current_online)
    _previous_online_assistants = new_snapshot

    result = {
        "value": all_sessions,
        "recentlyOffline": gone_offline,
    }
    set_cached("sessions", result)
    return result


# ─── Triggers (ProcessSchedules) ──────────────────────────

# Snapshot dos triggers que estavam HABILITADOS no último check.
# Usado pra detectar quando o UiPath desabilita automaticamente (fila estourou).
_previous_enabled_triggers: dict[str, dict] = {}
# IDs dos triggers desabilitados manualmente via portal — pra não confundir com auto-disable.
_manually_disabled_triggers: set[str] = set()


@app.get("/api/triggers")
async def get_triggers(_user: dict = Depends(require_viewer)):
    """Busca todos os gatilhos e detecta os que foram auto-desabilitados pelo UiPath."""
    cached = get_cached("triggers", ttl=10)
    if cached:
        return cached

    global _previous_enabled_triggers, _manually_disabled_triggers
    all_triggers = await request_all_orchestrators("ProcessSchedules", user=_user)

    current_keys = set()
    current_enabled: dict[str, dict] = {}
    current_disabled_keys: set[str] = set()
    for t in all_triggers:
        key = f"{t.get('_orchestratorId')}::{t.get('Id')}"
        current_keys.add(key)
        if t.get("Enabled"):
            current_enabled[key] = t
        else:
            current_disabled_keys.add(key)

    # Auto-disabled: estava habilitado no snapshot anterior, agora está desabilitado,
    # e ninguém desabilitou manualmente via portal nesta rodada.
    auto_disabled = []
    for key, prev in _previous_enabled_triggers.items():
        if key in current_disabled_keys and key not in _manually_disabled_triggers:
            auto_disabled.append({
                "id": prev.get("Id"),
                "name": prev.get("Name"),
                "releaseName": prev.get("ReleaseName"),
                "orchestratorId": prev.get("_orchestratorId"),
                "orchestratorName": prev.get("_orchestratorName"),
            })

    # Atualiza snapshots
    _previous_enabled_triggers = current_enabled
    # Limpa flags de "manual": tira do set os que já apareceram como disabled
    # (a transição já foi observada) e os que sumiram do UiPath.
    _manually_disabled_triggers &= current_keys
    _manually_disabled_triggers -= current_disabled_keys

    result = {"value": all_triggers, "autoDisabled": auto_disabled}
    set_cached("triggers", result)
    return result


class SetEnableRequest(BaseModel):
    orchestratorId: str
    scheduleId: int
    enabled: bool


def _clean_schedule_for_put(data: dict) -> dict:
    """Remove campos que causam conflito no PUT de ProcessSchedules."""
    # SpecificPriorityValue conflita com JobPriority quando é null/Normal
    if data.get("JobPriority") is None or data.get("JobPriority") == "Normal":
        data.pop("SpecificPriorityValue", None)
    return data


@app.post("/api/triggers/set-enable")
async def set_trigger_enable(req: SetEnableRequest, _user: dict = Depends(require_operator)):
    """Habilita ou desabilita um gatilho via PUT."""
    orch = _find_orchestrator(req.orchestratorId, user=_user)
    current = await uipath_get(orch, f"ProcessSchedules({req.scheduleId})")
    current["Enabled"] = req.enabled
    current = _clean_schedule_for_put(current)
    result = await uipath_put(orch, f"ProcessSchedules({req.scheduleId})", current)

    # Marca a desabilitação como manual pra não disparar notificação de auto-disable.
    global _manually_disabled_triggers
    key = f"{req.orchestratorId}::{req.scheduleId}"
    if req.enabled:
        _manually_disabled_triggers.discard(key)
    else:
        _manually_disabled_triggers.add(key)

    clear_cache()
    return result


class CreateTriggerRequest(BaseModel):
    orchestratorId: str
    name: str
    releaseKey: str
    startProcessCron: str
    timeZoneId: str = "E. South America Standard Time"
    enabled: bool = True


@app.post("/api/triggers/create")
async def create_trigger(req: CreateTriggerRequest, _user: dict = Depends(require_operator)):
    """Cria um novo gatilho no UiPath."""
    orch = _find_orchestrator(req.orchestratorId, user=_user)
    # Busca todos os releases e filtra pelo Key no Python
    data = await uipath_get(orch, "Releases")
    releases = [r for r in (data.get("value") or []) if r.get("Key") == req.releaseKey]
    release_id = releases[0]["Id"] if releases else None
    release_name = releases[0]["Name"] if releases else req.name

    body = {
        "Name": req.name,
        "ReleaseName": release_name,
        "StartProcessCron": req.startProcessCron,
        "StartProcessCronDetails": f'{{"advancedCron":"{req.startProcessCron}"}}',
        "StartStrategy": 1,
        "TimeZoneId": req.timeZoneId,
        "Enabled": req.enabled,
        "RuntimeType": "Unattended",
    }
    if release_id:
        body["ReleaseId"] = release_id
    body["ReleaseKey"] = req.releaseKey

    result = await uipath_post(orch, "ProcessSchedules", body)
    clear_cache()
    return result


class UpdateTriggerRequest(BaseModel):
    orchestratorId: str
    triggerId: int
    name: str
    startProcessCron: str
    timeZoneId: str
    enabled: bool


@app.post("/api/triggers/update")
async def update_trigger(req: UpdateTriggerRequest, _user: dict = Depends(require_operator)):
    """Atualiza um gatilho (PUT no ProcessSchedule)."""
    orch = _find_orchestrator(req.orchestratorId, user=_user)
    # Busca o trigger atual pra manter campos obrigatórios
    current = await uipath_get(orch, f"ProcessSchedules({req.triggerId})")
    # Atualiza só os campos editáveis
    current["Name"] = req.name
    current["StartProcessCron"] = req.startProcessCron
    current["StartProcessCronDetails"] = f'{{"advancedCron":"{req.startProcessCron}"}}'
    current["TimeZoneId"] = req.timeZoneId
    current["Enabled"] = req.enabled
    current = _clean_schedule_for_put(current)
    result = await uipath_put(orch, f"ProcessSchedules({req.triggerId})", current)
    clear_cache()
    return result


class DeleteTriggerRequest(BaseModel):
    orchestratorId: str
    triggerId: int


@app.post("/api/triggers/delete")
async def delete_trigger(req: DeleteTriggerRequest, _user: dict = Depends(require_operator)):
    """Exclui um gatilho (ProcessSchedule) do UiPath."""
    orch = _find_orchestrator(req.orchestratorId, user=_user)
    result = await uipath_delete(orch, f"ProcessSchedules({req.triggerId})")
    clear_cache()
    return result


# ─── Archived Processes ───────────────────────────────────


@app.get("/api/archived-processes")
async def get_archived_processes(_user: dict = Depends(require_viewer)):
    db = SessionLocal()
    try:
        rows = db.query(ArchivedProcess).all()
        return {"value": [r.process_key for r in rows]}
    finally:
        db.close()


class ToggleArchiveRequest(BaseModel):
    processKey: str


@app.post("/api/archived-processes/toggle")
async def toggle_archived_process(req: ToggleArchiveRequest, _user: dict = Depends(require_operator)):
    db = SessionLocal()
    try:
        existing = db.query(ArchivedProcess).filter_by(process_key=req.processKey).first()
        if existing:
            db.delete(existing)
        else:
            db.add(ArchivedProcess(process_key=req.processKey))
        db.commit()
        rows = db.query(ArchivedProcess).all()
        return {"value": [r.process_key for r in rows]}
    finally:
        db.close()


# ─── Settings ─────────────────────────────────────────────


def _load_settings() -> dict:
    db = SessionLocal()
    try:
        rows = db.query(Setting).all()
        if not rows:
            return {"pollingInterval": 30}
        result = {}
        for r in rows:
            try:
                result[r.key] = int(r.value)
            except ValueError:
                result[r.key] = r.value
        return result
    finally:
        db.close()


def _save_settings(settings: dict):
    db = SessionLocal()
    try:
        for key, value in settings.items():
            existing = db.query(Setting).filter_by(key=key).first()
            if existing:
                existing.value = str(value)
            else:
                db.add(Setting(key=key, value=str(value)))
        db.commit()
    finally:
        db.close()


@app.get("/api/settings")
async def get_settings(_user: dict = Depends(require_viewer)):
    return _load_settings()


class SettingsModel(BaseModel):
    pollingInterval: int = 30


@app.post("/api/settings")
async def save_settings(settings: SettingsModel, _user: dict = Depends(require_admin)):
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
async def list_orchestrators(_user: dict = Depends(require_viewer)):
    """Lista orchestrators do usuário (admin vê todos)."""
    orchestrators = load_orchestrators(user=_user)
    return [
        {
            **orch,
            "clientSecret": "••••••••" if orch.get("clientSecret") else "",
            "hasCredentials": bool(orch.get("clientId") and orch.get("clientSecret")),
        }
        for orch in orchestrators
    ]


@app.post("/api/orchestrators")
async def save_all_orchestrators(orchestrators: list[OrchestratorModel], _user: dict = Depends(require_operator)):
    """Salva orchestrators do usuário."""
    owner_id = _user["sub"]
    # Se o secret veio mascarado, mantém o valor antigo
    existing = {o["id"]: o for o in load_orchestrators(user=_user)}
    to_save = []
    for o in orchestrators:
        data = o.model_dump()
        if data["clientSecret"] == "••••••••" and data["id"] in existing:
            data["clientSecret"] = existing[data["id"]].get("clientSecret", "")
        to_save.append(data)

    save_orchestrators(to_save, owner_id=owner_id)
    return {"status": "ok", "count": len(to_save)}


@app.post("/api/orchestrators/test")
async def test_orchestrator(orch: OrchestratorModel, _user: dict = Depends(require_operator)):
    """Testa a conexão com um orchestrator específico."""
    # Se o secret veio mascarado, usa o salvo
    secret = orch.clientSecret
    if secret == "••••••••":
        existing = {o["id"]: o for o in load_orchestrators(user=_user)}
        if orch.id in existing:
            secret = existing[orch.id].get("clientSecret", "")

    orch_dict = orch.model_dump()
    orch_dict["clientSecret"] = secret

    try:
        data = await uipath_get(orch_dict, "RobotLogs", {"$top": 1, "$count": "true"})
        return {"status": "ok", "connected": True, "logCount": data.get("@odata.count", 0)}
    except Exception as e:
        return {"status": "error", "connected": False, "detail": str(e)}


# ─── Users CRUD (admin only) ─────────────────────────────

class CreateUserRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "viewer"


class UpdateUserRequest(BaseModel):
    name: str
    email: str
    role: str


@app.get("/api/users")
async def list_users(_user: dict = Depends(require_admin)):
    from models import User
    db = SessionLocal()
    try:
        users = db.query(User).all()
        return [
            {"id": u.id, "name": u.name, "email": u.email, "role": u.role, "active": u.active, "createdAt": str(u.created_at)}
            for u in users
        ]
    finally:
        db.close()


@app.post("/api/users")
async def create_user(req: CreateUserRequest, _user: dict = Depends(require_admin)):
    from models import User
    if req.role not in ("admin", "operator", "viewer"):
        raise HTTPException(status_code=400, detail="Role inválida")
    db = SessionLocal()
    try:
        if db.query(User).filter_by(email=req.email).first():
            raise HTTPException(status_code=400, detail="E-mail já cadastrado")
        user = User(
            id=generate_user_id(),
            name=req.name,
            email=req.email,
            password_hash=hash_password(req.password),
            role=req.role,
        )
        db.add(user)
        db.commit()
        return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}
    finally:
        db.close()


@app.put("/api/users/{user_id}")
async def update_user(user_id: str, req: UpdateUserRequest, current_user: dict = Depends(require_admin)):
    from models import User
    if req.role not in ("admin", "operator", "viewer"):
        raise HTTPException(status_code=400, detail="Role inválida")
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        # Não permite remover admin se for o último
        if user.role == "admin" and req.role != "admin":
            admin_count = db.query(User).filter_by(role="admin").count()
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="Não é possível remover o último administrador")
        # Verifica email duplicado
        existing = db.query(User).filter_by(email=req.email).first()
        if existing and existing.id != user_id:
            raise HTTPException(status_code=400, detail="E-mail já cadastrado")
        user.name = req.name
        user.email = req.email
        user.role = req.role
        db.commit()
        return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}
    finally:
        db.close()


@app.delete("/api/users/{user_id}")
async def deactivate_user(user_id: str, current_user: dict = Depends(require_admin)):
    """Inativa um usuário (não exclui do banco)."""
    from models import User
    if current_user["sub"] == user_id:
        raise HTTPException(status_code=400, detail="Não é possível inativar seu próprio usuário")
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        if user.role == "admin":
            admin_count = db.query(User).filter_by(role="admin", active=True).count()
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="Não é possível inativar o último administrador ativo")
        # Transfere orchestrators para quem está inativando
        from models import Orchestrator as OrchestratorModel_
        transferred = db.query(OrchestratorModel_).filter_by(owner_id=user_id).update(
            {"owner_id": current_user["sub"]}
        )
        # Remove compartilhamentos
        from models import SharedOrchestrator
        db.query(SharedOrchestrator).filter_by(user_id=user_id).delete()
        user.active = False
        db.commit()
        return {"status": "ok", "transferred": transferred}
    finally:
        db.close()


@app.post("/api/users/{user_id}/reactivate")
async def reactivate_user(user_id: str, _user: dict = Depends(require_admin)):
    """Reativa um usuário inativo."""
    from models import User
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        user.active = True
        db.commit()
        return {"status": "ok"}
    finally:
        db.close()


# ─── Shared Orchestrators (admin) ─────────────────────────

@app.get("/api/users/{user_id}/orchestrators")
async def get_user_orchestrators(user_id: str, _user: dict = Depends(require_admin)):
    """Retorna IDs dos orchestrators compartilhados com um usuário."""
    shared_ids = get_shared_orchestrators(user_id)
    all_orchs = load_orchestrators()  # admin vê todos
    return {
        "shared": shared_ids,
        "available": [{"id": o["id"], "name": o["name"], "ownerId": o.get("ownerId")} for o in all_orchs],
    }


class ShareOrchestratorsRequest(BaseModel):
    orchestratorIds: list[str]


@app.post("/api/users/{user_id}/orchestrators")
async def set_user_orchestrators(user_id: str, req: ShareOrchestratorsRequest, _user: dict = Depends(require_admin)):
    """Define quais orchestrators são compartilhados com um usuário."""
    set_shared_orchestrators(user_id, req.orchestratorIds)
    return {"status": "ok"}


# ─── Change Password ─────────────────────────────────────

class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str


@app.post("/api/auth/change-password")
async def change_password(req: ChangePasswordRequest, current_user: dict = Depends(require_viewer)):
    from models import User
    if len(req.newPassword) < 6:
        raise HTTPException(status_code=400, detail="A nova senha deve ter pelo menos 6 caracteres")
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(id=current_user["sub"]).first()
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        if not verify_password(req.currentPassword, user.password_hash):
            raise HTTPException(status_code=400, detail="Senha atual incorreta")
        user.password_hash = hash_password(req.newPassword)
        db.commit()
        return {"status": "ok"}
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=3001, reload=True)
