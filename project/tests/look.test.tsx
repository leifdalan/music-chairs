// The shadcn/ui look's checkable parts (plan/phase-19.1.md): the calendar
// options' order and the .ics download, and one primary button per form.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { CalendarActions, type GoogleWriteState } from "../app/components/calendar-actions";
import { SubmitButton } from "../app/components/submit-button";
import { Button } from "../app/components/ui/button";
import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import GroupPage, { loader as groupLoader } from "../app/routes/group";
import Home, { loader as homeLoader } from "../app/routes/home";
import RequestPage, { loader as requestLoader } from "../app/routes/request";
import Schedule, { loader as scheduleLoader } from "../app/routes/schedule";
import { deviceCookie, requestIn, routeArgs, tempDatabase, addressOf } from "./routes";

tempDatabase();
beforeAll(() => {
  getStore();
});

function renderAt(Component: () => React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/", Component }]);
  return renderToString(<Stub initialEntries={["/"]} />).replaceAll("<!-- -->", "");
}

function actions(google: GoogleWriteState | null): string {
  return renderAt(() => (
    <CalendarActions
      groupHref="/g/g"
      requestId="r"
      requestName="Gig"
      google={google}
      until="2026-11-26"
      returnTo="/"
    />
  ));
}

const DOWNLOAD = 'href="/g/g/requests/r/calendar.ics" download=""';

describe("a complete request's calendar options", () => {
  it.each([
    ["off", "Add to Google Calendar"],
    ["connect", "Connect Google Calendar"],
    ["on", "Already in your Google Calendar."],
    ["unlinked", "sign in with Google from the group page"],
    ["other-account", "sign in with Google as this member"],
  ] as const)("put Google first when it is %s", (state, google) => {
    const html = actions(state);

    expect(html.indexOf(google)).toBeGreaterThan(-1);
    expect(html.indexOf(google)).toBeLessThan(html.indexOf(DOWNLOAD));
  });

  it("offer only the download when Google isn't configured", () => {
    const html = actions(null);

    expect(html).toContain(DOWNLOAD);
    expect(html).not.toMatch(/Add to Google Calendar|Connect Google Calendar|Already in your/);
  });

  it("show the download as an icon and .ics, named for what it downloads", () => {
    const html = actions("off");
    const link = /<a [^>]*download=""[^>]*>.*?<\/a>/s.exec(html)?.[0] ?? "";

    expect(link).toContain('aria-label="Download Gig for your calendar (.ics)"');
    expect(link).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(link).toMatch(/<\/svg>\.ics<\/a>$/);
    expect(html).not.toContain(">Download for your calendar<");
  });
});

describe("buttons", () => {
  it("say their weight in the page and are at least 44px tall", () => {
    const html = renderAt(() => (
      <>
        <Button>Primary</Button>
        <Button variant="outline" size="sm">
          Secondary
        </Button>
        <SubmitButton feedbackKey="k" variant="destructive">
          Delete
        </SubmitButton>
      </>
    ));

    expect(html.match(/data-variant="(\w+)"/g)).toEqual([
      'data-variant="default"',
      'data-variant="outline"',
      'data-variant="destructive"',
    ]);
    expect(html.match(/min-h-11/g)).toHaveLength(3);
  });

  it("make exactly one action primary on the home page's create form", async () => {
    const data = await homeLoader(routeArgs("/", {}));
    const Stub = createRoutesStub([{ id: "home", path: "/", Component: Home }]);
    const html = renderToString(
      <Stub initialEntries={["/"]} hydrationData={{ loaderData: { home: data } }} />,
    );
    const form = html.slice(html.indexOf('aria-labelledby="create-heading"'));

    expect(form.slice(0, form.indexOf("</form>")).match(/data-variant="default"/g)).toHaveLength(1);
  });

  /** Default-variant submits in the form that follows `marker`, up to its </form>. */
  function primaries(html: string, marker: string): number {
    const from = html.indexOf(marker);
    expect(from).toBeGreaterThan(-1);
    const form = html.slice(from, html.indexOf("</form>", from));
    return (form.match(/data-variant="default"/g) ?? []).length;
  }

  function stub(id: string, path: string, Component: unknown, data: unknown) {
    const Stub = createRoutesStub([{ id, path, Component: Component as never }]);
    return renderToString(
      <Stub
        initialEntries={[path.replace(/:\w+/g, "x")]}
        hydrationData={{ loaderData: { [id]: data } }}
      />,
    ).replaceAll("<!-- -->", "");
  }

  it("make exactly one action primary on the group settings, request answer and schedule confirm forms", async () => {
    const store = getStore();
    const { group, organizer } = store.createGroup("Look Band", "Viola", "Europe/London");
    const cookie = await deviceCookie(group.id, organizer.deviceToken);
    const requestId = requestIn(group.id, { name: "Look request" });
    store.addRehearsal(
      group.id,
      requestId,
      { kind: "once", startDate: "2099-01-08", endDate: null, startMinute: 1140, endMinute: 1260 },
      "Hall",
    );

    const groupHtml = stub(
      "group",
      "/g/:groupId",
      GroupPage,
      await groupLoader(
        routeArgs(groupPath(group), { groupAddress: addressOf(group) }, { cookie }),
      ),
    );
    const requestHtml = stub(
      "request",
      "/g/:groupId/requests/:requestId",
      RequestPage,
      await requestLoader(
        routeArgs(
          `${groupPath(group)}/requests/${requestId}`,
          { groupAddress: addressOf(group), requestId },
          { cookie },
        ),
      ),
    );
    const scheduleHtml = stub(
      "schedule",
      "/g/:groupId/schedule",
      Schedule,
      await scheduleLoader(
        routeArgs(`${groupPath(group)}/schedule`, { groupAddress: addressOf(group) }, { cookie }),
      ),
    );

    expect(primaries(groupHtml, 'id="settings-heading"')).toBe(1);
    expect(primaries(requestHtml, 'id="answer-heading"')).toBe(1);
    expect(primaries(scheduleHtml, 'name="intent" value="confirm"')).toBe(1);
  });
});
