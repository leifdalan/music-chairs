import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { rememberMembership } from "../app/.server/membership";
import { getStore } from "../app/.server/store";
import GroupPage, { loader } from "../app/routes/group";
import { ORIGIN, routeArgs, thrownBy } from "./routes";

type GroupData = Awaited<ReturnType<typeof loader>>;

/** A Cookie header for a device that is `memberId` in `groupId`. */
async function deviceCookie(groupId: string, memberId: string): Promise<string> {
  const setCookie = await rememberMembership(new Request(ORIGIN), groupId, memberId);
  return setCookie.split(";")[0];
}

function load(groupId: string, cookie?: string) {
  return loader(routeArgs(`/g/${groupId}`, { groupId }, { cookie })) as Promise<GroupData>;
}

function render(loaderData: GroupData): string {
  const Stub = createRoutesStub([{ id: "group", path: "/g/:groupId", Component: GroupPage }]);
  return renderToString(
    <Stub initialEntries={["/g/x"]} hydrationData={{ loaderData: { group: loaderData } }} />,
  );
}

function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Thursday Quartet", "Viola");
  const cellist = store.addMember(group.id, "Cellist", "member");
  return { group, organizer, cellist };
}

describe("group route", () => {
  it("gives the organizer the member list with roles and the invite link", async () => {
    const { group, organizer } = band();

    const loaded = await load(group.id, await deviceCookie(group.id, organizer.id));

    expect(loaded).toEqual({
      groupName: "Thursday Quartet",
      members: [
        { displayName: "Viola", role: "organizer", isViewer: true },
        { displayName: "Cellist", role: "member", isViewer: false },
      ],
      viewer: { displayName: "Viola", role: "organizer" },
      inviteUrl: `${ORIGIN}/join/${group.inviteToken}`,
    });
  });

  it("gives every organizer the invite link, not only the creator", async () => {
    const { group } = band();
    const pianist = getStore().addMember(group.id, "Pianist", "organizer");

    const loaded = await load(group.id, await deviceCookie(group.id, pianist.id));

    expect(loaded.inviteUrl).toBe(`${ORIGIN}/join/${group.inviteToken}`);
  });

  it("withholds the invite link from members and visitors", async () => {
    const { group, cellist } = band();

    const asMember = await load(group.id, await deviceCookie(group.id, cellist.id));
    const asVisitor = await load(group.id);

    expect(asMember.viewer).toEqual({ displayName: "Cellist", role: "member" });
    expect(asMember.inviteUrl).toBeNull();
    expect(asVisitor.viewer).toBeNull();
    expect(asVisitor.inviteUrl).toBeNull();
    expect(asVisitor.members.map((member) => member.displayName)).toEqual(["Viola", "Cellist"]);
  });

  it("treats a membership from another group or a removed member as no viewer", async () => {
    const { group } = band();
    const other = getStore().createGroup("Other", "Drummer");

    const crossGroup = await load(group.id, await deviceCookie(group.id, other.organizer.id));
    const unknown = await load(group.id, await deviceCookie(group.id, "B".repeat(22)));

    expect(crossGroup.viewer).toBeNull();
    expect(unknown.viewer).toBeNull();
  });

  it("never sends member ids or the invite token to non-organizers", async () => {
    const { group, organizer, cellist } = band();

    for (const cookie of [await deviceCookie(group.id, cellist.id), undefined]) {
      const loaded = await load(group.id, cookie);
      const page = JSON.stringify(loaded) + render(loaded);
      for (const secret of [organizer.id, cellist.id, group.inviteToken]) {
        expect(page).not.toContain(secret);
      }
    }
    const asOrganizer = await load(group.id, await deviceCookie(group.id, organizer.id));
    const organizerPage = JSON.stringify(asOrganizer) + render(asOrganizer);
    for (const secret of [organizer.id, cellist.id]) expect(organizerPage).not.toContain(secret);
  });

  it.each([
    ["unknown", "C".repeat(22)],
    ["malformed", "nope"],
  ])("gives a 404 for an %s group id", async (_kind, groupId) => {
    const thrown = await thrownBy(load(groupId));

    expect((thrown as { init?: ResponseInit | null }).init?.status).toBe(404);
  });

  it("renders names, roles and the invite panel for an organizer", async () => {
    const { group, organizer } = band();

    const html = render(await load(group.id, await deviceCookie(group.id, organizer.id)));

    expect(html).toContain("<h1>Thursday Quartet</h1>");
    expect(html).toMatch(/Viola.*\(you\).*organizer/s);
    expect(html).toMatch(/Cellist.*member/s);
    expect(html).toContain(`value="${ORIGIN}/join/${group.inviteToken}"`);
    expect(html).toContain("Copy link");
    expect(html).toContain('role="status"');
  });

  it("renders no invite panel for a member, and a join hint for a visitor", async () => {
    const { group, cellist } = band();

    const memberHtml = render(await load(group.id, await deviceCookie(group.id, cellist.id)));
    const visitorHtml = render(await load(group.id));

    expect(memberHtml).not.toContain("Copy link");
    expect(memberHtml).toMatch(/Cellist.*\(you\)/s);
    expect(visitorHtml).not.toContain("Copy link");
    expect(visitorHtml).toContain("haven&#x27;t joined this group");
  });
});
