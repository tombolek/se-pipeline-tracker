#!/bin/bash
# Nightly PostgreSQL backup → S3
# Invoked by cron: 0 2 * * * (env vars sourced from /app/.env.prod by cron.d entry)
# Requires: POSTGRES_USER, POSTGRES_DB, BACKUP_BUCKET in environment

set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_KEY="pg-backup-${DATE}.sql.gz"

echo "[backup] Starting backup: ${BACKUP_KEY}"

cd /app

docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T db \
  pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" \
  | gzip \
  | aws s3 cp - "s3://${BACKUP_BUCKET}/${BACKUP_KEY}"

echo "[backup] Uploaded to s3://${BACKUP_BUCKET}/${BACKUP_KEY}"
