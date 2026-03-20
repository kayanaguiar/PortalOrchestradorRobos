from sqlalchemy import or_
from database import SessionLocal
from models import Orchestrator, SharedOrchestrator


def load_orchestrators(user=None) -> list[dict]:
    """Carrega orchestrators. Admin vê todos, outros veem apenas os seus + compartilhados."""
    db = SessionLocal()
    try:
        if not user or user.get("role") == "admin":
            rows = db.query(Orchestrator).all()
        else:
            user_id = user["sub"]
            shared_ids = [
                s.orchestrator_id
                for s in db.query(SharedOrchestrator).filter_by(user_id=user_id).all()
            ]
            rows = db.query(Orchestrator).filter(
                or_(
                    Orchestrator.owner_id == user_id,
                    Orchestrator.id.in_(shared_ids) if shared_ids else False,
                )
            ).all()
        return [r.to_dict() for r in rows]
    finally:
        db.close()


def save_orchestrators(orchestrators: list[dict], owner_id: str = None):
    """Salva orchestrators de um usuário específico."""
    db = SessionLocal()
    try:
        if owner_id:
            # Deleta apenas os orchestrators do owner
            db.query(Orchestrator).filter_by(owner_id=owner_id).delete()
            for o in orchestrators:
                o["ownerId"] = owner_id
                db.add(Orchestrator.from_dict(o))
        else:
            # Fallback: salva tudo (usado pelo seed)
            db.query(Orchestrator).delete()
            for o in orchestrators:
                db.add(Orchestrator.from_dict(o))
        db.commit()
    finally:
        db.close()


def get_shared_orchestrators(user_id: str) -> list[str]:
    """Retorna IDs dos orchestrators compartilhados com um usuário."""
    db = SessionLocal()
    try:
        return [
            s.orchestrator_id
            for s in db.query(SharedOrchestrator).filter_by(user_id=user_id).all()
        ]
    finally:
        db.close()


def set_shared_orchestrators(user_id: str, orchestrator_ids: list[str]):
    """Define quais orchestrators são compartilhados com um usuário."""
    db = SessionLocal()
    try:
        db.query(SharedOrchestrator).filter_by(user_id=user_id).delete()
        for orch_id in orchestrator_ids:
            db.add(SharedOrchestrator(orchestrator_id=orch_id, user_id=user_id))
        db.commit()
    finally:
        db.close()
