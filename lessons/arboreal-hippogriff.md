---
slug: arboreal-hippogriff
title: Stop a local server by its port, not by a command-line pattern; a survivor serves the old build
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-11
source: kickoff
occurrences:
  - date: 2026-10-11
    ref: "Phase 30 END"
---

In Phase 30 the screenshot server was stopped with `pkill -f "react-router-serve ./build/server/index.js"`, but the running process's command line is `node …/@react-router/serve/bin.cjs ./build/server/index.js`, so nothing was stopped. The next server could not bind the port, `curl /healthz` was answered by the survivor still holding the previous build in memory, and two rounds of screenshots showed a change as missing although the rebuilt bundle contained it (a browser cache was blamed first). `lsof -iTCP:<port> -sTCP:LISTEN` found the stale process.

Do differently: stop a local server by the PID listening on its port (`lsof -nP -t -iTCP:<port> -sTCP:LISTEN`), confirm the port is free before starting another, and after a rebuild confirm the served markup (curl) before reading screenshots.
