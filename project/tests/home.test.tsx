import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { readToast } from "../app/.server/flash";
import { readMemberships } from "../app/.server/membership";
import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import { GROUP_NAME_MAX } from "../app/lib/names";
import Home, { action, loader } from "../app/routes/home";
import { addDays, todayInZone } from "../app/lib/availability";
import {
  cookieFrom,
  deviceCookie,
  ORIGIN,
  routeArgs,
  setCookies,
  signedIn,
  tempDatabase,
  groupAt,
} from "./routes";

const count = tempDatabase();

beforeAll(() => {
  getStore();
});

function create(form: Record<string, string>) {
  return action(routeArgs("/?index", {}, { form }));
}

function render(hydrationData: object): string {
  const Stub = createRoutesStub([{ id: "home", path: "/", Component: Home }]);
  return renderToString(<Stub initialEntries={["/"]} hydrationData={hydrationData} />);
}

const zones = await loader(routeArgs("/", {}));

describe("home route", () => {
  it("links the organizer of a group created while signed in, so other devices list it", async () => {
    const { account, cookie } = await signedIn({
      sub: "sub-organizer",
      email: "organizer@example.test",
      name: "Olga",
    });

    const response = (await action(
      routeArgs(
        "/?index",
        {},
        {
          cookie,
          form: { groupName: "Wind Trio", displayName: "Oboe", timeZone: "Europe/London" },
        },
      ),
    )) as Response;
    const elsewhere = await signedIn({
      sub: "sub-organizer",
      email: "organizer@example.test",
      name: "Olga",
    });
    const home = await loader(routeArgs("/", {}, { cookie: elsewhere.cookie }));

    const groupId = groupAt(response.headers.get("Location"))!.id;
    expect(getStore().findMemberByAccount(groupId, account.id)?.role).toBe("organizer");
    expect(home.account).toEqual({ name: "Olga", email: "organizer@example.test" });
    expect(home.groups).toEqual([
      { path: response.headers.get("Location"), name: "Wind Trio", displayName: "Oboe" },
    ]);
  });

  it("offers Google sign-in only when it is configured", async () => {
    expect((await loader(routeArgs("/", {}))).signInAvailable).toBe(false);
    expect(render({ loaderData: { home: zones } })).not.toContain("Sign in with Google");
  });

  it("renders the product name, tagline and create-group form without a browser", () => {
    const html = render({ loaderData: { home: zones } });

    expect(html).toContain("<h1>music-chairs</h1>");
    expect(html).toContain("collect availability");
    expect(html).toContain('name="groupName"');
    expect(html).toContain('name="displayName"');
    expect(html).toContain('name="timeZone"');
    expect(html).toContain('<option value="Europe/London">Europe/London</option>');
    // The submit button is disabled only while a submission is in flight.
    // The attribute, not the `disabled:` utility variants in the class.
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/);
  });

  it("offers UTC and every zone the runtime knows, with no zone preselected on the server", () => {
    const html = render({ loaderData: { home: zones } });

    expect(zones.timeZones[0]).toBe("UTC");
    expect(zones.timeZones).toContain("America/Los_Angeles");
    expect(html).toContain('<option value="" selected="">Choose your time zone</option>');
  });

  it("creates the group with its creator as organizer and opens the group page", async () => {
    const response = await create({
      groupName: " Thursday Quartet ",
      displayName: "Viola",
      timeZone: "Europe/London",
    });

    expect(response).toBeInstanceOf(Response);
    const created = response as Response;
    expect(created.status).toBe(302);
    const groupId = groupAt(created.headers.get("Location"))!.id;
    expect(getStore().findGroup(groupId)).toMatchObject({
      name: "Thursday Quartet",
      timeZone: "Europe/London",
    });
    const [organizer] = getStore().listMembers(groupId);
    expect(organizer).toMatchObject({ displayName: "Viola", role: "organizer" });

    const memberships = await readMemberships(
      new Request("http://music-chairs.test/", { headers: { Cookie: cookieFrom(created) } }),
    );
    expect(Object.keys(memberships)).toEqual([groupId]);
    expect(getStore().findMemberByDevice(groupId, memberships[groupId])?.id).toBe(organizer.id);
    expect(memberships[groupId]).not.toBe(organizer.id);
    const toast = await readToast(
      new Request(ORIGIN, { headers: { Cookie: setCookies(created).mc_toast } }),
    );
    expect(toast.toast?.message).toBe("Group created");
  });

  it.each([
    ["US/Eastern", "America/New_York"],
    ["europe/london", "Europe/London"],
  ])("stores the zone alias %s under its canonical name %s", async (alias, canonical) => {
    const response = (await create({
      groupName: "Raga Trio",
      displayName: "Sitar",
      timeZone: alias,
    })) as Response;

    const groupId = groupAt(response.headers.get("Location"))!.id;
    expect(getStore().findGroup(groupId)?.timeZone).toBe(canonical);
  });

  it.each([
    [
      { groupName: "", displayName: "Viola", timeZone: "UTC" },
      { groupName: "Group name is required." },
    ],
    [
      { groupName: "   ", displayName: "Viola", timeZone: "UTC" },
      { groupName: "Group name is required." },
    ],
    [
      { groupName: "Quartet", displayName: " ", timeZone: "UTC" },
      { displayName: "Your name is required." },
    ],
    [
      { groupName: "x".repeat(GROUP_NAME_MAX + 1), displayName: "Viola", timeZone: "UTC" },
      { groupName: `Group name must be at most ${GROUP_NAME_MAX} characters.` },
    ],
    [
      { groupName: "Quartet", displayName: "Viola", timeZone: "" },
      { timeZone: "Choose the group's time zone." },
    ],
    [
      { groupName: "Quartet", displayName: "Viola", timeZone: "Mars/Base" },
      { timeZone: "Choose the group's time zone." },
    ],
  ])("rejects %j with a readable error and stores nothing", async (form, errors) => {
    const groups = count("groups");
    const members = count("members");

    const result = await create(form);

    expect(result).not.toBeInstanceOf(Response);
    const rejected = result as Exclude<typeof result, Response>;
    expect(rejected.init?.status).toBe(400);
    expect(rejected.data.errors).toMatchObject(errors);
    expect(rejected.data.values).toEqual(form);
    expect(count("groups")).toBe(groups);
    expect(count("members")).toBe(members);
  });

  it("renders the rejected values and errors back into the form", () => {
    const html = render({
      loaderData: { home: zones },
      actionData: {
        home: {
          errors: { groupName: "Group name is required." },
          values: { groupName: "", displayName: "Viola", timeZone: "Europe/Paris" },
        },
      },
    });

    expect(html).toContain("Group name is required.");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('value="Viola"');
    expect(html).toContain('<option value="Europe/Paris" selected="">');
  });
});

