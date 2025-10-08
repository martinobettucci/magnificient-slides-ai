#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: scripts/supabase-db-diff.sh [supabase db diff options]

Generates a migration by diffing the local database against the remote shadow database.
Provide any arguments you would normally pass to `supabase db diff`.
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

"${SCRIPT_DIR}/supabase-cli.sh" db diff "$@"
