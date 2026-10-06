import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { readToast } from "../app/.server/flash";
import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import GroupPage, { action, loader } from "../app/routes/group";
import {
  deviceCookie,
  ORIGIN,
  routeArgs,
  setCookies,
  signedIn,
  thrownBy,
  addressOf,
  addressFor,
} from "./routes";

type GroupData = Awaited<ReturnType<typeof loader>>;

function load(groupId: string, cookie?: string) {
  return loader(
    routeArgs(`/g/${addressFor(groupId)}`, { groupAddress: addressFor(groupId) }, { cookie }),
  ) as Promise<GroupData>;
}

function render(loaderData: GroupData): string {
  const Stub = createRoutesStub([{ id: "group", path: "/g/:groupId", Component: GroupPage }]);
  // React separates adjacent text nodes with empty comments in server output.
  return renderToString(
    <Stub initialEntries={["/g/x"]} hydrationData={{ loaderData: { group: loaderData } }} />,
  ).replaceAll("<!-- -->", "");
}

function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Thursday Quartet", "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  return { group, organizer, cellist };
}

/** The toast message a redirect leaves, read the way the root loader reads it. */
async function toastOf(response: unknown): Promise<string | undefined> {
  const cookie = setCookies(response as Response).mc_toast;
  if (!cookie) return undefined;
  return (await readToast(new Request(ORIGIN, { headers: { Cookie: cookie } }))).toast?.message;
}

