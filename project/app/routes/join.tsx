import { data, Form, redirect, useNavigation } from "react-router";

import { findViewer, readAccount, rememberMembership } from "~/.server/membership";
import { getStore, type Group } from "~/.server/store";
import { TextField } from "~/components/text-field";
import { DISPLAY_NAME_MAX, validateName } from "~/lib/names";
import { pageMeta } from "~/lib/site";

import type { Route } from "./+types/join";

/** The invited group, or a 404 for an unknown or malformed token. */
function invitedGroup(inviteToken: string): Group {
  const group = getStore().findGroupByInviteToken(inviteToken);
  if (!group) throw data(null, { status: 404 });
  return group;
}

/** Whether this device already joined `group` as a member that still exists. */
async function alreadyJoined(request: Request, group: Group): Promise<boolean> {
  return (await findViewer(request, group)) !== null;
}

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(loaderData ? `Join ${loaderData.groupName}` : "Not found");
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const group = invitedGroup(params.inviteToken);
  if (await alreadyJoined(request, group)) throw redirect(`/g/${group.id}`);
  const account = await readAccount(request);
  return {
    groupName: group.name,
    account: account ? { name: account.name, email: account.email } : null,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const group = invitedGroup(params.inviteToken);
  if (await alreadyJoined(request, group)) return redirect(`/g/${group.id}`);
  const form = await request.formData();
  const displayName = validateName(form.get("displayName"), "Your name", DISPLAY_NAME_MAX);
  if (!displayName.ok) {
    return data(
      { error: displayName.error, value: String(form.get("displayName") ?? "") },
      { status: 400 },
    );
  }
  // Joining while signed in links the new member to the Google account.
  const account = await readAccount(request);
  let member;
  try {
    member = getStore().addMember(group.id, displayName.value, "member", account?.id ?? null);
  } catch (error) {
    // A second submission from the same signed-in browser lost the race to the
    // one-member-per-group rule: that account is already in the group.
    if (account && getStore().findMemberByAccount(group.id, account.id)) {
      return redirect(`/g/${group.id}`);
    }
    throw error;
  }
  return redirect(`/g/${group.id}`, {
    headers: { "Set-Cookie": await rememberMembership(request, group.id, member.deviceToken) },
  });
}

export default function Join({ loaderData, actionData }: Route.ComponentProps) {
  // A second tap while the POST is in flight carries no membership cookie yet,
  // so it would add a second member; stay disabled until the next page loads.
  const busy = useNavigation().state !== "idle";
  return (
    <main>
      <p className="eyebrow">You're invited to join</p>
      <h1>{loaderData.groupName}</h1>
      <Form method="post" className="stack">
        <TextField
          name="displayName"
          label="Your name"
          defaultValue={actionData?.value ?? loaderData.account?.name}
          error={actionData?.error}
        />
        <p className="hint">
          {loaderData.account
            ? `You'll join with your Google account (${loaderData.account.email}); the group will see you by this name.`
            : "No account needed: the group will see you by this name."}
        </p>
        <button type="submit" disabled={busy}>
          Join group
        </button>
      </Form>
    </main>
  );
}
