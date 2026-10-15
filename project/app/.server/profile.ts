import { googleConfig } from "./google";
import { findViewer, readAccount } from "./membership";
import { visitorGroups } from "./memberships";
import { gravatarUrl } from "./gravatar";
import { findGroupByAddress } from "./group-address";
import { getStore, type Account } from "./store";
import { groupPath } from "~/lib/group-address";
import { initials } from "~/lib/profile";

/**
 * The name behind the avatar away from a group's own member (plan/phase-27.md):
 * the name the person uses in their groups, else their Google name. Signed in,
 * the account's own memberships come first, then this device's members not
 * linked to someone else's Google account, so a shared device never shows
 * another person's initials; not signed in, this device's first member.
 */
async function nameAwayFromGroup(request: Request, account: Account | null) {
  if (account) {
    const linked = getStore().listAccountMemberships(account.id)[0]?.member;
    if (linked) return linked.displayName;
  }
  const own = (await visitorGroups(request, null)).find(
    ({ member }) => !account || member.googleEmail === null || member.googleEmail === account.email,
  );
  return own?.member.displayName ?? account?.name ?? null;
}

/**
 * Whose picture the header shows (plan/phase-40.md): on a group's pages
 * (`address`), this device's member of that group; elsewhere, the signed-in
 * account. The avatar route asks the same way, so it can only fetch the
 * picture the header would show.
 */
export async function pictureOwner(request: Request, address: string | null) {
  const account = await readAccount(request);
  const group = address ? findGroupByAddress(address) : null;
  const member = group ? await findViewer(request, group) : null;
  const email = member ? member.googleEmail : (account?.email ?? null);
  return { account, group, member, email };
}

/**
 * What the header's profile menu shows (plan/phase-12.md): only the viewer's
 * own data. On a group's pages, this device's member of that group (their
 * name and instrumentation there); elsewhere, the signed-in account if any.
 * Data requests (`/g/<address>/….data`) carry the same address.
 */
export async function headerProfile(request: Request) {
  const address = /^\/g\/([^/.]+)/.exec(new URL(request.url).pathname)?.[1] ?? null;
  const { account, group, member, email } = await pictureOwner(request, address);
  return {
    initials: initials(member ? member.displayName : await nameAwayFromGroup(request, account)),
    gravatar: gravatarUrl(email, group ? address : null),
    signedIn: account ? { email: account.email } : null,
    canSignIn: !account && googleConfig() !== null,
    member:
      member && group
        ? {
            groupHref: groupPath(group),
            displayName: member.displayName,
            instrument: member.instrument,
          }
        : null,
  };
}

export type HeaderProfile = Awaited<ReturnType<typeof headerProfile>>;
