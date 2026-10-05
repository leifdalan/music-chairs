---
slug: hypersonic-labrador
title: Mix a colour toward a neutral background in OKLab, not OKLCH; check tints in both themes
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-05
source: kickoff
occurrences:
  - date: 2026-10-05
    ref: "Phase 20 END"
---

Phase 20's heat map tinted dates with `color-mix(in oklch, var(--success) N%, var(--background))`. The theme's backgrounds are written `oklch(L 0 0)`, which carry hue 0, so OKLCH mixing interpolated the hue from 0° (red) toward green's 150°: in dark mode the lighter shades rendered brown and olive. Light mode hid it because the mix stayed pale. The first phone screenshot in dark mode caught it; no test could.

Do differently: when tinting toward a neutral (achromatic) colour, mix in `oklab` (or `srgb`), which has no hue to interpolate; and screenshot every new tint in both colour schemes before the critique. A legend that names light/dark ("Lighter: fewer") also inverts between themes; name the colour's strength instead.
