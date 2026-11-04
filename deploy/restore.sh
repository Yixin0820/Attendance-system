#!/usr/bin/env bash
# 从备份恢复。恢复会覆盖现有数据，执行前会二次确认。
# 用法：./deploy/restore.sh backups/db-20261101-030000.sql.gz

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAPSHOT="$1"

if [[ -z "${SNAPSHOT:-}" || ! -f "$SNAPSHOT" ]]; then
  echo "用法：$0 <备份文件路径>" >&2
  echo "可选文件：" >&2
  ls -1 "$APP_DIR/backups" 2>/dev/null | sed 's/^/  /' >&2
  exit 1
fi

read -r -p "即将用 $SNAPSHOT 覆盖现有数据，确认请输入 yes： " CONFIRM
[[ "$CONFIRM" == "yes" ]] || { echo "已取消"; exit 0; }

DB_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/backend/.env" | cut -d= -f2-)"

echo "先停掉 API，避免恢复过程中还有写入…"
docker compose -f "$APP_DIR/backend/docker-compose.prod.yml" stop api

if [[ "$DB_URL" == postgres* ]]; then
  gunzip -c "$SNAPSHOT" | docker compose -f "$APP_DIR/backend/docker-compose.prod.yml" exec -T db \
    psql -U attendance -d attendance -v ON_ERROR_STOP=1
else
  DB_FILE="${DB_URL#sqlite:///}"
  cp "$DB_FILE" "$DB_FILE.bak-$(date +%Y%m%d%H%M%S)"
  cp "$SNAPSHOT" "$DB_FILE"
fi

echo "恢复完成，重新启动 API…"
docker compose -f "$APP_DIR/backend/docker-compose.prod.yml" start api
docker compose -f "$APP_DIR/backend/docker-compose.prod.yml" ps
