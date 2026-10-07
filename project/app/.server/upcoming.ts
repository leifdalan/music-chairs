// What a group has coming up (plan/phase-24.md): its confirmed rehearsal dates
// for the group page, and each availability request's own rehearsals.

import { describeSlot, offeredDates, todayInZone, windowEnd } from "~/lib/availability";

import type { PayoffData } from "~/components/payoff-card";

import { getStore, type Group, type Member } from "./store";

export type UpcomingDate = {
  rehearsalId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  location: string;
  requestName: string | null;
};

/**
 * Every date a confirmed rehearsal meets from `today` to the end of the answer
 * window (a one-off further out included), cancelled dates left out, in order.
 */
export function upcomingRehearsals(group: Group, today: string): UpcomingDate[] {
  const store = getStore();
  const names = new Map(store.listRequests(group.id).map((item) => [item.id, item.name]));
  const until = windowEnd(today);
  return store
    .listRehearsals(group.id)
    .filter((rehearsal) => rehearsal.status === "confirmed")
    .flatMap((rehearsal) =>
      offeredDates(rehearsal, today, until).map((date) => ({
        rehearsalId: rehearsal.id,
        date,
        startMinute: rehearsal.startMinute,
        endMinute: rehearsal.endMinute,
        location: rehearsal.location,
        requestName: rehearsal.requestId ? (names.get(rehearsal.requestId) ?? null) : null,
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute);
}

export type RequestRehearsal = {
  id: string;
  status: "proposed" | "confirmed";
  summary: string;
  location: string;
  /** Members who answered at least one of its dates. */
  answered: number;
  memberCount: number;
};

/**
 * Each availability request's rehearsals, keyed by request id: every proposed
 * one, and confirmed ones that still meet from `today`.
 */
export function requestRehearsals(group: Group, today: string): Map<string, RequestRehearsal[]> {
  const store = getStore();
  const until = windowEnd(today);
  const memberCount = store.listMembers(group.id).length;
  const answeredBy = new Map<string, Set<string>>();
  for (const rsvp of store.listRsvps(group.id)) {
    answeredBy.set(
      rsvp.rehearsalId,
      (answeredBy.get(rsvp.rehearsalId) ?? new Set()).add(rsvp.memberId),
    );
  }
  const byRequest = new Map<string, RequestRehearsal[]>();
  for (const rehearsal of store.listRehearsals(group.id)) {
    if (!rehearsal.requestId) continue;
    if (rehearsal.status === "confirmed" && offeredDates(rehearsal, today, until).length === 0) {
      continue;
    }
    const list = byRequest.get(rehearsal.requestId) ?? [];
    list.push({
      id: rehearsal.id,
      status: rehearsal.status,
      summary: describeSlot(rehearsal),
      location: rehearsal.location,
      answered: answeredBy.get(rehearsal.id)?.size ?? 0,
      memberCount,
    });
    byRequest.set(rehearsal.requestId, list);
  }
  return byRequest;
}

/**
 * A member's next confirmed rehearsal date in a group, from that group's own
 * today, with their answer and who said yes (names when the member may see
 * names: organizers, or a group that shows them), or null when none is coming.
 */
export function nextRehearsalFor(
  group: Group,
  member: Member,
  now: Date,
): (PayoffData & { rehearsalId: string }) | null {
  const store = getStore();
  const [next] = upcomingRehearsals(group, todayInZone(group.timeZone, now));
  if (!next) return null;
  const answers = store
    .listRsvps(group.id)
    .filter((rsvp) => rsvp.rehearsalId === next.rehearsalId && rsvp.date === next.date);
  const yes = answers.filter((rsvp) => rsvp.answer === "yes");
  const yesIds = new Set(yes.map((rsvp) => rsvp.memberId));
  const showNames = member.role === "organizer" || group.showNames;
  return {
    rehearsalId: next.rehearsalId,
    date: next.date,
    startMinute: next.startMinute,
    endMinute: next.endMinute,
    location: next.location,
    mine: answers.find((rsvp) => rsvp.memberId === member.id)?.answer ?? null,
    comingNames: showNames
      ? store
          .listMembers(group.id)
          .filter((item) => yesIds.has(item.id))
          .map((item) => item.displayName)
      : null,
    yes: yes.length,
    answered: answers.length,
  };
}
