import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { readToast } from "../app/.server/flash";
import { getStore } from "../app/.server/store";
import { addDays, todayInZone } from "../app/lib/availability";
import { groupPath } from "../app/lib/group-address";
import Join, { action, loader } from "../app/routes/join";
import {
  addressOf,
  cookieFrom,
  inviteOf,
  ORIGIN,
  requestHrefOf,
  routeArgs,
  setCookies,
  signedIn,
  tempDatabase,
  thrownBy,
} from "./routes";

const count = tempDatabase();

beforeAll(() => {
  getStore();
});

function newGroup() {
  return getStore().createGroup("Thursday Quartet", "Viola", "Europe/London").group;
}

function joinAs(inviteToken: string, displayName: string, cookie?: string) {
  return action(
    routeArgs(`/join/${inviteToken}`, { invite: inviteToken }, { cookie, form: { displayName } }),
  );
}

function statusOf(value: unknown): number | undefined {
  if (value instanceof Response) return value.status;
  return (value as { init?: ResponseInit | null }).init?.status;
}

/** The toast message a redirect leaves, read the way the root loader reads it. */
async function toastOf(response: unknown): Promise<string | undefined> {
  const cookie = setCookies(response as Response).mc_toast;
  if (!cookie) return undefined;
  return (await readToast(new Request(ORIGIN, { headers: { Cookie: cookie } }))).toast?.message;
}

describe("join route", () => {
  it("welcomes the new member by the group's name", async () => {
    const group = newGroup();

    const response = await joinAs(inviteOf(group), "Cellist");

    expect(await toastOf(response)).toBe("You joined Thursday Quartet");
    expect(cookieFrom(response as Response)).toMatch(/^mc_members=/);
  });

  it("links a member who joins while signed in, and prefills their Google name", async () => {
    const group = newGroup();
    const { account, cookie } = await signedIn({
      sub: "sub-joiner",
      email: "joiner@example.test",
      name: "Joan",
    });

    const page = (await loader(
      routeArgs(`/join/${inviteOf(group)}`, { invite: inviteOf(group) }, { cookie }),
    )) as { account: unknown };
    const response = await joinAs(inviteOf(group), "Joan", cookie);

    expect(page.account).toEqual({ name: "Joan", email: "joiner@example.test" });
    expect(statusOf(response)).toBe(302);
    expect(getStore().findMemberByAccount(group.id, account.id)?.displayName).toBe("Joan");
    // Back on the invite link later, the signed-in account goes straight to the group.
    const again = await thrownBy(
      loader(routeArgs(`/join/${inviteOf(group)}`, { invite: inviteOf(group) }, { cookie })),
    );
    expect((again as Response).headers.get("Location")).toBe(groupPath(group));
  });

  it("lands a new or returning member on the open request that ends soonest", async () => {
    const group = newGroup();
    const store = getStore();
    const today = todayInZone(group.timeZone, new Date());
    const request = (name: string, start: number, end: number) =>
      store.createRequest(group.id, {
        name,
        startDate: addDays(today, start),
        endDate: addDays(today, end),
        windows: [{ startMinute: 1140, endMinute: 1320 }],
      });
    request("Later", 0, 40);
    const soonest = request("Sooner", 0, 20);
    const closed = request("Closed", 0, 10);
    store.setRequestOpen(group.id, closed.id, false);
    request("Ended", -20, -1);
    store.addMember(group.id, "Spare", "member");

    const joined = (await joinAs(inviteOf(group), "Oboe")) as Response;
    const returning = (await joinAs(inviteOf(group), "Spare")) as Response;

    const target = requestHrefOf(group, soonest.id);
    expect(joined.headers.get("Location")).toBe(target);
    expect(await toastOf(joined)).toBe("You joined Thursday Quartet");
    expect(returning.headers.get("Location")).toBe(target);
    expect(await toastOf(returning)).toBe("Welcome back, Spare");
  });

  it("shows the invited group's name", async () => {
    const group = newGroup();

    const loaded = await loader(routeArgs(`/join/${inviteOf(group)}`, { invite: inviteOf(group) }));

    // Google is not configured in this test, so no sign-in link.
    expect(loaded).toEqual({
      groupName: "Thursday Quartet",
      then: "",
      account: null,
      signInUrl: null,
    });
  });

  it("adds exactly one member and remembers them on this device", async () => {
    const group = newGroup();
    const members = count("members");

    const response = await joinAs(inviteOf(group), "  Cellist ");

    expect(statusOf(response)).toBe(302);
    const joined = response as Response;
    expect(joined.headers.get("Location")).toBe(groupPath(group));
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
    const cookie = cookieFrom((await joinAs(inviteOf(group), "Cellist")) as Response);
    const members = count("members");

    const revisit = await thrownBy(
      loader(routeArgs(`/join/${inviteOf(group)}`, { invite: inviteOf(group) }, { cookie })),
    );
    const repost = await joinAs(inviteOf(group), "Cellist again", cookie);

    expect(revisit).toBeInstanceOf(Response);
    expect((revisit as Response).headers.get("Location")).toBe(groupPath(group));
    expect((repost as Response).headers.get("Location")).toBe(groupPath(group));
    expect(count("members")).toBe(members);
  });

  it("keeps a device's memberships in other groups when it joins another", async () => {
    const first = newGroup();
    const second = newGroup();
    const cookie = cookieFrom((await joinAs(inviteOf(first), "Cellist")) as Response);

    const both = cookieFrom((await joinAs(inviteOf(second), "Cellist", cookie)) as Response);

    for (const group of [first, second]) {
      const revisit = await thrownBy(
        loader(
          routeArgs(`/join/${inviteOf(group)}`, { invite: inviteOf(group) }, { cookie: both }),
        ),
      );
      expect((revisit as Response).headers.get("Location")).toBe(groupPath(group));
    }
  });

  it.each([[""], ["   "]])(
    "rejects the name %j with a readable error and adds nobody",
    async (name) => {
      const group = newGroup();
      const members = count("members");

      const result = await joinAs(inviteOf(group), name);

      expect(statusOf(result)).toBe(400);
      expect((result as { data: { error: string } }).data.error).toBe("Your name is required.");
      expect(count("members")).toBe(members);
    },
  );

  it.each([
    ["unknown code", "quartet-aaaaaaaa"],
    ["malformed", "not-a-real-invite"],
    ["the group's address instead of its invite", null],
  ])("gives a 404 for an %s from the loader and the action", async (_kind, token) => {
    const inviteToken = token ?? addressOf(newGroup());
    const members = count("members");

    const loaded = await thrownBy(
      loader(routeArgs(`/join/${inviteToken}`, { invite: inviteToken })),
    );
    const posted = await thrownBy(joinAs(inviteToken, "Cellist"));

    expect(statusOf(loaded)).toBe(404);
    expect(statusOf(posted)).toBe(404);
    expect(count("members")).toBe(members);
  });

  it("renders the join form with the group name", () => {
    const Stub = createRoutesStub([{ id: "join", path: "/join/:invite", Component: Join }]);

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
