// Missing members on a rehearsal's dates, said once per set of people
// (plan/phase-25.md): "Oboe and Harpist aren't free on 8 dates, …".

import { formatDate } from "./availability";

export type MissingSummary = { missing: string[]; dates: string[] };

/**
 * One summary per distinct set of missing names (as given, in member order),
 * each with its dates, ordered by each set's first date. The input is sorted
 * by date here rather than trusted to arrive in order.
 */
export function missingSummaries(
  warnings: { date: string; missing: string[] }[],
): MissingSummary[] {
  const byKey = new Map<string, MissingSummary>();
  for (const warning of [...warnings].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = warning.missing.join("\n");
    const summary = byKey.get(key) ?? { missing: warning.missing, dates: [] };
    summary.dates.push(warning.date);
    byKey.set(key, summary);
  }
  return [...byKey.values()];
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** "Oboe isn't free on Thu 8 Oct." … "Oboe and Harpist aren't free on 8 dates, Tue 6 Oct to Tue 24 Nov." */
export function missingSentence({ missing, dates }: MissingSummary): string {
  const verb = missing.length === 1 ? "isn't" : "aren't";
  const when =
    dates.length <= 3
      ? joinNames(dates.map(formatDate))
      : `${dates.length} dates, ${formatDate(dates[0])} to ${formatDate(dates[dates.length - 1])}`;
  return `${joinNames(missing)} ${verb} free on ${when}.`;
}
