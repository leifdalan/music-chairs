# Phased Execution Plan — music-chairs

Methodology work is primary one-shot with commit/push authority after required checks, including teach/learn, without delegated planning/coding or independent review. Product work defaults to eligible-primary planning/coding with bounded advisory review, preferring a permitted cross-provider SOTA adviser. Single-provider users get independent same-model instances; constrained primaries retain the delegated approval workflow. See `policies/review-lanes.md` and `policies/role-models.md`.


This directory is the phased execution plan for music-chairs. It is the authoritative source for what to build, in what order, and under what invariants. The product contract it refines is [`../briefs/BRIEF.md`](../briefs/BRIEF.md).

When `plan/` and the briefs disagree, `plan/` wins — it is the refinement.

- **INDEX.md** (this file) — discovery endpoint: phase dependency graph, the linked phase table with status markers, cross-cutting concerns, critical-files map. **Status markers live here and nowhere else** — each phase file carries `id` / `title` / `depends_on` / `informs` frontmatter but no `status` field.
- **`phase-N.md`** — parent phase: goal and decomposition into sub-phases.
- **`phase-N.M.md`** — sub-phase: Goal, Deliverables, Acceptance, brief refs, and (for completed phases) Outcomes.

## Reading protocol

If you are working on a phase:

1. Read this `INDEX.md` (cross-cutting concerns apply to every phase).
2. Read the parent `phase-N.md` to understand the larger context (when a sub-phase is targeted).
3. Read the target `phase-N.md` (or `phase-N.M.md`).
4. Read every brief listed under that phase's "Brief refs" section — those are the contracts the phase implements.
5. Read every file listed under `depends_on` in the frontmatter.
6. Do **not** slurp every `phase-*.md`. The frontmatter and brief refs are the contract for which predecessors and contracts actually matter.

## Phase Dependency Graph

```mermaid
graph TD
    P1[Phase 1<br/>Groups, invite links and name-only joining]
    P2[Phase 2<br/>Availability entry: one-off and recurring]
    P3[Phase 3<br/>Combined availability and confirming rehearsal times]
    P4[Phase 4<br/>Confirmed rehearsals for members, with RSVP]
    P5[Phase 5<br/>Deploy to AWS]
    P6[Phase 6<br/>Google sign-in and linking a name-only member]
    P7[Phase 7<br/>Google Calendar: free/busy import and writing confirmed rehearsals]
    P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7
    P3 --> P7
```

Phases 1–4 build the complete scheduling loop for name-only members; Phase 5 puts it in front of the band on AWS before the Google work, because Google OAuth needs a stable public URL; Phases 6–7 add Google sign-in and Calendar. Email notifications are outside v1 (brief, "Notifications") and have no phase. Phases 2–7 are sketches, tightened by ripple at each upstream close per [`../policies/phase-ripple.md`](../policies/phase-ripple.md) and elaborated when their row becomes `⬅️`. Children are drafted just in time, only when a consequential boundary justifies a split.

## Phase Table

Status legend: ⏳ Not Started · ⬅️ Next (at most one) · 🚧 In Progress · ✅ Completed.

| Phase                  | Title                                                              | Status |
|------------------------|--------------------------------------------------------------------|--------|
| [Phase 1](phase-1.md)  | Groups, invite links and name-only joining                         | ✅     |
| [Phase 2](phase-2.md)  | Availability entry: one-off and recurring                          | ✅     |
| [Phase 3](phase-3.md)  | Combined availability and confirming rehearsal times               | ✅     |
| [Phase 4](phase-4.md)  | Confirmed rehearsals for members, with RSVP                        | ✅     |
| [Phase 5](phase-5.md)  | Deploy to AWS                                                      | ✅     |
| [Phase 6](phase-6.md)  | Google sign-in and linking a name-only member                      | ✅     |
| [Phase 7](phase-7.md)  | Google Calendar: free/busy import and writing confirmed rehearsals | ⬅️     |

`kickoff` flips `⬅️` → `🚧` on start, `🚧` → `✅` on completion, and advances the next `⏳` row to `⬅️` per this dependency graph. Status does not live in per-phase frontmatter.

