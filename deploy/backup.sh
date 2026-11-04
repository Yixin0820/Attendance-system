#!/usr/bin/env bash
# 数据库备份。PostgreSQL 用 pg_dump，SQLite 直接复制文件。
# 用法：./deploy/backup.sh [输出目录]
# 建议放进 crontab：0 3 * * * /opt/attendance/deploy/backup.sh

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${1:-$APP_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

# 读取后端配置（只认 DATABASE_URL / UPLOAD_DIR 两行）
ENV_FILE="$APP_DIR/backend/.env"
DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"
UPLOAD_DIR="$(grep -E '^UPLOAD_DIR=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"

if [[ -z "$DB_URL" ]]; then
  echo "[错误] 没读到 DATABASE_URL，请检查 $ENV_FILE" >&2
  exit 1
fi

echo "备份时间：$STAMP"

if [[ "$DB_URL" == postgres* ]]; then
  # 在 db 容器里执行 pg_dump，避免宿主机装客户端
  OUT="$BACKUP_DIR/db-$STAMP.sql.gz"
  docker compose -f "$APP_DIR/backend/docker-compose.prod.yml" exec -T db \
    pg_dump -U attendance -d attendance --no-owner --no-privileges \
    | gzip > "$OUT"
  echo "数据库：$OUT"
else
  # SQLite：先把 WAL 落盘再复制，保证是一致快照
  DB_FILE="${DB_URL#sqlite:///}"
  [[ -f "$DB_FILE" ]] || { echo "[错误] 找不到 $DB_FILE" >&2; exit 1; }
  OUT="$BACKUP_DIR/db-$STAMP.db"
  cp "$DB_FILE" "$OUT"
  echo "数据库：$OUT"
fi

# 上传的假条 / 检讨也要一起备份
if [[ -n "$UPLOAD_DIR" && -d "$UPLOAD_DIR" ]]; then
  OUT2="$BACKUP_DIR/uploads-$STAMP.tar.gz"
  tar -czf "$OUT2" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
  echo "附件：$OUT2"
fi

# 清理过期备份
find "$BACKUP_DIR" -type f \( -name 'db-*' -o -name 'uploads-*' \) -mtime +"$KEEP_DAYS" -delete
echo "已清理 $KEEP_DAYS 天前的备份"
