#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
ENV_FILE="${PAWIFY_ENV_FILE:-.env}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups/redis}"
DATE="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_DIR/redis-$DATE.tar.gz"

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"

REDIS_PASSWORD="$(grep '^REDIS_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"

if [[ -z "$REDIS_PASSWORD" ]]; then
  echo "REDIS_PASSWORD is missing from $ENV_FILE" >&2
  exit 1
fi

docker compose --env-file "$ENV_FILE" exec -T redis redis-cli -a "$REDIS_PASSWORD" BGSAVE >/dev/null

while true; do
  STATUS="$(docker compose --env-file "$ENV_FILE" exec -T redis redis-cli -a "$REDIS_PASSWORD" INFO persistence \
    | awk -F: '/rdb_bgsave_in_progress/ {gsub("\r", "", $2); print $2}')"
  if [[ "$STATUS" == "0" ]]; then
    break
  fi
  sleep 1
done

docker compose --env-file "$ENV_FILE" exec -T redis tar -czf - -C /data . > "$DEST"
find "$BACKUP_DIR" -type f -name 'redis-*.tar.gz' -mtime +14 -delete

echo "Redis backup written to $DEST"
