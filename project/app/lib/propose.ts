// Proposing several free times at once (plan/phase-15.md): each tick box names
// a free time as "<date> <start> <end>" (minutes after midnight, an end of 1440
// being midnight), and one length applies to all of them.

import { isDate, STEP_MINUTES, type SlotInput } from "~/lib/availability";

/** The rehearsal lengths an organizer can choose, in minutes; 2 hours is the default. */
export const PROPOSE_LENGTHS = [60, 90, 120, 150, 180, 240] as const;
export const DEFAULT_PROPOSE_LENGTH = 120;
/** The most free times proposed in one go. */
export const PROPOSE_MAX = 20;

/** A tick box's value for a free time. */
export function timeValue(date: string, startMinute: number, endMinute: number): string {
  return `${date} ${startMinute} ${endMinute}`;
}

/** "1 hour", "1½ hours". */
export function lengthLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const half = minutes % 60 === 30 ? "½" : "";
  return `${hours}${half} hour${minutes === 60 ? "" : "s"}`;
}

export type ProposedTimes = { ok: true; inputs: SlotInput[] } | { ok: false; error: string };

/**
 * The one-off rehearsals the ticked free times become: each starts where its
 * free time starts and lasts the chosen length, cut short to the free time.
 * Identical results are proposed once.
 */
export function parseProposedTimes(form: FormData, today: string): ProposedTimes {
  const ticks = form.getAll("time");
  if (ticks.length === 0) return { ok: false, error: "Tick at least one free time." };
  if (ticks.length > PROPOSE_MAX) {
    return { ok: false, error: `Tick at most ${PROPOSE_MAX} free times at once.` };
  }
  const length = Number(form.get("length"));
  if (!(PROPOSE_LENGTHS as readonly number[]).includes(length)) {
    return { ok: false, error: "Choose a rehearsal length." };
  }
  const inputs = new Map<string, SlotInput>();
  for (const tick of ticks) {
    const match = typeof tick === "string" ? /^(\S+) (\d{1,4}) (\d{1,4})$/.exec(tick) : null;
    const date = match?.[1];
    const start = Number(match?.[2]);
    const end = Number(match?.[3]);
    if (
      !match ||
      !isDate(date) ||
      start % STEP_MINUTES !== 0 ||
      end % STEP_MINUTES !== 0 ||
      start < 0 ||
      end > 1440 ||
      start >= end
    ) {
      return {
        ok: false,
        error: "One of the ticked times isn't valid. Reload the page and try again.",
      };
    }
    if (date < today) return { ok: false, error: "One of the ticked times has already passed." };
    const input: SlotInput = {
      kind: "once",
      startDate: date,
      endDate: null,
      startMinute: start,
      endMinute: Math.min(start + length, end),
    };
    inputs.set(`${date} ${input.startMinute} ${input.endMinute}`, input);
  }
  return { ok: true, inputs: [...inputs.values()] };
}
