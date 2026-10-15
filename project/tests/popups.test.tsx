// Popups that get out of the way (plan/phase-41.md): click-away, closing on
// answering, no Done, and a compact date popup that says the date once.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getStore } from "../app/.server/store";
import { closesAfterAnswer } from "../app/components/proposed-calendar";
import { outsidePress, pressIsOutside, type Popup, type Press } from "../app/lib/dismiss";
import { missingSentence } from "../app/lib/warnings";
import Schedule, { loader } from "../app/routes/schedule";
import { addressFor, deviceCookie, requestIn, routeArgs, tempDatabase } from "./routes";

tempDatabase();
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  getStore();
});
afterAll(() => {
  vi.useRealTimers();
});

const box = (...nodes: unknown[]) => ({ contains: (node: unknown) => nodes.includes(node) });

describe("a press outside a popup", () => {
  it("is outside only when no popup or floating card holds it", () => {
    const popup = box("summary", "panel button");
    const stack = box("Retry", "Dismiss");
    expect(pressIsOutside("page", [popup, stack])).toBe(true);
    expect(pressIsOutside("panel button", [popup, stack])).toBe(false);
    // Retry or Dismiss on a floating card never closes a popup.
    expect(pressIsOutside("Retry", [popup, stack])).toBe(false);
    expect(pressIsOutside("page", [null, undefined])).toBe(true);
  });
});

describe("a press on the page while a popup is open", () => {
  /** A popup holding a summary and a button, the page outside it, a floating card. */
  function page(open = true) {
    const focused: unknown[] = [];
    const popup: Popup = {
      open,
      contains: (node) => node === "summary" || node === "button",
      querySelector: () => ({ focus: () => focused.push("summary") }),
    };
    let active: unknown = "button";
    const press = outsidePress({
      popup: () => popup,
      stack: () => box("Retry"),
      active: () => active,
      isControl: (target) => target === "link",
    });
    const tap = (target: unknown, end = target, how: Partial<Press> = {}) => {
      press.down({ target, button: 0, isPrimary: true, ...how });
      // The browser moves focus to what was pressed before the release.
      active = target;
      press.up({ target: end, button: 0, isPrimary: true, ...how });
    };
    return { popup, press, tap, focused, focus: (to: unknown) => (active = to) };
  }

  it("closes on a press that starts and ends outside, and focus goes back to the date", () => {
    const p = page();
    p.tap("page");
    expect(p.popup.open).toBe(false);
    expect(p.focused).toEqual(["summary"]);
  });

  it("stays open for a press inside, a drag out of it, a floating card, or another button", () => {
    for (const [target, end, how] of [
      ["button", "button", {}],
      ["button", "page", {}],
      ["page", "button", {}],
      ["Retry", "Retry", {}],
      ["page", "page", { button: 2 }],
      ["page", "page", { isPrimary: false }],
    ] as const) {
      const p = page();
      p.tap(target, end, how);
      expect(p.popup.open, `${target} → ${end} ${JSON.stringify(how)}`).toBe(true);
    }
  });

  it("stays open when the browser cancels the press, as for a scroll", () => {
    const p = page();
    p.press.down({ target: "page", button: 0, isPrimary: true });
    p.press.cancel();
    p.press.up({ target: "page", button: 0, isPrimary: true });
    expect(p.popup.open).toBe(true);
  });

  it("leaves focus alone when it wasn't inside, or the press lands on another control", () => {
    const away = page();
    away.focus("elsewhere");
    away.tap("page");
    expect(away.popup.open).toBe(false);
    expect(away.focused).toEqual([]);
    const link = page();
    link.tap("link");
    expect(link.popup.open).toBe(false);
    expect(link.focused).toEqual([]);
  });

  it("does nothing while the popup is closed", () => {
    const p = page(false);
    p.tap("page");
    expect(p.focused).toEqual([]);
  });
});

