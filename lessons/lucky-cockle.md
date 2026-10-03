---
slug: lucky-cockle
title: Code with backslash escapes written through a shell heredoc can lose a backslash; write such files with the file tool
status: candidate
scope: methodology
proposed_surface: policy
filed: 2026-10-03
source: kickoff
occurrences:
  - date: 2026-10-03
    ref: "Phase 7 END"
---

Twice in Phase 7, TypeScript written with `cat >| file <<'EOF'` arrived with `"\\;"` (an escaped backslash before a semicolon) turned into `"\;"`, although the heredoc delimiter was quoted. Lint caught the source file (`no-useless-escape`) and a failing test caught the test file; other escapes such as `"\\,"` and `"\\n"` survived. The cause was not isolated. Writing files that contain backslash escapes with the file-writing tool, or checking them with a search for single-backslash sequences right after a shell write, avoids shipping a silently changed string.