describe("requests waiting for your answer", () => {
  let people = 0;

  /** A group with an open request ending in a week, a closed one, an ended one and an answered one. */
  function group(name: string) {
    const store = getStore();
    const { group, organizer } = store.createGroup(name, "Viola", "Europe/London");
    const member = store.addMember(group.id, `Member ${++people}`, "member");
    const today = todayInZone("Europe/London", new Date());
    const windows = [{ startMinute: 1140, endMinute: 1260 }];
    const open = store.createRequest(group.id, {
      name: `${name} gig`,
      startDate: today,
      endDate: addDays(today, 7),
      windows,
    });
    const closed = store.createRequest(group.id, {
      name: `${name} closed`,
      startDate: today,
      endDate: addDays(today, 7),
      windows,
    });
    store.setRequestOpen(group.id, closed.id, false);
    store.createRequest(group.id, {
      name: `${name} ended`,
      startDate: addDays(today, -10),
      endDate: addDays(today, -1),
      windows,
    });
    const answered = store.createRequest(group.id, {
      name: `${name} answered`,
      startDate: today,
      endDate: addDays(today, 3),
      windows,
    });
    store.answerRequest(group.id, answered.id, member.id, null);
    return { store, group, organizer, member, open };
  }

  const pendingFor = async (cookie?: string) =>
    (await loader(routeArgs("/", {}, { cookie }))).requests;

  it("lists only the open, unanswered requests of the groups joined on this device", async () => {
    const mine = group("Quartet");
    const theirs = group("Trio");

    const pending = await pendingFor(await deviceCookie(mine.group.id, mine.member.deviceToken));

    expect(pending).toEqual([
      {
        groupHref: groupPath(mine.group),
        groupName: "Quartet",
        requestId: mine.open.id,
        name: "Quartet gig",
        waitingUntil: mine.open.endDate,
        progress: null,
        google: null,
        until: expect.any(String),
      },
    ]);
    expect(JSON.stringify(pending)).not.toContain(theirs.group.id);
  });

  it("covers the signed-in account's groups, with this device's member deciding per group", async () => {
    const linked = group("Linked");
    const both = group("Both");
    const { store } = linked;
    people += 1;
    const { account, cookie: session } = await signedIn({
      sub: `pending-sub-${people}`,
      email: `pending${people}@example.test`,
      name: "P",
    });
    const viaAccount = store.addMember(linked.group.id, "Signed in", "member", account.id);
    store.addMember(both.group.id, "Signed in", "member", account.id);
    // This device is the organizer in "Both", who has answered its open request.
    store.answerRequest(both.group.id, both.open.id, both.organizer.id, 2);
    const device = await deviceCookie(both.group.id, both.organizer.deviceToken);

    const names = async (cookie: string) =>
      (await pendingFor(cookie)).map((item) => item.name).sort();

    // "Both" is decided by this device's organizer, who answered its gig; the
    // account's member there, who answered nothing, does not count.
    expect(await names(`${session}; ${device}`)).toEqual([
      "Both answered",
      "Linked answered",
      "Linked gig",
    ]);
    store.answerRequest(linked.group.id, linked.open.id, viaAccount.id, null);
    expect(await names(`${session}; ${device}`)).toEqual(["Both answered", "Linked answered"]);

    // With the device's member removed, the account's member decides again.
    const fresh = group("Fresh");
    const freshDevice = await deviceCookie(fresh.group.id, fresh.member.deviceToken);
    store.removeMember(fresh.group.id, fresh.member.id);
    store.addMember(fresh.group.id, "Signed in", "member", account.id);
    expect(await names(`${session}; ${freshDevice}`)).toEqual([
      "Both answered",
      "Both gig",
      "Fresh answered",
      "Fresh gig",
      "Linked answered",
    ]);
  });

  it("skips a cookie naming a deleted group or a removed member, without failing", async () => {
    const gone = group("Gone");
    const removed = group("Removed");
    const goneCookie = await deviceCookie(gone.group.id, gone.member.deviceToken);
    gone.store.deleteGroup(gone.group.id);
    const removedCookie = await deviceCookie(removed.group.id, removed.member.deviceToken);
    removed.store.removeMember(removed.group.id, removed.member.id);

    expect(await pendingFor(goneCookie)).toEqual([]);
    expect(await pendingFor(removedCookie)).toEqual([]);
  });

  it("shows the list first, each one tap away, and nothing when none are waiting", async () => {
    const mine = group("Shown");
    const data = await loader(
      routeArgs("/", {}, { cookie: await deviceCookie(mine.group.id, mine.member.deviceToken) }),
    );

    const html = render({ loaderData: { home: data } });
    expect(html).toContain("Waiting on you");
    expect(html).toContain("Waiting for your answer");
    expect(html).toContain(`href="${groupPath(mine.group)}/requests/${mine.open.id}"`);
    expect(html.indexOf("Waiting on you")).toBeLessThan(html.indexOf("Your groups"));
    expect(render({ loaderData: { home: await loader(routeArgs("/", {})) } })).not.toContain(
      "Waiting on you",
    );
  });
});

