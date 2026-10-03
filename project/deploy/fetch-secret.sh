#!/bin/bash
# Runs as root just before the app starts (ExecStartPre=+ in music-chairs.service).
# Reads the Google OAuth client secret from Parameter Store with the server's
# read-only key and writes it to the root-only environment file systemd hands
# to the app. Neither the key nor that file is readable by the app's user; only
# the secret reaches the app. Without the key or the parameter the app still
# starts, with Google sign-in unavailable.
#
# Each try is bounded (5 s to connect, 10 s to read, no AWS CLI retries), so all
# five fit well inside the unit's start timeout: a hanging endpoint delays the
# start but never fails it. Five tries 2 s apart also cover the seconds a
# just-created key takes to become valid on the first deploy.
#
# Paths, the AWS CLI and the retry pacing can be overridden through the
# environment so this can be tested without AWS or systemd.
set -uo pipefail

app_env="${MC_APP_ENV:-/etc/music-chairs/app.env}"
secret_env="${MC_SECRET_ENV:-/run/music-chairs/google.env}"
aws_cmd="${MC_AWS:-aws}"
tries="${MC_FETCH_TRIES:-5}"
delay="${MC_FETCH_DELAY:-2}"
parameter="${MUSIC_CHAIRS_GOOGLE_SECRET_PARAMETER:-}"
region="${MUSIC_CHAIRS_AWS_REGION:-}"

errors="$(mktemp)"
trap 'rm -f "$errors"' EXIT
rm -f "$secret_env"

unavailable() {
  echo "music-chairs: Google sign-in unavailable: $1" >&2
  exit 0
}

{ [ -n "$parameter" ] && [ -n "$region" ]; } || unavailable "no parameter configured"
[ -r "$app_env" ] || unavailable "no key at $app_env"

attempt=1
while :; do
  # The key is loaded only into this subshell's environment.
  if secret="$(
    set -a
    # shellcheck source=/dev/null
    . "$app_env"
    set +a
    AWS_MAX_ATTEMPTS=1 "$aws_cmd" ssm get-parameter --name "$parameter" --with-decryption \
      --region "$region" --query Parameter.Value --output text \
      --cli-connect-timeout 5 --cli-read-timeout 10 2>"$errors"
  )" && [ -n "$secret" ]; then
    (umask 077 && printf 'MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET=%s\n' "$secret" >"$secret_env")
    echo "music-chairs: Google client secret loaded"
    exit 0
  fi
  grep -q ParameterNotFound "$errors" && unavailable "parameter $parameter does not exist"
  [ "$attempt" -ge "$tries" ] && unavailable "could not read $parameter: $(head -c 300 "$errors")"
  attempt=$((attempt + 1))
  sleep "$delay"
done
