// The confirm moment (plan/phase-25.md): who isn't free said once per set of
// people in one calm region, a quieter Delete set apart, and the home page's
// pitch for newcomers only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import { missingSentence, missingSummaries } from "../app/lib/warnings";
import Home, { loader as homeLoader } from "../app/routes/home";
import Schedule, { loader as scheduleLoader } from "../app/routes/schedule";
import { addressOf, deviceCookie, requestIn, routeArgs, signedIn, tempDatabase } from "./routes";

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

const evening = (date: string) => ({
  kind: "once" as const,
  startDate: date,
  endDate: null,
  startMinute: 1140,
  endMinute: 1320,
});

describe("who isn't free, once per set of people", () => {
  it("groups dates by the same missing people, in order of their first date", () => {
    const summaries = missingSummaries([
      { date: "2026-10-22", missing: ["Cellist", "Pianist"] },
      { date: "2026-10-15", missing: ["Pianist"] },
      { date: "2026-10-29", missing: ["Cellist", "Pianist"] },
      { date: "2026-10-08", missing: ["Pianist"] },
    ]);

    expect(summaries).toEqual([
      { missing: ["Pianist"], dates: ["2026-10-08", "2026-10-15"] },
      { missing: ["Cellist", "Pianist"], dates: ["2026-10-22", "2026-10-29"] },
    ]);
    // Two members with the same name stay two people.
    expect(missingSummaries([{ date: "2026-10-08", missing: ["Sam", "Sam"] }])).toEqual([
      { missing: ["Sam", "Sam"], dates: ["2026-10-08"] },
    ]);
  });

  it.each([
    [["Oboe"], ["2026-10-08"], "Oboe isn't free on Thu 8 Oct."],
    [
      ["Oboe", "Harpist"],
      ["2026-10-06", "2026-10-13"],
      "Oboe and Harpist aren't free on Tue 6 Oct and Tue 13 Oct.",
    ],
    [
      ["Oboe", "Harpist", "Cellist"],
      ["2026-10-06", "2026-10-13", "2026-10-20"],
      "Oboe, Harpist and Cellist aren't free on Tue 6 Oct, Tue 13 Oct and Tue 20 Oct.",
    ],
    [
      ["Oboe", "Harpist"],
      ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27", "2026-11-24"],
      "Oboe and Harpist aren't free on 5 dates, Tue 6 Oct to Tue 24 Nov.",
    ],
  ])("writes %j on %j as one sentence", (missing, dates, sentence) => {
    expect(missingSentence({ missing, dates })).toBe(sentence);
  });
});

