import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { getStore } from "../app/.server/store";
import Join, { action, loader } from "../app/routes/join";
import { cookieFrom, routeArgs, thrownBy, tempDatabase } from "./routes";

const count = tempDatabase();

beforeAll(() => {
  getStore();
});

function newGroup() {
  return getStore().createGroup("Thursday Quartet", "Viola", "Europe/London").group;
}

function joinAs(inviteToken: string, displayName: string, cookie?: string) {
  return action(
    routeArgs(`/join/${inviteToken}`, { inviteToken }, { cookie, form: { displayName } }),
  );
}

function statusOf(value: unknown): number | undefined {
  if (value instanceof Response) return value.status;
  return (value as { init?: ResponseInit | null }).init?.status;
}

describe("join route", () => {
  it("shows the invited group's name", async () => {
    const group = newGroup();

    const loaded = await loader(
      routeArgs(`/join/${group.inviteToken}`, { inviteToken: group.inviteToken }),
    );

    expect(loaded).toEqual({ groupName: "Thursday Quartet" });
  });

  it("adds exactly one member and remembers them on this device", async () => {
    const group = newGroup();
    const members = count("members");

    const response = await joinAs(group.inviteToken, "  Cellist ");

    expect(statusOf(response)).toBe(302);
    const joined = response as Response;
    expect(joined.headers.get("Location")).toBe(`/g/${group.id}`);
    expect(count("members")).toBe(members + 1);
    expect(
      getStore()
        .listMembers(group.id)
        .map((m) => [m.displayName, m.role]),
    ).toEqual([
      ["Viola", "organizer"],
      ["Cellist", "member"],
    ]);
    expect(joined.headers.get("Set-Cookie")).toContain("mc_members=");
  });

  it("recognizes a returning member on the same device without rejoining", async () => {
    const group = newGroup();
    const cookie = cookieFrom((await joinAs(group.inviteToken, "Cellist")) as Response);
    const members = count("members");

    const revisit = await thrownBy(
      loader(
        routeArgs(`/join/${group.inviteToken}`, { inviteToken: group.inviteToken }, { cookie }),
      ),
    );
    const repost = await joinAs(group.inviteToken, "Cellist again", cookie);

    expect(revisit).toBeInstanceOf(Response);
    expect((revisit as Response).headers.get("Location")).toBe(`/g/${group.id}`);
    expect((repost as Response).headers.get("Location")).toBe(`/g/${group.id}`);
    expect(count("members")).toBe(members);
  });

  it("keeps a device's memberships in other groups when it joins another", async () => {
    const first = newGroup();
    const second = newGroup();
    const cookie = cookieFrom((await joinAs(first.inviteToken, "Cellist")) as Response);

    const both = cookieFrom((await joinAs(second.inviteToken, "Cellist", cookie)) as Response);

    for (const group of [first, second]) {
      const revisit = await thrownBy(
        loader(
          routeArgs(
            `/join/${group.inviteToken}`,
            { inviteToken: group.inviteToken },
            { cookie: both },
          ),
        ),
      );
      expect((revisit as Response).headers.get("Location")).toBe(`/g/${group.id}`);
    }
  });

  it.each([[""], ["   "]])(
    "rejects the name %j with a readable error and adds nobody",
    async (name) => {
      const group = newGroup();
      const members = count("members");

      const result = await joinAs(group.inviteToken, name);

      expect(statusOf(result)).toBe(400);
      expect((result as { data: { error: string } }).data.error).toBe("Your name is required.");
      expect(count("members")).toBe(members);
    },
  );

  it.each([
    ["unknown", "A".repeat(22)],
    ["malformed", "not-a-real-invite"],
    ["a group id instead of an invite token", null],
  ])("gives a 404 for an %s token from the loader and the action", async (_kind, token) => {
    const inviteToken = token ?? newGroup().id;
    const members = count("members");

    const loaded = await thrownBy(loader(routeArgs(`/join/${inviteToken}`, { inviteToken })));
    const posted = await thrownBy(joinAs(inviteToken, "Cellist"));

    expect(statusOf(loaded)).toBe(404);
    expect(statusOf(posted)).toBe(404);
    expect(count("members")).toBe(members);
  });

  it("renders the join form with the group name", () => {
    const Stub = createRoutesStub([{ id: "join", path: "/join/:inviteToken", Component: Join }]);

    const html = renderToString(
      <Stub
        initialEntries={["/join/x"]}
        hydrationData={{ loaderData: { join: { groupName: "Thursday Quartet" } } }}
      />,
    );

    expect(html).toContain("Thursday Quartet");
    expect(html).toContain('name="displayName"');
  });
});
