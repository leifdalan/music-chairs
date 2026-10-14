// The schedule's proposed rehearsals as a calendar or a list, answered from a
// date's popup, and "Yes to all unanswered" (plan/phase-39.md).
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { readToast } from "../app/.server/flash";
import { getStore } from "../app/.server/store";
import { dateMark } from "../app/components/proposed-calendar";
import { rehearsalHref } from "../app/lib/rehearsal-href";
import Schedule, { action, loader, unansweredFor } from "../app/routes/schedule";
import { addressFor, deviceCookie, requestIn, routeArgs, tempDatabase } from "./routes";

tempDatabase();

// 2026-10-02 (a Friday) in Europe/London.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  getStore();
});
afterAll(() => {
  vi.useRealTimers();
});

type Data = Awaited<ReturnType<typeof loader>>;
const at = (date: string, startMinute = 1140) => ({
  date,
  startMinute,
  endMinute: startMinute + 120,
});

/**
 * Viola (organizer) and Cellist; proposed rehearsals on Thu 8 Oct (two) and
 * Tue 13 Oct, one passed on Wed 30 Sep, and a confirmed one on Fri 16 Oct.
 */
async function band(name: string) {
  const store = getStore();
  const { group, organizer } = store.createGroup(name, "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  // Free on Mon 5 Oct, so the free times have a calendar too.
  store.addSlot(cellist.id, {
    kind: "once",
    startDate: "2026-10-05",
    endDate: null,
    startMinute: 1140,
    endMinute: 1260,
  });
  const request = requestIn(group.id, { name: "Autumn" });
  const [early, late] = store.addRehearsals(
    group.id,
    request,
    [at("2026-10-08"), at("2026-10-08", 1260)],
    "Hall",
  );
  const tuesday = store.addRehearsal(group.id, request, at("2026-10-13"), "Studio");
  const passed = store.addRehearsal(group.id, request, at("2026-09-30"), "Old hall");
  const confirmed = store.addRehearsal(group.id, request, at("2026-10-16"), "Club");
  store.confirmRehearsal(group.id, confirmed.id);
  return {
    store,
    group,
    organizer,
    cellist,
    early,
    late,
    tuesday,
    passed,
    confirmed,
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: await deviceCookie(group.id, cellist.deviceToken),
  };
}
type Band = Awaited<ReturnType<typeof band>>;

const path = (b: Band, search = "") => `/g/${addressFor(b.group.id)}/schedule${search}`;
const load = (b: Band, cookie: string, search = "") =>
  loader(
    routeArgs(path(b, search), { groupAddress: addressFor(b.group.id) }, { cookie }),
  ) as Promise<Data>;
const post = (b: Band, cookie: string, form: Record<string, string>, search = "") =>
  action(
    routeArgs(path(b, search), { groupAddress: addressFor(b.group.id) }, { cookie, form }),
  ) as Promise<Response>;
const render = (data: Data, url = "/g/x/schedule") => {
  const Stub = createRoutesStub([
    { id: "schedule", path: "/g/:groupId/schedule", Component: Schedule },
  ]);
  return renderToString(
    <Stub initialEntries={[url]} hydrationData={{ loaderData: { schedule: data } }} />,
  ).replaceAll("<!-- -->", "");
};
const section = (html: string) =>
  html.slice(html.indexOf('id="proposed-heading"'), html.indexOf('id="progress-heading"'));
const location = (response: Response) => response.headers.get("Location");
const toastOf = async (response: Response) => {
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");
  return (await readToast(new Request("https://site.test/", { headers: { Cookie: cookie } }))).toast
    ?.message;
};
/** One card's markup, up to the next card. */
const cardOf = (html: string, id: string) => {
  const start = html.indexOf(`id="rehearsal-${id}"`);
  const next = html.indexOf('id="rehearsal-', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
};

describe("the proposed rehearsals' views", () => {
  it("are a calendar by default, with a List, both as plain links", async () => {
    const b = await band("View Band");
    const calendar = section(render(await load(b, b.cellistCookie)));
    const list = section(
      render(await load(b, b.cellistCookie, "?proposed=list"), "/g/x/schedule?proposed=list"),
    );

    expect(calendar).toContain('aria-label="How to show proposed rehearsals"');
    expect(calendar).toMatch(/aria-current="page"[^>]*>Calendar</);
    expect(calendar).toContain('class="free-calendar proposed-calendar"');
    expect(list).toMatch(/aria-current="page"[^>]*>List</);
    expect(list).not.toContain("proposed-calendar");
    expect(list).toContain(">Autumn</a></h3>");
  });

  it("give each proposed date a popup named for its answers, sharing one name with the free times", async () => {
    const b = await band("Popup Band");
    b.store.setRsvp(b.group.id, b.tuesday.id, b.cellist.id, "no");
    const html = render(await load(b, b.cellistCookie));
    const proposed = section(html);

    expect(proposed).toContain(
      '<summary aria-label="Thu 8 Oct: 2 proposed rehearsals, 2 not answered">',
    );
    expect(proposed).toContain(
      '<summary aria-label="Tue 13 Oct: 1 proposed rehearsal, you said No">',
    );
    // A passed or confirmed date has no popup.
    expect(proposed).not.toContain("Wed 30 Sep:");
    expect(proposed).not.toContain("Fri 16 Oct:");
    // Every date disclosure on the page shares one name: one popup open at a time.
    const names = [...html.matchAll(/<details class="day free-day[^"]*" name="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(new Set(names)).toEqual(new Set(["date-popup"]));
    expect(html).toContain("free-day heat-");
  });

  it("open the date a link names, and only on that date", async () => {
    const b = await band("Link Band");
    expect(rehearsalHref("/g/x/schedule", b.tuesday)).toBe(
      `/g/x/schedule?on=2026-10-13#rehearsal-${b.tuesday.id}`,
    );
    const html = section(render(await load(b, b.cellistCookie, "?on=2026-10-13")));

    expect(html).toMatch(
      /<details class="day free-day proposed-day needs-answer" name="date-popup" open=""><summary aria-label="Tue 13 Oct/,
    );
    expect(html.match(/ open=""/g)).toHaveLength(1);
    // Nonsense or a date without a popup opens nothing.
    expect(section(render(await load(b, b.cellistCookie, "?on=2026-09-30")))).not.toContain(
      ' open=""',
    );
    expect((await load(b, b.cellistCookie, "?on=soon")).openOn).toBeNull();
  });

  it("send a popup's forms back to that popup, and other forms without it", async () => {
    const b = await band("Return Band");
    const html = section(render(await load(b, b.organizerCookie)));
    const popup = html.slice(html.indexOf('aria-label="Tue 13 Oct'));
    expect(popup.slice(0, popup.indexOf("</details>"))).toContain(
      '<input type="hidden" name="on" value="2026-10-13"/>',
    );

    const inPopup = await post(
      b,
      b.cellistCookie,
      { intent: "rsvp", rehearsalId: b.tuesday.id, answer: "yes", on: "2026-10-13" },
      "?proposed=list&on=2026-10-08",
    );
    expect(location(inPopup)).toBe(`${path(b)}?proposed=list&on=2026-10-13`);
    // From an address that still names a date, a form outside a popup comes back without it.
    const outside = await post(
      b,
      b.cellistCookie,
      { intent: "rsvp", rehearsalId: b.confirmed.id, answer: "yes" },
      "?on=2026-10-13",
    );
    expect(location(outside)).toBe(path(b));
  });
});

describe("a popup's date (R4, plan/phase-39.md)", () => {
  it("never rides on a view switch, rides on every form in a popup, and waits out a confirm step", async () => {
    const b = await band("On Band");
    const data = await load(b, b.organizerCookie, "?on=2026-10-13");
    const html = render(data, "/g/x/schedule?on=2026-10-13");
    const switches = [...html.matchAll(/<nav class="view-switch"[\s\S]*?<\/nav>/g)].map(
      (m) => m[0],
    );

    expect(switches).toHaveLength(2);
    for (const nav of switches) expect(nav).not.toContain("on=");
    // The Tue 13 Oct popup: the answer, Confirm, notes and Delete forms each carry the date.
    const popup = section(html).slice(section(html).indexOf('aria-label="Tue 13 Oct'));
    const forms =
      popup.slice(0, popup.indexOf("Passed, not confirmed")).match(/<form[\s\S]*?<\/form>/g) ?? [];
    const intents = forms.map((form) => /name="intent" value="([a-z-]+)"/.exec(form)?.[1]);
    expect(intents).toEqual(expect.arrayContaining(["rsvp", "confirm", "notes", "delete"]));
    for (const form of forms)
      expect(form, form.slice(0, 300)).toContain('name="on" value="2026-10-13"');

    // Without JavaScript, a Delete's confirm step shows at the top: no popup covers it.
    const Stub = createRoutesStub([
      { id: "schedule", path: "/g/:groupId/schedule", Component: Schedule },
    ]);
    const confirming = renderToString(
      <Stub
        initialEntries={["/g/x/schedule?on=2026-10-13"]}
        hydrationData={{
          loaderData: { schedule: data },
          actionData: {
            schedule: {
              confirm: {
                title: "Delete Tue 13 Oct?",
                body: "Nobody can answer it any more.",
                label: "Delete",
                fields: [
                  ["intent", "delete"],
                  ["rehearsalId", b.tuesday.id],
                  ["on", "2026-10-13"],
                ],
              },
            },
          },
        }}
      />,
    );
    expect(confirming).toContain("Delete Tue 13 Oct?");
    expect(section(confirming)).not.toContain(' open=""');
  });

  it("is left off a confirmed rehearsal's link, whose date may hold another's popup", () => {
    expect(
      rehearsalHref("/g/x/schedule", { id: "r1", date: "2026-10-16", status: "confirmed" }),
    ).toBe("/g/x/schedule#rehearsal-r1");
  });
});

describe("Yes to all unanswered", () => {
  it("counts only the proposed rehearsals still to come that the viewer hasn't answered", async () => {
    const b = await band("Count Band");
    // Someone else's answer doesn't count as the viewer's.
    b.store.setRsvp(b.group.id, b.tuesday.id, b.organizer.id, "maybe");
    b.store.setRsvp(b.group.id, b.early.id, b.cellist.id, "no");
    const open = unansweredFor(
      b.store.listRehearsals(b.group.id),
      b.store.listRsvps(b.group.id),
      b.cellist.id,
      "2026-10-02",
    );

    expect(open.map((r) => r.id).sort()).toEqual([b.late.id, b.tuesday.id].sort());
    expect((await load(b, b.cellistCookie)).unanswered).toBe(2);
    expect(section(render(await load(b, b.cellistCookie)))).toContain("Yes to all unanswered (2)");
  });

  it("answers Yes to those only, keeping a given No, and says how many", async () => {
    const b = await band("Yes Band");
    b.store.setRsvp(b.group.id, b.early.id, b.cellist.id, "no");
    const response = await post(b, b.cellistCookie, { intent: "yes-to-all" });
    const mine = (id: string) =>
      b.store
        .listRsvps(b.group.id)
        .find((rsvp) => rsvp.rehearsalId === id && rsvp.memberId === b.cellist.id)?.answer ?? null;

    expect(response.status).toBe(302);
    expect(mine(b.early.id)).toBe("no");
    expect(mine(b.late.id)).toBe("yes");
    expect(mine(b.tuesday.id)).toBe("yes");
    expect(mine(b.passed.id)).toBeNull();
    expect(mine(b.confirmed.id)).toBeNull();
    // Nobody else's answers.
    expect(
      b.store.listRsvps(b.group.id).filter((rsvp) => rsvp.memberId === b.organizer.id),
    ).toEqual([]);
    expect(await toastOf(response)).toBe("Answered Yes to 2 rehearsals");

    // Nothing left: the line keeps its place, and a stale post changes nothing.
    expect(section(render(await load(b, b.cellistCookie)))).toContain(
      '<div class="yes-to-all"><p class="hint">All answered.</p></div>',
    );
    const again = await post(b, b.cellistCookie, { intent: "yes-to-all" });
    expect(await toastOf(again)).toBe("Nothing left to answer");
  });
});

describe("the cards", () => {
  it("ask a member only what to answer on a proposed rehearsal", async () => {
    const b = await band("Calm Band");
    b.store.setRsvp(b.group.id, b.tuesday.id, b.organizer.id, "yes");
    const html = section(
      render(await load(b, b.cellistCookie, "?proposed=list"), "/g/x/schedule?proposed=list"),
    );
    const one = cardOf(html, b.tuesday.id);

    expect(one).toContain("Tue 13 Oct, 7–9 PM");
    expect(one).toContain("At Studio");
    expect(one).toContain('aria-label="Yes for Tue 13 Oct, 7–9 PM"');
    expect(one).not.toContain("From Autumn");
    expect(one).not.toContain("answered");
    expect(one).not.toMatch(/\d yes · \d no/);
    expect(one).not.toContain("For organizers");
  });

  it("give an organizer the facts and one row: Confirm, and the rest under More", async () => {
    const b = await band("Row Band");
    const html = section(
      render(await load(b, b.organizerCookie, "?proposed=list"), "/g/x/schedule?proposed=list"),
    );
    const one = cardOf(html, b.tuesday.id);
    const more = one.slice(one.indexOf('class="more-menu"'));

    // The request is a link for the organizer (no list heading in a popup).
    expect(one).toMatch(/From <a href="[^"]+"[^>]*>Autumn<\/a> · 0 of 2 answered/);
    expect(one.indexOf(">Confirm for everyone<")).toBeLessThan(one.indexOf('class="more-menu"'));
    expect(more).toContain('<summary aria-label="More for Tue 13 Oct, 7–9 PM">More</summary>');
    expect(more).toContain("Add notes");
    expect(more).toContain("Share a link to this rehearsal");
    expect(more).toContain('data-variant="outline-destructive"');
  });

  it("keep a passed proposal for an organizer to delete", async () => {
    const b = await band("Passed Band");
    const html = section(render(await load(b, b.organizerCookie)));
    const passed = html.slice(html.indexOf("Passed, not confirmed"));

    expect(passed).toContain(`id="rehearsal-${b.passed.id}"`);
    expect(passed).toContain("This date has passed.");
    expect(passed).not.toContain(">Confirm for everyone<");
    const deleted = await post(b, b.organizerCookie, {
      intent: "delete",
      rehearsalId: b.passed.id,
      confirmed: "1",
    });
    expect(deleted.status).toBe(302);
    expect(b.store.findRehearsal(b.group.id, b.passed.id)).toBeNull();
  });

  it("state a confirmed rehearsal's date once, with no zero counts beside 'No one has answered yet'", async () => {
    const b = await band("Once Band");
    const html = render(await load(b, b.organizerCookie));
    const one = cardOf(html, b.confirmed.id);

    // The payoff says the date; no slot summary repeats it.
    expect(one).toContain("Fri 16 Oct · 7–9 PM");
    expect(one).not.toContain('class="slot-summary"');
    expect(one).toContain("No one has answered yet");
    expect(one).not.toContain("0 yes · 0 no · 0 maybe");
  });
});

describe("a date's mark", () => {
  it("says what the viewer has answered there", () => {
    expect(dateMark([{ mine: null }])).toEqual({
      shown: "•",
      spoken: "1 proposed rehearsal, not answered",
    });
    expect(dateMark([{ mine: "maybe" }])).toEqual({
      shown: "Maybe",
      spoken: "1 proposed rehearsal, you said Maybe",
    });
    expect(dateMark([{ mine: "yes" }, { mine: null }])).toEqual({
      shown: "•",
      spoken: "2 proposed rehearsals, 1 not answered",
    });
    expect(dateMark([{ mine: "yes" }, { mine: "no" }])).toEqual({
      shown: "✓",
      spoken: "2 proposed rehearsals, all answered",
    });
  });
});
