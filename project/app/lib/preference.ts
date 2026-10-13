// A member's preferred number of rehearsals in an availability request's
// dates (plan/phase-28.md): stored as a number, or null for "as many as
// possible", which is also what a member who only ticked dates has.

/** "as many as possible", "1 rehearsal", "3 rehearsals". */
export function preferenceText(limit: number | null): string {
  if (limit === null) return "as many as possible";
  return `${limit} ${limit === 1 ? "rehearsal" : "rehearsals"}`;
}

/**
 * Every answer's preferred number in one line for the organizer
 * (plan/phase-37.md), grouped by preference, numbers first and smallest first:
 * "2 (Cellist, Gee), as many as possible (Pianist)". Members who haven't
 * answered are left out (the Responses section lists them); null when nobody has.
 */
export function preferenceSummary(
  answers: { name: string; answer: { limit: number | null } | null }[],
): string | null {
  const groups = new Map<number | null, string[]>();
  for (const { name, answer } of answers) {
    if (!answer) continue;
    groups.set(answer.limit, [...(groups.get(answer.limit) ?? []), name]);
  }
  if (groups.size === 0) return null;
  return [...groups]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
    .map(
      ([limit, names]) => `${limit === null ? preferenceText(null) : limit} (${names.join(", ")})`,
    )
    .join(", ");
}
