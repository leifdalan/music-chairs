// The groups page (plan/phase-19.2.md): your groups from this device and your
// Google account, where to go in each, renaming, leaving and deleting them,
// and starting a group.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { whenSynced } from "../app/.server/calendar-sync";
import { readMemberships, rememberMembership } from "../app/.server/membership";
import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import { ConfirmPanel } from "../app/components/confirm-form";
import { action as groupAction } from "../app/routes/group";
import Groups, { action, loader } from "../app/routes/groups";
import {
  deviceCookie,
  ORIGIN,
  routeArgs,
  setCookies,
  signedIn,
  tempDatabase,
  addressFor,
  groupAt,
} from "./routes";

const count = tempDatabase();
beforeAll(() => {
  getStore();
});
afterEach(async () => {
  await whenSynced();
});

type PageData = Awaited<ReturnType<typeof loader>>;

function render(data: PageData, actionData?: unknown): string {
  const Stub = createRoutesStub([{ id: "groups", path: "/groups", Component: Groups }]);
  return renderToString(
    <Stub
      initialEntries={["/groups"]}
      hydrationData={{
        loaderData: { groups: data },
        actionData: actionData ? { groups: actionData } : undefined,
      }}
    />,
  ).replaceAll("<!-- -->", "");
}

const load = (cookie?: string) => loader(routeArgs("/groups", {}, { cookie })) as Promise<PageData>;

function post(groupId: string, cookie: string, form: Record<string, string>) {
  return groupAction(
    routeArgs(`/g/${addressFor(groupId)}`, { groupAddress: addressFor(groupId) }, { cookie, form }),
  );
}

/** A group where Viola organizes and Pianist is a member. */
function band(name: string) {
  const store = getStore();
  const { group, organizer } = store.createGroup(name, "Viola", "Europe/London");
  const pianist = store.addMember(group.id, "Pianist", "member");
  return { store, group, organizer, pianist };
}

