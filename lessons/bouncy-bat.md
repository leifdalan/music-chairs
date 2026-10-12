---
slug: bouncy-bat
title: zsh doesn't split an unquoted variable into words; never pass a command line through one
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-12
source: kickoff
occurrences:
  - date: 2026-10-12
    ref: "Phase 33 END"
---

In Phase 33 a loop ran two gates through `run-gate ... -- $ARGV` with `ARGV="bash <path>/steady-gate.sh"`. The agent shell is zsh, which (unlike bash) does not word-split an unquoted parameter, so the gate tool received one argument, "bash <path>", and refused it as absent from the active manifest. The refusal was read and the gate was rerun with its arguments written out.

Do differently: write each gate's argv literally (one `run-gate` per block), or use a zsh array (`args=(bash path)`, `"${args[@]}"`); never build a command line in a string variable.
