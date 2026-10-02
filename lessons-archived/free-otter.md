---
slug: free-otter
title: The kickoff END template must use the literal "Lessons:" heading that bin/check-log requires
status: codified
scope: methodology
proposed_surface: skill
filed: 2026-10-02
source: kickoff
closed: 2026-10-02
graduated_to: .claude/skills/kickoff/close.md
occurrences:
  - date: 2026-10-02
    ref: "Phase 1 END log correction"
---

The kickoff close resource's END template headed the lessons section "Lessons (per `policies/lessons.md`):", while `policies/orchestration-control-plane.md`, `policies/log-discipline.md` and `bin/check-log-prefix --require-terminal-lessons` require every newly appended END or PARK block to contain a literal "Lessons:" line. Following the template produced an END block that the handoff gate would refuse. Because existing blocks are never edited and the admitted repairs cover only relocation and final newlines, it took an operator-approved one-line correction to recover.

Codified 2026-10-02 with the operator's approval of that correction: the close template now prescribes "Lessons:". A template line that a checker enforces should match the checker byte-for-byte; when a policy and a skill template disagree, the policy wins.
