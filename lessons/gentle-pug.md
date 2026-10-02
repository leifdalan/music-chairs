---
slug: gentle-pug
title: A User Demo written into the phase file at entry becomes captured authority; check its reachability before capture
status: candidate
scope: methodology
proposed_surface: policy
filed: 2026-10-02
source: kickoff
occurrences:
  - date: 2026-10-02
    ref: "Phase 4 END"
---

The Phase 4 User Demo was tightened in the phase file at entry, as the phase asked, and the phase file was then hashed as an authority for the run. The code critique found that one "what to look for" item (answers carry over from proposed to confirmed) could not be reached from the suggested inputs, which confirmed the rehearsal before anyone answered. Fixing the phase file mid-run would have broken authority integrity, so the corrected order could only be carried in the END block and the operator report.

Remedy candidate: when a demo is written at phase entry, walk each "what to look for" item back to the suggested inputs that produce it before marking 🚧 and capturing; or let the plan reviewer check demo reachability, since it reads the phase file before any code exists.
