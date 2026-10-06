---
slug: juicy-jaybird
title: An unquoted heredoc feeding a script runs every backticked span in its text as a shell command
status: candidate
scope: methodology
proposed_surface: policy
filed: 2026-10-06
source: kickoff
occurrences:
  - date: 2026-10-06
    ref: "Phase 22 END"
---

In Phase 22, a plan revision was written by a Python script passed through an unquoted heredoc (`<<EOF`) so that `$RUN_DIR` would expand. The script's strings quoted Markdown with backticked identifiers and paths, and the shell ran each backticked span as a command substitution before Python saw it: `open`, `required`, `onChange`, file paths and more were executed (most failed as "command not found"; `open` printed its usage), and the script then failed its own assertion because the text had changed. Nothing harmful ran this time, but any backticked word that names a real command would have executed with the agent's permissions.

Do differently: feed scripts and any text containing backticks through a quoted heredoc (`<<'EOF'`) or a file written with the file tool, and pass values in through the environment (`RUN_DIR=$RUN_DIR python3 script.py`) rather than by shell expansion.
