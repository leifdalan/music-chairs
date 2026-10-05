import { useRef, useState } from "react";
import { data, Form, Link, redirect } from "react-router";

import { rewriteGroupEvents, scheduleRemovals } from "~/.server/calendar-sync";
import { confirmationNeeded } from "~/.server/confirm";
import { timeZoneChoices } from "~/.server/create-group";
import { redirectWithToast } from "~/.server/flash";
import { googleConfig } from "~/.server/google";
import { findViewer, forgetMembership, publicOrigin, readAccount } from "~/.server/membership";
import { groupFromAddress } from "~/.server/group-address";
import { getStore } from "~/.server/store";
import { ConfirmForm, ConfirmPanel } from "~/components/confirm-form";
import { ProblemAlert } from "~/components/problem-alert";
import { SubmitButton } from "~/components/submit-button";
import { TextField } from "~/components/text-field";
import { canonicalTimeZone, formatDate, todayInZone } from "~/lib/availability";
import { groupPath } from "~/lib/group-address";
import { deletionPrompt, LAST_ORGANIZER, leavePrompt } from "~/lib/group-prompts";
import { DISPLAY_NAME_MAX, GROUP_NAME_MAX, validateName } from "~/lib/names";
import { pageMeta } from "~/lib/site";
import { buttonVariants } from "~/components/ui/button";

import type { Route } from "./+types/group";

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(loaderData ? loaderData.groupName : "Not found");
}

/** The sentence for a `notice` left by Google sign-in, if any. */
async function signInNotice(request: Request, groupId: string, viewerName: string | undefined) {
  const notice = new URL(request.url).searchParams.get("notice");
  if (notice === "linked") return "Linked to your Google account.";
  if (notice !== "account-taken") return null;
  const account = await readAccount(request);
  const taken = account ? getStore().findMemberByAccount(groupId, account.id) : null;
  return taken
    ? `This Google account is already ${taken.displayName} in this group, so ${viewerName ?? "this device's member"} stays name-only.`
    : null;
}

