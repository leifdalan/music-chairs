// Availability requests and their proposed rehearsals (plan/phase-24.md): the
// names, the nesting, the group page's upcoming list and the reshaped schedule.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import { loader as feedLoader } from "../app/routes/calendar-feed";
import GroupPage, { loader as groupLoader } from "../app/routes/group";
import Home, { loader as homeLoader } from "../app/routes/home";
import RequestPage, { loader as requestLoader } from "../app/routes/request";
import RequestForm, { loader as formLoader } from "../app/routes/requests.new";
import Schedule, { loader as scheduleLoader } from "../app/routes/schedule";
import { addressOf, deviceCookie, routeArgs, tempDatabase } from "./routes";

tempDatabase();

// 2026-10-02 (a Friday) in Europe/London; the answer window runs to Thu 26 Nov.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  getStore();
});
afterAll(() => {
  vi.useRealTimers();
});

const EVENING = { startMinute: 1140, endMinute: 1320 };
const once = (date: string, location = "Hall") => ({
  kind: "once" as const,
  startDate: date,
  endDate: null,
  startMinute: 1140,
  endMinute: 1260,
  location,
});

/**
 * Viola (organizer), Cellist and Pianist. "Autumn concert" (open) has a
 * proposed rehearsal Cellist answered, a weekly confirmed one with a cancelled
 * date, and a past confirmed one; "Summer tour" is closed with a proposed one;
 * "Spring" ended with nothing.
 */
async function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Phase Band", "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  const pianist = store.addMember(group.id, "Pianist", "member");
  for (const member of [organizer, cellist]) {
    store.addSlot(member.id, { ...once("2026-10-06"), endMinute: 1320 });
  }
  const autumn = store.createRequest(group.id, {
    name: "Autumn concert",
    startDate: "2026-10-05",
    endDate: "2026-10-31",
    windows: [EVENING],
  });
  const add = (requestId: string, slot: ReturnType<typeof once>) => {
    const { location, ...input } = slot;
    return store.addRehearsal(group.id, requestId, input, location);
  };
  const proposed = add(autumn.id, once("2026-10-08"));
  store.setRsvp(group.id, proposed.id, cellist.id, "2026-10-08", "yes");
  const weekly = store.addRehearsal(
    group.id,
    autumn.id,
    { kind: "weekly", startDate: "2026-10-06", endDate: null, startMinute: 1140, endMinute: 1260 },
    "Studio",
  );
  store.confirmRehearsal(group.id, weekly.id);
  store.setCancelled(group.id, weekly.id, "2026-10-13", true);
  // An answer on another rehearsal, which the proposed one's count must not include.
  store.setRsvp(group.id, weekly.id, pianist.id, "2026-10-06", "no");
  const past = add(autumn.id, once("2026-09-29", "Old hall"));
  store.confirmRehearsal(group.id, past.id);
  const summer = store.createRequest(group.id, {
    name: "Summer tour",
    startDate: "2026-10-05",
    endDate: "2026-10-31",
    windows: [EVENING],
  });
  const touring = add(summer.id, once("2026-10-15", "Bus"));
  store.setRequestOpen(group.id, summer.id, false);
  const spring = store.createRequest(group.id, {
    name: "Spring",
    startDate: "2026-09-01",
    endDate: "2026-09-20",
    windows: [EVENING],
  });
  return {
    group,
    cellist,
    autumn,
    summer,
    spring,
    proposed,
    weekly,
    touring,
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: await deviceCookie(group.id, cellist.deviceToken),
  };
}
type Band = Awaited<ReturnType<typeof band>>;

function render(id: string, pattern: string, Component: unknown, data: unknown, at: string) {
  const Stub = createRoutesStub([{ id, path: pattern, Component: Component as never }]);
  return renderToString(
    <Stub initialEntries={[at]} hydrationData={{ loaderData: { [id]: data } }} />,
  ).replaceAll("<!-- -->", "");
}

async function groupPage(b: Band, cookie?: string) {
  const path = groupPath(b.group);
  const data = await groupLoader(routeArgs(path, { groupAddress: addressOf(b.group) }, { cookie }));
  return { data, html: render("group", "/g/:groupAddress", GroupPage, data, path) };
}

async function requestPage(b: Band, requestId: string, cookie: string) {
  const path = `${groupPath(b.group)}/requests/${requestId}`;
  const data = await requestLoader(
    routeArgs(path, { groupAddress: addressOf(b.group), requestId }, { cookie }),
  );
  return render("request", "/g/:groupAddress/requests/:requestId", RequestPage, data, path);
}

async function schedulePage(b: Band, cookie: string, search = "") {
  const path = `${groupPath(b.group)}/schedule${search}`;
  const data = await scheduleLoader(
    routeArgs(path, { groupAddress: addressOf(b.group) }, { cookie }),
  );
  return render("schedule", "/g/:groupAddress/schedule", Schedule, data, path);
}

