import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import {
  ButtonLabels,
  IDLE,
  SAVED_MS,
  SubmitButton,
  nextFeedback,
} from "../app/components/submit-button";

const pressed = nextFeedback(IDLE, { type: "press", key: "save", toastId: "t1", now: 1000 });

describe("submit button feedback", () => {
  it("is saving once its own submission is in flight", () => {
    const saving = nextFeedback(pressed, { type: "navigating" });

    expect(saving).toMatchObject({ key: "save", phase: "saving" });
  });

  it("shows saved when the submission brought a new toast, and expires", () => {
    const saving = nextFeedback(pressed, { type: "navigating" });
    const saved = nextFeedback(saving, { type: "idle", toastId: "t2", now: 1500 });

    expect(saved).toMatchObject({ key: "save", phase: "saved" });
    expect(nextFeedback(saved, { type: "tick", now: 1500 + SAVED_MS - 1 }).phase).toBe("saved");
    expect(nextFeedback(saved, { type: "tick", now: 1500 + SAVED_MS })).toEqual(IDLE);
  });

  it("returns to its label when the submission was refused (no new toast)", () => {
    const saving = nextFeedback(pressed, { type: "navigating" });

    expect(nextFeedback(saving, { type: "idle", toastId: "t1", now: 1500 })).toEqual(IDLE);
    expect(
      nextFeedback(nextFeedback({ ...pressed, toastAtPress: null }, { type: "navigating" }), {
        type: "idle",
        toastId: null,
        now: 1500,
      }),
    ).toEqual(IDLE);
  });

  it("forgets a press the browser never submitted", () => {
    expect(nextFeedback(pressed, { type: "idle", toastId: "t1", now: 1100 }).phase).toBe("pressed");
    expect(nextFeedback(pressed, { type: "tick", now: 3000 })).toEqual(IDLE);
  });

  it("is untouched by other navigations while idle", () => {
    expect(nextFeedback(IDLE, { type: "navigating" })).toEqual(IDLE);
    expect(nextFeedback(IDLE, { type: "idle", toastId: "t9", now: 5 })).toEqual(IDLE);
  });

  it("renders its label when nothing is happening", () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <SubmitButton feedbackKey="save" label="Save Thursday">
            Save
          </SubmitButton>
        ),
      },
    ]);
    const html = renderToString(<Stub initialEntries={["/"]} />);

    // The label shows; "Saving…" and "Saved ✓" keep their space, hidden (plan/phase-33.md).
    expect(html).toContain('<span class="button-label" data-shown="true">Save</span>');
    expect(html).toMatch(
      /<span class="button-label button-label-saving" data-shown="false" aria-hidden="true">.*Saving…<\/span>/,
    );
    expect(html).toContain(
      '<span class="button-label" data-shown="false" aria-hidden="true">Saved ✓</span>',
    );
    expect(html).toContain('aria-label="Save Thursday"');
    // The attribute, not the `disabled:` utility variants in the class.
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/);
  });
});

describe("a progress button's labels (plan/phase-33.md)", () => {
  it.each([
    [null, "Save"],
    ["saving", "Saving…"],
    ["saved", "Saved ✓"],
  ] as const)("show only the current one in %s, keeping the others' space", (status, current) => {
    const html = renderToString(<ButtonLabels status={status}>Save</ButtonLabels>);
    const cells = [
      ...html.matchAll(
        /<span class="button-label[^"]*" data-shown="(true|false)"( aria-hidden="true")?>(.*?)<\/span>(?=<span class="button-label|<\/span>$)/g,
      ),
    ].map((match) => ({
      shown: match[1] === "true",
      hidden: Boolean(match[2]),
      text: match[3].replace(/<[^>]+>/g, ""),
    }));
    expect(cells.map((cell) => cell.text)).toEqual(["Save", "Saving…", "Saved ✓"]);
    expect(cells.filter((cell) => cell.shown).map((cell) => cell.text)).toEqual([current]);
    for (const cell of cells) expect(cell.hidden).toBe(!cell.shown);
  });
});