describe("the groups page", () => {
  it("lists this device's and the account's groups once each, by name, with only what it shows", async () => {
    const trio = band("Trio");
    const quartet = band("Quartet");
    const linked = band("Linked Band");
    const { account, cookie: session } = await signedIn({
      sub: "groups-sub-1",
      email: "groups1@example.test",
      name: "G",
    });
    linked.store.addMember(linked.group.id, "Signed in", "member", account.id);
    // On this device the visitor organizes the trio and plays piano in the quartet.
    const device = (
      await rememberMembership(
        new Request(ORIGIN, {
          headers: { Cookie: await deviceCookie(trio.group.id, trio.organizer.deviceToken) },
        }),
        quartet.group.id,
        quartet.pianist.deviceToken,
      )
    ).split(";")[0];

    const page = await load(`${device}; ${session}`);

    expect(page.groups).toEqual([
      {
        path: groupPath(linked.group),
        name: "Linked Band",
        timeZone: "Europe/London",
        role: "member",
        displayName: "Signed in",
        lastOrganizer: false,
      },
      {
        path: groupPath(quartet.group),
        name: "Quartet",
        timeZone: "Europe/London",
        role: "member",
        displayName: "Pianist",
        lastOrganizer: false,
      },
      {
        path: groupPath(trio.group),
        name: "Trio",
        timeZone: "Europe/London",
        role: "organizer",
        displayName: "Viola",
        lastOrganizer: true,
      },
    ]);
    const serialized = JSON.stringify(page);
    for (const secret of [
      trio.organizer.deviceToken,
      trio.organizer.id,
      quartet.pianist.deviceToken,
      quartet.pianist.id,
      trio.group.inviteToken,
      quartet.group.inviteToken,
      "groups1@example.test",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("gives organizers rename and delete, everyone else leave, and the only organizer the reason they can't leave", async () => {
    const mine = band("Mine");
    const theirs = band("Theirs");
    const cookie = (
      await rememberMembership(
        new Request(ORIGIN, {
          headers: { Cookie: await deviceCookie(mine.group.id, mine.organizer.deviceToken) },
        }),
        theirs.group.id,
        theirs.pianist.deviceToken,
      )
    ).split(";")[0];

    const html = render(await load(cookie));
    const card = (name: string) => {
      const from = html.indexOf(`>${name}</a></h2>`);
      return html.slice(from, html.indexOf("</li>", html.indexOf("</details>", from)));
    };

    expect(card("Mine")).toContain(`href="${groupPath(mine.group)}/schedule"`);
    expect(card("Mine")).not.toContain("/availability");
    expect(card("Mine")).toContain('name="intent" value="update-group"');
    expect(card("Mine")).toContain('name="intent" value="delete-group"');
    expect(card("Mine")).toContain("You can&#x27;t leave");
    expect(card("Mine")).not.toContain('value="leave"');
    expect(card("Theirs")).toContain('name="intent" value="leave"');
    expect(card("Theirs")).not.toContain("update-group");
    expect(card("Theirs")).not.toContain("delete-group");
    expect(html).toContain('id="create-heading"');
  });

  it("invites a visitor with no groups to start one", async () => {
    const html = render(await load());

    expect(html).toContain("No groups yet.");
    expect(html).toContain('id="create-heading"');
  });

  it("starts a group from here, and shows a rejected one's errors here", async () => {
    const created = (await action(
      routeArgs(
        "/groups",
        {},
        {
          form: { groupName: "New Band", displayName: "Oboe", timeZone: "Europe/London" },
        },
      ),
    )) as Response;
    const rejected = await action(
      routeArgs("/groups", {}, { form: { groupName: "", displayName: "Oboe", timeZone: "UTC" } }),
    );

    expect(created.status).toBe(302);
    expect(groupAt(created.headers.get("Location"))?.name).toBe("New Band");
    const { data } = rejected as unknown as { data: unknown };
    expect(render(await load(), data)).toContain("Group name is required.");
  });
});

describe("managing a group from the groups page", () => {
  it("renames a group for an organizer and comes back here", async () => {
    const { group, organizer } = band("Old Name");
    const cookie = await deviceCookie(group.id, organizer.deviceToken);

    const response = (await post(group.id, cookie, {
      intent: "update-group",
      name: "New Name",
      timeZone: "Europe/London",
      returnTo: "/groups",
    })) as Response;

    expect(response.headers.get("Location")).toBe("/groups");
    expect(getStore().findGroup(group.id)?.name).toBe("New Name");
  });

  it("returns anywhere else to the group page, never to a path from the form", async () => {
    const { group, organizer } = band("Elsewhere");
    const cookie = await deviceCookie(group.id, organizer.deviceToken);

    const response = (await post(group.id, cookie, {
      intent: "update-group",
      name: "Elsewhere",
      timeZone: "Europe/London",
      returnTo: "https://example.test/",
    })) as Response;

    expect(response.headers.get("Location")).toBe(groupPath(group));
  });

  it("lets only organizers rename or delete", async () => {
    const { group, pianist } = band("Guarded");
    const cookie = await deviceCookie(group.id, pianist.deviceToken);

    const forms: Record<string, string>[] = [
      { intent: "update-group", name: "Taken", timeZone: "UTC", returnTo: "/groups" },
      { intent: "delete-group", confirmed: "1", returnTo: "/groups" },
    ];
    for (const form of forms) {
      const refused = (await post(group.id, cookie, form).catch((error: unknown) => error)) as {
        init: ResponseInit;
      };
      expect(refused.init.status).toBe(403);
    }
    expect(getStore().findGroup(group.id)?.name).toBe("Guarded");
  });

  it("lets another group's member neither leave, rename nor delete it", async () => {
    const target = band("Target");
    const outsider = band("Outsider");
    const cookie = await deviceCookie(outsider.group.id, outsider.pianist.deviceToken);
    const members = count("members");

    const forms: Record<string, string>[] = [
      { intent: "leave", confirmed: "1", returnTo: "/groups" },
      { intent: "update-group", name: "Taken", timeZone: "UTC", returnTo: "/groups" },
      { intent: "delete-group", confirmed: "1", returnTo: "/groups" },
    ];
    for (const form of forms) {
      const sent = (await post(target.group.id, cookie, form).catch(
        (error: unknown) => error,
      )) as Response;
      expect(sent.status).toBe(302);
      expect(sent.headers.get("Location")).toBe(groupPath(target.group));
    }
    expect(count("members")).toBe(members);
    expect(getStore().findGroup(target.group.id)?.name).toBe("Target");
  });

  it("deletes a group once confirmed and comes back here", async () => {
    const { group, organizer } = band("Doomed");
    const cookie = await deviceCookie(group.id, organizer.deviceToken);

    const asked = (await post(group.id, cookie, {
      intent: "delete-group",
      returnTo: "/groups",
    })) as { confirm: { fields: [string, string][] } };
    expect(getStore().findGroup(group.id)).not.toBeNull();
    expect(asked.confirm.fields).toContainEqual(["returnTo", "/groups"]);

    const response = (await post(group.id, cookie, {
      intent: "delete-group",
      returnTo: "/groups",
      confirmed: "1",
    })) as Response;
    expect(response.headers.get("Location")).toBe("/groups");
    expect(getStore().findGroup(group.id)).toBeNull();
  });

  it("lets a member leave once confirmed, forgetting this device's membership and coming back here", async () => {
    const { group, pianist } = band("Leavable");
    const other = band("Kept");
    const cookie = (
      await rememberMembership(
        new Request(ORIGIN, {
          headers: { Cookie: await deviceCookie(group.id, pianist.deviceToken) },
        }),
        other.group.id,
        other.pianist.deviceToken,
      )
    ).split(";")[0];
    const members = count("members");

    const asked = (await post(group.id, cookie, { intent: "leave", returnTo: "/groups" })) as {
      confirm: { title: string; fields: [string, string][] };
    };
    expect(asked.confirm.title).toBe("Leave Leavable?");
    expect(asked.confirm.fields).toContainEqual(["returnTo", "/groups"]);
    expect(count("members")).toBe(members);

    const response = (await post(group.id, cookie, {
      intent: "leave",
      returnTo: "/groups",
      confirmed: "1",
    })) as Response;

    expect(response.headers.get("Location")).toBe("/groups");
    expect(getStore().findMember(group.id, pianist.id)).toBeNull();
    const left = await readMemberships(
      new Request(ORIGIN, { headers: { Cookie: setCookies(response).mc_members } }),
    );
    expect(Object.keys(left)).toEqual([other.group.id]);
  });

  it("refuses to let the only organizer leave", async () => {
    const { group, organizer } = band("Needs Viola");
    const cookie = await deviceCookie(group.id, organizer.deviceToken);

    const refused = (await post(group.id, cookie, {
      intent: "leave",
      returnTo: "/groups",
      confirmed: "1",
    })) as { data: { problem: string }; init: ResponseInit };

    expect(refused.init.status).toBe(400);
    expect(refused.data.problem).toContain("at least one organizer");
    expect(getStore().findMember(group.id, organizer.id)).not.toBeNull();
  });

  it("cancels the confirm page back to the groups page when the form came from there", () => {
    const panel = (fields: [string, string][]) => {
      const Stub = createRoutesStub([
        {
          path: "/g/:groupId",
          Component: () => (
            <ConfirmPanel prompt={{ title: "Leave?", body: "Gone.", label: "Leave", fields }} />
          ),
        },
      ]);
      return renderToString(<Stub initialEntries={["/g/abc"]} />);
    };

    expect(
      panel([
        ["intent", "leave"],
        ["returnTo", "/groups"],
      ]),
    ).toMatch(/href="\/groups"[^>]*>Cancel/);
    expect(
      panel([
        ["intent", "leave"],
        ["returnTo", "https://example.test/"],
      ]),
    ).toMatch(/href="\/g\/abc"[^>]*>Cancel/);
  });
});
