#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: scripts/supabase-db-reset.sh [supabase db reset options]

Drops and recreates the local database, then reapplies all migrations.
Adds `--force` automatically unless you provide it yourself.
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

force_supplied=false
for arg in "$@"; do
  if [[ "$arg" == "--force" ]]; then
    force_supplied=true
    break
  fi
done

if ! $force_supplied; then
  set -- --force "$@"
fi

"${SCRIPT_DIR}/supabase-cli.sh" db reset "$@"
