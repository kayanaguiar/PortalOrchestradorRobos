"""Testes de API (TestClient) mockando o UiPath e o banco.

Cobrem o healthcheck público e a agregação cross-folder de /api/queues, incluindo o
relatório de orchestrators que falharam (distinguir 'vazio' de 'sem permissão') e a
montagem do $filter de transações (status + busca por referência)."""
import pytest
from fastapi.testclient import TestClient

import app as app_module
from app import app, require_viewer
from cache import clear_cache

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean():
    clear_cache()
    yield
    clear_cache()
    app.dependency_overrides.clear()


@pytest.fixture
def as_user():
    app.dependency_overrides[require_viewer] = lambda: {"sub": "u1", "email": "t@t", "role": "admin"}
    yield


def test_ping_is_public():
    r = client.get("/api/ping")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_queues_requires_auth():
    # sem override de auth e sem token → 401
    r = client.get("/api/queues")
    assert r.status_code == 401


def test_queues_cross_folder_and_failed(monkeypatch, as_user):
    orchs = [
        {"id": "A", "name": "Orch A", "clientId": "c", "clientSecret": "s", "folderId": "1", "baseUrl": "x"},
        {"id": "B", "name": "Orch B", "clientId": "c", "clientSecret": "s", "folderId": "1", "baseUrl": "x"},
    ]
    monkeypatch.setattr(app_module, "load_orchestrators", lambda user=None: orchs)

    async def fake_uipath_get(orch, endpoint, params=None, folder_id=None):
        if endpoint == "Folders":
            return {"value": [{"Id": "F1", "FullyQualifiedName": "Shared"}]}
        if endpoint == "QueueDefinitions":
            if orch["id"] == "A":
                return {"value": [{"Id": 10, "Name": "Q1"}]}
            raise Exception("403 sem permissão")  # B não tem o scope
        return {"value": []}

    monkeypatch.setattr(app_module, "uipath_get", fake_uipath_get)

    r = client.get("/api/queues")
    assert r.status_code == 200
    data = r.json()

    # A fila do orchestrator A veio, marcada com orchestrator e folder
    q1 = next(q for q in data["value"] if q["Name"] == "Q1")
    assert q1["_orchestratorId"] == "A"
    assert q1["_folderName"] == "Shared"

    # B entrou em "failed" (tem credencial mas não respondeu)
    assert {"id": "B", "name": "Orch B"} in data["failed"]


def test_queue_items_builds_filter(monkeypatch, as_user):
    orch = {"id": "A", "name": "Orch A", "clientId": "c", "clientSecret": "s", "folderId": "1", "baseUrl": "x"}
    monkeypatch.setattr(app_module, "load_orchestrators", lambda user=None: [orch])
    captured = {}

    async def fake_uipath_get(o, endpoint, params=None, folder_id=None):
        captured["endpoint"] = endpoint
        captured["params"] = params
        captured["folder_id"] = folder_id
        return {"value": [], "@odata.count": 0}

    monkeypatch.setattr(app_module, "uipath_get", fake_uipath_get)

    r = client.get("/api/queues/10/items", params={
        "orchestrator_id": "A", "folder_id": "F1", "status": "Failed",
        "reference": "99430", "$top": 25, "$skip": 25,
    })
    assert r.status_code == 200
    flt = captured["params"]["$filter"]
    assert "QueueDefinitionId eq 10" in flt
    assert "Status eq 'Failed'" in flt
    assert "contains(Reference,'99430')" in flt
    assert captured["params"]["$skip"] == 25
    assert captured["params"]["$orderby"] == "Id desc"  # workaround: não usa CreationTime
    assert captured["folder_id"] == "F1"
