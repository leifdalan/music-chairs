import { data, Form, redirect } from "react-router";

import { googleConfig } from "~/.server/google";
import {
  findDeviceMember,
  findViewer,
  pagePath,
  readAccount,
  rememberMembership,
  safeReturnTo,
} from "~/.server/membership";
import { redirectWithToast } from "~/.server/flash";
import { syncAccount } from "~/.server/calendar-sync";
import { findRehearsalBySlug } from "~/.server/request-address";
import { CALENDAR_ACCESS_HINT } from "~/lib/notices";
import { todayInZone } from "~/lib/availability";
import { groupPath, inviteCodeOf, invitePath } from "~/lib/group-address";
import { requestPath } from "~/lib/request-address";
import { getStore, isToken, type Group, type Member } from "~/.server/store";
import { SubmitButton } from "~/components/submit-button";
import { TextField } from "~/components/text-field";
import { DISPLAY_NAME_MAX, validateName } from "~/lib/names";
import { sameName } from "~/lib/profile";
import { answerable } from "~/lib/requests";
import { pageMeta } from "~/lib/site";
import { buttonVariants } from "~/components/ui/button";

import type { Route } from "./+types/join";
import { useActionResult, withFailures } from "~/lib/client-failure";
import { PageFailure } from "~/components/failure-alert";
import { rehearsalHref } from "~/lib/rehearsal-href";

/**
 * The group an invite link names by its code (plan/phase-30.md), whatever name
 * precedes it; a GET under another spelling than the current link redirects
 * there. An unknown link is a 404, except one shaped like the long links every
 * group had before Phase 30, which is `"changed"` (status 410).
 */
