import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { IDLE, nextFeedback, SAVED_MS, SubmitButton } from "../app/components/submit-button";

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

    expect(html).toContain(">Save</button>");
    expect(html).toContain('aria-label="Save Thursday"');
    expect(html).not.toContain("disabled");
  });
});
