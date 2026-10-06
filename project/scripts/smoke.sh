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

# Everything a page loads is the site's own (plan/phase-19.1.md): stylesheets,
# scripts and images, apart from Gravatar pictures the privacy policy names.
# Links to other sites are not loads and are not checked.
same_origin_only() {
  curl -s -H "Cookie: ${2:-}" "$origin$1" >"$work/page.html"
  grep -oE '<(link|script|img)[^>]*>' "$work/page.html" | grep -oE ' (href|src)="[^"]*"' |
    cut -d'"' -f2 >"$work/loads.txt" || true
  while IFS= read -r url; do
    case "$url" in
      //*) fail "$1 loads $url from another site" ;;
      /* | "$origin"/* | https://www.gravatar.com/avatar/*) ;;
      *://*) fail "$1 loads $url from another site" ;;
    esac
  done <"$work/loads.txt"
}

echo "+ the built stylesheet and what the home page loads"
same_origin_only /
stylesheet="$(grep -oE '<link[^>]*rel="stylesheet"[^>]*>' "$work/page.html" | grep -oE 'href="[^"]*"' | cut -d'"' -f2 | head -1)"
[ -n "$stylesheet" ] || fail "the home page links no stylesheet"
curl -s "$origin$stylesheet" >"$work/app.css"
grep -qE '@theme|@apply' "$work/app.css" && fail "the stylesheet $stylesheet was not compiled by Tailwind"
# Tailwind inlines its own imports, so any @import left would load something else.
grep -q '@import' "$work/app.css" && fail "the stylesheet $stylesheet still imports something"
grep -q -- '--primary:' "$work/app.css" || fail "the stylesheet lacks the theme's --primary token"
grep -q '\.min-h-11' "$work/app.css" || fail "the stylesheet lacks the min-h-11 utility the buttons use"
grep -oE 'url\([^)]*\)' "$work/app.css" | grep -E '://' && fail "the stylesheet loads something from another site"
echo "  compiled stylesheet $stylesheet; nothing loaded from another site"

echo "+ GET /privacy"
privacy="$(curl -s "$origin/privacy")"
printf '%s' "$privacy" | grep -q 'including the Limited Use requirements' \
  || fail "privacy policy lacks the Limited Use statement"
printf '%s' "$privacy" | grep -q 'leifdalan+rtc@gmail.com' || fail "privacy policy lacks the contact"
echo "  privacy policy with the Limited Use statement and contact"

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
# A readable address: the name's slug and an 8-character short id (plan/phase-19.3.md).
printf '%s' "$location" | grep -Eq '^/g/thursday-quartet-[2-9a-km-np-z]{8}$' \
  || fail "the new group's address $location is not /g/thursday-quartet-<short id>"
short_id="${location##*-}"
stale_headers="$(curl -s -D - -o /dev/null "$origin/g/old-name-$short_id/schedule?times=list" | tr -d '\r')"
printf '%s\n' "$stale_headers" | head -1 | grep -q ' 301' \
  || fail "an out-of-date group address did not redirect permanently"
printf '%s\n' "$stale_headers" | grep -qi "^location: $location/schedule?times=list$" \
  || fail "an out-of-date group address did not redirect to $location/schedule?times=list"
printf '%s\n' "$stale_headers" | grep -qi '^cache-control: no-store' \
  || fail "the out-of-date address redirect may be cached"
echo "  readable address; an out-of-date name redirects (301, not cached) to it"

invite="$(curl -s -H "Cookie: $cookie" "$origin$location" | grep -o "$origin/join/[A-Za-z0-9_-]\{22\}" | head -1)"
[ -n "$invite" ] || fail "organizer's group page shows no invite URL"
echo "  organizer sees invite URL $invite"
curl -s "$origin$location" | grep -q "$invite" && fail "a visitor's group page shows the invite URL"
join_page="$(curl -s "$invite")"
printf '%s' "$join_page" | grep -q "Thursday Quartet" || fail "invite URL does not show the group name"
printf '%s' "$join_page" | grep -q 'name="displayName"' || fail "invite URL shows no name field"
echo "  invite URL returns the group's join page"
same_origin_only "$location" "$cookie"
echo "  the group page loads nothing from another site"

echo "+ GET /groups"
groups="$(curl -s -H "Cookie: $cookie" "$origin/groups")"
printf '%s' "$groups" | grep -q "href=\"$location/schedule\"" || fail "the groups page does not link the new group's schedule"
printf '%s' "$groups" | grep -q 'href="/groups"' || fail "the header does not link the groups page"
echo "  the groups page lists the new group; the header links it"

echo "+ propose from a request and confirm a rehearsal"
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
# Every proposal belongs to a request (plan/phase-17.md).
request_path="$(curl -s -D - -o /dev/null -X POST -H "Cookie: $cookie" "$origin$location/requests/new" \
  --data-urlencode "name=Autumn rehearsals" --data-urlencode "startDate=$rehearsal_date" \
  --data-urlencode "endDate=$rehearsal_date" --data-urlencode "windowStart-0=19:00" \
  --data-urlencode "windowEnd-0=22:00" | tr -d '\r' |
  awk -F': ' 'tolower($1) == "location" { print $2 }')"
case "$request_path" in "$location/requests/"*) ;; *) fail "creating a request did not redirect to it: $request_path" ;; esac
# Times are given on the request's own page (plan/phase-23.md); this is its Save without JavaScript.
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Cookie: $cookie" "$origin$request_path" \
  --data-urlencode "intent=save-dates" --data-urlencode "date=$rehearsal_date" \
  --data-urlencode "startTime=19:00" --data-urlencode "endTime=22:00")"
[ "$code" = 302 ] || fail "saving a date on the request returned HTTP $code"
availability_ok() {
  curl -s -H "Cookie: $cookie" "$origin$request_path" | sed 's/<!-- -->//g' >"$work/request.html"
  grep -q "aria-label=\"Thu $rehearsal_label, 7–10 PM\"" "$work/request.html" &&
    grep -q "Europe/London" "$work/request.html" &&
    ! grep -q "$location/availability" "$work/request.html"
}
availability_ok || fail "the request page does not show the date saved on it"
echo "  a date saved on the request shows there with its time"
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Cookie: $cookie" "$origin$location/schedule" \
  --data-urlencode "intent=propose" --data-urlencode "kind=weekly" \
  --data-urlencode "startDate=$rehearsal_date" --data-urlencode "startTime=19:30" \
  --data-urlencode "endTime=21:30" --data-urlencode "location=Studio B")"
[ "$code" = 404 ] || fail "proposing on the schedule page returned HTTP $code, not 404"
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Cookie: $cookie" "$origin$request_path" \
  --data-urlencode "intent=propose" --data-urlencode "kind=weekly" \
  --data-urlencode "startDate=$rehearsal_date" --data-urlencode "startTime=19:30" \
  --data-urlencode "endTime=21:30" --data-urlencode "location=Studio B")"
[ "$code" = 302 ] || fail "proposing a rehearsal from the request returned HTTP $code"
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
  grep -q "<li class=\"rehearsal confirmed\"><p class=\"slot-summary\">Every Thursday from $rehearsal_label, 7:30–9:30 PM" "$work/schedule.html" &&
    grep -q "At Studio B" "$work/schedule.html" &&
    grep -q "1 of 1 free" "$work/schedule.html" &&
    grep -q "1 yes · 0 no · 0 maybe" "$work/schedule.html" &&
    grep -q "From Autumn rehearsals" "$work/schedule.html" &&
    grep -q "1 of 1 confirmed" "$work/schedule.html" &&
    grep -q "Complete" "$work/schedule.html"
}
schedule_ok || fail "schedule page does not show the confirmed rehearsal, its RSVP and the overlap"
echo "  confirmed weekly rehearsal, its request, a yes answer and the overlap listed on the schedule page"
download_headers="$(curl -s -D - -o "$work/request.ics" -H "Cookie: $cookie" "$origin$request_path/calendar.ics" | tr -d '\r')"
printf '%s\n' "$download_headers" | grep -qi '^content-type: text/calendar' \
  || fail "the request's calendar download is not a calendar file"
grep -q "BEGIN:VEVENT" "$work/request.ics" || fail "the request's calendar download holds no rehearsal"
echo "  the complete request downloads as a calendar file"

for path in "/join/AAAAAAAAAAAAAAAAAAAAAA" "/join/not-a-token" "/g/AAAAAAAAAAAAAAAAAAAAAA" "/g/nope" "/g/thursday-quartet-zzzzzzzz"; do
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
