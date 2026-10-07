// Identity, "Rehearsal room" (plan/phase-26.md): the wordmark, the indigo
// accent, the display serif and the confirmed-rehearsal payoff.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getStore } from "../app/.server/store";
import { nextRehearsalFor } from "../app/.server/upcoming";
import { comingLine, payoffHeadline, type PayoffData } from "../app/components/payoff-card";
import { Wordmark } from "../app/components/wordmark";
import { Layout } from "../app/root";
import { groupPath } from "../app/lib/group-address";
import Home, { loader as homeLoader } from "../app/routes/home";
import Schedule, { loader as scheduleLoader } from "../app/routes/schedule";
import { addressOf, deviceCookie, requestIn, routeArgs, tempDatabase } from "./routes";

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

const css = readFileSync(join(__dirname, "../app/app.css"), "utf8");

describe("the look", () => {
  it("links the header wordmark home with the site's name", () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <Layout>
            <main>Home</main>
          </Layout>
        ),
      },
    ]);
    const html = renderToString(<Stub initialEntries={["/"]} />).replaceAll("<!-- -->", "");
    expect(html).toMatch(
      /<a aria-label="music-chairs, home"[^>]*href="\/"[^>]*><span class="wordmark">music<span aria-hidden="true">·<\/span>/,
    );
  });

  it("renders the wordmark with a middle dot that reads as the name", () => {
    expect(renderToString(<Wordmark />)).toBe(
      '<span class="wordmark">music<span aria-hidden="true">·</span><span class="visually-hidden">-</span>chairs</span>',
    );
  });

  it("makes indigo the accent in both themes and the heat map's colour", () => {
    // The light tokens, then the dark ones, each block read on its own.
    const light = /^:root \{([^}]*)\}/m.exec(css)?.[1] ?? "";
    const dark =
      /@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(light).toContain("--primary: oklch(0.5 0.17 275);");
    expect(light).toContain("--primary-foreground: oklch(0.985 0 0);");
    expect(dark).toContain("--primary: oklch(0.72 0.14 275);");
    expect(dark).toContain("--primary-foreground: oklch(0.145 0 0);");
    // Focus rings stay neutral so they show on indigo controls.
    for (const block of [light, dark]) expect(block).toMatch(/--ring: oklch\([\d.]+ 0 0\);/);
    expect(css).toMatch(
      /\.heat-4 \{\s*background: var\(--primary\);\s*color: var\(--primary-foreground\);/,
    );
    // Only a confirmed card with a payoff gets the indigo border.
    expect(css).toContain(".rehearsal.confirmed:has(> .payoff) {");
    for (const level of [1, 2, 3]) {
      expect(css).toMatch(
        new RegExp(`\\.heat-${level} \\{\\s*background: color-mix\\(in oklab, var\\(--primary\\)`),
      );
    }
    expect(css).toMatch(/\.heat-4 \{\s*background: var\(--primary\);/);
    expect(css).not.toMatch(/\.heat-\d \{\s*background:[^}]*--success/);
    // A ticked date's outline shows on the deepest shade.
    expect(css).toMatch(/\.free-day:has\(input:checked\) \{\s*@apply[^;]*outline-foreground/);
  });

  it("sets the wordmark and page titles in the system display serif", () => {
    expect(css).toMatch(/--font-display: ui-serif,[^;]*serif;/);
    expect(/\n {2}h1 \{([^}]*)\}/.exec(css)?.[1]).toContain("font-display");
    expect(/\.wordmark \{([^}]*)\}/.exec(css)?.[1]).toContain("font-display");
    expect(css).not.toMatch(/fonts\.googleapis|@font-face/);
  });
});

describe("the payoff's words", () => {
  const base: PayoffData = {
    date: "2026-10-08",
    startMinute: 1140,
    endMinute: 1260,
    location: "Hall",
    mine: null,
    comingNames: null,
    yes: 0,
    answered: 0,
  };

  it.each([
    ["yes", "You're on"],
    ["maybe", "Confirmed — you said maybe"],
    ["no", "Confirmed — you said you can't make it"],
    [null, "Confirmed — are you coming?"],
  ] as const)("heads an answer of %s with %s", (mine, headline) => {
    expect(payoffHeadline(mine)).toBe(headline);
  });

  it("counts only yes, with names when allowed", () => {
    expect(comingLine(base)).toBe("No one has answered yet");
    expect(comingLine({ ...base, answered: 2 })).toBe("No one has said yes yet");
    expect(comingLine({ ...base, answered: 3, yes: 2 })).toBe("2 coming");
    expect(comingLine({ ...base, answered: 3, yes: 2, comingNames: ["Viola", "Oboe"] })).toBe(
      "Coming: Viola, Oboe",
    );
  });
});

/** Viola (organizer), Cellist and Pianist; a weekly Thursday rehearsal confirmed, 15 Oct cancelled. */
async function band(name = "Payoff Band", zone = "Europe/London") {
  const store = getStore();
  const { group, organizer } = store.createGroup(name, "Viola", zone);
  const cellist = store.addMember(group.id, "Cellist", "member");
  const pianist = store.addMember(group.id, "Pianist", "member");
  const rehearsal = store.addRehearsal(
    group.id,
    requestIn(group.id, { store }),
    { kind: "weekly", startDate: "2026-10-08", endDate: null, startMinute: 1140, endMinute: 1260 },
    "Hall",
  );
  store.confirmRehearsal(group.id, rehearsal.id);
  return {
    store,
    group,
    organizer,
    cellist,
    pianist,
    rehearsal,
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: await deviceCookie(group.id, cellist.deviceToken),
  };
}

