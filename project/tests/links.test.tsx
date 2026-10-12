// Links that read like the group and land on the action (plan/phase-30.md):
// invite links of the group's name and a short code, request and rehearsal
// addresses named after them, copied links that join a visitor first, and
// Google sign-in finding the places an organizer added for its email.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { getStore, type Group } from "../app/.server/store";
import { addDays, todayInZone } from "../app/lib/availability";
import { groupPath, invitePath } from "../app/lib/group-address";
import { nextRequestSlug, rehearsalSlugs, RESERVED_SLUGS } from "../app/lib/request-address";
import { loader as homeLoader } from "../app/routes/home";
import Join, { action as joinAction, loader as joinLoader } from "../app/routes/join";
import { loader as rehearsalLink } from "../app/routes/rehearsal-link";
import RequestPage, { loader as requestLoader } from "../app/routes/request";
import { loader as scheduleLoader } from "../app/routes/schedule";
import {
  addressOf,
  cookieFrom,
  deviceCookie,
  inviteOf,
  routeArgs,
  signedIn,
  tempDatabase,
  thrownBy,
} from "./routes";

tempDatabase();
beforeAll(() => {
  getStore();
});

function statusOf(value: unknown): number | undefined {
  if (value instanceof Response) return value.status;
  return (value as { init?: ResponseInit | null }).init?.status;
}

function locationOf(value: unknown): string | null {
  return (value as Response).headers.get("Location");
}

/**
 * A group with an organizer and a member, an open request named "Spring concert"
 * and a proposed rehearsal from it three days on at 7:30 PM.
 */
