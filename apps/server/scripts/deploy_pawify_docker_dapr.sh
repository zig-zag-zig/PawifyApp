#!/usr/bin/env bash
set -Eeuo pipefail

# Pawify Docker + Dapr + Redis VPS deployment bootstrapper.
#
# Cloudflare Tunnel / reverse proxy is intentionally outside this Docker stack.
# Existing host route should point to:
#   production: http://127.0.0.1:3001
#
# This script is intentionally CI-shaped: GitHub Actions builds the app image,
# writes secrets to the VPS, then this script pulls that image and starts the
# single production Compose stack.

APP_DIR="/srv/pawify-prod"
COMPOSE_DIR="$APP_DIR/apps/server"
APP_USER="pawify"
ENVIRONMENT="prod"
REPO_URL="${PAWIFY_REPO_URL:-https://github.com/zig-zag-zig/Pawify.git}"
REPO_BRANCH="${PAWIFY_DEPLOY_BRANCH:-${GITHUB_REF_NAME:-}}"
PROD_BRANCH="main"
ENV_FILE=".env.prod"
SECRETS_SUBDIR="prod"
HOST_PORT="3001"
APP_PORT="10000"
COMPOSE_PROJECT="pawify"
IMAGE_NAME=""
PUBLIC_HOSTNAME="pawify-api.chi-chi.vip"
SENTRY_ENVIRONMENT="production"
APP_ENV_VALUE="production"
APP_MEMORY_LIMIT="640m"
APP_MEMORY_SWAP_LIMIT="1g"
APP_MEMORY_RESERVATION="256m"
APP_CPUS="1.25"
APP_PIDS_LIMIT="256"
DAPR_MEMORY_LIMIT="192m"
DAPR_MEMORY_SWAP_LIMIT="256m"
DAPR_MEMORY_RESERVATION="96m"
DAPR_CPUS="0.5"
DAPR_PIDS_LIMIT="128"
REDIS_MEMORY_LIMIT="256m"
REDIS_MEMORY_SWAP_LIMIT="256m"
REDIS_MEMORY_RESERVATION="64m"
REDIS_CPUS="0.5"
REDIS_PIDS_LIMIT="128"
NODE_OPTIONS_VALUE="--max-old-space-size=384"
REDIS_MAXMEMORY_VALUE="160mb"
REDIS_MAXMEMORY_POLICY_VALUE="allkeys-lru"
SECRETS_SOURCE_DIR=""
PREBUILT_IMAGE="${PAWIFY_DEPLOY_IMAGE:-}"
IMAGE_REGISTRY="${PAWIFY_IMAGE_REGISTRY:-}"
IMAGE_REGISTRY_USER="${PAWIFY_IMAGE_REGISTRY_USER:-}"
IMAGE_REGISTRY_TOKEN="${PAWIFY_IMAGE_REGISTRY_TOKEN:-}"

log() { printf '\033[1;34m[INFO]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; }

usage() {
  cat <<USAGE
Usage: $0 [options]

Production branch mapping:
  main -> prod -> http://127.0.0.1:3001

Options:
  --repo-branch BRANCH          Git branch to checkout/pull. Defaults to
                                PAWIFY_DEPLOY_BRANCH, then GITHUB_REF_NAME.
  --repo-url URL                Git repo URL. Defaults to PAWIFY_REPO_URL, then
                                https://github.com/zig-zag-zig/Pawify.git.
  --prebuilt-image IMAGE        Required app image built by CI.
  --secrets-source-dir DIR      Read source files from DIR:
                                  DIR/.env.prod or DIR/.env
                                  DIR/dapr-secrets.json
                                  DIR/firebase-service-account.json
  --help                        Show this help.

Environment variables:
  PAWIFY_REPO_URL               Optional repo URL override.
  PAWIFY_DEPLOY_BRANCH          Optional branch override.
  GITHUB_REF_NAME               Used as branch when running from GitHub Actions.
  PAWIFY_DEPLOY_IMAGE           Required prebuilt app image. Usually set by CI.
  PAWIFY_IMAGE_REGISTRY         Optional registry for docker login, e.g. ghcr.io.
  PAWIFY_IMAGE_REGISTRY_USER    Optional registry username.
  PAWIFY_IMAGE_REGISTRY_TOKEN   Optional registry token. Avoid printing this.

Examples:
  sudo ./scripts/deploy_pawify_docker_dapr.sh \\
    --repo-branch main \\
    --prebuilt-image ghcr.io/zig-zag-zig/pawify:sha-... \\
    --secrets-source-dir /root/pawify-prod-secrets
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-url) REPO_URL="$2"; shift 2 ;;
    --repo-branch|--branch) REPO_BRANCH="$2"; shift 2 ;;
    --prebuilt-image) PREBUILT_IMAGE="$2"; shift 2 ;;
    --secrets-source-dir) SECRETS_SOURCE_DIR="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 2 ;;
  esac
