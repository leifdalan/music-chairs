---
slug: nice-ant
title: A phase that replaces persisted schema must put the reset in its demo entry point and refuse stale data by name
status: candidate
scope: methodology
proposed_surface: policy
filed: 2026-10-02
source: kickoff
occurrences:
  - date: 2026-10-02
    ref: "Phase 2 END (correction)"
  - date: 2026-10-02
    ref: "Phase 3 END (correction)"
---

Phase 2 added a required column to an existing table. Under the greenfield rule there is no migration, and `CREATE TABLE IF NOT EXISTS` silently leaves an older table as it was. The phase noted the reset in the README and in a note after the User Demo steps, but the demo's own entry point told the operator to "join or open a group from Phase 1". The operator did exactly that and saw only SQLite's generic "SQL logic error" on every request.

Remedies: (1) a User Demo whose phase replaces persisted state puts the reset command in its entry point, before any step, never as a trailing note; (2) the deliverable refuses state it cannot read, naming the file and the remedy (here, `openStore` now converts the open-time SQLite error into that message). The first is a change to `policies/user-demo-protocols.md`; the second is ordinary engineering already applied in this project.

Second occurrence (Phase 3): the demo entry point now said to reset first, and the refusal named the file, yet the operator again saw "SQL logic error" (Node prints the chained SQLite cause) with a Phase 2 database. Instructions alone did not survive a dev server kept running across phases. The project now backs up and replaces a stale database automatically in development, and refuses only in production. A remedy that depends on the operator re-reading a demo step each phase is weaker than one the development server applies itself.
