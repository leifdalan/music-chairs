---
slug: blazing-eel
title: Undo an agent's own uncommitted edit by editing the file, never with git checkout --
status: candidate
scope: methodology
proposed_surface: policy
filed: 2026-10-04
source: kickoff
occurrences:
  - date: 2026-10-04
    ref: "Phase 19.1 END"
---

In Phase 19.1, removing a one-line exclusion pnpm had added to `project/pnpm-workspace.yaml` was done with `git checkout -- project/pnpm-workspace.yaml`. The outcome was the intended one (the file returned to its committed content), but `git checkout --` is on CLAUDE.md's list of destructive git operations that belong to the operator, because it discards working-tree content without a trace and the checkout may be shared. Reaching for it to "undo my own change" is exactly the convenience the rule removes.

Do differently: revert an agent-owned working change by editing the file (or applying a reverse patch to the known lines) and confirm with `git diff`; treat any `git checkout --`, `git restore` or `git reset` impulse as a stop.
