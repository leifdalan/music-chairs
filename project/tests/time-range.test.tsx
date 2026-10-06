import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { barReadback, TimeBar, TimeRange, timeOptions } from "../app/components/time-range";
import { selectedOption } from "./routes";

const noop = () => {};

function optionsOf(html: string, name: string): string[] {
  const select = new RegExp(`<select[^>]*name="${name}"[^>]*>(.*?)</select>`, "s").exec(html);
  return [...(select?.[1] ?? "").matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)].map(
    (match) => `${match[1]}=${match[2]}`,
  );
}

describe("time range", () => {
  it("sends only the two selects from the server, which work without JavaScript", () => {
    const html = renderToString(
      <TimeRange
        startName="startTime"
        endName="endTime"
        startValue="19:00"
        endValue="22:00"
        presets={[{ startMinute: 1140, endMinute: 1320 }]}
        required
      />,
    );

    expect(html).not.toContain("time-bar");
    expect(html).not.toContain("<button");
    expect(selectedOption(html, "startTime")).toBe("19:00");
    expect(selectedOption(html, "endTime")).toBe("22:00");
    expect(html).toMatch(/<select id="startTime" name="startTime" required="">/);
    expect(html).toContain(">From<");
    expect(html).toContain(">Until<");
  });

  it("offers half hours from 9 AM, ending at midnight, with an empty choice first", () => {
    const html = renderToString(
      <TimeRange startName="startTime" endName="endTime" startValue="" endValue="" />,
    );

    const starts = optionsOf(html, "startTime");
    const ends = optionsOf(html, "endTime");
    expect(starts[0]).toBe("=—");
    expect(starts.slice(1, 4)).toEqual(["09:00=9 AM", "09:30=9:30 AM", "10:00=10 AM"]);
    expect(starts.at(-1)).toBe("23:30=11:30 PM");
    expect(starts).toContain("12:00=12 PM");
    expect(starts).toHaveLength(31);
    expect(ends[1]).toBe("09:30=9:30 AM");
    expect(ends.at(-1)).toBe("00:00=12 AM");
    expect(selectedOption(html, "startTime")).toBe("");
    expect(selectedOption(html, "endTime")).toBe("");
  });

  it("keeps a stored time the bar doesn't offer, and a preset's off-grid ends", () => {
    const html = renderToString(
      <TimeRange
        startName="startTime"
        endName="endTime"
        startValue="08:00"
        endValue="10:15"
        presets={[{ startMinute: 495, endMinute: 1335 }]}
      />,
    );

    expect(selectedOption(html, "startTime")).toBe("08:00");
    expect(selectedOption(html, "endTime")).toBe("10:15");
    const starts = optionsOf(html, "startTime");
    expect(starts.slice(1, 4)).toEqual(["08:00=8 AM", "08:15=8:15 AM", "09:00=9 AM"]);
    expect(optionsOf(html, "endTime")).toContain("22:15=10:15 PM");
  });

  it("names several ranges apart and marks a range error on both", () => {
    const html = renderToString(
      <TimeRange
        startName="windowStart-1"
        endName="windowEnd-1"
        startValue="22:00"
        endValue="21:00"
        labelPrefix="Time 2"
        rangeError="The end must be after the start."
      />,
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("Time 2: from");
    expect(html).toContain("Time 2: until");
    expect(html.match(/aria-describedby="windowStart-1-range-error"/g)).toHaveLength(2);
    expect(html).toContain('role="alert">The end must be after the start.');
  });

  it("draws the bar from 9 to 12 with a label each hour, hidden from screen readers", () => {
    const html = renderToString(
      <TimeBar
        shown={{ anchor: null, range: { startMinute: 1140, endMinute: 1320 } }}
        onTap={noop}
        onDrag={noop}
        onDragEnd={noop}
        onCancel={noop}
      />,
    );

    expect(html).toMatch(/^<div class="time-bar" aria-hidden="true">/);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("tabindex");
    const labels = [...html.matchAll(/<span style="left:[^"]*">(\d+)<\/span>/g)].map((m) => m[1]);
    expect(labels).toEqual([
      "9",
      "10",
      "11",
      "12",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
    ]);
    expect(html.match(/class="time-bar-tick hour"/g)).toHaveLength(16);
    // AM sits under 9, PM under noon (3 of the bar's 15 hours along).
    expect(html).toContain(
      '<div class="time-bar-meridiem"><span style="left:0%">AM</span><span style="left:20%">PM</span></div>',
    );
    expect(html.match(/class="time-bar-tick"/g)).toHaveLength(15);
    // 7 PM is 10 of the bar's 15 hours along; 10 PM three more.
    expect(html).toContain('class="time-bar-fill" style="left:66.66666666666666%;width:20%"');
    expect(html).not.toContain("time-bar-anchor");
  });

  it("marks a first tap's anchor without a fill", () => {
    const html = renderToString(
      <TimeBar
        shown={{ anchor: 1140, range: null }}
        onTap={noop}
        onDrag={noop}
        onDragEnd={noop}
        onCancel={noop}
      />,
    );

    expect(html).toContain('class="time-bar-anchor" style="left:66.66666666666666%"');
    expect(html).not.toContain("time-bar-fill");
  });

  it("reads the bar's state back in words", () => {
    const evening = { startMinute: 1140, endMinute: 1320 };

    expect(barReadback({ anchor: 1140, range: null }, null)).toBe("From 7 PM — now tap the end");
    expect(barReadback({ anchor: 1110, range: { startMinute: 1110, endMinute: 1260 } }, null)).toBe(
      "6:30–9 PM",
    );
    expect(barReadback({ anchor: null, range: evening }, evening)).toBe("7–10 PM");
    expect(barReadback({ anchor: null, range: null }, { startMinute: 480, endMinute: 600 })).toBe(
      "Now 8–10 AM; pick on the bar to change it",
    );
    expect(barReadback({ anchor: null, range: null }, null)).toBe(
      "Tap a start time, then an end time, or drag across.",
    );
  });

  it("merges extra times into the options once, in order", () => {
    expect(timeOptions([540, 600], [null, 495, 600, 1335])).toEqual([495, 540, 600, 1335]);
  });
});