/** Viola free every Thursday evening, Cellist on 8 and 15 Oct, Pianist on 8 Oct; a weekly Thursday rehearsal proposed. */
async function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Calm Band", "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  const pianist = store.addMember(group.id, "Pianist", "member");
  store.addSlot(organizer.id, { ...evening("2026-10-08"), kind: "weekly" });
  for (const date of ["2026-10-08", "2026-10-15"]) store.addSlot(cellist.id, evening(date));
  store.addSlot(pianist.id, evening("2026-10-08"));
  const rehearsal = store.addRehearsal(
    group.id,
    requestIn(group.id, { store }),
    { ...evening("2026-10-08"), kind: "weekly", endMinute: 1260 },
    "Hall",
  );
  return {
    group,
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

describe("the schedule card", () => {
  it("says who isn't free in one calm status region, then the unchecked-dates hint", async () => {
    const b = await band();
    const html = await schedule(b, b.organizerCookie);
    const card = html.slice(html.indexOf(`id="rehearsal-${b.rehearsal.id}"`));
    const from = card.indexOf("For organizers");
    const organizer = card.slice(from, card.indexOf('class="slot-actions"', from));

    expect(organizer.match(/role="status"/g)).toHaveLength(1);
    expect(organizer).toContain(
      '<div class="warnings" role="status" aria-label="Who isn&#x27;t free"><ul><li>Pianist isn&#x27;t free on Thu 15 Oct.</li><li>Cellist and Pianist aren&#x27;t free on 6 dates, Thu 22 Oct to Thu 26 Nov.</li></ul></div>',
    );
    // The weekly rehearsal runs past the window: the hint follows, outside the region.
    expect(organizer.indexOf("</div>")).toBeLessThan(
      organizer.indexOf("Dates after Thu 26 Nov aren&#x27;t checked yet."),
    );
  });

  it("keeps Delete quieter and after Confirm for everyone", async () => {
    const b = await band();
    const html = await schedule(b, b.organizerCookie);
    const actions = html.slice(html.indexOf('class="slot-actions"'));

    expect(actions.indexOf(">Confirm for everyone<")).toBeGreaterThan(-1);
    expect(actions.indexOf(">Confirm for everyone<")).toBeLessThan(actions.indexOf(">Delete<"));
    const del = /<button type="submit" data-variant="([^"]+)" class="([^"]+)"[^>]*>Delete</.exec(
      actions,
    );
    expect(del?.[1]).toBe("outline-destructive");
    expect(del?.[2]).toContain("border-destructive/50 bg-background text-destructive");
  });

  it("leaves Delete alone at the end of a confirmed rehearsal's actions", async () => {
    const b = await band();
    getStore().confirmRehearsal(b.group.id, b.rehearsal.id);
    const html = await schedule(b, b.organizerCookie);
    const actions = html.slice(html.indexOf('class="slot-actions"'));
    // The row ends where the weekly rehearsal's "Cancel a date" disclosure begins.
    const row = actions.slice(0, actions.indexOf("<details"));

    expect(row).not.toContain("Confirm for everyone");
    expect(row.match(/<button/g)).toHaveLength(1);
    expect(row).toContain('data-variant="outline-destructive"');
  });

  it("shows members no warnings", async () => {
    const b = await band();
    const html = await schedule(b, b.cellistCookie);

    expect(html).not.toContain('class="warnings"');
    expect(html).not.toContain("isn&#x27;t free on");
  });

  it("styles warnings amber from their own token, and moves Delete to the end", () => {
    const css = readFileSync(join(__dirname, "../app/app.css"), "utf8");
    const rule = /\.warnings \{([^}]*)\}/.exec(css)?.[1] ?? "";

    expect(rule).toContain("text-warning");
    expect(rule).not.toContain("destructive");
    expect(css.match(/--warning: oklch\(/g)).toHaveLength(2);
    expect(css).toContain("--color-warning: var(--warning);");
    expect(css).toMatch(/\.slot-actions \.confirm-form > button \{\s*margin-left: auto;\s*\}/);
    expect(/\.slot-actions \{([^}]*)\}/.exec(css)?.[1]).toContain("flex-wrap");
  });
});

describe("the home page's pitch", () => {
  function render(data: unknown) {
    const Stub = createRoutesStub([{ id: "home", path: "/", Component: Home }]);
    return renderToString(
      <Stub initialEntries={["/"]} hydrationData={{ loaderData: { home: data } }} />,
    );
  }

  it("is for newcomers only", async () => {
    const b = await band();
    const { cookie: account } = await signedIn({
      sub: "pitch-sub",
      email: "pitch@example.test",
      name: "Pat",
    });

    const newcomer = render(await homeLoader(routeArgs("/", {})));
    const member = render(await homeLoader(routeArgs("/", {}, { cookie: b.cellistCookie })));
    const signedInOnly = render(await homeLoader(routeArgs("/", {}, { cookie: account })));

    expect(newcomer).toContain('id="about-heading"');
    expect(newcomer).toContain(
      "Members give the times they are free for each availability request.",
    );
    expect(newcomer).not.toContain("once or every week");
    expect(member).not.toContain('id="about-heading"');
    expect(signedInOnly).not.toContain('id="about-heading"');
  });
});
