#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPABASE_CLI="${SCRIPT_DIR}/supabase-cli.sh"

usage() {
  cat <<'EOF'
Usage: scripts/supabase-stop.sh [supabase stop options]

Stops the local Supabase stack using the Supabase CLI. Any additional arguments
are passed directly to `supabase stop`.

Examples:
  scripts/supabase-stop.sh
  scripts/supabase-stop.sh --sigterm
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

if [[ ! -x "${SUPABASE_CLI}" ]]; then
  echo "Supabase wrapper not found at ${SUPABASE_CLI}." >&2
  exit 1
fi

echo "Stopping local Supabase stack..." >&2
"${SUPABASE_CLI}" stop "$@"
