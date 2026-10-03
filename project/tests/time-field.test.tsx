import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QuarterHours, TimeField } from "../app/components/time-field";

describe("time field", () => {
  it("renders a text field that suggests every quarter hour", () => {
    const html = renderToString(<TimeField id="startTime" name="startTime" defaultValue="09:00" />);

    expect(html).toContain('type="text"');
    expect(html).toContain('list="startTime-times"');
    expect(html).toContain('value="09:00"');
    expect(html.match(/<option /g)).toHaveLength(96);
    expect(html).toContain('value="19:15"');
    expect(html).not.toContain("inputmode");
  });

  it("can share one suggestion list between many fields", () => {
    const html = renderToString(
      <>
        <QuarterHours id="shared" />
        <TimeField id="a" name="a" listId="shared" label="Start, Thu 8 Oct" />
        <TimeField id="b" name="b" listId="shared" end />
      </>,
    );

    expect(html.match(/<option /g)).toHaveLength(96);
    expect(html.match(/list="shared"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Start, Thu 8 Oct"');
  });
});