function invitedGroup(request: Request, invite: string): Group | "changed" {
  const code = inviteCodeOf(invite);
  const group = code ? getStore().findGroupByInviteCode(code) : null;
  if (!group) {
    if (isToken(invite)) return "changed";
    throw data(null, { status: 404 });
  }
  const current = invitePath(group);
  if (`/join/${invite}` !== current && (request.method === "GET" || request.method === "HEAD")) {
    const page = new URL(pagePath(new URL(request.url)), request.url);
    throw redirect(`${current}${page.search}`, {
      status: 301,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return group;
}

/**
 * Where a link copied by an organizer asked to land after joining
 * (plan/phase-30.md): a page of this group, else null. A rehearsal's link lands
 * on its card on the schedule.
 */
function landing(request: Request, group: Group, then: unknown): string | null {
  if (typeof then !== "string" || then === "") return null;
  const target = safeReturnTo(then, request);
  const base = groupPath(group);
  const { pathname } = new URL(target, request.url);
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  const [requestSlug, rehearsalSlug, ...rest] = pathname.slice(base.length + 1).split("/");
  if (requestSlug && rehearsalSlug && rest.length === 0) {
    const scheduleRequest = getStore().findRequestBySlug(group.id, requestSlug);
    // Slugs are plain ASCII, so the segment is compared as it is, never decoded.
    const rehearsal = scheduleRequest
      ? findRehearsalBySlug(group, scheduleRequest.id, rehearsalSlug)
      : null;
    if (rehearsal) return rehearsalHref(`${base}/schedule`, rehearsal);
  }
  return target;
}

/** Whether this device already joined `group` as a member that still exists. */
async function alreadyJoined(request: Request, group: Group): Promise<boolean> {
  return (await findViewer(request, group)) !== null;
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (loaderData && "changed" in loaderData) return pageMeta("Invite link changed");
  return pageMeta(loaderData ? `Join ${loaderData.groupName}` : "Not found");
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const group = invitedGroup(request, params.invite);
  if (group === "changed") return data({ changed: true as const }, { status: 410 });
  const asked = new URL(request.url).searchParams.get("then");
  const then = landing(request, group, asked);
  const viewer = await findViewer(request, group);
  if (viewer) {
    // In the group through Google but not yet on this device (a place claimed
    // at sign-in, plan/phase-30.md): remembered here and welcomed, as a claim is.
    if (!(await findDeviceMember(request, group))) {
      throw await welcomeBack(request, group, viewer, then, `Welcome, ${viewer.displayName}`);
    }
    throw redirect(then ?? groupPath(group));
  }
  const account = await readAccount(request);
  // Signed in with the Google account an organizer added from their contacts:
  // that place is theirs (plan/phase-13.md). Only a Google-verified email claims.
  const claimed = account ? getStore().claimInvitation(group.id, account.id) : null;
  if (claimed) {
    throw await welcomeBack(request, group, claimed, then, `Welcome, ${claimed.displayName}`);
  }
  // The link's own page, carried through joining and Google sign-in.
  const keep = then && asked ? asked : "";
  const here = invitePath(group) + (keep ? `?then=${encodeURIComponent(keep)}` : "");
  return {
    groupName: group.name,
    then: keep,
    account: account ? { name: account.name, email: account.email } : null,
    signInUrl:
      !account && googleConfig() !== null
        ? `/auth/google?returnTo=${encodeURIComponent(here)}`
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
  then: string | null,
  message = `Welcome back, ${member.displayName}`,
) {
  const token = getStore().deviceTokenFor(group.id, member.id);
  if (!token) throw data(null, { status: 404 });
  return redirectWithToast(then ?? firstStop(group), message, {
    headers: { "Set-Cookie": await rememberMembership(request, group.id, token) },
  });
}

/**
 * Where a member lands after joining (plan/phase-23.md): the group's open
 * request that takes times and ends soonest, else the group page.
 */
function firstStop(group: Group): string {
  const today = todayInZone(group.timeZone, new Date());
  const [next] = getStore()
    .listRequests(group.id)
    .filter((item) => answerable(item, today))
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  return next ? requestPath(groupPath(group), next.slug) : groupPath(group);
}

export async function action({ request, params }: Route.ActionArgs) {
  const group = invitedGroup(request, params.invite);
  // A join page left open across the change: the same "has changed" page.
  if (group === "changed") return data({ changed: true as const }, { status: 410 });
  const store = getStore();
  const form = await request.formData();
  const then = landing(request, group, form.get("then"));
  if (await alreadyJoined(request, group)) return redirect(then ?? groupPath(group));
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
    return welcomeBack(request, group, picked, then);
  }
  if (matches.length === 1 && !account) return welcomeBack(request, group, matches[0], then);
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
      return redirect(then ?? groupPath(group));
    }
    throw error;
  }
  // Joining with a Google account that may write: confirmed rehearsals go into
  // the calendar now rather than at the next sweep (plan/phase-32.md).
  if (account && member.calendarSync) syncAccount(account.id);
  return redirectWithToast(then ?? firstStop(group), `You joined ${group.name}`, {
    headers: { "Set-Cookie": await rememberMembership(request, group.id, member.deviceToken) },
  });
}

// In the browser a failed save stays on the page with Retry (plan/phase-34.md);
// sending these again could make something twice, so they offer Reload instead.
export async function clientAction(args: Route.ClientActionArgs) {
  return withFailures(args, { creates: ["(default)", "new", "pick"] });
}

export default function Join({ loaderData, actionData }: Route.ComponentProps) {
  // A failed save keeps the last result's errors and values (plan/phase-34.md).
  const { result: kept, failure } = useActionResult(actionData);
  // A second tap while the POST is in flight carries no membership cookie yet,
  // so it would add a second member; SubmitButton keeps the pressed button inert
  // until the next page loads.
  if ("changed" in loaderData || (kept && "changed" in kept)) {
    return (
      <main>
        <h1>This invite link has changed</h1>
        <p>Invite links are shorter now. Ask your group's organizer for the new one.</p>
      </main>
    );
  }
  const choices = kept && "choices" in kept ? kept.choices : null;
  const error = kept && "error" in kept ? kept.error : undefined;
  const then = loaderData.then ? <input type="hidden" name="then" value={loaderData.then} /> : null;
  return (
    <main>
      <PageFailure failure={failure} />
      <p className="eyebrow">You're invited to join</p>
      <h1>{loaderData.groupName}</h1>
      {loaderData.signInUrl ? (
        <p>
          <a className={buttonVariants({ variant: "outline" })} href={loaderData.signInUrl}>
            Sign in with Google
          </a>
        </p>
      ) : null}
      {loaderData.signInUrl ? <p className="hint">{CALENDAR_ACCESS_HINT}</p> : null}
      {choices ? (
        <section aria-labelledby="choices-heading">
          <h2 id="choices-heading">Which one are you?</h2>
          <p className="hint">
            {choices.length > 1
              ? `More than one member is called ${kept?.value}.`
              : `A member is already called ${kept?.value}.`}
          </p>
          <ul className="choices">
            {choices.map((choice) => (
              <li key={choice.id}>
                <Form method="post" replace>
                  <input type="hidden" name="intent" value="pick" />
                  {then}
                  <input type="hidden" name="memberId" value={choice.id} />
                  <input type="hidden" name="displayName" value={kept?.value ?? ""} />
                  <SubmitButton feedbackKey={`pick-${choice.id}`} variant="outline">
                    {choice.displayName}
                    {choice.instrument ? ` · ${choice.instrument}` : ""}
                  </SubmitButton>
                </Form>
              </li>
            ))}
            {kept && "canJoinAsNew" in kept && kept.canJoinAsNew ? (
              <li>
                <Form method="post" replace>
                  <input type="hidden" name="intent" value="new" />
                  {then}
                  <input type="hidden" name="displayName" value={kept.value} />
                  <SubmitButton feedbackKey="join-new">
                    No, I&apos;m new: join as {kept.value}
                  </SubmitButton>
                </Form>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
      <Form method="post" className="stack">
        {then}
        <TextField
          name="displayName"
          label="Your name"
          defaultValue={kept?.value ?? loaderData.account?.name}
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
