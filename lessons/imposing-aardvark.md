---
slug: imposing-aardvark
title: A START block that copies a phase's Deliverables verbatim carries plan/-relative links into LOG.md, where they break
status: candidate
scope: methodology
proposed_surface: skill
filed: 2026-10-03
source: kickoff
occurrences:
  - date: 2026-10-03
    ref: "Phase 10 PARK"
---

Preflight Step 2 tells the orchestrator to use the phase's Deliverables list verbatim in the START block. Phase 10's deliverables linked to other phases (`[Phase 9](phase-9.md)`), which resolve from `plan/` but not from `LOG.md` at the repository root. `bin/check-catalogs` refuses the broken links, which would have failed the bare `./bin/check all` handoff gate, and the append-only log has no admitted repair for editing a block's text. The operator approved a one-off correction of the uncommitted block (three link targets, committed prefix verified unchanged).

Remedy candidates: `bin/log-append` (or the START instruction) rewrites relative link targets against `LOG.md`'s location, or strips links to plain text; or `bin/log-append` runs the link check on the block before appending, so the defect is caught while it can still be declined.
