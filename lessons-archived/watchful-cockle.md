---
slug: watchful-cockle
title: Agent shell commands inherit the operator's interactive aliases; call core utilities by absolute path
status: codified
scope: methodology
proposed_surface: policy
filed: 2026-10-02
source: kickoff
closed: 2026-10-02
graduated_to: CLAUDE.md
occurrences:
  - date: 2026-10-02
    ref: "Phase 1 PARK"
  - date: 2026-10-02
    ref: "Phase 5 END"
  - date: 2026-10-02
    ref: "Phase 6 END"
  - date: 2026-10-02
    ref: "Phase 6 END (correction)"
---

The harness's Bash tool sources the operator's zsh profile. On this machine `tail` is aliased to an `ssh` command and `rm`, `cp` and `mv` to their interactive `-i` forms. In Phase 1 a scripted probe ending in `rm <file>` hung for more than five minutes on the hidden confirmation prompt and was killed, and every `tail` printed an ssh resolution error instead of the file. Neither failure names the alias, so the cause is easy to misdiagnose as a slow test or a broken log.

Remedy candidate: the methodology's shell guidance (or the session-start checks) tells agents to run `type tail rm cp mv` once per session, or simply to invoke `/usr/bin/tail`, `/bin/rm -f`, `/bin/cp` and `/bin/mv` explicitly in scripted commands. Repository scripts under `bin/` are unaffected because they run in non-interactive bash.

Phase 5 recurrence: a bare `tail` again printed an ssh resolution error, and zsh's `noclobber` option (also from the profile) refused a `>` redirect onto an existing log, so a stale log from the earlier run was read as the new result until the file was deleted first.

Phase 6 recurrence: `F=$(mktemp ...); ... > "$F"` failed with "file exists" because the profile's `noclobber` refuses `>` onto the file mktemp had just created; `>|` works. Shell tooling that runs in the operator's interactive profile must force redirects onto existing files.

Phase 6 correction: `cat > project/react-router.config.ts <<EOF` failed with "file exists" because of noclobber and left the old file in place; the next command still ran because it was not chained to the write. `>|` fixed it.
