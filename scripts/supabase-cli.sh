#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [[ -z "${SUPABASE_USE_SYSTEM_NODE:-}" && -s "${NVM_DIR}/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "${NVM_DIR}/nvm.sh"
  nvm use --silent >/dev/null || true
fi

SUPABASE_BIN="${ROOT_DIR}/node_modules/.bin/supabase"

if [[ ! -x "${SUPABASE_BIN}" ]]; then
  cat >&2 <<EOF
Supabase CLI not found at ${SUPABASE_BIN}.
Run 'npm install' to install project dependencies (including the Supabase CLI).
EOF
  exit 1
fi

exec "${SUPABASE_BIN}" "$@"