describe("everything waiting on you, first", () => {
  /** A group with a request the member answered and a rehearsal proposed from it. */
  function proposal(name: string) {
    const store = getStore();
    const { group } = store.createGroup(name, "Viola", "Europe/London");
    const member = store.addMember(group.id, "Pianist", "member");
    const today = todayInZone("Europe/London", new Date());
    const request = store.createRequest(group.id, {
      name: `${name} gig`,
      startDate: today,
      endDate: addDays(today, 14),
      windows: [{ startMinute: 1140, endMinute: 1260 }],
    });
    const date = addDays(today, 3);
    const rehearsal = store.addRehearsal(
      group.id,
      request.id,
      { kind: "once", startDate: date, endDate: null, startMinute: 1140, endMinute: 1260 },
      "Hall",
    );
    return { store, group, member, request, rehearsal, date };
  }

  const home = async (cookie: string) => loader(routeArgs("/", {}, { cookie }));

  it("puts an unanswered proposal and a waiting request at the top, each linking to where you answer", async () => {
    const { group, member, request, rehearsal } = proposal("Waiting Band");
    const data = await home(await deviceCookie(group.id, member.deviceToken));
    const html = render({ loaderData: { home: data } }).replaceAll("<!-- -->", "");

    expect(data.proposals).toEqual([
      {
        groupHref: groupPath(group),
        groupName: "Waiting Band",
        rehearsalId: rehearsal.id,
        summary: expect.any(String),
        requestName: "Waiting Band gig",
      },
    ]);
    const waiting = html.slice(html.indexOf("Waiting on you"), html.indexOf("</section>"));
    expect(waiting).toContain(`href="${groupPath(group)}/schedule"`);
    expect(waiting).toContain(`href="${groupPath(group)}/requests/${request.id}"`);
    expect(html.indexOf("Waiting on you")).toBeLessThan(html.indexOf("Your requests"));
    // The proposal also stays under its request, with the figures.
    const progress = html.slice(html.indexOf("Your requests"));
    expect(progress).toContain(`Proposed: ${data.proposals[0].summary}`);
    expect(progress).toContain(`href="${groupPath(group)}/requests/${request.id}"`);
  });

  it("drops a proposal the member answered on any date", async () => {
    const { store, group, member, rehearsal, date } = proposal("Answered Band");
    store.setRsvp(group.id, rehearsal.id, member.id, date, "no");

    expect((await home(await deviceCookie(group.id, member.deviceToken))).proposals).toEqual([]);
  });

  it("offers Start a group only to a visitor with no groups", async () => {
    const { group, member } = proposal("Grouped Band");
    const withGroups = render({
      loaderData: { home: await home(await deviceCookie(group.id, member.deviceToken)) },
    });
    const without = render({ loaderData: { home: zones } });

    expect(withGroups).not.toContain('id="create-heading"');
    expect(withGroups).toContain(`href="${groupPath(group)}"`);
    expect(withGroups).toContain('href="/groups"');
    expect(without).toContain('id="create-heading"');
  });
});
