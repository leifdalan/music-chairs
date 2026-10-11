---
slug: versed-lorikeet
title: Inserting a CSS rule by anchoring on one line of a selector list splits the list
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-11
source: kickoff
occurrences:
  - date: 2026-10-11
    ref: "Phase 28 END"
---

In Phase 28 the primary added new rules to app.css by inserting them before the text "  .limit label {". That line was the second selector of an existing list (".kind label, .limit label { … }"), so the new rule landed between the two selectors: ".kind label" joined the new rule and lost its layout and 44 px height, and nothing failed until the code critic read the file. Tests asserted the new rules but none guarded the existing shared rule.

Do differently: anchor a scripted CSS insertion on a complete rule (from its first selector to its closing brace), or on a blank line between rules, never on a line that may continue a selector list. When a phase touches a stylesheet, look at the diff around each insertion, and keep a test on any shared rule whose loss would be silent.
