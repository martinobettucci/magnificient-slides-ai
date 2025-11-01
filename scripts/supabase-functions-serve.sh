#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMP_DIR="${ROOT_DIR}/supabase/.temp"
PID_FILE="${TEMP_DIR}/functions-serve.pid"
LOG_FILE="${TEMP_DIR}/functions-serve.log"

usage() {
  cat <<'EOF'
Usage: scripts/supabase-functions-serve.sh [supabase functions serve options]

Serves Supabase edge functions locally. Defaults to using
`supabase/.env` for environment variables if the file exists
and no explicit `--env-file` is provided.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

args=(functions serve)

mkdir -p "$TEMP_DIR"

if [[ -f "$PID_FILE" ]]; then
  existing_pid="$(cat "$PID_FILE")"
  if [[ -n "$existing_pid" && "$existing_pid" =~ ^[0-9]+$ ]] && ps -p "$existing_pid" >/dev/null 2>&1; then
    echo "Supabase functions serve appears to be running already (PID ${existing_pid})."
    echo "Use scripts/supabase-functions-stop.sh to stop it, or remove ${PID_FILE} if it is stale."
    exit 0
  fi
  rm -f "$PID_FILE"
fi

env_flag_provided=false
for arg in "$@"; do
  if [[ "$arg" == "--env-file" ]]; then
    env_flag_provided=true
    break
  fi
done

if ! $env_flag_provided && [[ -f "${ROOT_DIR}/supabase/.env" ]]; then
  args+=(--env-file "supabase/.env")
fi

args+=("$@")

echo "Starting Supabase edge functions in background..."
nohup "${SCRIPT_DIR}/supabase-cli.sh" "${args[@]}" >"$LOG_FILE" 2>&1 &
pid=$!
echo "$pid" > "$PID_FILE"
echo "PID ${pid} recorded in ${PID_FILE#$ROOT_DIR/}."
echo "Logs streaming to ${LOG_FILE#$ROOT_DIR/}. Tail with: tail -f ${LOG_FILE#$ROOT_DIR/}"
echo "Stop the server with: scripts/supabase-functions-stop.sh"
