#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_PID=""
CLEANED_UP=false

cleanup() {
  if [[ "$CLEANED_UP" == "true" ]]; then
    return
  fi
  CLEANED_UP=true

  if [[ -n "$WEB_PID" ]] && ps -p "$WEB_PID" >/dev/null 2>&1; then
    echo "Stopping webapp (PID ${WEB_PID})..."
    kill "$WEB_PID" 2>/dev/null || true
    for _ in {1..10}; do
      if ! ps -p "$WEB_PID" >/dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done
    if ps -p "$WEB_PID" >/dev/null 2>&1; then
      echo "Webapp did not exit after initial signal. Sending SIGKILL."
      kill -9 "$WEB_PID" 2>/dev/null || true
    fi
  fi

  echo "Stopping Supabase edge functions..."
  (cd "$ROOT_DIR" && npm run supabase:functions:stop) || true

  echo "Stopping Supabase..."
  (cd "$ROOT_DIR" && npm run supabase:stop) || true
}

trap cleanup INT TERM EXIT

cd "$ROOT_DIR"

echo "Starting Supabase..."
npm run supabase:start

echo "Starting Supabase edge functions..."
npm run supabase:functions:serve

echo "Starting webapp..."
npm run dev &
WEB_PID=$!

echo "All services running. Press Ctrl+C to stop."
wait "$WEB_PID"
