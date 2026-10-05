---
slug: jumping-lionfish
title: A parent's acceptance run has no named follow-up route; name one instead of borrowing direct-fix
status: candidate
scope: methodology
proposed_surface: bin
filed: 2026-10-04
source: kickoff
occurrences:
  - date: 2026-10-04
    ref: "Phase 19 END"
---

Closing Phase 19.3, the last child, required separately accepted evidence for its parent Phase 19 (`--parent-run`). The parent has no implementation of its own, so the run needed no roles, only its own gates on the unchanged product. `kickoff-evidence init` offers the routes initial, full-cycle, coder-only and direct-fix; in primary mode only direct-fix and coder-only need no role, and neither describes parent acceptance. The run was recorded as review lane light with route direct-fix, and its END block says what it really was.

Do differently: add a `parent-acceptance` follow-up route (no roles, the parent's own gates, primary acceptance against the parent's criteria) and document the last-child sequence in acceptance.md step by step (child gates, parent run, child finalize, child close with `--parent-run`), so the record names what happened.
