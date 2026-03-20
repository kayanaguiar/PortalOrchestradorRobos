"""Migra dados dos arquivos JSON para o PostgreSQL."""
import json
import os
from database import SessionLocal
from models import Orchestrator, Setting, ArchivedProcess

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


def seed():
    db = SessionLocal()
    try:
        # Orchestrators
        orch_file = os.path.join(DATA_DIR, "orchestrators.json")
        if os.path.exists(orch_file):
            with open(orch_file, "r", encoding="utf-8") as f:
                orchestrators = json.load(f)
            for o in orchestrators:
                existing = db.query(Orchestrator).filter_by(id=o["id"]).first()
                if not existing:
                    db.add(Orchestrator.from_dict(o))
            print(f"  Orchestrators: {len(orchestrators)} processados")

        # Settings
        settings_file = os.path.join(DATA_DIR, "settings.json")
        if os.path.exists(settings_file):
            with open(settings_file, "r", encoding="utf-8") as f:
                settings = json.load(f)
            for key, value in settings.items():
                existing = db.query(Setting).filter_by(key=key).first()
                if existing:
                    existing.value = str(value)
                else:
                    db.add(Setting(key=key, value=str(value)))
            print(f"  Settings: {len(settings)} processados")

        # Archived Processes
        archived_file = os.path.join(DATA_DIR, "archived_processes.json")
        if os.path.exists(archived_file):
            with open(archived_file, "r", encoding="utf-8") as f:
                archived = json.load(f)
            for pk in archived:
                existing = db.query(ArchivedProcess).filter_by(process_key=pk).first()
                if not existing:
                    db.add(ArchivedProcess(process_key=pk))
            print(f"  Archived Processes: {len(archived)} processados")

        db.commit()

        # Default admin user
        from auth import create_default_admin
        create_default_admin(db)

        # Assign orphan orchestrators to admin
        from models import User
        admin = db.query(User).filter_by(role="admin").first()
        if admin:
            orphans = db.query(Orchestrator).filter(Orchestrator.owner_id == None).all()
            for o in orphans:
                o.owner_id = admin.id
            if orphans:
                db.commit()
                print(f"  {len(orphans)} orchestrators atribuidos ao admin")

        print("Seed concluído!")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
