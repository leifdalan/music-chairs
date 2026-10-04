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

To settle at phase start:
- **Runner**: a self-hosted runner on the operator's Mac (free; jobs wait while it is asleep; GitHub advises against self-hosted runners on public repositories) or GitHub-hosted runners within a private repository's free monthly minutes (no machine to keep awake). Check GitHub's current pricing for self-hosted runners in private repositories before deciding.
- **Flow**: work moves to branches and pull requests, with CI required before merging and the merge deploying; or every push to `main` deploys after its tests pass. This changes how `kickoff` delivers a phase (today the orchestrator runs the live deploy as a gate and fast-forward-pushes `main`), so the methodology's delivery rules and the deploy gate move with it.
- **Repository visibility**: private (the operator's stated preference) before any self-hosted runner is attached.
- **Secrets and settings** the workflow needs (the AWS role, any GitHub environment protection) and where each lives.

## Acceptance

- A pull request (or push, per the chosen flow) shows the test workflow passing on GitHub, and a deliberately failing test makes it fail.
- A change merged to `main` deploys, and the public smoke passes, with no AWS keys stored in GitHub.
- `./bin/check all` passes, and the Terraform plan for the new role shows only additions.
- User Demo: to be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints" (AWS, low cost).

## Inherited from Phase 16

Pinned by [Phase 16](phase-16.md): every AWS resource is defined in Terraform (`project/deploy/terraform`, settings in `project/deploy/config.json`) and changed only through `./bin/deploy`, whose `infra` step refuses plans that destroy, replace or forget protected resources. The deploy needs the SSH key `~/.ssh/music-chairs-lightsail` and the pinned host key in `~/.ssh/music-chairs-known-hosts`; a CI deploy needs both, or a different way to reach the server.

## Inherited from Phase 17

Pinned by [Phase 17](phase-17.md): `project/scripts/smoke.sh` builds the app and exercises it end to end locally (including the request-based proposing and the calendar download), and `./bin/deploy smoke` checks the public site; both are the natural CI and post-deploy checks. The live database is at schema version 9.