/** What a person reads or hears: text and aria-labels, without markup. */
function readable(html: string): string {
  const labels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1]);
  return `${html.replace(/<[^>]*>/g, " ")} ${labels.join(" ")}`.replace(/&#x27;/g, "'");
}

/** The markup from one heading's section to the next `</section>`. */
function section(html: string, headingId: string): string {
  const start = html.indexOf(`id="${headingId}"`);
  expect(start, headingId).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", start));
}

describe("the names (plan/phase-24.md)", () => {
  it("says availability request and proposed rehearsal on every page", async () => {
    const b = await band();
    const pages = [
      (await groupPage(b, b.organizerCookie)).html,
      (await groupPage(b, b.cellistCookie)).html,
      await requestPage(b, b.autumn.id, b.organizerCookie),
      await requestPage(b, b.autumn.id, b.cellistCookie),
      await requestPage(b, b.summer.id, b.organizerCookie),
      await schedulePage(b, b.organizerCookie),
      await schedulePage(b, b.cellistCookie),
      render(
        "home",
        "/",
        Home,
        await homeLoader(routeArgs("/", {}, { cookie: b.cellistCookie })),
        "/",
      ),
      render(
        "form",
        "/g/:groupAddress/requests/new",
        RequestForm,
        await formLoader(
          routeArgs(
            `${groupPath(b.group)}/requests/new`,
            { groupAddress: addressOf(b.group) },
            { cookie: b.organizerCookie },
          ),
        ),
        `${groupPath(b.group)}/requests/new`,
      ),
    ];

    for (const html of pages) {
      const text = readable(html);
      expect(text).not.toMatch(/proposal/i);
      expect(text).not.toMatch(/proposed times/i);
      for (const match of text.matchAll(/\brequests?\b/gi)) {
        expect(text.slice(Math.max(0, match.index - 13), match.index).toLowerCase()).toBe(
          "availability ",
        );
      }
    }
    const all = pages.join("");
    expect(all).toContain(">Availability requests<");
    expect(all).toContain(">Proposed rehearsals<");
  });
});

describe("the group page", () => {
  it("lists only confirmed dates from today, with each request's proposed rehearsals under it", async () => {
    const b = await band();
    const { html } = await groupPage(b, b.cellistCookie);

    const upcoming = section(html, "upcoming-heading");
    expect(upcoming).toContain("Tue 6 Oct, 7–9 PM");
    expect(upcoming).toContain("Tue 20 Oct, 7–9 PM");
    expect(upcoming).toContain("Studio");
    expect(upcoming).toContain("Autumn concert");
    // Cancelled, past and proposed dates aren't upcoming rehearsals.
    expect(upcoming).not.toContain("Tue 13 Oct");
    expect(upcoming).not.toContain("29 Sep");
    expect(upcoming).not.toContain("Thu 8 Oct");

    const requests = section(html, "requests-heading");
    const autumn = requests.slice(requests.indexOf("Autumn concert"));
    expect(autumn).toContain("Thu 8 Oct, 7–9 PM");
    expect(autumn).toContain("1 of 3 answered");
    expect(autumn).toContain(`href="${groupPath(b.group)}/schedule#rehearsal-${b.proposed.id}"`);
    // The closed request still shows its proposed rehearsal, even to members,
    // marked closed rather than waiting on anyone.
    const summer = requests.slice(requests.indexOf("Summer tour"));
    const summerRow = summer.slice(0, summer.indexOf("proposed-rehearsals"));
    expect(summerRow).toContain('<span class="request-status">Closed</span>');
    expect(summerRow).not.toContain("Not yet");
    expect(summerRow).not.toContain("responded");
    expect(summer).toContain(`#rehearsal-${b.touring.id}`);
    expect(requests).not.toContain("Spring");
    expect(html.indexOf('id="upcoming-heading"')).toBeLessThan(
      html.indexOf('id="requests-heading"'),
    );
    // The outline look, not the primary one (nothing here is "selected").
    const schedule = /<a class="([^"]*)" href="[^"]*\/schedule"[^>]*>Schedule<\/a>/.exec(html);
    expect(schedule?.[1]).toContain("border-input bg-background");
    expect(schedule?.[1]).not.toContain("bg-primary");
  });

  it("keeps ended requests with nothing proposed in the organizers' fold, and shows visitors nothing upcoming", async () => {
    const b = await band();
    const asOrganizer = (await groupPage(b, b.organizerCookie)).html;
    const asVisitor = await groupPage(b);

    const fold = asOrganizer.slice(asOrganizer.indexOf("Past and closed availability requests"));
    expect(fold).toContain("Spring");
    // A closed request kept in view for its proposed rehearsals can still be repeated.
    expect(asOrganizer).toContain('aria-label="Repeat availability request: Summer tour"');
    expect(asVisitor.data.upcoming).toBeNull();
    expect(asVisitor.html).not.toContain('id="upcoming-heading"');
  });

  it("includes a one-off confirmed beyond the answer window", async () => {
    const b = await band();
    const store = getStore();
    const far = store.addRehearsal(
      b.group.id,
      b.autumn.id,
      { kind: "once", startDate: "2026-12-10", endDate: null, startMinute: 1140, endMinute: 1260 },
      "Far hall",
    );
    store.confirmRehearsal(b.group.id, far.id);

    expect(section((await groupPage(b, b.cellistCookie)).html, "upcoming-heading")).toContain(
      "Thu 10 Dec, 7–9 PM",
    );
  });
});

