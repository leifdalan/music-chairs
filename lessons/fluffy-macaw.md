---
slug: fluffy-macaw
title: A ScheduleWakeup set as a fallback outside /loop fires later as a stale prompt
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-03
source: kickoff
occurrences:
  - date: 2026-10-03
    ref: "Phase 14 END"
---

During Phase 13 a 30-minute ScheduleWakeup was set as a fallback in case the background code critic never notified. The critic notified normally and the phase closed, but the wakeup still fired twice later, during Phase 14, as a prompt saying "Continue Phase 13 kickoff: read the code critic result…". It arrived as an ordinary turn and had to be recognised as stale and answered.

Do differently: outside a /loop session, do not schedule wakeups for background work the harness already tracks; its completion notification is the signal. If a fallback is ever needed, make its prompt check whether the work is still pending rather than naming a step.
