# Impeccable, vendored

Third-party skill: [pbakaus/impeccable](https://github.com/pbakaus/impeccable), Apache-2.0 (`LICENSE`, `NOTICE.md` here), copied from `plugin/skills/impeccable/` at commit `489855d98d4502bc2f46af77d4de37e7ef650e10` (2026-10-05). The engine it runs is version `scripts/VERSION`; on first use `scripts/impeccable` downloads that version's binary from the project's GitHub releases into `~/.impeccable/bin/<version>/` (network required once).

Added by the operator on 2026-10-05 as the project's on-demand UX/UI audit and critique tool. Not part of the methodology contract; edit nothing here except by replacing it with a newer upstream copy.

Trimmed from the upstream payload (operator request: "trimmed down"):

- `scripts/data/font-index.json` and `font-index-failures.json` (1.1 MB): only font suggestions use them, and the engine falls back without them.
- `scripts/live-browser*.js` and `scripts/modern-screenshot.umd.js`: live mode's browser scripts, which the engine binary embeds.
- `scripts/impeccable.cmd`: the Windows launcher.
- The plugin's helper agents (`impeccable-*.md`): only new-work uses them, and it has degraded fallbacks under `reference/degraded/`.

No hooks are installed: the operator chose on-demand use only (no per-edit or Stop design pass). Do not run `npx impeccable install` or `impeccable hooks on` in this repository.
