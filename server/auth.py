import os
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import HTTPException, Request

JWT_SECRET = os.getenv("JWT_SECRET", "robocommand-dev-only-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token não fornecido")
    token = auth_header.split(" ", 1)[1]
    return decode_token(token)


def require_role(*allowed_roles):
    """Dependency factory: exige que o usuário tenha uma das roles permitidas."""
    def dependency(request: Request):
        user = get_current_user(request)
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Permissão insuficiente")
        return user
    return dependency


# Atalhos para uso com Depends()
require_admin = require_role("admin")
require_operator = require_role("admin", "operator")
require_viewer = require_role("admin", "operator", "viewer")


def generate_user_id() -> str:
    return str(uuid.uuid4())


def create_default_admin(db):
    """Cria o usuário admin padrão se não existir nenhum usuário."""
    from models import User

    if db.query(User).count() > 0:
        return

    admin = User(
        id=generate_user_id(),
        name="Administrador",
        email="admin@robocommand.com",
        password_hash=hash_password("admin123"),
        role="admin",
    )
    db.add(admin)
    db.commit()
    print("  Usuario admin criado: admin@robocommand.com / admin123")
