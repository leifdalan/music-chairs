// The organizer's next step on the group page (plan/phase-37.md).
import { describe, expect, it } from "vitest";

import { nextSteps, type StepRequest } from "../app/lib/next-step";

const request = (name: string, changes: Partial<StepRequest> = {}): StepRequest => ({
  name,
  href: `/g/band/${name.toLowerCase().replaceAll(" ", "-")}`,
  current: true,
  answered: true,
  answerCount: 1,
  readyToConfirm: 0,
  rehearsals: 0,
  ...changes,
});

const steps = (requests: StepRequest[], memberCount = 4) =>
  nextSteps({
    requests,
    memberCount,
    scheduleHref: "/g/band/schedule",
    newRequestHref: "/g/band/requests/new",
  }).map((step) => `${step.text} → ${step.href}`);

describe("the organizer's next steps", () => {
  it("start a request when none is taking answers", () => {
    expect(steps([])).toEqual(["Start an availability request → /g/band/requests/new"]);
    // A closed request with nothing to confirm doesn't count as one.
    // Nor does it ask for times or a choice, answered or not.
    expect(
      steps([request("Summer tour", { current: false, answered: false, answerCount: 3 })]),
    ).toEqual(["Start an availability request → /g/band/requests/new"]);
    expect(steps([request("Summer tour", { current: false, answerCount: 3 })])).toEqual([
      "Start an availability request → /g/band/requests/new",
    ]);
  });

  it("ask for the organizer's own times before choosing", () => {
    expect(steps([request("Spring tour", { answered: false, answerCount: 3 })])).toEqual([
      "Add your times to Spring tour → /g/band/spring-tour",
    ]);
  });

  it("choose times once someone else has answered, and not before", () => {
    expect(steps([request("Spring tour", { answerCount: 2 })])).toEqual([
      "Choose times for Spring tour → /g/band/spring-tour",
    ]);
    // Only the organizer's own answer: waiting for the band.
    expect(steps([request("Spring tour", { answerCount: 1 })])).toEqual([]);
  });

  it("stop choosing once a rehearsal is proposed or confirmed", () => {
    expect(steps([request("Spring tour", { answerCount: 3, rehearsals: 1 })])).toEqual([]);
  });

  it("confirm once a member has answered a proposal, even on a closed request", () => {
    expect(steps([request("Winter concert", { readyToConfirm: 1, rehearsals: 1 })])).toEqual([
      "Confirm a time for Winter concert → /g/band/schedule",
    ]);
    expect(
      steps([request("Winter concert", { current: false, readyToConfirm: 2, rehearsals: 2 })]),
    ).toEqual([
      "Confirm a time for Winter concert → /g/band/schedule",
      "Start an availability request → /g/band/requests/new",
    ]);
  });

  it("put the most advanced kind first, then keep page order", () => {
    expect(
      steps([
        request("Autumn", { answerCount: 3 }),
        request("Spring", { answered: false }),
        request("Winter", { readyToConfirm: 1, rehearsals: 1 }),
        request("Summer", { answered: false }),
      ]),
    ).toEqual([
      "Confirm a time for Winter → /g/band/schedule",
      "Add your times to Spring → /g/band/spring",
      "Add your times to Summer → /g/band/summer",
      "Choose times for Autumn → /g/band/autumn",
    ]);
  });

  it("leave a group of one with its invite", () => {
    expect(steps([request("Spring tour", { answered: false })], 1)).toEqual([]);
  });
});
