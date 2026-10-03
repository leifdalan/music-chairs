---
slug: amorphous-cassowary
title: A deploy smoke must send what a browser sends; a TLS-terminating proxy breaks same-origin checks it cannot see
status: candidate
scope: local
proposed_surface: test
filed: 2026-10-02
source: kickoff
occurrences:
  - date: 2026-10-02
    ref: "Phase 6 END (correction)"
---

From the first deploy in Phase 5, every browser form submission on https://rehearse.dalan.dev (creating a group, joining, availability) failed with 400 "Bad Request". Caddy terminates HTTPS and proxies to the app over HTTP, so React Router saw `http://rehearse.dalan.dev` while browsers sent `Origin: https://rehearse.dalan.dev`, and its cross-site check refused the action. The operator reported it as a probable SQL error. Both deploy gates were green, because the smoke's Python client sends no `Origin` header and the local smoke runs without a proxy. The fix listed the domain in `allowedActionOrigins`, and the smoke now posts with a browser `Origin`; run against the unfixed site, the updated smoke failed as the browser had. When a smoke stands in for a browser, send the headers a browser sends (Origin, cookies), and test through the same proxy the users go through.
