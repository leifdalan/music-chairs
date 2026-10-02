# music-chairs

A web app that helps small music ensembles find times to rehearse together in person.

Scheduling a rehearsal usually happens in long group-text threads where availability gets lost and nobody is sure what was decided. music-chairs gives a group one place to collect everyone's availability, choose rehearsal times and confirm who is coming. Organizers create a group, invite members with a link, see where everyone's availability overlaps and make the final call; members join with Google or with just a name, enter their availability from a phone and can RSVP. The full product contract, including what v1 deliberately leaves out, is the [brief](briefs/BRIEF.md).

The app itself lives in [`project/`](project/): React Router 8 in framework mode, TypeScript, Vite and Vitest, with hosting on AWS planned.

## How this repository is built

music-chairs is developed with an agentic coding methodology: work moves from the brief to a phased plan, and each phase is planned, implemented, independently reviewed and gated by deterministic checks before it is delivered. Agents do the planning, implementation and gating; you keep the product decisions and the final acceptance of every phase. The rules agents follow are in [`CLAUDE.md`](CLAUDE.md) (also reachable as `AGENTS.md`), and the methodology itself is explained in [`briefs/methodology.md`](briefs/methodology.md).

## Getting started

Provision both locked environments (the app's Node toolchain and the Python governance tooling). This needs `uv` and `corepack` on your PATH:

```sh
./bin/setup
```

Run the full authoritative gate (lint, format, typecheck, tests and policy checks):

```sh
./bin/check all
```

Run the app locally:

```sh
cd project && corepack pnpm run dev
```

Then start the next phase of the plan with `/kickoff` in Claude Code or `$kickoff` in Codex. It picks up the `⬅️` row in [`plan/INDEX.md`](plan/INDEX.md) — Phase 1, groups and invite links — and walks it through planning, implementation, review and the gates.

## Other essential skills

- `demo` walks you through a finished phase's `User Demo:` one step at a time.
- `roles` shows or changes which model handles each planning, coding and review role.
- `ask` lists the decisions currently waiting on you.
- `sweep` runs a maintenance pass over the rules and the lessons agents have filed.
- `refactor` tidies working code without changing its behavior.

Each skill is invoked as `/<name>` in Claude Code or `$<name>` in Codex; the full list is in [`CLAUDE.md`](CLAUDE.md).

## Where things are

- [`briefs/`](briefs/) — the product brief and the methodology briefs.
- [`plan/`](plan/) — the phase plan; status lives only in `plan/INDEX.md`.
- [`project/`](project/) — the app, self-contained.
- [`policies/`](policies/) — the rules every phase follows.
- [`bin/`](bin/) — setup, test and gate entry points plus the deterministic tools agents use; catalogued in [`bin/README.md`](bin/README.md).
- [`tooling/`](tooling/) — the pinned Python environment those tools run in.
- `LOG.md`, `lessons/`, `user-actions/` — the activity log, lessons agents have noticed, and actions that only you can take.