// Device tokens identify a device's membership (see `.server/membership.ts`)
// and never leave the server. Organizers also get member ids, optional tags and
// linked Google emails for their controls; members and visitors get names,
// roles and whether each member signs in with Google. A member sees their own
// email only. Requests go to members only: each with whether the viewer has
// answered, and for organizers how many have.
export async function loader({ request, params }: Route.LoaderArgs) {
  const store = getStore();
  const group = groupFromAddress(request, params.groupAddress);
  const viewer = await findViewer(request, group);
  const account = await readAccount(request);
  const isOrganizer = viewer?.role === "organizer";
  const today = todayInZone(group.timeZone, new Date());
  const allMembers = store.listMembers(group.id);
  const memberCount = allMembers.length;
  const organizerCount = allMembers.filter((member) => member.role === "organizer").length;
  const requests = viewer
    ? store
        .listRequests(group.id)
        .filter((item) => isOrganizer || (item.open && item.endDate >= today))
        .map((item) => ({
          id: item.id,
          name: item.name,
          startDate: item.startDate,
          endDate: item.endDate,
          current: item.open && item.endDate >= today,
          answered: store
            .listAnswers(group.id, item.id)
            .some((answer) => answer.memberId === viewer.id),
          answerCount: isOrganizer ? item.answerCount : null,
        }))
    : null;
  return {
    requests,
    memberCount: isOrganizer ? memberCount : null,
    groupHref: groupPath(group),
    groupName: group.name,
    timeZone: group.timeZone,
    members: allMembers.map((member) => ({
      displayName: member.displayName,
      instrument: member.instrument,
      role: member.role,
      isViewer: member.id === viewer?.id,
      google: member.googleEmail !== null,
      manage: isOrganizer
        ? {
            id: member.id,
            optional: member.optional,
            email: member.googleEmail,
            invitedEmail: member.invitedEmail,
            // The group's only organizer can be neither removed nor demoted.
            lastOrganizer: member.role === "organizer" && organizerCount <= 1,
          }
        : null,
    })),
    settings: isOrganizer ? { timeZones: zoneChoices(group.timeZone) } : null,
    viewer: viewer
      ? { displayName: viewer.displayName, role: viewer.role, email: viewer.googleEmail }
      : null,
    // Offer sign-in to a name-only member unless this browser's account is
    // already someone else here (signing in again could only be refused).
    signInAvailable:
      googleConfig() !== null &&
      !(viewer && account && store.findMemberByAccount(group.id, account.id)),
    notice: await signInNotice(request, group.id, viewer?.displayName),
    showNames: isOrganizer ? group.showNames : null,
    inviteUrl: isOrganizer
      ? new URL(`/join/${group.inviteToken}`, publicOrigin() ?? request.url).href
      : null,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const store = getStore();
  const group = groupFromAddress(request, params.groupAddress);
  const viewer = await findViewer(request, group);
  if (!viewer) throw redirect(groupPath(group));
  const form = await request.formData();
  const intent = form.get("intent");
  // The groups page (plan/phase-19.2.md) gets its forms' results back there;
  // only that exact page, never a path taken from the form.
  const toGroups = form.get("returnTo") === "/groups";
  // Any member may leave: refuse the last organizer, confirm, then act.
  if (intent === "leave") {
    if (viewer.role === "organizer" && organizerCount(group.id) <= 1) {
      return problem(LAST_ORGANIZER);
    }
    const prompt = confirmationNeeded(form, leavePrompt(group.name));
    if (prompt) return prompt;
    const result = store.removeMember(group.id, viewer.id);
    if (result === "unknown") throw data(null, { status: 404 });
    if (result === "last-organizer") return problem(LAST_ORGANIZER);
    scheduleRemovals();
    return redirectWithToast("/groups", `You left ${group.name}`, {
      headers: { "Set-Cookie": await forgetMembership(request, group.id) },
    });
  }
  if (viewer.role !== "organizer") throw data(null, { status: 403 });
  const memberId = String(form.get("memberId") ?? "");
  const on = form.get("value") === "on";
  const back = (message: string) => redirectWithToast(groupPath(group), message);
  if (intent === "set-privacy") {
    store.setShowNames(group.id, on);
    return back(on ? "Members now see who is free" : "Members now see counts only");
  }
  if (intent === "set-optional") {
    if (!store.setOptional(group.id, memberId, on)) throw data(null, { status: 404 });
    return back(on ? "Marked optional" : "Marked required");
  }
  // Destructive intents: authorize (above), validate, find the target, then
  // ask for confirmation, then act (plan/phase-11.md).
  if (intent === "set-role") {
    const member = store.findMember(group.id, memberId);
    if (!member) throw data(null, { status: 404 });
    if (!on && member.role === "organizer" && organizerCount(group.id) <= 1) {
      return problem(LAST_ORGANIZER);
    }
    const prompt = confirmationNeeded(form, roleChangePrompt(member.displayName, on));
    if (prompt) return prompt;
    const result = store.setRole(group.id, memberId, on ? "organizer" : "member");
    if (result === "unknown") throw data(null, { status: 404 });
    if (result === "last-organizer") return problem(LAST_ORGANIZER);
    return back(on ? "Made an organizer" : "Organizer removed");
  }
  if (intent === "update-group") {
    const name = validateName(form.get("name"), "Group name", GROUP_NAME_MAX);
    const timeZone = canonicalTimeZone(form.get("timeZone"));
    if (!name.ok || !timeZone) {
      return data(
        {
          settingsErrors: {
            name: name.ok ? undefined : name.error,
            timeZone: timeZone ? undefined : "Choose the group's time zone.",
          },
          settingsValues: {
            name: String(form.get("name") ?? ""),
            timeZone: String(form.get("timeZone") ?? ""),
          },
        },
        { status: 400 },
      );
    }
    store.updateGroup(group.id, { name: name.value, timeZone });
    // Events already in members' Google Calendars carry the name and the instants.
    if (name.value !== group.name || timeZone !== group.timeZone) rewriteGroupEvents(group.id);
    if (toGroups) return redirectWithToast("/groups", "Group updated");
    // Back to the address under the new name, not the one this request came to.
    return redirectWithToast(groupPath({ ...group, name: name.value }), "Group updated");
  }
  if (intent === "rename-member") {
    const member = store.findMember(group.id, memberId);
    if (!member) throw data(null, { status: 404 });
    const name = validateName(form.get("displayName"), "Name", DISPLAY_NAME_MAX);
    if (!name.ok) return problem(name.error);
    store.renameMember(group.id, memberId, name.value);
    return back("Name changed");
  }
  if (intent === "remove-member") {
    const member = store.findMember(group.id, memberId);
    if (!member) throw data(null, { status: 404 });
    if (member.role === "organizer" && organizerCount(group.id) <= 1) {
      return problem(LAST_ORGANIZER);
    }
    const prompt = confirmationNeeded(form, removalPrompt(member.displayName));
    if (prompt) return prompt;
    const result = store.removeMember(group.id, memberId);
    if (result === "unknown") throw data(null, { status: 404 });
    if (result === "last-organizer") return problem(LAST_ORGANIZER);
    scheduleRemovals();
    return back(member.id === viewer.id ? "You left the group" : `${member.displayName} removed`);
  }
  if (intent === "delete-group") {
    const prompt = confirmationNeeded(form, deletionPrompt(group.name));
    if (prompt) return prompt;
    store.deleteGroup(group.id);
    scheduleRemovals();
    return redirectWithToast(toGroups ? "/groups" : "/", `Group ${group.name} deleted`);
  }
  return problem("Something went wrong with that request.");
}

/**
 * The zones the settings offer, always including the group's own: a zone the
 * runtime accepts but does not list (an alias the browser reported) would
 * otherwise leave the menu on its first entry, and saving would move the group.
 */
function zoneChoices(current: string): string[] {
  const zones = timeZoneChoices();
  return zones.includes(current) ? zones : [current, ...zones];
}

function problem(message: string) {
  return data({ problem: message }, { status: 400 });
}

function organizerCount(groupId: string): number {
  return getStore()
    .listMembers(groupId)
    .filter((member) => member.role === "organizer").length;
}

// The "are you sure" texts, shared by the dialog and the server's confirm page.
function roleChangePrompt(name: string, makeOrganizer: boolean) {
  return makeOrganizer
    ? {
        title: `Make ${name} an organizer?`,
        body: "Organizers can change the group, its members and its rehearsals, and can remove anyone, including you.",
        label: "Make organizer",
      }
    : {
        title: `Remove ${name} as an organizer?`,
        body: "They will no longer be able to change the group, its members or its rehearsals.",
        label: "Remove organizer",
      };
}

function removalPrompt(name: string) {
  return {
    title: `Remove ${name}?`,
    body: "Their availability, request answers and rehearsal answers are deleted, and rehearsal events this app added to their Google Calendar are removed. They can join again with the invite link.",
    label: "Remove member",
  };
}

export default function GroupPage({ loaderData, actionData }: Route.ComponentProps) {
  const {
    groupName,
    timeZone,
    members,
    viewer,
    showNames,
    inviteUrl,
    signInAvailable,
    notice,
    requests,
    memberCount,
    settings,
  } = loaderData;
  const confirmPrompt = actionData && "confirm" in actionData ? actionData.confirm : null;
  const settingsResult = actionData && "settingsErrors" in actionData ? actionData : null;
  return (
    <main>
      <h1>{groupName}</h1>
      <p className="hint">Times in {timeZone}</p>
      {viewer ? (
        <>
          <p className="hint">
            You are <strong>{viewer.displayName}</strong> ({viewer.role}).
            {viewer.email ? (
              <>
                {" "}
                Linked to Google as <strong>{viewer.email}</strong>.
              </>
            ) : null}
          </p>
          {!viewer.email && signInAvailable ? (
            <p className="hint">
              <a
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={`/auth/google?returnTo=${encodeURIComponent(loaderData.groupHref)}`}
              >
                Sign in with Google
              </a>{" "}
              to open this group on your other devices.
            </p>
          ) : null}
          <p className="group-links">
            <Link to="schedule" relative="path" className={buttonVariants()}>
              Schedule
            </Link>
            <Link
              to="availability"
              relative="path"
              className={buttonVariants({ variant: "outline" })}
            >
              My availability
            </Link>
          </p>
        </>
      ) : (
        <p className="notice">
          You haven't joined this group on this device. Ask an organizer for the invite link.
        </p>
      )}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {actionData && "problem" in actionData ? (
        <ProblemAlert message={actionData.problem} response={actionData} />
      ) : null}
      {confirmPrompt ? <ConfirmPanel prompt={confirmPrompt} /> : null}
      {requests ? <RequestsSection requests={requests} memberCount={memberCount} /> : null}
      {inviteUrl ? <InvitePanel inviteUrl={inviteUrl} groupName={groupName} /> : null}
      {showNames !== null ? (
        <section className="invite" aria-labelledby="privacy-heading">
          <h2 id="privacy-heading">What members see</h2>
          <p className="hint">
            {showNames
              ? "Members see who is free at each time."
              : "Members see only how many people are free at each time."}
          </p>
          <Toggle intent="set-privacy" setTo={!showNames}>
            {showNames ? "Show only counts" : "Show names to members"}
          </Toggle>
        </section>
      ) : null}
      <section aria-labelledby="members-heading">
        <h2 id="members-heading">Members ({members.length})</h2>
        {settings ? (
          <p>
            <Link
              to="members/add"
              relative="path"
              className={buttonVariants({ variant: "outline" })}
            >
              Add members
            </Link>
          </p>
        ) : null}
        <ul className="members">
          {members.map((member, index) => (
            // Organizers' rows hold forms; keying them by member keeps each with its member.
            <li key={member.manage?.id ?? index}>
              <span className="member-name">
                {member.displayName}
                {member.instrument ? (
                  <span className="member-instrument"> · {member.instrument}</span>
                ) : null}
                {member.isViewer ? " (you)" : ""}
                {member.google ? (
                  <span className="google-mark" title="Signs in with Google">
                    {" "}
                    · Google
                  </span>
                ) : null}
                {member.manage?.email ? (
                  <span className="member-email"> {member.manage.email}</span>
                ) : null}
                {member.manage?.invitedEmail ? (
                  <span className="member-email"> invited as {member.manage.invitedEmail}</span>
                ) : null}
              </span>
              <span className={`role role-${member.role}`}>
                {member.role}
                {member.manage?.optional ? ", optional" : ""}
              </span>
              {member.manage ? (
                <div className="member-controls">
                  <Toggle
                    intent="set-optional"
                    memberId={member.manage.id}
                    setTo={!member.manage.optional}
                    label={`${member.manage.optional ? "Make required" : "Make optional"}: ${member.displayName}`}
                  >
                    {member.manage.optional ? "Make required" : "Make optional"}
                  </Toggle>
                  {member.manage.lastOrganizer ? (
                    <p className="hint">The group needs at least one organizer.</p>
                  ) : (
                    <>
                      <ConfirmForm
                        fields={{
                          intent: "set-role",
                          memberId: member.manage.id,
                          value: member.role === "organizer" ? "off" : "on",
                        }}
                        trigger={
                          member.role === "organizer" ? "Remove organizer" : "Make organizer"
                        }
                        triggerLabel={`${member.role === "organizer" ? "Remove organizer" : "Make organizer"}: ${member.displayName}`}
                        triggerSize="sm"
                        {...roleChangePrompt(member.displayName, member.role !== "organizer")}
                        feedbackKey={`set-role-${member.manage.id}`}
                      />
                      <ConfirmForm
                        fields={{ intent: "remove-member", memberId: member.manage.id }}
                        trigger="Remove"
                        triggerLabel={`Remove ${member.displayName}`}
                        triggerVariant="destructive"
                        triggerSize="sm"
                        {...removalPrompt(member.displayName)}
                        feedbackKey={`remove-${member.manage.id}`}
                      />
                    </>
                  )}
                  <Form method="post" replace className="rename-form">
                    <input type="hidden" name="intent" value="rename-member" />
                    <input type="hidden" name="memberId" value={member.manage.id} />
                    <input
                      type="text"
                      name="displayName"
                      required
                      autoComplete="off"
                      defaultValue={member.displayName}
                      aria-label={`New name for ${member.displayName}`}
                    />
                    <SubmitButton
                      feedbackKey={`rename-${member.manage.id}`}
                      variant="outline"
                      size="sm"
                      label={`Rename ${member.displayName}`}
                    >
                      Rename
                    </SubmitButton>
                  </Form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {settings ? (
        <GroupSettings
          groupName={groupName}
          timeZone={timeZone}
          timeZones={settings.timeZones}
          result={settingsResult}
        />
      ) : null}
    </main>
  );
}

/** Organizers: the group's name and time zone, and deleting the group. */
function GroupSettings({
  groupName,
  timeZone,
  timeZones,
  result,
}: {
  groupName: string;
  timeZone: string;
  timeZones: string[];
  result: {
    settingsErrors: { name?: string; timeZone?: string };
    settingsValues: { name: string; timeZone: string };
  } | null;
}) {
  const values = result?.settingsValues ?? { name: groupName, timeZone };
  const errors = result?.settingsErrors ?? {};
  return (
    <section className="invite group-settings" aria-labelledby="settings-heading">
      <h2 id="settings-heading">Group settings</h2>
      <Form method="post" replace className="stack">
        <input type="hidden" name="intent" value="update-group" />
        <TextField name="name" label="Group name" defaultValue={values.name} error={errors.name} />
        <div className="field">
          <label htmlFor="timeZone">Time zone</label>
          <select
            id="timeZone"
            name="timeZone"
            defaultValue={values.timeZone}
            aria-invalid={errors.timeZone ? true : undefined}
            aria-describedby={errors.timeZone ? "timeZone-error" : "timeZone-hint"}
          >
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <p className="hint" id="timeZone-hint">
            Every date and time keeps its clock time in the new zone.
          </p>
          {errors.timeZone ? (
            <p className="field-error" id="timeZone-error" role="alert">
              {errors.timeZone}
            </p>
          ) : null}
        </div>
        <SubmitButton feedbackKey="update-group">Save group settings</SubmitButton>
      </Form>
      <ConfirmForm
        fields={{ intent: "delete-group" }}
        trigger="Delete group"
        triggerVariant="destructive"
        {...deletionPrompt(groupName)}
        feedbackKey="delete-group"
      />
    </section>
  );
}

type RequestItem = NonNullable<Route.ComponentProps["loaderData"]["requests"]>[number];

/** Open requests for everyone in the group; organizers also start, count and repeat them. */
function RequestsSection({
  requests,
  memberCount,
}: {
  requests: RequestItem[];
  /** Organizers only. */
  memberCount: number | null;
}) {
  const organizer = memberCount !== null;
  const current = requests.filter((item) => item.current);
  const past = requests.filter((item) => !item.current);
  const span = (item: RequestItem) =>
    `${formatDate(item.startDate)} to ${formatDate(item.endDate)}`;
  return (
    <section aria-labelledby="requests-heading">
      <h2 id="requests-heading">Requests</h2>
      {current.length === 0 ? (
        <p className="hint">
          {organizer
            ? "Ask the band when they can rehearse between two dates."
            : "No open requests from your organizers."}
        </p>
      ) : (
        <ul className="requests">
          {current.map((item) => (
            <li key={item.id}>
              <Link to={`requests/${item.id}`} relative="path" className="request-name">
                {item.name}
              </Link>
              <span className="hint"> {span(item)}</span>
              <span className={item.answered ? "request-answered" : "request-unanswered"}>
                {item.answered ? "Answered" : "Not answered yet"}
              </span>
              {item.answerCount !== null ? (
                <span className="hint">
                  {item.answerCount} of {memberCount} answered
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {organizer ? (
        <>
          <p>
            <Link
              to="requests/new"
              relative="path"
              className={buttonVariants({ variant: "outline" })}
            >
              New request
            </Link>
          </p>
          {past.length > 0 ? (
            <details>
              <summary>Past and closed requests ({past.length})</summary>
              <ul className="requests">
                {past.map((item) => (
                  <li key={item.id}>
                    <Link to={`requests/${item.id}`} relative="path" className="request-name">
                      {item.name}
                    </Link>
                    <span className="hint"> {span(item)}</span>
                    <Link
                      to={`requests/new?repeat=${item.id}`}
                      relative="path"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      aria-label={`Repeat request: ${item.name}`}
                    >
                      Repeat
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/** A one-button form that sets an organizer setting on or off (`setTo`). */
function Toggle({
  intent,
  memberId,
  setTo,
  label,
  children,
}: {
  intent: string;
  memberId?: string;
  setTo: boolean;
  /** Accessible name when the visible text alone doesn't say who it affects. */
  label?: string;
  children: string;
}) {
  return (
    <Form method="post" replace>
      <input type="hidden" name="intent" value={intent} />
      {memberId ? <input type="hidden" name="memberId" value={memberId} /> : null}
      <input type="hidden" name="value" value={setTo ? "on" : "off"} />
      <SubmitButton
        feedbackKey={`${intent}-${memberId ?? "group"}`}
        variant="outline"
        size="sm"
        label={label}
      >
        {children}
      </SubmitButton>
    </Form>
  );
}

/** A new email with the invite link (RFC 6068: every part percent-encoded, CRLF line breaks). */
export function inviteMailto(groupName: string, inviteUrl: string): string {
  const subject = `Join ${groupName} on music-chairs`;
  const body = [
    `You're invited to ${groupName} on music-chairs, where we find times to rehearse.`,
    "",
    `Join here: ${inviteUrl}`,
  ].join("\r\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function InvitePanel({ inviteUrl, groupName }: { inviteUrl: string; groupName: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      // The Clipboard API exists only in secure contexts; over plain HTTP
      // (a phone on the local network) this throws and the fallback runs.
      await navigator.clipboard.writeText(inviteUrl);
      setStatus("Link copied.");
    } catch {
      input.current?.focus();
      // iOS Safari ignores select() on read-only inputs; a range works there.
      input.current?.setSelectionRange(0, inviteUrl.length);
      setStatus("Couldn't copy automatically. Press and hold the link above to copy it.");
    }
  }
  return (
    <section className="invite" aria-labelledby="invite-heading">
      <h2 id="invite-heading">Invite link</h2>
      <p className="hint">Share this link with your band. Anyone with it can join by name.</p>
      <input
        ref={input}
        aria-label="Invite link"
        type="text"
        readOnly
        value={inviteUrl}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button type="button" className={buttonVariants()} onClick={copy}>
        Copy link
      </button>
      <a
        className={buttonVariants({ variant: "outline" })}
        href={inviteMailto(groupName, inviteUrl)}
      >
        Send link by email
      </a>
      <p className="hint" role="status">
        {status}
      </p>
    </section>
  );
}
