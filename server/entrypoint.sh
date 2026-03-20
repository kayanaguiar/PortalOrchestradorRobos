#!/bin/bash
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Seeding data from JSON files (if any)..."
python seed.py

echo "Starting server..."
exec uvicorn app:app --host 0.0.0.0 --port 3001
