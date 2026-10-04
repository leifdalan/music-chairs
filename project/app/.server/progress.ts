// How each scheduling request is going (plan/phase-17.md): the rehearsals it
// produced and how far along they are, for the schedule page and the home
// screen. Counts only, so members and organizers see the same figures.

import { describeSlot, offeredDates, windowEnd } from "~/lib/availability";

import { getStore, type Group } from "./store";

export type RequestProgress = {
  requestId: string;
  name: string;
  /** Of every rehearsal proposed from the request, past ones included. */
  confirmed: number;
  total: number;
  /**
   * Members who answered every rehearsal still proposed (at least one date
   * each); null when nothing is proposed.
   */
  answered: number | null;
  memberCount: number;
  /** At least one rehearsal confirmed and none still proposed. */
  complete: boolean;
  proposed: { id: string; summary: string }[];
};

/**
 * The group's requests that still have something to show: a rehearsal still
 * proposed (even one whose dates have passed, until an organizer deletes it)
 * or a confirmed one meeting from `today`. Newest request first.
 */
export function requestProgress(group: Group, today: string): RequestProgress[] {
  const store = getStore();
  const until = windowEnd(today);
  const rehearsals = store.listRehearsals(group.id);
  const members = store.listMembers(group.id);
  const answeredBy = new Map<string, Set<string>>();
  for (const rsvp of store.listRsvps(group.id)) {
    answeredBy.set(
      rsvp.rehearsalId,
      (answeredBy.get(rsvp.rehearsalId) ?? new Set()).add(rsvp.memberId),
    );
  }
  const progress: RequestProgress[] = [];
  for (const request of store.listRequests(group.id)) {
    const own = rehearsals.filter((rehearsal) => rehearsal.requestId === request.id);
    const proposed = own.filter((rehearsal) => rehearsal.status === "proposed");
    const confirmed = own.filter((rehearsal) => rehearsal.status === "confirmed");
    const upcoming = confirmed.some(
      (rehearsal) => offeredDates(rehearsal, today, until).length > 0,
    );
    if (proposed.length === 0 && !upcoming) continue;
    progress.push({
      requestId: request.id,
      name: request.name,
      confirmed: confirmed.length,
      total: own.length,
      answered:
        proposed.length === 0
          ? null
          : members.filter((member) =>
              proposed.every((rehearsal) => answeredBy.get(rehearsal.id)?.has(member.id)),
            ).length,
      memberCount: members.length,
      complete: confirmed.length > 0 && proposed.length === 0,
      proposed: proposed.map((rehearsal) => ({
        id: rehearsal.id,
        summary: describeSlot(rehearsal),
      })),
    });
  }
  return progress;
}