describe("answering in a date's popup", () => {
  const one = (mine: "yes" | "no" | "maybe" | null) => [{ id: "a", mine }];
  it("closes once the date is answered and the save went through", () => {
    expect(
      closesAfterAnswer({
        sent: { rehearsalId: "a", answer: "yes" },
        result: undefined,
        after: one("yes"),
      }),
    ).toBe(true);
    // Two proposals: the first answered keeps it open; both close it.
    const two = (b: "no" | null) => [
      { id: "a", mine: "yes" as const },
      { id: "b", mine: b },
    ];
    expect(
      closesAfterAnswer({
        sent: { rehearsalId: "a", answer: "yes" },
        result: undefined,
        after: two(null),
      }),
    ).toBe(false);
    expect(
      closesAfterAnswer({
        sent: { rehearsalId: "b", answer: "no" },
        result: undefined,
        after: two("no"),
      }),
    ).toBe(true);
  });

  it("stays open for Clear, a refusal, a failed save, or nothing sent", () => {
    expect(
      closesAfterAnswer({
        sent: { rehearsalId: "a", answer: "clear" },
        result: undefined,
        after: one(null),
      }),
    ).toBe(false);
    // Already answered Yes, changing to No refused: Yes still shows, so it stays.
    expect(
      closesAfterAnswer({
        sent: { rehearsalId: "a", answer: "no" },
        result: { problem: "That rehearsal can't be answered any more." },
        after: one("yes"),
      }),
    ).toBe(false);
    expect(
      closesAfterAnswer({
        sent: { rehearsalId: "a", answer: "no" },
        result: undefined,
        after: one("yes"),
      }),
    ).toBe(false);
    // A failed save stays open, even when the screen already shows that answer.
    expect(
      closesAfterAnswer({
        sent: { rehearsalId: "a", answer: "yes" },
        result: { failure: "offline" },
        after: one("yes"),
      }),
    ).toBe(false);
    // A refused save of the answer already shown stays open too.
    expect(
      closesAfterAnswer({
        sent: { rehearsalId: "a", answer: "yes" },
        result: { problem: "That rehearsal can't be answered any more." },
        after: one("yes"),
      }),
    ).toBe(false);
    expect(closesAfterAnswer({ sent: null, result: undefined, after: one("yes") })).toBe(false);
  });
});

describe("the date's popup on the schedule", () => {
  it("says who isn't free without repeating the date its heading says", () => {
    const oboe = { missing: ["Oboe"], dates: ["2026-10-13"] };
    expect(missingSentence(oboe, "2026-10-13")).toBe("Oboe isn't free that day.");
    expect(missingSentence(oboe)).toBe("Oboe isn't free on Tue 13 Oct.");
    // A series' other dates are still said.
    const series = { missing: ["Oboe"], dates: ["2026-10-13", "2026-10-20"] };
    expect(missingSentence(series, "2026-10-13")).toBe(
      "Oboe isn't free on Tue 13 Oct and Tue 20 Oct.",
    );
  });

  it("says the date once, keeps every answer's full name, and has no Done button", async () => {
    const store = getStore();
    const { group, organizer } = store.createGroup("Popup Band", "Viola", "Europe/London");
    store.addMember(group.id, "Cellist", "member");
    const request = requestIn(group.id, { name: "Autumn" });
    const rehearsal = store.addRehearsal(
      group.id,
      request,
      { date: "2026-10-13", startMinute: 1140, endMinute: 1260 },
      "Studio",
    );
    const cookie = await deviceCookie(group.id, organizer.deviceToken);
    const path = `/g/${addressFor(group.id)}/schedule?on=2026-10-13`;
    const data = await loader(routeArgs(path, { groupAddress: addressFor(group.id) }, { cookie }));
    const Stub = createRoutesStub([
      { id: "schedule", path: "/g/:groupId/schedule", Component: Schedule },
    ]);
    const html = renderToString(
      <Stub
        initialEntries={["/g/x/schedule?on=2026-10-13"]}
        hydrationData={{ loaderData: { schedule: data } }}
      />,
    ).replaceAll("<!-- -->", "");
    const panel = html.slice(html.indexOf('<div class="day-panel"'));
    const card = panel.slice(panel.indexOf(`id="rehearsal-${rehearsal.id}"`));

    expect(panel).toMatch(/^<div class="day-panel"><h4 tabindex="-1">Tue 13 Oct<\/h4>/);
    expect(card).toContain('<p class="slot-summary">7–9 PM · Studio</p>');
    expect(card).not.toContain("At Studio");
    // Visible once; every control still names the whole rehearsal.
    expect(card).toContain('aria-label="Yes for Tue 13 Oct, 7–9 PM"');
    expect(card).toContain('aria-label="Clear my answer for Tue 13 Oct, 7–9 PM"');
    expect(card).toContain('aria-label="Confirm for everyone: Tue 13 Oct, 7–9 PM"');
    expect(card).toContain('<p class="area-label visually-hidden"');
    expect(card).toContain(
      '<div class="rsvp-foot"><p class="hint rsvp-names">No answer: Viola, Cellist</p>',
    );
    expect(html).not.toMatch(/>Done</);
  });
});