Every phase row carries exactly one recognized status. An idle incomplete
project has exactly one `⬅️`; active work may have zero while its executable
row is `🚧`; a complete project has zero; more than one is always invalid.

**Deferred-work note (operator decision, 2026-10-02).** Role rules ("at least one of our two keyboardists", brief "Choosing rehearsal times") are deferred out of Phase 3, which ships optional-member tags instead (everyone else counts as required). Not operative during Phase 3; superseded when a later phase is planned to add them or the operator drops them from v1.

## Methodology work is not phase work

Improving the methodology this repository carries — its instructions, policies, briefs, skills, role definitions, orchestration code and their proofs — does not belong in `plan/`. It routes through primary one-shot implementation and the required checks, with commit/push authority and no independent review, per [`../policies/review-lanes.md`](../policies/review-lanes.md). `plan/` is for product work: music-chairs itself, whose surface is `project/`.

## Decomposition ledger (convention)

As a plan grows, this file also records the *why* of its own shape, in prose near the phase table: when a sub-phase is inserted, note when it was drafted, at whose close, what it carved off, what invariant it must preserve, and why the numbering is what it is; when phases are renumbered or reordered, record the event and what it did (and did not) change in the dependency structure; and precede a large phase table with a short critical-path narrative — ordering rationale, parallelism opportunities, and any ratified reversals with their dates. Sub-phase insertion mechanics are governed by [`../policies/phase-ripple.md`](../policies/phase-ripple.md); this ledger is where their rationale survives.

A mature plan's ledger converges on a small vocabulary of **typed, dated, operator-attributed notes** (observed across ~30 phases in a donor project); use these forms rather than inventing new ones:

- **Deferred-work note** — work identified mid-phase but outside the active write set: record the operator decision date, mark it "not operative during phase N", and state the condition that supersedes it. Deferral notes are how a plan remembers without expanding the active phase (the monotonic-progress invariant's ledger half).
- **Protocol note / protocol gap** — an operator clarification to the orchestration contract, recorded in-plan before (or instead of) graduating to a policy. When one recurs, it is a `lessons/` candidate.
- **Phase launch gate** — a precondition on kicking off an already-`⬅️` phase ("holds the arrow but must not start until X"). Neither a dependency edge nor a status marker; it lives as a dated note naming its conditions.
- **Insertion / renumbering record** — with the **append-only decoder-ring rule**: earlier dated notes keep their original wording; the renumbering note itself states how to read old numbers ("in notes dated before D, 'Phase X' means …"). History is never retroactively rewritten to match new numbering.
- **Slice-outcome note** — at a sub-phase close, what this slice deliberately did *not* do and which later slice owns it.

Large dependency graphs may annotate nodes beyond bare edges: `· GATE` (a phase other work must not pass), `· parallel track`, `· contingent`, `· optional`, epic clusters (disconnected subgraphs labeled `· separate epic`), and dotted edges for soft/optional influence versus solid hard dependencies. Define any annotation the first time it appears.

## Cross-Cutting Concerns (apply to every phase)

These are the methodology's universals plus music-chairs' own product invariants. The canonical statements live in [`../CLAUDE.md`](../CLAUDE.md) §"Architectural invariants"; this list is a phase-work-flavored restatement for quick reference, not a second authority.

- **Briefs are the contract.** Every phase points at one or more files under `briefs/` for the canonical design. Phase files specify *how to build* the brief's design; they do not re-specify it. If a brief is ambiguous or wrong, fix the brief — don't work around it.
- **Policies are the law.** Every phase honors every file under `policies/`. A policy violation blocks acceptance.
- **Status lives in one place.** `plan/INDEX.md`'s phase table is the single source of truth for `⏳ / ⬅️ / 🚧 / ✅`. Per-phase frontmatter does not carry `status:`.
- **Acceptance is empirical** (see [`../policies/acceptance-empirical.md`](../policies/acceptance-empirical.md)). Verifiable shell commands and named manual checks — not "the code compiles."
- **Assurance is candidate-bound** (see
  [`../policies/orchestration-evidence.md`](../policies/orchestration-evidence.md)).
  Complete first reviews produce stable findings; revision reviews receive
  causal packets and rebase when authority, risk, scope, or continuity
  changes. Iteration uses focused checks; close runs a complete gate against
  the unchanged approved candidate, finalizes tracked bookkeeping, then runs
  a second bare handoff gate against the actual delivered tree. No tracked
  write follows a successful handoff gate.
- **Research authority follows the role** (see
  [`../policies/research-authority.md`](../policies/research-authority.md)).
  Planner/reviewer may search and retrieve; coder/critic retrieve named
  authorities plus same-host structural neighbors. Installed MCP servers and
  plugins are allow-by-default but never presumed present.
- **Operator-input parks are measured separately** (see
  [`../policies/execution-telemetry.md`](../policies/execution-telemetry.md)).
  Every interval and its overlap-safe total appear in the END/report; an open
  interval blocks close.
- **Repository-owned toolchain contract** (see
  [`../policies/build-gates.md`](../policies/build-gates.md)). Setup,
  full/focused testing, runtime selection, metadata, locking, tests, and callers
  move atomically. Focused tests use `./bin/test`; every final claim ends with
  `./bin/check all`.
- **Proof-estate governance** (see
  [`../briefs/test-suite-value-governance.md`](../briefs/test-suite-value-governance.md)
  and [`../policies/test-suite-governance.md`](../policies/test-suite-governance.md)).
  Vital and changed lanes are recipient-local, assay-backed iteration aids;
  invalid or unmapped selection widens to full and both close gates stay full.
- **Repo-relative paths only** in any file committed to this repo (see [`../policies/repo-relative-paths.md`](../policies/repo-relative-paths.md)). Bash invocations may use absolute paths.
- **Cross-harness parity** (see [`../policies/cross-harness-parity.md`](../policies/cross-harness-parity.md)). The same canonical files drive Claude Code, Codex CLI, and any other harness. Mirrors do not get hand-edited.
- **Autonomous delivery, human judgment** (see [`../policies/human-in-the-loop.md`](../policies/human-in-the-loop.md)). `kickoff` commits and fast-forward-pushes work whose gates are all green; it never advances past an unresolved gate, never claims subjective acceptance, and never touches the destructive git surface.
- **Log discipline** (see [`../policies/log-discipline.md`](../policies/log-discipline.md)). `LOG.md` is append-only and owned by `kickoff`.
- **Phone first.** Every user-facing screen works at phone width; members will often enter availability from a phone (brief, "Technology and constraints").
- **Rules warn, never block.** Required-member and role rules surface warnings; the organizer always keeps the final decision (brief, "Choosing rehearsal times").
- **Hermetic, headless tests.** Deliverable tests run in Node with no browser, display, network or real Google or AWS service; browser behavior is verified through each phase's `User Demo:` protocol.
- **Lessons compound** (see [`../policies/lessons.md`](../policies/lessons.md)).
  Every phase close harvests process observations into the lessons ledger;
  graduation into a binding rule remains human-ratified.

## Critical-Files Map

Kickoff navigation: [entry](../.claude/skills/kickoff/SKILL.md), [phase entry](../.claude/skills/kickoff/preflight.md), [dispatch](../.claude/skills/kickoff/dispatch.md), [planning](../.claude/skills/kickoff/planning.md), [implementation](../.claude/skills/kickoff/implementation.md), [acceptance](../.claude/skills/kickoff/acceptance.md), [close](../.claude/skills/kickoff/close.md), [recovery](../.claude/skills/kickoff/recovery.md). Read each resource before its branch. Coherent phases need no children unless a consequential boundary justifies an authorized split.

Shipped files are linked. A file a future phase will create may also appear, as plain text annotated with its phase — e.g. `daemons/watch/` (Phase 6) — so the map is a forward-looking contract, not just an index of what exists.

| Concern                              | Location                                                  |
|--------------------------------------|-----------------------------------------------------------|
| Product brief                        | [`../briefs/BRIEF.md`](../briefs/BRIEF.md)                |
| Methodology                          | [`../briefs/methodology.md`](../briefs/methodology.md)    |
| Incremental orchestration            | [`../briefs/incremental-orchestration.md`](../briefs/incremental-orchestration.md), [`../policies/orchestration-evidence.md`](../policies/orchestration-evidence.md) |
| Bootstrap a new project              | [`../briefs/agentic-bootstrap.md`](../briefs/agentic-bootstrap.md) |
| Top-level agent guidance             | [`../CLAUDE.md`](../CLAUDE.md)                            |
| Pinned third-party documentation     | [`../docs/README.md`](../docs/README.md), [`../policies/docs.md`](../policies/docs.md), [`../bin/check-catalogs`](../bin/check-catalogs) |
| Activity log                         | [`../LOG.md`](../LOG.md)                                  |
| Lessons and maintenance flywheel     | [`../briefs/harness-self-improvement.md`](../briefs/harness-self-improvement.md), [`../policies/lessons.md`](../policies/lessons.md), [`../bin/lessons`](../bin/lessons), [`../bin/check-catalogs`](../bin/check-catalogs), [`../.claude/skills/sweep/SKILL.md`](../.claude/skills/sweep/SKILL.md) |
| Toolchain contract                   | [`../bin/setup`](../bin/setup), [`../bin/test`](../bin/test), [`../bin/check`](../bin/check), [`../bin/check-receipt`](../bin/check-receipt), [`../bin/python`](../bin/python), [`../bin/node`](../bin/node), [`../bin/_python-toolchain`](../bin/_python-toolchain), [`../bin/_node-toolchain`](../bin/_node-toolchain), [`../policies/build-gates.md`](../policies/build-gates.md) |
| Proof-estate governance              | [`../briefs/test-suite-value-governance.md`](../briefs/test-suite-value-governance.md), [`../policies/test-suite-governance.md`](../policies/test-suite-governance.md), [`../tests/proof-estate.yaml`](../tests/proof-estate.yaml), [`../bin/test-governance`](../bin/test-governance) |
| Optional tracked hooks               | [`../.githooks/pre-push`](../.githooks/pre-push), [`../bin/install-hooks`](../bin/install-hooks) |
| Phase orchestrator                   | [`../.claude/skills/kickoff/SKILL.md`](../.claude/skills/kickoff/SKILL.md) |
| Candidate and evidence managers      | [`../bin/kickoff-tree-id`](../bin/kickoff-tree-id), [`../bin/kickoff-evidence`](../bin/kickoff-evidence) |
| Methodology skill                    | [`../.claude/skills/methodology/SKILL.md`](../.claude/skills/methodology/SKILL.md) |
| `phase-planner` agent (canonical)    | [`../.claude/agents/phase-planner.md`](../.claude/agents/phase-planner.md) |
| `plan-reviewer` agent (canonical)    | [`../.claude/agents/plan-reviewer.md`](../.claude/agents/plan-reviewer.md) |
| `phase-coder` agent (canonical)      | [`../.claude/agents/phase-coder.md`](../.claude/agents/phase-coder.md) |
| `code-critic` agent (canonical)      | [`../.claude/agents/code-critic.md`](../.claude/agents/code-critic.md) |
| Codex mirrors                        | `../.codex/agents/*.toml`, `../.agents/skills/*` (directory symlinks) |
| Deliverable artifact (self-contained)| `../project/` (per [`../policies/project-isolation.md`](../policies/project-isolation.md)) |
| Routes and app shell                 | [`../project/app/routes.ts`](../project/app/routes.ts), [`../project/app/root.tsx`](../project/app/root.tsx), `../project/app/routes/` |
| Deliverable tests                    | `../project/tests/`                                       |
| Deliverable runtime + metadata       | [`../project/package.json`](../project/package.json), [`../project/pnpm-lock.yaml`](../project/pnpm-lock.yaml), [`../project/react-router.config.ts`](../project/react-router.config.ts) |
| Persistence layer                    | `../project/app/.server/` (Phase 1)                       |
| Identity and Google sign-in          | [`../project/app/.server/google.ts`](../project/app/.server/google.ts), [`../project/app/.server/membership.ts`](../project/app/.server/membership.ts) |
| AWS infrastructure                   | [`../project/deploy/`](../project/deploy/README.md), [`../bin/deploy`](../bin/deploy) |
| Governance environment               | [`../tooling/.python-version`](../tooling/.python-version), [`../tooling/pyproject.toml`](../tooling/pyproject.toml), [`../tooling/uv.lock`](../tooling/uv.lock) |
