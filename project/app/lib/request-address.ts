// Readable links (plan/phase-30.md): an availability request at
// `/g/<group address>/<request slug>` and a proposed rehearsal at
// `<request address>/<date and time>`. A request's slug is chosen once, when it
// is made, and never changes with its name; a rehearsal's comes from its date
// and start time, which never change either.

import { slugify } from "./group-address";

/** Request slugs that would hide a page of the group's own. */
export const RESERVED_SLUGS = new Set(["schedule", "profile", "members", "requests"]);

/** The first of `base`, `base-2`, `base-3`… that isn't taken or reserved. */
function firstFree(base: string, taken: Set<string>, reserved: Set<string>): string {
  let slug = base;
  for (let n = 2; taken.has(slug) || reserved.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/** A new request's slug in a group that already uses `taken`: "winter-concert", then "winter-concert-2". */
export function nextRequestSlug(name: string, taken: Set<string>): string {
  return firstFree(slugify(name, "request"), taken, RESERVED_SLUGS);
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * "tue-14-oct-7pm", "tue-14-oct-7-30pm". Its own rule rather than the display
 * formatters', so links already shared never change with how dates are shown.
 */
function rehearsalBase(rehearsal: { date: string; startMinute: number }): string {
  const [year, month, day] = rehearsal.date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const hour = Math.floor(rehearsal.startMinute / 60) % 24;
  const minute = rehearsal.startMinute % 60;
  const clock = `${hour % 12 || 12}${minute ? `-${String(minute).padStart(2, "0")}` : ""}`;
  return `${WEEKDAYS[weekday]}-${day}-${MONTHS[month - 1]}-${clock}${hour < 12 ? "am" : "pm"}`;
}

/**
 * Each rehearsal's slug within its request, by id: its date and start time,
 * with `-2`… only for another of the request's at the same date and time (in
 * the order given). Only deleting one of two at the same date and time moves
 * the other's. Rehearsals made without a request have none.
 */
export function rehearsalSlugs(
  rehearsals: { id: string; requestId: string | null; date: string; startMinute: number }[],
): Map<string, string> {
  const taken = new Map<string, Set<string>>();
  const slugs = new Map<string, string>();
  for (const rehearsal of rehearsals) {
    if (!rehearsal.requestId) continue;
    const used = taken.get(rehearsal.requestId) ?? new Set<string>();
    const slug = firstFree(rehearsalBase(rehearsal), used, new Set());
    used.add(slug);
    taken.set(rehearsal.requestId, used);
    slugs.set(rehearsal.id, slug);
  }
  return slugs;
}

/** A request's page: `/g/<group address>/<slug>`. */
export function requestPath(groupPath: string, slug: string): string {
  return `${groupPath}/${slug}`;
}

/** A proposed rehearsal's link: `<request address>/<date and time>`. */
export function rehearsalPath(groupPath: string, requestSlug: string, slug: string): string {
  return `${groupPath}/${requestSlug}/${slug}`;
}

/** A link an organizer shares: anyone not yet in the group joins first, then lands on it. */
export function withJoin(path: string, inviteCode: string): string {
  return `${path}?join=${inviteCode}`;
}
