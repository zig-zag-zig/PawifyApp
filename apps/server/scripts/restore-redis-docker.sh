#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
ENV_FILE="${PAWIFY_ENV_FILE:-.env}"
BACKUP_FILE="${1:-}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-}"

if [[ -z "$PROJECT_NAME" && -f "$ENV_FILE" ]]; then
  PROJECT_NAME="$(grep '^COMPOSE_PROJECT_NAME=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
fi

PROJECT_NAME="${PROJECT_NAME:-pawify}"
VOLUME_NAME="${VOLUME_NAME:-${PROJECT_NAME}_redis-data}"

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Usage: $0 /path/to/redis-backup.tar.gz" >&2
  exit 1
fi

cd "$APP_DIR"

echo "Stopping stack..."
docker compose --env-file "$ENV_FILE" down

echo "Removing old Redis volume if present: $VOLUME_NAME"
docker volume rm "$VOLUME_NAME" >/dev/null 2>&1 || true
docker volume create "$VOLUME_NAME" >/dev/null

echo "Restoring backup into $VOLUME_NAME"
docker run --rm \
  -v "$VOLUME_NAME:/data" \
  -v "$(dirname "$BACKUP_FILE"):/backup:ro" \
  alpine sh -lc "tar -xzf /backup/$(basename "$BACKUP_FILE") -C /data && ls -lah /data"

echo "Starting stack..."
docker compose --env-file "$ENV_FILE" up -d
