// Proposing several free times at once (plan/phase-15.md): each tick box names
// a free time as "<date> <start> <end>" (minutes after midnight, an end of 1440
// being midnight), and proposing it proposes that whole time (plan/phase-29.md).

import { isDate, STEP_MINUTES } from "~/lib/availability";
import type { RehearsalInput } from "~/lib/rehearsal";

/** The most free times proposed in one go. */
export const PROPOSE_MAX = 20;

/** A tick box's value for a free time. */
export function timeValue(date: string, startMinute: number, endMinute: number): string {
  return `${date} ${startMinute} ${endMinute}`;
}

export type ProposedTimes = { ok: true; inputs: RehearsalInput[] } | { ok: false; error: string };

/** The rehearsals the ticked free times become, each its whole free time; repeats once. */
export function parseProposedTimes(form: FormData, today: string): ProposedTimes {
  const ticks = form.getAll("time");
  if (ticks.length === 0) return { ok: false, error: "Tick at least one free time." };
  if (ticks.length > PROPOSE_MAX) {
    return { ok: false, error: `Tick at most ${PROPOSE_MAX} free times at once.` };
  }
  const inputs = new Map<string, RehearsalInput>();
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
    inputs.set(`${date} ${start} ${end}`, { date, startMinute: start, endMinute: end });
  }
  return { ok: true, inputs: [...inputs.values()] };
}
