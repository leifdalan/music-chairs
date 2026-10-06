import { describe, expect, it } from "vitest";

import {
  clipToWindows,
  MAX_WINDOWS,
  mergeWindows,
  nextWeekday,
  parseRequestForm,
  repeatSpan,
  REQUEST_NAME_MAX,
} from "../app/lib/requests";

const TODAY = "2026-10-03";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const valid = {
  name: "November concert",
  startDate: "2026-11-02",
  endDate: "2026-11-29",
  "windowStart-0": "19:00",
  "windowEnd-0": "22:00",
  "windowStart-1": "",
  "windowEnd-1": "",
};

describe("parseRequestForm", () => {
  it("reads a name, a span and the filled window rows", () => {
    const parsed = parseRequestForm(
      form({ ...valid, "windowStart-1": "10am", "windowEnd-1": "1pm" }),
      { today: TODAY },
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        name: "November concert",
        startDate: "2026-11-02",
        endDate: "2026-11-29",
        windows: [
          { startMinute: 600, endMinute: 780 },
          { startMinute: 1140, endMinute: 1320 },
        ],
      },
    });
  });

  it("rounds typed times to the quarter hour and reads midnight as the end of the day", () => {
    const parsed = parseRequestForm(
      form({ ...valid, "windowStart-0": "18:53", "windowEnd-0": "0:00" }),
      { today: TODAY },
    );
    expect(parsed.ok && parsed.value.windows).toEqual([{ startMinute: 1140, endMinute: 1440 }]);
  });

  it("requires a name of at most the limit", () => {
    expect(parseRequestForm(form({ ...valid, name: " " }), { today: TODAY })).toMatchObject({
      ok: false,
      errors: { name: "Give the request a name." },
    });
    const long = "a".repeat(REQUEST_NAME_MAX + 1);
    expect(parseRequestForm(form({ ...valid, name: long }), { today: TODAY })).toMatchObject({
      ok: false,
      errors: { name: `The name must be at most ${REQUEST_NAME_MAX} characters.` },
    });
    expect(
      parseRequestForm(form({ ...valid, name: "a".repeat(REQUEST_NAME_MAX) }), { today: TODAY }).ok,
    ).toBe(true);
  });

  it("refuses an end before the start and a span over 26 weeks", () => {
    expect(
      parseRequestForm(form({ ...valid, endDate: "2026-11-01" }), { today: TODAY }),
    ).toMatchObject({
      ok: false,
      errors: { endDate: "The last date can't be before the first date." },
    });
    expect(
      parseRequestForm(form({ ...valid, startDate: "2026-11-02", endDate: "2027-05-03" }), {
        today: TODAY,
      }),
    ).toMatchObject({ ok: false, errors: { endDate: "A request can cover at most 26 weeks." } });
    expect(
      parseRequestForm(form({ ...valid, startDate: "2026-11-02", endDate: "2027-05-02" }), {
        today: TODAY,
      }).ok,
    ).toBe(true);
    expect(
      parseRequestForm(form({ ...valid, startDate: "2026-11-02", endDate: "2026-11-02" }), {
        today: TODAY,
      }).ok,
    ).toBe(true);
  });

  it("refuses a past start unless it is the start an edit already has", () => {
    const past = form({ ...valid, startDate: "2026-10-02" });
    expect(parseRequestForm(past, { today: TODAY })).toMatchObject({
      ok: false,
      errors: { startDate: "The first date can't be in the past." },
    });
    expect(parseRequestForm(past, { today: TODAY, storedStart: "2026-10-02" }).ok).toBe(true);
    expect(parseRequestForm(past, { today: TODAY, storedStart: "2026-10-01" }).ok).toBe(false);
    expect(parseRequestForm(form({ ...valid, startDate: TODAY }), { today: TODAY }).ok).toBe(true);
  });

  it("names the latest start in 12-hour time when a start is too late", () => {
    expect(
      parseRequestForm(form({ ...valid, "windowStart-0": "23:53", "windowEnd-0": "00:00" }), {
        today: TODAY,
      }),
    ).toMatchObject({
      ok: false,
      errors: { rows: { 0: "The start is too late; the latest start is 11:45 PM." } },
    });
  });

  it("needs at least one window, ignores blank rows and reports each bad row", () => {
    const none = form({ ...valid, "windowStart-0": "", "windowEnd-0": "" });
    expect(parseRequestForm(none, { today: TODAY })).toMatchObject({
      ok: false,
      errors: { windows: "Add at least one time of day." },
    });
    const bad = parseRequestForm(
      form({ ...valid, "windowStart-1": "22:00", "windowEnd-1": "21:00", "windowStart-2": "9" }),
      { today: TODAY },
    );
    expect(bad).toMatchObject({
      ok: false,
      errors: {
        rows: { 1: "The end must be after the start.", 2: "Enter a start and an end time." },
      },
      values: {
        windows: [
          { start: "19:00", end: "22:00" },
          { start: "22:00", end: "21:00" },
          { start: "9", end: "" },
        ],
      },
    });
    expect(bad.ok === false && bad.errors.windows).toBeUndefined();
  });

  it("reads at most MAX_WINDOWS rows", () => {
    const fields: Record<string, string> = { ...valid };
    for (let index = 0; index <= MAX_WINDOWS; index++) {
      fields[`windowStart-${index}`] = `${index}:00`;
      fields[`windowEnd-${index}`] = `${index}:30`;
    }
    const parsed = parseRequestForm(form(fields), { today: TODAY });
    expect(parsed.ok && parsed.value.windows).toHaveLength(MAX_WINDOWS);
  });

  it("merges overlapping, touching and duplicate windows", () => {
    expect(
      mergeWindows([
        { startMinute: 1140, endMinute: 1320 },
        { startMinute: 600, endMinute: 780 },
        { startMinute: 1200, endMinute: 1380 },
        { startMinute: 780, endMinute: 840 },
        { startMinute: 600, endMinute: 780 },
      ]),
    ).toEqual([
      { startMinute: 600, endMinute: 840 },
      { startMinute: 1140, endMinute: 1380 },
    ]);
  });
});

