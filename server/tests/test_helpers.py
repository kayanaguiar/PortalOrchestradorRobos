"""Testes dos helpers puros do app.py (parsing de filtro/data, folder header, headers de bucket)."""
from datetime import datetime

import app


def test_parse_log_filter_full():
    f = "ProcessName eq 'MeuRobo' and TimeStamp ge 2026-07-12T00:00:00Z and TimeStamp le 2026-07-12T23:59:59Z"
    pn, df, dt = app._parse_log_filter(f)
    assert pn == "MeuRobo"
    assert df.startswith("2026-07-12T00")
    assert dt.startswith("2026-07-12T23")


def test_parse_log_filter_none():
    assert app._parse_log_filter(None) == (None, None, None)


def test_is_historical():
    assert app._is_historical("2000-01-01T00:00:00Z") is True   # passado → banco
    assert app._is_historical(None) is False                     # sem limite → ao vivo
    assert app._is_historical("2999-01-01T00:00:00Z") is False   # futuro → ao vivo


def test_job_finished_and_collected():
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    # terminou há muito tempo → coletor já arquivou → banco
    old = (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert app._job_finished_and_collected(old) is True
    # terminou agora (dentro do buffer do coletor) → ao vivo
    recent = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    assert app._job_finished_and_collected(recent) is False
    # sem fim (job rodando) → ao vivo
    assert app._job_finished_and_collected(None) is False


def test_parse_iso():
    d = app._parse_iso("2026-07-12T14:30:00.000Z")
    assert isinstance(d, datetime)
    assert d.tzinfo is None          # naive UTC
    assert (d.year, d.month, d.day) == (2026, 7, 12)
    assert app._parse_iso(None) is None
    assert app._parse_iso("nao-e-data") is None


def test_folder_header():
    orch = {"folderId": "111"}
    assert app._folder_header(orch, None) == "111"     # usa o configurado
    assert app._folder_header(orch, "222") == "222"    # override string
    assert app._folder_header(orch, 333) == "333"      # override numérico vira string


def test_access_headers_variants():
    assert app._access_headers({"Headers": {"Keys": ["x"], "Values": ["1"]}}) == {"x": "1"}
    assert app._access_headers({"Headers": [{"Name": "x", "Value": "1"}]}) == {"x": "1"}
    assert app._access_headers({"Headers": {"a": "b"}}) == {"a": "b"}
    assert app._access_headers({}) == {}
