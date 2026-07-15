#!/bin/bash
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Seeding data from JSON files (if any)..."
python seed.py

echo "Encrypting existing client secrets (if any)..."
python -c "from crypto_util import encrypt_existing_secrets; encrypt_existing_secrets()"

echo "Starting server..."
exec uvicorn app:app --host 0.0.0.0 --port 3001
