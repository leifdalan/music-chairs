---
slug: amorphous-jaguarundi
title: A fake of an external CLI must not accept an input the real CLI rejects; probe the real tool harmlessly first
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-04
source: kickoff
occurrences:
  - date: 2026-10-04
    ref: "Phase 16 END"
---

Phase 16's `bin/deploy bootstrap` sent the alert email to `aws ssm put-parameter --cli-input-json file:///dev/stdin`. The fake `aws` in tests/test_deploy.py read stdin happily, so the proof (and its mutation check) passed. The real AWS CLI 2.37 on macOS rejected it ("Invalid JSON received"), and the one-time adoption gate stopped at its first live step. Nothing was lost, but the gate sequence had to be rerun after a code correction.

Do differently: when code relies on a particular input mode of an external CLI (stdin, file://, environment), check that mode once against the real tool with a harmless call before building on it (here, a get-parameter for a name that does not exist), and model the fake on what the real tool accepts.
