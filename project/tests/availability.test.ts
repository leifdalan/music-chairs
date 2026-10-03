import { describe, expect, it } from "vitest";

import {
  canonicalTimeZone,
  describeSlot,
  expandOccurrences,
  formatDate,
  formatMinutes,
  isOccurrence,
  formatMeridiem,
  parseSlotInput,
  parseTimeText,
  timeInputValue,
  todayInZone,
  type Slot,
} from "../app/lib/availability";

const thursdays: Slot = {
  id: "weekly",
  kind: "weekly",
  startDate: "2026-10-01",
  endDate: null,
  startMinute: 19 * 60,
  endMinute: 22 * 60,
  skips: [],
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const valid = {
  kind: "weekly",
  startDate: "2026-10-01",
  endDate: "",
  startTime: "19:00",
  endTime: "22:00",
};

describe("expandOccurrences", () => {
  it("repeats a weekly slot and leaves out a skipped date", () => {
    const slot = { ...thursdays, skips: ["2026-10-08"] };

    const dates = expandOccurrences([slot], "2026-10-01", "2026-10-29").map((o) => o.date);

    expect(dates).toEqual(["2026-10-01", "2026-10-15", "2026-10-22", "2026-10-29"]);
  });

  it("aligns to the pattern's weekday when the range starts mid-week", () => {
    const dates = expandOccurrences([thursdays], "2026-10-03", "2026-10-20").map((o) => o.date);

    expect(dates).toEqual(["2026-10-08", "2026-10-15"]);
  });

  it("starts no earlier than the first date and stops on an inclusive end date", () => {
    const ended = { ...thursdays, startDate: "2026-10-08", endDate: "2026-10-22" };

    const dates = expandOccurrences([ended], "2026-09-01", "2026-12-31").map((o) => o.date);

    expect(dates).toEqual(["2026-10-08", "2026-10-15", "2026-10-22"]);
  });

  it("runs an open-ended pattern to the end of the range", () => {
    const dates = expandOccurrences([thursdays], "2026-12-20", "2026-12-31").map((o) => o.date);

    expect(dates).toEqual(["2026-12-24", "2026-12-31"]);
  });

  it("includes a one-off slot only inside the range, sorted with weekly ones", () => {
    const once: Slot = {
      ...thursdays,
      id: "once",
      kind: "once",
      startDate: "2026-10-08",
      startMinute: 9 * 60,
      endMinute: 10 * 60,
    };

    const inRange = expandOccurrences([thursdays, once], "2026-10-08", "2026-10-08");
    const outOfRange = expandOccurrences([once], "2026-10-09", "2026-10-31");

    expect(inRange.map((o) => [o.slotId, o.startMinute])).toEqual([
      ["once", 540],
      ["weekly", 1140],
    ]);
    expect(outOfRange).toEqual([]);
  });

  it("keeps the same wall-clock times across daylight-saving changes", () => {
    // Europe's clocks change on 2026-10-25 and the US's on 2026-11-01.
    const minutes = expandOccurrences([thursdays], "2026-10-15", "2026-11-12").map((o) => [
      o.startMinute,
      o.endMinute,
    ]);

    expect(new Set(minutes.map((pair) => pair.join("-")))).toEqual(new Set(["1140-1320"]));
    expect(minutes).toHaveLength(5);
  });
});

describe("isOccurrence", () => {
  it("is true only for the pattern's weekday within its dates", () => {
    const ended = { ...thursdays, endDate: "2026-10-15" };

    expect(isOccurrence(ended, "2026-10-08")).toBe(true);
    expect(isOccurrence(ended, "2026-10-09")).toBe(false);
    expect(isOccurrence(ended, "2026-09-24")).toBe(false);
    expect(isOccurrence(ended, "2026-10-22")).toBe(false);
    expect(isOccurrence({ ...ended, kind: "once" }, "2026-10-01")).toBe(false);
  });
});

describe("parseSlotInput", () => {
  it("accepts a weekly slot and an optional end date", () => {
    expect(parseSlotInput(form({ ...valid, endDate: "2026-12-31" }))).toEqual({
      ok: true,
      value: {
        kind: "weekly",
        startDate: "2026-10-01",
        endDate: "2026-12-31",
        startMinute: 1140,
        endMinute: 1320,
      },
    });
  });

  it("reads 00:00 as an end time as midnight at the end of the day", () => {
    const parsed = parseSlotInput(form({ ...valid, endTime: "00:00" }));

    expect(parsed.ok && parsed.value.endMinute).toBe(1440);
    // Round trip back into the form for editing.
    expect(timeInputValue(1440)).toBe("00:00");
    expect(formatMinutes(1440)).toBe("24:00");
  });

  it("rounds typed times to the nearest quarter hour instead of refusing them", () => {
    const parsed = parseSlotInput(form({ ...valid, startTime: "9:02", endTime: "9:52pm" }));

    expect(parsed.ok && [parsed.value.startMinute, parsed.value.endMinute]).toEqual([540, 1305]);
  });

  it("drops an end date from a one-off slot", () => {
    const parsed = parseSlotInput(form({ ...valid, kind: "once", endDate: "2026-12-31" }));

    expect(parsed.ok && parsed.value.endDate).toBeNull();
  });

  it.each([
    [{ startTime: "23:53" }, "startTime", "Start time is too late; the latest start is 23:45."],
    [{ endTime: "18:30" }, "endTime", "End time must be after the start time."],
    [{ endTime: "19:00" }, "endTime", "End time must be after the start time."],
    [{ startDate: "2026-02-30" }, "startDate", "Enter a valid date."],
    [{ startDate: "" }, "startDate", "Date is required."],
    [{ endDate: "2026-09-30" }, "endDate", "The end date can't be before the first date."],
    [{ kind: "daily" }, "kind", "Choose one-off or every week."],
    [{ startTime: "" }, "startTime", "Start time is required."],
    [{ startTime: "7 o'clock" }, "startTime", "Start time is not a valid time."],
  ])("rejects %j with a readable error", (change, field, message) => {
    const parsed = parseSlotInput(form({ ...valid, ...change }));

    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.errors).toMatchObject({ [field]: message });
    expect(!parsed.ok && parsed.values).toEqual({ ...valid, ...change });
  });
});

