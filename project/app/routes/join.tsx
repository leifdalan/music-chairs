import { data, Form, redirect } from "react-router";

import { googleConfig } from "~/.server/google";
import { findViewer, readAccount, rememberMembership } from "~/.server/membership";
import { redirectWithToast } from "~/.server/flash";
import { groupPath } from "~/lib/group-address";
import { getStore, type Group, type Member } from "~/.server/store";
import { SubmitButton } from "~/components/submit-button";
import { TextField } from "~/components/text-field";
import { DISPLAY_NAME_MAX, validateName } from "~/lib/names";
import { sameName } from "~/lib/profile";
import { pageMeta } from "~/lib/site";
import { buttonVariants } from "~/components/ui/button";

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
  if (await alreadyJoined(request, group)) throw redirect(groupPath(group));
  const account = await readAccount(request);
  // Signed in with the Google account an organizer added from their contacts:
  // that place is theirs (plan/phase-13.md). Only a Google-verified email claims.
  const claimed = account ? getStore().claimInvitation(group.id, account.id) : null;
  if (claimed) throw await welcomeBack(request, group, claimed, `Welcome, ${claimed.displayName}`);
  return {
    groupName: group.name,
    account: account ? { name: account.name, email: account.email } : null,
    signInUrl:
      !account && googleConfig() !== null
        ? `/auth/google?returnTo=${encodeURIComponent(`/join/${params.inviteToken}`)}`
        : null,
  };
}

/**
 * Remembers an existing member on this device (returning by name,
 * plan/phase-12.md). The member stays as they are: a signed-in visitor is
 * never linked to them here, since a typed name proves nothing about the
 * account (linking happens through sign-in on a device that holds the membership).
 */
async function welcomeBack(
  request: Request,
  group: Group,
  member: Member,
  message = `Welcome back, ${member.displayName}`,
) {
  const token = getStore().deviceTokenFor(group.id, member.id);
  if (!token) throw data(null, { status: 404 });
  return redirectWithToast(groupPath(group), message, {
    headers: { "Set-Cookie": await rememberMembership(request, group.id, token) },
  });
}

export async function action({ request, params }: Route.ActionArgs) {
  const group = invitedGroup(params.inviteToken);
  if (await alreadyJoined(request, group)) return redirect(groupPath(group));
  const store = getStore();
  const form = await request.formData();
  const displayName = validateName(form.get("displayName"), "Your name", DISPLAY_NAME_MAX);
  if (!displayName.ok) {
    return data(
      { error: displayName.error, value: String(form.get("displayName") ?? "") },
      { status: 400 },
    );
  }
  const account = await readAccount(request);
  const intent = form.get("intent");
  // A signed-in joiner brings their own identity: they may be returning, or a
  // new person who shares a name (their Google name is pre-filled), so they
  // choose; "new" joins them as a new member linked to their account.
  const matches =
    intent === "new" && account ? [] : store.nameOnlyMatches(group.id, displayName.value);

  // A pick from several members of that name: re-checked against the typed name.
  if (intent === "pick") {
    const picked = matches.find((member) => member.id === form.get("memberId"));
    if (!picked) {
      return data(
        {
          error: "That member isn't one of the matches any more. Type your name again.",
          value: displayName.value,
        },
        { status: 400 },
      );
    }
    return welcomeBack(request, group, picked);
  }
  if (matches.length === 1 && !account) return welcomeBack(request, group, matches[0]);
  if (matches.length > 0) {
    return {
      value: displayName.value,
      canJoinAsNew: account !== null,
      choices: matches.map((member) => ({
        id: member.id,
        displayName: member.displayName,
        instrument: member.instrument,
      })),
    };
  }

  // The name belongs to someone who must prove more than a name. A signed-in
  // joiner is not claiming them, and joins as a new member under their account.
  const taken = account
    ? null
    : store.listMembers(group.id).find((member) => sameName(member.displayName, displayName.value));
  if (taken) {
    const error =
      taken.role === "organizer"
        ? `${taken.displayName} is an organizer. Organizers get back in with Google, or from a device they used before.`
        : taken.invitedEmail !== null
          ? `${taken.displayName} was added with an email address: sign in with Google using that address, or ask an organizer.`
          : `${taken.displayName} signs in with Google. Sign in with Google to get back in, or join with a different name.`;
    return data({ error, value: displayName.value }, { status: 400 });
  }

  // Joining while signed in links the new member to the Google account.
  let member;
  try {
    member = store.addMember(group.id, displayName.value, "member", account?.id ?? null);
  } catch (error) {
    // A second submission from the same signed-in browser lost the race to the
    // one-member-per-group rule: that account is already in the group.
    if (account && store.findMemberByAccount(group.id, account.id)) {
      return redirect(groupPath(group));
    }
    throw error;
  }
  return redirectWithToast(groupPath(group), `You joined ${group.name}`, {
    headers: { "Set-Cookie": await rememberMembership(request, group.id, member.deviceToken) },
  });
}

export default function Join({ loaderData, actionData }: Route.ComponentProps) {
  // A second tap while the POST is in flight carries no membership cookie yet,
  // so it would add a second member; SubmitButton keeps the pressed button inert
  // until the next page loads.
  const choices = actionData && "choices" in actionData ? actionData.choices : null;
  const error = actionData && "error" in actionData ? actionData.error : undefined;
  return (
    <main>
      <p className="eyebrow">You're invited to join</p>
      <h1>{loaderData.groupName}</h1>
      {loaderData.signInUrl ? (
        <p>
          <a className={buttonVariants({ variant: "outline" })} href={loaderData.signInUrl}>
            Sign in with Google
          </a>
        </p>
      ) : null}
      {choices ? (
        <section aria-labelledby="choices-heading">
          <h2 id="choices-heading">Which one are you?</h2>
          <p className="hint">
            {choices.length > 1
              ? `More than one member is called ${actionData?.value}.`
              : `A member is already called ${actionData?.value}.`}
          </p>
          <ul className="choices">
            {choices.map((choice) => (
              <li key={choice.id}>
                <Form method="post" replace>
                  <input type="hidden" name="intent" value="pick" />
                  <input type="hidden" name="memberId" value={choice.id} />
                  <input type="hidden" name="displayName" value={actionData?.value ?? ""} />
                  <SubmitButton feedbackKey={`pick-${choice.id}`} variant="outline">
                    {choice.displayName}
                    {choice.instrument ? ` · ${choice.instrument}` : ""}
                  </SubmitButton>
                </Form>
              </li>
            ))}
            {actionData && "canJoinAsNew" in actionData && actionData.canJoinAsNew ? (
              <li>
                <Form method="post" replace>
                  <input type="hidden" name="intent" value="new" />
                  <input type="hidden" name="displayName" value={actionData.value} />
                  <SubmitButton feedbackKey="join-new">
                    No, I&apos;m new: join as {actionData.value}
                  </SubmitButton>
                </Form>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
      <Form method="post" className="stack">
        <TextField
          name="displayName"
          label="Your name"
          defaultValue={actionData?.value ?? loaderData.account?.name}
          error={error}
        />
        <p className="hint">
          {loaderData.account
            ? `You'll join with your Google account (${loaderData.account.email}); the group will see you by this name.`
            : "No account needed: the group will see you by this name."}{" "}
          Joined before on another device? Type the same name to get back in.
        </p>
        <SubmitButton feedbackKey="join">Join group</SubmitButton>
      </Form>
    </main>
  );
}
