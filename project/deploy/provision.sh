#!/bin/bash
# Idempotent server setup for music-chairs on Debian 12, run as root by
# `bin/deploy release` before every release. Safe to run repeatedly: it installs
# what is missing and rewrites the configuration it owns.
#
# Inputs (environment): DOMAIN, PUBLIC_URL, NODE_VERSION, BUCKET, REGION.
# Files: the rest of project/deploy, unpacked next to this script.
set -euo pipefail

: "${DOMAIN:?}" "${PUBLIC_URL:?}" "${NODE_VERSION:?}" "${BUCKET:?}" "${REGION:?}"
here="$(cd "$(dirname "$0")" && pwd)"
export DEBIAN_FRONTEND=noninteractive

need_packages=()
for package in curl ca-certificates xz-utils sqlite3 unzip gnupg debian-keyring debian-archive-keyring apt-transport-https; do
  dpkg -s "$package" >/dev/null 2>&1 || need_packages+=("$package")
done
if [ "${#need_packages[@]}" -gt 0 ]; then
  apt-get update -q
  apt-get install -y -q "${need_packages[@]}"
fi

# Caddy from its official apt repository (automatic HTTPS).
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key |
    gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi

# AWS CLI v2, used only by the nightly backup.
if ! command -v aws >/dev/null 2>&1; then
  workdir="$(mktemp -d)"
  curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o "$workdir/awscli.zip"
  unzip -q "$workdir/awscli.zip" -d "$workdir"
  "$workdir/aws/install"
  rm -rf "$workdir"
fi

# Node at the version project/package.json pins, checked against nodejs.org's checksums.
node_dir="/opt/music-chairs/node-v$NODE_VERSION"
if [ ! -x "$node_dir/bin/node" ]; then
  workdir="$(mktemp -d)"
  archive="node-v$NODE_VERSION-linux-x64.tar.xz"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$archive" -o "$workdir/$archive"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$workdir/SHASUMS256.txt"
  (cd "$workdir" && grep " $archive\$" SHASUMS256.txt | sha256sum -c -)
  mkdir -p "$node_dir"
  tar -xJf "$workdir/$archive" -C "$node_dir" --strip-components=1
  rm -rf "$workdir"
fi
mkdir -p /opt/music-chairs/releases
ln -sfn "$node_dir" /opt/music-chairs/node

if ! id music-chairs >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/music-chairs --shell /usr/sbin/nologin music-chairs
fi
install -d -o music-chairs -g music-chairs -m 750 /var/lib/music-chairs
install -d -m 755 /etc/music-chairs /usr/local/lib/music-chairs /etc/systemd/system/music-chairs.service.d

# The app's settings, as a unit drop-in so `systemctl show -p Environment` can verify them.
cat >/etc/systemd/system/music-chairs.service.d/environment.conf <<EOF
[Service]
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=MUSIC_CHAIRS_DB=/var/lib/music-chairs/music-chairs.sqlite
Environment=MUSIC_CHAIRS_PUBLIC_URL=$PUBLIC_URL
EOF

# Where the nightly backup goes (not secret; the write-only key is in backup.env).
cat >/etc/music-chairs/backup-target.env <<EOF
BUCKET=$BUCKET
REGION=$REGION
EOF

install -m 644 "$here/music-chairs.service" /etc/systemd/system/music-chairs.service
install -m 644 "$here/music-chairs-backup.service" /etc/systemd/system/music-chairs-backup.service
install -m 644 "$here/music-chairs-backup.timer" /etc/systemd/system/music-chairs-backup.timer
install -m 755 "$here/backup.sh" /usr/local/lib/music-chairs/backup.sh
install -m 755 "$here/install-release.sh" /usr/local/lib/music-chairs/install-release.sh
sed "s/__DOMAIN__/$DOMAIN/g" "$here/Caddyfile" >/etc/caddy/Caddyfile

systemctl daemon-reload
systemctl enable --now caddy
systemctl reload caddy
systemctl enable music-chairs.service
systemctl enable --now music-chairs-backup.timer
echo "provisioned"
