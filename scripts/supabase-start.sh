#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SUPABASE_CLI="${SCRIPT_DIR}/supabase-cli.sh"

declare -A INFO=()
declare -A RAW_ENV=()
declare -a UPDATED_FILES=()

usage() {
  cat <<'EOF'
Usage: scripts/supabase-start.sh [supabase start options]

Starts the local Supabase stack using the Supabase CLI. Any additional arguments
are passed directly to `supabase start`. After the stack is running the script
extracts the reported credentials, writes them into `.env.local` (for the Vite
front-end) and `supabase/.env` (for Supabase edge functions), then prints a
clean summary of the local services.

Examples:
  scripts/supabase-start.sh
  scripts/supabase-start.sh --no-browser
EOF
}

trim() {
  local str="$1"
  str="${str#"${str%%[![:space:]]*}"}"
  str="${str%"${str##*[![:space:]]}"}"
  printf '%s' "$str"
}

collect_info_from_output() {
  local output="$1"
  while IFS= read -r line; do
    local trimmed="$(trim "$line")"
    [[ -z "$trimmed" ]] && continue
    case "$trimmed" in
      API\ URL:*)
        INFO[api_url]="$(trim "${trimmed#API URL:}")"
        ;;
      GraphQL\ URL:*)
        INFO[graphql_url]="$(trim "${trimmed#GraphQL URL:}")"
        ;;
      S3\ Storage\ URL:*)
        INFO[s3_storage_url]="$(trim "${trimmed#S3 Storage URL:}")"
        ;;
      MCP\ URL:*)
        INFO[mcp_url]="$(trim "${trimmed#MCP URL:}")"
        ;;
      Database\ URL:*)
        INFO[database_url]="$(trim "${trimmed#Database URL:}")"
        ;;
      Studio\ URL:*)
        INFO[studio_url]="$(trim "${trimmed#Studio URL:}")"
        ;;
      Mailpit\ URL:*)
        INFO[mailpit_url]="$(trim "${trimmed#Mailpit URL:}")"
        ;;
      Publishable\ key:*)
        INFO[publishable_key]="$(trim "${trimmed#Publishable key:}")"
        ;;
      Secret\ key:*)
        INFO[secret_key]="$(trim "${trimmed#Secret key:}")"
        ;;
      S3\ Access\ Key:*)
        INFO[s3_access_key]="$(trim "${trimmed#S3 Access Key:}")"
        ;;
      S3\ Secret\ Key:*)
        INFO[s3_secret_key]="$(trim "${trimmed#S3 Secret Key:}")"
        ;;
      S3\ Region:*)
        INFO[s3_region]="$(trim "${trimmed#S3 Region:}")"
        ;;
    esac
  done <<< "$output"
}

collect_env_map() {
  local file="$1"
  [[ -f "$file" ]] || return
  while IFS= read -r line || [[ -n "$line" ]]; do
    local cleaned="${line%%$'\r'}"
    cleaned="$(trim "$cleaned")"
    [[ -z "$cleaned" || "${cleaned:0:1}" == "#" ]] && continue
    if [[ "$cleaned" == export* ]]; then
      cleaned="${cleaned#export }"
      cleaned="$(trim "$cleaned")"
    fi
    if [[ "$cleaned" =~ ^([A-Za-z0-9_]+)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local value="${BASH_REMATCH[2]}"
      if [[ ${value:0:1} == \" && ${value: -1} == \" ]]; then
        value="${value:1:-1}"
      elif [[ ${value:0:1} == \' && ${value: -1} == \' ]]; then
        value="${value:1:-1}"
      fi
      RAW_ENV["$key"]="$value"
    fi
  done < "$file"
}

set_info_if_missing() {
  local info_key="$1"
  shift
  [[ -n "${INFO[$info_key]:-}" ]] && return
  for candidate in "$@"; do
    if [[ -n "${RAW_ENV[$candidate]:-}" ]]; then
      INFO[$info_key]="${RAW_ENV[$candidate]}"
      return
    fi
  done
}

get_value() {
  local info_key="$1"
  shift
  local value="${INFO[$info_key]:-}"
  if [[ -z "$value" ]]; then
    for candidate in "$@"; do
      if [[ -n "${RAW_ENV[$candidate]:-}" ]]; then
        value="${RAW_ENV[$candidate]}"
        break
      fi
    done
  fi
  printf '%s' "$value"
}

update_env_file() {
  local file="$1"
  local key="$2"
  local value="$3"
  local line="${key}=${value}"
  local tmp_file
  tmp_file="$(mktemp)"

  if [[ -f "$file" ]]; then
    awk -v key="$key" -v line="$line" '
      BEGIN { updated = 0 }
      $0 ~ ("^" key "=") {
        print line
        updated = 1
        next
      }
      { print }
      END {
        if (!updated) {
          print line
        }
      }
    ' "$file" > "$tmp_file"
  else
    printf '%s\n' "$line" > "$tmp_file"
  fi

  mv "$tmp_file" "$file"
}

mark_file_updated() {
  local file="$1"
  for existing in "${UPDATED_FILES[@]:-}"; do
    if [[ "$existing" == "$file" ]]; then
      return
    fi
  done
  UPDATED_FILES+=("$file")
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

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run Supabase locally. Install Docker Desktop or a compatible runtime." >&2
  exit 1
fi

echo "Starting local Supabase stack..." >&2
TMP_OUTPUT="$(mktemp)"
trap 'rm -f "$TMP_OUTPUT"' EXIT

set +e
"${SUPABASE_CLI}" start "$@" | tee "$TMP_OUTPUT"
STATUS=${PIPESTATUS[0]}
set -e
START_OUTPUT="$(cat "$TMP_OUTPUT")"

if (( STATUS != 0 )); then
  exit "$STATUS"
fi

ESC=$'\033'
CLEAN_START_OUTPUT="$(printf '%s\n' "$START_OUTPUT" | sed -E -e 's/\r//g' -e "s/${ESC}\[[0-9;]*[A-Za-z]//g")"

collect_info_from_output "$CLEAN_START_OUTPUT"

SUPABASE_DOCKER_ENV="${ROOT_DIR}/.supabase/docker/.env"
if [[ -f "$SUPABASE_DOCKER_ENV" ]]; then
  collect_env_map "$SUPABASE_DOCKER_ENV"
else
  echo "Warning: ${SUPABASE_DOCKER_ENV} not found. Environment variables will rely on CLI output only." >&2
fi

set_info_if_missing "api_url" "API_URL" "SUPABASE_URL"
set_info_if_missing "graphql_url" "GRAPHQL_URL" "SUPABASE_GRAPHQL_URL"
set_info_if_missing "s3_storage_url" "S3_STORAGE_URL" "STORAGE_URL"
set_info_if_missing "mcp_url" "MCP_URL"
set_info_if_missing "database_url" "DB_URL" "SUPABASE_DB_URL"
set_info_if_missing "studio_url" "STUDIO_URL"
set_info_if_missing "mailpit_url" "MAILPIT_URL"
set_info_if_missing "publishable_key" "ANON_KEY" "SUPABASE_ANON_KEY"
set_info_if_missing "secret_key" "SERVICE_ROLE_KEY" "SUPABASE_SERVICE_ROLE_KEY"
set_info_if_missing "s3_access_key" "STORAGE_ACCESS_KEY_ID" "S3_ACCESS_KEY"
set_info_if_missing "s3_secret_key" "STORAGE_SECRET_ACCESS_KEY" "S3_SECRET_KEY"
set_info_if_missing "s3_region" "STORAGE_REGION" "S3_REGION"
set_info_if_missing "project_ref" "PROJECT_REF" "PROJECT_ID"

if [[ -z "${INFO[project_ref]:-}" && -f "${ROOT_DIR}/supabase/config.toml" ]]; then
  INFO[project_ref]="$(sed -n 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"\(.*\)".*/\1/p' "${ROOT_DIR}/supabase/config.toml" | head -n 1)"
fi
ENV_LOCAL_FILE="${ROOT_DIR}/.env.local"
if [[ ! -f "$ENV_LOCAL_FILE" && -f "${ROOT_DIR}/.env.local.example" ]]; then
  cp "${ROOT_DIR}/.env.local.example" "$ENV_LOCAL_FILE"
fi
if [[ ! -f "$ENV_LOCAL_FILE" ]]; then
  cat <<'EOF' > "$ENV_LOCAL_FILE"
# Local Supabase overrides generated by scripts/supabase-start.sh

EOF
fi

value="$(get_value "api_url" "API_URL" "SUPABASE_URL")"
if [[ -n "$value" ]]; then
  update_env_file "$ENV_LOCAL_FILE" "VITE_SUPABASE_URL" "$value"
  mark_file_updated "$ENV_LOCAL_FILE"
fi
value="$(get_value "publishable_key" "ANON_KEY" "SUPABASE_ANON_KEY")"
if [[ -n "$value" ]]; then
  update_env_file "$ENV_LOCAL_FILE" "VITE_SUPABASE_ANON_KEY" "$value"
  mark_file_updated "$ENV_LOCAL_FILE"
fi

FUNCTIONS_ENV_FILE="${ROOT_DIR}/supabase/.env"
if [[ ! -f "$FUNCTIONS_ENV_FILE" ]]; then
  cat <<'EOF' > "$FUNCTIONS_ENV_FILE"
# Supabase edge function environment (generated by scripts/supabase-start.sh)

EOF
fi

value="$(get_value "api_url" "API_URL" "SUPABASE_URL")"
if [[ -n "$value" ]]; then
  update_env_file "$FUNCTIONS_ENV_FILE" "SUPABASE_URL" "$value"
  mark_file_updated "$FUNCTIONS_ENV_FILE"
fi
value="$(get_value "publishable_key" "ANON_KEY" "SUPABASE_ANON_KEY")"
if [[ -n "$value" ]]; then
  update_env_file "$FUNCTIONS_ENV_FILE" "SUPABASE_ANON_KEY" "$value"
  mark_file_updated "$FUNCTIONS_ENV_FILE"
fi
value="$(get_value "secret_key" "SERVICE_ROLE_KEY" "SUPABASE_SERVICE_ROLE_KEY")"
if [[ -n "$value" ]]; then
  update_env_file "$FUNCTIONS_ENV_FILE" "SUPABASE_SERVICE_ROLE_KEY" "$value"
  mark_file_updated "$FUNCTIONS_ENV_FILE"
fi
value="$(get_value "database_url" "DB_URL" "SUPABASE_DB_URL")"
if [[ -n "$value" ]]; then
  update_env_file "$FUNCTIONS_ENV_FILE" "SUPABASE_DB_URL" "$value"
  mark_file_updated "$FUNCTIONS_ENV_FILE"
fi
value="$(get_value "graphql_url" "GRAPHQL_URL" "SUPABASE_GRAPHQL_URL")"
if [[ -n "$value" ]]; then
  update_env_file "$FUNCTIONS_ENV_FILE" "SUPABASE_GRAPHQL_URL" "$value"
  mark_file_updated "$FUNCTIONS_ENV_FILE"
fi
value="$(get_value "s3_storage_url" "S3_STORAGE_URL" "STORAGE_URL")"
if [[ -n "$value" ]]; then
  update_env_file "$FUNCTIONS_ENV_FILE" "SUPABASE_STORAGE_URL" "$value"
  mark_file_updated "$FUNCTIONS_ENV_FILE"
  update_env_file "$FUNCTIONS_ENV_FILE" "STORAGE_URL" "$value"
  mark_file_updated "$FUNCTIONS_ENV_FILE"
fi
value="$(get_value "project_ref" "PROJECT_REF" "PROJECT_ID")"
if [[ -n "$value" ]]; then
  update_env_file "$FUNCTIONS_ENV_FILE" "SUPABASE_PROJECT_REF" "$value"
  mark_file_updated "$FUNCTIONS_ENV_FILE"
fi
value="$(get_value "s3_access_key" "STORAGE_ACCESS_KEY_ID" "S3_ACCESS_KEY")"
if [[ -n "$value" ]]; then
  update_env_file "$FUNCTIONS_ENV_FILE" "STORAGE_ACCESS_KEY_ID" "$value"
  mark_file_updated "$FUNCTIONS_ENV_FILE"
fi
value="$(get_value "s3_secret_key" "STORAGE_SECRET_ACCESS_KEY" "S3_SECRET_KEY")"
if [[ -n "$value" ]]; then
  update_env_file "$FUNCTIONS_ENV_FILE" "STORAGE_SECRET_ACCESS_KEY" "$value"
  mark_file_updated "$FUNCTIONS_ENV_FILE"
fi
value="$(get_value "s3_region" "STORAGE_REGION" "S3_REGION")"
if [[ -n "$value" ]]; then
  update_env_file "$FUNCTIONS_ENV_FILE" "STORAGE_REGION" "$value"
  mark_file_updated "$FUNCTIONS_ENV_FILE"
fi

print_summary_line() {
  local label="$1"
  local key="$2"
  local value="${INFO[$key]:-}"
  if [[ -n "$value" ]]; then
    printf '%19s %s\n' "$label" "$value"
  fi
}

if [[ ${#INFO[@]} -gt 0 ]]; then
  echo
  print_summary_line "API URL:" "api_url"
  print_summary_line "GraphQL URL:" "graphql_url"
  print_summary_line "S3 Storage URL:" "s3_storage_url"
  print_summary_line "MCP URL:" "mcp_url"
  print_summary_line "Database URL:" "database_url"
  print_summary_line "Studio URL:" "studio_url"
  print_summary_line "Mailpit URL:" "mailpit_url"
  print_summary_line "Project ref:" "project_ref"
  print_summary_line "Publishable key:" "publishable_key"
  print_summary_line "Secret key:" "secret_key"
  print_summary_line "S3 Access Key:" "s3_access_key"
  print_summary_line "S3 Secret Key:" "s3_secret_key"
  print_summary_line "S3 Region:" "s3_region"
fi

if [[ ${#UPDATED_FILES[@]} -gt 0 ]]; then
  echo
  echo "Updated environment files:"
  for file in "${UPDATED_FILES[@]}"; do
    rel="${file#$ROOT_DIR/}"
    printf '  - %s\n' "$rel"
  done
  echo "Restart Vite or reload any running processes to pick up the new values."
fi