async function schedule(b: Awaited<ReturnType<typeof band>>, cookie: string) {
  const path = `${groupPath(b.group)}/schedule`;
  const data = await scheduleLoader(
    routeArgs(path, { groupAddress: addressOf(b.group) }, { cookie }),
  );
  const Stub = createRoutesStub([
    { id: "schedule", path: "/g/:groupAddress/schedule", Component: Schedule },
  ]);
  return renderToString(
    <Stub initialEntries={[path]} hydrationData={{ loaderData: { schedule: data } }} />,
  ).replaceAll("<!-- -->", "");
}

function home(cookie?: string) {
  return homeLoader(routeArgs("/", {}, { cookie })).then((data) => {
    const Stub = createRoutesStub([{ id: "home", path: "/", Component: Home }]);
    return renderToString(
      <Stub initialEntries={["/"]} hydrationData={{ loaderData: { home: data } }} />,
    ).replaceAll("<!-- -->", "");
  });
}

describe("the payoff on the schedule", () => {
  it("leads a confirmed card with the next date and who is coming", async () => {
    const b = await band();
    b.store.setRsvp(b.group.id, b.rehearsal.id, b.cellist.id, "2026-10-08", "yes");
    b.store.setRsvp(b.group.id, b.rehearsal.id, b.pianist.id, "2026-10-08", "no");

    const asOrganizer = await schedule(b, b.organizerCookie);
    const asCellist = await schedule(b, b.cellistCookie);
    const card = (html: string) => html.slice(html.indexOf(`id="rehearsal-${b.rehearsal.id}"`));

    expect(card(asOrganizer)).toMatch(/^id="rehearsal-[^"]+"><div class="payoff">/);
    expect(card(asOrganizer)).toContain("Confirmed — are you coming?");
    expect(card(asOrganizer)).toContain("Thu 8 Oct · 7–9 PM · Hall");
    expect(card(asOrganizer)).toContain("Coming: Cellist");
    expect(card(asCellist)).toContain("You&#x27;re on");
    // Members who see counts only get a count.
    expect(card(asCellist)).toContain("1 coming");
    expect(card(asCellist)).not.toContain("Coming: Cellist");
    // The payoff says where, so the card doesn't say it again.
    expect(card(asOrganizer).slice(0, card(asOrganizer).indexOf("</li>"))).not.toContain("At Hall");
    expect(card(asOrganizer).indexOf('class="payoff"')).toBeLessThan(
      card(asOrganizer).indexOf('class="slot-summary"'),
    );
  });

  it("shows no payoff on a proposed rehearsal", async () => {
    const b = await band("Proposed Band");
    const proposed = b.store.addRehearsal(
      b.group.id,
      requestIn(b.group.id, { store: b.store }),
      { kind: "once", startDate: "2026-10-09", endDate: null, startMinute: 1140, endMinute: 1260 },
      "Hall",
    );
    const html = await schedule(b, b.organizerCookie);
    const card = html.slice(html.indexOf(`id="rehearsal-${proposed.id}"`));

    expect(card.slice(0, card.indexOf("</li>"))).not.toContain('class="payoff"');
  });
});

describe("the payoff on the home page", () => {
  it("shows each group's next confirmed date, skipping cancelled ones, linked to the schedule", async () => {
    const b = await band("Home Band");
    b.store.setCancelled(b.group.id, b.rehearsal.id, "2026-10-08", true);
    b.store.setRsvp(b.group.id, b.rehearsal.id, b.cellist.id, "2026-10-15", "maybe");
    b.store.setRsvp(b.group.id, b.rehearsal.id, b.pianist.id, "2026-10-15", "yes");

    const html = await home(b.cellistCookie);
    const coming = html.slice(html.indexOf('id="coming-heading"'));

    expect(coming).toContain('<ul class="payoff-cards"><li class="payoff-card">');
    expect(coming).toContain("Home Band");
    expect(coming).toContain("Thu 15 Oct · 7–9 PM · Hall");
    expect(coming).toContain("Confirmed — you said maybe");
    // A member who sees counts only gets a count, not the name.
    expect(coming).toContain("1 coming");
    expect(coming).not.toContain("Pianist");
    expect(coming).toContain(`href="${groupPath(b.group)}/schedule#rehearsal-${b.rehearsal.id}"`);
    expect(html).toContain("<h1>Your rehearsals</h1>");
  });

  it("shows nothing to a visitor, and uses each group's own today", async () => {
    expect(await home()).not.toContain('id="coming-heading"');
    // At noon UTC on 8 Oct it is already 9 Oct in Auckland but still 8 Oct in London.
    const auckland = await band("Zone Band", "Pacific/Auckland");
    const london = await band("London Band");
    const noon = new Date("2026-10-08T12:00:00Z");
    expect(nextRehearsalFor(auckland.group, auckland.cellist, noon)?.date).toBe("2026-10-15");
    expect(nextRehearsalFor(london.group, london.cellist, noon)?.date).toBe("2026-10-08");
  });
});
