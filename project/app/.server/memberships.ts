// The groups a visitor belongs to (plan/phase-19.2.md): those joined on this
// device and, when signed in, the Google account's, for the home page and the
// groups page.

import { readMemberships } from "./membership";
import { getStore, type Account, type Group, type Member } from "./store";

/**
 * Each group's member is found as on its pages: this device's member if its
 * token still resolves, otherwise the account's; a group with neither
 * (deleted, or the member removed) is left out. Device groups come first.
 */
export async function visitorGroups(
  request: Request,
  account: Account | null,
): Promise<{ group: Group; member: Member }[]> {
  const store = getStore();
  const devices = await readMemberships(request);
  const linked = new Map<string, Member>(
    account
      ? store.listAccountMemberships(account.id).map(({ group, member }) => [group.id, member])
      : [],
  );
  const found: { group: Group; member: Member }[] = [];
  for (const groupId of new Set([...Object.keys(devices), ...linked.keys()])) {
    const group = store.findGroup(groupId);
    if (!group) continue;
    const token = devices[groupId];
    const member =
      (token ? store.findMemberByDevice(group.id, token) : null) ?? linked.get(groupId);
    if (member) found.push({ group, member });
  }
  return found;
}
