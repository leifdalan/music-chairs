---
slug: tireless-quetzal
title: A focus or event rule written against an imagined page is dead code until a browser check reads its outcome
status: candidate
scope: local
proposed_surface: test
filed: 2026-10-15
source: kickoff
occurrences:
  - date: 2026-10-15
    ref: "Phase 41 END"
---

Phase 41's click-away hook returned focus to the popup's date only when focus had been inside and the press didn't land on another control. Both halves were wrong on the real page: every page sits inside `<div id="content" tabIndex={-1}>`, so `closest("[tabindex]")` matched every press, and the browser moves focus to the pressed element on pointerdown, so reading `document.activeElement` at pointerup always said "outside". Unit tests with stand-in objects and a browser gate that checked only whether the popup closed both passed; the code critic found it by reading root.tsx. The gate's own blank-spot search had hit the same wrapper earlier in the phase and been fixed there, without asking what else the wrapper affected.

Do differently: when a rule depends on focus, ancestors or event order, have the browser gate read the outcome itself (here `document.activeElement` after a tap outside), and when a gate helper needs a workaround for a page-wide element, check every rule in the change that queries the same ancestors.
