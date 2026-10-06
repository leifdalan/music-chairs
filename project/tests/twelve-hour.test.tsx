// 12-hour times everywhere (plan/phase-22.md): the pages people read show
// "7–10 PM", never "19:00"; only form values keep the 24-hour clock.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import Home, { loader as homeLoader } from "../app/routes/home";
import RequestPage, { loader as requestLoader } from "../app/routes/request";
import Schedule, { loader as scheduleLoader } from "../app/routes/schedule";
import { addressOf, deviceCookie, routeArgs, tempDatabase, addSlots } from "./routes";

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

function render(id: string, pattern: string, Component: unknown, data: unknown, at: string) {
  const Stub = createRoutesStub([{ id, path: pattern, Component: Component as never }]);
  return renderToString(
    <Stub initialEntries={[at]} hydrationData={{ loaderData: { [id]: data } }} />,
  ).replaceAll("<!-- -->", "");
}

/** Everything a person can read or hear: the markup without form values. */
function readable(html: string): string {
  return html.replace(/ value="[^"]*"/g, "");
}

const TWENTY_FOUR_HOUR = /\b(0\d|1[3-9]|2[0-3]):[0-5]\d\b|\b(00|24):00\b/;

describe("12-hour times on every page (plan/phase-22.md)", () => {
  it("shows an evening and a half-hour time with AM/PM on the request (calendar and list), schedule and home pages", async () => {
    const store = getStore();
    const { group, organizer } = store.createGroup("Clock Band", "Viola", "Europe/London");
    const cellist = store.addMember(group.id, "Cellist", "member");
    for (const member of [organizer, cellist]) {
      addSlots(store, member.id, [
        {
          kind: "weekly",
          startDate: "2026-10-01",
          endDate: null,
          startMinute: 1140,
          endMinute: 1320,
        },
        {
          kind: "once",
          startDate: "2026-10-06",
          endDate: null,
          startMinute: 1110,
          endMinute: 1260,
        },
      ]);
    }
    const request = store.createRequest(group.id, {
      name: "Clock gig",
      startDate: "2026-10-05",
      endDate: "2026-10-16",
      windows: [
        { startMinute: 1140, endMinute: 1320 },
        { startMinute: 1110, endMinute: 1260 },
      ],
    });
    store.addRehearsal(
      group.id,
      request.id,
      { kind: "once", startDate: "2026-10-06", endDate: null, startMinute: 1110, endMinute: 1260 },
      "Hall",
    );
    const address = addressOf(group);
    const base = groupPath(group);
    const organizerCookie = await deviceCookie(group.id, organizer.deviceToken);
    const cellistCookie = await deviceCookie(group.id, cellist.deviceToken);

    const pages: [string, string][] = [];
    for (const [who, cookie] of [
      ["organizer", organizerCookie],
      ["member", cellistCookie],
    ] as const) {
      const requestPath = `${base}/requests/${request.id}`;
      pages.push([
        `request (${who})`,
        render(
          "request",
          "/g/:groupAddress/requests/:requestId",
          RequestPage,
          await requestLoader(
            routeArgs(requestPath, { groupAddress: address, requestId: request.id }, { cookie }),
          ),
          requestPath,
        ),
      ]);
      pages.push([
        `schedule (${who})`,
        render(
          "schedule",
          "/g/:groupAddress/schedule",
          Schedule,
          await scheduleLoader(
            routeArgs(`${base}/schedule`, { groupAddress: address }, { cookie }),
          ),
          `${base}/schedule`,
        ),
      ]);
      pages.push([
        `request list (${who})`,
        render(
          "request",
          "/g/:groupAddress/requests/:requestId",
          RequestPage,
          await requestLoader(
            routeArgs(
              `${requestPath}?times=list`,
              { groupAddress: address, requestId: request.id },
              { cookie },
            ),
          ),
          `${requestPath}?times=list`,
        ),
      ]);
      pages.push([
        `home (${who})`,
        render("home", "/", Home, await homeLoader(routeArgs("/", {}, { cookie })), "/"),
      ]);
    }

    for (const [name, html] of pages) {
      expect(readable(html).match(TWENTY_FOUR_HOUR)?.[0], name).toBeUndefined();
    }
    const all = pages.map(([, html]) => html).join("");
    expect(all).toContain("7–10 PM");
    expect(all).toContain("6:30–9 PM");
    // The schedule's proposal and the home page's summary read the same way.
    expect(pages.find(([name]) => name === "schedule (member)")?.[1]).toContain("6:30–9 PM");
    expect(pages.find(([name]) => name === "home (member)")?.[1]).toContain("6:30–9 PM");
  });
});
