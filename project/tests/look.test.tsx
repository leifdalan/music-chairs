// The shadcn/ui look's checkable parts (plan/phase-19.1.md): the calendar
// options' order and the .ics download, and one primary button per form.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
import {
  addressOf,
  deviceCookie,
  requestHrefOf,
  requestIn,
  routeArgs,
  slugFor,
  tempDatabase,
} from "./routes";

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
      requestHref="/g/g/r"
      requestName="Gig"
      google={google}
      until="2026-11-26"
      returnTo="/"
    />
  ));
}

const DOWNLOAD = 'href="/g/g/r/calendar.ics" download=""';

describe("a complete request's calendar options", () => {
  it.each([
    ["off", "Add to Google Calendar"],
    ["connect", "Connect Google Calendar"],
    ["on", "Being added to your Google Calendar."],
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
    expect(html).not.toMatch(/Add to Google Calendar|Connect Google Calendar|Being added/);
  });

  it("post from the schedule's own address, keeping its view, and to the schedule from home (plan/phase-33.md)", () => {
    const form = (returnTo: string) =>
      /<form[^>]*action="([^"]*)"/.exec(
        renderAt(() => (
          <CalendarActions
            groupHref="/g/g"
            requestHref="/g/g/r"
            requestName="Gig"
            google="off"
            until="2026-11-26"
            returnTo={returnTo}
          />
        )),
      )?.[1];
    expect(form("/g/g/schedule?free=list")).toBe("/g/g/schedule?free=list");
    expect(form("/")).toBe("/g/g/schedule");
  });

  it("offer a way to stop when writing is on, and say what connecting does", () => {
    expect(actions("on")).toContain('href="/g/g/schedule#calendar-heading">Stop adding them</a>');
    expect(actions("off")).not.toContain("Stop adding them");
    expect(actions("connect")).toContain(
      "If you allow Google Calendar access, music-chairs adds confirmed rehearsals from the groups you&#x27;ve joined",
    );
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

  it("make exactly one action primary on the group settings, request cap and schedule confirm forms", async () => {
    const store = getStore();
    const { group, organizer } = store.createGroup("Look Band", "Viola", "Europe/London");
    const cookie = await deviceCookie(group.id, organizer.deviceToken);
    const requestId = requestIn(group.id, { name: "Look request" });
    // Answered, so the cap is its own form, past the first answer's draft (plan/phase-31.md).
    store.touchResponse(group.id, requestId, organizer.id);
    store.addRehearsal(
      group.id,
      requestId,
      { date: "2099-01-08", startMinute: 1140, endMinute: 1260 },
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
      "/g/:groupId/:requestSlug",
      RequestPage,
      await requestLoader(
        routeArgs(
          requestHrefOf(group, requestId),
          { groupAddress: addressOf(group), requestSlug: slugFor(requestId) },
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
    expect(primaries(requestHtml, 'id="cap-heading"')).toBe(1);
    expect(primaries(scheduleHtml, 'name="intent" value="confirm"')).toBe(1);
  });
});

describe("colours (plan/phase-38.md)", () => {
  const css = readFileSync(join(__dirname, "../app/app.css"), "utf8");
  // Colour functions, hex, and named colours as values (not inside utility names).
  const LITERAL =
    /\b(?:oklch|oklab|lab|lch|hwb|rgba?|hsla?|color)\(|#[0-9a-fA-F]{3,8}\b|:\s*(?:white|black|red|yellow|green|blue|gray|grey)\b/;

  it("are written only in the light and dark token blocks", () => {
    // The two token blocks: :root, and :root inside prefers-color-scheme: dark.
    const light = css.indexOf(":root {");
    const lightEnd = css.indexOf("}", light);
    const dark = css.indexOf(":root {", lightEnd);
    const darkEnd = css.indexOf("}", dark);
    expect(css.slice(lightEnd, dark)).toContain("prefers-color-scheme: dark");
    const outside = css.slice(0, light) + css.slice(lightEnd, dark) + css.slice(darkEnd);
    const lines = outside.split("\n").filter((line) => LITERAL.test(line));
    expect(lines).toEqual([]);
  });

  it("are never written by hand in components or routes", () => {
    // Arbitrary colours, Tailwind's palette, and colours written in strings or styles.
    const ARBITRARY = new RegExp(
      [
        String.raw`\[(?:oklch|oklab|lab|lch|hwb|rgba?|hsla?|color)\(`,
        String.raw`\[#[0-9a-fA-F]{3,8}\]`,
        String.raw`["'\x60]#[0-9a-fA-F]{3,8}["'\x60]`,
        String.raw`\b(?:bg|text|border|ring|outline|fill|stroke|decoration|from|to|via|shadow)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b`,
        String.raw`(?:color|background|backgroundColor|borderColor):\s*["'\x60](?!var\()`,
      ].join("|"),
    );
    const found: string[] = [];
    for (const dir of [".", "components", "components/ui", "routes", "lib"]) {
      const root = join(__dirname, "../app", dir);
      for (const name of readdirSync(root)) {
        if (!name.endsWith(".tsx") && !name.endsWith(".ts")) continue;
        const text = readFileSync(join(root, name), "utf8");
        if (ARBITRARY.test(text)) found.push(`${dir}/${name}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("give the filled red surfaces and the dialog backdrop their tokens", () => {
    expect(css).toMatch(
      /\.toast-error \{\s*@apply bg-destructive-surface text-destructive-surface-foreground;/,
    );
    expect(css).toMatch(/\.confirm-dialog::backdrop \{\s*background: var\(--backdrop\);/);
    const destructive = renderToString(<Button variant="destructive">Delete</Button>);
    expect(destructive).toContain("bg-destructive-surface ");
    expect(destructive).toContain("hover:bg-destructive-surface-hover");
    for (const token of [
      "destructive-surface",
      "destructive-surface-foreground",
      "destructive-surface-hover",
      "backdrop",
    ]) {
      expect(css).toContain(`--color-${token}: var(--${token});`);
    }
  });
});
