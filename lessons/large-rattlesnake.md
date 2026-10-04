---
slug: large-rattlesnake
title: Server-rendered tests cannot see what a form keeps after a redirect; plan client-state checks explicitly
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-04
source: kickoff
occurrences:
  - date: 2026-10-04
    ref: "Phase 15 END"
---

In Phase 15 the "Propose selected" picker redirected back to the same page after a successful proposal. Because the route stayed mounted and the free times did not change, React kept the ticked boxes and the typed location, inviting the organizer to propose the same times again. Every test rendered pages on the server with `renderToString`, which starts from fresh markup each time, so the suite was green; the code critique found it by reading the code (CODE-F001). The same blind spot hid that a folded `<details>` would not reopen on a second "Propose again" (CODE-F003).

Do differently: when a form posts back to the page it lives on, decide in the plan what its fields should hold afterwards and how that is enforced (for example a key that changes on success), and name the check that proves it: a client-side render test if the project has one, otherwise an explicit User Demo step.