done

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { err "Missing required command: $1"; exit 1; }
}

as_root_or_sudo() {
  if [[ "${EUID}" -ne 0 ]]; then
    err "Run this script as root, for example with sudo."
    exit 1
  fi
}

sha_file() {
  if [[ -f "$1" ]]; then sha256sum "$1" | awk '{print $1}'; else echo ""; fi
}

copy_source_file() {
  local src="$1"
  local dest="$2"
  local mode="$3"
  local owner="$4"

  if [[ ! -f "$src" ]]; then
    err "Source file does not exist: $src"
    exit 1
  fi

  mkdir -p "$(dirname "$dest")"

  if [[ -f "$dest" && "$(sha_file "$src")" == "$(sha_file "$dest")" ]]; then
    log "unchanged from source: $dest"
    chmod "$mode" "$dest" || true
    chown "$owner" "$dest" || true
    return 0
  fi

  if [[ -f "$dest" ]]; then
    cp -a "$dest" "$dest.bak.$(date -u +%Y%m%dT%H%M%SZ)"
    log "updated from source with backup: $dest"
  else
    log "created from source: $dest"
  fi

  install -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$src" "$dest"
}

replace_or_append_env() {
  local file="$1"
  local key="$2"
  local value="$3"

  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

read_env_value() {
  local file="$1"
  local key="$2"
  local line

  if [[ ! -f "$file" ]]; then
    return 0
  fi

  line="$(grep -m1 "^${key}=" "$file" || true)"
  if [[ -n "$line" ]]; then
    printf '%s\n' "${line#*=}"
  fi
}

install_docker() {
  log "Installing Docker Engine and Compose plugin from Docker apt repository"
  export DEBIAN_FRONTEND=noninteractive
  rm -f /etc/apt/sources.list.d/docker.list /etc/apt/sources.list.d/docker.sources
  apt-get remove -y docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc >/dev/null 2>&1 || true
  apt-get update
  apt-get install -y ca-certificates curl gnupg git openssl rsync
  install -m 0755 -d /etc/apt/keyrings

  local codename arch docker_os
  # shellcheck disable=SC1091
  . /etc/os-release

  case "${ID:-}" in
    ubuntu)
      docker_os="ubuntu"
      codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
      ;;
    debian)
      docker_os="debian"
      codename="${VERSION_CODENAME:-}"
      ;;
    *)
      case " ${ID_LIKE:-} " in
        *" ubuntu "*)
          docker_os="ubuntu"
          codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
          ;;
        *" debian "*)
          docker_os="debian"
          codename="${VERSION_CODENAME:-}"
          ;;
        *)
          err "Unsupported OS for Docker apt repo: ${PRETTY_NAME:-unknown}. Install Docker manually or update this script."
          exit 1
          ;;
      esac
      ;;
  esac

  if [[ -z "$codename" ]]; then
    err "Could not detect ${docker_os} codename for Docker apt repo."
    exit 1
  fi

  curl -fsSL "https://download.docker.com/linux/${docker_os}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  arch="$(dpkg --print-architecture)"
  cat > /etc/apt/sources.list.d/docker.sources <<EOF_REPO
Types: deb
URIs: https://download.docker.com/linux/${docker_os}
Suites: ${codename}
Components: stable
Architectures: ${arch}
Signed-By: /etc/apt/keyrings/docker.asc
EOF_REPO

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  systemctl enable --now containerd
}

validate_args() {
  if [[ -z "$REPO_BRANCH" ]]; then
    err "--repo-branch, PAWIFY_DEPLOY_BRANCH, or GITHUB_REF_NAME is required."
    exit 2
  fi

  if [[ -z "$REPO_URL" ]]; then
    err "--repo-url or PAWIFY_REPO_URL is required."
    exit 2
  fi

  if [[ "$REPO_BRANCH" != "$PROD_BRANCH" ]]; then
    err "Refusing prod deploy from branch '$REPO_BRANCH'. Expected '$PROD_BRANCH'."
    exit 2
  fi

  if [[ -z "$PREBUILT_IMAGE" ]]; then
    err "--prebuilt-image or PAWIFY_DEPLOY_IMAGE is required. Build the image in CI before deploying."
    exit 2
  fi

  if [[ -z "$SECRETS_SOURCE_DIR" ]]; then
    err "--secrets-source-dir is required."
    exit 2
  fi
}

