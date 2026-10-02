---
slug: hidden-wombat
title: Loader data is public page content; project server records to the fields the page needs
status: candidate
scope: local
proposed_surface: invariant
filed: 2026-10-02
source: kickoff
occurrences:
  - date: 2026-10-02
    ref: "Phase 1 plan review PLAN-F001"
---

React Router serializes every loader's return value into the server-rendered HTML for hydration, so anything a loader returns is readable by whoever loads the page. The Phase 1 plan returned store `Member` records (including their ids) from the group loader, while the same ids served as the unsigned device-identity cookie value: any visitor could have copied an organizer's id into their own cookie and gained organizer controls. The independent plan review caught it; the implementation projects members to `{ displayName, role, isViewer }` and a test asserts no member id or invite token reaches a non-organizer's page.

Rule candidate for this project's conventions: loaders return explicit projections, never store records, and any value used as a bearer secret (member ids, invite tokens) is withheld from viewers who are not entitled to it, with a test that searches the serialized loader data and rendered HTML for it.
