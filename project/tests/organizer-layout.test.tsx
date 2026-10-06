// Organizer layout (plan/phase-21.md): each page puts the organizer's main job
// first, members' pages keep their order, and controls fold away until needed.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getStore } from "../app/.server/store";
import { tickedLabel } from "../app/components/propose-times";
import { groupPath } from "../app/lib/group-address";
import GroupPage, { loader as groupLoader } from "../app/routes/group";
import Groups, { loader as groupsLoader } from "../app/routes/groups";
import RequestPage, { loader as requestLoader } from "../app/routes/request";
import Schedule, { loader as scheduleLoader } from "../app/routes/schedule";
import { addressOf, deviceCookie, routeArgs, tempDatabase } from "./routes";

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

const once = (date: string, startMinute: number, endMinute: number) => ({
  kind: "once" as const,
  startDate: date,
  endDate: null,
  startMinute,
  endMinute,
});

/** Viola (organizer) and, unless `alone`, Cellist; both free on Mon 5 Oct evening; one request. */
async function band(name: string, alone = false) {
  const store = getStore();
  const { group, organizer } = store.createGroup(name, "Viola", "Europe/London");
  store.addSlots(organizer.id, [once("2026-10-05", 1140, 1320), once("2026-10-06", 1140, 1260)]);
  const cellist = alone ? null : store.addMember(group.id, "Cellist", "member");
  if (cellist) store.addSlots(cellist.id, [once("2026-10-05", 1140, 1320)]);
  const request = store.createRequest(group.id, {
    name: `${name} concert`,
    startDate: "2026-10-05",
    endDate: "2026-10-12",
    windows: [{ startMinute: 1140, endMinute: 1320 }],
  });
  return {
    group,
    requestId: request.id,
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: cellist ? await deviceCookie(group.id, cellist.deviceToken) : "",
  };
}

function render(
  id: string,
  pattern: string,
  Component: unknown,
  data: unknown,
  at: string,
  actionData?: unknown,
) {
  const Stub = createRoutesStub([{ id, path: pattern, Component: Component as never }]);
  return renderToString(
    <Stub
      initialEntries={[at]}
      hydrationData={{
        loaderData: { [id]: data },
        actionData: actionData ? { [id]: actionData } : undefined,
      }}
    />,
  ).replaceAll("<!-- -->", "");
}

async function requestPage(b: Awaited<ReturnType<typeof band>>, cookie: string) {
  const path = `${groupPath(b.group)}/requests/${b.requestId}`;
  const data = await requestLoader(
    routeArgs(path, { groupAddress: addressOf(b.group), requestId: b.requestId }, { cookie }),
  );
  return render("request", "/g/:groupAddress/requests/:requestId", RequestPage, data, path);
}

async function groupPage(
  b: Awaited<ReturnType<typeof band>>,
  cookie: string,
  actionData?: unknown,
) {
  const path = groupPath(b.group);
  const data = await groupLoader(routeArgs(path, { groupAddress: addressOf(b.group) }, { cookie }));
  return render("group", "/g/:groupAddress", GroupPage, data, path, actionData);
}

/** The markup of the first `<details>` after `marker`, up to its closing tag. */
function detailsAfter(html: string, marker: string): string {
  const start = html.indexOf("<details", html.indexOf(marker));
  return html.slice(start, html.indexOf("</details>", start) + "</details>".length);
}

