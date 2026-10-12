// Proposing simply (plan/phase-29.md): every rehearsal is one date, with no
// rehearsal length and an organizer's notes shown in the app and calendars; a
// heat-map date with one free time is itself its tick box on the request page.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { eventDescription } from "../app/.server/calendar-sync";
import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import { describeRehearsal, isUpcoming, NOTES_MAX, validateNotes } from "../app/lib/rehearsal";
import Home, { loader as homeLoader } from "../app/routes/home";
import RequestPage, { loader as requestLoader } from "../app/routes/request";
import Schedule, {
  action as scheduleAction,
  loader as scheduleLoader,
} from "../app/routes/schedule";
import { addressOf, deviceCookie, requestHrefOf, routeArgs, slugFor, tempDatabase } from "./routes";

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

describe("a rehearsal's words", () => {
  it("is one date and time, still to come from its own date", () => {
    const rehearsal = { date: "2026-10-08", startMinute: 1170, endMinute: 1290 };
    expect(describeRehearsal(rehearsal)).toBe("Thu 8 Oct, 7:30–9:30 PM");
    expect(isUpcoming(rehearsal, "2026-10-08")).toBe(true);
    expect(isUpcoming(rehearsal, "2026-10-09")).toBe(false);
  });

  it("keeps notes as plain text with plain line breaks, up to the limit", () => {
    expect(validateNotes("  Bring parts\r\nTune early\rThanks  ")).toEqual({
      ok: true,
      value: "Bring parts\nTune early\nThanks",
    });
    expect(validateNotes(undefined)).toEqual({ ok: true, value: "" });
    // A browser counts a line break as one character; so does the server.
    const atLimit = `${"x".repeat(NOTES_MAX - 1)}\r\n`;
    expect(validateNotes(`${"x".repeat(NOTES_MAX - 2)}\r\ny`).ok).toBe(true);
    expect(validateNotes(`${atLimit}yy`)).toEqual({
      ok: false,
      error: "Notes can be at most 1,000 characters.",
    });
  });
});

/**
 * Viola (organizer), Cellist and Pianist; a request for 5–12 Oct, 7–10 PM where
 * Mon 5 Oct has two free times and Tue 6 Oct one; a proposed rehearsal with notes.
 */
