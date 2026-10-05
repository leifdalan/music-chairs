---
slug: rugged-buzzard
title: Run mutation checks before telemetry finalizes; a test fix after finalization forces a park
status: candidate
scope: methodology
proposed_surface: skill
filed: 2026-10-04
source: kickoff
occurrences:
  - date: 2026-10-04
    ref: "Phase 19.2 PARK"
---

In Phase 19.2 every gate passed and the trace was finalized (close step 3 in policies/execution-telemetry.md). A mutation check was then run before writing the END block. One mutant survived, the test was strengthened, and the candidate moved. Gates on the new candidate recorded no timing in the finalized trace, acceptance validation requires timed final gates, and the run had to park and continue in a fresh run (about seven extra minutes and a second CI run).

Do differently: run mutation checks, and any other check that could prompt a test change, as part of the focused iteration before the code critique, or at the latest before the gate sequence. Nothing that can move the candidate belongs between telemetry finalization and the END block. The kickoff acceptance resource could name mutation checks as a pre-gate step so the ordering is mechanical.
