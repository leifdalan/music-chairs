// Answering at once (plan/phase-28.md): the request's first time of day is
// chosen on arrival, and members' preferred number of rehearsals reads as a
// preference and is summarized for organizers above the heat map.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getStore } from "../app/.server/store";
import { initialRange } from "../app/components/request-dates";
import { groupPath } from "../app/lib/group-address";
import { preferenceEntry, preferenceText } from "../app/lib/preference";
import RequestPage, { loader } from "../app/routes/request";
import { addressOf, deviceCookie, routeArgs, selectedOption, tempDatabase } from "./routes";

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

const EVENING = { startMinute: 1140, endMinute: 1440 };
const MORNING = { startMinute: 600, endMinute: 780 };

describe("the words", () => {
  it("say a preference, not a limit", () => {
    expect(preferenceText(null)).toBe("as many as possible");
    expect(preferenceText(1)).toBe("1 rehearsal");
    expect(preferenceText(3)).toBe("3 rehearsals");
    expect(preferenceEntry("Cellist", { limit: 2 })).toBe("Cellist: 2");
    expect(preferenceEntry("Pianist", { limit: null })).toBe("Pianist: as many as possible");
    expect(preferenceEntry("Oboe", null)).toBe("Oboe: not answered");
  });
});

describe("the time of day on arrival", () => {
  it("is the request's first, unless a refused Save brings its own back", () => {
    expect(initialRange([EVENING, MORNING], undefined)).toEqual({
      startTime: "19:00",
      endTime: "00:00",
      range: EVENING,
    });
    expect(initialRange([], undefined)).toEqual({ startTime: "", endTime: "", range: null });
    // A refused Save keeps what was sent, even when it isn't a range.
    const refused = { dateValues: { dates: [], startTime: "", endTime: "21:00" } };
    expect(initialRange([EVENING], refused)).toEqual({
      startTime: "",
      endTime: "21:00",
      range: null,
    });
    const valid = { dateValues: { dates: [], startTime: "10:00", endTime: "12:00" } };
    expect(initialRange([EVENING], valid).range).toEqual({ startMinute: 600, endMinute: 720 });
  });
});

/** Viola (organizer), Cellist (prefers 2), Pianist (ticked dates only) and Oboe (no response). */
async function band(windows = [EVENING]) {
  const store = getStore();
  const { group, organizer } = store.createGroup("Answer Band", "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  const pianist = store.addMember(group.id, "Pianist", "member");
  store.addMember(group.id, "Oboe", "member");
  const request = store.createRequest(group.id, {
    name: "Winter concert",
    startDate: "2026-10-06",
    endDate: "2026-11-14",
    windows,
  });
  store.answerRequest(group.id, request.id, cellist.id, 2);
  store.touchResponse(group.id, request.id, pianist.id);
  return {
    group,
    request,
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: await deviceCookie(group.id, cellist.deviceToken),
  };
}

async function page(b: Awaited<ReturnType<typeof band>>, cookie: string) {
  const path = `${groupPath(b.group)}/requests/${b.request.id}`;
  const data = await loader(
    routeArgs(path, { groupAddress: addressOf(b.group), requestId: b.request.id }, { cookie }),
  );
  const Stub = createRoutesStub([
    { id: "request", path: "/g/:groupAddress/requests/:requestId", Component: RequestPage },
  ]);
  return renderToString(
    <Stub initialEntries={[path]} hydrationData={{ loaderData: { request: data } }} />,
  ).replaceAll("<!-- -->", "");
}

describe("a member's request page", () => {
  it("opens with the request's time of day chosen, ending at midnight", async () => {
    const b = await band();
    const html = await page(b, b.cellistCookie);

    expect(selectedOption(html, "startTime")).toBe("19:00");
    expect(selectedOption(html, "endTime")).toBe("00:00");
  });

  it("chooses the first of several times of day", async () => {
    const b = await band([MORNING, EVENING]);
    const html = await page(b, b.cellistCookie);

    expect(selectedOption(html, "startTime")).toBe("10:00");
    expect(selectedOption(html, "endTime")).toBe("13:00");
  });

  it("asks for a preferred number, and shows nobody else's", async () => {
    const b = await band();
    const html = await page(b, b.cellistCookie);

    expect(html).toContain('<h2 id="cap-heading">Preferred number of rehearsals in date span</h2>');
    expect(html).toContain("<legend>How many rehearsals would you like in these dates?</legend>");
    expect(html).toContain("As many as possible");
    expect(html).toMatch(/: 2 rehearsals\.<\/p>/);
    expect(html).toContain(
      "Tick the dates you&#x27;re free; for another time of day, change it below first.",
    );
    expect(html).not.toMatch(/Rehearsals you can make|Any and all|No more than/);
    expect(html).not.toContain("preferred-summary");
    expect(html).not.toContain("Pianist");
  });
});

describe("the organizer's request page", () => {
  it("lists every member's preferred number above the heat map", async () => {
    const b = await band();
    const html = await page(b, b.organizerCookie);
    const section = html.slice(html.indexOf('id="overlap-heading"'));

    expect(section).toContain(
      '<ul class="preferred-summary" role="list" aria-labelledby="preferred-label"><li>Viola: not answered</li><li>Cellist: 2</li><li>Pianist: as many as possible</li><li>Oboe: not answered</li></ul>',
    );
    // Above the Calendar/List switch, so it is there while ticking dates.
    expect(section.indexOf("preferred-summary")).toBeLessThan(
      section.indexOf("How to show when people are free"),
    );
    // The Responses list uses the same words.
    const responses = html.slice(html.indexOf('id="answers-heading"'));
    expect(responses).toContain('<span class="member-name">Cellist</span><span>2 rehearsals');
    expect(responses).toContain(
      '<span class="member-name">Pianist</span><span>As many as possible',
    );
    expect(responses).toContain(
      '<span class="member-name">Oboe</span><span class="hint">Not answered</span>',
    );
  });
});

describe("the styles", () => {
  it("keep the preference choices 44px tall, with the summary's own rules apart", () => {
    const css = readFileSync(join(__dirname, "../app/app.css"), "utf8");
    expect(css).toMatch(/\.limit label \{\s*@apply flex min-h-11 items-center gap-2 font-normal;/);
    expect(css).toMatch(/\n {2}\.preferred \.hint \{/);
  });
});