describe("the request page", () => {
  it("leads with when people are free for organizers, then their folded times and cap, then responses", async () => {
    const b = await band("Order Quartet");
    const html = await requestPage(b, b.organizerCookie);
    const at = (id: string) => html.indexOf(`id="${id}"`);

    expect(at("overlap-heading")).toBeGreaterThan(-1);
    expect(at("overlap-heading")).toBeLessThan(at("your-times-heading"));
    expect(at("your-times-heading")).toBeLessThan(at("cap-heading"));
    expect(at("cap-heading")).toBeLessThan(at("answers-heading"));
    // Nothing but the header comes before the calendar: the menu sits on the dates line.
    expect(html.indexOf('class="request-menu"')).toBeLessThan(at("overlap-heading"));
    expect(html.indexOf('class="request-span"')).toBeLessThan(html.indexOf('class="request-menu"'));

    // Their own times and cap fold below the calendar (plan/phase-23.md).
    const ownStart = html.indexOf('<details class="your-times"');
    expect(ownStart).toBeGreaterThan(at("your-times-heading"));
    expect(ownStart).toBeLessThan(at("cap-heading"));
    expect(html.slice(ownStart, at("cap-heading"))).toContain(
      "<summary>2 dates in this span</summary>",
    );
    expect(html.slice(ownStart, at("cap-heading"))).toContain("7–10 PM");
    expect(html).not.toContain("Check availability for");
    const answers = detailsAfter(html, 'id="answers-heading"');
    expect(answers).toContain("<summary>Show who has responded</summary>");
    expect(answers).toContain("Cellist");
    expect(html).toContain("Responses (0 of 2)");
  });

  it("keeps Edit, Close and Repeat in the request menu", async () => {
    const b = await band("Menu Quartet");
    const html = await requestPage(b, b.organizerCookie);
    const menu = html.slice(
      html.indexOf('class="request-menu"'),
      html.indexOf("</details>", html.indexOf('class="request-menu"')),
    );

    expect(menu).toContain("<summary>Request options</summary>");
    expect(menu).toContain(">Edit<");
    expect(menu).toContain(">Close request<");
    expect(menu).toContain(">Repeat request<");
    expect(html).not.toContain('class="request-actions"');
  });

  it("keeps a member's own times and cap first, with no menu, heat map or responses list", async () => {
    const b = await band("Member Quartet");
    const html = await requestPage(b, b.cellistCookie);

    expect(html.indexOf('id="your-times-heading"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="your-times-heading"')).toBeLessThan(html.indexOf('id="cap-heading"'));
    expect(html).not.toContain("request-menu");
    expect(html).not.toContain('id="overlap-heading"');
    expect(html).not.toContain('id="answers-heading"');
    // A member's own times are not folded away.
    expect(
      html.slice(html.indexOf('id="your-times-heading"'), html.indexOf('id="cap-heading"')),
    ).not.toContain("<details");
  });

  it("counts ticked times only once the page is interactive", async () => {
    const b = await band("Tick Quartet");
    const html = await requestPage(b, b.organizerCookie);

    expect(html).not.toContain("ticked-count");
    expect([0, 1, 3].map(tickedLabel)).toEqual([
      "No times ticked",
      "1 time ticked",
      "3 times ticked",
    ]);
  });
});

