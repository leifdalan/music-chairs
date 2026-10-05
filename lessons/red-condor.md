---
slug: red-condor
title: After a package install, diff every config file it may touch; pnpm 11 can silently add a release-age exclusion
status: candidate
scope: local
proposed_surface: test
filed: 2026-10-04
source: kickoff
occurrences:
  - date: 2026-10-04
    ref: "Phase 19.1 END"
---

In Phase 19.1, `pnpm add --save-exact lucide-react@1.52.0` installed a version published that day. Rather than refusing it under the one-day `minimumReleaseAge`, pnpm wrote `lucide-react@1.52.0` into `project/pnpm-workspace.yaml`'s `minimumReleaseAgeExclude` and succeeded quietly. The implementation report then claimed no exclusion was needed; the code critique found the line. The plan had said to choose an old-enough version instead of excluding one.

Do differently: after any install, diff `package.json`, the lockfile and `pnpm-workspace.yaml` before reporting dependencies, and pin a version older than the release age directly. A check that `minimumReleaseAgeExclude` only grows with a recorded reason would make this mechanical.
