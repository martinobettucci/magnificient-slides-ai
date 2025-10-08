#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/dist"
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "${NVM_DIR}/nvm.sh"
  nvm use --silent >/dev/null
fi

usage() {
  cat <<'EOF'
Usage: scripts/deploy-netlify.sh [--draft]

Builds the project and deploys it to Netlify using the Netlify CLI.

Options:
  --draft   Deploy to a draft URL instead of production. Equivalent to running
            "netlify deploy --dir dist".

Environment:
  NETLIFY_AUTH_TOKEN  Required when running in CI or when not already logged in
                      via "netlify login".
  NETLIFY_SITE_ID     Optional. Use to target a specific site without prompts.
EOF
}

deploy_target="prod"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --draft)
      deploy_target="draft"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "${ROOT_DIR}/netlify.toml" ]]; then
  echo "netlify.toml not found. Run this script from inside the repository." >&2
  exit 1
fi

if ! command -v netlify >/dev/null 2>&1; then
  echo "Netlify CLI (netlify) not found. Install it first, e.g.:" >&2
  echo "  npm install -g netlify-cli" >&2
  exit 1
fi

if [[ "${deploy_target}" == "prod" ]]; then
  deploy_command=(netlify deploy --prod --dir "${BUILD_DIR}")
else
  deploy_command=(netlify deploy --dir "${BUILD_DIR}")
fi

if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
  echo "Installing dependencies (node_modules missing)..." >&2
  npm install --prefix "${ROOT_DIR}"
fi

echo "Running production build..." >&2
npm run --prefix "${ROOT_DIR}" build

if [[ ! -d "${BUILD_DIR}" ]]; then
  echo "Build directory ${BUILD_DIR} not found after build." >&2
  exit 1
fi

echo "Deploying to Netlify (${deploy_target})..." >&2
"${deploy_command[@]}"

echo "Deployment command completed." >&2
