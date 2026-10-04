#!/bin/bash
# Keeps the deploy keys (project/deploy/deploy-keys.pub, plan/phase-18.md) as one
# marked block in an authorized_keys file, run as root by provision.sh. Every
# line outside the block, including the operator's own key, is kept as it was;
# an empty keys file removes the block. The file is replaced in one move with
# mode 600, and the script refuses anything that could lock the operator out.
#
# Usage: install-deploy-keys.sh <keys-file> <authorized_keys> <owner>
set -euo pipefail

keys="$1"
target="$2"
owner="$3"
begin="# BEGIN music-chairs deploy keys"
end="# END music-chairs deploy keys"

if [ ! -r "$keys" ]; then
  echo "install-deploy-keys: the keys file $keys is missing or unreadable; nothing was changed" >&2
  exit 1
fi
if [ ! -s "$target" ]; then
  echo "install-deploy-keys: $target is missing or empty; refusing to create it" >&2
  exit 1
fi
tmp="$(mktemp "$(dirname "$target")/.authorized_keys.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

# awk ends every line it prints with a newline, so a last line without one is kept whole.
if ! awk -v b="$begin" -v e="$end" '
  $0 == b { if (inside) exit 2; inside = 1; next }
  $0 == e { if (!inside) exit 2; inside = 0; next }
  !inside { print }
  END { if (inside) exit 2 }
' "$target" >"$tmp"; then
  echo "install-deploy-keys: $target has an unmatched deploy-keys marker; nothing was changed" >&2
  exit 1
fi
if ! grep -q '^[^#[:space:]]' "$tmp"; then
  echo "install-deploy-keys: $target has no key outside the deploy block; nothing was changed" >&2
  exit 1
fi
# Key lines only: blank lines and comments in the keys file are not copied.
deploy_keys="$(grep -v -e '^[[:space:]]*$' -e '^[[:space:]]*#' "$keys" || true)"
if [ -n "$deploy_keys" ]; then
  printf '%s\n%s\n%s\n' "$begin" "$deploy_keys" "$end" >>"$tmp"
fi
chmod 600 "$tmp"
if [ "$(id -u)" -eq 0 ]; then
  chown "$owner:" "$tmp"
fi
mv "$tmp" "$target"
trap - EXIT