set_environment_defaults() {
  IMAGE_NAME="$PREBUILT_IMAGE"
}

create_user_and_app_dir() {
  as_root_or_sudo

  if ! id "$APP_USER" >/dev/null 2>&1; then
    log "Creating system user: $APP_USER"
    useradd --system --create-home --shell /bin/bash "$APP_USER"
  fi

  if command -v docker >/dev/null 2>&1; then
    usermod -aG docker "$APP_USER" || true
  fi

  mkdir -p "$APP_DIR"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
}

create_runtime_dirs() {
  mkdir -p "$COMPOSE_DIR/backups/redis"
  chown -R "$APP_USER:$APP_USER" "$COMPOSE_DIR/backups"
  chmod 750 "$COMPOSE_DIR/backups" "$COMPOSE_DIR/backups/redis" || true
}

cleanup_bootstrap_only_app_dir() {
  if [[ ! -d "$COMPOSE_DIR/backups/redis" ]]; then
    return 1
  fi

  if [[ -n "$(find "$COMPOSE_DIR/backups/redis" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
    return 1
  fi

  if [[ -n "$(find "$COMPOSE_DIR" -mindepth 1 \
    ! -path "$COMPOSE_DIR/backups" \
    ! -path "$COMPOSE_DIR/backups/redis" \
    -print -quit 2>/dev/null)" ]]; then
    return 1
  fi

  warn "Removing empty bootstrap-only runtime directory before initial clone: $COMPOSE_DIR/backups"
  rm -rf "$COMPOSE_DIR/backups"
}

login_to_image_registry() {
  if [[ -z "$IMAGE_REGISTRY_TOKEN" ]]; then
    return 0
  fi

  if [[ -z "$IMAGE_REGISTRY" || -z "$IMAGE_REGISTRY_USER" ]]; then
    err "PAWIFY_IMAGE_REGISTRY and PAWIFY_IMAGE_REGISTRY_USER are required when PAWIFY_IMAGE_REGISTRY_TOKEN is set."
    exit 2
  fi

  need_cmd docker
  log "Logging Docker in to $IMAGE_REGISTRY as $IMAGE_REGISTRY_USER"
  printf '%s\n' "$IMAGE_REGISTRY_TOKEN" \
    | sudo -u "$APP_USER" docker login "$IMAGE_REGISTRY" -u "$IMAGE_REGISTRY_USER" --password-stdin >/dev/null
}

clone_or_update_repo() {
  if [[ ! -d "$APP_DIR/.git" ]]; then
    cleanup_bootstrap_only_app_dir || true

    if [[ -n "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
      err "$APP_DIR is not empty and has no .git. Choose another --app-dir or clean it up."
      exit 1
    fi

    log "Cloning $REPO_URL branch $REPO_BRANCH into $APP_DIR"
    sudo -u "$APP_USER" git clone --recurse-submodules --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
  else
    log "Updating git repo in $APP_DIR to branch $REPO_BRANCH"
    sudo -u "$APP_USER" git -C "$APP_DIR" remote set-url origin "$REPO_URL" || true
    sudo -u "$APP_USER" git -C "$APP_DIR" fetch origin "$REPO_BRANCH" --prune
    sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$REPO_BRANCH"
    sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only origin "$REPO_BRANCH"
  fi

  if [[ -f "$APP_DIR/.gitmodules" ]]; then
    log "Updating git submodules"
    sudo -u "$APP_USER" git -C "$APP_DIR" submodule sync --recursive
    sudo -u "$APP_USER" git -C "$APP_DIR" submodule update --init --recursive
  fi
}

prepare_runtime_files() {
  local owner="$APP_USER:$APP_USER"
  local secrets_dir="$COMPOSE_DIR/secrets/$SECRETS_SUBDIR"
  local env_path="$COMPOSE_DIR/$ENV_FILE"
  local secret_path="$secrets_dir/dapr-secrets.json"
  local firebase_path="$secrets_dir/firebase-service-account.json"
  local env_source="$SECRETS_SOURCE_DIR/$ENV_FILE"
  local dapr_source="$SECRETS_SOURCE_DIR/dapr-secrets.json"
  local firebase_source="$SECRETS_SOURCE_DIR/firebase-service-account.json"

  mkdir -p "$secrets_dir" "$COMPOSE_DIR/backups/redis"
  chown -R "$owner" "$COMPOSE_DIR/secrets" "$COMPOSE_DIR/backups"
  chmod 755 "$COMPOSE_DIR/secrets" "$secrets_dir" || true

  if [[ ! -f "$env_source" && -f "$SECRETS_SOURCE_DIR/.env" ]]; then
    env_source="$SECRETS_SOURCE_DIR/.env"
  fi

  copy_source_file "$env_source" "$env_path" "0600" "$owner"
  copy_source_file "$dapr_source" "$secret_path" "0644" "$owner"
  copy_source_file "$firebase_source" "$firebase_path" "0644" "$owner"

  replace_or_append_env "$env_path" "COMPOSE_PROJECT_NAME" "$COMPOSE_PROJECT"
  replace_or_append_env "$env_path" "PAWIFY_ENV_FILE" "$ENV_FILE"
  replace_or_append_env "$env_path" "PAWIFY_IMAGE" "$IMAGE_NAME"
  replace_or_append_env "$env_path" "PAWIFY_SECRETS_DIR" "./secrets/$SECRETS_SUBDIR"
  replace_or_append_env "$env_path" "PAWIFY_HOST_BIND_ADDRESS" "127.0.0.1"
  replace_or_append_env "$env_path" "PAWIFY_HOST_PORT" "$HOST_PORT"
  replace_or_append_env "$env_path" "APP_ENV" "$APP_ENV_VALUE"
  replace_or_append_env "$env_path" "NODE_ENV" "production"
  replace_or_append_env "$env_path" "PORT" "$APP_PORT"
  replace_or_append_env "$env_path" "DAPR_HTTP_PORT" "3500"
  replace_or_append_env "$env_path" "DAPR_GRPC_PORT" "50001"
  replace_or_append_env "$env_path" "DAPR_APP_ID" "pawify-api"
  replace_or_append_env "$env_path" "DAPR_SECRET_STORE_NAME" "pawify-secrets"
  replace_or_append_env "$env_path" "PAWIFY_LOG_MAX_SIZE" "2m"
  replace_or_append_env "$env_path" "PAWIFY_LOG_MAX_FILE" "30"
  replace_or_append_env "$env_path" "PAWIFY_LOG_COMPRESS" "true"
  replace_or_append_env "$env_path" "PAWIFY_APP_MEMORY_LIMIT" "$APP_MEMORY_LIMIT"
  replace_or_append_env "$env_path" "PAWIFY_APP_MEMORY_SWAP_LIMIT" "$APP_MEMORY_SWAP_LIMIT"
  replace_or_append_env "$env_path" "PAWIFY_APP_MEMORY_RESERVATION" "$APP_MEMORY_RESERVATION"
  replace_or_append_env "$env_path" "PAWIFY_APP_CPUS" "$APP_CPUS"
  replace_or_append_env "$env_path" "PAWIFY_APP_PIDS_LIMIT" "$APP_PIDS_LIMIT"
  replace_or_append_env "$env_path" "PAWIFY_DAPR_MEMORY_LIMIT" "$DAPR_MEMORY_LIMIT"
  replace_or_append_env "$env_path" "PAWIFY_DAPR_MEMORY_SWAP_LIMIT" "$DAPR_MEMORY_SWAP_LIMIT"
  replace_or_append_env "$env_path" "PAWIFY_DAPR_MEMORY_RESERVATION" "$DAPR_MEMORY_RESERVATION"
  replace_or_append_env "$env_path" "PAWIFY_DAPR_CPUS" "$DAPR_CPUS"
  replace_or_append_env "$env_path" "PAWIFY_DAPR_PIDS_LIMIT" "$DAPR_PIDS_LIMIT"
  replace_or_append_env "$env_path" "PAWIFY_REDIS_MEMORY_LIMIT" "$REDIS_MEMORY_LIMIT"
  replace_or_append_env "$env_path" "PAWIFY_REDIS_MEMORY_SWAP_LIMIT" "$REDIS_MEMORY_SWAP_LIMIT"
  replace_or_append_env "$env_path" "PAWIFY_REDIS_MEMORY_RESERVATION" "$REDIS_MEMORY_RESERVATION"
  replace_or_append_env "$env_path" "PAWIFY_REDIS_CPUS" "$REDIS_CPUS"
  replace_or_append_env "$env_path" "PAWIFY_REDIS_PIDS_LIMIT" "$REDIS_PIDS_LIMIT"
  replace_or_append_env "$env_path" "PAWIFY_NODE_OPTIONS" "$NODE_OPTIONS_VALUE"
  replace_or_append_env "$env_path" "REDIS_MAXMEMORY" "$REDIS_MAXMEMORY_VALUE"
  replace_or_append_env "$env_path" "REDIS_MAXMEMORY_POLICY" "$REDIS_MAXMEMORY_POLICY_VALUE"
  replace_or_append_env "$env_path" "SENTRY_ENVIRONMENT" "$SENTRY_ENVIRONMENT"
  replace_or_append_env "$env_path" "GOOGLE_APPLICATION_CREDENTIALS" "/var/pawify/secrets/firebase-service-account.json"

  chmod 600 "$env_path" 2>/dev/null || true
  chmod 644 "$secret_path" "$firebase_path" 2>/dev/null || true
  chown -R "$owner" "$COMPOSE_DIR/secrets" "$env_path" || true
}

validate_before_start() {
  local env_path="$COMPOSE_DIR/$ENV_FILE"
  local secret_path="$COMPOSE_DIR/secrets/$SECRETS_SUBDIR/dapr-secrets.json"
  local redis_password

  redis_password="$(read_env_value "$env_path" "REDIS_PASSWORD")"
  if [[ -z "$redis_password" || "$redis_password" == replace-with-* ]]; then
    err "$env_path has an unset REDIS_PASSWORD."
    exit 1
  fi

  if [[ ! -f "$secret_path" ]]; then
    err "Missing Dapr secret file: $secret_path"
    exit 1
  fi

  if grep -q 'replace-with-.*notify-token' "$env_path"; then
    err "$env_path still contains the placeholder NOTIFY_API_KEY."
    exit 1
  fi

  local firebase_json
  local google_credentials
  firebase_json="$(read_env_value "$env_path" "FIREBASE_SERVICE_ACCOUNT_JSON")"
  google_credentials="$(read_env_value "$env_path" "GOOGLE_APPLICATION_CREDENTIALS")"
  if [[ -z "$firebase_json" && -n "$google_credentials" ]]; then
    local firebase_host_path="$COMPOSE_DIR/secrets/$SECRETS_SUBDIR/firebase-service-account.json"
    if [[ ! -f "$firebase_host_path" ]]; then
      err "$env_path uses GOOGLE_APPLICATION_CREDENTIALS, but the host Firebase credential file is missing: $firebase_host_path"
      exit 1
    fi
  fi
}

compose_cmd() {
  sudo -u "$APP_USER" bash -lc "cd '$COMPOSE_DIR' && docker compose -p '$COMPOSE_PROJECT' --env-file '$ENV_FILE' $*"
}

stop_existing_stack() {
  log "Stopping existing $COMPOSE_PROJECT Compose stack if present"
  compose_cmd "down --remove-orphans" || true
}

start_stack() {
  need_cmd docker
  validate_before_start

  log "Validating Docker Compose config for $ENVIRONMENT"
  compose_cmd "config >/dev/null"

  log "Pulling prebuilt Pawify $ENVIRONMENT image: $PREBUILT_IMAGE"
  compose_cmd "pull pawify pawify-dapr redis"
  stop_existing_stack
  compose_cmd "up -d --no-build"

  compose_cmd "ps"

  log "Health check: http://127.0.0.1:$HOST_PORT/v1/health"
  sleep 3
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS "http://127.0.0.1:$HOST_PORT/v1/health" >/dev/null; then
      log "Pawify $ENVIRONMENT health check succeeded"
    else
      warn "Pawify health check failed. Check: cd $APP_DIR && docker compose --env-file $ENV_FILE logs -f --tail=100 pawify pawify-dapr redis"
    fi
  else
    warn "curl is unavailable, skipped HTTP health check."
  fi
}

main() {
  validate_args
  set_environment_defaults
  as_root_or_sudo

  need_cmd git

  if ! command -v docker >/dev/null 2>&1 \
    || ! docker compose version >/dev/null 2>&1; then
    install_docker
  fi

  create_user_and_app_dir
  login_to_image_registry
  clone_or_update_repo
  create_runtime_dirs
  prepare_runtime_files
  start_stack

  cat <<NEXT_STEPS

Done. Pawify $ENVIRONMENT is deployed from:
  $APP_DIR

Branch:
  $REPO_BRANCH

Host route target:
  http://127.0.0.1:$HOST_PORT

Public hostname expected:
  $PUBLIC_HOSTNAME

Runtime files:
  $APP_DIR/$ENV_FILE
  $COMPOSE_DIR/secrets/$SECRETS_SUBDIR/dapr-secrets.json
  $COMPOSE_DIR/secrets/$SECRETS_SUBDIR/firebase-service-account.json

Logs:
  cd $APP_DIR
  docker compose --env-file $ENV_FILE logs -f --tail=100 pawify pawify-dapr redis

NEXT_STEPS
}

main "$@"
