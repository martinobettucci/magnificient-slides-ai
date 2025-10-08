#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

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

"${SCRIPT_DIR}/supabase-cli.sh" "${args[@]}"
