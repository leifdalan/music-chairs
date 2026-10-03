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
  - date: 2026-10-02
    ref: "Phase 2 END"
  - date: 2026-10-03
    ref: "Phase 10 PARK"
  - date: 2026-10-03
    ref: "Phase 13 END"
---

In Phase 1 an inline `./../bin/python - <<EOF` edit script launched from `project/` used `project`-relative paths (`vitest.config.ts`). The wrapper resolves the interpreter independently of the caller's working directory and the script raised `FileNotFoundError`; because it was chained with `;` before the test run, the tests ran against the unedited config and wrote a real SQLite file into `project/data/`. The stray file was found and removed before capture.

Do differently: give inline edit scripts repository-root-relative (or absolute) paths, assert each edit applied (`assert t.count(old) == 1`), and chain the follow-up command with `&&` so a failed edit stops the sequence.

Second occurrence (Phase 2): a red-witness mutation applied with `sed` matched nothing because Prettier had reflowed the target line; the follow-up test run stayed green and briefly looked like evidence. The applied-count check (`grep -c` printing 0) was the only signal. A mutation or inline edit is evidence only after an assertion that it changed the file.

Phase 10 recurrence: an inline `../bin/python` script started from `project/` used `app/...` paths and raised `FileNotFoundError`; it was chained so nothing else ran, and it was rerun from the root.

Phase 13 recurrence: an edit script for `project/tests/calendar-consent.test.ts` ran from `project/` with a project-relative path and raised `FileNotFoundError`; because the formatter and test run were chained with `;`, the unedited tests ran green and only the traceback revealed nothing had changed. Rerun from the repository root with `project/`-prefixed paths.
