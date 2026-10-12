---
slug: warping-fox
title: React's server render orders attributes its own way; assert attributes independently, never as one literal string
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-12
source: kickoff
occurrences:
  - date: 2026-10-12
    ref: "Phase 31 END"
---

In Phase 31 three new markup assertions failed on correct code because they spelled attributes in source order. React's server render wrote a checkbox as `aria-label=… name="date" checked="" value=…` and a radio as `name="limit" checked="" value="most"`, not in the order the JSX lists them. Finding that out took three debugging rounds that forced the markup into a failure message, because Vitest hides console output from passing tests. Earlier phases (27–29) hit the same thing with attribute-order assertions and split them into separate checks each time, but never wrote it down.

Do differently: in render tests, match each attribute separately (several `toContain` checks, or one regex with `[^>]*` between attributes); when the exact markup is needed, print it through a deliberately failing expectation first.
