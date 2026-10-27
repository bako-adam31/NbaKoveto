#!/usr/bin/env sh
set -eu

# Hosting platforms provide PORT. Bind publicly there; local development keeps
# using `npm run dev`, which binds the API to 127.0.0.1:8000.
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
export HOST PORT

exec uvicorn src.main:app --host "$HOST" --port "$PORT"
