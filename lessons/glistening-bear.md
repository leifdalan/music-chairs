---
slug: glistening-bear
title: The agent shell is zsh, where an unquoted variable holding several words stays one word; use arrays
status: candidate
scope: methodology
proposed_surface: policy
filed: 2026-10-03
source: kickoff
occurrences:
  - date: 2026-10-03
    ref: "Phase 7 END"
---

In Phase 7 a mutation check stored four file paths in `FILES="a b c d"` and looped `for f in $FILES`. In bash that splits into four words; in zsh, the agent's shell, it is one word, so `cp $f backup` failed for the whole string, no backups were made, and each later `restore` failed too. Nine mutations accumulated in uncommitted source and every later test run measured the sum, not one mutation. They were undone by assertion-checked reverse replacement and the checks rerun with a zsh array (`files=(a b c d)`), which also exposed a test that had been passing for the wrong reason. Two defences follow: list words in zsh arrays (or quote nothing and rely on bash semantics only inside repository scripts), and make any loop that edits source stop at the first failed backup (`|| exit 1`) before mutating anything.
