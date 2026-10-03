#!/bin/bash
# Nightly: copies a consistent snapshot of the music-chairs database to the
# private backup bucket as backups/<UTC date>.sqlite.gz. The bucket keeps each
# copy 30 days (an overwritten one 7 days more); the instance's key can only add
# objects.
set -euo pipefail

# shellcheck source=/dev/null
. /etc/music-chairs/backup-target.env
set -a
# shellcheck source=/dev/null
. /etc/music-chairs/backup.env
set +a

database=/var/lib/music-chairs/music-chairs.sqlite
if [ ! -f "$database" ]; then
  echo "no database yet; nothing to back up"
  exit 0
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
sqlite3 "$database" ".backup '$workdir/music-chairs.sqlite'"
gzip -9 "$workdir/music-chairs.sqlite"
aws s3 cp "$workdir/music-chairs.sqlite.gz" \
  "s3://$BUCKET/backups/$(date -u +%F).sqlite.gz" \
  --region "$REGION" --only-show-errors
echo "backed up to s3://$BUCKET/backups/$(date -u +%F).sqlite.gz"
