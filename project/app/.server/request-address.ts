// Readable request and rehearsal links (plan/phase-30.md) on the server: finding
// what a link names, and sending a visitor who holds the group's invite code
// through joining to the link.

import { data, redirect } from "react-router";

import { groupPath, invitePath } from "~/lib/group-address";
import { withNotice } from "~/lib/notices";
import { rehearsalSlugs } from "~/lib/request-address";

import { findGroupByAddress, groupFromAddress } from "./group-address";
import { pagePath } from "./membership";
import { getStore, type Group, type Rehearsal, type ScheduleRequest } from "./store";

/** The group's request this address names; unknown → 404. */
export function requestFromSlug(group: Group, slug: string | undefined): ScheduleRequest {
  const found = slug ? getStore().findRequestBySlug(group.id, slug) : null;
  if (!found) throw data(null, { status: 404 });
  return found;
}

/** The request's rehearsal this address names, or null. */
export function findRehearsalBySlug(
  group: Group,
  requestId: string,
  slug: string,
): Rehearsal | null {
  const lower = slug.toLowerCase();
  const rehearsals = getStore().listRehearsals(group.id);
  const slugs = rehearsalSlugs(rehearsals);
  return (
    rehearsals.find(
      (rehearsal) => rehearsal.requestId === requestId && slugs.get(rehearsal.id) === lower,
    ) ?? null
  );
}

/**
 * Where a link carrying `?join=<code>` (copied by an organizer) sends someone
 * who isn't the member it is for: a member is sent once to the address without
 * it; a visitor holding this group's code joins first, then lands on the link;
 * any other visitor goes to the group page. Throws the redirect, or returns for
 * a member at a clean address.
 */
export function landOrJoin(request: Request, group: Group, isMember: boolean): void {
  const url = new URL(request.url);
  const here = new URL(pagePath(url), url);
  const join = here.searchParams.get("join");
  here.searchParams.delete("join");
  const target = here.pathname + here.search;
  if (isMember) {
    if (join !== null) throw redirect(target);
    return;
  }
  if (join !== null && join.toLowerCase() === group.inviteCode) {
    throw redirect(`${invitePath(group)}?then=${encodeURIComponent(target)}`);
  }
  throw redirect(groupPath(group));
}

/**
 * For a link with no page of its own (a rehearsal's link, a calendar
 * download): when the group, request or rehearsal no longer exists, the
 * person goes to `fallback`, told the link is out of date, instead of a bare
 * error (plan/phase-35.md).
 */
export function linkGone(fallback: string): Response {
  return redirect(withNotice(fallback, "link-gone"));
}

/** The group a link names, via `groupFromAddress` (and its renamed-address redirect); gone → the start page. */
export function linkedGroup(request: Request, address: string | undefined): Group {
  if (!address || !findGroupByAddress(address)) throw linkGone("/");
  return groupFromAddress(request, address);
}