describe("group time zone", () => {
  it("decides today in the group's zone, not the server's", () => {
    const instant = new Date("2026-10-03T02:00:00Z");

    expect(todayInZone("America/Los_Angeles", instant)).toBe("2026-10-02");
    expect(todayInZone("Europe/Berlin", instant)).toBe("2026-10-03");
  });

  it("accepts known zones under their canonical name and refuses others", () => {
    expect(canonicalTimeZone("UTC")).toBe("UTC");
    expect(canonicalTimeZone("America/New_York")).toBe("America/New_York");
    expect(canonicalTimeZone("US/Eastern")).toBe("America/New_York");
    expect(canonicalTimeZone("europe/london")).toBe("Europe/London");
    expect(canonicalTimeZone("Mars/Base")).toBeNull();
    expect(canonicalTimeZone("")).toBeNull();
  });

  it("formats dates and expands patterns the same whatever the host zone", () => {
    const original = process.env.TZ;
    // Two hosts whose clocks change inside the range (2026-10-25 and 2026-11-01),
    // and two extremes of the offset range.
    const hosts = [
      "UTC",
      "America/New_York",
      "Europe/London",
      "Pacific/Kiritimati",
      "Pacific/Pago_Pago",
    ];
    const results = hosts.map((zone) => {
      process.env.TZ = zone;
      return [
        expandOccurrences([thursdays], "2026-10-15", "2026-11-12")
          .map((o) => o.date)
          .join(),
        formatDate("2026-10-08"),
        describeSlot({ ...thursdays, endDate: "2026-12-24" }),
      ].join("|");
    });
    process.env.TZ = original;

    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe(
      "2026-10-15,2026-10-22,2026-10-29,2026-11-05,2026-11-12|Thu 8 Oct|Every Thursday from 1 Oct until 24 Dec, 19:00–22:00",
    );
  });
});

describe("typed times", () => {
  const start = (text: string) => parseTimeText(text, { end: false });
  const end = (text: string) => parseTimeText(text, { end: true });
  const minutes = (parsed: ReturnType<typeof parseTimeText>) =>
    parsed.ok ? parsed.minutes : parsed.reason;

  it.each([
    ["9", 540],
    ["9:02", 540],
    ["9:07", 540],
    ["9:08", 555],
    ["09:15", 555],
    ["930", 570],
    ["100", 60],
    ["2115", 1275],
    ["7pm", 1140],
    ["7:52 PM", 1185],
    ["7p", 1140],
    ["7 a.m.", 420],
    ["12am", 0],
    ["12:10am", 15],
    ["12pm", 720],
    ["0:00", 0],
  ])("reads %j as a start at minute %i", (text, expected) => {
    expect(minutes(start(text))).toBe(expected);
  });

  it.each([
    ["00:00", 1440],
    ["00:05", 1440],
    ["24:00", 1440],
    ["11:53pm", 1440],
    ["00:10", 15],
    ["22:00", 1320],
  ])("reads %j as an end at minute %i", (text, expected) => {
    expect(minutes(end(text))).toBe(expected);
  });

  it.each(["", "  "])("calls %j empty", (text) => {
    expect(minutes(start(text))).toBe("empty");
  });

  it.each(["13pm", "0am", "24:30", "25", "9:60", "9:5", "nine", "12345", "7 o'clock"])(
    "cannot read %j",
    (text) => {
      expect(minutes(start(text))).toBe("unreadable");
    },
  );

  it("refuses a start that rounds to the end of the day", () => {
    expect(minutes(start("23:53"))).toBe("too-late");
    expect(minutes(start("24:00"))).toBe("too-late");
  });

  it("says whether am/pm was typed, and formats that style back", () => {
    expect(start("9:52pm")).toEqual({ ok: true, minutes: 1305, meridiem: true });
    expect(start("21:52")).toEqual({ ok: true, minutes: 1305, meridiem: false });
    expect(formatMeridiem(1305)).toBe("9:45pm");
    expect(formatMeridiem(0)).toBe("12:00am");
    expect(formatMeridiem(720)).toBe("12:00pm");
    expect(formatMeridiem(1440)).toBe("12:00am");
  });
});
