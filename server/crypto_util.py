"""Criptografia dos Client Secrets dos orchestrators (em repouso, no Postgres).

- Chave: derivada de `SECRET_ENCRYPTION_KEY` (se definida) ou, por padrão, do `JWT_SECRET`
  (que já é obrigatório e >= 32 chars). Assim NÃO exige nova variável de ambiente —
  nada para de funcionar em quem já roda o portal.
- Formato: valores encriptados ganham o prefixo `enc:`. Valores sem o prefixo são tratados
  como texto puro (legado) e devolvidos como estão — a migração é transparente.
- Falha ao descriptografar (ex.: chave trocada) devolve "" em vez de quebrar: o orchestrator
  afetado aparece como "sem credenciais", mas o portal continua no ar.
"""
import os
import base64
import hashlib
import logging

from cryptography.fernet import Fernet

_PREFIX = "enc:"
_fernet = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key_source = os.getenv("SECRET_ENCRYPTION_KEY") or os.getenv("JWT_SECRET", "")
        # SHA-256 do segredo → 32 bytes → base64 url-safe = chave Fernet válida
        digest = hashlib.sha256(key_source.encode()).digest()
        _fernet = Fernet(base64.urlsafe_b64encode(digest))
    return _fernet


def encrypt_secret(plaintext):
    """Texto puro → 'enc:<token>'. Não encripta vazio/None nem valor já encriptado."""
    if not plaintext or not isinstance(plaintext, str):
        return plaintext
    if plaintext.startswith(_PREFIX):
        return plaintext
    token = _get_fernet().encrypt(plaintext.encode()).decode()
    return _PREFIX + token


def decrypt_secret(stored):
    """'enc:<token>' → texto puro. Legado (sem prefixo) ou vazio → devolve como está."""
    if not stored or not isinstance(stored, str) or not stored.startswith(_PREFIX):
        return stored
    try:
        return _get_fernet().decrypt(stored[len(_PREFIX):].encode()).decode()
    except Exception:
        logging.warning("Falha ao descriptografar um client secret (a chave de criptografia mudou?).")
        return ""


def encrypt_existing_secrets():
    """Migração idempotente: encripta secrets que ainda estão em texto puro no banco."""
    from database import SessionLocal
    from models import Orchestrator
    db = SessionLocal()
    try:
        changed = 0
        for r in db.query(Orchestrator).all():
            val = r.client_secret
            if val and not val.startswith(_PREFIX):
                r.client_secret = encrypt_secret(val)
                changed += 1
        if changed:
            db.commit()
        print(f"  Client secrets criptografados: {changed} orchestrator(s) migrados")
    finally:
        db.close()
