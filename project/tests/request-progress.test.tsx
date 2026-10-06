// Rehearsals grouped by request, with completion status and "Add to calendar"
// (plan/phase-17.md): the figures, the schedule page, the home screen and the
// per-request download.
import { DatabaseSync } from "node:sqlite";

import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CALENDAR_SCOPES } from "../app/.server/google";
import { rememberMembership } from "../app/.server/membership";
import { requestProgress } from "../app/.server/progress";
import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import Home, { loader as homeLoader } from "../app/routes/home";
import { loader as downloadLoader } from "../app/routes/request-calendar";
import Schedule, {
  action as scheduleAction,
  loader as scheduleLoader,
} from "../app/routes/schedule";
import { fakeGoogle } from "./google-fake";
import {
  deviceCookie,
  ORIGIN,
  requestIn,
  routeArgs,
  signedIn,
  tempDatabase,
  thrownBy,
  addressOf,
  addressFor,
} from "./routes";

tempDatabase();

// 2026-10-02 (a Friday) in Europe/London; the answer window runs to 2026-11-26.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  getStore();
});
afterAll(() => {
  vi.useRealTimers();
});

const TODAY = "2026-10-02";

function once(startDate: string, startMinute = 19 * 60) {
  return {
    kind: "once" as const,
    startDate,
    endDate: null,
    startMinute,
    endMinute: startMinute + 120,
  };
}

let bands = 0;

/** Viola organizes; Cellist and Pianist are members. */
async function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup(`Band ${++bands}`, "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  const pianist = store.addMember(group.id, "Pianist", "member");
  return {
    store,
    group,
    organizer,
    cellist,
    pianist,
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: await deviceCookie(group.id, cellist.deviceToken),
  };
}

type ScheduleData = Awaited<ReturnType<typeof scheduleLoader>>;
type HomeData = Awaited<ReturnType<typeof homeLoader>>;

function loadSchedule(groupId: string, cookie: string) {
  return scheduleLoader(
    routeArgs(
      `/g/${addressFor(groupId)}/schedule`,
      { groupAddress: addressFor(groupId) },
      { cookie },
    ),
  ) as Promise<ScheduleData>;
}

function renderSchedule(data: ScheduleData): string {
  const Stub = createRoutesStub([
    { id: "schedule", path: "/g/:groupId/schedule", Component: Schedule },
  ]);
  return renderToString(
    <Stub initialEntries={["/g/x/schedule"]} hydrationData={{ loaderData: { schedule: data } }} />,
  ).replaceAll("<!-- -->", "");
}

function renderHome(data: HomeData): string {
  const Stub = createRoutesStub([{ id: "home", path: "/", Component: Home }]);
  return renderToString(
    <Stub initialEntries={["/"]} hydrationData={{ loaderData: { home: data } }} />,
  ).replaceAll("<!-- -->", "");
}

function download(groupId: string, requestId: string, cookie?: string) {
  return downloadLoader(
    routeArgs(
      `/g/${addressFor(groupId)}/requests/${requestId}/calendar.ics`,
      { groupAddress: addressFor(groupId), requestId },
      { cookie },
    ),
  );
}

function statusOf(value: unknown): number | undefined {
  if (value instanceof Response) return value.status;
  return (value as { init?: ResponseInit | null }).init?.status;
}

