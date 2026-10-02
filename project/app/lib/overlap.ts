// Group overlap: which members are free in each 30-minute cell of each date.
// Dates and minutes are wall-clock values in the group's zone (Phase 2), so a
// group's availability can be compared without any zone conversion.

import { addDays, expandOccurrences, type Slot } from "~/lib/availability";

export type OverlapMember = {
  id: string;
  displayName: string;
  optional: boolean;
  slots: Slot[];
};

const CELL_MINUTES = 30;
const CELLS_PER_DAY = (24 * 60) / CELL_MINUTES;

/** For each date in the range, 48 sets of the member ids free in that half hour. */
export type Cells = Map<string, Set<string>[]>;

/** A maximal run of half hours on one date with the same, non-empty set of free members. */
export type Stretch = { startMinute: number; endMinute: number; free: string[] };

function emptyDay(): Set<string>[] {
  return Array.from({ length: CELLS_PER_DAY }, () => new Set<string>());
}

function fill(cells: Cells, members: OverlapMember[], from: string, to: string): void {
  for (let date = from; date <= to; date = addDays(date, 1)) cells.set(date, emptyDay());
  for (const member of members) {
    for (const occurrence of expandOccurrences(member.slots, from, to)) {
      const day = cells.get(occurrence.date);
      if (!day) continue;
      const first = occurrence.startMinute / CELL_MINUTES;
      const last = occurrence.endMinute / CELL_MINUTES;
      for (let cell = first; cell < last; cell++) day[cell].add(member.id);
    }
  }
}

/**
 * Every member's availability between `from` and `to` (inclusive), cell by
 * cell, plus each of `extraDates` on its own. Only those dates are built, so a
 * single far-off date costs one day, not every day up to it.
 */
export function buildCells(
  members: OverlapMember[],
  from: string,
  to: string,
  extraDates: string[] = [],
): Cells {
  const cells: Cells = new Map();
  fill(cells, members, from, to);
  for (const date of extraDates) {
    if (!cells.has(date)) fill(cells, members, date, date);
  }
  return cells;
}

function sameMembers(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/** The date's free stretches, earliest first; member ids are sorted for stable output. */
export function freeStretches(cells: Cells, date: string): Stretch[] {
  const day = cells.get(date);
  if (!day) return [];
  const stretches: Stretch[] = [];
  let start = 0;
  for (let cell = 1; cell <= CELLS_PER_DAY; cell++) {
    if (cell < CELLS_PER_DAY && sameMembers(day[cell], day[start])) continue;
    if (day[start].size > 0) {
      stretches.push({
        startMinute: start * CELL_MINUTES,
        endMinute: cell * CELL_MINUTES,
        free: [...day[start]].sort(),
      });
    }
    start = cell;
  }
  return stretches;
}

/** Members free for the whole of `startMinute`–`endMinute` on `date`. */
export function freeDuring(
  cells: Cells,
  date: string,
  startMinute: number,
  endMinute: number,
): Set<string> {
  const day = cells.get(date);
  if (!day) return new Set();
  const first = startMinute / CELL_MINUTES;
  const free = new Set(day[first]);
  for (let cell = first + 1; cell < endMinute / CELL_MINUTES; cell++) {
    for (const id of free) if (!day[cell].has(id)) free.delete(id);
  }
  return free;
}

/** Members who are not optional and not in `free`, in the order given. */
export function missingRequired(members: OverlapMember[], free: Set<string>): OverlapMember[] {
  return members.filter((member) => !member.optional && !free.has(member.id));
}
