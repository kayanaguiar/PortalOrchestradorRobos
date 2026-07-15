from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from database import Base
from crypto_util import encrypt_secret, decrypt_secret


class Orchestrator(Base):
    __tablename__ = "orchestrators"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    base_url = Column(String, nullable=False)
    folder_id = Column(String, nullable=False)
    client_id = Column(String, nullable=False)
    client_secret = Column(String, nullable=False)
    status = Column(String, default="unknown")
    owner_id = Column(String, ForeignKey("users.id"), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "baseUrl": self.base_url,
            "folderId": self.folder_id,
            "clientId": self.client_id,
            "clientSecret": decrypt_secret(self.client_secret),
            "status": self.status,
            "ownerId": self.owner_id,
        }

    @staticmethod
    def from_dict(data: dict):
        return Orchestrator(
            id=data["id"],
            name=data["name"],
            base_url=data["baseUrl"],
            folder_id=data["folderId"],
            client_id=data["clientId"],
            client_secret=encrypt_secret(data["clientSecret"]),
            status=data.get("status", "unknown"),
            owner_id=data.get("ownerId"),
        )


class SharedOrchestrator(Base):
    __tablename__ = "shared_orchestrators"

    orchestrator_id = Column(String, ForeignKey("orchestrators.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)


class ArchivedProcess(Base):
    __tablename__ = "archived_processes"

    process_key = Column(String, primary_key=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    user_name = Column(String, nullable=False)
    action = Column(String, nullable=False)  # start, stop, kill, restart, update
    robot_name = Column(String, nullable=False)
    orchestrator_id = Column(String, nullable=True)
    orchestrator_name = Column(String, nullable=True)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class RobotLog(Base):
    """Logs do UiPath arquivados localmente (ingeridos pelo log_collector).
    `id` é o Id do log no UiPath — garante idempotência na ingestão."""
    __tablename__ = "robot_logs"

    id = Column(String, primary_key=True)
    orchestrator_id = Column(String, index=True)
    process_name = Column(String, index=True)
    robot_name = Column(String)
    job_key = Column(String, index=True)
    level = Column(String)
    message = Column(Text)
    timestamp = Column(DateTime, index=True)
    raw = Column(JSONB)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_robot_logs_process_timestamp", "process_name", "timestamp"),
    )


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="viewer")  # admin, operator, viewer
    active = Column(Boolean, default=True, server_default="true")
    created_at = Column(DateTime, server_default=func.now())