describe("request progress", () => {
  it("counts confirmed of all, members answering every open proposal, and completion", async () => {
    const { store, group, organizer, cellist, pianist } = await band();
    const concert = requestIn(group.id, { name: "Concert" });
    const [a, b, c] = store.addRehearsals(
      group.id,
      concert,
      [once("2026-10-08"), once("2026-10-09"), once("2026-10-10")],
      "Hall",
    );
    store.confirmRehearsal(group.id, a.id);
    // Viola answers both open proposals, Cellist only one, Pianist none.
    store.setRsvp(group.id, b.id, organizer.id, "2026-10-09", "yes");
    store.setRsvp(group.id, c.id, organizer.id, "2026-10-10", "no");
    store.setRsvp(group.id, b.id, cellist.id, "2026-10-09", "maybe");
    store.setRsvp(group.id, c.id, pianist.id, "2026-10-10", "yes");

    expect(requestProgress(group, TODAY)).toEqual([
      {
        requestId: concert,
        name: "Concert",
        confirmed: 1,
        total: 3,
        answered: 1, // Pianist answered only one, Cellist only the other
        memberCount: 3,
        complete: false,
        proposed: [
          { id: b.id, summary: "Fri 9 Oct, 7–9 PM" },
          { id: c.id, summary: "Sat 10 Oct, 7–9 PM" },
        ],
      },
    ]);

    store.deleteRehearsal(group.id, b.id);
    store.confirmRehearsal(group.id, c.id);
    expect(requestProgress(group, TODAY)).toEqual([
      expect.objectContaining({
        confirmed: 2,
        total: 2,
        answered: null,
        complete: true,
        proposed: [],
      }),
    ]);
  });

  it("drops requests whose confirmed dates have all passed, newest request first", async () => {
    const { store, group } = await band();
    const old = requestIn(group.id, { name: "Old" });
    const current = requestIn(group.id, { name: "Current" });
    const done = store.addRehearsal(group.id, old, once("2026-09-24"), "");
    store.confirmRehearsal(group.id, done.id);
    store.addRehearsal(group.id, current, once("2026-10-15"), "");
    const later = requestIn(group.id, { name: "Later" });
    const confirmed = store.addRehearsal(group.id, later, once("2026-10-20"), "");
    store.confirmRehearsal(group.id, confirmed.id);
    requestIn(group.id, { name: "Empty" });

    expect(requestProgress(group, TODAY).map((item) => item.name)).toEqual(["Later", "Current"]);
  });

  it("keeps a request with a past proposal listed and not complete until it is deleted", async () => {
    const { store, group } = await band();
    const concert = requestIn(group.id, { name: "Concert" });
    const stale = store.addRehearsal(group.id, concert, once("2026-09-30"), "");
    const kept = store.addRehearsal(group.id, concert, once("2026-10-15"), "");
    store.confirmRehearsal(group.id, kept.id);

    expect(requestProgress(group, TODAY)[0]).toMatchObject({ complete: false, answered: 0 });

    store.deleteRehearsal(group.id, stale.id);
    expect(requestProgress(group, TODAY)[0]).toMatchObject({ complete: true });
  });
});

