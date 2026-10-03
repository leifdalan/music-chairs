import { afterEach, describe, expect, it, vi } from "vitest";

import { routeArgs } from "./routes";

// The cookie flag is fixed when the module loads (the shared test helpers load it
// early), so each case resets the module cache after setting the variable.
afterEach(() => {
  vi.unstubAllEnvs();
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
});
