---
slug: zealous-chimera
title: Working on the tree while a read-only review runs, or reopening a stage before closing the last, leaves evidence the run cannot use
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-11
source: kickoff
occurrences:
  - date: 2026-10-11
    ref: "Phase 27 PARK"
---

In Phase 27 the primary drafted two planned files while the independent plan review was running in the background. The reviewer's dispatch and return candidates then differed, so `ingest-findings` refused the advice ("advice candidate differs from the actual read-only dispatch") and a second review pass was spent only to get bindable advice. Recovering, the primary opened the second planning stage a few seconds before closing the implementation stage it had opened too early; the trace then held two overlapping orchestration stages, which command zero refuses at acceptance ("orchestration stage spans must not overlap"). Spans cannot be edited, so the run parked after its implementation and critique were done and continued in a fresh run.

Do differently: while any read-only role is running, write nothing in the checkout (draft in scratch, or wait). When a stage must be re-entered, close the current stage first, in its own block, and only then open the next one; never open a stage in the same command that might fail before the previous one closes.