describe("the schedule page by request", () => {
  async function scheduled() {
    const setup = await band();
    const { store, group } = setup;
    const concert = requestIn(group.id, { name: "Concert" });
    const gig = requestIn(group.id, { name: "Gig" });
    const [proposed, confirmed] = store.addRehearsals(
      group.id,
      concert,
      [once("2026-10-08"), once("2026-10-09")],
      "Hall",
    );
    store.confirmRehearsal(group.id, confirmed.id);
    const gigDate = store.addRehearsal(group.id, gig, once("2026-10-16"), "Club");
    store.confirmRehearsal(group.id, gigDate.id);
    return { ...setup, concert, gig, proposed, confirmed, gigDate };
  }

  it("lists proposals under their request, confirmed ones with theirs, and how each request is going", async () => {
    const { group, cellistCookie, organizerCookie, concert, gig } = await scheduled();

    for (const cookie of [cellistCookie, organizerCookie]) {
      const page = await loadSchedule(group.id, cookie);
      const html = renderSchedule(page);
      const proposed = html.slice(
        html.indexOf('id="proposed-heading"'),
        html.indexOf('id="progress-heading"'),
      );
      expect(proposed).toContain(`href="/g/x/requests/${concert}"`);
      expect(proposed).toContain(">Concert</a></h3>");
      expect(proposed).toContain("Thu 8 Oct, 7–9 PM");
      expect(proposed).not.toContain("Gig");
      expect(html).toContain('<p class="hint">From Gig</p>');
      expect(html).toContain('<p class="hint">From Concert</p>');
      expect(html).not.toContain("Earlier rehearsals");

      expect(
        page.progress.map((item) => [item.name, item.confirmed, item.total, item.complete]),
      ).toEqual([
        ["Gig", 1, 1, true],
        ["Concert", 1, 2, false],
      ]);
      const progress = html.slice(html.indexOf('id="progress-heading"'));
      expect(progress).toContain("1 of 2 confirmed · 0 of 3 answered all");
      expect(progress).toContain("Complete");
      // The download only for the complete request, as a plain link.
      expect(progress).toContain(
        `href="${groupPath(group)}/requests/${gig}/calendar.ics" download=""`,
      );
      expect(progress).not.toContain(`/requests/${concert}/calendar.ics`);
    }
  });

  it("puts every rehearsal without a request under Earlier rehearsals", async () => {
    const { group, organizerCookie } = await band();
    // Rehearsals made before this phase have no request; the store no longer
    // makes them, so they are written as migration 9 left them.
    const raw = new DatabaseSync(process.env.MUSIC_CHAIRS_DB as string);
    const insert = raw.prepare(
      `INSERT INTO rehearsals (id, group_id, kind, start_date, end_date, start_minute, end_minute,
        location, status, created_at, request_id)
       VALUES (?, ?, 'once', ?, NULL, 1140, 1260, '', ?, '2026-09-01', NULL)`,
    );
    insert.run("E".repeat(21) + "1", group.id, "2026-10-12", "confirmed");
    insert.run("E".repeat(21) + "2", group.id, "2026-10-13", "proposed");
    raw.close();

    const html = renderSchedule(await loadSchedule(group.id, organizerCookie));

    const earlier = html.slice(
      html.indexOf('id="earlier-heading"'),
      html.indexOf('id="progress-heading"'),
    );
    expect(earlier).toContain('class="rehearsal confirmed"');
    expect(earlier).toContain('class="rehearsal proposed"');
    expect(earlier).toContain("Mon 12 Oct");
    expect(earlier).toContain("Tue 13 Oct");
    const confirmed = html.slice(
      html.indexOf('id="confirmed-heading"'),
      html.indexOf('id="proposed-heading"'),
    );
    expect(confirmed).toContain("Nothing confirmed yet.");
    expect(
      html.slice(html.indexOf('id="proposed-heading"'), html.indexOf('id="earlier-heading"')),
    ).toContain("No proposed rehearsals.");
  });

  it("shows a member figures only, never another member's id", async () => {
    const { group, organizer, pianist, cellistCookie } = await scheduled();

    const page = await loadSchedule(group.id, cellistCookie);

    const visible = JSON.stringify(page);
    for (const hidden of [organizer.id, pianist.id]) expect(visible).not.toContain(hidden);
  });
});