describe("the group page", () => {
  it("shows calm member rows with each member's actions folded, the organizer's own row included", async () => {
    const b = await band("Rows Quartet");
    const html = await groupPage(b, b.organizerCookie);
    const disclosures = html.match(/<details class="member-actions" name="member-actions">/g) ?? [];

    expect(disclosures).toHaveLength(2);
    expect(html).toContain("<summary>Manage Viola (you)</summary>");
    expect(html).toContain("<summary>Manage Cellist</summary>");
    const summary = html.indexOf("<summary>Manage Cellist</summary>");
    const cellist = html.slice(
      html.lastIndexOf("<details", summary),
      html.indexOf("</details>", summary),
    );
    expect(cellist).toContain('data-variant="outline-destructive"');
    expect(cellist).toContain("Make optional");
    expect(cellist).toContain("Make organizer");
    expect(cellist).toContain('name="intent" value="rename-member"');
    expect(html).toMatch(/Viola[^<]*<\/span>[^]*?<span class="member-badges">[^]*?>organizer</);
    expect(html).not.toContain('data-variant="destructive"');
  });

  it("shows instrument and badges in the row, and keeps emails inside the member's actions", async () => {
    const b = await band("Badge Quartet");
    const store = getStore();
    const cello = store.listMembers(b.group.id).find((member) => member.displayName === "Cellist")!;
    store.setProfile(b.group.id, cello.id, { displayName: "Cellist", instrument: "cello" });
    store.setOptional(b.group.id, cello.id, true);
    store.addInvitedMember(b.group.id, "Oboe", "oboe@example.test");
    const html = await groupPage(b, b.organizerCookie);
    const row = (name: string) => {
      const at = html.indexOf(`<summary>Manage ${name}</summary>`);
      return html.slice(html.lastIndexOf("<li", at), html.indexOf("</li>", at));
    };

    const cellist = row("Cellist");
    const cellistRow = cellist.slice(0, cellist.indexOf("<details"));
    expect(cellistRow).toContain(" · cello");
    expect(cellistRow).toMatch(/<span class="member-badges">[^]*>optional</);
    const oboe = row("Oboe");
    expect(oboe.slice(0, oboe.indexOf("<details"))).not.toContain("oboe@example.test");
    expect(oboe.slice(oboe.indexOf("<details"))).toContain("Invited as oboe@example.test");
  });

  it("folds the group's settings, what members see and Delete group into Group settings, last", async () => {
    const b = await band("Settings Quartet");
    const html = await groupPage(b, b.organizerCookie);
    const settings = detailsAfter(html, 'id="settings-heading"');

    expect(html.indexOf('id="settings-heading"')).toBeGreaterThan(
      html.indexOf('id="members-heading"'),
    );
    expect(html.indexOf('id="settings-heading"')).toBeGreaterThan(
      html.indexOf('id="invite-heading"'),
    );
    expect(settings).toMatch(/^<details>/);
    expect(settings).toContain("<summary>Show group settings</summary>");
    expect(settings).toContain('id="privacy-heading"');
    expect(settings).toContain('name="intent" value="update-group"');
    expect(settings).toMatch(/data-variant="outline-destructive"[^>]*>Delete group</);
  });

  it("opens Group settings after a rejected change, so its error shows", async () => {
    const b = await band("Error Quartet");
    const html = await groupPage(b, b.organizerCookie, {
      settingsErrors: { name: "Group name is required." },
      settingsValues: { name: "", timeZone: "Europe/London" },
    });

    expect(detailsAfter(html, 'id="settings-heading"')).toMatch(/^<details open="">/);
    expect(html).toContain("Group name is required.");
  });

  it("leads with the invite while the organizer is alone, and puts it after the members otherwise", async () => {
    const alone = await band("Solo Quartet", true);
    const two = await band("Duo Quartet");
    const soloHtml = await groupPage(alone, alone.organizerCookie);
    const duoHtml = await groupPage(two, two.organizerCookie);
    const at = (html: string, id: string) => html.indexOf(`id="${id}"`);

    expect(at(soloHtml, "invite-heading")).toBeGreaterThan(-1);
    expect(at(soloHtml, "invite-heading")).toBeLessThan(at(soloHtml, "requests-heading"));
    expect(at(duoHtml, "invite-heading")).toBeGreaterThan(at(duoHtml, "members-heading"));
    expect(at(duoHtml, "invite-heading")).toBeLessThan(at(duoHtml, "settings-heading"));
  });

  it("gives a member no actions or settings", async () => {
    const b = await band("Plain Quartet");
    const html = await groupPage(b, b.cellistCookie);

    expect(html).not.toContain("member-actions");
    expect(html).not.toContain('id="settings-heading"');
    expect(html).toContain("member-badges");
  });
});

describe("the schedule and groups pages", () => {
  it("folds the schedule's free list behind a disclosure", async () => {
    const b = await band("Free Quartet");
    const path = `${groupPath(b.group)}/schedule`;
    const data = await scheduleLoader(
      routeArgs(path, { groupAddress: addressOf(b.group) }, { cookie: b.organizerCookie }),
    );
    const html = render("schedule", "/g/:groupAddress/schedule", Schedule, data, path);
    const free = detailsAfter(html, 'id="overlap-heading"');

    expect(free).toMatch(
      /^<details class="free-times"><summary>Show free times until [^<]+<\/summary>/,
    );
    expect(free).toContain("7–10 PM");
  });

  it("offers each group once, with Schedule and no My availability", async () => {
    const b = await band("Cards Quartet");
    const data = await groupsLoader(routeArgs("/groups", {}, { cookie: b.organizerCookie }));
    const html = render("groups", "/groups", Groups, data, "/groups");

    expect(html).not.toContain(">Group page<");
    expect(html).toContain(`href="${groupPath(b.group)}"`);
    expect(html).toContain(">Schedule<");
    expect(html).not.toContain("My availability");
    expect(html).not.toContain("/availability");
  });
});
