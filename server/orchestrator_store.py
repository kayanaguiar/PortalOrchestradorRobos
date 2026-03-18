import json
import os

DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "orchestrators.json")


def load_orchestrators() -> list[dict]:
    """Carrega a lista de orchestrators do arquivo JSON."""
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_orchestrators(orchestrators: list[dict]):
    """Salva a lista de orchestrators no arquivo JSON."""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(orchestrators, f, indent=2, ensure_ascii=False)
