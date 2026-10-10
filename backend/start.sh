#!/bin/sh
set -e

echo "==> Running database migrations..."
alembic upgrade head

echo "==> Seeding initial platform data (admin user & plans)..."
python scripts/seed.py || echo "Warning: Seed script encountered an issue, continuing startup..."

if [ "${RUN_WORKER:-true}" = "true" ]; then
    echo "==> Starting email background worker..."
    python -m worker.main &
fi

echo "==> Starting FastAPI application on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
