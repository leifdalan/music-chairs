---
slug: imperious-bug
title: A phase that deletes a file linked from plan/INDEX.md cannot close; update the INDEX before authority capture
status: candidate
scope: methodology
proposed_surface: skill
filed: 2026-10-03
source: kickoff
occurrences:
  - date: 2026-10-03
    ref: "Phase 10 PARK"
  - date: 2026-10-06
    ref: "Phase 23 PARK"
---

Phase 10 replaced the Phase 7 import page, and `plan/INDEX.md`'s Critical-Files Map linked to that file. The plan review flagged it (PLAN-F008) and the plan scheduled the map edit as a close-time ripple. At close, `kickoff-evidence close` runs `bin/check-catalogs --closing-phase` on the live tree, which refuses the dead link, while the proposed `--ledger-after` may change only the closing phase's status, so the map row cannot be fixed inside the run either. With every gate green and the deploy done, the run could only park, and the INDEX fix moved to a fresh continuation run.

Remedy candidates: during planning, check every INDEX (and other declared-authority) link against the plan's deleted and moved paths, and make that INDEX edit before the `🚧` flip and authority capture, like other owner decisions; or let the accepted close admit a declared Critical-Files Map ripple in the ledger proposal.

Phase 23 recurrence: the phase deleted `project/app/routes/availability.tsx`, which the Critical-Files Map's Google Calendar row linked. Neither the plan nor its review listed the INDEX link (the review did list other files that used the route). CI on the draft pull request failed on `check-catalogs`, the accepted close would have refused the same dead link, and the run parked after all its local gates; the link was fixed between runs and a continuation closed it. A mechanical pre-capture check (for every path the plan deletes, grep `plan/INDEX.md` and other declared authorities) would have caught it in seconds.
