#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: scripts/supabase-db-push.sh [supabase db push options]

Applies pending migrations to the linked Supabase database.
Additional arguments are forwarded to `supabase db push`.
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

"${SCRIPT_DIR}/supabase-cli.sh" db push "$@"
