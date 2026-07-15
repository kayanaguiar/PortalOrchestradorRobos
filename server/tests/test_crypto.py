"""Testes da criptografia de client secrets (crypto_util)."""
import crypto_util


def test_round_trip():
    enc = crypto_util.encrypt_secret("meu-segredo-123")
    assert enc.startswith("enc:")
    assert enc != "meu-segredo-123"
    assert crypto_util.decrypt_secret(enc) == "meu-segredo-123"


def test_legacy_plaintext_passthrough():
    # valor sem prefixo (legado, texto puro no banco) → devolve como está
    assert crypto_util.decrypt_secret("texto-puro-legado") == "texto-puro-legado"


def test_empty_values():
    assert crypto_util.encrypt_secret("") == ""
    assert crypto_util.encrypt_secret(None) is None
    assert crypto_util.decrypt_secret("") == ""
    assert crypto_util.decrypt_secret(None) is None


def test_not_double_encrypted():
    enc = crypto_util.encrypt_secret("s")
    assert crypto_util.encrypt_secret(enc) == enc  # idempotente


def test_decrypt_garbage_returns_empty():
    # 'enc:' com token inválido (ex.: chave trocada) → não quebra, devolve ""
    assert crypto_util.decrypt_secret("enc:token-invalido") == ""
