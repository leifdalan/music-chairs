// The home screen's lists (plan/phase-15.md, plan/phase-17.md,
// plan/phase-19.2.md): every request in the viewer's groups that their member
// can still answer and hasn't, every request with rehearsals still to show,
// with its progress, and every proposed rehearsal the member hasn't answered.

import type { GoogleWriteState } from "~/components/calendar-actions";
import { describeSlot, offeredDates, todayInZone, windowEnd } from "~/lib/availability";
import { groupPath } from "~/lib/group-address";
import { answerable } from "~/lib/requests";

import { googleWriteState } from "./calendar-sync";
import { requestProgress, type RequestProgress } from "./progress";
import { getStore, type Group, type Member } from "./store";

export type HomeRequest = {
  /** The group's path (`groupPath`). */
  groupHref: string;
  groupName: string;
  requestId: string;
  name: string;
  /** The answer-by date when the viewer's member can still answer and hasn't. */
  waitingUntil: string | null;
  progress: RequestProgress | null;
  /** Google Calendar writing for the group, when the request is complete. */
  google: GoogleWriteState | null;
  /** The last date a download holds. */
  until: string;
};

export type WaitingProposal = {
  /** The group's path (`groupPath`). */
  groupHref: string;
  groupName: string;
  rehearsalId: string;
  summary: string;
  /** The request it was proposed from. */
  requestName: string | null;
};

/**
 * The viewer's requests across their groups (`visitorGroups`). Waiting
 * requests come first by answer-by date, then the rest by group name, newest
 * request first.
 */
export async function homeRequests(
  request: Request,
  memberships: { group: Group; member: Member }[],
): Promise<HomeRequest[]> {
  const store = getStore();
  const waiting: HomeRequest[] = [];
  const rest: HomeRequest[] = [];
  for (const { group, member } of memberships) {
    const today = todayInZone(group.timeZone, new Date());
    const progress = new Map(requestProgress(group, today).map((item) => [item.requestId, item]));
    const google = [...progress.values()].some((item) => item.complete)
      ? await googleWriteState(request, group, member)
      : null;
    for (const scheduleRequest of store.listRequests(group.id)) {
      const pending =
        answerable(scheduleRequest, today) &&
        !store
          .listAnswers(group.id, scheduleRequest.id)
          .some((answer) => answer.memberId === member.id);
      const shown = progress.get(scheduleRequest.id) ?? null;
      if (!pending && !shown) continue;
      (pending ? waiting : rest).push({
        groupHref: groupPath(group),
        groupName: group.name,
        requestId: scheduleRequest.id,
        name: scheduleRequest.name,
        waitingUntil: pending ? scheduleRequest.endDate : null,
        progress: shown,
        google: shown?.complete ? google : null,
        until: windowEnd(today),
      });
    }
  }
  waiting.sort((a, b) => (a.waitingUntil as string).localeCompare(b.waitingUntil as string));
  // Stable: within a group the store's newest-first order stays.
  rest.sort((a, b) => a.groupName.localeCompare(b.groupName));
  return [...waiting, ...rest];
}

/**
 * Proposed rehearsals the member hasn't answered: no RSVP from them on the
 * rehearsal (the rule the progress figures count by) and a date still to
 * answer for, from today to the end of the answer window. By group name, then
 * as the schedule lists them.
 */
export function waitingProposals(
  memberships: { group: Group; member: Member }[],
): WaitingProposal[] {
  const store = getStore();
  const proposals: WaitingProposal[] = [];
  for (const { group, member } of [...memberships].sort((a, b) =>
    a.group.name.localeCompare(b.group.name),
  )) {
    const today = todayInZone(group.timeZone, new Date());
    const answered = new Set(
      store
        .listRsvps(group.id)
        .filter((rsvp) => rsvp.memberId === member.id)
        .map((rsvp) => rsvp.rehearsalId),
    );
    for (const rehearsal of store.listRehearsals(group.id)) {
      if (rehearsal.status !== "proposed" || answered.has(rehearsal.id)) continue;
      if (offeredDates(rehearsal, today, windowEnd(today)).length === 0) continue;
      proposals.push({
        groupHref: groupPath(group),
        groupName: group.name,
        rehearsalId: rehearsal.id,
        summary: describeSlot(rehearsal),
        requestName: rehearsal.requestId
          ? (store.findRequest(group.id, rehearsal.requestId)?.name ?? null)
          : null,
      });
    }
  }
  return proposals;
}