async function band(name = "Link Band") {
  const store = getStore();
  const { group, organizer } = store.createGroup(name, "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  const today = todayInZone(group.timeZone, new Date());
  const request = store.createRequest(group.id, {
    name: "Spring concert",
    startDate: today,
    endDate: addDays(today, 20),
    windows: [{ startMinute: 1140, endMinute: 1320 }],
  });
  const rehearsal = store.addRehearsal(
    group.id,
    request.id,
    { date: addDays(today, 3), startMinute: 1170, endMinute: 1290 },
    "Hall",
  );
  const slug = rehearsalSlugs([rehearsal]).get(rehearsal.id) as string;
  return {
    store,
    group,
    request,
    rehearsal,
    requestHref: `${groupPath(group)}/spring-concert`,
    rehearsalHref: `${groupPath(group)}/spring-concert/${slug}`,
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: await deviceCookie(group.id, cellist.deviceToken),
  };
}
type Band = Awaited<ReturnType<typeof band>>;

function openRequest(b: Band, search = "", cookie?: string, slug = "spring-concert") {
  return requestLoader(
    routeArgs(
      `${groupPath(b.group)}/${slug}${search}`,
      { groupAddress: addressOf(b.group), requestSlug: slug },
      { cookie },
    ),
  );
}

function openRehearsal(b: Band, slug: string, search = "", cookie?: string) {
  return rehearsalLink(
    routeArgs(
      `${b.requestHref}/${slug}${search}`,
      { groupAddress: addressOf(b.group), requestSlug: "spring-concert", rehearsalSlug: slug },
      { cookie },
    ),
  );
}

function openInvite(invite: string, search = "", cookie?: string) {
  return joinLoader(routeArgs(`/join/${invite}${search}`, { invite }, { cookie }));
}

function join(group: Group, form: Record<string, string>, cookie?: string) {
  return joinAction(
    routeArgs(`/join/${inviteOf(group)}`, { invite: inviteOf(group) }, { cookie, form }),
  );
}

describe("addresses", () => {
  it("names a request after itself, then -2, -3…, never after a page of the group", () => {
    expect(nextRequestSlug("Spring Concert!", new Set())).toBe("spring-concert");
    expect(nextRequestSlug("Spring concert", new Set(["spring-concert"]))).toBe("spring-concert-2");
    expect(nextRequestSlug("Spring concert", new Set(["spring-concert", "spring-concert-2"]))).toBe(
      "spring-concert-3",
    );
    expect(nextRequestSlug("Café Trío", new Set())).toBe("cafe-trio");
    expect(nextRequestSlug("日本", new Set())).toBe("request");
    for (const reserved of RESERVED_SLUGS) {
      expect(nextRequestSlug(reserved, new Set())).toBe(`${reserved}-2`);
    }
    expect([...RESERVED_SLUGS].sort()).toEqual(["members", "profile", "requests", "schedule"]);
  });

  it("names a rehearsal after its date and start time, -2 only for a twin in the same request", () => {
    const at = (id: string, requestId: string | null, startMinute: number) => ({
      id,
      requestId,
      date: "2026-10-14",
      startMinute,
    });
    expect(
      rehearsalSlugs([
        at("a", "q", 1140),
        at("b", "q", 1170),
        at("c", "q", 1140),
        at("d", "other", 1140),
        at("e", null, 1140),
        at("f", "q", 0),
        at("g", "q", 735),
      ]),
    ).toEqual(
      new Map([
        ["a", "wed-14-oct-7pm"],
        ["b", "wed-14-oct-7-30pm"],
        ["c", "wed-14-oct-7pm-2"],
        ["d", "wed-14-oct-7pm"],
        ["f", "wed-14-oct-12am"],
        ["g", "wed-14-oct-12-15pm"],
      ]),
    );
  });

  it("stores a request's slug when it is made and keeps it through renames", async () => {
    const b = await band();
    const again = b.store.createRequest(b.group.id, {
      name: "Spring concert",
      startDate: b.request.startDate,
      endDate: b.request.endDate,
      windows: b.request.windows,
    });
    const schedule = b.store.createRequest(b.group.id, { ...again, name: "Schedule" });

    expect(b.request.slug).toBe("spring-concert");
    expect(again.slug).toBe("spring-concert-2");
    expect(schedule.slug).toBe("schedule-2");
    b.store.updateRequest(b.group.id, b.request.id, { ...b.request, name: "Autumn gig" });
    expect(b.store.findRequestBySlug(b.group.id, "spring-concert")?.name).toBe("Autumn gig");
    expect(b.store.findRequestBySlug(b.group.id, "SPRING-CONCERT")?.id).toBe(b.request.id);
    expect(b.store.findRequestBySlug(b.group.id, "autumn-gig")).toBeNull();
    // Another group's request of the same name has the same slug, and stays its own.
    const other = await band("Other Band");
    expect(other.store.findRequestBySlug(other.group.id, "spring-concert")?.id).toBe(
      other.request.id,
    );
  });
});

describe("invite links", () => {
  it("read as the group's name and an 8-character code, and find it whatever name precedes it", async () => {
    const b = await band("Invite Band");
    expect(invitePath(b.group)).toMatch(/^\/join\/invite-band-[23456789a-km-np-z]{8}$/);
    expect(invitePath(b.group)).not.toContain(b.group.shortId);

    const page = (await openInvite(inviteOf(b.group))) as { groupName: string };
    expect(page.groupName).toBe("Invite Band");
    // An earlier name, or capitals: the current link, keeping the query.
    const renamed = await thrownBy(
      openInvite(`old-name-${b.group.inviteCode.toUpperCase()}`, "?then=%2Fx"),
    );
    expect(statusOf(renamed)).toBe(301);
    expect(locationOf(renamed)).toBe(`${invitePath(b.group)}?then=%2Fx`);
    // A data request is sent to the page, without the router's own parameter.
    const data = await thrownBy(
      joinLoader(
        routeArgs(`/join/old-name-${b.group.inviteCode}.data?then=%2Fx&_routes=routes%2Fjoin`, {
          invite: `old-name-${b.group.inviteCode}`,
        }),
      ),
    );
    expect(locationOf(data)).toBe(`${invitePath(b.group)}?then=%2Fx`);
    // Joining through an out-of-date link still works.
    const joined = await joinAction(
      routeArgs(
        `/join/old-name-${b.group.inviteCode}`,
        { invite: `old-name-${b.group.inviteCode}` },
        { form: { displayName: "Oboe" } },
      ),
    );
    expect(statusOf(joined)).toBe(302);
  });

  it("finds a group whose invite is as long as an old one", async () => {
    const b = await band("Thirteen Char");
    expect(inviteOf(b.group)).toHaveLength(22);

    const page = (await openInvite(inviteOf(b.group))) as { groupName: string };
    expect(page.groupName).toBe("Thirteen Char");
  });

  it("says an old long invite link has changed, and joins nobody through it", async () => {
    const old = "Abc_def-ghijklmnopqrst";
    const loaded = await openInvite(old);
    const posted = await joinAction(
      routeArgs(`/join/${old}`, { invite: old }, { form: { displayName: "X" } }),
    );

    expect(statusOf(loaded)).toBe(410);
    expect((loaded as { data: unknown }).data).toEqual({ changed: true });
    // A join page left open across the change says the same when sent.
    expect(statusOf(posted)).toBe(410);
    expect((posted as { data: unknown }).data).toEqual({ changed: true });
    const Stub = createRoutesStub([{ id: "join", path: "/join/:invite", Component: Join }]);
    const html = renderToString(
      <Stub
        initialEntries={["/join/x"]}
        hydrationData={{ loaderData: { join: { changed: true } } }}
      />,
    );
    expect(html).toContain("<h1>This invite link has changed</h1>");
    expect(html).toContain("Ask your group&#x27;s organizer for the new one.");
    expect(html).not.toContain("Join group");
  });
});

describe("request links", () => {
  it("open the request by its name, and nothing for an unknown one", async () => {
    const b = await band();
    const page = (await openRequest(b, "", b.cellistCookie)) as { name: string };

    expect(page.name).toBe("Spring concert");
    expect(statusOf(await thrownBy(openRequest(b, "", b.cellistCookie, "nothing")))).toBe(404);
  });

  it("send a visitor holding the group's code through joining, and any other visitor to the group", async () => {
    const b = await band();

    const holding = await thrownBy(openRequest(b, `?join=${b.group.inviteCode}&times=list`));
    expect(locationOf(holding)).toBe(
      `${invitePath(b.group)}?then=${encodeURIComponent(`${b.requestHref}?times=list`)}`,
    );
    const upper = await thrownBy(openRequest(b, `?join=${b.group.inviteCode.toUpperCase()}`));
    expect(locationOf(upper)).toBe(
      `${invitePath(b.group)}?then=${encodeURIComponent(b.requestHref)}`,
    );
    for (const search of ["", "?join=aaaaaaaa", `?join=${b.group.shortId}`]) {
      expect(locationOf(await thrownBy(openRequest(b, search)))).toBe(groupPath(b.group));
    }
    // An unknown address answers a visitor the same way, so names can't be probed.
    const unknown = await thrownBy(openRequest(b, "", undefined, "guessed-name"));
    expect(statusOf(unknown)).toBe(302);
    expect(locationOf(unknown)).toBe(groupPath(b.group));
  });

  it("send a member to the same address without the code", async () => {
    const b = await band();
    const response = await thrownBy(
      openRequest(b, `?times=list&join=${b.group.inviteCode}`, b.cellistCookie),
    );

    expect(statusOf(response)).toBe(302);
    expect(locationOf(response)).toBe(`${b.requestHref}?times=list`);
  });
});

describe("joining from a copied link", () => {
  it("lands a new member on the link, through the form and Google sign-in alike", async () => {
    const b = await band();
    const then = `${b.requestHref}?times=list`;
    const page = (await openInvite(inviteOf(b.group), `?then=${encodeURIComponent(then)}`)) as {
      then: string;
      signInUrl: string | null;
    };
    expect(page.then).toBe(then);

    const joined = await join(b.group, { displayName: "Flute", then });
    expect(locationOf(joined)).toBe(then);
    // Back on the invite later, a member goes straight to the link.
    const cookie = cookieFrom(joined as Response);
    const again = await thrownBy(
      openInvite(inviteOf(b.group), `?then=${encodeURIComponent(then)}`, cookie),
    );
    expect(locationOf(again)).toBe(then);
  });

  it("lands a returning member by name, and a Google sign-in, on the link too", async () => {
    const b = await band();
    b.store.addMember(b.group.id, "Harp", "member");
    expect(locationOf(await join(b.group, { displayName: "Harp", then: b.requestHref }))).toBe(
      b.requestHref,
    );

    b.store.addInvitedMember(b.group.id, "Tuba", "tuba-links@example.test");
    const { cookie } = await signedIn({
      sub: "tuba-links",
      email: "tuba-links@example.test",
      name: "Tuba",
      emailVerified: true,
    });
    const claimed = await thrownBy(
      openInvite(inviteOf(b.group), `?then=${encodeURIComponent(b.requestHref)}`, cookie),
    );
    expect(locationOf(claimed)).toBe(b.requestHref);
  });

  it("lands on a rehearsal's card on the schedule for a rehearsal's link", async () => {
    const b = await band();
    const joined = await join(b.group, { displayName: "Horn", then: b.rehearsalHref });

    expect(locationOf(joined)).toBe(`${groupPath(b.group)}/schedule#rehearsal-${b.rehearsal.id}`);
  });

  it("ignores a link outside the group, landing on the first open request instead", async () => {
    const b = await band();
    const other = await band("Elsewhere");
    for (const then of [other.requestHref, "https://evil.example/", "//evil.example/x", "nope"]) {
      const joined = await join(b.group, { displayName: `Spare ${then.length}`, then });
      expect(locationOf(joined)).toBe(b.requestHref);
    }
    const page = (await openInvite(
      inviteOf(b.group),
      `?then=${encodeURIComponent(other.requestHref)}`,
    )) as { then: string };
    expect(page.then).toBe("");
    // A malformed escape is a page of the group like any other, never an error.
    const odd = await join(b.group, { displayName: "Odd", then: `${b.requestHref}/%ZZ` });
    expect(locationOf(odd)).toBe(`${b.requestHref}/%ZZ`);
  });
});

describe("rehearsal links", () => {
  it("land a member on the rehearsal's card, where they answer", async () => {
    const b = await band();
    const slug = b.rehearsalHref.split("/").at(-1) as string;
    const response = await thrownBy(openRehearsal(b, slug, "", b.cellistCookie));

    expect(slug).toMatch(/^[a-z]{3}-\d{1,2}-[a-z]{3}-7-30pm$/);
    expect(locationOf(response)).toBe(`${groupPath(b.group)}/schedule#rehearsal-${b.rehearsal.id}`);
    expect(statusOf(await thrownBy(openRehearsal(b, "mon-1-jan-7pm", "", b.cellistCookie)))).toBe(
      404,
    );
  });

  it("send a visitor holding the code through joining, others to the group", async () => {
    const b = await band();
    const slug = b.rehearsalHref.split("/").at(-1) as string;

    const holding = await thrownBy(openRehearsal(b, slug, `?join=${b.group.inviteCode}`));
    expect(locationOf(holding)).toBe(
      `${invitePath(b.group)}?then=${encodeURIComponent(b.rehearsalHref)}`,
    );
    expect(locationOf(await thrownBy(openRehearsal(b, slug)))).toBe(groupPath(b.group));
    expect(locationOf(await thrownBy(openRehearsal(b, "mon-1-jan-7pm")))).toBe(groupPath(b.group));
  });
});

describe("copied links", () => {
  it("give organizers a request's and a proposed rehearsal's link with the code, and members neither", async () => {
    const b = await band();
    const organizerRequest = (await openRequest(b, "", b.organizerCookie)) as {
      shareUrl: string | null;
    };
    const memberRequest = await openRequest(b, "", b.cellistCookie);
    const schedule = (cookie: string) =>
      scheduleLoader(
        routeArgs(
          `${groupPath(b.group)}/schedule`,
          { groupAddress: addressOf(b.group) },
          { cookie },
        ),
      );
    const organizerSchedule = (await schedule(b.organizerCookie)) as {
      rehearsals: { id: string; organizer: { shareUrl: string | null } | null }[];
    };
    const memberSchedule = await schedule(b.cellistCookie);

    expect(new URL(organizerRequest.shareUrl as string).pathname).toBe(b.requestHref);
    expect(new URL(organizerRequest.shareUrl as string).search).toBe(`?join=${b.group.inviteCode}`);
    const card = organizerSchedule.rehearsals.find((item) => item.id === b.rehearsal.id);
    expect(card?.organizer?.shareUrl).toMatch(
      new RegExp(`${b.rehearsalHref}\\?join=${b.group.inviteCode}$`),
    );
    for (const page of [memberRequest, memberSchedule]) {
      expect(JSON.stringify(page)).not.toContain(b.group.inviteCode);
    }
    // A confirmed rehearsal has nothing to answer, so no link to copy.
    b.store.confirmRehearsal(b.group.id, b.rehearsal.id);
    const confirmed = (await schedule(b.organizerCookie)) as typeof organizerSchedule;
    expect(confirmed.rehearsals[0].organizer?.shareUrl).toBeNull();

    const Stub = createRoutesStub([
      { id: "request", path: "/g/:groupAddress/:requestSlug", Component: RequestPage },
    ]);
    const html = renderToString(
      <Stub
        initialEntries={[b.requestHref]}
        hydrationData={{ loaderData: { request: organizerRequest } }}
      />,
    );
    expect(html).toContain("<summary>Share this availability request</summary>");
    expect(html).toContain('aria-label="Link to this availability request"');
    expect(html).toContain(`value="${organizerRequest.shareUrl}"`);
  });
});

describe("Google sign-in", () => {
  it("finds the groups an organizer added this email to after the session began", async () => {
    const b = await band();
    const { cookie } = await signedIn({
      sub: "late-add",
      email: "late-add@example.test",
      name: "Late",
      emailVerified: true,
    });
    b.store.addInvitedMember(b.group.id, "Late", "late-add@example.test");

    const home = (await homeLoader(routeArgs("/", {}, { cookie }))) as {
      groups: { name: string }[];
    };

    expect(home.groups.map((group) => group.name)).toEqual(["Link Band"]);
  });
});
