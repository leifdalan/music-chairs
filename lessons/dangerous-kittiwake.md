---
slug: dangerous-kittiwake
title: Committing a file deletion moves the candidate identity; stage deletions with git rm
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-11
source: kickoff
occurrences:
  - date: 2026-10-11
    ref: "Phase 29 END"
---

In Phase 29 the implementation deleted project/app/components/slot-fields.tsx. The change was captured and accepted while the file was deleted in the working tree but still tracked; committing the deletion for the CI gate then gave a different candidate identity with no byte change, so the gates' candidate no longer matched the accepted one and a third capture and a renewed acceptance were needed. Staging that deletion, the primary first used `git add -A -- <paths>`: scoped to explicit paths, but against the letter of the hard rule ("never git add -A"); it was unstaged and redone with `git add` plus `git rm --cached` before committing.

Do differently: when a phase deletes files, stage the deletion with `git rm` (never `git add -A`), and capture the change for acceptance after the in-progress commit, or expect the candidate to move once.
