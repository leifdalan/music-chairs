// Fit and finish (plan/phase-27.md): 44px calendar dates at every width, two
// months side by side on wide screens, the privacy table on phones, shorter
// time-zone lists, named presets, standalone links and the hints' width.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { timeZoneChoices } from "../app/.server/create-group";
import { getStore } from "../app/.server/store";
import { CreateGroupForm } from "../app/components/create-group-form";
import { FreeCalendar } from "../app/components/free-calendar";
import { chipGroupLabel, presetLabel } from "../app/components/time-range";
import { TimeZoneOptions } from "../app/components/time-zone-options";
import { BAR_END, BAR_START } from "../app/lib/time-bar";
import { COMMON_TIME_ZONES, zoneGroups, zoneLabel } from "../app/lib/time-zones";
import { groupPath } from "../app/lib/group-address";
import Group, { loader as groupLoader } from "../app/routes/group";
import MembersAdd, { loader as membersAddLoader } from "../app/routes/members.add";
import Privacy from "../app/routes/privacy";
import { REQUEST_PRESETS } from "../app/routes/requests.new";
import { addressOf, deviceCookie, routeArgs, tempDatabase } from "./routes";

tempDatabase();

const css = readFileSync(join(__dirname, "../app/app.css"), "utf8");

/** The body of the first `@media <query> { … }` block, nested braces included. */
function mediaBlock(query: string): string {
  const start = css.indexOf(`@media ${query} {`);
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let index = css.indexOf("{", start); index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(start, index + 1);
  }
  throw new Error(`unclosed ${query}`);
}

