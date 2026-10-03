import { afterEach, describe, expect, it, vi } from "vitest";

import { routeArgs } from "./routes";

// The cookie flag is fixed when the module loads (the shared test helpers load it
// early), so each case resets the module cache after setting the variable.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("public URL", () => {
  it("marks the membership cookie Secure and builds invite links on the public origin", async () => {
    vi.stubEnv("MUSIC_CHAIRS_PUBLIC_URL", "https://rehearse.dalan.dev");
    vi.resetModules();
    const { rememberMembership } = await import("../app/.server/membership");
    const { getStore } = await import("../app/.server/store");
    const { loader } = await import("../app/routes/group");
    const { group, organizer } = getStore().createGroup("Quartet", "Viola", "Europe/London");

    const setCookie = await rememberMembership(
      new Request("http://127.0.0.1:3000/"),
      group.id,
      organizer.deviceToken,
    );
    const page = await loader(
      routeArgs(`/g/${group.id}`, { groupId: group.id }, { cookie: setCookie.split(";")[0] }),
    );

    expect(setCookie).toMatch(/; Secure/);
    expect(page.inviteUrl).toBe(`https://rehearse.dalan.dev/join/${group.inviteToken}`);
  });

  it("leaves the cookie usable over plain HTTP when no public URL is set", async () => {
    vi.stubEnv("MUSIC_CHAIRS_PUBLIC_URL", "");
    vi.resetModules();
    const { rememberMembership, publicOrigin } = await import("../app/.server/membership");

    const setCookie = await rememberMembership(new Request("http://localhost/"), "g", "t");

    expect(publicOrigin()).toBeNull();
    expect(setCookie).not.toMatch(/Secure/);
  });

  it("names the sign-in cookies __Host- with Secure and Path=/ over HTTPS, end to end", async () => {
    vi.stubEnv("MUSIC_CHAIRS_PUBLIC_URL", "https://rehearse.dalan.dev");
    vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET", "secret");
    vi.resetModules();
    const { loader: start } = await import("../app/routes/auth.google");
    const { loader: callback } = await import("../app/routes/auth.google.callback");

    const started = (await start(routeArgs("/auth/google", {}))) as Response;
    const [oauthHeader] = started.headers.getSetCookie();
    const google = new URL(started.headers.get("Location")!);
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const claims = {
      iss: "https://accounts.google.com",
      aud: "client-id",
      exp: Date.now() / 1000 + 600,
      nonce: google.searchParams.get("nonce"),
      sub: "sub-https",
      email: "https@example.test",
      name: "H",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id_token: `${part({})}.${part(claims)}.sig` })),
    );
    const finished = (await callback(
      routeArgs(
        `/auth/google/callback?code=c&state=${google.searchParams.get("state")}`,
        {},
        { cookie: oauthHeader.split(";")[0] },
      ),
    )) as Response;

    expect(google.searchParams.get("redirect_uri")).toBe(
      "https://rehearse.dalan.dev/auth/google/callback",
    );
    const headers = [oauthHeader, ...finished.headers.getSetCookie()];
    expect(headers.map((header) => header.split("=")[0])).toEqual([
      "__Host-mc_oauth",
      "__Host-mc_oauth",
      "__Host-mc_session",
    ]);
    for (const header of headers) {
      expect(header).toMatch(/; Path=\/(;|$)/);
      expect(header).toMatch(/; Secure/);
      expect(header).not.toMatch(/Domain=/i);
    }
    expect(finished.headers.get("Location")).toBe("/");
  });
});
