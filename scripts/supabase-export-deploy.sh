#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"
DEPLOY_ENV="${DEPLOY_DIR}/.env"
DEPLOY_COMPOSE="${DEPLOY_DIR}/docker-compose.yml"
DEPLOY_VOLUMES_DIR="${DEPLOY_DIR}/volumes"

SOURCE_FILES=(
  "${ROOT_DIR}/.supabase/docker/.env"
  "${ROOT_DIR}/supabase/.env"
  "${ROOT_DIR}/.env.local"
  "${ROOT_DIR}/.env"
)

declare -A VALUES=()

read_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return
  while IFS= read -r line || [[ -n "$line" ]]; do
    local cleaned="${line%%$'\r'}"
    cleaned="${cleaned#"${cleaned%%[![:space:]]*}"}"
    cleaned="${cleaned%"${cleaned##*[![:space:]]}"}"
    [[ -z "$cleaned" || "${cleaned:0:1}" == "#" ]] && continue
    if [[ "$cleaned" == export* ]]; then
      cleaned="${cleaned#export }"
      cleaned="${cleaned#"${cleaned%%[![:space:]]*}"}"
      cleaned="${cleaned%"${cleaned##*[![:space:]]}"}"
    fi
    if [[ "$cleaned" =~ ^([A-Za-z0-9_]+)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local value="${BASH_REMATCH[2]}"
      if [[ ${value:0:1} == \" && ${value: -1} == \" ]]; then
        value="${value:1:-1}"
      elif [[ ${value:0:1} == \' && ${value: -1} == \' ]]; then
        value="${value:1:-1}"
      fi
      VALUES["$key"]="$value"
    fi
  done < "$file"
}

for source in "${SOURCE_FILES[@]}"; do
  read_env_file "$source"
done

get_value() {
  local key="$1"
  shift
  local value=""
  if [[ -n "${VALUES[$key]:-}" ]]; then
    value="${VALUES[$key]}"
  else
    for alt in "$@"; do
      if [[ -n "${VALUES[$alt]:-}" ]]; then
        value="${VALUES[$alt]}"
        break
      fi
    done
  fi
  printf '%s' "$value"
}

value_or_default() {
  local key="$1"
  local default_value="$2"
  shift 2
  local value
  value="$(get_value "$key" "$@")"
  if [[ -z "$value" ]]; then
    value="$default_value"
  fi
  printf '%s' "$value"
}

mkdir -p "${DEPLOY_VOLUMES_DIR}"

cat > "${DEPLOY_ENV}" <<EOF
############
# Secrets
# YOU MUST CHANGE THESE BEFORE GOING INTO PRODUCTION
############

POSTGRES_PASSWORD=$(value_or_default "POSTGRES_PASSWORD" "your-super-secret-and-long-postgres-password")
JWT_SECRET=$(value_or_default "JWT_SECRET" "your-super-secret-jwt-token-with-at-least-32-characters-long")
ANON_KEY=$(value_or_default "ANON_KEY" "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE" "SUPABASE_ANON_KEY" "VITE_SUPABASE_ANON_KEY")
SERVICE_ROLE_KEY=$(value_or_default "SERVICE_ROLE_KEY" "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q" "SUPABASE_SERVICE_ROLE_KEY")
DASHBOARD_USERNAME=$(value_or_default "DASHBOARD_USERNAME" "supabase")
DASHBOARD_PASSWORD=$(value_or_default "DASHBOARD_PASSWORD" "this_password_is_insecure_and_should_be_updated")
SECRET_KEY_BASE=$(value_or_default "SECRET_KEY_BASE" "UpNVntn3cDxHJpq99YMc1T1AQgQpc8kfYTuRgBiYa15BLrx8etQoXz3gZv1/u2oq")
VAULT_ENC_KEY=$(value_or_default "VAULT_ENC_KEY" "your-encryption-key-32-chars-min")
PG_META_CRYPTO_KEY=$(value_or_default "PG_META_CRYPTO_KEY" "your-encryption-key-32-chars-min")


############
# Database - You can change these to any PostgreSQL database that has logical replication enabled.
############

POSTGRES_HOST=$(value_or_default "POSTGRES_HOST" "db")
POSTGRES_DB=$(value_or_default "POSTGRES_DB" "postgres")
POSTGRES_PORT=$(value_or_default "POSTGRES_PORT" "5432")


############
# Supavisor -- Database pooler
############
POOLER_PROXY_PORT_TRANSACTION=$(value_or_default "POOLER_PROXY_PORT_TRANSACTION" "6543")
POOLER_DEFAULT_POOL_SIZE=$(value_or_default "POOLER_DEFAULT_POOL_SIZE" "20")
POOLER_MAX_CLIENT_CONN=$(value_or_default "POOLER_MAX_CLIENT_CONN" "100")
POOLER_TENANT_ID=$(value_or_default "POOLER_TENANT_ID" "your-tenant-id")
POOLER_DB_POOL_SIZE=$(value_or_default "POOLER_DB_POOL_SIZE" "5")


############
# API Proxy - Configuration for the Kong Reverse proxy.
############

KONG_HTTP_PORT=$(value_or_default "KONG_HTTP_PORT" "8000")
KONG_HTTPS_PORT=$(value_or_default "KONG_HTTPS_PORT" "8443")


############
# API - Configuration for PostgREST.
############

PGRST_DB_SCHEMAS=$(value_or_default "PGRST_DB_SCHEMAS" "public,storage,graphql_public")


############
# Auth - Configuration for the GoTrue authentication server.
############

SITE_URL=$(value_or_default "SITE_URL" "http://localhost:3000")
ADDITIONAL_REDIRECT_URLS=$(value_or_default "ADDITIONAL_REDIRECT_URLS" "")
JWT_EXPIRY=$(value_or_default "JWT_EXPIRY" "3600")
DISABLE_SIGNUP=$(value_or_default "DISABLE_SIGNUP" "false")
API_EXTERNAL_URL=$(value_or_default "API_EXTERNAL_URL" "http://localhost:8000")

MAILER_URLPATHS_CONFIRMATION=$(value_or_default "MAILER_URLPATHS_CONFIRMATION" "/auth/v1/verify")
MAILER_URLPATHS_INVITE=$(value_or_default "MAILER_URLPATHS_INVITE" "/auth/v1/verify")
MAILER_URLPATHS_RECOVERY=$(value_or_default "MAILER_URLPATHS_RECOVERY" "/auth/v1/verify")
MAILER_URLPATHS_EMAIL_CHANGE=$(value_or_default "MAILER_URLPATHS_EMAIL_CHANGE" "/auth/v1/verify")

ENABLE_EMAIL_SIGNUP=$(value_or_default "ENABLE_EMAIL_SIGNUP" "true")
ENABLE_EMAIL_AUTOCONFIRM=$(value_or_default "ENABLE_EMAIL_AUTOCONFIRM" "false")
SMTP_ADMIN_EMAIL=$(value_or_default "SMTP_ADMIN_EMAIL" "admin@example.com")
SMTP_HOST=$(value_or_default "SMTP_HOST" "supabase-mail")
SMTP_PORT=$(value_or_default "SMTP_PORT" "2500")
SMTP_USER=$(value_or_default "SMTP_USER" "fake_mail_user")
SMTP_PASS=$(value_or_default "SMTP_PASS" "fake_mail_password")
SMTP_SENDER_NAME=$(value_or_default "SMTP_SENDER_NAME" "fake_sender")
ENABLE_ANONYMOUS_USERS=$(value_or_default "ENABLE_ANONYMOUS_USERS" "false")

ENABLE_PHONE_SIGNUP=$(value_or_default "ENABLE_PHONE_SIGNUP" "true")
ENABLE_PHONE_AUTOCONFIRM=$(value_or_default "ENABLE_PHONE_AUTOCONFIRM" "true")


############
# Studio - Configuration for the Dashboard
############

STUDIO_DEFAULT_ORGANIZATION=$(value_or_default "STUDIO_DEFAULT_ORGANIZATION" "Default Organization")
STUDIO_DEFAULT_PROJECT=$(value_or_default "STUDIO_DEFAULT_PROJECT" "Default Project")
STUDIO_PORT=$(value_or_default "STUDIO_PORT" "3000")
SUPABASE_PUBLIC_URL=$(value_or_default "SUPABASE_PUBLIC_URL" "http://localhost:8000")
OPENAI_API_KEY=$(value_or_default "OPENAI_API_KEY" "")
IMGPROXY_ENABLE_WEBP_DETECTION=$(value_or_default "IMGPROXY_ENABLE_WEBP_DETECTION" "true")


############
# Functions - Configuration for Functions
############

FUNCTIONS_VERIFY_JWT=$(value_or_default "FUNCTIONS_VERIFY_JWT" "false")


############
# Logs - Configuration for Analytics
############

LOGFLARE_PUBLIC_ACCESS_TOKEN=$(value_or_default "LOGFLARE_PUBLIC_ACCESS_TOKEN" "your-super-secret-and-long-logflare-key-public")
LOGFLARE_PRIVATE_ACCESS_TOKEN=$(value_or_default "LOGFLARE_PRIVATE_ACCESS_TOKEN" "your-super-secret-and-long-logflare-key-private")
DOCKER_SOCKET_LOCATION=$(value_or_default "DOCKER_SOCKET_LOCATION" "/var/run/docker.sock")
EOF

cat > "${DEPLOY_COMPOSE}" <<'EOF'
# Usage
#   Start:              docker compose up
#   With helpers:       docker compose -f docker-compose.yml -f ./dev/docker-compose.dev.yml up
#   Stop:               docker compose down
#   Destroy:            docker compose -f docker-compose.yml -f ./dev/docker-compose.dev.yml down -v --remove-orphans
#   Reset everything:  ./reset.sh

name: supabase

services:

  studio:
    container_name: supabase-studio
    image: supabase/studio:2025.10.01-sha-8460121
    restart: unless-stopped
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://studio:3000/api/platform/profile').then((r) => {if (r.status !== 200) throw new Error(r.status)})"
        ]
      timeout: 10s
      interval: 5s
      retries: 3
    depends_on:
      analytics:
        condition: service_healthy
    environment:
      STUDIO_PG_META_URL: http://meta:8080
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      PG_META_CRYPTO_KEY: ${PG_META_CRYPTO_KEY}

      DEFAULT_ORGANIZATION_NAME: ${STUDIO_DEFAULT_ORGANIZATION}
      DEFAULT_PROJECT_NAME: ${STUDIO_DEFAULT_PROJECT}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}

      SUPABASE_URL: http://kong:8000
      SUPABASE_PUBLIC_URL: ${SUPABASE_PUBLIC_URL}
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_KEY: ${SERVICE_ROLE_KEY}
      AUTH_JWT_SECRET: ${JWT_SECRET}

      LOGFLARE_PRIVATE_ACCESS_TOKEN: ${LOGFLARE_PRIVATE_ACCESS_TOKEN}
      LOGFLARE_URL: http://analytics:4000
      NEXT_PUBLIC_ENABLE_LOGS: true
      NEXT_ANALYTICS_BACKEND_PROVIDER: postgres

  kong:
    container_name: supabase-kong
    image: kong:2.8.1
    restart: unless-stopped
    ports:
      - ${KONG_HTTP_PORT}:8000/tcp
      - ${KONG_HTTPS_PORT}:8443/tcp
    volumes:
      - ./volumes/api/kong.yml:/home/kong/temp.yml:ro,z
    depends_on:
      analytics:
        condition: service_healthy
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /home/kong/kong.yml
      KONG_DNS_ORDER: LAST,A,CNAME
      KONG_PLUGINS: request-transformer,cors,key-auth,acl,basic-auth
      KONG_NGINX_PROXY_PROXY_BUFFER_SIZE: 160k
      KONG_NGINX_PROXY_PROXY_BUFFERS: 64 160k
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_KEY: ${SERVICE_ROLE_KEY}
      DASHBOARD_USERNAME: ${DASHBOARD_USERNAME}
      DASHBOARD_PASSWORD: ${DASHBOARD_PASSWORD}
    entrypoint: bash -c 'eval "echo \"$$(cat ~/temp.yml)\"" > ~/kong.yml && /docker-entrypoint.sh kong docker-start'

  auth:
    container_name: supabase-auth
    image: supabase/gotrue:v2.180.0
    restart: unless-stopped
    healthcheck:
      test:
        [
          "CMD",
          "wget",
          "--no-verbose",
          "--tries=1",
          "--spider",
          "http://localhost:9999/health"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    depends_on:
      db:
        condition: service_healthy
      analytics:
        condition: service_healthy
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      API_EXTERNAL_URL: ${API_EXTERNAL_URL}
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
      GOTRUE_SITE_URL: ${SITE_URL}
      GOTRUE_URI_ALLOW_LIST: ${ADDITIONAL_REDIRECT_URLS}
      GOTRUE_DISABLE_SIGNUP: ${DISABLE_SIGNUP}
      GOTRUE_JWT_ADMIN_ROLES: service_role
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_JWT_EXP: ${JWT_EXPIRY}
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      GOTRUE_EXTERNAL_EMAIL_ENABLED: ${ENABLE_EMAIL_SIGNUP}
      GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: ${ENABLE_ANONYMOUS_USERS}
      GOTRUE_MAILER_AUTOCONFIRM: ${ENABLE_EMAIL_AUTOCONFIRM}
      GOTRUE_SMTP_ADMIN_EMAIL: ${SMTP_ADMIN_EMAIL}
      GOTRUE_SMTP_HOST: ${SMTP_HOST}
      GOTRUE_SMTP_PORT: ${SMTP_PORT}
      GOTRUE_SMTP_USER: ${SMTP_USER}
      GOTRUE_SMTP_PASS: ${SMTP_PASS}
      GOTRUE_SMTP_SENDER_NAME: ${SMTP_SENDER_NAME}
      GOTRUE_MAILER_URLPATHS_INVITE: ${MAILER_URLPATHS_INVITE}
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: ${MAILER_URLPATHS_CONFIRMATION}
      GOTRUE_MAILER_URLPATHS_RECOVERY: ${MAILER_URLPATHS_RECOVERY}
      GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: ${MAILER_URLPATHS_EMAIL_CHANGE}
      GOTRUE_EXTERNAL_PHONE_ENABLED: ${ENABLE_PHONE_SIGNUP}
      GOTRUE_SMS_AUTOCONFIRM: ${ENABLE_PHONE_AUTOCONFIRM}

  rest:
    container_name: supabase-rest
    image: postgrest/postgrest:v13.0.7
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
      analytics:
        condition: service_healthy
    environment:
      PGRST_DB_URI: postgres://authenticator:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
      PGRST_DB_SCHEMAS: ${PGRST_DB_SCHEMAS}
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${JWT_SECRET}
      PGRST_DB_USE_LEGACY_GUCS: "false"
      PGRST_APP_SETTINGS_JWT_SECRET: ${JWT_SECRET}
      PGRST_APP_SETTINGS_JWT_EXP: ${JWT_EXPIRY}
    command:
      [
        "postgrest"
      ]

  realtime:
    container_name: realtime-dev.supabase-realtime
    image: supabase/realtime:v2.51.11
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
      analytics:
        condition: service_healthy
    healthcheck:
      test:
        [
          "CMD",
          "curl",
          "-sSfL",
          "--head",
          "-o",
          "/dev/null",
          "-H",
          "Authorization: Bearer ${ANON_KEY}",
          "http://localhost:4000/api/tenants/realtime-dev/health"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    environment:
      PORT: 4000
      DB_HOST: ${POSTGRES_HOST}
      DB_PORT: ${POSTGRES_PORT}
      DB_USER: supabase_admin
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      DB_NAME: ${POSTGRES_DB}
      DB_AFTER_CONNECT_QUERY: 'SET search_path TO _realtime'
      DB_ENC_KEY: supabaserealtime
      API_JWT_SECRET: ${JWT_SECRET}
      SECRET_KEY_BASE: ${SECRET_KEY_BASE}
      ERL_AFLAGS: -proto_dist inet_tcp
      DNS_NODES: "''"
      RLIMIT_NOFILE: "10000"
      APP_NAME: realtime
      SEED_SELF_HOST: true
      RUN_JANITOR: true

  storage:
    container_name: supabase-storage
    image: supabase/storage-api:v1.28.0
    restart: unless-stopped
    volumes:
      - ./volumes/storage:/var/lib/storage:z
    healthcheck:
      test:
        [
          "CMD",
          "wget",
          "--no-verbose",
          "--tries=1",
          "--spider",
          "http://storage:5000/status"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    depends_on:
      db:
        condition: service_healthy
      rest:
        condition: service_started
      imgproxy:
        condition: service_started
    environment:
      ANON_KEY: ${ANON_KEY}
      SERVICE_KEY: ${SERVICE_ROLE_KEY}
      POSTGREST_URL: http://rest:3000
      PGRST_JWT_SECRET: ${JWT_SECRET}
      DATABASE_URL: postgres://supabase_storage_admin:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
      FILE_SIZE_LIMIT: 52428800
      STORAGE_BACKEND: file
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
      TENANT_ID: stub
      REGION: stub
      GLOBAL_S3_BUCKET: stub
      ENABLE_IMAGE_TRANSFORMATION: "true"
      IMGPROXY_URL: http://imgproxy:5001

  imgproxy:
    container_name: supabase-imgproxy
    image: darthsim/imgproxy:v3.8.0
    restart: unless-stopped
    volumes:
      - ./volumes/storage:/var/lib/storage:z
    healthcheck:
      test:
        [
          "CMD",
          "imgproxy",
          "health"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    environment:
      IMGPROXY_BIND: ":5001"
      IMGPROXY_LOCAL_FILESYSTEM_ROOT: /
      IMGPROXY_USE_ETAG: "true"
      IMGPROXY_ENABLE_WEBP_DETECTION: ${IMGPROXY_ENABLE_WEBP_DETECTION}

  meta:
    container_name: supabase-meta
    image: supabase/postgres-meta:v0.91.6
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
      analytics:
        condition: service_healthy
    environment:
      PG_META_PORT: 8080
      PG_META_DB_HOST: ${POSTGRES_HOST}
      PG_META_DB_PORT: ${POSTGRES_PORT}
      PG_META_DB_NAME: ${POSTGRES_DB}
      PG_META_DB_USER: supabase_admin
      PG_META_DB_PASSWORD: ${POSTGRES_PASSWORD}
      CRYPTO_KEY: ${PG_META_CRYPTO_KEY}

  functions:
    container_name: supabase-edge-functions
    image: supabase/edge-runtime:v1.69.6
    restart: unless-stopped
    volumes:
      - ./volumes/functions:/home/deno/functions:Z
    depends_on:
      analytics:
        condition: service_healthy
    environment:
      JWT_SECRET: ${JWT_SECRET}
      SUPABASE_URL: http://kong:8000
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY}
      SUPABASE_DB_URL: postgresql://postgres:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
      VERIFY_JWT: "${FUNCTIONS_VERIFY_JWT}"
    command:
      [
        "start",
        "--main-service",
        "/home/deno/functions/main"
      ]

  analytics:
    container_name: supabase-analytics
    image: supabase/logflare:1.22.4
    restart: unless-stopped
    ports:
      - 4000:4000
    healthcheck:
      test:
        [
          "CMD",
          "curl",
          "http://localhost:4000/health"
        ]
      timeout: 5s
      interval: 5s
      retries: 10
    depends_on:
      db:
        condition: service_healthy
    environment:
      LOGFLARE_NODE_HOST: 127.0.0.1
      DB_USERNAME: supabase_admin
      DB_DATABASE: _supabase
      DB_HOSTNAME: ${POSTGRES_HOST}
      DB_PORT: ${POSTGRES_PORT}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      DB_SCHEMA: _analytics
      LOGFLARE_PUBLIC_ACCESS_TOKEN: ${LOGFLARE_PUBLIC_ACCESS_TOKEN}
      LOGFLARE_PRIVATE_ACCESS_TOKEN: ${LOGFLARE_PRIVATE_ACCESS_TOKEN}
      LOGFLARE_SINGLE_TENANT: true
      LOGFLARE_SUPABASE_MODE: true
      LOGFLARE_MIN_CLUSTER_SIZE: 1
      POSTGRES_BACKEND_URL: postgresql://supabase_admin:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/_supabase
      POSTGRES_BACKEND_SCHEMA: _analytics
      LOGFLARE_FEATURE_FLAG_OVERRIDE: multibackend=true

  db:
    container_name: supabase-db
    image: supabase/postgres:15.8.1.085
    restart: unless-stopped
    volumes:
      - ./volumes/db/realtime.sql:/docker-entrypoint-initdb.d/migrations/99-realtime.sql:Z
      - ./volumes/db/webhooks.sql:/docker-entrypoint-initdb.d/init-scripts/98-webhooks.sql:Z
      - ./volumes/db/roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:Z
      - ./volumes/db/jwt.sql:/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql:Z
      - ./volumes/db/data:/var/lib/postgresql/data:Z
      - ./volumes/db/_supabase.sql:/docker-entrypoint-initdb.d/migrations/97-_supabase.sql:Z
      - ./volumes/db/logs.sql:/docker-entrypoint-initdb.d/migrations/99-logs.sql:Z
      - ./volumes/db/pooler.sql:/docker-entrypoint-initdb.d/migrations/99-pooler.sql:Z
      - db-config:/etc/postgresql-custom
    healthcheck:
      test:
        [
        "CMD",
        "pg_isready",
        "-U",
        "postgres",
        "-h",
        "localhost"
        ]
      interval: 5s
      timeout: 5s
      retries: 10
    depends_on:
      vector:
        condition: service_healthy
    environment:
      POSTGRES_HOST: /var/run/postgresql
      PGPORT: ${POSTGRES_PORT}
      POSTGRES_PORT: ${POSTGRES_PORT}
      PGPASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      PGDATABASE: ${POSTGRES_DB}
      POSTGRES_DB: ${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXP: ${JWT_EXPIRY}
    command:
      [
        "postgres",
        "-c",
        "config_file=/etc/postgresql/postgresql.conf",
        "-c",
        "log_min_messages=fatal"
      ]

  vector:
    container_name: supabase-vector
    image: timberio/vector:0.28.1-alpine
    restart: unless-stopped
    volumes:
      - ./volumes/logs/vector.yml:/etc/vector/vector.yml:ro,z
      - ${DOCKER_SOCKET_LOCATION}:/var/run/docker.sock:ro,z
    healthcheck:
      test:
        [
          "CMD",
          "wget",
          "--no-verbose",
          "--tries=1",
          "--spider",
          "http://vector:9001/health"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    environment:
      LOGFLARE_PUBLIC_ACCESS_TOKEN: ${LOGFLARE_PUBLIC_ACCESS_TOKEN}
    command:
      [
        "--config",
        "/etc/vector/vector.yml"
      ]
    security_opt:
      - "label=disable"

  supavisor:
    container_name: supabase-pooler
    image: supabase/supavisor:2.7.0
    restart: unless-stopped
    ports:
      - ${POSTGRES_PORT}:5432
      - ${POOLER_PROXY_PORT_TRANSACTION}:6543
    volumes:
      - ./volumes/pooler/pooler.exs:/etc/pooler/pooler.exs:ro,z
    healthcheck:
      test:
        [
          "CMD",
          "curl",
          "-sSfL",
          "--head",
          "-o",
          "/dev/null",
          "http://127.0.0.1:4000/api/health"
        ]
      interval: 10s
      timeout: 5s
      retries: 5
    depends_on:
      db:
        condition: service_healthy
      analytics:
        condition: service_healthy
    environment:
      PORT: 4000
      POSTGRES_PORT: ${POSTGRES_PORT}
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      DATABASE_URL: ecto://supabase_admin:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/_supabase
      CLUSTER_POSTGRES: true
      SECRET_KEY_BASE: ${SECRET_KEY_BASE}
      VAULT_ENC_KEY: ${VAULT_ENC_KEY}
      API_JWT_SECRET: ${JWT_SECRET}
      METRICS_JWT_SECRET: ${JWT_SECRET}
      REGION: local
      ERL_AFLAGS: -proto_dist inet_tcp
      POOLER_TENANT_ID: ${POOLER_TENANT_ID}
      POOLER_DEFAULT_POOL_SIZE: ${POOLER_DEFAULT_POOL_SIZE}
      POOLER_MAX_CLIENT_CONN: ${POOLER_MAX_CLIENT_CONN}
      POOLER_POOL_MODE: transaction
      DB_POOL_SIZE: ${POOLER_DB_POOL_SIZE}
    command:
      [
        "/bin/sh",
        "-c",
        "/app/bin/migrate && /app/bin/supavisor eval \"$$(cat /etc/pooler/pooler.exs)\" && /app/bin/server"
      ]

volumes:
  db-config:
EOF

echo "Exported deployment files to ${DEPLOY_DIR}"
