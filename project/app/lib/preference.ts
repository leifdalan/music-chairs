// A member's preferred number of rehearsals in an availability request's
// dates (plan/phase-28.md): stored as a number, or null for "as many as
// possible", which is also what a member who only ticked dates has.

/** "as many as possible", "1 rehearsal", "3 rehearsals". */
export function preferenceText(limit: number | null): string {
  if (limit === null) return "as many as possible";
  return `${limit} ${limit === 1 ? "rehearsal" : "rehearsals"}`;
}

/**
 * One member in the organizer's summary: "Cellist: 2", "Pianist: as many as
 * possible", "Oboe: not answered" (no response at all).
 */
export function preferenceEntry(name: string, answer: { limit: number | null } | null): string {
  if (!answer) return `${name}: not answered`;
  return `${name}: ${answer.limit === null ? preferenceText(null) : answer.limit}`;
}
