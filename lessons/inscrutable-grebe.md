---
slug: inscrutable-grebe
title: Before screenshotting or probing a local build, check who owns the port and when it started
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-04
source: kickoff
occurrences:
  - date: 2026-10-04
    ref: "Phase 19.2 END"
---

In Phase 19.2 the first screenshots of the production build showed the old home page and a 404 for the new `/groups` route. A server started earlier in the session (through `nohup corepack pnpm run start … &`) had outlived its shell and still held the port, serving the build that was current when it started. A new `pnpm run start` failed with EADDRINUSE into its log, which went unread, so the screenshots came from the stale server. It happened twice: `pnpm run start` spawns `react-router-serve` as a child, and killing the wrapper's background task left the child listening. A database reset on the next start also wiped the seeded data.

Do differently: before taking screenshots or probing a local build, run `lsof -iTCP:<port> -sTCP:LISTEN` and compare the owner's start time with the build's. Start the server by executing `react-router-serve` directly, so there is one process to stop, and read the server log's first lines for a listen error before trusting anything it serves. If this recurs, a small `project/scripts/preview.sh` that refuses an occupied port would make the check mechanical.
