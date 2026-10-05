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
  - date: 2026-10-02
    ref: "Phase 5 END"
  - date: 2026-10-03
    ref: "Phase 10 PARK"
  - date: 2026-10-03
    ref: "Phase 11 END"
  - date: 2026-10-03
    ref: "Phase 12 END"
  - date: 2026-10-03
    ref: "Phase 13 END"
  - date: 2026-10-04
    ref: "Phase 19.2 END"
---

The Phase 4 User Demo was tightened in the phase file at entry, as the phase asked, and the phase file was then hashed as an authority for the run. The code critique found that one "what to look for" item (answers carry over from proposed to confirmed) could not be reached from the suggested inputs, which confirmed the rehearsal before anyone answered. Fixing the phase file mid-run would have broken authority integrity, so the corrected order could only be carried in the END block and the operator report.

Remedy candidate: when a demo is written at phase entry, walk each "what to look for" item back to the suggested inputs that produce it before marking 🚧 and capturing; or let the plan reviewer check demo reachability, since it reads the phase file before any code exists.

Phase 5 recurrence: the code critique noted that the phase file still recorded an $8 forecast warning while the operator had ruled $9.50 during planning. Editing the phase file to fix it moved a captured authority; acceptance validation refused with "declared authority changed", the edit was reverted to the captured bytes, and the whole gate sequence (including the real deploy) ran again on the restored candidate. The ruling lives in the END block. The same remedy covers both cases: settle every phase-file statement, including rulings made during planning, before capture, and route later corrections to the END block.

Phase 10 recurrence: the demo tightened at entry says "From the request, open My availability", but the request page has no link by that name; the request-scoped calendar opens from its "Add HH:MM–HH:MM" links. The code critique found it (CODE-F005); the corrected step goes to the END block because the phase file is captured.

Phase 11 recurrence: the demo was walked for reachability before capture, but a plan-review disposition made afterwards (PLAN-F009: hide Remove and Remove-organizer for the only organizer) changed the UI the captured demo describes, so its variation "try removing yourself as the only organizer (refused)" no longer has a button to press. Plan dispositions that change visible controls need the same reachability check against the captured demo, with the correction routed to the END block.

Phase 12 recurrence: the demo was written before planning settled how returning by name and Calendar consent behave, and two steps became unreachable: the two-Spares step reuses a private window that already holds Spare's membership, and the decline variation has nothing to untick while an earlier grant exists. A planning-time operator ruling (members only) also had to go to the END block. The corrections are in the END block's notes.

Phase 13 recurrence: a plan-review disposition (PLAN-F002) moved Add members from a section of the group page to its own page, after the demo describing "the group page's Add members section" and new members appearing "in the member list at once" was captured. The code critique found it (CODE-F003); the corrected wording is in the END block.

Phase 19.2 recurrence: the demo's variation "Leave a group you're the only organizer of (it refuses)" stopped matching once the groups page showed the only organizer the reason in place of a Leave button, a deviation declared during implementation. The code critique found it (CODE-F007). The corrected wording goes to the END block because the phase file is captured.
