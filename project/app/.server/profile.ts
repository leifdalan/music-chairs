import { googleConfig } from "./google";
import { findViewer, readAccount } from "./membership";
import { gravatarUrl } from "./gravatar";
import { getStore } from "./store";
import { initials } from "~/lib/profile";

/**
 * What the header's profile menu shows (plan/phase-12.md): only the viewer's
 * own data. On a group's pages, this device's member of that group (their
 * name and instrumentation there); elsewhere, the signed-in account if any.
 * Data requests (`/g/<id>/….data`) carry the same group id.
 */
export async function headerProfile(request: Request) {
  const account = await readAccount(request);
  const groupId = /^\/g\/([^/.]+)/.exec(new URL(request.url).pathname)?.[1];
  const group = groupId ? getStore().findGroup(groupId) : null;
  const member = group ? await findViewer(request, group) : null;
  const email = member ? member.googleEmail : (account?.email ?? null);
  return {
    initials: initials(member?.displayName ?? account?.name),
    gravatar: gravatarUrl(email),
    signedIn: account ? { email: account.email } : null,
    canSignIn: !account && googleConfig() !== null,
    member:
      member && group
        ? { groupId: group.id, displayName: member.displayName, instrument: member.instrument }
        : null,
  };
}

export type HeaderProfile = Awaited<ReturnType<typeof headerProfile>>;
