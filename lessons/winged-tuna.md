---
slug: winged-tuna
title: Bulk regex edits across files must assert their expected matches, or they change code they were not aimed at
status: candidate
scope: methodology
proposed_surface: policy
filed: 2026-10-03
source: kickoff
occurrences:
  - date: 2026-10-03
    ref: "Phase 8 END"
  - date: 2026-10-04
    ref: "Phase 17 END"
---

Phase 8 removed a now-unused `busy` prop from six route files with one regex pass that deleted every line consisting of `busy,`. On the import page that also deleted the `busy,` argument of `proposeFreeSlots({ busy, ... })`, where `busy` meant Google's busy periods; lint flagged the then-unused variable and it was restored before any test ran. The other scripted edits in the phase asserted that each old string occurred exactly once and stopped otherwise, and they never misfired. Mechanical edits spanning many files should print or assert their match count per file, and a name reused for different meanings (`busy` for navigation state and for calendar data) is a reason to edit by hand.

Phase 17 recurrence, in single-file slicing rather than regex: an edit script cut the schedule route between `s.index(a)` and `s.index(b)`, but `b`'s text also matched an indented line earlier in the file, so the slice duplicated a block; a second script cut from a function's start to end of file instead of to the function's end. The type check caught both and the file was rebuilt from HEAD. Slice boundaries need the same uniqueness assertion as replacements, and an end marker searched from the start index.
