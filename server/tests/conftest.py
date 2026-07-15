"""Configuração dos testes.

Precisa rodar ANTES de importar `app`/`auth`, porque `auth.py` valida o JWT_SECRET
no import (com sys.exit se inválido). Também aponta o DATABASE_URL pra um SQLite
inofensivo — os testes mockam todo acesso a banco/UiPath, então nada é consultado
de verdade, mas isso evita qualquer tentativa acidental de conectar no Postgres.
"""
import os

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-com-mais-de-32-caracteres-ok-123456")
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
