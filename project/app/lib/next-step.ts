/**
 * The organizer's next steps on the group page (plan/phase-37.md): at most one
 * per availability request, its most useful, ordered so the first is the one
 * to do now.
 */

/** What the group page knows about one of its listed requests. */
export type StepRequest = {
  name: string;
  href: string;
  /** Still taking answers: open, and not yet ended. */
  current: boolean;
  /** Whether the viewer has sent an answer. */
  answered: boolean;
  /** How many members have sent an answer, the viewer included. */
  answerCount: number;
  /** Proposed rehearsals from today on that at least one member has answered. */
  readyToConfirm: number;
  /** Proposed rehearsals, and confirmed ones still to come. */
  rehearsals: number;
};

export type NextStep = { kind: "confirm" | "add" | "choose" | "start"; text: string; href: string };

const ORDER: NextStep["kind"][] = ["confirm", "add", "choose", "start"];

/** One request's step: confirm, then the viewer's own times, then choosing; or none. */
function stepFor(item: StepRequest, scheduleHref: string): NextStep | null {
  // Members answer a proposal on the schedule before it is confirmed (plan/phase-37.md).
  if (item.readyToConfirm > 0) {
    return { kind: "confirm", text: `Confirm a time for ${item.name}`, href: scheduleHref };
  }
  if (!item.current) return null;
  // The organizer's own times are part of who is free, so they come before choosing.
  if (!item.answered) {
    return { kind: "add", text: `Add your times to ${item.name}`, href: item.href };
  }
  const others = item.answerCount - 1;
  if (others > 0 && item.rehearsals === 0) {
    return { kind: "choose", text: `Choose times for ${item.name}`, href: item.href };
  }
  return null;
}

/**
 * The steps for an organizer, by kind and then in page order; with no request
 * still taking answers, starting one. A group of one has none: its invite
 * comes first.
 */
export function nextSteps({
  requests,
  memberCount,
  scheduleHref,
  newRequestHref,
}: {
  requests: StepRequest[];
  memberCount: number;
  scheduleHref: string;
  newRequestHref: string;
}): NextStep[] {
  if (memberCount < 2) return [];
  const steps = requests.map((item) => stepFor(item, scheduleHref)).filter((step) => step !== null);
  if (!requests.some((item) => item.current)) {
    steps.push({ kind: "start", text: "Start an availability request", href: newRequestHref });
  }
  // A stable sort keeps page order within a kind.
  return steps.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