describe("clipToWindows", () => {
  it("keeps only the parts of free stretches inside the windows", () => {
    const stretches = [
      { startMinute: 540, endMinute: 1200, free: ["a"] },
      { startMinute: 1200, endMinute: 1440, free: ["a", "b"] },
    ];
    expect(
      clipToWindows(stretches, [
        { startMinute: 600, endMinute: 780 },
        { startMinute: 1140, endMinute: 1320 },
      ]),
    ).toEqual([
      { startMinute: 600, endMinute: 780, free: ["a"] },
      { startMinute: 1140, endMinute: 1200, free: ["a"] },
      { startMinute: 1200, endMinute: 1320, free: ["a", "b"] },
    ]);
    expect(clipToWindows(stretches, [{ startMinute: 0, endMinute: 540 }])).toEqual([]);
  });
});

describe("repeatSpan", () => {
  it("starts the day after the old end, keeping the length", () => {
    expect(repeatSpan("2026-11-02", "2026-11-29", TODAY)).toEqual({
      startDate: "2026-11-30",
      endDate: "2026-12-27",
    });
  });

  it("starts today when the day after the old end has passed", () => {
    expect(repeatSpan("2026-09-01", "2026-09-07", TODAY)).toEqual({
      startDate: TODAY,
      endDate: "2026-10-09",
    });
    expect(repeatSpan("2026-09-26", "2026-10-02", TODAY).startDate).toBe(TODAY);
  });
});

describe("nextWeekday", () => {
  it("finds the first date from today on the same weekday", () => {
    // 2026-10-03 is a Saturday.
    expect(nextWeekday(TODAY, "2026-09-26")).toBe(TODAY);
    expect(nextWeekday(TODAY, "2026-09-24")).toBe("2026-10-08");
    expect(nextWeekday(TODAY, "2026-09-27")).toBe("2026-10-04");
    expect(nextWeekday(TODAY, "2026-10-14")).toBe("2026-10-07");
  });
});