describe("group route", () => {
  it("confirms the organizer's settings with a toast", async () => {
    const { group, organizer, cellist } = band();
    const cookie = await deviceCookie(group.id, organizer.deviceToken);
    const post = (form: Record<string, string>) =>
      action(routeArgs(groupPath(group), { groupAddress: addressOf(group) }, { cookie, form }));

    expect(await toastOf(await post({ intent: "set-privacy", value: "on" }))).toBe(
      "Members now see who is free",
    );
    expect(
      await toastOf(await post({ intent: "set-optional", memberId: cellist.id, value: "on" })),
    ).toBe("Marked optional");
  });

  it("shows a linked member's Google email only to organizers and to that member", async () => {
    const { group, organizer, cellist } = band();
    const pianist = getStore().addMember(group.id, "Pianist", "member");
    const { account } = await signedIn({
      sub: "sub-cellist",
      email: "cellist@example.test",
      name: "Cel",
    });
    getStore().linkMember(group.id, cellist.id, account.id);

    const asOrganizer = await load(group.id, await deviceCookie(group.id, organizer.deviceToken));
    const asCellist = await load(group.id, await deviceCookie(group.id, cellist.deviceToken));
    const asPianist = await load(group.id, await deviceCookie(group.id, pianist.deviceToken));
    const asVisitor = await load(group.id);

    expect(asOrganizer.members[1]).toMatchObject({
      displayName: "Cellist",
      google: true,
      manage: { email: "cellist@example.test" },
    });
    expect(render(asOrganizer)).toContain("cellist@example.test");
    expect(asCellist.viewer?.email).toBe("cellist@example.test");
    for (const page of [asPianist, asVisitor]) {
      expect(JSON.stringify(page)).not.toContain("cellist@example.test");
      expect(page.members.map((member) => member.google)).toEqual([false, true, false]);
    }
  });

  it("gives the organizer the member list with roles and the invite link", async () => {
    const { group, organizer, cellist } = band();

    const loaded = await load(group.id, await deviceCookie(group.id, organizer.deviceToken));

    expect(loaded).toEqual({
      groupHref: groupPath(group),
      groupName: "Thursday Quartet",
      timeZone: "Europe/London",
      members: [
        {
          displayName: "Viola",
          instrument: "",
          role: "organizer",
          isViewer: true,
          google: false,
          manage: {
            id: organizer.id,
            optional: false,
            email: null,
            invitedEmail: null,
            lastOrganizer: true,
          },
        },
        {
          displayName: "Cellist",
          instrument: "",
          role: "member",
          isViewer: false,
          google: false,
          manage: {
            id: cellist.id,
            optional: false,
            email: null,
            invitedEmail: null,
            lastOrganizer: false,
          },
        },
      ],
      viewer: { displayName: "Viola", role: "organizer", email: null },
      signInAvailable: false,
      notice: null,
      showNames: false,
      inviteUrl: `${ORIGIN}/join/${group.inviteToken}`,
      requests: [],
      upcoming: [],
      memberCount: 2,
      settings: { timeZones: expect.arrayContaining(["UTC", "Europe/London"]) },
    });
  });

  it("gives every organizer the invite link, not only the creator", async () => {
    const { group } = band();
    const pianist = getStore().addMember(group.id, "Pianist", "organizer");

    const loaded = await load(group.id, await deviceCookie(group.id, pianist.deviceToken));

    expect(loaded.inviteUrl).toBe(`${ORIGIN}/join/${group.inviteToken}`);
  });

  it("withholds the invite link from members and visitors", async () => {
    const { group, cellist } = band();

    const asMember = await load(group.id, await deviceCookie(group.id, cellist.deviceToken));
    const asVisitor = await load(group.id);

    expect(asMember.viewer).toEqual({ displayName: "Cellist", role: "member", email: null });
    expect(asMember.inviteUrl).toBeNull();
    expect(asVisitor.viewer).toBeNull();
    expect(asVisitor.inviteUrl).toBeNull();
    expect(asVisitor.members.map((member) => member.displayName)).toEqual(["Viola", "Cellist"]);
  });

  it("treats a membership from another group or a removed member as no viewer", async () => {
    const { group } = band();
    const other = getStore().createGroup("Other", "Drummer", "Europe/London");

    const crossGroup = await load(
      group.id,
      await deviceCookie(group.id, other.organizer.deviceToken),
    );
    const unknown = await load(group.id, await deviceCookie(group.id, "B".repeat(22)));

    expect(crossGroup.viewer).toBeNull();
    expect(unknown.viewer).toBeNull();
  });

  it("never sends device tokens, and keeps member ids and the invite token to organizers", async () => {
    const { group, organizer, cellist } = band();

    for (const cookie of [await deviceCookie(group.id, cellist.deviceToken), undefined]) {
      const loaded = await load(group.id, cookie);
      const page = JSON.stringify(loaded) + render(loaded);
      for (const hidden of [
        organizer.deviceToken,
        cellist.deviceToken,
        organizer.id,
        cellist.id,
        group.inviteToken,
      ]) {
        expect(page).not.toContain(hidden);
      }
    }
    const asOrganizer = await load(group.id, await deviceCookie(group.id, organizer.deviceToken));
    const organizerPage = JSON.stringify(asOrganizer) + render(asOrganizer);
    for (const secret of [organizer.deviceToken, cellist.deviceToken]) {
      expect(organizerPage).not.toContain(secret);
    }
  });

  function post(groupId: string, cookie: string | undefined, form: Record<string, string>) {
    return action(
      routeArgs(
        `/g/${addressFor(groupId)}`,
        { groupAddress: addressFor(groupId) },
        { cookie, form },
      ),
    );
  }

  function statusOf(value: unknown): number | undefined {
    if (value instanceof Response) return value.status;
    return (value as { init?: ResponseInit | null }).init?.status;
  }

  it("lets an organizer tag a member optional, switch privacy and promote a member", async () => {
    const { group, organizer, cellist } = band();
    const cookie = await deviceCookie(group.id, organizer.deviceToken);

    const optional = await post(group.id, cookie, {
      intent: "set-optional",
      memberId: cellist.id,
      value: "on",
    });
    const privacy = await post(group.id, cookie, { intent: "set-privacy", value: "on" });
    const promoted = await post(group.id, cookie, {
      intent: "set-role",
      confirmed: "1",
      memberId: cellist.id,
      value: "on",
    });

    for (const result of [optional, privacy, promoted]) expect(statusOf(result)).toBe(302);
    expect(getStore().findMember(group.id, cellist.id)).toMatchObject({
      optional: true,
      role: "organizer",
    });
    expect(getStore().findGroup(group.id)?.showNames).toBe(true);
    const asCellist = await load(group.id, await deviceCookie(group.id, cellist.deviceToken));
    expect(asCellist.inviteUrl).toBe(`${ORIGIN}/join/${group.inviteToken}`);
  });

  it("refuses to remove the last organizer", async () => {
    const { group, organizer } = band();
    const cookie = await deviceCookie(group.id, organizer.deviceToken);

    const result = await post(group.id, cookie, {
      intent: "set-role",
      confirmed: "1",
      memberId: organizer.id,
      value: "off",
    });

    expect(statusOf(result)).toBe(400);
    expect((result as { data: { problem: string } }).data.problem).toContain(
      "at least one organizer",
    );
    expect(getStore().findMember(group.id, organizer.id)?.role).toBe("organizer");
  });

  it("refuses organizer settings from members and visitors", async () => {
    const { group, organizer, cellist } = band();
    const memberCookie = await deviceCookie(group.id, cellist.deviceToken);

    const asMember = await thrownBy(
      post(group.id, memberCookie, {
        intent: "set-role",
        confirmed: "1",
        memberId: cellist.id,
        value: "on",
      }),
    );
    const asVisitor = await thrownBy(
      post(group.id, undefined, { intent: "set-privacy", value: "on" }),
    );

    expect(statusOf(asMember)).toBe(403);
    expect((asVisitor as Response).headers.get("Location")).toBe(groupPath(group));
    expect(getStore().findMember(group.id, cellist.id)?.role).toBe("member");
    expect(getStore().findGroup(group.id)?.showNames).toBe(false);
    expect(getStore().findMember(group.id, organizer.id)?.role).toBe("organizer");
  });

  it.each([
    ["an unknown short id", "quartet-zzzzzzzz"],
    ["a malformed", "nope"],
    ["an internal-id-shaped", "C".repeat(22)],
  ])("gives a 404 for %s address", async (_kind, address) => {
    const thrown = await thrownBy(loader(routeArgs(`/g/${address}`, { groupAddress: address })));

    expect((thrown as { init?: ResponseInit | null }).init?.status).toBe(404);
  });

  it("renders names, roles and the invite panel for an organizer", async () => {
    const { group, organizer } = band();

    const html = render(await load(group.id, await deviceCookie(group.id, organizer.deviceToken)));

    expect(html).toContain("<h1>Thursday Quartet</h1>");
    expect(html).toMatch(/Viola.*\(you\).*organizer/s);
    expect(html).toMatch(/Cellist.*member/s);
    expect(html).toContain(`value="${ORIGIN}/join/${group.inviteToken}"`);
    expect(html).toContain("Copy link");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Make optional: Cellist"');
    expect(html).toContain('aria-label="Make organizer: Cellist"');
  });

  it("renders no invite panel for a member, and a join hint for a visitor", async () => {
    const { group, cellist } = band();

    const memberHtml = render(
      await load(group.id, await deviceCookie(group.id, cellist.deviceToken)),
    );
    const visitorHtml = render(await load(group.id));

    expect(memberHtml).not.toContain("Copy link");
    // Times are given on requests now (plan/phase-23.md): no My availability page.
    expect(memberHtml).not.toContain("My availability");
    expect(memberHtml).not.toContain("/availability");
    expect(memberHtml).toContain(">Schedule<");
    expect(memberHtml).toContain("Times in Europe/London");
    expect(memberHtml).toMatch(/Cellist.*\(you\)/s);
    expect(visitorHtml).not.toContain("Copy link");
    expect(visitorHtml).not.toContain("My availability");
    expect(visitorHtml).toContain("haven&#x27;t joined this group");
  });
});
