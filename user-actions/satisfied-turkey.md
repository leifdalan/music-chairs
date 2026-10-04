---
slug: satisfied-turkey
title: Do the UI/UX pass and pick a visual framework or theme for the visual cleanup
status: pending
category: decision
urgency: low
blocks:
  - Planning Phase 18 (visual cleanup)
filed: 2026-10-03
needed_at: before Phase 18 starts (Phases 16 and 17 come first)
source: operator
refs:
  - plan/phase-18.md
---

Phase 18's details come from your UI/UX pass and your choice of look. Two things to bring back:

**1. The UI/UX pass.** Walk every screen on a phone and a laptop:
- home
- the invite page
- group
- My availability, in its calendar and list views
- Schedule
- a request
- New request
- Add members
- the profile menu
- privacy

For each screen, note what's confusing, cluttered, too small or missing. Screenshots with scribbles are fine. Order matters less than completeness; planning will group the notes.

**2. A visual framework or theme.** The app is React Router 8 in framework mode with server rendering, built by Vite. Whatever you pick must render on the server without a flash of unstyled content and work well on a phone. Candidates worth a look:
- **MUI (Material UI)**: complete, familiar Material look, strong theming. It styles through Emotion (CSS-in-JS), so server rendering needs extra setup. It is the heaviest choice here.
- **Mantine**: complete component set with good theming and documented React Router setups. Its CSS ships as plain stylesheets, so server rendering is simple.
- **shadcn/ui (Tailwind CSS + Radix)**: components are copied into the repo and fully editable. Clean, modern look, and Tailwind works natively with Vite. Many themes are available at ui.shadcn.com/themes and tweakcn.com.
- **Radix Themes**: a polished, restrained component set with a theme switcher. Plain CSS, so server rendering is easy.
- **Chakra UI**: friendly defaults and good theming, but like MUI it relies on Emotion.
- **daisyUI** (a Tailwind plugin) or **Pico CSS** (almost classless): the lightest options. They restyle the current markup with few component changes, and offer many ready-made themes.

When comparing, also look at bundle size on a phone, and whether its forms and buttons match what the app uses (checkboxes, time fields, dialogs, menus). One more thing: a theme that loads fonts from Google Fonts or another CDN sends visitors' IP addresses there, so Phase 18 would either self-host the fonts or update the privacy policy.

Bring back the framework's name, and if you have one, a theme or palette link or a screenshot of a look you like. "Like this, but calmer" is a perfectly good brief.