describe("calendar dates", () => {
  it("are at least 44px square, running into the gutters on the narrowest phones", () => {
    expect(/\n {2}\.month-grid \{([^}]*)\}/.exec(css)?.[1]).toContain(
      "grid-template-columns: repeat(7, minmax(44px, 1fr));",
    );
    expect(css).toMatch(/\.month-grid \.day \{\s*@apply[^;]*min-h-11/);
    // Where the column (the window less its 2rem of gutters) is under 332px.
    const narrow = mediaBlock("(max-width: calc(332px + 2rem))");
    expect(narrow).toMatch(/\.month-grid \{\s*gap: 1px;\s*margin-inline: calc\(2px - 1rem\);/);
    // Outlines drawn inside the cell there, the keyboard ring included.
    // The date's own ring, not the panel's controls, which can't be clipped.
    expect(narrow).toContain(".month-grid > .day > summary:focus-visible,");
    expect(narrow).not.toContain(".month-grid :focus-visible");
    expect(narrow).toMatch(/outline-offset: -2px;/);
  });

  it("keep the hour bar's track one 44px-tall target", () => {
    expect(css).toMatch(/\.time-bar-track \{\s*@apply relative h-11 /);
  });

  it("show two months side by side on wide screens, only when there are two", () => {
    const wide = mediaBlock("(min-width: 64rem)");
    // Only the months break out, so the legend stays in the column.
    expect(wide).toMatch(
      /\.free-calendar:has\(\.month \+ \.month\) \.months \{\s*--calendar-width: min\(60rem, 100vw - 4rem\);\s*@apply grid grid-cols-2 gap-8;\s*width: var\(--calendar-width\);\s*margin-inline: calc\(\(100% - var\(--calendar-width\)\) \/ 2\);/,
    );
    expect(wide).not.toMatch(/\.free-calendar:has\(\.month \+ \.month\) \{/);
    // A transform would pin the fixed date panel to the calendar.
    expect(wide).not.toContain("transform");
    expect(wide).not.toContain("translate");
  });

  it("wraps the heat map's months in one element", () => {
    const render = (to: string) =>
      renderToString(
        <FreeCalendar
          from="2026-10-26"
          to={to}
          days={[]}
          total={3}
          legend="Tap a date."
          renderStretch={() => null}
        />,
      );
    const two = render("2026-11-03");
    expect(two.match(/class="months"/g)).toHaveLength(1);
    expect(two).toMatch(
      /<div class="months"><div class="month"><h3>October 2026<\/h3>.*<div class="month"><h3>November 2026<\/h3>/,
    );
    expect(render("2026-10-30").match(/class="month"/g)).toHaveLength(1);
  });
});

describe("the privacy page", () => {
  it("keeps the permission table a table, with the address on its own line", () => {
    expect(/\.policy-scopes \{([^}]*)\}/.exec(css)?.[1]).toContain("table-fixed");
    expect(css).toMatch(/\.policy-scopes th:first-child \{\s*@apply w-2\/5;/);
    expect(/\.policy-scopes code \{([^}]*)\}/.exec(css)?.[1]).toMatch(
      /@apply block [^;]*;\s*overflow-wrap: anywhere;/,
    );
    const Stub = createRoutesStub([{ path: "/privacy", Component: Privacy }]);
    const html = renderToString(<Stub initialEntries={["/privacy"]} />).replaceAll("<!-- -->", "");
    expect(html).toContain('<table class="policy-scopes">');
    expect(html).not.toMatch(/<br\/><code>/);
    expect(html).toMatch(
      /<a class="back-link" href="\/"[^>]*>Back to <span class="brand">music-chairs<\/span><\/a>/,
    );
  });
});

describe("standalone links and hints", () => {
  it("give standalone links a 44px tap area and stop hints at a reading width", () => {
    expect(css).toMatch(
      /\.eyebrow a,\s*\.error-links a,\s*\.your-groups a,\s*\.request-group h3 a,\s*\.organizer-controls \.hint a,\s*\.group-card h2 a,\s*\.site-header > a,\s*\.site-footer a,\s*a\.request-name,\s*\.payoff-link,\s*\.proposed-link,\s*\.back-link,\s*\.cancel \{\s*@apply inline-flex min-h-11 items-center;/,
    );
    // Placeholders take the hint colour (4.5:1), not the browser's half-strength text.
    expect(css).toMatch(
      // Italic, so a placeholder never reads as a typed value in dark mode (plan/phase-40.md).
      /input::placeholder,\s*textarea::placeholder \{\s*@apply text-muted-foreground italic;/,
    );
    expect(css).toMatch(/\.hint \{\s*@apply text-sm;\s*max-width: 70ch;/);
  });
});

describe("time zones", () => {
  it("labels zones readably", () => {
    expect(zoneLabel("America/Los_Angeles")).toBe("America/Los Angeles");
    expect(zoneLabel("UTC")).toBe("UTC");
    // The runtime's older id reads as the current name; the value stays.
    expect(zoneLabel("Asia/Calcutta")).toBe("Asia/Kolkata");
  });

  it("offers every common zone under this runtime", () => {
    const zones = timeZoneChoices();
    expect(COMMON_TIME_ZONES.filter((zone) => !zones.includes(zone))).toEqual([]);
  });

  it("puts the first zone, then common zones, first, each zone once", () => {
    const zones = ["UTC", "Africa/Abidjan", "America/New_York", "Asia/Tokyo", "Europe/London"];
    expect(zoneGroups(zones, "Africa/Abidjan")).toEqual({
      common: ["Africa/Abidjan", "UTC", "Europe/London", "America/New_York", "Asia/Tokyo"],
      rest: [],
    });
    expect(zoneGroups(zones, "Europe/London").common.slice(0, 2)).toEqual(["Europe/London", "UTC"]);
    expect(zoneGroups(zones, null)).toEqual({
      common: ["UTC", "Europe/London", "America/New_York", "Asia/Tokyo"],
      rest: ["Africa/Abidjan"],
    });
    // A first zone that isn't offered is left out.
    expect(zoneGroups(zones, "Mars/Olympus").common).not.toContain("Mars/Olympus");
    const all = timeZoneChoices();
    const { common, rest } = zoneGroups(all, "Asia/Katmandu");
    expect([...common, ...rest].sort()).toEqual([...all].sort());
    expect(common[0]).toBe("Asia/Katmandu");
  });

  it("offers a zone once when the browser names it differently from the runtime", () => {
    const zones = ["Asia/Kolkata", ...timeZoneChoices()];
    const { common, rest } = zoneGroups(zones, "Asia/Kolkata");
    expect(common[0]).toBe("Asia/Kolkata");
    expect(common).not.toContain("Asia/Calcutta");
    expect(rest).not.toContain("Asia/Calcutta");
    expect(zoneGroups(timeZoneChoices(), null).common).toContain("Asia/Calcutta");
  });

  it("renders common and other zones as two groups, in the create form and the settings", () => {
    const zones = timeZoneChoices();
    const Stub = createRoutesStub([
      { path: "/", Component: () => <CreateGroupForm timeZones={zones} result={undefined} /> },
    ]);
    const form = renderToString(<Stub initialEntries={["/"]} />);
    const common = form.slice(form.indexOf('<optgroup label="Common time zones">'));
    const other = form.slice(form.indexOf('<optgroup label="Other time zones">'));
    expect(common).toMatch(
      /^<optgroup label="Common time zones"><option value="UTC">UTC<\/option>/,
    );
    expect(common.slice(0, common.indexOf("</optgroup>"))).toContain(
      '<option value="America/Los_Angeles">America/Los Angeles</option>',
    );
    expect(other).toContain('<option value="Asia/Katmandu">Asia/Katmandu</option>');
    for (const zone of zones) {
      expect(form.split(`<option value="${zone}"`)).toHaveLength(2);
    }
    // The settings put the group's own zone first.
    const settings = renderToString(
      <select>
        <TimeZoneOptions zones={zones} first="Asia/Katmandu" />
      </select>,
    );
    expect(settings).toMatch(
      /^<select><optgroup label="Common time zones"><option value="Asia\/Katmandu">/,
    );
  });
});

describe("a new request's presets", () => {
  it("are named mornings, afternoons and evenings within the hour bar", () => {
    expect(REQUEST_PRESETS.map(presetLabel)).toEqual([
      "Mornings · 9 AM–12 PM",
      "Afternoons · 12–5 PM",
      "Evenings · 7–10 PM",
    ]);
    for (const preset of REQUEST_PRESETS) {
      expect(preset.startMinute).toBeGreaterThanOrEqual(BAR_START);
      expect(preset.endMinute).toBeLessThanOrEqual(BAR_END);
      expect(preset.endMinute).toBeGreaterThan(preset.startMinute);
    }
    expect(presetLabel({ startMinute: 1140, endMinute: 1260 })).toBe("7–9 PM");
    // Each new-request row's chips are named for the row.
    expect(chipGroupLabel("Time 2: ")).toBe("Time 2: times of day");
    expect(chipGroupLabel("")).toBe("Times of day");
  });
});

describe("the pages", () => {
  it("put the group's own zone first in its settings, and give Add members a 44px back link", async () => {
    const store = getStore();
    const { group, organizer } = store.createGroup("Zoned Band", "Viola", "Asia/Katmandu");
    const cookie = await deviceCookie(group.id, organizer.deviceToken);
    const path = groupPath(group);
    const params = { groupAddress: addressOf(group) };

    const page = await groupLoader(routeArgs(path, params, { cookie }));
    const GroupStub = createRoutesStub([
      { id: "group", path: "/g/:groupAddress", Component: Group },
    ]);
    const html = renderToString(
      <GroupStub initialEntries={[path]} hydrationData={{ loaderData: { group: page } }} />,
    );
    expect(html).toMatch(
      /<select id="timeZone"[^>]*><optgroup label="Common time zones"><option value="Asia\/Katmandu"[^>]*>Asia\/Katmandu<\/option><option value="UTC"/,
    );

    const addPath = `${path}/members/add`;
    const add = await membersAddLoader(routeArgs(addPath, params, { cookie }));
    const AddStub = createRoutesStub([
      { id: "members-add", path: "/g/:groupAddress/members/add", Component: MembersAdd },
    ]);
    const addHtml = renderToString(
      <AddStub initialEntries={[addPath]} hydrationData={{ loaderData: { "members-add": add } }} />,
    );
    expect(addHtml).toMatch(/<a class="back-link" href="[^"]+"[^>]*>Back to the group<\/a>/);
  });
});