describe("the request page", () => {
  it("lists its proposed and coming confirmed rehearsals, each linking to the schedule", async () => {
    const b = await band();
    const asMember = await requestPage(b, b.autumn.id, b.cellistCookie);
    const asOrganizer = await requestPage(b, b.autumn.id, b.organizerCookie);

    const list = section(asMember, "proposed-heading");
    expect(list).toContain("Thu 8 Oct, 7–9 PM");
    expect(list).toContain("1 of 3 answered");
    expect(list).toContain("Every Tuesday from 6 Oct, 7–9 PM");
    expect(list).toContain("Confirmed");
    expect(list).not.toContain("29 Sep");
    expect(list).toContain(
      `href="${groupPath(b.group)}/schedule#rehearsal-${b.proposed.id}" data-discover="true">Answer on the schedule`,
    );
    const at = (html: string, id: string) => html.indexOf(`id="${id}"`);
    expect(at(asMember, "your-times-heading")).toBeLessThan(at(asMember, "cap-heading"));
    expect(at(asMember, "cap-heading")).toBeLessThan(at(asMember, "proposed-heading"));
    expect(at(asOrganizer, "overlap-heading")).toBeLessThan(at(asOrganizer, "proposed-heading"));
    expect(at(asOrganizer, "proposed-heading")).toBeLessThan(at(asOrganizer, "your-times-heading"));
    // The menu names the request for screen readers.
    for (const action of ["Edit", "Close", "Repeat"]) {
      expect(asOrganizer).toContain(`aria-label="${action} availability request: Autumn concert"`);
    }
    // A closed request's list still shows.
    expect(
      section(await requestPage(b, b.summer.id, b.cellistCookie), "proposed-heading"),
    ).toContain("Thu 15 Oct, 7–9 PM");
  });
});

describe("the schedule", () => {
  it("names each card's request, ends with your calendar and leads the free times with a summary", async () => {
    const b = await band();
    const html = await schedulePage(b, b.organizerCookie);
    const at = (id: string) => html.indexOf(`id="${id}"`);

    for (const [earlier, later] of [
      ["confirmed-heading", "proposed-heading"],
      ["proposed-heading", "progress-heading"],
      ["progress-heading", "worked-heading"],
      ["worked-heading", "overlap-heading"],
      ["overlap-heading", "calendar-heading"],
    ]) {
      expect(at(earlier), `${earlier} before ${later}`).toBeLessThan(at(later));
      expect(at(earlier)).toBeGreaterThan(-1);
    }
    expect(html.slice(at("calendar-heading"))).not.toContain("<section");
    const card = html.slice(html.indexOf(`id="rehearsal-${b.proposed.id}"`));
    expect(card.slice(0, card.indexOf("</li>"))).toContain("From Autumn concert");
    // Its own answers only, not the other rehearsal's.
    expect(card.slice(0, card.indexOf('class="your-answer"'))).toContain("1 of 3 answered");
    const free = section(html, "overlap-heading");
    expect(free).toContain("2 of 3 members have given times between Fri 2 Oct and Thu 26 Nov.");
    expect(free).toContain("Autumn concert</a>: 0 of 3 responded");
    expect(free).not.toContain("Summer tour");
    expect(free).toContain('<div class="free-calendar">');
    expect(free).toMatch(/aria-current="page"[^>]*>Calendar</);
  });

  it("shows the free times as a list on request", async () => {
    const b = await band();
    const free = section(await schedulePage(b, b.cellistCookie, "?free=list"), "overlap-heading");

    expect(free).not.toContain("free-calendar");
    expect(free).toContain("<h3>Tue 6 Oct</h3>");
  });
});

describe("the calendar feed", () => {
  it("says which availability request a rehearsal came from", async () => {
    const b = await band();
    const token = getStore().feedTokenFor(b.cellist.id);

    const feed = await (
      feedLoader(routeArgs(`/calendar/${token}.ics`, { feedFile: `${token}.ics` })) as Response
    ).text();

    expect(feed.replace(/\r\n /g, "")).toContain(
      'DESCRIPTION:Rehearsal for Phase Band\\, from the availability request "Autumn concert". Answer or see the schedule: ',
    );
  });
});
