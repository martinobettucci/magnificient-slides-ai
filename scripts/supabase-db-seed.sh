#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: scripts/supabase-db-seed.sh [supabase db seed options]

Runs the seed scripts configured for your Supabase project.
Arguments are forwarded to `supabase db seed`.
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

"${SCRIPT_DIR}/supabase-cli.sh" db seed "$@"
