---
slug: daffodil-gibbon
title: A browser check of "fits the screen" must compare with the emulated device width; a mobile viewport grows to fit overflow
status: candidate
scope: local
proposed_surface: test
filed: 2026-10-15
source: kickoff
occurrences:
  - date: 2026-10-15
    ref: "Phase 40 END"
---

Phase 40's browser gate checked that the group page fit the screen at 200% text by comparing `document.documentElement.scrollWidth` with `window.innerWidth`. Under Chrome's mobile emulation the layout viewport widens to fit content that overflows, so `innerWidth` followed the overflow and the check could not fail: the page was 392 px wide on a 320 px phone (buttons that refused to wrap, a select as wide as its longest option) and the check passed. A deliberately broken build (the Schedule link's no-wrap restored) also passed, which is how the weakness showed. The same session also found that component-layer CSS loses to Tailwind utilities on the same element regardless of specificity.

Do differently: compare widths with the emulated width the check itself set, not `innerWidth` or `clientWidth`; and prove every layout check by breaking the code it guards and watching it fail before trusting a pass.
