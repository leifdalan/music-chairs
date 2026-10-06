// The dates migration 11 gives a weekly availability row (plan/phase-23.md):
// its weekday from UTC yesterday to UTC today + 56 days, from its start date,
// to its end date, without its skips. SQLite's date('now') reads the real
// clock, so this does too (fake timers don't reach SQLite).

function utcDay(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset))
    .toISOString()
    .slice(0, 10);
}

export function weeklyDates(
  startDate: string,
  endDate: string | null = null,
  skips: string[] = [],
): string[] {
  const weekday = new Date(`${startDate}T00:00:00Z`).getUTCDay();
  const dates: string[] = [];
  for (let offset = -1; offset <= 56; offset++) {
    const day = utcDay(offset);
    if (new Date(`${day}T00:00:00Z`).getUTCDay() !== weekday) continue;
    if (day < startDate || (endDate !== null && day > endDate) || skips.includes(day)) continue;
    dates.push(day);
  }
  return dates;
}
