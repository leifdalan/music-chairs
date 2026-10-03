---
slug: valiant-rottweiler
title: Create the Google Cloud project and OAuth client for Google sign-in
status: done
closed: 2026-10-03
category: credentials
urgency: high
blocks:
  - Real Google sign-in at https://rehearse.dalan.dev and the Phase 6 User Demo (tests use a fake Google and do not wait for this)
filed: 2026-10-02
needed_at: "Phase 6"
source: kickoff
refs:
  - plan/phase-6.md
---

Google sign-in needs an OAuth client that only you can create, in the Google Cloud console (Google offers no CLI or API to create one for an ordinary web app).

1. Create a project at https://console.cloud.google.com/projectcreate (for example `music-chairs`).
2. **Google Auth Platform → Branding:** app name `music-chairs`, your support email, authorized domain `dalan.dev`; **Audience: External**.
3. **Data Access:** add only the scopes `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. These basic scopes need no Google verification review (Phase 7's Calendar scopes will).
4. **Audience → Publish app**, so the app is "In production". In "Testing", only test users you list by hand can sign in.
5. **Clients → Create client**, type **Web application**, with these authorized redirect URIs:
   - `https://rehearse.dalan.dev/auth/google/callback`
   - `http://localhost:5173/auth/google/callback`
6. Tell the agent the **Client ID** (it is not secret and goes in `project/deploy/config.json`). Keep the **Client secret** private: never paste it into a chat or the repository. Store it encrypted in AWS Parameter Store from your own terminal (not through the agent). The first command prompts for the secret without showing it:
   ```sh
   read -rs SECRET
   ```
   ```sh
   aws ssm put-parameter --profile music-chairs --region us-west-2 --name /music-chairs/google-client-secret --type SecureString --value "$SECRET" && unset SECRET
   ```

Progress (2026-10-02): the operator created the client and gave the agent its client id (recorded in `plan/phase-6.md` and `project/deploy/config.json`); at the operator's request the agent stored the secret from the clipboard as `/music-chairs/google-client-secret` (version 1) without displaying it. Close this item once a real Google sign-in on https://rehearse.dalan.dev works (the Phase 6 User Demo), which confirms the console steps (publishing, redirect URIs).

## Disposition

The operator created the OAuth client (client id in `project/deploy/config.json`, secret in Parameter Store) and real Google sign-in works on https://rehearse.dalan.dev, confirming publishing and the redirect URIs. Closed on the operator's word on 2026-10-03. No recurring learning.
