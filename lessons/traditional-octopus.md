---
slug: traditional-octopus
title: A correction to a completed phase writes a second phase-N dashboard that the incremental index drops but the checker's full rebuild keeps
status: candidate
scope: methodology
proposed_surface: bin
filed: 2026-10-04
source: kickoff
occurrences:
  - date: 2026-10-04
    ref: "Phase 10 END (correction)"
---

After the Phase 10 direct-fix correction, `execution-telemetry dashboard --phase 10` wrote reports/execution/2026-10-04/phase-10/ and updated index-data.js by phase id. That replaced the original 2026-10-03 Phase 10 entry: 16 phases. `bin/check-execution-dashboards` re-renders every phase-*/data.js from scratch and keeps both: 17 phases. The handoff gate failed with "stale dashboard artifact: reports/execution/index-data.js". The new correction trace (operation phase.10) also changed the original Phase 10 payload's aggregates. The repair was a deterministic re-render of the archive with the checker's own renderer.

Do differently: make the incremental dashboard write and the checker's rebuild agree on how a second dashboard for the same phase id is indexed (keep both, keyed by date and phase). Until then, after a correction's dashboard, re-render the archive as the checker does before the handoff gate.
