#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMP_DIR="${ROOT_DIR}/supabase/.temp"
PID_FILE="${TEMP_DIR}/functions-serve.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No PID file found at ${PID_FILE#$ROOT_DIR/}. Supabase functions serve may not be running."
  exit 0
fi

pid="$(cat "$PID_FILE")"
if [[ -z "$pid" || ! "$pid" =~ ^[0-9]+$ ]]; then
  echo "PID file ${PID_FILE#$ROOT_DIR/} is invalid. Deleting stale file."
  rm -f "$PID_FILE"
  exit 1
fi

if ! ps -p "$pid" >/dev/null 2>&1; then
  echo "Process ${pid} is not running. Removing stale PID file."
  rm -f "$PID_FILE"
  exit 0
fi

echo "Stopping Supabase edge functions (PID ${pid})..."
kill "$pid"

# Give the process a moment to exit cleanly.
for _ in {1..10}; do
  if ! ps -p "$pid" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ps -p "$pid" >/dev/null 2>&1; then
  echo "Process ${pid} did not exit after initial signal. Sending SIGKILL."
  kill -9 "$pid" || true
fi

rm -f "$PID_FILE"
echo "Supabase edge functions stopped."
