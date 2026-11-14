#!/usr/bin/env bash
# Back up the Tbilisi Property Map database (and local photos, if stored on disk).
#
#   DATABASE_URL=postgres://... BACKUP_DIR=/backups ./scripts/backup.sh
#
# Optional: UPLOAD_DIR=/data/uploads   also archives locally stored photos
#           KEEP_DAYS=30               delete backups older than this
#
# Schedule daily with cron, e.g.:
#   15 3 * * * cd /srv/tbilisi-property-map && DATABASE_URL=... BACKUP_DIR=/backups ./scripts/backup.sh >> /var/log/tpm-backup.log 2>&1
#
# Restore:
#   pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" tpm-db-YYYYmmdd-HHMMSS.dump
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
DB_FILE="$BACKUP_DIR/tpm-db-$STAMP.dump"

echo "[backup] dumping database to $DB_FILE"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$DB_FILE"
pg_restore --list "$DB_FILE" > /dev/null   # sanity check: archive is readable

if [[ -n "${UPLOAD_DIR:-}" && -d "$UPLOAD_DIR" ]]; then
  PHOTO_FILE="$BACKUP_DIR/tpm-photos-$STAMP.tar.gz"
  echo "[backup] archiving photos to $PHOTO_FILE"
  tar -czf "$PHOTO_FILE" -C "$UPLOAD_DIR" .
fi

echo "[backup] removing backups older than $KEEP_DAYS days"
find "$BACKUP_DIR" -name 'tpm-*' -type f -mtime "+$KEEP_DAYS" -delete

echo "[backup] done"
