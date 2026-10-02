---
slug: lively-salamander
title: bin/python runs from the repository root, so relative paths in inline scripts resolve there
status: candidate
scope: local
proposed_surface: bin
filed: 2026-10-02
source: kickoff
occurrences:
  - date: 2026-10-02
    ref: "Phase 1 PARK"
---

In Phase 1 an inline `./../bin/python - <<EOF` edit script launched from `project/` used `project`-relative paths (`vitest.config.ts`). The wrapper resolves the interpreter independently of the caller's working directory and the script raised `FileNotFoundError`; because it was chained with `;` before the test run, the tests ran against the unedited config and wrote a real SQLite file into `project/data/`. The stray file was found and removed before capture.

Do differently: give inline edit scripts repository-root-relative (or absolute) paths, assert each edit applied (`assert t.count(old) == 1`), and chain the follow-up command with `&&` so a failed edit stops the sequence.
