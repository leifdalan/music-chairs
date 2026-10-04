// The home screen's "Waiting for your answer" (plan/phase-15.md): every request
// in the viewer's groups that their member can still answer and hasn't.

import { todayInZone } from "~/lib/availability";
import { answerable } from "~/lib/requests";

import { readMemberships } from "./membership";
import { getStore, type Account, type Member } from "./store";

export type PendingRequest = {
  groupId: string;
  groupName: string;
  requestId: string;
  name: string;
  endDate: string;
};

/**
 * The viewer's pending requests across the groups joined on this device and,
 * when signed in, the account's groups. Each group's member is found as on
 * its pages: this device's member if its token still resolves, otherwise the
 * account's; a group with neither (deleted, or the member removed) is skipped.
 */
export async function pendingRequests(
  request: Request,
  account: Account | null,
): Promise<PendingRequest[]> {
  const store = getStore();
  const devices = await readMemberships(request);
  const linked = new Map<string, Member>(
    account
      ? store.listAccountMemberships(account.id).map(({ group, member }) => [group.id, member])
      : [],
  );
  const pending: PendingRequest[] = [];
  for (const groupId of new Set([...Object.keys(devices), ...linked.keys()])) {
    const group = store.findGroup(groupId);
    if (!group) continue;
    const token = devices[groupId];
    const member =
      (token ? store.findMemberByDevice(group.id, token) : null) ?? linked.get(groupId);
    if (!member) continue;
    const today = todayInZone(group.timeZone, new Date());
    for (const scheduleRequest of store.listRequests(group.id)) {
      if (!answerable(scheduleRequest, today)) continue;
      const answered = store
        .listAnswers(group.id, scheduleRequest.id)
        .some((answer) => answer.memberId === member.id);
      if (answered) continue;
      pending.push({
        groupId: group.id,
        groupName: group.name,
        requestId: scheduleRequest.id,
        name: scheduleRequest.name,
        endDate: scheduleRequest.endDate,
      });
    }
  }
  return pending.sort((a, b) => a.endDate.localeCompare(b.endDate));
}
