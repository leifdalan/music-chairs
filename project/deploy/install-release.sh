#!/bin/bash
# Installs a release archive, switches to it and health-checks it; on failure it
# restores the database copied just before the switch and returns to the
# previous release. Run as root by `bin/deploy release`.
#
# Usage: install-release.sh <archive.tgz> <release-name>
#
# Every path and command can be overridden through the environment so the
# rollback logic can be tested without systemd, a network or a real database.
set -euo pipefail

archive="${1:?archive}"
name="${2:?release name}"
root="${MC_ROOT:-/opt/music-chairs}"
data="${MC_DATA:-/var/lib/music-chairs}"
health_url="${MC_HEALTH_URL:-http://127.0.0.1:3000/healthz}"
tries="${MC_HEALTH_TRIES:-30}"
delay="${MC_HEALTH_DELAY:-1}"
systemctl_cmd="${MC_SYSTEMCTL:-systemctl}"
sqlite3_cmd="${MC_SQLITE3:-sqlite3}"
curl_cmd="${MC_CURL:-curl}"
pnpm_cmd="${MC_PNPM:-$root/node/bin/corepack pnpm}"
keep=3

release="$root/releases/$name"
staging="$root/staging"
database="$data/music-chairs.sqlite"
snapshot="$data/before-release.sqlite"

# Names are unique per install; never overwrite the release that may be serving.
if [ -e "$release" ]; then
  echo "release $name already exists; nothing was changed" >&2
  exit 1
fi

# corepack and pnpm find `node` through PATH, which sudo resets.
export PATH="$root/node/bin:$PATH"
rm -rf "$staging"
mkdir -p "$staging" "$root/releases"
tar -xzf "$archive" -C "$staging"
(cd "$staging" && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 $pnpm_cmd install --prod --frozen-lockfile)
mv "$staging" "$release"

previous=""
if [ -L "$root/current" ]; then
  previous="$(readlink "$root/current")"
fi

"$systemctl_cmd" stop music-chairs
# A consistent copy of the database before the new code (and any migration it
# carries) touches it, so a rollback can return to the matching data.
rm -f "$snapshot"
if [ -f "$database" ]; then
  "$sqlite3_cmd" "$database" ".backup '$snapshot'"
fi
ln -sfn "$release" "$root/current"
"$systemctl_cmd" start music-chairs

attempt=0
while [ "$attempt" -lt "$tries" ]; do
  if "$curl_cmd" -fsS "$health_url" >/dev/null 2>&1; then
    # Keep the newest releases, including the one just installed.
    (cd "$root/releases" && ls -1t | tail -n +$((keep + 1)) | while read -r old; do
      [ "$root/releases/$old" = "$release" ] || rm -rf "${root:?}/releases/$old"
    done)
    echo "release $name is healthy"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep "$delay"
done

echo "release $name failed its health check; rolling back" >&2
"$systemctl_cmd" stop music-chairs
if [ -f "$snapshot" ]; then
  cp "$snapshot" "$database"
  rm -f "$database-wal" "$database-shm"
fi
if [ -n "$previous" ]; then
  ln -sfn "$previous" "$root/current"
  "$systemctl_cmd" start music-chairs
  echo "returned to $(basename "$previous")" >&2
else
  echo "no previous release to return to; the app is stopped" >&2
fi
exit 1
