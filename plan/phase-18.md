---
id: "18"
title: "CI/CD: tests on every change, deploy on merge to main"
depends_on: ["17"]
informs: ["19"]
---

# Phase 18 — CI/CD: tests on every change, deploy on merge to main

**Goal**: every change to the repository is tested automatically on GitHub, and a change merged to `main` is deployed to https://rehearse.dalan.dev automatically, without paying for build compute.

## Deliverables

- A GitHub Actions workflow that runs the repository's own gates (`./bin/setup`, then `./bin/check all`) on every pull request and every push, with results visible on GitHub.
- A deploy workflow that runs `./bin/deploy all` and `./bin/deploy smoke` when a change lands on `main`, only after the tests pass, and never two deploys at once.
- AWS access for the deploy that needs no long-lived keys in GitHub: a role the workflow assumes through GitHub's OpenID Connect identity, defined in Terraform and limited to what the deploy does.
- The runner the jobs use, set up and documented (see Decisions), and a branch protection or ruleset on `main` matching the chosen flow.
- `project/deploy/README.md` (or a new CI section beside it) and `bin/README.md` describe the pipeline, how to rerun it and how to deploy by hand when GitHub is unavailable.

## Decisions (operator, 2026-10-04)

The operator's words: "I'd also like to add an operational phase before the ui cleanup. I'd like for us to have a CI/CD pipeline for our test suite, and I'd like for the merge to main to include the deployment. Does github provide an agent such that we can run the tests locally and act as a runner? I don't want to pay for compute given this is such a small project but I'd like to practice good CI/CD hygene". The operator is fine with making the repository private.

Rulings at phase start (operator, 2026-10-04):

- **Runner**: every job runs on GitHub-hosted runners (Linux); no self-hosted runner. GitHub still charges nothing for self-hosted runners (a planned fee was postponed), but the operator chose hosted machines that are always available.
- **Visibility**: the repository stays public (it already is), which gives unlimited hosted minutes and an enforceable rule on `main` at no cost; on the free plan a private repository cannot enforce one. No secret is in the repository.
- **Flow**: branches and pull requests. Each phase lands on a branch; a ruleset on `main` requires the CI check to pass and blocks direct pushes and force-pushes; merging deploys.
- **Merging**: the orchestrator opens the pull request at the end of a phase, waits for CI, and merges it when green, which deploys; the operator judges the live result through the User Demo as before. This phase is delivered that way: its own pull request is the pipeline's first run, and its merge is the first automatic deploy.
- **Approval**: none; a green merge deploys automatically. The deploy keeps refusing destructive infrastructure plans and rolling back a release that fails its health check.
- **SSH**: a new deploy-only key pair, added to the server beside the operator's key and stored only as a GitHub Actions secret, so it can be revoked on its own.
- **AWS**: the deploy assumes an IAM role through GitHub's OpenID Connect identity, limited to this repository's `main` branch; no AWS keys are stored in GitHub. The account has no GitHub identity provider yet; Terraform adds it.
- **GitHub CLI**: `gh` is not installed on the operator's Mac (nor Homebrew). The orchestrator needs it to set the secret and ruleset and to open and merge pull requests, so it is pinned and installed by `./bin/setup` like Terraform, and the operator signs it in once (`./bin/gh auth login`).
- **Methodology**: today's rules have the orchestrator run the live deploy as a gate and fast-forward-push `main`. Amending those rules (CLAUDE.md, the human-in-the-loop and commit-staging policies, kickoff's acceptance and close resources) to the pull-request flow is methodology work done directly after this phase is delivered, not part of it.

## Acceptance

- The Phase 18 pull request shows the CI workflow passing on GitHub; a deliberately failing test on a throwaway branch makes it fail and the ruleset blocks merging it.
- Merging the Phase 18 pull request runs the deploy workflow, which applies a no-change infrastructure plan, releases, and passes the public smoke; GitHub holds no AWS keys (only the deploy SSH key secret).
- `./bin/check all` passes locally, and the Terraform plan before the merge shows only additions (the identity provider, the role and its policy).
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** In a browser, open:

https://github.com/leifdalan/music-chairs/pulls?q=is%3Apr

  - **Suggested inputs.**
    1. Open the Phase 18 pull request and its **Checks** tab.
    2. Open the **Actions** tab and the **Deploy** run that followed the merge.
    3. Open **Settings → Secrets and variables → Actions**, and **Settings → Rules**.
    4. On your phone, open https://rehearse.dalan.dev.
  - **What to look for.**
    - The pull request's CI check is green, and the pull request says it was merged by the orchestrator after the check passed.
    - The Deploy run shows the infrastructure plan with no changes, the release healthy, and the smoke passing.
    - Secrets hold only the deploy SSH key; no AWS access key is stored anywhere in GitHub.
    - The rule on `main` requires the CI check and blocks direct and force pushes.
    - The site works as before.
  - **Variations to explore.** On GitHub, edit any file on a new branch and open a pull request: CI runs on it. Try pushing straight to `main` from your laptop: GitHub refuses.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints" (AWS, low cost).

## Inherited from Phase 16

Pinned by [Phase 16](phase-16.md): every AWS resource is defined in Terraform (`project/deploy/terraform`, settings in `project/deploy/config.json`) and changed only through `./bin/deploy`, whose `infra` step refuses plans that destroy, replace or forget protected resources. The deploy needs the SSH key `~/.ssh/music-chairs-lightsail` and the pinned host key in `~/.ssh/music-chairs-known-hosts`; a CI deploy needs both, or a different way to reach the server.

## Inherited from Phase 17

Pinned by [Phase 17](phase-17.md): `project/scripts/smoke.sh` builds the app and exercises it end to end locally (including the request-based proposing and the calendar download), and `./bin/deploy smoke` checks the public site; both are the natural CI and post-deploy checks. The live database is at schema version 9.
