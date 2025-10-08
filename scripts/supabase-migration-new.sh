#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: scripts/supabase-migration-new.sh <name> [options]

Creates a new migration under `supabase/migrations`.
This wraps `supabase migration new`.
EOF
}

if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi

"${SCRIPT_DIR}/supabase-cli.sh" migration new "$@"
