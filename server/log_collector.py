"""Coletor de logs do UiPath.

Roda em container separado (ver docker-compose). A cada POLL_INTERVAL segundos,
busca de cada orchestrator os logs gerados desde a última coleta (marca d'água
guardada em `settings`) e grava em `robot_logs`, ignorando duplicados pelo Id.
Uma vez por dia, apaga logs com mais de RETENTION_DAYS dias.

Começa do zero: no primeiro boot de cada orchestrator, a marca d'água é fixada
em "agora" — não importa histórico antigo, só coleta dali pra frente.
"""
import asyncio
import os
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert

from uipath_auth import get_token
from orchestrator_store import load_orchestrators
from database import SessionLocal
from models import RobotLog, Setting

POLL_INTERVAL = int(os.getenv("LOG_COLLECTOR_INTERVAL", "120"))
RETENTION_DAYS = int(os.getenv("LOG_RETENTION_DAYS", "180"))
PAGE_SIZE = 1000


def _iso_z(dt: datetime) -> str:
    """Formata datetime no padrão aceito pelo OData do UiPath: 2026-05-27T14:00:00.000Z"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def _parse_ts(s: str | None) -> datetime | None:
    """Converte o TimeStamp ISO do UiPath em datetime naive UTC (pra guardar no banco)."""
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    except ValueError:
        return None


def _get_watermark(db, orch_id: str) -> str | None:
    row = db.query(Setting).filter_by(key=f"log_watermark:{orch_id}").first()
    return row.value if row else None


def _set_watermark(db, orch_id: str, value: str) -> None:
    key = f"log_watermark:{orch_id}"
    row = db.query(Setting).filter_by(key=key).first()
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value))
    db.commit()


async def _fetch_logs(orch: dict, since_iso: str) -> list[dict]:
    """Busca todos os logs do orchestrator com TimeStamp > since_iso, paginando."""
    token = await get_token(orch["id"], orch["clientId"], orch["clientSecret"])
    headers = {
        "Authorization": f"Bearer {token}",
        "X-UIPATH-OrganizationUnitId": orch["folderId"],
    }
    collected: list[dict] = []
    skip = 0
    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            params = {
                "$filter": f"TimeStamp gt {since_iso}",
                "$orderby": "TimeStamp asc",
                "$top": PAGE_SIZE,
                "$skip": skip,
            }
            resp = await client.get(f"{orch['baseUrl']}/RobotLogs", params=params, headers=headers)
            resp.raise_for_status()
            batch = resp.json().get("value", [])
            collected.extend(batch)
            if len(batch) < PAGE_SIZE:
                break
            skip += PAGE_SIZE
    return collected


def _store_logs(db, orch_id: str, logs: list[dict]) -> datetime | None:
    """Insere logs (ignora duplicados pelo Id). Retorna o maior timestamp visto."""
    if not logs:
        return None

    # Deduplica pelo Id dentro do próprio lote (evita conflito no mesmo INSERT)
    by_id: dict[str, dict] = {}
    max_ts: datetime | None = None
    for log in logs:
        log_id = str(log.get("Id"))
        if not log_id or log_id == "None":
            continue
        ts = _parse_ts(log.get("TimeStamp"))
        by_id[log_id] = {
            "id": log_id,
            "orchestrator_id": orch_id,
            "process_name": log.get("ProcessName"),
            "robot_name": log.get("RobotName"),
            "job_key": log.get("JobKey"),
            "level": log.get("Level"),
            "message": log.get("Message"),
            "timestamp": ts,
            "raw": log,
        }
        if ts and (max_ts is None or ts > max_ts):
            max_ts = ts

    rows = list(by_id.values())
    # Insere em blocos pra não montar um INSERT gigante
    for i in range(0, len(rows), 500):
        chunk = rows[i:i + 500]
        stmt = pg_insert(RobotLog).values(chunk).on_conflict_do_nothing(index_elements=["id"])
        db.execute(stmt)
    db.commit()
    return max_ts


async def collect_once() -> None:
    orchestrators = load_orchestrators()
    db = SessionLocal()
    try:
        for orch in orchestrators:
            if not orch.get("clientId") or not orch.get("clientSecret"):
                continue
            wm = _get_watermark(db, orch["id"])
            if wm is None:
                # Primeiro boot deste orchestrator: começa do zero (agora).
                _set_watermark(db, orch["id"], _iso_z(datetime.now(timezone.utc)))
                print(f"[collector] {orch['name']}: marca d'água inicial fixada (coleta daqui pra frente)")
                continue
            try:
                logs = await _fetch_logs(orch, wm)
                max_ts = _store_logs(db, orch["id"], logs)
                if max_ts:
                    _set_watermark(db, orch["id"], _iso_z(max_ts))
                    print(f"[collector] {orch['name']}: {len(logs)} logs coletados")
            except Exception as e:
                print(f"[collector] erro no orchestrator {orch.get('name', orch['id'])}: {e}")
    finally:
        db.close()


def cleanup_old() -> None:
    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=RETENTION_DAYS)
        deleted = db.query(RobotLog).filter(RobotLog.timestamp < cutoff).delete()
        db.commit()
        if deleted:
            print(f"[collector] retenção: {deleted} logs com mais de {RETENTION_DAYS} dias removidos")
    finally:
        db.close()


async def main() -> None:
    print(f"[collector] iniciado — intervalo {POLL_INTERVAL}s, retenção {RETENTION_DAYS}d")
    last_cleanup = None
    while True:
        try:
            await collect_once()
        except Exception as e:
            print(f"[collector] erro no ciclo: {e}")

        today = datetime.now(timezone.utc).date()
        if last_cleanup != today:
            try:
                cleanup_old()
                last_cleanup = today
            except Exception as e:
                print(f"[collector] erro na limpeza: {e}")

        await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
