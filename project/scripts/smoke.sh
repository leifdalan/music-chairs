#!/bin/bash
# Production-build smoke: builds the app, serves it with a throwaway database,
# and checks the create → invite → join path, not-found pages, and that data
# survives a real server restart. Usage: scripts/smoke.sh [port] (default 3917).
set -u
cd "$(dirname "$0")/.." || exit 1

port="${1:-3917}"
origin="http://localhost:$port"
work="$(mktemp -d)"
export MUSIC_CHAIRS_DB="$work/smoke.sqlite"
export PORT="$port"
server=""

# Run the server in its own process group so stopping it also stops the
# react-router-serve process that pnpm starts beneath it.
set -m

stop_server() {
  if [ -n "$server" ]; then
    kill -TERM -- "-$server" 2>/dev/null
    wait "$server" 2>/dev/null
    server=""
  fi
}

finish() {
  stop_server
  rm -rf "$work"
}
trap finish EXIT

fail() {
  echo "SMOKE FAIL: $*"
  [ -f "$work/server.log" ] && sed 's/^/  server: /' "$work/server.log"
  exit 1
}

start_server() {
  if curl -s -o /dev/null "$origin/"; then
    fail "port $port is already serving before start"
  fi
  : > "$work/server.log"
  corepack pnpm run preview > "$work/server.log" 2>&1 &
  server=$!
  for _ in $(seq 1 100); do
    curl -s -o /dev/null "$origin/" && return 0
    kill -0 "$server" 2>/dev/null || fail "server exited during start"
    sleep 0.1
  done
  fail "server did not start on $origin"
}

echo "+ corepack pnpm run build"
corepack pnpm run build > "$work/build.log" 2>&1 || {
  cat "$work/build.log"
  exit 1
}

start_server
echo "+ GET /"
curl -s "$origin/" | grep -q 'name="groupName"' || fail "home page lacks the create-group form"
echo "  server-rendered create-group form"

echo "+ POST /?index"
headers="$(curl -s -D - -o /dev/null -X POST "$origin/?index" \
  --data-urlencode "groupName=Thursday Quartet" --data-urlencode "displayName=Viola" | tr -d '\r')"
status="$(printf '%s\n' "$headers" | head -1)"
location="$(printf '%s\n' "$headers" | awk -F': ' 'tolower($1) == "location" { print $2 }')"
cookie="$(printf '%s\n' "$headers" | awk -F': ' 'tolower($1) == "set-cookie" { print $2 }' | cut -d';' -f1)"
case "$status" in *" 302"*) ;; *) fail "create did not redirect: $status" ;; esac
[ -n "$cookie" ] || fail "create set no membership cookie"
echo "  302 to $location"

invite="$(curl -s -H "Cookie: $cookie" "$origin$location" | grep -o "$origin/join/[A-Za-z0-9_-]\{22\}" | head -1)"
[ -n "$invite" ] || fail "organizer's group page shows no invite URL"
echo "  organizer sees invite URL $invite"
curl -s "$origin$location" | grep -q "$invite" && fail "a visitor's group page shows the invite URL"
join_page="$(curl -s "$invite")"
printf '%s' "$join_page" | grep -q "Thursday Quartet" || fail "invite URL does not show the group name"
printf '%s' "$join_page" | grep -q 'name="displayName"' || fail "invite URL shows no name field"
echo "  invite URL returns the group's join page"

for path in "/join/AAAAAAAAAAAAAAAAAAAAAA" "/join/not-a-token" "/g/AAAAAAAAAAAAAAAAAAAAAA" "/g/nope"; do
  code="$(curl -s -o "$work/not-found.html" -w '%{http_code}' "$origin$path")"
  [ "$code" = 404 ] || fail "$path returned HTTP $code"
  grep -q "Page not found" "$work/not-found.html" || fail "$path did not render the not-found page"
  echo "  $path -> 404 Page not found"
done

echo "+ restart server"
stop_server
curl -s -o /dev/null "$origin/" && fail "server still answering after stop"
echo "  stopped: $origin refuses connections"
start_server
curl -s -H "Cookie: $cookie" "$origin$location" | grep -q "Viola" || fail "group page lost its organizer after restart"
curl -s "$invite" | grep -q "Thursday Quartet" || fail "invite link stopped working after restart"
echo "  group, organizer and invite link present after restart"

echo "SMOKE PASS"
