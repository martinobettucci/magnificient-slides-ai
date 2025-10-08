#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: scripts/supabase-functions-deploy.sh <function> [options]

Deploys one or more Supabase edge functions.
Arguments are forwarded to `supabase functions deploy`.
EOF
}

if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi

"${SCRIPT_DIR}/supabase-cli.sh" functions deploy "$@"
