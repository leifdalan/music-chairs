// Laying a range of dates out as month calendars (plan/phase-10.md), weeks
// starting on Sunday. Dates are YYYY-MM-DD in the group's zone.

import { addDays } from "~/lib/availability";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/** A month's weeks, each seven cells from Sunday; a cell is a date in the range or null. */
export type CalendarMonth = { label: string; weeks: (string | null)[][] };

function weekday(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** The months from `from` to `to` (inclusive), with blanks for dates outside the range. */
export function monthGrid(from: string, to: string): CalendarMonth[] {
  const months: CalendarMonth[] = [];
  let date = from;
  while (date <= to) {
    const [year, month] = date.split("-").map(Number);
    const weeks: (string | null)[][] = [];
    let week: (string | null)[] = Array.from({ length: weekday(date) }, () => null);
    while (date <= to && Number(date.slice(5, 7)) === month) {
      week.push(date);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
      date = addDays(date, 1);
    }
    if (week.length > 0)
      weeks.push([...week, ...Array.from({ length: 7 - week.length }, () => null)]);
    months.push({ label: `${MONTHS[month - 1]} ${year}`, weeks });
  }
  return months;
}
