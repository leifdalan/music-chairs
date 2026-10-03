---
slug: noble-tuna
title: Provider naming rules escape hermetic fakes; assert them in a config test before the first real deploy
status: candidate
scope: local
proposed_surface: test
filed: 2026-10-02
source: kickoff
occurrences:
  - date: 2026-10-02
    ref: "Phase 5 END"
---

Phase 5's deploy command was proved by hermetic tests with a scripted fake AWS CLI, which accepted any names. The first real deploy then failed: `bin/deploy` had created the Lightsail key pair `music-chairs`, and Lightsail refused the instance of the same name ("Some names are already in use"), because Lightsail names are unique across resource types. The stack rolled back with nothing created, but the gate failed and needed a cleanup of the empty stack and a rerun. A one-line config assertion (the instance, static IP and key pair names are distinct) now guards it. Before a first real deploy, read the provider's naming and uniqueness rules for every named resource and encode them as cheap static assertions, since fakes cannot know them.