async function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Notes Band", "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  const once = (date: string, startMinute: number, endMinute: number) => ({
    kind: "once" as const,
    startDate: date,
    endDate: null,
    startMinute,
    endMinute,
  });
  store.addSlot(organizer.id, once("2026-10-05", 1140, 1320));
  store.addSlot(cellist.id, once("2026-10-05", 1140, 1200));
  store.addSlot(organizer.id, once("2026-10-06", 1140, 1320));
  const request = store.createRequest(group.id, {
    name: "Notes concert",
    startDate: "2026-10-05",
    endDate: "2026-10-12",
    windows: [{ startMinute: 1140, endMinute: 1320 }],
  });
  const rehearsal = store.addRehearsal(
    group.id,
    request.id,
    { date: "2026-10-08", startMinute: 1140, endMinute: 1260 },
    "Hall",
    "Bring the Brahms parts\nTune early",
  );
  return {
    store,
    group,
    request,
    rehearsal,
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

async function schedulePage(b: Band, cookie: string) {
  const path = `${groupPath(b.group)}/schedule`;
  const data = await scheduleLoader(
    routeArgs(path, { groupAddress: addressOf(b.group) }, { cookie }),
  );
  return render("schedule", "/g/:groupAddress/schedule", Schedule, data, path);
}

async function requestPage(b: Band, cookie: string) {
  const path = requestHrefOf(b.group, b.request.id);
  const data = await requestLoader(
    routeArgs(
      path,
      { groupAddress: addressOf(b.group), requestSlug: slugFor(b.request.id) },
      { cookie },
    ),
  );
  return render("request", "/g/:groupAddress/:requestSlug", RequestPage, data, path);
}

describe("notes", () => {
  it("show on the schedule, the request page and home, keeping line breaks", async () => {
    const b = await band();
    const schedule = await schedulePage(b, b.cellistCookie);
    const request = await requestPage(b, b.cellistCookie);
    const home = render(
      "home",
      "/",
      Home,
      await homeLoader(routeArgs("/", {}, { cookie: b.cellistCookie })),
      "/",
    );

    const card = schedule.slice(schedule.indexOf(`id="rehearsal-${b.rehearsal.id}"`));
    expect(card).toContain('<p class="notes">Bring the Brahms parts\nTune early</p>');
    expect(request).toContain('<span class="notes">Bring the Brahms parts\nTune early</span>');
    // On home the notes sit beside the link, so they don't become its name.
    expect(home).toMatch(
      /<\/a><span class="notes">Bring the Brahms parts\nTune early<\/span><\/li>/,
    );
  });

  it("are edited by organizers on the schedule, never offered to members", async () => {
    const b = await band();
    const organizer = await schedulePage(b, b.organizerCookie);
    const member = await schedulePage(b, b.cellistCookie);

    expect(organizer).toContain("<summary>Edit notes</summary>");
    expect(organizer).toContain('name="intent" value="notes"');
    expect(member).not.toContain('value="notes"');
    expect(member).not.toContain("Edit notes");

    const post = (notes: string) =>
      scheduleAction(
        routeArgs(
          `${groupPath(b.group)}/schedule`,
          { groupAddress: addressOf(b.group) },
          {
            cookie: b.organizerCookie,
            form: { intent: "notes", rehearsalId: b.rehearsal.id, notes },
          },
        ),
      );
    expect(((await post("x".repeat(NOTES_MAX + 1))) as { data: unknown }).data).toEqual({
      problem: "Notes can be at most 1,000 characters.",
    });
    await post(" Tune early ");
    expect(b.store.findRehearsal(b.group.id, b.rehearsal.id)?.notes).toBe("Tune early");
    await post("");
    expect(b.store.findRehearsal(b.group.id, b.rehearsal.id)?.notes).toBe("");
    expect(await schedulePage(b, b.organizerCookie)).toContain("<summary>Add notes</summary>");
  });

  it("lead a calendar event's description", async () => {
    const b = await band();
    const rehearsal = b.store.findRehearsal(b.group.id, b.rehearsal.id)!;

    expect(eventDescription(b.group, rehearsal, "")).toBe(
      'Bring the Brahms parts\nTune early\n\nRehearsal for Notes Band, from the availability request "Notes concert".',
    );
    expect(eventDescription(b.group, { ...rehearsal, notes: "" }, "")).toBe(
      'Rehearsal for Notes Band, from the availability request "Notes concert".',
    );
  });
});

describe("one date at a time", () => {
  it("ticks a one-time date directly on the request page, but not on the schedule", async () => {
    const b = await band();
    const request = await requestPage(b, b.organizerCookie);
    const schedule = await schedulePage(b, b.organizerCookie);

    // Tue 6 Oct has one free time: a tick box cell. Mon 5 Oct has two: a panel.
    expect(request).toContain('<label class="day free-day one-time heat-');
    expect(request).toMatch(
      /<details class="day free-day heat-\d" name="free-date"><summary aria-label="Mon 5 Oct/,
    );
    expect(request).not.toMatch(/<details[^>]*><summary aria-label="Tue 6 Oct/);
    expect(schedule).not.toContain("one-time");
  });

  it("leaves no weekly, length or cancel-a-date controls on the request or schedule pages", async () => {
    const b = await band();
    const pages = [
      await requestPage(b, b.organizerCookie),
      await schedulePage(b, b.organizerCookie),
      await schedulePage(b, b.cellistCookie),
    ].join("");

    for (const gone of [
      "Rehearsal length",
      "How often",
      "Every week",
      "Cancel a date",
      "Set last date",
      "Answer every date",
      "More dates",
      'name="kind"',
      'name="length"',
    ]) {
      expect(pages).not.toContain(gone);
    }
    // "Propose a different time" asks for one date, with notes.
    const custom = pages.slice(pages.indexOf('class="custom-proposal"'));
    const dateInput = /<input[^>]*name="date"[^>]*>/.exec(custom)?.[0] ?? "";
    expect(dateInput).toContain('type="date"');
    expect(dateInput).toContain('id="date"');
    expect(custom).toContain('name="notes"');
  });

  it("marks a refused note on its field, and shows a ticked one-time date inside the cell", async () => {
    const b = await band();
    const path = requestHrefOf(b.group, b.request.id);
    const data = await requestLoader(
      routeArgs(
        path,
        { groupAddress: addressOf(b.group), requestSlug: slugFor(b.request.id) },
        {
          cookie: b.organizerCookie,
        },
      ),
    );
    const refused = {
      errors: { notes: "Notes can be at most 1,000 characters." },
      values: {
        date: "2026-10-09",
        startTime: "19:00",
        endTime: "21:00",
        location: "",
        notes: "x",
      },
    };
    const Stub = createRoutesStub([
      { id: "request", path: "/g/:groupAddress/:requestSlug", Component: RequestPage },
    ]);
    const html = renderToString(
      <Stub
        initialEntries={[path]}
        hydrationData={{ loaderData: { request: data }, actionData: { request: refused } }}
      />,
    );
    const notes = /<textarea[^>]*id="propose-other-notes"[^>]*>/.exec(html)?.[0] ?? "";
    expect(notes).toContain('aria-invalid="true"');
    expect(notes).toContain(
      'aria-describedby="propose-other-notes-error propose-other-notes-hint"',
    );
    expect(html).toContain(
      '<p class="field-error" id="propose-other-notes-error" role="alert">Notes can be at most 1,000 characters.</p>',
    );
    const css = readFileSync(join(__dirname, "../app/app.css"), "utf8");
    expect(css).toMatch(
      /\.free-day\.one-time:has\(input:checked\) \{\s*box-shadow: inset 0 0 0 2px var\(--foreground\);/,
    );
  });
});
