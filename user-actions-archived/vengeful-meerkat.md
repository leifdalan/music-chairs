---
slug: vengeful-meerkat
title: Sign the repository's GitHub CLI in to your GitHub account
status: done
closed: 2026-10-04
category: access
urgency: high
blocks:
  - Phase 18 (CI/CD): the deploy secret, variable and ruleset, and opening and merging pull requests
filed: 2026-10-04
needed_at: before Phase 18's GitHub setup step
source: kickoff
refs:
  - bin/gh
  - project/deploy/README.md
---

Phase 18 needs the GitHub CLI (`gh`) to store the deploy key as a repository secret, set the deploy role variable and the rule on `main`, and to open and merge pull requests. The repository now installs a pinned `gh` with `./bin/setup`; it has to be signed in to your account once. Your keychain holds an old GitHub CLI token that no longer works, and signing in replaces it.

In the Claude Code prompt, from the repository, type:

```
! ./bin/gh auth login --hostname github.com --git-protocol ssh --skip-ssh-key --web --scopes workflow
```

It prints a one-time code and opens https://github.com/login/device; enter the code and approve. The token is kept by gh in your system keychain, never in the repository. To check afterwards:

```
! ./bin/gh auth status
```

It should say "Logged in to github.com account leifdalan".

## Disposition

The operator signed in on 2026-10-04; the agent verified it with `./bin/gh auth status` (logged in as leifdalan, scopes include repo and workflow) and then used it to set the deploy secret, variable and ruleset and to open and merge pull request #1. No recurring learning.
