#!/bin/bash
# Production-build smoke: builds the app, serves it with a throwaway database,
# and checks the create → invite → join path, adding availability, proposing,
# confirming and answering a rehearsal, not-found pages, and that data survives a real
# server restart. Usage: scripts/smoke.sh [port] (default 3917).
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
  --data-urlencode "groupName=Thursday Quartet" --data-urlencode "displayName=Viola" \
  --data-urlencode "timeZone=Europe/London" | tr -d '\r')"
status="$(printf '%s\n' "$headers" | head -1)"
location="$(printf '%s\n' "$headers" | awk -F': ' 'tolower($1) == "location" { print $2 }')"
# Only the membership cookie: the redirect also sets a one-shot toast cookie.
cookie="$(printf '%s\n' "$headers" | awk -F': ' 'tolower($1) == "set-cookie" && $2 ~ /^mc_members=/ { print $2 }' | cut -d';' -f1)"
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

echo "+ POST availability"
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Cookie: $cookie" "$origin$location/availability" \
  --data-urlencode "intent=create" --data-urlencode "kind=weekly" \
  --data-urlencode "startDate=2026-01-01" --data-urlencode "startTime=19:00" \
  --data-urlencode "endTime=22:00")"
[ "$code" = 302 ] || fail "adding availability returned HTTP $code"
availability_ok() {
  curl -s -H "Cookie: $cookie" "$origin$location/availability" | sed 's/<!-- -->//g' >"$work/availability.html"
  grep -q "Every Thursday from 1 Jan, 19:00–22:00" "$work/availability.html" &&
    grep -q "All times are in Europe/London" "$work/availability.html" &&
    grep -q '<ul class="occurrences"><li><span>Thu ' "$work/availability.html" &&
    ! grep -q "No upcoming times" "$work/availability.html"
}
availability_ok || fail "availability page does not list the weekly time"
echo "  weekly time listed on the availability page"

echo "+ propose and confirm a rehearsal"
# The first Thursday at least a week ahead: never in the past, and inside the
# eight-week window where its dates can be answered. Node does the date
# arithmetic because BSD and GNU date disagree.
dates="$(corepack pnpm exec node -e '
  const day = new Date(Date.now() + 7 * 86400000);
  day.setUTCDate(day.getUTCDate() + ((4 - day.getUTCDay() + 7) % 7));
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  console.log(day.toISOString().slice(0, 10) + " " + day.getUTCDate() + " " + months[day.getUTCMonth()]);
')"
rehearsal_date="${dates%% *}"
rehearsal_label="${dates#* }"
[ -n "$rehearsal_date" ] || fail "could not compute the rehearsal date"
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Cookie: $cookie" "$origin$location/schedule" \
  --data-urlencode "intent=propose" --data-urlencode "kind=weekly" \
  --data-urlencode "startDate=$rehearsal_date" --data-urlencode "startTime=19:30" \
  --data-urlencode "endTime=21:30" --data-urlencode "location=Studio B")"
[ "$code" = 302 ] || fail "proposing a rehearsal returned HTTP $code"
rehearsal="$(curl -s -H "Cookie: $cookie" "$origin$location/schedule" |
  grep -o 'name="intent" value="confirm"/><input type="hidden" name="rehearsalId" value="[A-Za-z0-9_-]\{22\}"' |
  grep -o '[A-Za-z0-9_-]\{22\}' | head -1)"
[ -n "$rehearsal" ] || fail "schedule page shows no confirm button for the proposed rehearsal"
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Cookie: $cookie" "$origin$location/schedule" \
  --data-urlencode "intent=confirm" --data-urlencode "rehearsalId=$rehearsal")"
[ "$code" = 302 ] || fail "confirming the rehearsal returned HTTP $code"
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Cookie: $cookie" "$origin$location/schedule" \
  --data-urlencode "intent=rsvp" --data-urlencode "rehearsalId=$rehearsal" \
  --data-urlencode "date=$rehearsal_date" --data-urlencode "answer=yes")"
[ "$code" = 302 ] || fail "answering yes returned HTTP $code"
schedule_ok() {
  curl -s -H "Cookie: $cookie" "$origin$location/schedule" | sed 's/<!-- -->//g' >"$work/schedule.html"
  grep -q "<li class=\"rehearsal confirmed\"><p class=\"slot-summary\">Every Thursday from $rehearsal_label, 19:30–21:30" "$work/schedule.html" &&
    grep -q "At Studio B" "$work/schedule.html" &&
    grep -q "1 of 1 free" "$work/schedule.html" &&
    grep -q "1 yes · 0 no · 0 maybe" "$work/schedule.html"
}
schedule_ok || fail "schedule page does not show the confirmed rehearsal, its RSVP and the overlap"
echo "  confirmed weekly rehearsal, a yes answer and the overlap listed on the schedule page"

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
availability_ok || fail "availability lost after restart"
schedule_ok || fail "rehearsal lost after restart"
echo "  group, organizer, invite link, availability and rehearsal present after restart"

echo "SMOKE PASS"
