---
slug: loyal-dinosaur
title: A check piped into tail, or read from a log the shell refused to overwrite, reports success it never earned
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-03
source: kickoff
occurrences:
  - date: 2026-10-03
    ref: "Phase 10 PARK"
  - date: 2026-10-03
    ref: "Phase 13 END"
  - date: 2026-10-07
    ref: "Phase 26 END"
---

In Phase 10 a command chain wrote run variables into the session env file after a step whose failure was hidden behind `| /usr/bin/tail -1`: the pipeline's exit status was tail's, so the `&&` chain continued and appended bad values to the env file. In Phase 13 `check-plan-concreteness` failed (missing Definitions Read rows), but its output went through `| tail`, so the plan was captured and the plan reviewer registered anyway; the plan had to be fixed, recaptured and the review prompt's hash updated. Later in Phase 13 a test run redirected with `>` onto an existing log; the operator's zsh `noclobber` refused the write, the test runner never ran its output into the file, and the next `grep` read the previous run's "454 passed" while the command's own exit status was 1.

Do differently: never pipe a gating command into `tail`/`grep` when a later step depends on it. Redirect it to a file with `>|`, read `$?` in the same block, then show the tail. Where a pipe is unavoidable, set `pipefail` for the block. Treat a log's content as evidence only when the command that wrote it is known to have run in that block.

Phase 26 recurrence: the changed-path gate failed (the disk was full), but the same chained command went on to record that gate's diagnostic review as "PASS", because the review step ran after an `echo` that always succeeds rather than only on the gate's success. The acceptance validator refused the run, which surfaced it; the review was superseded with a correct FAILED record and the gate re-run. Give a gate and its review separate blocks, and write the review only after reading the gate's exit status.