describe("your requests on the home screen", () => {
  function loadHome(cookie?: string) {
    return homeLoader(routeArgs("/", {}, { cookie })) as Promise<HomeData>;
  }

  it("shows a request's proposals and figures beside it, waiting ones first", async () => {
    const { store, group, organizer, cellistCookie } = await band();
    const concert = requestIn(group.id, { name: "Concert" });
    const [proposed] = store.addRehearsals(group.id, concert, [once("2026-10-08")], "Hall");
    const gig = requestIn(group.id, { name: "Gig" });
    const done = store.addRehearsal(group.id, gig, once("2026-10-16"), "Club");
    store.confirmRehearsal(group.id, done.id);
    // Waiting: open, answerable and not yet answered by Cellist.
    const tour = store.createRequest(group.id, {
      name: "Tour",
      startDate: TODAY,
      endDate: "2026-10-20",
      windows: [{ startMinute: 1140, endMinute: 1260 }],
    });
    store.answerRequest(group.id, concert, store.listMembers(group.id)[1].id, null);
    store.answerRequest(group.id, gig, store.listMembers(group.id)[1].id, null);

    const data = await loadHome(cellistCookie);

    expect(data.requests.map((item) => [item.name, item.waitingUntil])).toEqual([
      ["Tour", "2026-10-20"],
      ["Gig", null],
      ["Concert", null],
    ]);
    expect(data.requests[0].requestId).toBe(tour.id);
    const html = renderHome(data);
    expect(html).toContain("Your availability requests");
    expect(html).toContain(`Proposed rehearsal: Thu 8 Oct, 7–9 PM`);
    expect(html).toContain(`href="${groupPath(group)}/schedule#rehearsal-${proposed.id}"`);
    expect(html).toContain("0 of 1 confirmed · 0 of 3 answered all");
    expect(html).toContain("1 of 1 confirmed");
    expect(html).toContain(`href="${groupPath(group)}/requests/${gig}/calendar.ics" download=""`);
    expect(html).not.toContain(`/requests/${concert}/calendar.ics`);
    expect(JSON.stringify(data.requests)).not.toContain(organizer.id);
    expect(JSON.stringify(data.requests)).not.toContain("Viola");
    void proposed;
  });

  it("orders other groups' requests by group name, and lets this device's member decide", async () => {
    const first = await band();
    const second = await band();
    const zeta = first.store.createGroup("Zeta", "Viola", "Europe/London");
    const zetaRequest = requestIn(zeta.group.id, { name: "Zeta request" });
    first.store.addRehearsal(zeta.group.id, zetaRequest, once("2026-10-08"), "");
    const alpha = first.store.createGroup("Alpha", "Viola", "Europe/London");
    const alphaRequest = requestIn(alpha.group.id, { name: "Alpha request" });
    first.store.addRehearsal(alpha.group.id, alphaRequest, once("2026-10-08"), "");
    // Answered, so neither is waiting: only the group name orders them.
    first.store.answerRequest(zeta.group.id, zetaRequest, zeta.organizer.id, null);
    first.store.answerRequest(alpha.group.id, alphaRequest, alpha.organizer.id, null);
    // One membership cookie holding both groups, as a device that joined both has.
    const zetaCookie = await deviceCookie(zeta.group.id, zeta.organizer.deviceToken);
    const cookies = (
      await rememberMembership(
        new Request(ORIGIN, { headers: { Cookie: zetaCookie } }),
        alpha.group.id,
        alpha.organizer.deviceToken,
      )
    ).split(";")[0];

    expect((await loadHome(cookies)).requests.map((item) => item.name)).toEqual([
      "Alpha request",
      "Zeta request",
    ]);

    // A device member removed from a group: that group drops out.
    first.store.removeMember(second.group.id, second.cellist.id);
    expect((await loadHome(second.cellistCookie)).requests).toEqual([]);
  });

  it("offers Google Calendar writing for a complete request in the panel's states, coming back home", async () => {
    vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET", "secret");
    fakeGoogle();
    try {
      const { store, group, cellist, cellistCookie, organizerCookie } = await band();
      const gig = requestIn(group.id, { name: "Gig" });
      const done = store.addRehearsal(group.id, gig, once("2026-10-16"), "Club");
      store.confirmRehearsal(group.id, done.id);
      const { account, cookie } = await signedIn({
        sub: "progress-google",
        email: "progress@example.test",
        name: "C",
      });
      store.linkMember(group.id, cellist.id, account.id);
      const signedInCellist = `${cellistCookie}; ${cookie}`;
      const google = async (cookieHeader: string) =>
        (await loadHome(cookieHeader)).requests[0].google;

      expect(await google(organizerCookie)).toBe("unlinked");
      expect(renderHome(await loadHome(organizerCookie))).toContain(
        "sign in with Google from the group page",
      );
      expect(await google(signedInCellist)).toBe("connect");
      expect(renderHome(await loadHome(signedInCellist))).toContain(
        `/auth/google/calendar?scope=write&amp;returnTo=%2F"`,
      );
      store.saveGrant(account.id, "refresh-1", [CALENDAR_SCOPES.write]);
      expect(await google(signedInCellist)).toBe("off");
      const offHtml = renderHome(await loadHome(signedInCellist));
      expect(offHtml).toContain(`action="${groupPath(group)}/schedule"`);
      expect(offHtml).toContain('name="returnTo" value="/"');

      const turnedOn = await scheduleAction(
        routeArgs(
          `${groupPath(group)}/schedule`,
          { groupAddress: addressOf(group) },
          { cookie: signedInCellist, form: { intent: "set-calendar", value: "on", returnTo: "/" } },
        ),
      );
      expect((turnedOn as Response).headers.get("Location")).toBe("/");
      expect(await google(signedInCellist)).toBe("on");
      expect(renderHome(await loadHome(signedInCellist))).toContain(
        "Already in your Google Calendar",
      );

      // Signed in as Cellist on Viola's device: Viola's state, and the hint to sign in as Viola.
      expect(await google(`${organizerCookie}; ${cookie}`)).toBe("unlinked");
      store.linkMember(
        group.id,
        store.listMembers(group.id)[0].id,
        (
          await signedIn({
            sub: "progress-viola",
            email: "viola@example.test",
            name: "V",
          })
        ).account.id,
      );
      expect(await google(`${organizerCookie}; ${cookie}`)).toBe("other-account");
      expect(renderHome(await loadHome(`${organizerCookie}; ${cookie}`))).toContain(
        "sign in with Google as this member",
      );

      // Coming back from Google Calendar consent started on the home screen.
      for (const [notice, sentence] of [
        ["calendar-connected", "Google Calendar connected."],
        ["calendar-declined", "Google Calendar access wasn&#x27;t granted, so nothing changed."],
      ]) {
        const data = await homeLoader(
          routeArgs(`/?notice=${notice}`, {}, { cookie: signedInCellist }),
        );
        expect(renderHome(data)).toContain(sentence);
      }

      // Any other return address goes back to the schedule.
      const elsewhere = await scheduleAction(
        routeArgs(
          `${groupPath(group)}/schedule`,
          { groupAddress: addressOf(group) },
          {
            cookie: signedInCellist,
            form: { intent: "set-calendar", value: "on", returnTo: "https://example.test/" },
          },
        ),
      );
      expect((elsewhere as Response).headers.get("Location")).toBe(`${groupPath(group)}/schedule`);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});

describe("downloading a complete request", () => {
  it("holds only that request's confirmed dates for the viewer, without their No or cancelled dates", async () => {
    const { store, group, cellist, cellistCookie } = await band();
    const gig = requestIn(group.id, { name: "Autumn gig!" });
    const other = requestIn(group.id, { name: "Other" });
    const weekly = store.addRehearsal(
      group.id,
      gig,
      {
        kind: "weekly",
        startDate: "2026-10-05",
        endDate: "2026-10-26",
        startMinute: 1140,
        endMinute: 1260,
      },
      "Club",
    );
    store.confirmRehearsal(group.id, weekly.id);
    store.setCancelled(group.id, weekly.id, "2026-10-12", true);
    store.setRsvp(group.id, weekly.id, cellist.id, "2026-10-19", "no");
    const elsewhere = store.addRehearsal(group.id, other, once("2026-10-07"), "Hall");
    store.confirmRehearsal(group.id, elsewhere.id);

    const response = (await download(group.id, gig, cellistCookie)) as Response;
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="autumn-gig.ics"',
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(body).toContain(`UID:${weekly.id}-2026-10-05@music-chairs`);
    expect(body).toContain(`UID:${weekly.id}-2026-10-26@music-chairs`);
    expect(body).not.toContain("2026-10-12@");
    expect(body).not.toContain("2026-10-19@");
    expect(body).not.toContain(elsewhere.id);
  });

  it("refuses an incomplete, unknown or other group's request, and sends visitors to the group", async () => {
    const { store, group, cellistCookie } = await band();
    const open = requestIn(group.id, { name: "Open" });
    const done = store.addRehearsal(group.id, open, once("2026-10-08"), "");
    store.confirmRehearsal(group.id, done.id);
    store.addRehearsal(group.id, open, once("2026-10-09"), "");
    const empty = requestIn(group.id, { name: "Empty" });
    const theirs = await band();
    const foreign = requestIn(theirs.group.id, { name: "Theirs" });
    const foreignDate = theirs.store.addRehearsal(theirs.group.id, foreign, once("2026-10-08"), "");
    theirs.store.confirmRehearsal(theirs.group.id, foreignDate.id);

    for (const requestId of [open, empty, foreign, "Q".repeat(22)]) {
      expect(statusOf(await thrownBy(download(group.id, requestId, cellistCookie)))).toBe(404);
    }
    const visitor = await thrownBy(download(theirs.group.id, foreign));
    expect((visitor as Response).headers.get("Location")).toBe(groupPath(theirs.group));
  });
});
