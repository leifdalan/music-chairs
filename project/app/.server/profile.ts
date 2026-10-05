import { googleConfig } from "./google";
import { findViewer, readAccount } from "./membership";
import { gravatarUrl } from "./gravatar";
import { findGroupByAddress } from "./group-address";
import { groupPath } from "~/lib/group-address";
import { initials } from "~/lib/profile";

/**
 * What the header's profile menu shows (plan/phase-12.md): only the viewer's
 * own data. On a group's pages, this device's member of that group (their
 * name and instrumentation there); elsewhere, the signed-in account if any.
 * Data requests (`/g/<address>/….data`) carry the same address.
 */
export async function headerProfile(request: Request) {
  const account = await readAccount(request);
  const address = /^\/g\/([^/.]+)/.exec(new URL(request.url).pathname)?.[1];
  const group = address ? findGroupByAddress(address) : null;
  const member = group ? await findViewer(request, group) : null;
  const email = member ? member.googleEmail : (account?.email ?? null);
  return {
    initials: initials(member?.displayName ?? account?.name),
    gravatar: gravatarUrl(email),
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
