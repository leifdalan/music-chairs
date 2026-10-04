// The home screen's "Your requests" (plan/phase-15.md, plan/phase-17.md): every
// request in the viewer's groups that their member can still answer and
// hasn't, and every request with rehearsals still to show, with its progress.

import type { GoogleWriteState } from "~/components/calendar-actions";
import { todayInZone, windowEnd } from "~/lib/availability";
import { answerable } from "~/lib/requests";

import { googleWriteState } from "./calendar-sync";
import { readMemberships } from "./membership";
import { requestProgress, type RequestProgress } from "./progress";
import { getStore, type Account, type Member } from "./store";

export type HomeRequest = {
  groupId: string;
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

/**
 * The viewer's requests across the groups joined on this device and, when
 * signed in, the account's groups. Each group's member is found as on its
 * pages: this device's member if its token still resolves, otherwise the
 * account's; a group with neither (deleted, or the member removed) is skipped.
 * Waiting requests come first by answer-by date, then the rest by group name,
 * newest request first.
 */
export async function homeRequests(
  request: Request,
  account: Account | null,
): Promise<HomeRequest[]> {
  const store = getStore();
  const devices = await readMemberships(request);
  const linked = new Map<string, Member>(
    account
      ? store.listAccountMemberships(account.id).map(({ group, member }) => [group.id, member])
      : [],
  );
  const waiting: HomeRequest[] = [];
  const rest: HomeRequest[] = [];
  for (const groupId of new Set([...Object.keys(devices), ...linked.keys()])) {
    const group = store.findGroup(groupId);
    if (!group) continue;
    const token = devices[groupId];
    const member =
      (token ? store.findMemberByDevice(group.id, token) : null) ?? linked.get(groupId);
    if (!member) continue;
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
        groupId: group.id,
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
